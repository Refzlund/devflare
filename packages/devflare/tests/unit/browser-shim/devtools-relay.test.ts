import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { type RelaySocket, relayDevtools } from '../../../src/browser-shim/devtools-relay'
import { isWireValidCloseCode } from '../../helpers/workerd-websocket-close'

// The shim's own relay, for a client that dials the shim's DevTools path
// directly rather than going through the workerd binding. It had the binding
// worker's close-code defect under the `ws` library, and it also ended the
// session itself when Chrome's socket closed — a CDP close aimed at a Chrome
// already exiting, whose fallback printed taskkill's errors on Windows.

const SESSION_ID = 'a1b2c3'
const CONNECTION_ID = 'connection-1'

/**
 * A stand-in for a `ws` WebSocket: it records what the relay did, and its
 * close() enforces the `ws` library's rule — a code an RFC 6455 peer accepts
 * (or none) and a reason of at most 123 bytes — by throwing as `ws` does.
 */
interface FakeWs extends RelaySocket {
	readyState: number
	sent: unknown[]
	/** Every close() that was accepted, in order. */
	closed: { code?: number; reason?: string }[]
	/** Every close() refused under the `ws` rule, in order. */
	refused: { code?: number; reason?: string }[]
	/** Deliver an event to the relay's listeners, as `ws` would. */
	emit(event: string, ...args: unknown[]): void
}

/** A fresh, open stand-in socket. */
function createFakeWs(): FakeWs {
	const events = new EventEmitter()
	const socket: FakeWs = {
		readyState: 1,
		sent: [],
		closed: [],
		refused: [],
		send(data) {
			socket.sent.push(data)
		},
		close(code, reason) {
			const badReason = reason !== undefined && Buffer.byteLength(reason) > 123
			if (!isWireValidCloseCode(code) || (code !== undefined && badReason)) {
				socket.refused.push({ code, reason })
				throw new TypeError('First argument must be a valid error code number')
			}
			socket.closed.push({ code, reason })
			socket.readyState = 2
		},
		on(event, listener) {
			events.on(event, listener as (...args: unknown[]) => void)
			return socket
		},
		emit(event, ...args) {
			events.emit(event, ...args)
		}
	}
	return socket
}

/** One relay between two stand-ins, with the registry calls it made. */
function startRelay(options: { connectTimeoutMs?: number } = {}) {
	const client = createFakeWs()
	const chrome = createFakeWs()
	const registry = {
		release: mock(() => true),
		close: mock(async () => {})
	}
	relayDevtools(client, chrome, {
		sessionId: SESSION_ID,
		connectionId: CONNECTION_ID,
		registry,
		connectTimeoutMs: options.connectTimeoutMs ?? 60000
	})
	// Opening cancels the connect timeout, so it cannot fire under a test.
	if (options.connectTimeoutMs === undefined) chrome.emit('open')
	return { client, chrome, registry }
}

describe('shim devtools relay', () => {
	// → MUTANT: put back the 1000–4999 range check in place of relayedClose()
	//   in the chrome 'close' listener. `ws` refuses 1006, `refused` fills and
	//   the client is never closed.
	test('a Chrome gone without a Close frame closes the client with 1011', () => {
		const { client, chrome } = startRelay()

		chrome.emit('close', 1006, Buffer.from(''))

		expect(client.refused).toEqual([])
		expect(client.closed).toEqual([{ code: 1011, reason: 'peer closed with 1006' }])
	})

	// A Chrome going away is the registry's to notice — through puppeteer's
	// `disconnected`, which reaps it. Ending the session here meant a CDP
	// close aimed at a Chrome already exiting.
	//
	// → MUTANT: call `registry.close(sessionId, 2, 'ChromeDisconnected')` from
	//   the chrome 'close' listener, as the relay used to.
	test("Chrome's socket closing or failing leaves the session to the registry", () => {
		const closed = startRelay()
		closed.chrome.emit('close', 1006, Buffer.from(''))

		const failed = startRelay()
		failed.chrome.emit('error', new Error('read ECONNRESET'))

		expect(closed.registry.close).not.toHaveBeenCalled()
		expect(failed.registry.close).not.toHaveBeenCalled()
		expect(failed.client.closed).toEqual([{ code: 1011, reason: 'Chrome WebSocket error' }])
	})

	// @cloudflare/puppeteer disconnects with a bare ws.close(): 1005 here.
	test('a client that leaves without a status closes Chrome without one, and releases', () => {
		const { client, chrome, registry } = startRelay()

		client.emit('close', 1005, Buffer.from(''))

		expect(chrome.closed).toEqual([{ code: undefined, reason: undefined }])
		expect(registry.release).toHaveBeenCalledWith(SESSION_ID, CONNECTION_ID)
		expect(registry.close).not.toHaveBeenCalled()
	})

	test.each([
		undefined,
		0,
		999,
		1000,
		1001,
		1004,
		1005,
		1006,
		1011,
		1015,
		1016,
		2999,
		3000,
		4999,
		5000
	])('a close reporting %p is relayed as a close `ws` accepts, both ways', (code) => {
		const fromChrome = startRelay()
		fromChrome.chrome.emit('close', code, Buffer.from('gone'))

		const fromClient = startRelay()
		fromClient.client.emit('close', code, Buffer.from('gone'))

		for (const socket of [fromChrome.client, fromClient.chrome]) {
			expect(socket.refused).toEqual([])
			expect(socket.closed).toHaveLength(1)
		}
	})

	// `ws` delivers text as a Buffer, and send() turns a Buffer into a BINARY
	// frame — which Chrome's DevTools socket refuses by dropping the
	// connection. Forwarded as it came, not one command ever reached Chrome.
	//
	// → MUTANT: forward `data` as it came instead of asFrame(data, isBinary).
	test('forwards text as text and binary as binary, both ways', () => {
		const { client, chrome } = startRelay()

		client.emit('message', Buffer.from('{"id":1}'), false)
		chrome.emit('message', Buffer.from('{"id":1,"result":{}}'), false)
		const binary = Buffer.from([1, 2, 3])
		client.emit('message', binary, true)

		expect(chrome.sent).toEqual(['{"id":1}', binary])
		expect(client.sent).toEqual(['{"id":1,"result":{}}'])
	})

	// puppeteer speaks the moment its upgrade completes, which is before the
	// relay's own socket to Chrome has opened. Those commands used to be dropped,
	// and a dropped command is one its caller waits on until protocolTimeout.
	//
	// → MUTANT: drop the `pending.push(message)` branch in the client 'message'
	//   listener.
	test('holds what the client says before Chrome is connected, then delivers it in order', () => {
		const client = createFakeWs()
		const chrome = createFakeWs()
		chrome.readyState = 0
		const registry = { release: mock(() => true), close: mock(async () => {}) }
		relayDevtools(client, chrome, { sessionId: SESSION_ID, registry, connectTimeoutMs: 60000 })

		client.emit('message', Buffer.from('{"id":1}'), false)
		client.emit('message', Buffer.from('{"id":2}'), false)
		expect(chrome.sent).toEqual([])

		chrome.readyState = 1
		chrome.emit('open')
		expect(chrome.sent).toEqual(['{"id":1}', '{"id":2}'])
	})

	// The one ending the relay still decides: a running Chrome that never
	// answered the upgrade gets a CDP close.
	//
	// → MUTANT: drop the registry.close() from the connect timeout.
	test('a Chrome that never answers the upgrade is closed, and the client told', async () => {
		const { client, chrome, registry } = startRelay({ connectTimeoutMs: 10 })
		await new Promise((resolve) => setTimeout(resolve, 40))

		expect(client.closed).toEqual([{ code: 1011, reason: 'Chrome connection timeout' }])
		expect(chrome.closed).toEqual([{ code: undefined, reason: undefined }])
		expect(registry.close).toHaveBeenCalledWith(SESSION_ID, 5, 'ChromeConnectionTimeout')
	})

	test('a Chrome that answers in time is not closed by the timeout', async () => {
		const client = createFakeWs()
		const chrome = createFakeWs()
		const registry = { release: mock(() => true), close: mock(async () => {}) }
		relayDevtools(client, chrome, { sessionId: SESSION_ID, registry, connectTimeoutMs: 10 })

		chrome.emit('open')
		await new Promise((resolve) => setTimeout(resolve, 40))

		expect(registry.close).not.toHaveBeenCalled()
		expect(client.closed).toEqual([])
	})
})
