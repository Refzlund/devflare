// =============================================================================
// SvelteKit handle — what the platform try/catch is allowed to catch
// =============================================================================
// The handle wraps platform creation so a dev request can fall back when the
// bridge is unavailable. That fallback must cover creating the platform and
// NOTHING else: the same try also spanned `resolve(event)`, so a failure anywhere
// downstream was blamed on the platform — logged as "[devflare] Failed to create
// platform" — and the whole request was then re-run, repeating every side effect
// and running the second pass outside the context devflare established for the
// first (so `getContext()`/`env()` throw there).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resetClient } from '../../../src/bridge/client'
import { createHandle, resetPlatform } from '../../../src/sveltekit/platform'

// -----------------------------------------------------------------------------
// A WebSocket that completes its upgrade, so the platform builds successfully
// and the only thing left to fail is the request itself.
// -----------------------------------------------------------------------------

class OpeningWebSocket {
	binaryType: 'arraybuffer' | 'blob' = 'blob'
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

let originalWebSocket: typeof globalThis.WebSocket
let originalDevflareDev: string | undefined

beforeEach(() => {
	originalWebSocket = globalThis.WebSocket
	originalDevflareDev = process.env.DEVFLARE_DEV
	;(globalThis as unknown as { WebSocket: unknown }).WebSocket =
		OpeningWebSocket as unknown as typeof WebSocket
	process.env.DEVFLARE_DEV = 'true'
	resetClient()
	resetPlatform()
})

afterEach(() => {
	;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
	if (originalDevflareDev === undefined) delete process.env.DEVFLARE_DEV
	else process.env.DEVFLARE_DEV = originalDevflareDev
	resetClient()
	resetPlatform()
})

// -----------------------------------------------------------------------------

describe('createHandle error scoping', () => {
	test('an error thrown downstream propagates and is not reported as a platform failure', async () => {
		const handle = createHandle({ bridgeUrl: 'ws://localhost:1', hints: { MY_KV: 'kv' } })
		const downstream = new Error('a route blew up')

		const reported: unknown[] = []
		const originalConsoleError = console.error
		console.error = (...args: unknown[]) => {
			reported.push(args[0])
		}

		try {
			const run = handle({
				event: { request: new Request('http://localhost/') },
				resolve: () => {
					throw downstream
				}
			})

			await expect(run).rejects.toThrow('a route blew up')
		} finally {
			console.error = originalConsoleError
		}

		// The platform built fine; blaming it for the route's failure is the misreport.
		expect(reported).not.toContain('[devflare] Failed to create platform:')
	})

	test('a downstream failure does not re-run the request', async () => {
		const handle = createHandle({ bridgeUrl: 'ws://localhost:1', hints: { MY_KV: 'kv' } })
		const seenPlatforms: unknown[] = []

		await handle({
			event: { request: new Request('http://localhost/') },
			resolve: (event) => {
				seenPlatforms.push((event as { platform?: unknown }).platform)
				throw new Error('a route blew up')
			}
		}).catch(() => {
			/* asserted above; here only the number of passes matters */
		})

		// Exactly one pass, with bindings — no silent second run of the route's side effects.
		expect(seenPlatforms.length).toBe(1)
		expect(seenPlatforms[0]).toBeDefined()
	})

	test('a genuine platform failure still falls back to an unbridged resolve', async () => {
		// No WebSocket at all, and no `ws` package resolution — connecting cannot succeed.
		;(globalThis as unknown as { WebSocket: unknown }).WebSocket = class {
			constructor(_url: string) {
				throw new Error('no transport')
			}
		}

		const handle = createHandle({ bridgeUrl: 'ws://localhost:1', hints: { MY_KV: 'kv' } })
		let platformOnResolve: unknown = 'unset'

		const response = await handle({
			event: { request: new Request('http://localhost/') },
			resolve: (event) => {
				platformOnResolve = (event as { platform?: unknown }).platform
				return new Response('fallback')
			}
		})

		expect(await response.text()).toBe('fallback')
		expect(platformOnResolve).toBeUndefined()
	})
})
