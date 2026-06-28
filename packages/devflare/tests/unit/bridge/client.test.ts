// =============================================================================
// BridgeClient — createWsProxy await + disconnect cleanup tests
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { BridgeClient } from '../../../src/bridge/client'
import { stringifyJsonMsg } from '../../../src/bridge/v2/wire'

// -----------------------------------------------------------------------------
// Fake WebSocket used as a replacement for the global WebSocket constructor.
// -----------------------------------------------------------------------------

interface Sent {
	data: string | ArrayBuffer | ArrayBufferView
}

class FakeWebSocket {
	static instances: FakeWebSocket[] = []

	url: string
	binaryType: 'arraybuffer' | 'blob' = 'blob'
	readyState = 0
	sent: Sent[] = []

	onopen: ((ev?: unknown) => void) | null = null
	onerror: ((ev?: unknown) => void) | null = null
	onclose: ((ev?: unknown) => void) | null = null
	onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null = null

	constructor(url: string) {
		this.url = url
		FakeWebSocket.instances.push(this)
	}

	send(data: string | ArrayBuffer | ArrayBufferView): void {
		this.sent.push({ data })
	}

	close(): void {
		this.readyState = 3
		this.onclose?.()
	}

	// Test helpers
	open(): void {
		this.readyState = 1
		this.onopen?.()
	}

	emitJson(msg: unknown): void {
		this.onmessage?.({ data: stringifyJsonMsg(msg as never) })
	}

	emitRaw(data: string): void {
		this.onmessage?.({ data })
	}
}

let originalWebSocket: typeof globalThis.WebSocket

beforeEach(() => {
	originalWebSocket = globalThis.WebSocket
		; (globalThis as unknown as { WebSocket: unknown }).WebSocket =
			FakeWebSocket as unknown as typeof WebSocket
	FakeWebSocket.instances = []
})

afterEach(() => {
	; (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
		originalWebSocket
})

function lastSentJson(ws: FakeWebSocket): Record<string, unknown> {
	const last = ws.sent[ws.sent.length - 1]
	if (typeof last.data !== 'string') throw new Error('expected string frame')
	return JSON.parse(last.data)
}

// -----------------------------------------------------------------------------
// createWsProxy — awaits ws.opened
// -----------------------------------------------------------------------------

describe('BridgeClient.createWsProxy', () => {
	test('does not resolve until ws.opened arrives', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		let resolved = false
		const proxyPromise = client
			.createWsProxy('MY_DO', 'abc', 'ws://do/chat', [])
			.then((proxy) => {
				resolved = true
				return proxy
			})

		// Yield a few microtasks/macrotasks; the promise must still be pending
		await new Promise((r) => setTimeout(r, 10))
		expect(resolved).toBe(false)

		// The client should have sent a ws.open message with a wid
		const openMsg = ws.sent
			.map((s) => (typeof s.data === 'string' ? JSON.parse(s.data) : null))
			.find((m) => m && m.t === 'ws.open')
		expect(openMsg).toBeTruthy()
		const wid = openMsg.wid as number

		// Emit the ws.opened reply
		ws.emitJson({ t: 'ws.opened', wid })

		const proxy = await proxyPromise
		expect(resolved).toBe(true)
		expect(proxy.wid).toBe(wid)

		client.disconnect()
	})

	test('rejects the pending open when the client disconnects', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const proxyPromise = client.createWsProxy('MY_DO', 'abc', 'ws://do/chat', [])

		// Flush microtasks so the ws.open send occurs
		await Promise.resolve()

		client.disconnect()

		await expect(proxyPromise).rejects.toThrow(/disconnected/i)
	})
})

// -----------------------------------------------------------------------------
// disconnect cleanup — pending RPCs and streams
// -----------------------------------------------------------------------------

describe('BridgeClient.disconnect cleanup', () => {
	test('rejects pending RPC calls with a clear error', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const callPromise = client.call('MY_KV.get', ['k'])
		// Allow call() to finish serialization and register the pending entry
		await new Promise((r) => setTimeout(r, 5))

		client.disconnect()

		await expect(callPromise).rejects.toThrow(/disconnected/i)
	})

	test('close() is an alias for disconnect()', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const callPromise = client.call('MY_KV.get', ['k'])
		await new Promise((r) => setTimeout(r, 5))

		client.close()

		await expect(callPromise).rejects.toThrow(/disconnected/i)
		expect(client.connected).toBe(false)
	})

	test('errors active readable streams on disconnect', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const stream = client.createReadableStream(42)
		const reader = stream.getReader()
		// Trigger pull so activeStreams registration is fully realized
		const readPromise = reader.read()

		// Give the pull a tick to register, then disconnect
		await new Promise((r) => setTimeout(r, 5))
		client.disconnect()

		await expect(readPromise).rejects.toThrow(/disconnected/i)
	})
})

// -----------------------------------------------------------------------------
// Parse error routing
// -----------------------------------------------------------------------------

describe('BridgeClient parse errors', () => {
	test('logs malformed JSON frames via console.error', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const spy = mock(() => { })
		const originalError = console.error
		console.error = spy as unknown as typeof console.error

		try {
			ws.emitRaw('{not json')
			expect(spy).toHaveBeenCalled()
			const first = spy.mock.calls[0] as unknown[]
			expect(String(first[0])).toContain('[devflare bridge client] parse error:')
		} finally {
			console.error = originalError
			client.disconnect()
		}
	})
})

// -----------------------------------------------------------------------------
// Event subscriptions (B3)
// -----------------------------------------------------------------------------

describe('BridgeClient.on event subscriptions', () => {
	test('delivers event frames to topic subscribers', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const received: unknown[] = []
		client.on('thing', (data) => received.push(data))

		ws.emitJson({ t: 'event', topic: 'thing', data: { n: 1 } })
		ws.emitJson({ t: 'event', topic: 'other', data: { n: 2 } })

		expect(received).toEqual([{ n: 1 }])
		client.disconnect()
	})

	test('delivers to wildcard subscribers and supports unsubscribe', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const all: Array<{ topic: unknown }> = []
		const off = client.on('*', (data) => all.push(data as { topic: unknown }))

		ws.emitJson({ t: 'event', topic: 'a', data: { topic: 'a' } })
		ws.emitJson({ t: 'event', topic: 'b', data: { topic: 'b' } })
		expect(all.length).toBe(2)

		off()
		ws.emitJson({ t: 'event', topic: 'c', data: { topic: 'c' } })
		expect(all.length).toBe(2)
		client.disconnect()
	})

	test('a throwing listener does not block sibling listeners', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const sibling: unknown[] = []
		client.on('topic', () => { throw new Error('boom') })
		client.on('topic', (data) => sibling.push(data))

		const warnSpy = mock(() => {})
		const originalWarn = console.warn
		console.warn = warnSpy as unknown as typeof console.warn
		try {
			ws.emitJson({ t: 'event', topic: 'topic', data: 42 })
			expect(sibling).toEqual([42])
		} finally {
			console.warn = originalWarn
			client.disconnect()
		}
	})

	test('subscriptions are cleared on explicit disconnect', async () => {
		const client = new BridgeClient({ autoReconnect: false })
		const connectPromise = client.connect()
		const ws = FakeWebSocket.instances[0]
		ws.open()
		await connectPromise

		const received: unknown[] = []
		client.on('thing', (data) => received.push(data))
		client.disconnect()

		// Reconnect with a fresh socket; the old listener must be gone.
		const reconnectClient = client
		const again = reconnectClient.connect()
		const ws2 = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
		ws2.open()
		await again
		ws2.emitJson({ t: 'event', topic: 'thing', data: 'x' })
		expect(received).toEqual([])
		reconnectClient.disconnect()
	})
})
