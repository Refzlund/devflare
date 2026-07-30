// =============================================================================
// BridgeClient — superseded-socket isolation
// =============================================================================
// Every connect() attempt builds its own WebSocket and parks it on the client.
// A refused attempt rejects on `error` but the socket keeps living until its
// `close` arrives, so a retry can replace it in between — and the replaced
// socket's late events must not touch the connection that replaced it.
//
// Reachable only since the SvelteKit platform started retrying connect() inside
// one request window; before that a request made a single attempt and overlap
// was rare.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { BridgeClient } from '../../../src/bridge/client'

// -----------------------------------------------------------------------------
// Fake WebSocket — inert until a test drives open/fail/close, so the interleaving
// of a refused attempt and its replacement can be staged exactly.
// -----------------------------------------------------------------------------

class FakeWebSocket {
	static instances: FakeWebSocket[] = []

	url: string
	binaryType: 'arraybuffer' | 'blob' = 'blob'
	readyState = 0
	closed = false

	onopen: ((ev?: unknown) => void) | null = null
	onerror: ((ev?: unknown) => void) | null = null
	onclose: ((ev?: unknown) => void) | null = null
	onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null = null

	constructor(url: string) {
		this.url = url
		FakeWebSocket.instances.push(this)
	}

	send(): void {
		// The codec writes a hello frame on open; no test needs to observe it.
	}

	close(): void {
		if (this.closed) return
		this.closed = true
		this.readyState = 3
		this.onclose?.({ code: 1006, reason: '' })
	}

	/** Complete the upgrade. */
	open(): void {
		this.readyState = 1
		this.onopen?.()
	}

	/** Refuse the connection: `error` first, `close` later — the real event order. */
	error(): void {
		this.onerror?.({ error: new Error('refused') })
	}
}

let originalWebSocket: typeof globalThis.WebSocket

beforeEach(() => {
	originalWebSocket = globalThis.WebSocket
	;(globalThis as unknown as { WebSocket: unknown }).WebSocket =
		FakeWebSocket as unknown as typeof WebSocket
	FakeWebSocket.instances = []
})

afterEach(() => {
	;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
})

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Start a connect attempt whose rejection is pre-absorbed, and hand back its socket. */
function beginAttempt(client: BridgeClient): FakeWebSocket {
	client.connect().catch(() => {
		/* the test drives the failure deliberately */
	})
	const socket = FakeWebSocket.instances.at(-1)
	if (!socket) throw new Error('connect() did not construct a WebSocket')
	return socket
}

/**
 * Stage the interleaving that the retry loop produces: a refused socket that has
 * rejected but not yet closed, replaced by a second attempt that connects.
 */
function stageSupersededSocket(client: BridgeClient): {
	superseded: FakeWebSocket
	live: FakeWebSocket
} {
	const superseded = beginAttempt(client)
	superseded.error()

	const live = beginAttempt(client)
	live.open()

	return { superseded, live }
}

// -----------------------------------------------------------------------------

describe('BridgeClient superseded socket isolation', () => {
	test('a late close from a superseded socket leaves the live connection up', () => {
		const client = new BridgeClient({ url: 'ws://localhost:1', autoReconnect: false })

		const { superseded, live } = stageSupersededSocket(client)
		expect(client.connected).toBe(true)
		expect(live.closed).toBe(false)

		// The refused socket's close lands after the retry already succeeded.
		superseded.close()

		expect(client.connected).toBe(true)
		expect(live.closed).toBe(false)
		client.disconnect()
	})

	test('a late open from a superseded socket does not replace the live connection', () => {
		const client = new BridgeClient({ url: 'ws://localhost:1', autoReconnect: false })

		const { superseded } = stageSupersededSocket(client)

		// A socket that errored but completes its upgrade anyway must be dropped,
		// not installed over the codec that is already serving requests.
		superseded.open()

		expect(client.connected).toBe(true)
		expect(superseded.closed).toBe(true)
		client.disconnect()
	})

	test('a superseded socket closing does not trigger a reconnect', async () => {
		const client = new BridgeClient({
			url: 'ws://localhost:1',
			autoReconnect: true,
			reconnectDelay: 10
		})

		const { superseded } = stageSupersededSocket(client)
		const socketsBefore = FakeWebSocket.instances.length

		superseded.close()
		await sleep(30)

		// The connection is healthy, so nothing should have gone looking for a new one.
		expect(client.connected).toBe(true)
		expect(FakeWebSocket.instances.length).toBe(socketsBefore)
		client.disconnect()
	})

	test('a burst of refused attempts whose closes land late converges on a single reconnect chain', async () => {
		const client = new BridgeClient({
			url: 'ws://localhost:1',
			autoReconnect: true,
			reconnectDelay: 15
		})

		// What the retry loop produces while the bridge is down: each socket rejects on
		// `error`, its replacement starts, and only THEN does the old one close — so every
		// close but the last arrives against a socket that is no longer current.
		const refused: FakeWebSocket[] = []
		for (let attempt = 0; attempt < 5; attempt++) {
			const socket = beginAttempt(client)
			socket.error()
			refused.push(socket)
		}
		expect(FakeWebSocket.instances.length).toBe(5)
		for (const socket of refused) socket.close()

		await sleep(45)

		// Only the last socket was current when it closed, so exactly one chain started.
		expect(FakeWebSocket.instances.length).toBe(6)
		client.disconnect()
	})
})
