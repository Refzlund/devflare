import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getBrowserBindingScript } from '../../../src/browser-shim/binding-worker'
import { isWireValidCloseCode, workerdCloseRefusal } from '../../helpers/workerd-websocket-close'

// The binding worker is a script string compiled inside workerd, so these
// tests compile it for real and drive its fetch handler with stubbed globals.
// Asserting on the script's text instead would pass on any string that merely
// mentions the right path.

const SHIM_URL = 'http://127.0.0.1:8788'
const SESSION_ID = '0134a3b4-2f1c-4b9a-9a0e-1f2d3c4b5a60'
const CHROME_WS_ENDPOINT = 'ws://127.0.0.1:52123/devtools/browser/9f2b'
const CHROME_UPGRADE_URL = 'http://127.0.0.1:52123/devtools/browser/9f2b'

interface BindingWorker {
	default: { fetch(request: Request, env?: unknown, ctx?: unknown): Promise<Response> }
}

/**
 * A websocket end the worker can accept, send on, and receive events from.
 *
 * → KEY: close() enforces workerd's own rule (workerdCloseRefusal, which the
 *   integration lane checks against real workerd). Its predecessor accepted
 *   any code, so a relay that copied a peer's reserved 1005/1006 onto the
 *   other socket — refused by workerd, which left that socket open — passed
 *   here while hanging every client that had a command in flight.
 */
interface FakeSocket {
	readyState: number
	sent: unknown[]
	/** Every close() the worker asked for that was accepted, in order. */
	closed: { code?: number; reason?: string }[]
	/** Every close() refused, in order — workerd's rule, or `refuse` below. */
	refused: { code?: number; reason?: string }[]
	/**
	 * A refusal on top of workerd's, to stand in for a runtime stricter than
	 * the model: returns the message to throw, or null to defer to workerd's rule.
	 */
	refuse?: (code?: number, reason?: string) => string | null
	accept(): void
	close(code?: number, reason?: string): void
	send(data: unknown): void
	addEventListener(type: string, listener: (event: unknown) => void): void
	/** Deliver an event to the worker's listeners, as workerd would. */
	emit(type: string, event: unknown): void
}

function createFakeSocket(): FakeSocket {
	const listeners = new Map<string, ((event: unknown) => void)[]>()

	const socket: FakeSocket = {
		readyState: 1,
		sent: [],
		closed: [],
		refused: [],
		accept() {},
		close(code, reason) {
			const refusal = socket.refuse?.(code, reason) ?? workerdCloseRefusal(code, reason)
			if (refusal) {
				socket.refused.push({ code, reason })
				throw new TypeError(refusal)
			}
			socket.closed.push({ code, reason })
			socket.readyState = 3 // CLOSED
		},
		send(data) {
			socket.sent.push(data)
		},
		addEventListener(type, listener) {
			listeners.set(type, [...(listeners.get(type) ?? []), listener])
		},
		emit(type, event) {
			for (const listener of listeners.get(type) ?? []) {
				listener(event)
			}
		}
	}

	return socket
}

/** One call the worker made back to the shim, or out to Chrome. */
interface Call {
	url: string
	method: string
	/** Whether the call carried an abort signal, i.e. whether it was bounded. */
	bounded: boolean
}

/** What one drive of the worker's DevTools upgrade produced. */
interface Upgrade {
	response: Response
	/** Every URL the worker fetched, in order. */
	fetched: string[]
	/** The same calls, with the method and whether they were bounded. */
	calls: Call[]
	/** Chrome's end of the relay — what the worker forwarded to the browser. */
	chrome: FakeSocket
	/** The worker's end of the pair — what puppeteer would be talking to. */
	client: FakeSocket
}

/** The connection id the shim hands back when a client attaches. */
const CONNECTION_ID = '7c1f0e5a-9d2b-4c31-8f77-5b0a4d6e2c19'

const SESSION_ATTACH_URL = `${SHIM_URL}/v1/session/${SESSION_ID}?attach=1`

const RELEASE_URL = `${SHIM_URL}/v1/session/${SESSION_ID}/release?connection=${CONNECTION_ID}`

/** Let the worker's fire-and-forget release fetch run. */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

const tempDirs: string[] = []
const realFetch = globalThis.fetch
const realWebSocketPair = (globalThis as Record<string, unknown>).WebSocketPair

afterEach(async () => {
	globalThis.fetch = realFetch
	;(globalThis as Record<string, unknown>).WebSocketPair = realWebSocketPair
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/** Compile the generated binding worker into an importable ES module. */
async function loadBindingWorker(): Promise<BindingWorker> {
	const dir = await mkdtemp(join(tmpdir(), 'devflare-binding-worker-'))
	tempDirs.push(dir)

	const file = join(dir, 'binding-worker.mjs')
	await writeFile(file, getBrowserBindingScript(SHIM_URL))

	return (await import(pathToFileURL(file).href)) as BindingWorker
}

/**
 * Drive a DevTools upgrade through the worker, standing in for the browser
 * shim, for Chrome, and for workerd's `WebSocketPair`.
 */
async function upgrade(
	path: string,
	options: { chromeUpgrade?: 'ok' | 'timeout' | 'no-socket' } = {}
): Promise<Upgrade> {
	const worker = await loadBindingWorker()
	const calls: Call[] = []
	const chrome = createFakeSocket()

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		calls.push({ url, method: init?.method ?? 'GET', bounded: Boolean(init?.signal) })

		if (url.startsWith(`${SHIM_URL}/v1/session/${SESSION_ID}/release`)) {
			return Response.json({ released: true })
		}

		if (url.startsWith(`${SHIM_URL}/v1/session/${SESSION_ID}`)) {
			return Response.json({
				sessionId: SESSION_ID,
				wsEndpoint: CHROME_WS_ENDPOINT,
				connectionId: CONNECTION_ID
			})
		}

		if (url === CHROME_UPGRADE_URL) {
			// A Chrome that never answers the upgrade: the worker's own bound is
			// what ends this, so the stand-in rejects the way an aborted fetch
			// does rather than making the test wait it out.
			if (options.chromeUpgrade === 'timeout') {
				throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
			}

			const response = new Response(null, { status: 101 })
			if (options.chromeUpgrade !== 'no-socket') {
				Object.defineProperty(response, 'webSocket', { value: chrome })
			}
			return response
		}

		return new Response('unexpected fetch', { status: 500 })
	}) as typeof fetch

	let pair: { client: FakeSocket; server: FakeSocket } | null = null
	;(globalThis as Record<string, unknown>).WebSocketPair = function WebSocketPair() {
		pair = { client: createFakeSocket(), server: createFakeSocket() }
		return { 0: pair.client, 1: pair.server }
	}

	const response = await worker.default.fetch(
		new Request(`https://fake.host${path}`, { headers: { Upgrade: 'websocket' } })
	)

	// `client` is the pair end handed back to puppeteer; messages the worker
	// sends to `server` are what puppeteer would read, so the test watches the
	// end the worker writes to.
	return {
		response,
		fetched: calls.map((call) => call.url),
		calls,
		chrome,
		client: pair?.server ?? createFakeSocket()
	}
}

describe('browser binding worker devtools routing', () => {
	// @cloudflare/puppeteer 1.1.0 moved the DevTools endpoint from
	// /v1/connectDevtools?browser_session=X to /v1/devtools/browser/X. Before
	// this was handled the request fell through to the plain HTTP proxy, which
	// forwarded it to the shim as an ordinary request and never opened a relay.
	test('resolves the session from the path >= 1.1.0 connects on', async () => {
		const { response, fetched } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		expect(fetched[0]).toBe(SESSION_ATTACH_URL)
		expect(fetched).toContain(CHROME_UPGRADE_URL)
		expect(response.status).toBe(101)
	})

	test('still resolves the session from the query <= 1.0.7 connects on', async () => {
		const { response, fetched } = await upgrade(`/v1/connectDevtools?browser_session=${SESSION_ID}`)

		expect(fetched[0]).toBe(SESSION_ATTACH_URL)
		expect(response.status).toBe(101)
	})

	test('rejects a devtools path that names no session', async () => {
		const worker = await loadBindingWorker()
		const fetched: string[] = []

		globalThis.fetch = (async (input: RequestInfo | URL) => {
			fetched.push(String(input))
			return new Response('unexpected fetch', { status: 500 })
		}) as typeof fetch

		const response = await worker.default.fetch(
			new Request('https://fake.host/v1/devtools/browser/', {
				headers: { Upgrade: 'websocket' }
			})
		)

		expect(response.status).toBe(400)
		// Answered on the spot: a session-less upgrade is not something to
		// hand on to the shim as an ordinary request.
		expect(fetched).toEqual([])
	})

	test('proxies acquire to the shim untouched', async () => {
		const worker = await loadBindingWorker()
		const fetched: string[] = []

		globalThis.fetch = (async (input: RequestInfo | URL) => {
			fetched.push(String(input))
			return Response.json({ sessionId: SESSION_ID })
		}) as typeof fetch

		const response = await worker.default.fetch(
			new Request('https://fake.host/v1/devtools/browser?keep_alive=30000', { method: 'POST' })
		)

		expect(fetched).toEqual([`${SHIM_URL}/v1/devtools/browser?keep_alive=30000`])
		expect(await response.json()).toEqual({ sessionId: SESSION_ID })
	})
})

describe('browser binding worker CDP framing', () => {
	// The same 1.1.0 release dropped the chunked transport for plain messages,
	// so the DevTools path also says which framing the connected client speaks.
	const cdpRequest = JSON.stringify({ id: 1, method: 'Browser.getVersion' })
	const cdpReply = JSON.stringify({ id: 1, result: { product: 'HeadlessChrome/1.2.3' } })

	test('passes a plain client through unframed, in both directions', async () => {
		const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		client.emit('message', { data: cdpRequest })
		expect(chrome.sent).toEqual([cdpRequest])

		chrome.emit('message', { data: cdpReply })
		expect(client.sent).toEqual([cdpReply])
	})

	test('still chunks for a legacy client, in both directions', async () => {
		const { chrome, client } = await upgrade(`/v1/connectDevtools?browser_session=${SESSION_ID}`)

		// A legacy client sends a 4-byte little-endian length header ahead of
		// the payload; the worker must reassemble before forwarding to Chrome.
		const payload = new TextEncoder().encode(cdpRequest)
		const framed = new Uint8Array(payload.length + 4)
		new DataView(framed.buffer).setUint32(0, payload.length, true)
		framed.set(payload, 4)
		client.emit('message', { data: framed.buffer })
		expect(chrome.sent).toEqual([cdpRequest])

		chrome.emit('message', { data: cdpReply })
		expect(client.sent).toHaveLength(1)

		const chunk = client.sent[0] as Uint8Array
		const reply = new TextEncoder().encode(cdpReply)
		expect(new DataView(chunk.buffer, chunk.byteOffset).getUint32(0, true)).toBe(reply.length)
		expect(new TextDecoder().decode(chunk.subarray(4))).toBe(cdpReply)
	})

	test('drops the legacy keep-alive ping rather than forwarding it to Chrome', async () => {
		const { chrome, client } = await upgrade(`/v1/connectDevtools?browser_session=${SESSION_ID}`)

		client.emit('message', { data: 'ping' })

		expect(chrome.sent).toEqual([])
	})
})

describe('browser binding worker when Chrome has gone', () => {
	// The state the shim's own idle reaper used to manufacture: Chrome is dead
	// while puppeteer's socket is still open. The forward was a bare `return`,
	// so the CDP command went nowhere — no reply, no error frame, no close — and
	// puppeteer's CallbackRegistry held the pending id until its protocolTimeout
	// gave up 180 SECONDS later. `browser.close()` hanging for three minutes was
	// this branch.
	//
	// → MUTANT: in src/browser-shim/binding-worker.ts, make forwardToChrome()
	//   `return false` instead of closing the client. That is the pre-fix
	//   behaviour and this test fails.
	test('closes the client rather than dropping a CDP command into a dead socket', async () => {
		const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		chrome.readyState = 3 // CLOSED
		client.emit('message', { data: JSON.stringify({ id: 1, method: 'Browser.close' }) })

		expect(chrome.sent).toEqual([])
		expect(client.closed).toHaveLength(1)
		expect(client.closed[0]?.code).toBe(1011)
		expect(String(client.closed[0]?.reason)).toContain('not open')
	})

	test('does the same for a legacy client, once its chunks reassemble', async () => {
		const { chrome, client } = await upgrade(`/v1/connectDevtools?browser_session=${SESSION_ID}`)

		chrome.readyState = 3 // CLOSED

		const payload = new TextEncoder().encode(JSON.stringify({ id: 1, method: 'Browser.close' }))
		const framed = new Uint8Array(payload.length + 4)
		new DataView(framed.buffer).setUint32(0, payload.length, true)
		framed.set(payload, 4)
		client.emit('message', { data: framed.buffer })

		expect(chrome.sent).toEqual([])
		expect(client.closed[0]?.code).toBe(1011)
	})

	test('a healthy socket is still forwarded to and never closed', async () => {
		const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		client.emit('message', { data: '{"id":1}' })

		expect(chrome.sent).toEqual(['{"id":1}'])
		expect(client.closed).toEqual([])
	})
})

describe('browser binding worker session lifecycle', () => {
	// The binding worker relays straight to Chrome's own DevTools port, so the
	// shim cannot see this socket at all. Attach and release are the only two
	// things that tell it a client is here — without the attach the shim reaps
	// the session 60 seconds after acquire, mid-render.
	//
	// → MUTANT: drop the `sessionUrl.searchParams.set(SESSION_ATTACH_PARAM, '1')`
	//   line. The lookup stays a pure read, nothing cancels the reaper, and this
	//   test fails.
	test('attaches to the session when it asks the shim for the endpoint', async () => {
		const { calls } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		expect(calls[0]?.url).toBe(SESSION_ATTACH_URL)
		expect(calls[0]?.method).toBe('GET')
	})

	// → MUTANT: drop `releaseOnce()` from the `server` close listener. The
	//   session stays attached with nothing counting against it, and this fails.
	test('releases the session when the client goes away', async () => {
		const { calls, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		client.emit('close', { code: 1000, reason: 'done' })
		await flush()

		expect(calls.map((call) => call.url)).toContain(RELEASE_URL)
		expect(calls.find((call) => call.url === RELEASE_URL)?.method).toBe('POST')
	})

	test('releases the session when Chrome goes away', async () => {
		const { calls, chrome } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		chrome.emit('close', { code: 1006, reason: '' })
		await flush()

		expect(calls.filter((call) => call.url === RELEASE_URL)).toHaveLength(1)
	})

	// Both ends of a relay close on a normal teardown. A second release would
	// name a connection the shim may since have replaced.
	//
	// → MUTANT: delete the `if (released) return` guard in releaseOnce().
	test('releases exactly once however many ends close', async () => {
		const { calls, chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		client.emit('close', { code: 1000, reason: '' })
		chrome.emit('close', { code: 1000, reason: '' })
		client.emit('error', {})
		await flush()

		expect(calls.filter((call) => call.url === RELEASE_URL)).toHaveLength(1)
	})

	// An upgrade that attaches and then fails has pinned a session nothing will
	// ever release.
	test('releases the session when the Chrome upgrade yields no socket', async () => {
		const { response, calls } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`, {
			chromeUpgrade: 'no-socket'
		})
		await flush()

		expect(response.status).toBe(502)
		expect(calls.filter((call) => call.url === RELEASE_URL)).toHaveLength(1)
	})

	// → MUTANT: remove the try/catch around the Chrome upgrade fetch. The
	//   rejection escapes handleDevToolsWebSocket instead of answering 504.
	test('answers 504 rather than propagating a Chrome upgrade that timed out', async () => {
		const { response, calls } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`, {
			chromeUpgrade: 'timeout'
		})
		await flush()

		expect(response.status).toBe(504)
		expect(calls.filter((call) => call.url === RELEASE_URL)).toHaveLength(1)
	})

	// The session lookup was bounded at 5s and the Chrome upgrade beside it was
	// not bounded at all, so a wedged Chrome held the upgrade open for as long
	// as the runtime allowed.
	//
	// → MUTANT: drop the `signal` from fetchBounded()'s init, or call plain
	//   fetch() for the Chrome upgrade.
	test('bounds every call it makes, the Chrome upgrade included', async () => {
		const { calls } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		expect(calls.find((call) => call.url === SESSION_ATTACH_URL)?.bounded).toBe(true)
		expect(calls.find((call) => call.url === CHROME_UPGRADE_URL)?.bounded).toBe(true)
	})
})

describe('browser binding worker closing the other end', () => {
	// Every code a close event can carry, in either direction. A Chrome that
	// exits is reported as 1006 (TCP gone, no Close frame) or 1000;
	// @cloudflare/puppeteer's disconnect is a bare ws.close(), which the relay
	// sees as 1005. The rest are what any peer could send.
	const REPORTED_CODES = [
		undefined,
		0,
		999,
		...Array.from({ length: 17 }, (_, index) => 1000 + index),
		2999,
		3000,
		4999,
		5000
	]

	// The invariant: when either end closes, the other end is closed, with a
	// close workerd accepts and a `ws`-library peer accepts too.
	//
	// → MUTANT: in closeSocket(), use `{ code, reason }` instead of
	//   `relayedClose(code, reason)`. workerd refuses 1004/1005/1006/1015 and
	//   the out-of-range codes, `refused` fills, and this fails — before the
	//   fallback has had a chance to hide it.
	test.each(REPORTED_CODES)(
		'a close reporting %p is relayed as a close both ends accept',
		async (code) => {
			const fromChrome = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)
			fromChrome.chrome.emit('close', { code, reason: 'gone' })

			const fromClient = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)
			fromClient.client.emit('close', { code, reason: 'gone' })

			for (const socket of [fromChrome.client, fromClient.chrome]) {
				expect(socket.refused).toEqual([])
				expect(socket.closed).toHaveLength(1)
				expect(isWireValidCloseCode(socket.closed[0]?.code)).toBe(true)
			}
		}
	)

	// The uidini hang: Chrome exits mid-`Browser.close` and its socket drops.
	test('a Chrome gone without a Close frame closes the client with 1011, naming why', async () => {
		const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		chrome.emit('close', {
			code: 1006,
			reason: 'WebSocket disconnected without sending Close frame.'
		})

		expect(client.closed).toEqual([
			{
				code: 1011,
				reason: 'peer closed with 1006: WebSocket disconnected without sending Close frame.'
			}
		])
	})

	// Relayed as what it was: no status. close() with no arguments is the only
	// way to send that, and the far end reports 1005 in turn.
	test('a close with no status is relayed as no status, in both directions', async () => {
		const fromChrome = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)
		fromChrome.chrome.emit('close', { code: 1005, reason: '' })

		const fromClient = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)
		fromClient.client.emit('close', { code: 1005, reason: '' })

		expect(fromChrome.client.closed).toEqual([{ code: undefined, reason: undefined }])
		expect(fromClient.chrome.closed).toEqual([{ code: undefined, reason: undefined }])
	})

	// RFC 6455 leaves a reason 123 bytes, and workerd throws past them. A
	// mapped reason grows by its prefix, so it must be cut — on a character
	// boundary, or the cut itself produces a lone surrogate.
	test('a reason that would outgrow 123 UTF-8 bytes is cut on a character boundary', async () => {
		const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		chrome.emit('close', { code: 1006, reason: '€'.repeat(41) })

		const reason = client.closed[0]?.reason ?? ''
		expect(client.refused).toEqual([])
		expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(123)
		expect(reason.startsWith('peer closed with 1006: €')).toBe(true)
		expect(reason.endsWith('€')).toBe(true)
	})

	// The invariant must hold even if workerd's rule is ever stricter than the
	// relay's model of it: the socket closes without a code rather than staying
	// open. That is handled, so it is not an error line.
	//
	// → MUTANT: delete the uncoded `socket.close()` fallback in closeSocket().
	//   The client is never closed and `closed` stays empty.
	test('a coded close workerd refuses anyway still closes the socket, without a code', async () => {
		const consoleError = spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)
			client.refuse = (code) =>
				code === undefined ? null : `Invalid WebSocket close code: ${code}.`

			chrome.emit('close', { code: 1006, reason: '' })

			expect(client.refused.map((close) => close.code)).toEqual([1011])
			expect(client.closed).toEqual([{ code: undefined, reason: undefined }])
			expect(consoleError).not.toHaveBeenCalled()
		} finally {
			consoleError.mockRestore()
		}
	})

	// A socket that cannot be closed at all is a relay that may hang a client,
	// so it stays visible in the dev log.
	//
	// → MUTANT: turn the final console.error in closeSocket() into a DEBUG log.
	test('a socket that refuses every close is reported', async () => {
		const consoleError = spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { chrome, client } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)
			client.refuse = () => 'the socket is wedged'

			chrome.emit('close', { code: 1000, reason: '' })

			expect(client.closed).toEqual([])
			expect(consoleError).toHaveBeenCalledTimes(1)
			expect(String(consoleError.mock.calls[0]?.join(' '))).toContain(
				'Failed to close socket: the socket is wedged'
			)
		} finally {
			consoleError.mockRestore()
		}
	})
})
