// =============================================================================
// `cloudflare:workers` as devflare serves it to SvelteKit 3's dev server
// =============================================================================
// SvelteKit 3's Cloudflare adapter moves the bindings off `event.platform` and
// onto `cloudflare:workers`. In dev, devflare's Vite plugin resolves that import
// to a module whose members read the request devflare's handle is serving.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { join } from 'node:path'
import { resetClient } from '../../../src/bridge/client'
import {
	type CloudflareWorkersDevModule,
	cloudflareWorkersDevModuleSource,
	createCloudflareWorkersDevModule,
	getSvelteKitDevState,
	type SvelteKitDevState,
	type SvelteKitRequestScope
} from '../../../src/sveltekit/cloudflare-workers-dev'
import { createHandle, resetPlatform } from '../../../src/sveltekit/platform'
import { createTestExecutionContext } from '../../../src/test/execution-context'

/** A fresh state, so these tests never touch the process-wide one. */
function createState(): SvelteKitDevState {
	return { requests: new AsyncLocalStorage<SvelteKitRequestScope>() }
}

describe('the cloudflare:workers dev module', () => {
	test('reads env from the request being served, across its awaits', async () => {
		const state = createState()
		const { env } = createCloudflareWorkersDevModule(state)

		const seen = await Promise.all(
			['first', 'second'].map((name) =>
				state.requests.run({ env: { NAME: name } }, async () => {
					await new Promise((resolve) => setTimeout(resolve, 5))
					return { name: env.NAME, keys: Object.keys(env), has: 'NAME' in env }
				})
			)
		)

		expect(seen).toEqual([
			{ name: 'first', keys: ['NAME'], has: true },
			{ name: 'second', keys: ['NAME'], has: true }
		])
	})

	test('refuses an env read outside a request, naming the binding and the handle', () => {
		const { env } = createCloudflareWorkersDevModule(createState())

		expect(() => env.DB).toThrow(/env\.DB was read outside a request devflare is serving/)
		expect(() => env.DB).toThrow(/export \{ handle \} from 'devflare\/sveltekit'/)
	})

	test('stays safe to await and serialise outside a request', async () => {
		const { env } = createCloudflareWorkersDevModule(createState())

		expect(await env).toBe(env)
		expect(Reflect.get(env, 'toJSON')).toBeUndefined()
		expect(Reflect.get(env, Symbol.toStringTag)).toBeUndefined()
	})

	test('hands waitUntil to the request context, and refuses it outside one', () => {
		const state = createState()
		const { waitUntil } = createCloudflareWorkersDevModule(state)
		const waited: Promise<unknown>[] = []
		const work = Promise.resolve('done')

		state.requests.run({ env: {}, context: createTestExecutionContext(waited) }, () =>
			waitUntil(work)
		)

		expect(waited).toEqual([work])
		expect(() => waitUntil(work)).toThrow(/waitUntil\(\) was called outside a request/)
	})

	test('overrides env and exports for the callback only, keeping the request context', () => {
		const state = createState()
		const module = createCloudflareWorkersDevModule(state)
		const context = createTestExecutionContext([])
		const loopback = { ping: () => 'pong' }

		const inside = state.requests.run({ env: { NAME: 'request' }, context }, () => ({
			overridden: module.withEnv({ NAME: 'override' }, () => module.env.NAME),
			both: module.withEnvAndExports({ NAME: 'both' }, { Loopback: loopback }, () => [
				module.env.NAME,
				Reflect.get(module.exports, 'Loopback')
			]),
			context: module.withExports({}, () => state.requests.getStore()?.context),
			after: module.env.NAME
		}))

		expect(inside).toEqual({
			overridden: 'override',
			both: ['both', loopback],
			context,
			after: 'request'
		})
	})

	test('refuses the exports and cache it cannot serve outside workerd', async () => {
		const module = createCloudflareWorkersDevModule(createState())

		expect(() => Reflect.get(module.exports, 'MyEntrypoint')).toThrow(
			/cloudflare:workers exports\.MyEntrypoint is not supported: .*Vite's Node process/
		)
		await expect(module.cache.purge({ tags: ['a'] })).rejects.toThrow(/no Cloudflare cache/)
		await expect(module.cache.invalidate({ tags: ['a'] })).rejects.toThrow(/no Cloudflare cache/)
	})

	test("uses the request's own tracing, and an untraced one outside a request", () => {
		const state = createState()
		const { tracing } = createCloudflareWorkersDevModule(state)
		const context = createTestExecutionContext([])

		const inRequest = state.requests.run({ env: {}, context }, () => tracing.getActiveSpan)

		// Read through Reflect: the root type-checks against workers-types 4.x, whose Tracing lacks it.
		expect(inRequest).toBe(Reflect.get(context.tracing, 'getActiveSpan'))
		expect(tracing.getActiveSpan).not.toBe(inRequest)
		expect(tracing.enterSpan('outside', (span) => span.isTraced)).toBe(false)
	})
})

describe('the virtual module the Vite plugin serves', () => {
	const key = Symbol.for('devflare.sveltekit.dev-state')
	let saved: unknown

	beforeEach(() => {
		saved = Reflect.get(globalThis, key)
	})

	afterEach(() => {
		Reflect.set(globalThis, key, saved)
	})

	/** Imports the module source through a real file, as Vite's module runner would evaluate it. */
	async function importModuleSource(name: string): Promise<CloudflareWorkersDevModule> {
		const path = join(import.meta.dir, `.cloudflare-workers-dev-${name}-${Date.now()}.mjs`)
		await Bun.write(path, cloudflareWorkersDevModuleSource())
		try {
			return (await import(path)) as CloudflareWorkersDevModule
		} finally {
			await Bun.file(path).delete()
		}
	}

	test('re-exports every member of the installed module', async () => {
		const state = createState()
		const installed = createCloudflareWorkersDevModule(state)
		Reflect.set(globalThis, key, { ...state, cloudflareWorkers: installed })

		const imported = await importModuleSource('installed')
		const members = Object.keys(installed) as Array<keyof CloudflareWorkersDevModule>

		expect(Object.keys(imported).sort()).toEqual([...members].sort())
		expect(members.filter((member) => imported[member] !== installed[member])).toEqual([])
	})

	test('says what is missing when devflare did not install the module', async () => {
		Reflect.set(globalThis, key, createState())

		await expect(importModuleSource('missing')).rejects.toThrow(
			/devflare did not install its dev module\. Is devflarePlugin\(\) in the Vite config\?/
		)
	})
})

// -----------------------------------------------------------------------------
// The handle: what reaches `cloudflare:workers` and `event.platform`
// -----------------------------------------------------------------------------

/** A WebSocket that completes its upgrade, so the platform builds. */
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

describe("devflare's SvelteKit handle", () => {
	let originalWebSocket: typeof globalThis.WebSocket
	let installedModule: CloudflareWorkersDevModule | undefined

	beforeEach(() => {
		originalWebSocket = globalThis.WebSocket
		;(globalThis as unknown as { WebSocket: unknown }).WebSocket = OpeningWebSocket
		installedModule = getSvelteKitDevState().cloudflareWorkers
		resetClient()
		resetPlatform()
	})

	afterEach(() => {
		;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
		getSvelteKitDevState().cloudflareWorkers = installedModule
		resetClient()
		resetPlatform()
	})

	/**
	 * Serves one request through the handle, with the given local binding.
	 * @returns what the route saw on `cloudflare:workers` and on `event.platform`
	 */
	async function serveOneRequest(module: CloudflareWorkersDevModule) {
		const handle = createHandle({
			shouldEnable: () => true,
			bridgeUrl: 'ws://localhost:1',
			localBindings: { GREETING: 'hello from devflare' }
		})
		const event: { platform?: unknown; request: Request } = {
			request: new Request('http://localhost/')
		}
		let greeting: unknown

		await handle({
			event,
			resolve: () => {
				greeting = module.env.GREETING
				return new Response('ok')
			}
		})
		return { greeting, platform: event.platform }
	}

	test('serves the request env to cloudflare:workers and leaves event.platform unset', async () => {
		const state = getSvelteKitDevState()
		state.cloudflareWorkers = createCloudflareWorkersDevModule(state)

		const seen = await serveOneRequest(state.cloudflareWorkers)

		expect(seen).toEqual({ greeting: 'hello from devflare', platform: undefined })
	})

	test('still fills event.platform when devflare does not serve cloudflare:workers', async () => {
		const state = getSvelteKitDevState()
		state.cloudflareWorkers = undefined

		const seen = await serveOneRequest(createCloudflareWorkersDevModule(state))

		expect(seen.greeting).toBe('hello from devflare')
		expect((seen.platform as { env: Record<string, unknown> }).env.GREETING).toBe(
			'hello from devflare'
		)
	})
})
