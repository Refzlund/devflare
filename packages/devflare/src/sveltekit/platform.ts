// =============================================================================
// SvelteKit Platform Integration
// =============================================================================
// Provides a `platform` object that uses the bridge to communicate with Miniflare
// in development mode, while passing through the real platform in production.
// =============================================================================

import { type BindingHints, createEnvProxy, getClient, setBindingHints } from '../bridge'
import { type DevflareConfig, loadConfig } from '../config'
import { createFetchEvent, runWithEventContext } from '../runtime/context'
import { extractBindingHints } from '../test/binding-hints'
import { buildSvelteKitLocalBindings, overlayLocalBindings } from './local-bindings'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * SvelteKit platform object shape
 */
export interface Platform {
	env: Record<string, unknown>
	context: ExecutionContext
	caches: CacheStorage
	cf: Record<string, unknown>
	/**
	 * Errors captured from `ctx.waitUntil()` rejections in dev mode.
	 * Drain via `drainWaitUntilErrors(platform)`.
	 */
	pendingErrors?: unknown[]
}

export interface DevflarePlatformOptions {
	/**
	 * WebSocket URL for the bridge connection
	 * @default 'ws://localhost:8787' (uses Miniflare port)
	 */
	bridgeUrl?: string

	/**
	 * Binding type hints for better proxy creation
	 * Keys are binding names, values are binding types
	 */
	hints?: BindingHints

	/**
	 * Local Node-side binding shims to prefer over the bridge-backed env.
	 * Used by the SvelteKit handle for bindings whose local API exposes
	 * synchronous properties or rich transformation objects.
	 */
	localBindings?: Record<string, unknown>
}

// -----------------------------------------------------------------------------
// Platform Proxy
// -----------------------------------------------------------------------------

/** Cached platform keyed by bridgeUrl + binding hint fingerprint */
let platformCache: { key: string; platform: Platform } | null = null

/**
 * Generate a stable fingerprint for binding hints so cached platforms are not
 * shared across configs with differing hint sets.
 */
function fingerprintHints(hints: BindingHints): string {
	const entries = Object.keys(hints)
		.sort()
		.map((name) => [name, hints[name]])
	return JSON.stringify(entries)
}

/**
 * Generate cache key from options
 */
function getPlatformCacheKey(bridgeUrl: string, hints: BindingHints): string {
	return `${bridgeUrl}\u0000${fingerprintHints(hints)}`
}

function shouldUseCachedPlatform(localBindings: Record<string, unknown>): boolean {
	return Object.keys(localBindings).length === 0
}

/**
 * Build a dev-mode ExecutionContext that records `waitUntil()` rejections on
 * the provided `pendingErrors` array. The original console.error log is kept
 * for parity with existing behavior.
 */
function createDevExecutionContext(pendingErrors: unknown[]): ExecutionContext {
	return {
		waitUntil: (promise: Promise<unknown>) => {
			promise.catch((err) => {
				console.error('[devflare] waitUntil error:', err)
				pendingErrors.push(err)
			})
		},
		passThroughOnException: () => {
			// No-op in dev mode
		}
	} as ExecutionContext
}

/**
 * Drain errors captured from `ctx.waitUntil()` calls on a dev platform.
 * Returns a snapshot of the pending errors and clears the buffer.
 */
export function drainWaitUntilErrors(platform: Platform): unknown[] {
	const buffer = platform.pendingErrors
	if (!buffer || buffer.length === 0) {
		return []
	}
	const drained = buffer.slice()
	buffer.length = 0
	return drained
}

/**
 * Create a platform object that routes bindings through the bridge
 *
 * Use this in dev mode to get access to Miniflare bindings via WebSocket RPC.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { dev } from '$app/environment'
 * import { createDevflarePlatform } from 'devflare/sveltekit'
 *
 * export async function handle({ event, resolve }) {
 *   if (dev && process.env.DEVFLARE_DEV) {
 *     // Override platform with bridge-connected proxy
 *     event.platform = await createDevflarePlatform({
 *       hints: {
 *         MY_KV: 'kv',
 *         MY_DO: 'do',
 *         MY_D1: 'd1',
 *         MY_R2: 'r2'
 *       }
 *     })
 *   }
 *   return resolve(event)
 * }
 * ```
 */
export async function createDevflarePlatform(
	options: DevflarePlatformOptions = {}
): Promise<Platform> {
	const {
		bridgeUrl = `ws://localhost:${process.env.DEVFLARE_BRIDGE_PORT ?? 8787}`,
		hints = {},
		localBindings = {}
	} = options

	const cacheKey = getPlatformCacheKey(bridgeUrl, hints)

	// Return cached platform if exists for this bridgeUrl + hint fingerprint
	if (shouldUseCachedPlatform(localBindings) && platformCache?.key === cacheKey) {
		return platformCache.platform
	}

	// Get/create bridge client
	const client = getClient({ url: bridgeUrl })

	// Connect to bridge
	await client.connect()

	// Create env proxy with hints
	const env = overlayLocalBindings(createEnvProxy({ client, hints, strict: true }), localBindings)

	// Create mock execution context that captures waitUntil rejections
	const pendingErrors: unknown[] = []
	const context = createDevExecutionContext(pendingErrors)

	// Create mock caches
	const caches = {
		default: createMockCache(),
		open: async (cacheName: string) => createMockCache()
	} as unknown as CacheStorage

	// Create mock cf object
	const cf: Record<string, unknown> = {
		colo: 'DEV',
		country: 'XX',
		city: 'Development',
		continent: 'XX',
		latitude: '0',
		longitude: '0',
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		region: 'Development',
		regionCode: 'DEV',
		asn: 0,
		asOrganization: 'Devflare Dev'
	}

	const platform: Platform = { env, context, caches, cf, pendingErrors }
	if (shouldUseCachedPlatform(localBindings)) {
		platformCache = { key: cacheKey, platform }
	}
	return platform
}

/**
 * Create a simple mock cache for dev mode
 * Note: Cloudflare's Cache interface differs from browser Cache API
 */
function createMockCache() {
	const store = new Map<string, Response>()

	return {
		async match(request: RequestInfo | URL): Promise<Response | undefined> {
			const key =
				typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
			return store.get(key)?.clone()
		},
		async put(request: RequestInfo | URL, response: Response): Promise<void> {
			const key =
				typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
			store.set(key, response.clone())
		},
		async delete(request: RequestInfo | URL): Promise<boolean> {
			const key =
				typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
			return store.delete(key)
		}
	} as unknown as Cache
}

/**
 * Reset the cached platform (for testing)
 */
export function resetPlatform(): void {
	platformCache = null
}

/**
 * Reset the cached config (for testing)
 */
export function resetConfigCache(): void {
	configCache = null
}

/**
 * Check if running in devflare dev mode
 */
export function isDevflareDev(): boolean {
	return process.env.DEVFLARE_DEV === 'true'
}

/**
 * Get the bridge port from environment
 */
export function getBridgePort(): number {
	return Number.parseInt(process.env.DEVFLARE_BRIDGE_PORT ?? '8787', 10)
}

// -----------------------------------------------------------------------------
// Auto-discover Hints from Config
// -----------------------------------------------------------------------------

/** Cached config promise keyed by cwd + explicit config path */
let configCache: {
	cwd: string
	configFile: string | undefined
	promise: Promise<DevflareConfig | null>
} | null = null

function getConfigFileFromEnv(): string | undefined {
	return process.env.DEVFLARE_CONFIG_PATH
}

async function loadConfigFromCurrentCwd(): Promise<DevflareConfig | null> {
	const cwd = process.cwd()
	const configFile = getConfigFileFromEnv()

	// Check if we have a cached promise for this cwd
	if (configCache?.cwd === cwd && configCache.configFile === configFile) {
		return configCache.promise
	}

	// Create new cache entry with promise (handles concurrent requests)
	const promise = loadConfig({ cwd, configFile }).catch((err) => {
		// Log error in debug mode
		if (process.env.DEVFLARE_DEBUG) {
			console.warn('[devflare] Failed to load config for hints:', err.message)
		}
		return null
	})

	configCache = { cwd, configFile, promise }

	return promise
}

async function loadPlatformOptionsFromConfig(): Promise<
	Pick<DevflarePlatformOptions, 'hints' | 'localBindings'>
> {
	const cwd = process.cwd()
	const config = await loadConfigFromCurrentCwd()
	if (!config) {
		return { hints: {}, localBindings: {} }
	}

	return {
		hints: extractBindingHints(config),
		localBindings: buildSvelteKitLocalBindings(config, cwd)
	}
}

function resolveWithPlatformContext<
	TEvent extends { platform?: unknown; request?: Request },
	TResolve extends (event: unknown) => Response | Promise<Response>
>(event: TEvent, resolve: TResolve, platform: Platform): Response | Promise<Response> {
	if (!(event.request instanceof Request)) {
		return resolve(event)
	}

	const fetchEvent = createFetchEvent(event.request, platform.env, platform.context)
	return runWithEventContext(fetchEvent, () => resolve(event))
}

async function createPlatformWithRequestContext<
	TEvent extends { platform?: unknown; request?: Request },
	TResolve extends (event: unknown) => Response | Promise<Response>
>(event: TEvent, resolve: TResolve, options: DevflarePlatformOptions): Promise<Response> {
	const platform = await createDevflarePlatform(options)
	event.platform = platform as typeof event.platform
	return resolveWithPlatformContext(event, resolve, platform)
}

async function getAutoPlatformOptions(): Promise<DevflarePlatformOptions> {
	const options = await loadPlatformOptionsFromConfig()
	setBindingHints(options.hints ?? {})
	return options
}

async function getCustomPlatformOptions(
	options: DevflarePlatformOptions
): Promise<DevflarePlatformOptions> {
	if (options.hints) {
		setBindingHints(options.hints)
	}

	return options
}

// -----------------------------------------------------------------------------
// SvelteKit Handle
// -----------------------------------------------------------------------------

/**
 * Options for createHandle
 */
export interface CreateHandleOptions extends DevflarePlatformOptions {
	/**
	 * Custom condition to check if devflare should be enabled.
	 * Defaults to checking `dev && process.env.DEVFLARE_DEV === 'true'`
	 */
	shouldEnable?: () => boolean
}

/**
 * Create a SvelteKit handle that automatically injects the devflare platform
 * in development mode. This eliminates the need for boilerplate in hooks.server.ts.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createHandle } from 'devflare/sveltekit'
 *
 * export const handle = createHandle({
 *   hints: {
 *     MY_KV: 'kv',
 *     MY_DO: 'do',
 *     MY_D1: 'd1',
 *     MY_R2: 'r2'
 *   }
 * })
 * ```
 *
 * @example Composing with other handles using SvelteKit's sequence
 * ```ts
 * import { sequence } from '@sveltejs/kit/hooks'
 * import { createHandle } from 'devflare/sveltekit'
 *
 * const devflareHandle = createHandle({ hints: { ... } })
 * const authHandle: Handle = async ({ event, resolve }) => { ... }
 *
 * export const handle = sequence(devflareHandle, authHandle)
 * ```
 */
export function createHandle<
	T extends {
		event: { platform?: unknown; request?: Request }
		resolve: (event: unknown) => Response | Promise<Response>
	}
>(options: CreateHandleOptions = {}): (input: T) => Promise<Response> {
	const { shouldEnable, ...platformOptions } = options

	return async ({ event, resolve }) => {
		// Check if devflare should be enabled
		const enabled = shouldEnable
			? shouldEnable()
			: process.env.NODE_ENV !== 'production' && process.env.DEVFLARE_DEV === 'true'

		if (enabled) {
			try {
				return await createPlatformWithRequestContext(
					event,
					resolve,
					await getCustomPlatformOptions(platformOptions)
				)
			} catch (error) {
				console.error('[devflare] Failed to create platform:', error)
				// Fall through to default platform
			}
		}

		return resolve(event)
	}
}

// -----------------------------------------------------------------------------
// Pre-configured Handle (Auto-loads hints from config)
// -----------------------------------------------------------------------------

/**
 * Pre-configured SvelteKit handle that auto-loads binding hints from devflare.config.ts.
 *
 * This is the simplest way to integrate devflare with SvelteKit:
 *
 * @example Simplest usage — just re-export
 * ```ts
 * // src/hooks.server.ts
 * export { handle } from 'devflare/sveltekit'
 * ```
 *
 * @example With other handles
 * ```ts
 * // src/hooks.server.ts
 * import { sequence } from '@sveltejs/kit/hooks'
 * import { handle as devflareHandle } from 'devflare/sveltekit'
 *
 * const authHandle: Handle = async ({ event, resolve }) => { ... }
 *
 * export const handle = sequence(devflareHandle, authHandle)
 * ```
 */
export const handle = async <
	T extends {
		event: { platform?: unknown; request?: Request }
		resolve: (event: unknown) => Response | Promise<Response>
	}
>(
	input: T
): Promise<Response> => {
	const { event, resolve } = input

	// Check if devflare should be enabled
	const enabled = process.env.NODE_ENV !== 'production' && process.env.DEVFLARE_DEV === 'true'

	if (enabled) {
		try {
			return await createPlatformWithRequestContext(event, resolve, await getAutoPlatformOptions())
		} catch (error) {
			console.error('[devflare] Failed to create platform:', error)
			// Fall through to default platform
		}
	}

	return resolve(event)
}
