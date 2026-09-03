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
	accept(): void
	close(): void
	send(data: unknown): void
	addEventListener(type: string, listener: (event: unknown) => void): void
	/** Deliver an event to the worker's listeners, as workerd would. */
	emit(type: string, event: unknown): void
}

function createFakeSocket(): FakeSocket {
	const listeners = new Map<string, ((event: unknown) => void)[]>()

	return {
		readyState: 1,
		sent: [],
		accept() {},
		close() {},
		send(data) {
			this.sent.push(data)
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
}

/** What one drive of the worker's DevTools upgrade produced. */
interface Upgrade {
	response: Response
	/** Every URL the worker fetched, in order. */
	fetched: string[]
	/** Chrome's end of the relay — what the worker forwarded to the browser. */
	chrome: FakeSocket
	/** The worker's end of the pair — what puppeteer would be talking to. */
	client: FakeSocket
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
async function upgrade(path: string): Promise<Upgrade> {
	const worker = await loadBindingWorker()
	const fetched: string[] = []
	const chrome = createFakeSocket()

	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input)
		fetched.push(url)

		if (url === `${SHIM_URL}/v1/session/${SESSION_ID}`) {
			return Response.json({ sessionId: SESSION_ID, wsEndpoint: CHROME_WS_ENDPOINT })
		}

		if (url === CHROME_UPGRADE_URL) {
			const response = new Response(null, { status: 101 })
			Object.defineProperty(response, 'webSocket', { value: chrome })
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
	return { response, fetched, chrome, client: pair?.server ?? createFakeSocket() }
}

describe('browser binding worker devtools routing', () => {
	// @cloudflare/puppeteer 1.1.0 moved the DevTools endpoint from
	// /v1/connectDevtools?browser_session=X to /v1/devtools/browser/X. Before
	// this was handled the request fell through to the plain HTTP proxy, which
	// forwarded it to the shim as an ordinary request and never opened a relay.
	test('resolves the session from the path >= 1.1.0 connects on', async () => {
		const { response, fetched } = await upgrade(`/v1/devtools/browser/${SESSION_ID}`)

		expect(fetched[0]).toBe(`${SHIM_URL}/v1/session/${SESSION_ID}`)
		expect(fetched).toContain(CHROME_UPGRADE_URL)
		expect(response.status).toBe(101)
	})

	test('still resolves the session from the query <= 1.0.7 connects on', async () => {
		const { response, fetched } = await upgrade(`/v1/connectDevtools?browser_session=${SESSION_ID}`)

		expect(fetched[0]).toBe(`${SHIM_URL}/v1/session/${SESSION_ID}`)
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
