// =============================================================================
// SvelteKit handle — what a dev request gets when the bridge is gone
// =============================================================================
// The handle used to leave `event.platform` unset when the platform could not be
// built. The request was still served, which is right — an asset or a page that
// touches no binding has no reason to fail over a reload. But every request that
// DID touch one then hit the app's own "`<BINDING>` (D1) binding is missing. Run
// the app via `devflare dev`", naming a cause that is not the cause and a fix the
// developer has already applied.
//
// So the platform is now always attached, and it is its ENV that refuses — with
// devflare's own error, at the moment a binding is actually read.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resetClient } from '../../../src/bridge/client'
import { RUNTIME_STATUS_URL_ENV } from '../../../src/dev-server/runtime-status'
import {
	BridgeUnavailableError,
	createHandle,
	resetPlatform
} from '../../../src/sveltekit/platform'

// -----------------------------------------------------------------------------
// No transport at all, so connecting cannot succeed however long it is retried.
// -----------------------------------------------------------------------------

class UnreachableWebSocket {
	constructor(_url: string) {
		throw new Error('no transport')
	}
}

const originalEnv: Record<string, string | undefined> = {}
let originalWebSocket: typeof globalThis.WebSocket

function setEnv(name: string, value: string | undefined): void {
	if (!(name in originalEnv)) originalEnv[name] = process.env[name]
	if (value === undefined) delete process.env[name]
	else process.env[name] = value
}

beforeEach(() => {
	originalWebSocket = globalThis.WebSocket
	;(globalThis as unknown as { WebSocket: unknown }).WebSocket =
		UnreachableWebSocket as unknown as typeof WebSocket
	setEnv('DEVFLARE_DEV', 'true')
	// A coordinator URL nothing is listening on: the status read answers `unreachable`, so the
	// connect gives up on its first refusal instead of spending the whole budget in real time.
	setEnv(RUNTIME_STATUS_URL_ENV, 'http://127.0.0.1:1/_devflare/runtime-status')
	resetClient()
	resetPlatform()
})

afterEach(() => {
	;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
	for (const [name, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[name]
		else process.env[name] = value
		delete originalEnv[name]
	}
	resetClient()
	resetPlatform()
})

/** Run one request through the handle, capturing what `resolve` was handed. */
async function runRequest(resolve: (event: unknown) => Response): Promise<{
	response: Response
	platform: { env: Record<string, unknown> }
	logged: unknown[]
}> {
	const handle = createHandle({ bridgeUrl: 'ws://localhost:1', hints: { MY_KV: 'kv' } })
	let seen: unknown
	const logged: unknown[] = []
	const originalConsoleError = console.error

	console.error = (...args: unknown[]) => {
		logged.push(args)
	}
	try {
		const response = await handle({
			event: { request: new Request('http://localhost/') },
			resolve: (event) => {
				seen = (event as { platform?: unknown }).platform
				return resolve(event)
			}
		})
		return { response, platform: seen as { env: Record<string, unknown> }, logged }
	} finally {
		console.error = originalConsoleError
	}
}

// -----------------------------------------------------------------------------

describe('an unbuildable dev platform', () => {
	test('still serves the request — a page that touches no binding is unaffected', async () => {
		const { response, platform } = await runRequest(() => new Response('served'))

		expect(await response.text()).toBe('served')
		// Attached rather than absent, which is the change: the absence now describes itself.
		expect(platform).toBeDefined()
	})

	test('refuses a binding read with devflare naming the real cause', async () => {
		const { platform } = await runRequest(() => new Response('served'))

		let thrown: unknown
		try {
			void platform.env.MY_KV
		} catch (error) {
			thrown = error
		}

		expect(thrown).toBeInstanceOf(BridgeUnavailableError)
		const error = thrown as BridgeUnavailableError
		expect(error.reason).toBe('coordinator-unreachable')
		// The old path handed this to the app, which blamed the developer for not running the
		// very command they were running.
		expect(error.message).toContain('is `devflare dev` still running?')
	})

	test('reports the failure without blaming platform construction', async () => {
		const { logged } = await runRequest(() => new Response('served'))

		expect(logged.length).toBe(1)
		const [prefix, error] = logged[0] as [string, unknown]
		expect(prefix).toBe('[devflare] Cloudflare bindings are unavailable for this request:')
		expect(error).toBeInstanceOf(BridgeUnavailableError)
	})

	test('survives being inspected, enumerated and serialised', async () => {
		const { platform } = await runRequest(() => new Response('served'))

		// Every one of these is something a framework or a logger does to an object it was
		// handed. Throwing at THEM would move the failure somewhere it makes no sense.
		expect(Object.keys(platform.env)).toEqual([])
		expect(JSON.stringify(platform.env)).toBe('{}')
		expect({ ...platform.env }).toEqual({})
		expect(await Promise.resolve(platform.env)).toBe(platform.env)
		expect(() => String(Object.prototype.toString.call(platform.env))).not.toThrow()
	})

	test('is never cached — a request after the runtime returns gets real bindings', async () => {
		const first = await runRequest(() => new Response('served'))
		expect(() => first.platform.env.MY_KV).toThrow()

		// The bridge comes back; the caching layer must not still be holding the refusing one.
		;(globalThis as unknown as { WebSocket: unknown }).WebSocket = class {
			binaryType = 'blob'
			onopen: ((ev?: unknown) => void) | null = null
			onerror: ((ev?: unknown) => void) | null = null
			onclose: ((ev?: unknown) => void) | null = null
			onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null = null
			constructor(_url: string) {
				queueMicrotask(() => this.onopen?.())
			}
			send(): void {}
			close(): void {}
		}

		const second = await runRequest(() => new Response('served'))

		expect(() => second.platform.env.MY_KV).not.toThrow()
		expect(second.platform.env.MY_KV).toBeDefined()
	})
})
