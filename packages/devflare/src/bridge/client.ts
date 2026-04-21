// =============================================================================
// Bridge Client — WebSocket Client for Node.js/Bun
// =============================================================================
// Connects to the Miniflare gateway worker and provides an RPC interface.
//
// Wire protocol: TransportV2Codec owns the underlying socket. On connect, the
// client sends `hello` and the server replies `welcome` (or simply ignores the
// handshake — connect resolves on socket open either way, and the codec keeps
// the handshake promise live for capability negotiation). RPC, body, stream
// and ws-relay messages are dispatched through the codec.
// =============================================================================

import {
	type JsonMsg,
	type StreamPull,
	type WsOpen,
	type WsOpened,
	type WsClose,
	parseJsonMsg,
	stringifyJsonMsg,
	encodeBinaryFrame,
	decodeBinaryFrame,
	BinaryKind,
	BinaryFlags,
	nextWsId,
	DEFAULT_BRIDGE_PORT,
	DEFAULT_CHUNK_SIZE
} from './v2/wire'
import {
	serializeValue,
	deserializeValue,
	type StreamRef
} from './v2/value-serialization'
import { TransportV2Codec } from './v2/codec'
import type {
	WebSocketLike,
	WebSocketLikeMessageEvent,
	WebSocketLikeCloseEvent
} from './v2/transport'
import type { TransportV2DecodedBinaryFrame } from './v2/frames'
import { bridgeLog } from './log'

// -----------------------------------------------------------------------------
// Internal — adapter that exposes a real browser/Node WebSocket as a
// WebSocketLike target the v2 codec can attach to. We retain control over the
// real WebSocket's onopen handler so that BridgeClient.connect() can resolve
// on socket open while the codec runs the handshake in the background.
// -----------------------------------------------------------------------------

class BridgeWsAdapter implements WebSocketLike {
	onmessage: ((event: WebSocketLikeMessageEvent) => void) | null = null
	onclose: ((event: WebSocketLikeCloseEvent) => void) | null = null
	onerror: ((event: { error?: unknown }) => void) | null = null
	#ws: WebSocket

	constructor(ws: WebSocket) {
		this.#ws = ws
	}

	send(data: string | Uint8Array): void {
		this.#ws.send(data as never)
	}

	close(code?: number, reason?: string): void {
		this.#ws.close(code, reason)
	}
}

const BRIDGE_CLIENT_CAPABILITIES = ['streams', 'ws-relay', 'http-transfer'] as const

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BridgeClientOptions {
	/** Bridge WebSocket URL (default: ws://localhost:8686) */
	url?: string
	/** Auto-reconnect on disconnect */
	autoReconnect?: boolean
	/** Reconnect delay in ms */
	reconnectDelay?: number
	/** Connection timeout in ms */
	connectTimeout?: number
}

export interface PendingCall {
	resolve: (value: unknown) => void
	reject: (error: Error) => void
	timeout: ReturnType<typeof setTimeout>
}

export interface ActiveStream {
	controller: ReadableStreamDefaultController<Uint8Array>
	buffer: Uint8Array[]
	creditRemaining: number
	/** Resolver for a pending pull waiting on bytes or end */
	pendingPull: {
		resolve: () => void
		reject: (error: Error) => void
	} | null
	/** Stream ended (from server) — signal pull to flush and close */
	ended: boolean
	/** Stream was cancelled locally or aborted */
	closed: boolean
}

export interface ActiveWsProxy {
	clientWs: WebSocket
	onMessage: (data: Uint8Array | string) => void
	onClose: (code?: number, reason?: string) => void
}

export interface PendingWsOpen {
	resolve: () => void
	reject: (error: Error) => void
}

// -----------------------------------------------------------------------------
// Bridge Client
// -----------------------------------------------------------------------------

export class BridgeClient {
	private ws: WebSocket | null = null
	private codec: TransportV2Codec | null = null
	private adapter: BridgeWsAdapter | null = null
	private url: string
	private autoReconnect: boolean
	private reconnectDelay: number
	private connectTimeout: number

	private activeStreams = new Map<number, ActiveStream>()
	private wsProxies = new Map<number, ActiveWsProxy>()
	private pendingWsOpens = new Map<number, PendingWsOpen>()
	private outgoingStreams = new Map<number, StreamRef>()

	private connectPromise: Promise<void> | null = null
	private isConnected = false

	constructor(options: BridgeClientOptions = {}) {
		this.url = options.url ?? `ws://localhost:${DEFAULT_BRIDGE_PORT}`
		this.autoReconnect = options.autoReconnect ?? true
		this.reconnectDelay = options.reconnectDelay ?? 1000
		this.connectTimeout = options.connectTimeout ?? 5000
	}

	/** Get the WebSocket URL */
	getUrl(): string {
		return this.url
	}

	/** Get the HTTP URL for transfer endpoint */
	getHttpUrl(): string {
		// Convert ws://... to http://...
		return this.url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
	}

	// ---------------------------------------------------------------------------
	// Connection Management
	// ---------------------------------------------------------------------------

	/** Connect to the bridge */
	async connect(): Promise<void> {
		if (this.isConnected) return
		if (this.connectPromise) return this.connectPromise

		this.connectPromise = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Connection timeout: ${this.url}`))
				this.ws?.close()
			}, this.connectTimeout)

			try {
				this.ws = new WebSocket(this.url)
				this.ws.binaryType = 'arraybuffer'

				const adapter = new BridgeWsAdapter(this.ws)
				this.adapter = adapter

				this.ws.onopen = () => {
					clearTimeout(timeout)
					// Attach the v2 codec only once the socket is open so its
					// `sendHello()` call writes to a live transport.
					this.codec = new TransportV2Codec(adapter, {
						capabilities: [...BRIDGE_CLIENT_CAPABILITIES],
						onUnknownControl: (data) => this.handleJsonMessage(data),
						onUnknownBinary: (frame) => this.handleV2BinaryFrame(frame)
					})
					// Fire the handshake but do NOT block connect() on it. The
					// gateway-runtime side acks with `welcome`; servers that do
					// not implement v2 simply ignore it (the codec dispatches
					// unknown text to onUnknownControl, which silently drops).
					this.codec.sendHello()
					this.codec.handshake.catch(() => { /* surfaced through cleanupPending */ })
					this.isConnected = true
					this.connectPromise = null
					resolve()
				}

				this.ws.onerror = (event) => {
					clearTimeout(timeout)
					this.connectPromise = null
					adapter.onerror?.({ error: (event as unknown as { error?: unknown }).error })
					reject(new Error('WebSocket connection failed'))
				}

				this.ws.onclose = (event) => {
					adapter.onclose?.({
						code: event?.code ?? 1006,
						reason: event?.reason ?? ''
					})
					this.handleDisconnect()
				}

				this.ws.onmessage = (event) => {
					adapter.onmessage?.({ data: event.data })
				}
			} catch (error) {
				clearTimeout(timeout)
				this.connectPromise = null
				reject(error)
			}
		})

		return this.connectPromise
	}

	/** Disconnect from the bridge and tear down all pending state */
	disconnect(): void {
		this.autoReconnect = false
		// Closing the codec rejects any pending RPC calls registered there
		// with the codec's own "v2 transport closed" error; cleanupPending()
		// then layers the BridgeClient-level streams/ws teardown.
		this.codec?.close()
		this.codec = null
		this.adapter = null
		this.ws?.close()
		this.ws = null
		this.isConnected = false
		this.cleanupPending(new Error('Bridge disconnected'))
	}

	/** Alias for disconnect() */
	close(): void {
		this.disconnect()
	}

	/** Check if connected */
	get connected(): boolean {
		return this.isConnected
	}

	private handleDisconnect(): void {
		this.isConnected = false
		this.codec?.close()
		this.codec = null
		this.adapter = null
		this.ws = null

		this.cleanupPending(new Error('Bridge disconnected'))

		// Auto-reconnect
		if (this.autoReconnect) {
			setTimeout(() => {
				this.connect().catch((error) => {
					bridgeLog.warn('auto-reconnect attempt failed', error)
				})
			}, this.reconnectDelay)
		}
	}

	/** Reject/close all pending streams and ws proxies (codec owns RPC pending). */
	private cleanupPending(error: Error): void {
		// Reject pending ws.opened waits
		for (const pending of this.pendingWsOpens.values()) {
			pending.reject(error)
		}
		this.pendingWsOpens.clear()

		// Error out active incoming streams and reject any pending pull
		for (const stream of this.activeStreams.values()) {
			stream.closed = true
			if (stream.pendingPull) {
				stream.pendingPull.reject(error)
				stream.pendingPull = null
			}
			try {
				stream.controller.error(error)
			} catch {
				// controller may already be closed
			}
		}
		this.activeStreams.clear()

		// Notify active ws proxies of close
		for (const proxy of this.wsProxies.values()) {
			try {
				proxy.onClose(1006, error.message)
			} catch {
				// swallow handler errors during cleanup
			}
		}
		this.wsProxies.clear()

		// Drop outgoing stream refs
		this.outgoingStreams.clear()
	}

	// ---------------------------------------------------------------------------
	// RPC Interface
	// ---------------------------------------------------------------------------

	/** Call an RPC method */
	async call(method: string, params: unknown[], timeoutMs = 30000): Promise<unknown> {
		await this.ensureConnected()

		const codec = this.codec
		if (!codec) {
			throw new Error('Bridge disconnected')
		}

		// Serialize params (may produce streams)
		const { value: serializedParams, streams } = await serializeValue(params)

		// Register outgoing streams
		for (const streamRef of streams) {
			this.outgoingStreams.set(streamRef.sid, streamRef)
		}

		const callPromise = codec.call(method, serializedParams as unknown[])

		let timeoutHandle: ReturnType<typeof setTimeout> | null = null
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(`RPC timeout: ${method}`))
			}, timeoutMs)
		})

		try {
			const rawResult = await Promise.race([callPromise, timeoutPromise])
			return deserializeValue(rawResult, (sid) => this.createReadableStream(sid))
		} catch (error) {
			// Re-wrap codec's "v2 transport closed" error so callers continue
			// to see the BridgeClient-level disconnect message they expect.
			if (!this.isConnected && error instanceof Error
				&& /v2 transport closed|transport/.test(error.message)) {
				throw new Error('Bridge disconnected')
			}
			throw error
		} finally {
			if (timeoutHandle !== null) clearTimeout(timeoutHandle)
		}
	}

	// ---------------------------------------------------------------------------
	// WebSocket Proxy
	// ---------------------------------------------------------------------------

	/** Create a proxied WebSocket to a Durable Object */
	async createWsProxy(
		binding: string,
		id: string,
		url: string,
		headers?: [string, string][]
	): Promise<{
		wid: number
		send: (data: Uint8Array | string) => void
		close: (code?: number, reason?: string) => void
		onMessage: (handler: (data: Uint8Array | string) => void) => void
		onClose: (handler: (code?: number, reason?: string) => void) => void
	}> {
		await this.ensureConnected()

		const wid = nextWsId()

		const proxy: ActiveWsProxy = {
			clientWs: null as any,  // Not a real WS, we handle it
			onMessage: () => {},
			onClose: () => {}
		}
		this.wsProxies.set(wid, proxy)

		// Register the pending open BEFORE sending so we can't miss ws.opened
		const openedPromise = new Promise<void>((resolve, reject) => {
			this.pendingWsOpens.set(wid, { resolve, reject })
		})

		// Send open request
		const msg: WsOpen = {
			t: 'ws.open',
			wid,
			target: { binding, id, url, headers }
		}
		this.send(msg)

		// Await confirmation from the bridge before returning the proxy
		try {
			await openedPromise
		} catch (error) {
			this.wsProxies.delete(wid)
			throw error
		}

		return {
			wid,
			send: (data) => {
				const payload = typeof data === 'string'
					? new TextEncoder().encode(data)
					: data
				const flags = typeof data === 'string' ? BinaryFlags.TEXT : 0
				const frame = encodeBinaryFrame(BinaryKind.WsData, wid, 0, flags, payload)
				this.sendBinary(frame)
			},
			close: (code, reason) => {
				const closeMsg: WsClose = { t: 'ws.close', wid, code, reason }
				this.send(closeMsg)
				this.wsProxies.delete(wid)
			},
			onMessage: (handler) => {
				proxy.onMessage = handler
			},
			onClose: (handler) => {
				proxy.onClose = handler
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Stream Interface
	// ---------------------------------------------------------------------------

	/** Create a readable stream that pulls from the bridge */
	createReadableStream(sid: number): ReadableStream<Uint8Array> {
		return new ReadableStream<Uint8Array>({
			start: (controller) => {
				this.activeStreams.set(sid, {
					controller,
					buffer: [],
					creditRemaining: 0,
					pendingPull: null,
					ended: false,
					closed: false
				})
			},
			pull: async (controller) => {
				const stream = this.activeStreams.get(sid)
				if (!stream || stream.closed) return

				// Flush any buffered chunks first
				if (stream.buffer.length > 0) {
					const chunk = stream.buffer.shift()!
					controller.enqueue(chunk)
					return
				}

				// If the stream has ended and buffer is empty, close it
				if (stream.ended) {
					controller.close()
					this.activeStreams.delete(sid)
					return
				}

				// Request more data from the bridge
				const pullMsg: StreamPull = {
					t: 'stream.pull',
					sid,
					creditBytes: DEFAULT_CHUNK_SIZE * 4
				}
				this.send(pullMsg)

				// Await a signal that bytes arrived, the stream ended, or it was aborted
				await new Promise<void>((resolve, reject) => {
					stream.pendingPull = { resolve, reject }
				})
				stream.pendingPull = null

				if (stream.closed) return

				if (stream.buffer.length > 0) {
					const chunk = stream.buffer.shift()!
					controller.enqueue(chunk)
					return
				}

				if (stream.ended) {
					controller.close()
					this.activeStreams.delete(sid)
				}
			},
			cancel: () => {
				const stream = this.activeStreams.get(sid)
				if (stream) {
					stream.closed = true
					if (stream.pendingPull) {
						stream.pendingPull.reject(new Error('Stream cancelled'))
						stream.pendingPull = null
					}
				}
				this.activeStreams.delete(sid)
			}
		})
	}

	// ---------------------------------------------------------------------------
	// Message Handling — invoked by TransportV2Codec via onUnknownControl /
	// onUnknownBinary hooks. The codec handles `hello`/`welcome`, `body.*` and
	// the `rpc.*` envelope itself; everything below is the legacy stream/ws
	// vocabulary that v2 keeps bit-compatible for in-flight wire shapes.
	// ---------------------------------------------------------------------------

	private handleJsonMessage(data: string): void {
		try {
			const msg = parseJsonMsg(data)

			switch (msg.t) {
				case 'event':
					this.handleEvent(msg)
					break
				case 'stream.pull':
					this.handleStreamPull(msg)
					break
				case 'stream.end':
					this.handleStreamEnd(msg)
					break
				case 'stream.abort':
					this.handleStreamAbort(msg)
					break
				case 'ws.opened':
					this.handleWsOpened(msg)
					break
				case 'ws.close':
					this.handleWsClose(msg)
					break
			}
		} catch (error) {
			console.error('[devflare bridge client] parse error:', data, error)
		}
	}

	/**
	 * Receive a v2 binary frame. Frame format is byte-identical to the legacy
	 * v1 frames for kinds 1 (StreamChunk) and 2 (WsData); v2 owns kind 3
	 * (BodyChunk) which the codec handles internally before reaching here.
	 */
	private handleV2BinaryFrame(frame: TransportV2DecodedBinaryFrame): void {
		switch (frame.kind) {
			case BinaryKind.StreamChunk:
				this.handleStreamChunk(frame)
				break
			case BinaryKind.WsData:
				this.handleWsData(frame)
				break
		}
	}

	private handleEvent(_msg: { topic: string; data: unknown }): void {
		// TODO: Emit event to subscribers when event system is implemented
	}

	private handleStreamPull(msg: StreamPull): void {
		const streamRef = this.outgoingStreams.get(msg.sid)
		if (!streamRef) return

		// Read from stream and send chunks
		this.pumpStream(streamRef, msg.creditBytes)
	}

	private async pumpStream(streamRef: StreamRef, creditBytes: number): Promise<void> {
		const reader = streamRef.stream.getReader()
		let sent = 0
		let seq = 0

		try {
			while (sent < creditBytes) {
				const { done, value } = await reader.read()

				if (done) {
					// Send end message
					this.send({ t: 'stream.end', sid: streamRef.sid })
					this.outgoingStreams.delete(streamRef.sid)
					break
				}

				if (value) {
					// Send chunk
					const frame = encodeBinaryFrame(
						BinaryKind.StreamChunk,
						streamRef.sid,
						seq++,
						0,
						value
					)
					this.sendBinary(frame)
					sent += value.byteLength
				}
			}
		} catch (error) {
			this.send({
				t: 'stream.abort',
				sid: streamRef.sid,
				error: String(error)
			})
			this.outgoingStreams.delete(streamRef.sid)
		} finally {
			reader.releaseLock()
		}
	}

	private handleStreamChunk(decoded: { id: number; payload: Uint8Array }): void {
		const stream = this.activeStreams.get(decoded.id)
		if (!stream || stream.closed) return

		stream.buffer.push(decoded.payload)
		if (stream.pendingPull) {
			const pending = stream.pendingPull
			stream.pendingPull = null
			pending.resolve()
		}
	}

	private handleStreamEnd(msg: { sid: number }): void {
		const stream = this.activeStreams.get(msg.sid)
		if (!stream) return

		stream.ended = true
		if (stream.pendingPull) {
			const pending = stream.pendingPull
			stream.pendingPull = null
			pending.resolve()
		}
	}

	private handleStreamAbort(msg: { sid: number; error?: string }): void {
		const stream = this.activeStreams.get(msg.sid)
		if (!stream) return

		const err = new Error(msg.error ?? 'Stream aborted')
		stream.closed = true
		if (stream.pendingPull) {
			const pending = stream.pendingPull
			stream.pendingPull = null
			pending.reject(err)
		}
		try {
			stream.controller.error(err)
		} catch {
			// already closed
		}
		this.activeStreams.delete(msg.sid)
	}

	private handleWsData(decoded: { id: number; flags: number; payload: Uint8Array }): void {
		const proxy = this.wsProxies.get(decoded.id)
		if (!proxy) return

		const isText = (decoded.flags & BinaryFlags.TEXT) !== 0
		const data = isText
			? new TextDecoder().decode(decoded.payload)
			: decoded.payload

		proxy.onMessage(data)
	}

	private handleWsClose(msg: WsClose): void {
		const proxy = this.wsProxies.get(msg.wid)
		if (!proxy) return

		proxy.onClose(msg.code, msg.reason)
		this.wsProxies.delete(msg.wid)
	}

	private handleWsOpened(msg: WsOpened): void {
		const pending = this.pendingWsOpens.get(msg.wid)
		if (!pending) return
		this.pendingWsOpens.delete(msg.wid)
		pending.resolve()
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private async ensureConnected(): Promise<void> {
		if (!this.isConnected) {
			await this.connect()
		}
	}

	private send(msg: JsonMsg): void {
		const codec = this.codec
		if (!codec || !this.isConnected) {
			throw new Error('Not connected to bridge')
		}
		codec.sendText(stringifyJsonMsg(msg))
	}

	private sendBinary(frame: Uint8Array): void {
		const codec = this.codec
		if (!codec || !this.isConnected) {
			throw new Error('Not connected to bridge')
		}
		codec.sendBinary(frame)
	}
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------

let defaultClient: BridgeClient | null = null

/** Get or create the default bridge client */
export function getClient(options?: BridgeClientOptions): BridgeClient {
	if (!defaultClient) {
		defaultClient = new BridgeClient(options)
	}
	return defaultClient
}

/** Reset the default client (for testing) */
export function resetClient(): void {
	defaultClient?.disconnect()
	defaultClient = null
}
