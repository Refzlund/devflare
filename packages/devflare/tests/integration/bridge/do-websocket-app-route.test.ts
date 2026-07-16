// =============================================================================
// DO WebSocket via an App-Worker Route (the consumer's real path)
// =============================================================================
// Reproduces ui-dreamer's ACTUAL path (distinct from the programmatic connect()
// path). In worker mode `devflare dev` runs the gateway as the entry worker
// (routes: ['*']) with the app (SvelteKit) worker as a service binding. A browser
// opens `new WebSocket('/api/doc/:id/subscribe')`; the app route handler does
// `return stub.fetch(clientUpgradeRequest)` and returns the DO's 101 (with the
// DO's client socket). Two tabs do this to the same getByName(id); each sends a
// BINARY presence frame that the DO must fan out to the other.
//
// Before the fix, the gateway hijacked EVERY unmatched WS upgrade into the
// in-worker bridge RPC socket (handleBridgeWebSocket), so the app route never ran
// — the WS upgraded (101) but presence never crossed tabs and a 2nd concurrent
// connection could not share the DO. The gateway now forwards the upgrade to the
// app worker and passes its 101 through, so both connections reach one DO
// instance and hibernation broadcasts work. This mirrors the multi-worker
// topology built by buildMiniflareDevConfig (gateway + app + do-<binding>).
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { getGatewayScript } from '../../../src/dev-server/gateway-script'

const PORT = 9805
const APP_SERVICE_BINDING = '__DEVFLARE_APP'

// Hibernation DO (ui-dreamer's DocRoom shape): a plain fetch to `/count` reports
// how many sockets this instance owns (the "same instance" probe); every socket
// is tagged so webSocketClose can announce which one left.
const docRoomSource = `
import { DurableObject } from 'cloudflare:workers'
export class DocRoom extends DurableObject {
	fetch(request) {
		if (request.headers.get('Upgrade') === 'websocket') {
			const pair = new WebSocketPair()
			this.ctx.acceptWebSocket(pair[1])
			pair[1].serializeAttachment('sock-' + this.ctx.getWebSockets().length)
			return new Response(null, { status: 101, webSocket: pair[0] })
		}
		if (new URL(request.url).pathname.endsWith('/count')) {
			return new Response(String(this.ctx.getWebSockets().length))
		}
		return new Response('expected a websocket upgrade', { status: 426 })
	}
	webSocketMessage(sender, message) {
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
}
`

// The consumer's SvelteKit-route shape: forward the CLIENT upgrade request to the
// DO and return its 101 verbatim (and forward the /count probe too).
const appWorkerSource = `
export default {
	async fetch(request, env) {
		const url = new URL(request.url)
		const id = url.searchParams.get('id') || 'default'
		const stub = env.DOC_ROOM.get(env.DOC_ROOM.idFromName(id))
		return stub.fetch(request)
	}
}
`

async function importWs(): Promise<new (url: string) => WebSocket> {
	const mod = (await import('ws')) as unknown as { WebSocket?: unknown; default?: unknown }
	return (mod.WebSocket ?? mod.default) as new (
		url: string
	) => WebSocket
}

/**
 * Resolve when the socket opens, or REJECT (not hang) after `ms`. The reported
 * symptom is that a 2nd concurrent connection hangs, so a bounded open turns that
 * into a clean failure.
 */
function openWithTimeout(ws: WebSocket, ms: number, label: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`OPEN TIMEOUT (${ms}ms): ${label}`)), ms)
		ws.addEventListener('open', () => {
			clearTimeout(timer)
			resolve()
		})
		ws.addEventListener('error', () => {
			clearTimeout(timer)
			reject(new Error(`OPEN ERROR: ${label}`))
		})
	})
}

/**
 * Await the next message on a socket, or reject after `ms`. Turns "the other tab
 * never receives" into an assertion failure instead of a hang.
 */
function nextMessage(ws: WebSocket, ms: number, label: string): Promise<Uint8Array | string> {
	return new Promise<Uint8Array | string>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timeout (${ms}ms) waiting for ${label}`)), ms)
		ws.addEventListener('message', (event: MessageEvent) => {
			clearTimeout(timer)
			const data = event.data
			resolve(typeof data === 'string' ? data : new Uint8Array(data as ArrayBuffer))
		})
	})
}

describe('DO WebSocket via an app-worker route (gateway -> app -> stub.fetch)', () => {
	let miniflare: Miniflare

	beforeAll(async () => {
		const { Miniflare } = await import('miniflare')
		const doRef = { className: 'DocRoom', scriptName: 'do-doc_room' }
		miniflare = new Miniflare({
			port: PORT,
			compatibilityDate: '2026-04-28',
			workers: [
				{
					name: 'gateway',
					modules: true,
					// Worker mode: the dev server passes the app service-binding name.
					script: getGatewayScript([], false, APP_SERVICE_BINDING),
					routes: ['*'],
					durableObjects: { DOC_ROOM: doRef },
					serviceBindings: { [APP_SERVICE_BINDING]: { name: 'app' } }
				},
				{
					name: 'app',
					modules: true,
					script: appWorkerSource,
					durableObjects: { DOC_ROOM: doRef }
				},
				{
					name: 'do-doc_room',
					modules: true,
					script: docRoomSource,
					durableObjects: { DOC_ROOM: 'DocRoom' }
				}
			]
		})
		await miniflare.ready
	})

	afterAll(async () => {
		await miniflare.dispose()
	})

	test('two concurrent browser WS to /api/doc/:id/subscribe share ONE DO instance and broadcast', async () => {
		const WS = await importWs()
		const url = `ws://127.0.0.1:${PORT}/api/doc/subscribe?id=room`

		const a = new WS(url)
		const b = new WS(url)
		a.binaryType = 'arraybuffer'
		b.binaryType = 'arraybuffer'

		// Both must connect without hanging (the reported 2nd-tab hang).
		await openWithTimeout(a, 8000, 'client A')
		await openWithTimeout(b, 8000, 'client B (2nd concurrent)')

		// EVIDENCE the two forwarded connections landed on ONE DO instance.
		const countRes = await miniflare.dispatchFetch(`http://127.0.0.1:${PORT}/api/doc/count?id=room`)
		expect(await countRes.text()).toBe('2')

		// The core symptom: a BINARY presence frame from A must reach B via the DO's
		// ctx.getWebSockets() broadcast in webSocketMessage().
		const bGot = nextMessage(b, 3000, 'binary broadcast on client B')
		a.send(new Uint8Array([9, 8, 7, 255]))
		expect([...(await bGot)]).toEqual([9, 8, 7, 255])

		a.close()
		b.close()
	})

	test('closing tab A delivers the {leave} control frame to tab B', async () => {
		const WS = await importWs()
		const url = `ws://127.0.0.1:${PORT}/api/doc/subscribe?id=leave-room`

		const a = new WS(url)
		const b = new WS(url)
		a.binaryType = 'arraybuffer'
		b.binaryType = 'arraybuffer'

		await openWithTimeout(a, 8000, 'client A')
		await openWithTimeout(b, 8000, 'client B')

		// A connected first, so the DO tagged it 'sock-1'.
		const bLeave = nextMessage(b, 3000, '{leave} frame on client B')
		a.close()

		const frame = await bLeave
		expect(JSON.parse(typeof frame === 'string' ? frame : new TextDecoder().decode(frame))).toEqual(
			{
				leave: 'sock-1'
			}
		)

		b.close()
	})
})
