import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createShimRequestHandler } from '../../../src/browser-shim/server'
import {
	type BrowserSessionRegistry,
	createSessionRegistry,
	type SessionBrowser
} from '../../../src/browser-shim/sessions'

// The routes over a real registry with stub browsers. Nothing here starts a
// server or downloads Chrome — which is the point: the wiring these assert is
// the wiring the shim's 60-second reaper hid behind, because every line of it
// used to live inside a closure only a running dev server could reach.

const SHIM_ORIGIN = 'http://127.0.0.1:8788'

function createStubBrowser(): SessionBrowser {
	return {
		async close() {},
		on() {
			return this
		}
	}
}

/** What the handler wrote, in the shape a test can assert on. */
interface Answer {
	status: number
	headers: Record<string, unknown>
	body: string
	json: <T = Record<string, unknown>>() => T
}

/** Stand in for node's ServerResponse, recording rather than writing. */
function createResponse(): { res: ServerResponse; answer: Answer } {
	const answer: Answer = {
		status: 0,
		headers: {},
		body: '',
		json: <T>() => JSON.parse(answer.body) as T
	}

	const res = {
		writeHead(status: number, headers?: Record<string, unknown>) {
			answer.status = status
			Object.assign(answer.headers, headers ?? {})
			return res
		},
		setHeader(name: string, value: unknown) {
			answer.headers[name] = value
		},
		end(body?: string) {
			answer.body = body ?? ''
		}
	} as unknown as ServerResponse

	return { res, answer }
}

/** Stand in for node's IncomingMessage, optionally carrying a JSON body. */
function createRequest(
	url: string,
	options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): IncomingMessage {
	const listeners = new Map<string, ((chunk?: unknown) => void)[]>()

	const req = {
		url,
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		on(event: string, listener: (chunk?: unknown) => void) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener])

			// The handler subscribes after it decides to read, so deliver the
			// body once 'end' has a listener rather than on a timer.
			if (event === 'end') {
				for (const data of listeners.get('data') ?? []) data(Buffer.from(options.body ?? ''))
				listener()
			}
			return req
		},
		destroy() {}
	} as unknown as IncomingMessage

	return req
}

interface Harness {
	handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
	registry: BrowserSessionRegistry
	send(url: string, options?: Parameters<typeof createRequest>[1]): Promise<Answer>
}

function createHarness(
	options: { keepAlive?: number; maxConcurrentSessions?: number } = {}
): Harness {
	const registry = createSessionRegistry({
		keepAlive: options.keepAlive ?? 10000,
		maxConcurrentSessions: options.maxConcurrentSessions,
		async launch() {
			return { browser: createStubBrowser(), wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/1' }
		}
	})

	const handler = createShimRequestHandler({
		registry,
		baseUrl: SHIM_ORIGIN,
		getExecutablePath: () => '/tmp/chrome'
	})

	return {
		handler,
		registry,
		async send(url, requestOptions) {
			const { res, answer } = createResponse()
			await handler(createRequest(url, requestOptions), res)
			return answer
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('browser-shim session lookup', () => {
	// The live dev path's whole connection signal. The binding worker asks for
	// the endpoint with ?attach=1 and connects straight to Chrome, so if this
	// route does not attach, nothing does — and the session is reaped mid-render
	// once keep_alive elapses.
	//
	// → MUTANT: in createShimRequestHandler's `case 'session'`, call
	//   registry.get() unconditionally instead of branching on
	//   shouldAttachSession(). This test fails.
	test('?attach=1 records the connection and stops the reaper', async () => {
		const harness = createHarness({ keepAlive: 25 })
		const { sessionId } = await harness.registry.acquire()

		const answer = await harness.send(`/v1/session/${sessionId}?attach=1`)

		expect(answer.status).toBe(200)
		expect(answer.json()).toMatchObject({
			sessionId,
			wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/1',
			connectionId: expect.any(String)
		})

		await sleep(80)
		expect(harness.registry.get(sessionId)).toBeDefined()
	})

	// → MUTANT: call registry.attach() unconditionally in that same branch. A
	//   bare read then cancels the reaper and this test fails.
	test('a lookup without the flag stays a pure read', async () => {
		const harness = createHarness({ keepAlive: 25 })
		const { sessionId } = await harness.registry.acquire()

		const answer = await harness.send(`/v1/session/${sessionId}`)

		expect(answer.status).toBe(200)
		expect(answer.json().connectionId).toBeUndefined()

		await sleep(80)
		expect(harness.registry.get(sessionId)).toBeUndefined()
	})

	test('an unknown session is a 404', async () => {
		const harness = createHarness()

		const answer = await harness.send('/v1/session/no-such-session?attach=1')

		expect(answer.status).toBe(404)
		expect(answer.json()).toEqual({ error: 'Session not found' })
	})
})

describe('browser-shim session release', () => {
	// → MUTANT: answer 200 without calling registry.release(). The session stays
	//   attached with nothing counting against it, and this test fails.
	test('a release restarts the keep_alive countdown', async () => {
		const harness = createHarness({ keepAlive: 25 })
		const { sessionId } = await harness.registry.acquire()
		const attached = harness.registry.attach(sessionId)

		const answer = await harness.send(
			`/v1/session/${sessionId}/release?connection=${attached?.connectionId}`,
			{ method: 'POST' }
		)

		expect(answer.status).toBe(200)
		expect(answer.json()).toEqual({ released: true })

		await sleep(80)
		expect(harness.registry.get(sessionId)).toBeUndefined()
	})

	// Both ends of a relay close, so the worker can report twice; the second
	// report must be harmless rather than an error the client has to read.
	test('a second release is answered rather than refused', async () => {
		const harness = createHarness()
		const { sessionId } = await harness.registry.acquire()
		harness.registry.attach(sessionId)

		await harness.send(`/v1/session/${sessionId}/release`, { method: 'POST' })
		const second = await harness.send(`/v1/session/${sessionId}/release`, { method: 'POST' })

		expect(second.status).toBe(200)
		expect(second.json()).toEqual({ released: false })
	})

	test('releasing an unknown session is a 404', async () => {
		const harness = createHarness()

		const answer = await harness.send('/v1/session/no-such-session/release', { method: 'POST' })

		expect(answer.status).toBe(404)
	})
})

describe('browser-shim acquire', () => {
	test('acquire answers the session id, honouring keep_alive from the query', async () => {
		const harness = createHarness({ keepAlive: 10000 })

		const answer = await harness.send('/v1/devtools/browser?keep_alive=25', { method: 'POST' })

		expect(answer.status).toBe(200)
		expect(answer.json()).toEqual({ sessionId: expect.any(String) })

		await sleep(80)
		expect(harness.registry.size).toBe(0)
	})

	test('a JSON body still wins where it overlaps, as older clients sent it', async () => {
		const harness = createHarness({ keepAlive: 10000 })

		await harness.send('/v1/acquire?keep_alive=10000', {
			method: 'POST',
			body: JSON.stringify({ keep_alive: 25 })
		})

		await sleep(80)
		expect(harness.registry.size).toBe(0)
	})

	// /v1/limits advertised ten concurrent sessions as a literal nobody
	// enforced, so an app in a launch loop spawned Chrome without bound.
	//
	// → MUTANT: answer 500 for a SessionLimitError like any other failure. A
	//   client then cannot tell "at capacity" from "Chrome would not start".
	test('acquiring past the ceiling answers 429 with the ceiling that refused it', async () => {
		const harness = createHarness({ maxConcurrentSessions: 1 })

		await harness.send('/v1/devtools/browser', { method: 'POST' })
		const refused = await harness.send('/v1/devtools/browser', { method: 'POST' })

		expect(refused.status).toBe(429)
		expect(refused.json()).toMatchObject({ maxConcurrentSessions: 1 })
		expect(harness.registry.size).toBe(1)
	})

	test('a launch that fails is a 500 carrying its reason', async () => {
		const registry = createSessionRegistry({
			async launch(): Promise<never> {
				throw new Error('chrome would not start')
			}
		})
		const handler = createShimRequestHandler({ registry, baseUrl: SHIM_ORIGIN })
		const { res, answer } = createResponse()

		await handler(createRequest('/v1/acquire', { method: 'GET' }), res)

		expect(answer.status).toBe(500)
		expect(answer.json()).toEqual({ error: 'chrome would not start' })
	})
})

describe('browser-shim reporting routes', () => {
	// Every @cloudflare/puppeteer version reads JSON.parse(text).sessions, so a
	// bare array reaches the caller of sessions() as undefined.
	test('sessions and history answer under their named fields', async () => {
		const harness = createHarness()
		const { sessionId } = await harness.registry.acquire()

		expect((await harness.send('/v1/sessions')).json()).toEqual({
			sessions: [{ sessionId, startTime: expect.any(Number) }]
		})

		await harness.registry.close(sessionId)
		expect((await harness.send('/v1/history')).json<{ history: unknown[] }>().history).toHaveLength(
			1
		)
	})

	// The advertised ceiling and the enforced one are the same value now,
	// rather than a literal beside a limit nothing applied.
	test('limits reports what acquire will actually enforce', async () => {
		const harness = createHarness({ maxConcurrentSessions: 2 })
		await harness.registry.acquire()

		expect((await harness.send('/v1/limits')).json()).toMatchObject({
			maxConcurrentSessions: 2,
			allowedBrowserAcquisitions: 1
		})
	})

	test('health reports the live picture', async () => {
		const harness = createHarness()
		await harness.registry.acquire()

		expect((await harness.send('/_devflare/browser/health')).json()).toEqual({
			ok: true,
			activeSessions: 1,
			historySize: 0,
			executablePath: '/tmp/chrome'
		})
	})
})

describe('browser-shim request boundary', () => {
	test('a cross-origin browser request is refused before it reaches a route', async () => {
		const harness = createHarness()
		const { sessionId } = await harness.registry.acquire()

		const answer = await harness.send(`/v1/session/${sessionId}?attach=1`, {
			headers: { origin: 'https://evil.example' }
		})

		expect(answer.status).toBe(403)
		// And the refusal is a refusal: nothing about the session changed.
		expect(harness.registry.get(sessionId)?.connectionId).toBeUndefined()
	})

	test('a loopback origin is allowed and echoed', async () => {
		const harness = createHarness()

		const answer = await harness.send('/v1/limits', {
			headers: { origin: 'http://localhost:5173' }
		})

		expect(answer.status).toBe(200)
		expect(answer.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
		expect(answer.headers.Vary).toBe('Origin')
	})

	test('a devtools path over plain HTTP asks for an upgrade', async () => {
		const harness = createHarness()

		expect((await harness.send('/v1/connectDevtools')).status).toBe(426)
	})

	test('anything else is a 404', async () => {
		const harness = createHarness()

		expect((await harness.send('/v1/nope')).status).toBe(404)
	})
})
