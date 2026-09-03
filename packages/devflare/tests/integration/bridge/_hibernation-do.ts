// =============================================================================
// Shared fixture — DO WebSocket-hibernation cross-socket broadcast suite
// =============================================================================
// Non-test helper (no `.test.` in the name, like `_fixtures.ts`) shared by the
// two hibernation integration tests so the `devflare dev` gateway and the
// `devflare/test` gateway are proven with the SAME Durable Object and the SAME
// assertions. They are split into separate files (one Miniflare instance each)
// because disposing two Miniflare instances in one file trips a Windows workerd
// teardown EBADF — every other bridge integration test runs exactly one.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { BridgeClient } from '../../../src/bridge/client'
import { createEnvProxy, setBindingHints } from '../../../src/bridge/proxy'

/** Top-level import hoisted above whichever gateway script embeds the DO body. */
export const DOC_ROOM_IMPORT = `import { DurableObject } from 'cloudflare:workers'`

/**
 * A hibernation-API Durable Object mirroring ui-dreamer's DocRoom: it accepts
 * the SERVER socket via ctx.acceptWebSocket (so the runtime dispatches
 * webSocketMessage/webSocketClose by name), tags each socket with a stable key
 * via serializeAttachment (so webSocketClose can announce which one left), fans
 * a BINARY presence frame out to every OTHER open socket, and tells the others
 * when a socket closes. `wsCount()` is an RPC probe for how many sockets this
 * instance currently owns.
 */
export const DOC_ROOM_BODY = `
export class DocRoom extends DurableObject {
	fetch(request) {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('expected a websocket upgrade', { status: 426 })
		}
		// Capture any forwarded app auth header so a probe can assert it reached
		// the DO through the pass-through upgrade (tests the ws-package/header path).
		this._lastAuth = request.headers.get('authorization')
		const pair = new WebSocketPair()
		this.ctx.acceptWebSocket(pair[1])
		// Tag this hibernatable socket with a stable presence key so the leave
		// broadcast (webSocketClose) can name it. Survives hibernation.
		pair[1].serializeAttachment('sock-' + this.ctx.getWebSockets().length)
		return new Response(null, { status: 101, webSocket: pair[0] })
	}

	lastAuth() {
		return this._lastAuth ?? null
	}

	webSocketMessage(sender, message) {
		// Fan a presence frame out to every OTHER open socket on this instance.
		for (const ws of this.ctx.getWebSockets()) {
			if (ws !== sender && ws.readyState === WebSocket.OPEN) ws.send(message)
		}
	}

	webSocketClose(ws) {
		const key = ws.deserializeAttachment()
		if (typeof key !== 'string') return
		const leave = JSON.stringify({ leave: key })
		for (const other of this.ctx.getWebSockets()) {
			if (other !== ws && other.readyState === WebSocket.OPEN) other.send(leave)
		}
	}

	wsCount() {
		return this.ctx.getWebSockets().length
	}
}
`

interface Socket {
	readable: ReadableStream<Uint8Array>
	writable: WritableStream<Uint8Array>
	close(): Promise<void>
}

type WsStub = {
	connect(url: string, options?: { headers?: HeadersInit }): Promise<Socket>
	wsCount(): Promise<number>
	lastAuth(): Promise<string | null>
}
type WsNamespace = { getByName(name: string): WsStub }

/**
 * Read one chunk from a socket reader, failing (not hanging) if nothing arrives
 * within `ms`. The reported symptom is "the other socket never receives", which
 * would otherwise hang the test forever; this turns it into a clean assertion
 * failure.
 *
 * @param reader - The DO socket's readable-stream reader.
 * @param ms - Timeout budget in milliseconds.
 * @param label - Human label for the awaited frame, used in the timeout error.
 * @returns The received chunk bytes.
 * @throws When nothing arrives within `ms`, or the stream ends first.
 */
async function readWithTimeout(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	ms: number,
	label: string
): Promise<Uint8Array> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`timeout (${ms}ms) waiting for ${label}`)), ms)
	})
	try {
		const result = await Promise.race([reader.read(), timeout])
		if (result.done || !result.value) throw new Error(`stream ended before ${label}`)
		return result.value
	} finally {
		if (timer) clearTimeout(timer)
	}
}

/**
 * Run the cross-socket broadcast + leave suite against one gateway script. Both
 * the `devflare dev` and `devflare/test` gateways must pass identically — the
 * bug manifested differently on each (dropped broadcast vs. hung connect), but
 * the fix (real /_devflare/do-ws pass-through) is shared through the same client
 * connect() path.
 *
 * @param label - Suite label naming which gateway is under test.
 * @param script - The full Miniflare module script (DO + gateway).
 * @param port - The port this suite's Miniflare instance listens on.
 */
export function runHibernationSuite(label: string, script: string, port: number): void {
	describe(`DO WebSocket-hibernation cross-socket broadcast — ${label}`, () => {
		let miniflare: Miniflare
		let client: BridgeClient
		let env: Record<string, unknown>

		beforeAll(async () => {
			const { Miniflare } = await import('miniflare')

			miniflare = new Miniflare({
				modules: true,
				script,
				// A recent compatibility date is required for native Durable Object
				// RPC (the wsCount() probe) and the hibernation WebSocket API.
				compatibilityDate: '2026-04-28',
				durableObjects: { DOC_ROOM: 'DocRoom' },
				port
			})
			await miniflare.ready

			client = new BridgeClient({ url: `ws://127.0.0.1:${port}` })
			await client.connect()

			setBindingHints({ DOC_ROOM: 'do' })
			env = createEnvProxy({ client })
		})

		afterAll(async () => {
			await client.disconnect()
			await miniflare.dispose()
		})

		test('two sockets to one getByName share ONE instance and broadcast across each other', async () => {
			const room = (env.DOC_ROOM as WsNamespace).getByName('doc-broadcast')

			const sockA = await room.connect('https://do/subscribe', {
				headers: { Upgrade: 'websocket' }
			})
			const sockB = await room.connect('https://do/subscribe', {
				headers: { Upgrade: 'websocket' }
			})

			const writerA = sockA.writable.getWriter()
			const readerB = sockB.readable.getReader()

			// EVIDENCE: both connections landed on ONE DO instance, so
			// getWebSockets() must report 2. Hypothesis 1 (each connect routed to a
			// different instance) would leave this at 1 and the broadcast could
			// never cross.
			expect(await room.wsCount()).toBe(2)

			// The core symptom: a BINARY presence frame from socket A must reach
			// socket B via the DO's ctx.getWebSockets() broadcast in
			// webSocketMessage().
			await writerA.write(new Uint8Array([9, 8, 7, 255]))
			const broadcast = await readWithTimeout(readerB, 3000, 'binary broadcast on socket B')
			expect([...broadcast]).toEqual([9, 8, 7, 255])

			writerA.releaseLock()
			readerB.releaseLock()
			await sockA.close()
			await sockB.close()
		})

		test('closing socket A delivers the {leave} control frame to socket B', async () => {
			const room = (env.DOC_ROOM as WsNamespace).getByName('doc-leave')

			const sockA = await room.connect('https://do/subscribe', {
				headers: { Upgrade: 'websocket' }
			})
			const sockB = await room.connect('https://do/subscribe', {
				headers: { Upgrade: 'websocket' }
			})

			const readerB = sockB.readable.getReader()

			// socket A connected first, so the DO tagged it 'sock-1'.
			expect(await room.wsCount()).toBe(2)

			// Close socket A. The DO's webSocketClose(ws) reads A's attachment and
			// broadcasts `{ leave: 'sock-1' }` to the remaining sockets (socket B).
			await sockA.close()

			const leaveFrame = await readWithTimeout(readerB, 3000, '{leave} frame on socket B')
			expect(JSON.parse(new TextDecoder().decode(leaveFrame))).toEqual({ leave: 'sock-1' })

			readerB.releaseLock()
			await sockB.close()
		})

		test('forwards a custom upgrade header (auth) through to the DO fetch', async () => {
			const room = (env.DOC_ROOM as WsNamespace).getByName('doc-auth')

			// A non-control header exercises the ws-package/header-forwarding path
			// (WS-control headers like Upgrade are stripped, so those never do).
			const sock = await room.connect('https://do/subscribe', {
				headers: { Authorization: 'Bearer secret-xyz' }
			})

			// The gateway passed the real upgrade request (headers included) to the
			// DO's fetch(), which captured the Authorization header.
			expect(await room.lastAuth()).toBe('Bearer secret-xyz')

			await sock.close()
		})
	})
}
