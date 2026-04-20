// =============================================================================
// Transport v2 — WebSocket relay (client side)
// =============================================================================
// A v2 WS relay multiplexes a virtual WebSocket over the bridge codec. The
// client sends `ws.open`, the server replies with `ws.opened` (or
// `ws.openerr`), then both sides exchange `ws.text` JSON frames for text
// messages and binary kind=2 (`WsData`) frames for binary messages. Either
// side closes by sending `ws.close`.
// =============================================================================

import {
	TransportV2BinaryFlags,
	TransportV2BinaryKind,
	encodeTransportV2BinaryFrame,
	transportV2IsFin,
	transportV2IsText
} from './frames'
import {
	parseTransportV2AuxMsg,
	stringifyTransportV2AuxMsg
} from './control-messages'
import type {
	TransportV2AuxMsg,
	TransportV2WsCloseMsg,
	TransportV2WsOpenMsg,
	TransportV2WsTextMsg
} from './control-messages'
import type { TransportV2Codec } from './codec'
import type { TransportV2DecodedBinaryFrame } from './frames'

export interface TransportV2WsProxyHandlers {
	onMessage?: (data: string | Uint8Array) => void
	onClose?: (code?: number, reason?: string) => void
	onError?: (error: Error) => void
}

export interface TransportV2WsProxy {
	readonly id: string
	readonly opened: Promise<void>
	send(data: string | Uint8Array): void
	close(code?: number, reason?: string): void
	setHandlers(handlers: TransportV2WsProxyHandlers): void
}

export interface TransportV2WsRelayOptions {
	codec: TransportV2Codec
	binding: string
	path: string
	headers?: Record<string, string>
	doId?: string
	doName?: string
}

/**
 * Owns all in-flight v2 WS relays multiplexed on a single codec. Wire it up by
 * passing its `handleControl`/`handleBinary` to the codec's
 * `onUnknownControl`/`onUnknownBinary` hooks.
 */
export class TransportV2WsRelayManager {
	#codec: TransportV2Codec
	#proxies = new Map<string, InternalProxy>()
	#nextId = 1
	#nextSeq = new Map<string, number>()

	constructor(codec: TransportV2Codec) {
		this.#codec = codec
	}

	open(options: Omit<TransportV2WsRelayOptions, 'codec'>): TransportV2WsProxy {
		const id = `v2_ws_${this.#nextId++}`
		const proxy = new InternalProxy(id, this)
		this.#proxies.set(id, proxy)

		const open: TransportV2WsOpenMsg = {
			t: 'ws.open',
			id,
			binding: options.binding,
			path: options.path,
			headers: options.headers ?? {}
		}
		if (options.doId) open.doId = options.doId
		if (options.doName) open.doName = options.doName
		this.#codec.sendText(stringifyTransportV2AuxMsg(open))

		return proxy
	}

	handleControl(text: string): boolean {
		const msg = parseTransportV2AuxMsg(text)
		if (!msg) return false
		if (!('id' in msg) || typeof msg.id !== 'string') return false

		const proxy = this.#proxies.get(msg.id)
		if (!proxy) return msg.t.startsWith('ws.')

		switch (msg.t) {
			case 'ws.opened':
				proxy._resolveOpened()
				return true
			case 'ws.openerr':
				proxy._rejectOpened(new Error(msg.error.message))
				this.#proxies.delete(proxy.id)
				return true
			case 'ws.text':
				proxy._deliver((msg as TransportV2WsTextMsg).data)
				return true
			case 'ws.close':
				proxy._handleClose((msg as TransportV2WsCloseMsg).code, (msg as TransportV2WsCloseMsg).reason)
				this.#proxies.delete(proxy.id)
				return true
		}
		return false
	}

	handleBinary(frame: TransportV2DecodedBinaryFrame): boolean {
		if (frame.kind !== TransportV2BinaryKind.WsData) return false
		const id = `v2_ws_${frame.id}`
		const proxy = this.#proxies.get(id)
		if (!proxy) return true

		if (transportV2IsText(frame.flags)) {
			proxy._deliver(new TextDecoder().decode(frame.payload))
		} else {
			proxy._deliver(new Uint8Array(frame.payload))
		}

		if (transportV2IsFin(frame.flags)) {
			proxy._handleClose()
			this.#proxies.delete(id)
		}
		return true
	}

	_send(proxy: InternalProxy, data: string | Uint8Array): void {
		const numericId = Number.parseInt(proxy.id.slice('v2_ws_'.length), 10)
		const seq = (this.#nextSeq.get(proxy.id) ?? 0) + 1
		this.#nextSeq.set(proxy.id, seq)

		if (typeof data === 'string') {
			const payload = new TextEncoder().encode(data)
			const frame = encodeTransportV2BinaryFrame(
				TransportV2BinaryKind.WsData,
				numericId,
				seq,
				TransportV2BinaryFlags.TEXT,
				payload
			)
			this.#codec.sendBinary(frame)
		} else {
			const frame = encodeTransportV2BinaryFrame(
				TransportV2BinaryKind.WsData,
				numericId,
				seq,
				0,
				data
			)
			this.#codec.sendBinary(frame)
		}
	}

	_close(proxy: InternalProxy, code?: number, reason?: string): void {
		if (!this.#proxies.has(proxy.id)) return
		const close: TransportV2WsCloseMsg = { t: 'ws.close', id: proxy.id }
		if (code !== undefined) close.code = code
		if (reason !== undefined) close.reason = reason
		this.#codec.sendText(stringifyTransportV2AuxMsg(close))
		this.#proxies.delete(proxy.id)
	}
}

class InternalProxy implements TransportV2WsProxy {
	readonly id: string
	readonly opened: Promise<void>
	#openedResolve!: () => void
	#openedReject!: (error: Error) => void
	#openedSettled = false
	#handlers: TransportV2WsProxyHandlers = {}
	#manager: TransportV2WsRelayManager
	#closed = false

	constructor(id: string, manager: TransportV2WsRelayManager) {
		this.id = id
		this.#manager = manager
		this.opened = new Promise<void>((resolve, reject) => {
			this.#openedResolve = resolve
			this.#openedReject = reject
		})
	}

	setHandlers(handlers: TransportV2WsProxyHandlers): void {
		this.#handlers = handlers
	}

	send(data: string | Uint8Array): void {
		if (this.#closed) throw new Error(`v2 ws ${this.id} already closed`)
		this.#manager._send(this, data)
	}

	close(code?: number, reason?: string): void {
		if (this.#closed) return
		this.#closed = true
		this.#manager._close(this, code, reason)
		this.#handlers.onClose?.(code, reason)
	}

	_resolveOpened(): void {
		if (this.#openedSettled) return
		this.#openedSettled = true
		this.#openedResolve()
	}

	_rejectOpened(error: Error): void {
		if (this.#openedSettled) return
		this.#openedSettled = true
		this.#openedReject(error)
		this.#handlers.onError?.(error)
	}

	_deliver(data: string | Uint8Array): void {
		this.#handlers.onMessage?.(data)
	}

	_handleClose(code?: number, reason?: string): void {
		if (this.#closed) return
		this.#closed = true
		this.#handlers.onClose?.(code, reason)
	}
}

export function isTransportV2WsAuxMsg(msg: TransportV2AuxMsg): boolean {
	return msg.t.startsWith('ws.')
}
