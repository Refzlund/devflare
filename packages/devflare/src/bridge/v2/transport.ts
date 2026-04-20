// =============================================================================
// Bridge Transport v2 — WebSocket Abstraction + In-Memory Transport Pair
// =============================================================================
//
// `WebSocketLike` is the minimal duplex interface the v2 codec depends on.
// It is satisfied by the standard WebSocket APIs used by both Node `ws` and
// the workerd-side WebSocket, which is what allows the same codec to run on
// both ends of the bridge without conditional logic.
//
// `createTransportV2Pair()` produces two paired in-memory transports for
// tests: anything written to A.send() arrives on B's 'message' listeners and
// vice versa. There is no network involved.
// =============================================================================

export interface WebSocketLikeMessageEvent {
	data: string | ArrayBuffer | Uint8Array
}

export interface WebSocketLikeCloseEvent {
	code: number
	reason: string
}

/**
 * Minimal WebSocket-shaped duplex transport interface used by the v2 codec.
 *
 * The handler-property style (`onmessage`, `onclose`, `onerror`) matches both
 * the standard browser WebSocket API and the Node `ws` package's compat layer,
 * so the codec can attach without adapters.
 */
export interface WebSocketLike {
	send(data: string | Uint8Array): void
	close(code?: number, reason?: string): void
	onmessage: ((event: WebSocketLikeMessageEvent) => void) | null
	onclose: ((event: WebSocketLikeCloseEvent) => void) | null
	onerror: ((event: { error?: unknown }) => void) | null
}

/** A linked pair of in-memory transports used by tests. */
export interface TransportV2InMemoryPair {
	a: WebSocketLike
	b: WebSocketLike
}

class InMemoryTransport implements WebSocketLike {
	onmessage: ((event: WebSocketLikeMessageEvent) => void) | null = null
	onclose: ((event: WebSocketLikeCloseEvent) => void) | null = null
	onerror: ((event: { error?: unknown }) => void) | null = null
	#peer: InMemoryTransport | null = null
	#closed = false

	bind(peer: InMemoryTransport): void {
		this.#peer = peer
	}

	send(data: string | Uint8Array): void {
		if (this.#closed) {
			throw new Error('cannot send on a closed v2 in-memory transport')
		}
		const peer = this.#peer
		if (peer === null) {
			throw new Error('v2 in-memory transport has no bound peer')
		}
		// Defer delivery to the microtask queue so that the call stack of the
		// sender unwinds before the receiver runs, matching real WebSocket
		// semantics where message handlers are never invoked re-entrantly.
		queueMicrotask(() => {
			if (peer.#closed) return
			peer.onmessage?.({ data })
		})
	}

	close(code = 1000, reason = ''): void {
		if (this.#closed) return
		this.#closed = true
		const peer = this.#peer
		queueMicrotask(() => {
			this.onclose?.({ code, reason })
			if (peer !== null && !peer.#closed) {
				peer.#closed = true
				peer.onclose?.({ code, reason })
			}
		})
	}
}

/** Create two v2 in-memory transports linked to each other. */
export function createTransportV2Pair(): TransportV2InMemoryPair {
	const a = new InMemoryTransport()
	const b = new InMemoryTransport()
	a.bind(b)
	b.bind(a)
	return { a, b }
}
