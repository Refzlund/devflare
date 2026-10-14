// =============================================================================
// Browser binding relay — closing, in REAL workerd
// =============================================================================
/*
	The binding worker relays CDP between a client worker and Chrome's DevTools
	socket. When one end closes it closes the other, and it used to copy the
	code it was given. The codes workerd REPORTS on every session are reserved:
	1006 (TCP gone without a Close frame) when Chrome exits, 1005 (a Close
	frame with no status) when @cloudflare/puppeteer disconnects with a bare
	`ws.close()`. workerd refuses to SEND either, so the copy threw, the relay
	logged `Failed to close socket: Invalid WebSocket close code: 1006.` and
	the other end stayed open. A client with a command in flight then waited
	out puppeteer's protocolTimeout: 180 seconds for a `browser.close()`.

	The unit tests could not see it: their socket double accepted every code.
	These run the generated script in workerd itself, against a stand-in shim
	and a stand-in Chrome that can end a session each way a peer can.

	→ KEY: the client here is a worker reached over a service binding, exactly
	  as @cloudflare/puppeteer reaches env.BROWSER. A command whose socket closes
	  before its reply is a command puppeteer REJECTS (CallbackRegistry.clear),
	  which is the outcome `rejected` below; one that neither replies nor closes
	  is the 180-second hang, which is `hung`.
*/

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Miniflare } from 'miniflare'
import { getBrowserBindingScript } from '../../../src/browser-shim/binding-worker'
import { toMiniflareOptions } from '../../../src/utils/miniflare-options'
import {
	type RawWebSocketPeer,
	type RawWebSocketServer,
	startRawWebSocketServer
} from '../../helpers/raw-websocket-server'
import { workerdCloseRefusal } from '../../helpers/workerd-websocket-close'

/** How long the client waits on a command before calling it hung. */
const HANG_MS = 3000

/**
 * The bar for "promptly". A relay that closes the other end does so in a few
 * milliseconds; one that does not never does, so the gap is not subtle.
 */
const PROMPT_MS = 1000

/** uidini's compatibility date; the reason-length rule below needs a recent one. */
const COMPATIBILITY_DATE = '2026-06-28'

/**
 * How the stand-in Chrome ends a session when it receives a command — the four
 * shapes a peer's exit can take, plus one that never closes on its own. A real
 * Chrome was seen to drop its socket (1006) or close with 1000; the no-status
 * shapes are what @cloudflare/puppeteer's own disconnect looks like, and a
 * relay must survive them from either end.
 */
type ChromeExit =
	/** Reply, then a Close frame carrying no status: workerd reports 1005. */
	| 'reply-then-no-status'
	/** A Close frame with no status and no reply. */
	| 'no-status'
	/** Reply, then drop TCP without a Close frame: workerd reports 1006. */
	| 'reply-then-drop'
	/** Drop TCP with the command unanswered — the hang uidini saw. */
	| 'drop'
	/** Never close; the client is the one that leaves. */
	| 'stay-open'

/** What the stand-in Chrome observed of one session. */
interface ChromeSide {
	/** The close code the relay sent Chrome, once it closed Chrome's end. */
	closedWith?: number
	/** When the relay closed Chrome's end, in ms since the socket opened. */
	closedAfterMs?: number
}

/** What the client worker reports for one command. */
interface ClientOutcome {
	outcome: 'replied' | 'rejected' | 'hung'
	/** The close code the client saw, when its socket closed. */
	closeCode?: number
	/** Time from sending the command to the outcome. */
	ms: number
}

/** The client: the smallest CDP caller that behaves like puppeteer's Connection. */
const CLIENT_SCRIPT = `
const HANG_MS = ${HANG_MS}
export default {
	async fetch(request, env) {
		const url = new URL(request.url)
		const exit = url.searchParams.get('exit')
		const response = await env.BROWSER.fetch('https://fake.host/v1/devtools/browser/' + exit, {
			headers: { Upgrade: 'websocket' }
		})
		const ws = response.webSocket
		if (!ws) return Response.json({ error: 'no websocket', status: response.status }, { status: 502 })
		ws.accept()

		// @cloudflare/puppeteer's transport.close() is a bare ws.close(): no status.
		if (url.searchParams.get('action') === 'hang-up') {
			ws.close()
			return Response.json({ hungUp: true })
		}

		const started = Date.now()
		const outcome = await new Promise((resolve) => {
			let replied = false
			const deadline = setTimeout(() => resolve({ outcome: 'hung', ms: Date.now() - started }), HANG_MS)
			ws.addEventListener('message', () => { replied = true })
			ws.addEventListener('close', (event) => {
				clearTimeout(deadline)
				resolve({ outcome: replied ? 'replied' : 'rejected', closeCode: event.code, ms: Date.now() - started })
			})
			ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
		})
		return Response.json(outcome)
	}
}`

/**
 * A probe worker that asks real workerd which close() calls it refuses, so the
 * unit-test double's model of that rule is checked against the runtime.
 */
const PROBE_SCRIPT = `
export default {
	async fetch(request) {
		const cases = await request.json()
		const results = cases.map(([code, reason]) => {
			const { 0: client, 1: server } = new WebSocketPair()
			server.accept()
			client.accept()
			try {
				if (code === null) server.close()
				else server.close(code, reason)
				return null
			} catch (error) {
				return error.message
			}
		})
		return Response.json(results)
	}
}`

describe('browser binding relay closing, in real workerd', () => {
	let miniflare: Miniflare
	let server: Server
	let chromeServer: RawWebSocketServer
	let baseUrl: URL
	const workerdLogs: string[] = []
	const chromeSides = new Map<ChromeExit, ChromeSide>()

	beforeAll(async () => {
		// Chrome's DevTools port is its own listener, apart from the shim's.
		chromeServer = await startRawWebSocketServer((chrome) => {
			behaveLikeChrome(chrome.path.split('/').pop() as ChromeExit, chrome)
		})

		server = createServer((request, response) => serveShim(request, response))
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
		const shimUrl = `http://127.0.0.1:${portOf(server.address())}`

		const miniflareModule = await import('miniflare')
		miniflare = new miniflareModule.Miniflare(
			await toMiniflareOptions(miniflareModule, {
				handleStructuredLogs: ({ level, message }: { level: string; message: string }) => {
					workerdLogs.push(`${level}: ${message}`)
				},
				workers: [
					{
						name: 'client',
						modules: true,
						script: CLIENT_SCRIPT,
						compatibilityDate: COMPATIBILITY_DATE,
						compatibilityFlags: ['nodejs_compat'],
						serviceBindings: { BROWSER: 'browser-binding' }
					},
					{
						name: 'browser-binding',
						modules: true,
						script: getBrowserBindingScript(shimUrl),
						compatibilityDate: COMPATIBILITY_DATE,
						compatibilityFlags: ['nodejs_compat']
					}
				]
			})
		)
		baseUrl = await miniflare.ready

		/** The shim's two routes the relay calls: the attaching lookup, and release. */
		function serveShim(request: IncomingMessage, response: ServerResponse) {
			const url = new URL(request.url ?? '/', shimUrl)
			const [, , , sessionId, release] = url.pathname.split('/')
			response.setHeader('Content-Type', 'application/json')
			if (release === 'release') {
				response.end(JSON.stringify({ released: true }))
				return
			}
			response.end(
				JSON.stringify({
					sessionId,
					wsEndpoint: `${chromeServer.url}/devtools/browser/${sessionId}`,
					connectionId: `connection-${sessionId}`
				})
			)
		}

		/** End the session the way `exit` says, once a command arrives. */
		function behaveLikeChrome(exit: ChromeExit, chrome: RawWebSocketPeer) {
			const side: ChromeSide = {}
			const opened = Date.now()
			chromeSides.set(exit, side)
			chrome.onClose((code) => {
				side.closedWith = code
				side.closedAfterMs = Date.now() - opened
			})
			chrome.onText(async (text) => {
				const { id } = JSON.parse(text) as { id: number }
				const reply = JSON.stringify({ id, result: {} })
				if (exit === 'reply-then-no-status' || exit === 'reply-then-drop')
					await chrome.sendText(reply)
				if (exit === 'reply-then-no-status' || exit === 'no-status') chrome.closeWithoutStatus()
				if (exit === 'reply-then-drop' || exit === 'drop') chrome.drop()
			})
		}
	})

	afterAll(async () => {
		await miniflare?.dispose()
		await chromeServer?.close()
		await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
	})

	/** The port a listening server was given. */
	function portOf(address: ReturnType<Server['address']>): number {
		if (!address || typeof address === 'string') throw new Error(`not a TCP listener: ${address}`)
		return address.port
	}

	async function sendCommand(exit: ChromeExit): Promise<ClientOutcome> {
		const response = await miniflare.dispatchFetch(new URL(`/?exit=${exit}`, baseUrl).href)
		return (await response.json()) as ClientOutcome
	}

	/** Wait until the stand-in Chrome has been closed, or the budget runs out. */
	async function chromeClosed(exit: ChromeExit, budgetMs: number): Promise<ChromeSide | undefined> {
		const deadline = Date.now() + budgetMs
		while (Date.now() < deadline) {
			const side = chromeSides.get(exit)
			if (side?.closedWith !== undefined) return side
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		return chromeSides.get(exit)
	}

	// The uidini hang, deterministically. Chrome exits mid-`Browser.close`
	// before its reply flushes; workerd reports 1006 for the dropped socket.
	//
	// → MUTANT: restore the pre-fix closeSocket() in binding-worker.ts — the
	//   peer's code handed straight to close(), and no uncoded fallback.
	//   workerd refuses 1006, the client is never closed, and this reads `hung`
	//   after 3 seconds. Remove only the relayedClose() mapping and the fallback
	//   still closes the client, but with no code: 1005 here, not 1011.
	test('a Chrome that drops with a command in flight fails that command at once', async () => {
		const result = await sendCommand('drop')

		expect(result.outcome).toBe('rejected')
		expect(result.ms).toBeLessThan(PROMPT_MS)
		// 1006 cannot be sent; the relay says "the other end failed" instead.
		expect(result.closeCode).toBe(1011)
	})

	test('a Chrome that closes without a status fails the pending command at once', async () => {
		const result = await sendCommand('no-status')

		expect(result.outcome).toBe('rejected')
		expect(result.ms).toBeLessThan(PROMPT_MS)
		// Relayed as what it was: a close carrying no status, which the client
		// in turn reports as 1005.
		expect(result.closeCode).toBe(1005)
	})

	// The common ending, and where the error line came from on EVERY session:
	// the reply arrives, but the close behind it still has to reach the client.
	test('a Chrome that replies and then exits still closes the client', async () => {
		const noStatus = await sendCommand('reply-then-no-status')
		const dropped = await sendCommand('reply-then-drop')

		expect(noStatus).toMatchObject({ outcome: 'replied', closeCode: 1005 })
		expect(noStatus.ms).toBeLessThan(PROMPT_MS)
		expect(dropped).toMatchObject({ outcome: 'replied', closeCode: 1011 })
		expect(dropped.ms).toBeLessThan(PROMPT_MS)
	})

	// The other direction. @cloudflare/puppeteer's disconnect() is a bare
	// ws.close(), so every session ends with the relay holding a 1005 it used
	// to copy onto Chrome's socket — and fail to.
	//
	// → MUTANT: the pre-fix closeSocket() again. The relay's own close of
	//   Chrome's end throws on 1005, and Chrome's end is closed only afterwards,
	//   as 1011, by the 'error' event workerd fires behind the client's close —
	//   so closedWith reads 1011. That event is also why this direction never
	//   hung: the defect showed only as the error line.
	test("a client that hangs up without a status closes Chrome's end", async () => {
		await miniflare.dispatchFetch(new URL('/?exit=stay-open&action=hang-up', baseUrl).href)
		const chrome = await chromeClosed('stay-open', PROMPT_MS)

		expect(chrome?.closedWith).toBe(1005)
		expect(chrome?.closedAfterMs).toBeLessThan(PROMPT_MS)
	})

	// The error line is what the developer saw: one per session, in their own
	// dev log, for a relay that was in fact the thing at fault.
	test('no session prints a close failure', async () => {
		// Structured logs reach the host asynchronously; give the last ones time.
		await new Promise((resolve) => setTimeout(resolve, 200))

		expect(workerdLogs.filter((line) => line.includes('Failed to close socket'))).toEqual([])
		expect(workerdLogs.filter((line) => line.startsWith('error:'))).toEqual([])
	})
})

describe("workerd's close() rule, against the unit-test double's model of it", () => {
	// The binding worker's unit tests drive a socket double that enforces
	// workerdCloseRefusal(). That double is only as good as its model, so the
	// model is graded here against the runtime it stands in for.
	//
	// → MUTANT: drop 1005 from RESERVED_CLOSE_CODES in
	//   tests/helpers/workerd-websocket-close.ts. The model then accepts a code
	//   workerd refuses and this test names it.
	test('refuses exactly the codes and reasons the double refuses', async () => {
		const codes = [
			0, 999, 1000, 1001, 1003, 1004, 1005, 1006, 1007, 1011, 1014, 1015, 1016, 2999, 3000, 4999,
			5000
		]
		const cases: [number | null, string][] = [
			[null, ''],
			...codes.map((code): [number, string] => [code, 'r']),
			[1000, 'x'.repeat(123)],
			[1000, 'x'.repeat(124)],
			// 41 three-byte characters: 123 bytes, then 126
			[1000, '€'.repeat(41)],
			[1000, '€'.repeat(42)]
		]

		const miniflareModule = await import('miniflare')
		const probe = new miniflareModule.Miniflare(
			await toMiniflareOptions(miniflareModule, {
				modules: true,
				script: PROBE_SCRIPT,
				compatibilityDate: COMPATIBILITY_DATE
			})
		)
		try {
			const response = await probe.dispatchFetch(new URL('/', await probe.ready).href, {
				method: 'POST',
				body: JSON.stringify(cases)
			})
			const workerd = (await response.json()) as (string | null)[]
			const model = cases.map(([code, reason]) =>
				workerdCloseRefusal(code ?? undefined, code === null ? undefined : reason)
			)

			expect(workerd).toEqual(model)
		} finally {
			await probe.dispose()
		}
	})
})
