// =============================================================================
// Bridge Transport v2 — Codec (Handshake + Frame Demultiplexer + RPC)
// =============================================================================
//
// `TransportV2Codec` attaches to a `WebSocketLike` and provides a typed v2
// API on top of it: handshake, RPC call/response, body stream registration.
//
// Frame routing:
//   - Text frames → JSON-parsed v2 control messages, dispatched per `t` field.
//     Frames with `t` not in the v2 vocabulary are forwarded to the optional
//     `onUnknownControl` hook so that callers wiring v2 alongside v1 can keep
//     handling the v1 vocabulary themselves during the dual-mode period.
//   - Binary frames → decoded v2 binary frames. `BodyChunk` frames are
//     forwarded to the body-stream registry; other kinds are forwarded to
//     `onUnknownBinary`.
// =============================================================================

import { TransportV2BodyReaderRegistry } from './body-streams'
import {
	TRANSPORT_V2_PROTOCOL_VERSION,
	TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE,
	TransportV2BinaryKind,
	decodeTransportV2BinaryFrame,
	negotiateTransportV2Capabilities,
	parseTransportV2ControlMsg,
	stringifyTransportV2ControlMsg
} from './frames'
import type {
	TransportV2BodyKind,
	TransportV2ControlMsg,
	TransportV2DecodedBinaryFrame,
	TransportV2Hello,
	TransportV2Welcome
} from './frames'
import type { WebSocketLike, WebSocketLikeMessageEvent } from './transport'

export interface TransportV2HandshakeOk {
	protocolVersion: typeof TRANSPORT_V2_PROTOCOL_VERSION
	capabilities: string[]
}

export interface TransportV2RpcCall {
	t: 'rpc.call'
	id: string
	method: string
	params: unknown[]
}

export interface TransportV2RpcOk {
	t: 'rpc.ok'
	id: string
	result: unknown
}

export interface TransportV2RpcErr {
	t: 'rpc.err'
	id: string
	error: { code: string; message: string; details?: unknown }
}

export type TransportV2RpcMsg = TransportV2RpcCall | TransportV2RpcOk | TransportV2RpcErr

export interface TransportV2CodecOptions {
	/** Capability strings this side supports. Both halves of the bridge advertise these in `hello`/`welcome`. */
	capabilities?: readonly string[]
	/** Called when an RPC call arrives (server-side handler). */
	onRpcCall?: (call: TransportV2RpcCall) => void
	/** Called when a non-v2 control message arrives. Used during the dual-mode period to keep handling v1 messages. */
	onUnknownControl?: (data: string) => void
	/** Called when a non-BodyChunk binary frame arrives. Used during dual-mode for v1 stream/ws frames. */
	onUnknownBinary?: (frame: TransportV2DecodedBinaryFrame) => void
}

interface PendingRpc {
	resolve: (result: unknown) => void
	reject: (error: Error) => void
}

/**
 * v2 codec attached to a single `WebSocketLike`. Owns handshake state, the
 * frame demultiplexer, RPC pending-call table, and the body-stream registry.
 */
export class TransportV2Codec {
	readonly bodyReaders = new TransportV2BodyReaderRegistry()
	#socket: WebSocketLike
	#capabilities: readonly string[]
	#options: TransportV2CodecOptions
	#handshakeResolver: { resolve: (value: TransportV2HandshakeOk) => void; reject: (error: Error) => void } | null = null
	#handshakePromise: Promise<TransportV2HandshakeOk>
	#sentHello = false
	#receivedHello = false
	#receivedWelcome = false
	#negotiated: TransportV2HandshakeOk | null = null
	#pendingRpc = new Map<string, PendingRpc>()
	#nextBid = 1
	#nextRpcId = 1
	#closed = false

	constructor(socket: WebSocketLike, options: TransportV2CodecOptions = {}) {
		this.#socket = socket
		this.#capabilities = options.capabilities ?? []
		this.#options = options

		this.#handshakePromise = new Promise<TransportV2HandshakeOk>((resolve, reject) => {
			this.#handshakeResolver = { resolve, reject }
		})

		socket.onmessage = (event) => this.#onMessage(event)
		socket.onclose = () => this.#onClose()
		socket.onerror = (event) => this.#onError(event.error)
	}

	/** Allocate a fresh body id (writer side). */
	allocateBid(): number {
		return this.#nextBid++
	}

	/** Allocate a fresh RPC id (caller side). */
	allocateRpcId(): string {
		return `v2_rpc_${this.#nextRpcId++}`
	}

	/** Send the `hello` frame. Called once by the side that initiates the handshake. */
	sendHello(): void {
		if (this.#sentHello) return
		this.#sentHello = true
		const hello: TransportV2Hello = {
			t: 'hello',
			protocolVersion: TRANSPORT_V2_PROTOCOL_VERSION,
			capabilities: [...this.#capabilities]
		}
		this.#socket.send(stringifyTransportV2ControlMsg(hello))
	}

	/** Promise that resolves once the handshake completes. */
	get handshake(): Promise<TransportV2HandshakeOk> {
		return this.#handshakePromise
	}

	/** Negotiated capabilities once the handshake completes. */
	get negotiated(): TransportV2HandshakeOk | null {
		return this.#negotiated
	}

	sendText(message: string): void {
		if (this.#closed) {
			throw new Error('cannot send on a closed v2 codec')
		}
		this.#socket.send(message)
	}

	sendBinary(frame: Uint8Array): void {
		if (this.#closed) {
			throw new Error('cannot send on a closed v2 codec')
		}
		this.#socket.send(frame)
	}

	/** Send a typed RPC call and resolve with the peer's `rpc.ok` result. */
	call(method: string, params: unknown[] = []): Promise<unknown> {
		const id = this.allocateRpcId()
		const call: TransportV2RpcCall = { t: 'rpc.call', id, method, params }
		const promise = new Promise<unknown>((resolve, reject) => {
			this.#pendingRpc.set(id, { resolve, reject })
		})
		this.sendText(JSON.stringify(call))
		return promise
	}

	/** Send an `rpc.ok` reply for a previously-received call. */
	respondOk(id: string, result: unknown): void {
		const reply: TransportV2RpcOk = { t: 'rpc.ok', id, result }
		this.sendText(JSON.stringify(reply))
	}

	/** Send an `rpc.err` reply for a previously-received call. */
	respondErr(id: string, error: { code: string; message: string; details?: unknown }): void {
		const reply: TransportV2RpcErr = { t: 'rpc.err', id, error }
		this.sendText(JSON.stringify(reply))
	}

	/** Register a reader-side body stream. Returns the `ReadableStream`. Idempotent across the codec's `body.open` arrival. */
	openBodyReader(bid: number): ReadableStream<Uint8Array> {
		return this.bodyReaders.getOrOpen(bid)
	}

	/** Replace the `onRpcCall` handler after construction. Useful for one-shot tests and for higher RPC layers that build the handler lazily. */
	setRpcCallHandler(handler: (call: TransportV2RpcCall) => void): void {
		this.#options = { ...this.#options, onRpcCall: handler }
	}

	/** Close the underlying transport with an optional code/reason. */
	close(code?: number, reason?: string): void {
		if (this.#closed) return
		this.#closed = true
		this.#failPending(new Error('v2 transport closed'))
		this.#socket.close(code, reason)
	}

	get isClosed(): boolean {
		return this.#closed
	}

	// -------------------------------------------------------------------------
	// Internal — message routing
	// -------------------------------------------------------------------------

	#onMessage(event: WebSocketLikeMessageEvent): void {
		const { data } = event
		if (typeof data === 'string') {
			this.#onText(data)
		} else if (data instanceof Uint8Array) {
			this.#onBinary(data)
		} else if (data instanceof ArrayBuffer) {
			this.#onBinary(new Uint8Array(data))
		}
	}

	#onText(data: string): void {
		// Try to parse as a v2 control message first; fall back to the
		// dual-mode hook on unknown types.
		let msg: TransportV2ControlMsg
		try {
			msg = parseTransportV2ControlMsg(data)
		} catch {
			// Probe for an RPC message (which is part of v2's vocabulary even
			// though it shares its `t` field shape with v1).
			const rpc = tryParseRpcMsg(data)
			if (rpc !== null) {
				this.#onRpcMessage(rpc)
				return
			}
			this.#options.onUnknownControl?.(data)
			return
		}

		switch (msg.t) {
			case 'hello':
				this.#onHello(msg)
				break
			case 'welcome':
				this.#onWelcome(msg)
				break
			case 'body.open':
				// Reader-side allocation is the responsibility of the higher
				// RPC layer; the codec uses idempotent `getOrOpen` so the
				// writer's first frame is not dropped if it arrives before the
				// consumer attaches.
				this.bodyReaders.getOrOpen(msg.bid)
				break
			case 'body.end':
				this.bodyReaders.end(msg.bid)
				break
			case 'body.abort':
				this.bodyReaders.abort(msg.bid, msg.error)
				break
		}
	}

	#onBinary(data: Uint8Array): void {
		let frame: TransportV2DecodedBinaryFrame
		try {
			frame = decodeTransportV2BinaryFrame(data)
		} catch {
			// Malformed v2 binary frame — give the dual-mode hook a chance to
			// see the raw bytes; otherwise drop it.
			return
		}
		if (frame.kind === TransportV2BinaryKind.BodyChunk) {
			this.bodyReaders.pushChunk(frame)
			return
		}
		this.#options.onUnknownBinary?.(frame)
	}

	#onRpcMessage(msg: TransportV2RpcMsg): void {
		switch (msg.t) {
			case 'rpc.call':
				this.#options.onRpcCall?.(msg)
				break
			case 'rpc.ok': {
				const pending = this.#pendingRpc.get(msg.id)
				if (pending !== undefined) {
					this.#pendingRpc.delete(msg.id)
					pending.resolve(msg.result)
				}
				break
			}
			case 'rpc.err': {
				const pending = this.#pendingRpc.get(msg.id)
				if (pending !== undefined) {
					this.#pendingRpc.delete(msg.id)
					const err = new Error(msg.error.message)
					Object.assign(err, { code: msg.error.code, details: msg.error.details })
					pending.reject(err)
				}
				break
			}
		}
	}

	#onHello(msg: TransportV2Hello): void {
		if (this.#receivedHello) {
			this.close(TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE, 'duplicate hello')
			return
		}
		this.#receivedHello = true

		const negotiated = negotiateTransportV2Capabilities(this.#capabilities, msg.capabilities)
		const welcome: TransportV2Welcome = {
			t: 'welcome',
			protocolVersion: TRANSPORT_V2_PROTOCOL_VERSION,
			capabilities: negotiated
		}
		this.#socket.send(stringifyTransportV2ControlMsg(welcome))

		// Server-side completes the handshake on receipt of `hello`.
		this.#completeHandshake({ protocolVersion: TRANSPORT_V2_PROTOCOL_VERSION, capabilities: negotiated })
	}

	#onWelcome(msg: TransportV2Welcome): void {
		if (this.#receivedWelcome) return
		this.#receivedWelcome = true
		this.#completeHandshake({
			protocolVersion: TRANSPORT_V2_PROTOCOL_VERSION,
			capabilities: msg.capabilities
		})
	}

	#completeHandshake(result: TransportV2HandshakeOk): void {
		if (this.#negotiated !== null) return
		this.#negotiated = result
		this.#handshakeResolver?.resolve(result)
		this.#handshakeResolver = null
	}

	#onClose(): void {
		if (this.#closed) {
			// Codec.close() already drained pending callers; nothing more to do.
			return
		}
		this.#closed = true
		this.#failPending(new Error('v2 transport closed'))
	}

	#onError(error: unknown): void {
		const wrapped = error instanceof Error ? error : new Error(String(error))
		this.#failPending(wrapped)
	}

	#failPending(error: Error): void {
		const resolver = this.#handshakeResolver
		if (resolver !== null) {
			this.#handshakeResolver = null
			resolver.reject(error)
		}
		for (const pending of this.#pendingRpc.values()) {
			pending.reject(error)
		}
		this.#pendingRpc.clear()
	}
}

function tryParseRpcMsg(data: string): TransportV2RpcMsg | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(data)
	} catch {
		return null
	}
	if (typeof parsed !== 'object' || parsed === null || !('t' in parsed)) return null
	const t = (parsed as { t: unknown }).t
	if (t === 'rpc.call' || t === 'rpc.ok' || t === 'rpc.err') {
		return parsed as TransportV2RpcMsg
	}
	return null
}
