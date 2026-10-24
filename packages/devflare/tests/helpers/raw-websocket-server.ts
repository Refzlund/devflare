/*
	────────────────────────────────────────
	   A WebSocket server with wire control
	────────────────────────────────────────
	A stand-in for a peer whose exact Close behaviour matters — Chrome's DevTools
	socket, in the browser-binding tests. It speaks just enough RFC 6455 to be
	upgraded to by workerd's `fetch`, and lets a test end the connection in the
	precise shapes a real peer can: a Close frame with NO status code, or TCP
	gone with no Close frame at all.

	→ GOTCHA: not the `ws` package. Under Bun, `import … from 'ws'` resolves to
	  Bun's own reimplementation, whose `close()` with no arguments sends 1000 —
	  so a "close without a status" built on it is not one, and a test of the
	  relay's 1005 path silently tests its 1000 path instead. That happened.
*/

import { createHash } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'

/** RFC 6455 §1.3: what the server hashes the client's key with. */
const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** The code the WebSocket API reports for a Close frame that carried no status. */
const NO_STATUS_RECEIVED = 1005

/** The code the WebSocket API reports for a connection lost without a Close frame. */
const ABNORMAL_CLOSURE = 1006

/** One upgraded connection, seen from the server's side. */
export interface RawWebSocketPeer {
	/** The path the client upgraded on, e.g. `/devtools/browser/x`. */
	readonly path: string
	/**
	 * @description Send one text frame.
	 * @returns once the frame is handed to the OS, so a drop that follows
	 * cannot overtake it
	 */
	sendText(text: string): Promise<void>
	/** Send a Close frame carrying no status code, then end the connection. */
	closeWithoutStatus(): void
	/** End the connection with no Close frame — what a crash or a kill looks like. */
	drop(): void
	/** Called for each text frame the client sends. */
	onText(handler: (text: string) => void): void
	/**
	 * Called once when the CLIENT closes: with its status code, 1005 for a
	 * Close frame without one, or 1006 for a connection lost without a frame.
	 * Never called for a close this side started.
	 */
	onClose(handler: (code: number) => void): void
}

/** A listening raw WebSocket server. */
export interface RawWebSocketServer {
	/** `ws://127.0.0.1:<port>` */
	readonly url: string
	/** Stop listening and destroy every open connection. */
	close(): Promise<void>
}

/**
 * @description Listen on a free loopback port and hand each upgraded
 * connection to `onPeer`.
 * @param onPeer - receives every connection once its handshake completes
 */
export async function startRawWebSocketServer(
	onPeer: (peer: RawWebSocketPeer) => void
): Promise<RawWebSocketServer> {
	const sockets = new Set<Socket>()
	const server: Server = createServer((socket) => {
		sockets.add(socket)
		socket.on('close', () => sockets.delete(socket))
		acceptUpgrade(socket, onPeer)
	})

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	if (!address || typeof address === 'string') throw new Error('raw websocket server has no port')

	return {
		url: `ws://127.0.0.1:${address.port}`,
		close: () =>
			new Promise<void>((resolve) => {
				for (const socket of sockets) socket.destroy()
				server.close(() => resolve())
			})
	}
}

/** Complete the opening handshake on `socket`, then run the frame loop. */
function acceptUpgrade(socket: Socket, onPeer: (peer: RawWebSocketPeer) => void): void {
	let head = Buffer.alloc(0)

	const onHandshakeData = (chunk: Buffer) => {
		head = Buffer.concat([head, chunk])
		const end = head.indexOf('\r\n\r\n')
		if (end === -1) return

		socket.off('data', onHandshakeData)
		const request = head.subarray(0, end).toString('latin1')
		const path = request.split(' ')[1] ?? '/'
		const key = /^sec-websocket-key:\s*(.+)$/im.exec(request)?.[1]?.trim()
		if (!key) {
			socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
			return
		}

		const accept = createHash('sha1')
			.update(key + HANDSHAKE_GUID)
			.digest('base64')
		socket.write(
			'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
				`Sec-WebSocket-Accept: ${accept}\r\n\r\n`
		)

		const peer = createPeer(socket, path)
		onPeer(peer.api)
		peer.receive(head.subarray(end + 4))
		socket.on('data', (data: Buffer) => peer.receive(data))
	}

	socket.on('data', onHandshakeData)
}

/** The frame codec for one connection, and the API a test drives it through. */
function createPeer(socket: Socket, path: string) {
	let buffered = Buffer.alloc(0)
	let closeReported = false
	// A close this side started is not the client closing; its echo and the
	// socket teardown that follow must not be reported as one.
	let endedHere = false
	const textHandlers: ((text: string) => void)[] = []
	const closeHandlers: ((code: number) => void)[] = []

	function reportClose(code: number): void {
		if (closeReported || endedHere) return
		closeReported = true
		for (const handler of closeHandlers) handler(code)
	}

	socket.on('close', () => reportClose(ABNORMAL_CLOSURE))
	socket.on('error', () => reportClose(ABNORMAL_CLOSURE))

	/** Act on every complete client frame buffered so far. */
	function receive(data: Buffer): void {
		buffered = Buffer.concat([buffered, data])

		for (let next = readFrame(buffered); next; next = readFrame(buffered)) {
			buffered = buffered.subarray(next.size)
			if (!handleFrame(next)) return
		}
	}

	/** Act on one client frame. Returns `false` once the connection is closing. */
	function handleFrame({ opcode, payload }: DecodedFrame): boolean {
		if (opcode === 0x1) {
			for (const handler of textHandlers) handler(payload.toString('utf8'))
		}
		if (opcode === 0x9) socket.write(frame(0xa, payload))
		if (opcode !== 0x8) return true

		reportClose(payload.length >= 2 ? payload.readUInt16BE(0) : NO_STATUS_RECEIVED)
		// Echo the Close and finish, as RFC 6455 §5.5.1 asks of the receiver.
		socket.end(Buffer.from([0x88, 0x00]))
		return false
	}

	const api: RawWebSocketPeer = {
		path,
		sendText: (text) =>
			new Promise<void>((resolve, reject) => {
				socket.write(frame(0x1, Buffer.from(text, 'utf8')), (error) =>
					error ? reject(error) : resolve()
				)
			}),
		closeWithoutStatus() {
			endedHere = true
			socket.end(Buffer.from([0x88, 0x00]))
		},
		drop() {
			endedHere = true
			socket.destroy()
		},
		onText(handler) {
			textHandlers.push(handler)
		},
		onClose(handler) {
			closeHandlers.push(handler)
		}
	}

	return { api, receive }
}

/** One decoded frame, and how many bytes of the buffer it took. */
interface DecodedFrame {
	opcode: number
	/** Unmasked. */
	payload: Buffer
	size: number
}

/**
 * @description Decode the frame at the start of `buffer`, unmasking a
 * client's payload.
 * @returns the frame, or `null` when the buffer does not hold a whole one yet
 */
function readFrame(buffer: Buffer): DecodedFrame | null {
	if (buffer.length < 2) return null

	const lengthField = buffer[1] & 0x7f
	const lengthBytes = lengthField === 126 ? 2 : lengthField === 127 ? 8 : 0
	const maskOffset = 2 + lengthBytes
	if (buffer.length < maskOffset) return null

	const length =
		lengthBytes === 2
			? buffer.readUInt16BE(2)
			: lengthBytes === 8
				? Number(buffer.readBigUInt64BE(2))
				: lengthField
	const masked = (buffer[1] & 0x80) !== 0
	const payloadStart = maskOffset + (masked ? 4 : 0)
	if (buffer.length < payloadStart + length) return null

	const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length))
	if (masked) {
		const mask = buffer.subarray(maskOffset, payloadStart)
		for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
	}

	return { opcode: buffer[0] & 0x0f, payload, size: payloadStart + length }
}

/** Encode one unmasked server frame. */
function frame(opcode: number, payload: Buffer): Buffer {
	const length = payload.length
	const header =
		length < 126
			? Buffer.from([0x80 | opcode, length])
			: length < 65536
				? Buffer.from([0x80 | opcode, 126, length >> 8, length & 0xff])
				: Buffer.concat([Buffer.from([0x80 | opcode, 127]), bigEndian64(length)])
	return Buffer.concat([header, payload])
}

/** An unsigned 64-bit big-endian length. */
function bigEndian64(value: number): Buffer {
	const bytes = Buffer.alloc(8)
	bytes.writeBigUInt64BE(BigInt(value))
	return bytes
}
