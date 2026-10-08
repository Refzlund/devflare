// =============================================================================
// `cloudflare:workers` for SvelteKit 3's dev server
// =============================================================================
/*
	SvelteKit 3's Cloudflare adapter (8.x) takes the bindings off `event.platform`:
	an app reads them from `cloudflare:workers` instead (`env`, `waitUntil`, …).
	In `vite dev` the app runs in Vite's Node process, where no such module
	exists, so the adapter resolves the import to a stub of its own whose `env`
	is a wrangler `getPlatformProxy()` — not the bindings devflare serves.

	devflare's Vite plugin resolves `cloudflare:workers` to this module instead,
	and devflare's SvelteKit handle runs every request inside {@link SvelteKitDevState.requests},
	so `env` here is the same env that request's handle built.

	→ KEY: the handle and the module meet through ONE object on `globalThis`
	  (a `Symbol.for` key), not through a shared import. The app may load
	  devflare twice — the handle through the package, the plugin from a source
	  path, or two copies of the package — and an AsyncLocalStorage held in a
	  module would then be two stores that never see each other's requests.
	→ Bindings are per request in devflare's dev server, so `env` throws when it
	  is read outside one. workerd allows a top-level read; devflare cannot
	  serve one, and an `undefined` binding would fail later and further away.
*/

import { AsyncLocalStorage } from 'node:async_hooks'
import { createUnsupportedExports, createUntracedTracing } from '../utils/in-process-context'

/** What `cloudflare:workers` reads for the request being served. */
export interface SvelteKitRequestScope {
	/** The request's bindings; absent inside `withExports()` called outside a request. */
	env?: Record<string, unknown>
	/**
	 * The request's ExecutionContext; absent inside `withEnv()` called outside a request.
	 * `tracing` is spelled out because workers-types before 4.20260426 lack it.
	 */
	context?: ExecutionContext & { readonly tracing?: object }
	/** Exports set by `withExports()` / `withEnvAndExports()`; otherwise there are none. */
	exports?: object
}

/** The `cloudflare:workers` members devflare serves in SvelteKit's dev server. */
export interface CloudflareWorkersDevModule {
	env: Record<string, unknown>
	exports: object
	waitUntil(promise: Promise<unknown>): void
	withEnv<T>(newEnv: unknown, fn: () => T): T
	withExports<T>(newExports: unknown, fn: () => T): T
	withEnvAndExports<T>(newEnv: unknown, newExports: unknown, fn: () => T): T
	cache: {
		purge(options?: unknown): Promise<never>
		invalidate(options?: unknown): Promise<never>
	}
	tracing: ReturnType<typeof createUntracedTracing>
}

/** What devflare's SvelteKit handle and its Vite plugin share in one process. */
export interface SvelteKitDevState {
	/** The scope of the request being served, across its awaits. */
	readonly requests: AsyncLocalStorage<SvelteKitRequestScope>
	/**
	 * The module the Vite plugin serves for `cloudflare:workers`; set only when it does.
	 * The handle then leaves `event.platform` unset, as SvelteKit 3's adapter does in
	 * production, so an app reading `platform.env` fails in dev rather than only once deployed.
	 */
	cloudflareWorkers?: CloudflareWorkersDevModule
}

/** The `globalThis` key both sides look the state up by. */
export const SVELTEKIT_DEV_STATE_KEY = 'devflare.sveltekit.dev-state'

/** Who runs the app instead of workerd, for the errors the module throws. */
const SVELTEKIT_DEV_HOST = "devflare's SvelteKit dev server runs the app in Vite's Node process"

/**
 * @description Returns the state shared by devflare's SvelteKit handle and Vite plugin,
 * creating it on first use.
 * @returns the one state object of this process
 */
export function getSvelteKitDevState(): SvelteKitDevState {
	const slot = globalThis as { [key: symbol]: SvelteKitDevState | undefined }
	const key = Symbol.for(SVELTEKIT_DEV_STATE_KEY)
	slot[key] ??= { requests: new AsyncLocalStorage<SvelteKitRequestScope>() }
	return slot[key]
}

/**
 * @description The error for reading `cloudflare:workers` env outside a request.
 * @param property - the binding or member that was read
 */
function outsideRequestError(property: string): Error {
	return new Error(
		`[devflare] cloudflare:workers env.${property} was read outside a request devflare is serving. ` +
			"In SvelteKit's dev server, devflare's handle supplies the bindings per request: export it " +
			"from src/hooks.server.ts (`export { handle } from 'devflare/sveltekit'`, or first in " +
			'`sequence(...)`), and read `env` inside a load, action, endpoint or hook rather than at ' +
			'module top level.'
	)
}

/**
 * @description Returns the env of the request being served.
 * @param requests - the request scope store
 * @param property - what is being read, named in the error
 * @throws when no request is being served
 */
function currentEnv(
	requests: AsyncLocalStorage<SvelteKitRequestScope>,
	property: PropertyKey
): Record<string, unknown> {
	const env = requests.getStore()?.env
	if (!env) {
		throw outsideRequestError(String(property))
	}
	return env
}

/**
 * @description Builds the `env` export: every operation reaches the env of the
 * request being served.
 * @param requests - the request scope store
 */
function createEnvProxy(requests: AsyncLocalStorage<SvelteKitRequestScope>) {
	return new Proxy({} as Record<string, unknown>, {
		get(_target, property) {
			// `then` is read by every await the object passes through and `toJSON` by
			// JSON.stringify; neither is a binding, so neither is an outside-request read.
			if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
				const env = requests.getStore()?.env
				return env ? Reflect.get(env, property) : undefined
			}
			return Reflect.get(currentEnv(requests, property), property)
		},
		set: (_target, property, value) => Reflect.set(currentEnv(requests, property), property, value),
		has: (_target, property) => Reflect.has(currentEnv(requests, property), property),
		deleteProperty: (_target, property) =>
			Reflect.deleteProperty(currentEnv(requests, property), property),
		defineProperty: (_target, property, attributes) =>
			Reflect.defineProperty(currentEnv(requests, property), property, attributes),
		ownKeys: () => Reflect.ownKeys(currentEnv(requests, 'ownKeys')),
		getOwnPropertyDescriptor(_target, property) {
			const descriptor = Reflect.getOwnPropertyDescriptor(currentEnv(requests, property), property)
			// A proxy may only report a property of its own target as non-configurable.
			return descriptor && { ...descriptor, configurable: true }
		}
	})
}

/**
 * @description Builds the `exports` export: exports set by `withExports()` when
 * there are any, otherwise an object whose every export throws.
 * @param requests - the request scope store
 */
function createExportsProxy(requests: AsyncLocalStorage<SvelteKitRequestScope>) {
	const unsupported = createUnsupportedExports(SVELTEKIT_DEV_HOST, 'cloudflare:workers exports')
	return new Proxy(
		{},
		{
			get(_target, property) {
				return Reflect.get(requests.getStore()?.exports ?? unsupported, property)
			}
		}
	)
}

/**
 * @description Builds the `tracing` export: the request's own tracing, or an
 * untraced one outside a request.
 * @param requests - the request scope store
 */
function createTracingProxy(requests: AsyncLocalStorage<SvelteKitRequestScope>) {
	const outsideRequest = createUntracedTracing()
	return new Proxy(outsideRequest, {
		get(target, property) {
			const tracing = requests.getStore()?.context?.tracing ?? target
			return Reflect.get(tracing, property)
		}
	})
}

/**
 * @description Builds the `cloudflare:workers` module devflare serves in SvelteKit's dev server.
 * @param state - the state shared with devflare's SvelteKit handle
 * @returns the module's members, each reading the request being served
 */
export function createCloudflareWorkersDevModule(
	state: SvelteKitDevState
): CloudflareWorkersDevModule {
	const { requests } = state
	const runWith = <T>(scope: Partial<SvelteKitRequestScope>, fn: () => T): T =>
		requests.run({ ...requests.getStore(), ...scope }, fn)
	const cacheUnsupported = async (): Promise<never> => {
		throw new Error(
			`cloudflare:workers cache is not supported: ${SVELTEKIT_DEV_HOST}, which has no Cloudflare ` +
				'cache to purge.'
		)
	}

	return {
		env: createEnvProxy(requests),
		exports: createExportsProxy(requests),
		waitUntil(promise) {
			const context = requests.getStore()?.context
			if (!context) {
				throw new Error(
					'[devflare] cloudflare:workers waitUntil() was called outside a request devflare is serving.'
				)
			}
			context.waitUntil(promise)
		},
		withEnv: (newEnv, fn) => runWith({ env: newEnv as Record<string, unknown> }, fn),
		withExports: (newExports, fn) => runWith({ exports: newExports as object }, fn),
		withEnvAndExports: (newEnv, newExports, fn) =>
			runWith({ env: newEnv as Record<string, unknown>, exports: newExports as object }, fn),
		cache: {
			purge: cacheUnsupported,
			invalidate: cacheUnsupported
		},
		tracing: createTracingProxy(requests)
	}
}

/**
 * @description The source of the virtual module the Vite plugin serves for
 * `cloudflare:workers`: it re-exports the module object installed on the shared state.
 * @returns ESM source
 */
export function cloudflareWorkersDevModuleSource(): string {
	const members = [
		'env',
		'exports',
		'waitUntil',
		'withEnv',
		'withExports',
		'withEnvAndExports',
		'cache',
		'tracing'
	] satisfies Array<keyof CloudflareWorkersDevModule>
	return [
		`const devflareModule = globalThis[Symbol.for(${JSON.stringify(SVELTEKIT_DEV_STATE_KEY)})]?.cloudflareWorkers`,
		'if (!devflareModule) {',
		"\tthrow new Error('[devflare] cloudflare:workers was imported, but devflare did not install its dev module. Is devflarePlugin() in the Vite config?')",
		'}',
		...members.map((member) => `export const ${member} = devflareModule.${member}`)
	].join('\n')
}
