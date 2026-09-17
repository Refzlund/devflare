import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getBrowserBindingScript } from '../../../src/browser-shim/binding-worker'

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

/** A websocket end the worker can accept, send on, and receive events from. */
interface FakeSocket {
	readyState: number
	sent: unknown[]
	/** Every close() the worker asked for, in order. */
	closed: { code?: number; reason?: string }[]
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
		accept() {},
		close(code, reason) {
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
