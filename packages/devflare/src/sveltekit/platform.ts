// =============================================================================
// SvelteKit Platform Integration
// =============================================================================
// Provides a `platform` object that uses the bridge to communicate with Miniflare
// in development mode, while passing through the real platform in production.
// =============================================================================

import { loadConfig, type DevflareConfig } from '../config'
import { createEnvProxy, getClient, type BindingHints } from '../bridge'

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
}

// -----------------------------------------------------------------------------
// Platform Proxy
// -----------------------------------------------------------------------------

/** Cached platform keyed by bridgeUrl */
let platformCache: { key: string; platform: Platform } | null = null

/**
 * Generate cache key from options
 */
function getPlatformCacheKey(bridgeUrl: string): string {
	return bridgeUrl
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
		hints = {}
	} = options

	const cacheKey = getPlatformCacheKey(bridgeUrl)

	// Return cached platform if exists for this bridgeUrl
	if (platformCache?.key === cacheKey) {
		return platformCache.platform
	}

	// Get/create bridge client
	const client = getClient({ url: bridgeUrl })

	// Connect to bridge
	await client.connect()

	// Create env proxy with hints
	const env = createEnvProxy({ client, hints })

	// Create mock execution context
	const context = {
		waitUntil: (promise: Promise<unknown>) => {
			// In dev mode, we just await the promise
			promise.catch((err) => {
				console.error('[devflare] waitUntil error:', err)
			})
		},
		passThroughOnException: () => {
			// No-op in dev mode
		}
	} as ExecutionContext

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

	const platform: Platform = { env, context, caches, cf }
	platformCache = { key: cacheKey, platform }
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
			const key = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
			return store.get(key)?.clone()
		},
		async put(request: RequestInfo | URL, response: Response): Promise<void> {
			const key = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
			store.set(key, response.clone())
		},
		async delete(request: RequestInfo | URL): Promise<boolean> {
			const key = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
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
	return parseInt(process.env.DEVFLARE_BRIDGE_PORT ?? '8787', 10)
}

// -----------------------------------------------------------------------------
// Auto-discover Hints from Config
// -----------------------------------------------------------------------------

/** Cached config promise keyed by cwd */
let configCache: { cwd: string; promise: Promise<DevflareConfig | null> } | null = null

/**
 * Extract binding hints from devflare config
 * Covers: kv, d1, r2, durableObjects, queues (producers), services
 */
function extractHintsFromConfig(config: DevflareConfig): BindingHints {
	const hints: BindingHints = {}
	const bindings = config.bindings

	if (!bindings) return hints

	// KV namespaces
	if (bindings.kv) {
		for (const name of Object.keys(bindings.kv)) {
			hints[name] = 'kv'
		}
	}

	// D1 databases
	if (bindings.d1) {
		for (const name of Object.keys(bindings.d1)) {
			hints[name] = 'd1'
		}
	}

	// R2 buckets
	if (bindings.r2) {
		for (const name of Object.keys(bindings.r2)) {
			hints[name] = 'r2'
		}
	}

	// Durable Objects
	if (bindings.durableObjects) {
		for (const name of Object.keys(bindings.durableObjects)) {
			hints[name] = 'do'
		}
	}

	// Queue producers
	if (bindings.queues?.producers) {
		for (const name of Object.keys(bindings.queues.producers)) {
			hints[name] = 'queue'
		}
	}

	// Service bindings
	if (bindings.services) {
		for (const name of Object.keys(bindings.services)) {
			hints[name] = 'service'
		}
	}

	// AI binding (single binding named in config)
	if (bindings.ai?.binding) {
		hints[bindings.ai.binding] = 'ai'
	}

	// Send Email bindings
	if (bindings.sendEmail) {
		for (const name of Object.keys(bindings.sendEmail)) {
			hints[name] = 'sendEmail'
		}
	}

	return hints
}

/**
 * Load config and extract hints (cached by cwd)
 */
async function loadHintsFromConfig(): Promise<BindingHints> {
	const cwd = process.cwd()

	// Check if we have a cached promise for this cwd
	if (configCache?.cwd === cwd) {
		const config = await configCache.promise
		return config ? extractHintsFromConfig(config) : {}
	}

	// Create new cache entry with promise (handles concurrent requests)
	const promise = loadConfig({ cwd }).catch((err) => {
		// Log error in debug mode
		if (process.env.DEVFLARE_DEBUG) {
			console.warn('[devflare] Failed to load config for hints:', err.message)
		}
		return null
	})

	configCache = { cwd, promise }

	const config = await promise
	return config ? extractHintsFromConfig(config) : {}
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
export function createHandle<T extends { event: { platform?: unknown }; resolve: (event: unknown) => Response | Promise<Response> }>(
	options: CreateHandleOptions = {}
): (input: T) => Promise<Response> {
	const { shouldEnable, ...platformOptions } = options

	return async ({ event, resolve }) => {
		// Check if devflare should be enabled
		const enabled = shouldEnable
			? shouldEnable()
			: (process.env.NODE_ENV !== 'production' && process.env.DEVFLARE_DEV === 'true')

		if (enabled) {
			try {
				const platform = await createDevflarePlatform(platformOptions)
				event.platform = platform as typeof event.platform
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
export const handle = async <T extends { event: { platform?: unknown }; resolve: (event: unknown) => Response | Promise<Response> }>(
	input: T
): Promise<Response> => {
	const { event, resolve } = input

	// Check if devflare should be enabled
	const enabled = process.env.NODE_ENV !== 'production' && process.env.DEVFLARE_DEV === 'true'

	if (enabled) {
		try {
			// Auto-load hints from config
			const hints = await loadHintsFromConfig()
			const platform = await createDevflarePlatform({ hints })
			event.platform = platform as typeof event.platform
		} catch (error) {
			console.error('[devflare] Failed to create platform:', error)
			// Fall through to default platform
		}
	}

	return resolve(event)
}
