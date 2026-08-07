// =============================================================================
// Runtime status channel — the contract between the coordinator and the app
// =============================================================================
// The two halves are only useful together, so they are pinned together: the
// loopback listener the dev server owns, and the reader the app process uses.
//
// The load-bearing assertion is the one about a listener that ISN'T there. The
// app's whole reason for asking is to tell "the runtime is coming back" from
// "nothing is running", and if a failed read reported anything other than
// `unreachable` the connect path would sit out an outage nobody is going to end.
// =============================================================================

import { afterEach, describe, expect, test } from 'bun:test'
import {
	type DevRuntimeState,
	RUNTIME_STATUS_URL_ENV,
	getRuntimeStatusUrl,
	readDevRuntimeState
} from '../../../src/dev-server/runtime-status'
import {
	type RuntimeStatusService,
	startRuntimeStatusService
} from '../../../src/dev-server/runtime-status-service'

const running: RuntimeStatusService[] = []

/** Start a listener that reports whatever `state` currently holds, and track it for teardown. */
async function startService(
	readState: () => Promise<DevRuntimeState>
): Promise<RuntimeStatusService> {
	const service = await startRuntimeStatusService(readState)
	running.push(service)
	return service
}

afterEach(async () => {
	while (running.length > 0) {
		await running.pop()?.close()
	}
})

// -----------------------------------------------------------------------------

describe('runtime status service', () => {
	test('reports the state the coordinator settles on, live per request', async () => {
		let state: DevRuntimeState = 'starting'
		const service = await startService(async () => state)

		expect(await readDevRuntimeState(service.url)).toBe('starting')

		// Read per request, not captured at start — a reload that begins after the listener
		// is up has to be visible to the app that is waiting on it.
		state = 'reloading'
		expect(await readDevRuntimeState(service.url)).toBe('reloading')

		state = 'ready'
		expect(await readDevRuntimeState(service.url)).toBe('ready')
	})

	test('binds the loopback interface on a port nobody configured', async () => {
		const service = await startService(async () => 'ready')

		expect(service.url.startsWith('http://127.0.0.1:')).toBe(true)
		expect(service.port).toBeGreaterThan(0)
	})

	test('404s anything that is not the status path', async () => {
		const service = await startService(async () => 'ready')
		const origin = new URL(service.url).origin

		const response = await fetch(`${origin}/somewhere-else`)

		expect(response.status).toBe(404)
	})

	test('a coordinator that cannot settle its own state answers 500, and the app reads that as no answer', async () => {
		const service = await startService(async () => {
			throw new Error('probe exploded')
		})

		const response = await fetch(service.url)
		expect(response.status).toBe(500)
		expect(await response.json()).toEqual({ error: 'probe exploded' })

		// A coordinator that cannot say what its runtime is doing cannot promise to fix it.
		expect(await readDevRuntimeState(service.url)).toBe('unreachable')
	})

	test('close() releases the port', async () => {
		const service = await startRuntimeStatusService(async () => 'ready')
		expect(await readDevRuntimeState(service.url)).toBe('ready')

		await service.close()

		expect(await readDevRuntimeState(service.url)).toBe('unreachable')
	})
})

describe('readDevRuntimeState', () => {
	test('reads a listener that is not there as unreachable, never as a state', async () => {
		// Port 1 on loopback: refused immediately, the shape a dead coordinator takes.
		const reading = await readDevRuntimeState('http://127.0.0.1:1/_devflare/runtime-status')

		expect(reading).toBe('unreachable')
	})

	test('reads a state it does not recognise as unreachable', async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ state: 'contemplating' }), {
				headers: { 'content-type': 'application/json' }
			})) as unknown as typeof fetch

		// A future coordinator reporting a state this client has never heard of must not be
		// guessed at — an unknown answer is no answer.
		expect(await readDevRuntimeState('http://127.0.0.1:1/x', { fetchImpl })).toBe('unreachable')
	})

	test('reads a non-JSON body as unreachable rather than throwing at the caller', async () => {
		const fetchImpl = (async () =>
			new Response('<html>proxy error</html>')) as unknown as typeof fetch

		expect(await readDevRuntimeState('http://127.0.0.1:1/x', { fetchImpl })).toBe('unreachable')
	})

	test('reads a non-200 as unreachable', async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ state: 'ready' }), { status: 503 })) as unknown as typeof fetch

		expect(await readDevRuntimeState('http://127.0.0.1:1/x', { fetchImpl })).toBe('unreachable')
	})

	test('gives up on a coordinator that accepts the connection but never answers', async () => {
		// A real listener that stalls, not a fake promise: an app request is blocked on this read,
		// so "accepted but silent" has to end in a bounded time rather than pinning the request.
		const service = await startService(() => new Promise<DevRuntimeState>(() => {}))

		expect(await readDevRuntimeState(service.url, { timeoutMs: 100 })).toBe('unreachable')
	})

	test('a stalled request does not keep the listener from closing', async () => {
		// Untracked: this test closes the service itself, and a second close would reject.
		const service = await startRuntimeStatusService(() => new Promise<DevRuntimeState>(() => {}))
		// The reader holds the socket for 3s, so a `close()` that waits the socket out is 3s of dev
		// server that will not exit. Measured rather than merely awaited: without the forced
		// disconnect this still finishes, just three seconds late — which is exactly the defect.
		const inFlight = readDevRuntimeState(service.url, { timeoutMs: 3000 })
		await new Promise((settle) => setTimeout(settle, 20))

		const startedAt = Date.now()
		await service.close()
		const closedInMs = Date.now() - startedAt

		expect(closedInMs).toBeLessThan(1000)
		expect(await inFlight).toBe('unreachable')
		expect(await readDevRuntimeState(service.url, { timeoutMs: 200 })).toBe('unreachable')
	})
})

describe('getRuntimeStatusUrl', () => {
	test('returns the published URL', () => {
		const url = 'http://127.0.0.1:51234/_devflare/runtime-status'

		expect(getRuntimeStatusUrl({ [RUNTIME_STATUS_URL_ENV]: url })).toBe(url)
	})

	test('treats unset and blank alike — there is no default worth guessing', () => {
		expect(getRuntimeStatusUrl({})).toBeUndefined()
		expect(getRuntimeStatusUrl({ [RUNTIME_STATUS_URL_ENV]: '   ' })).toBeUndefined()
	})
})
