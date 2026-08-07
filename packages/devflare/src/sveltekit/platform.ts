// =============================================================================
// SvelteKit Platform Integration
// =============================================================================
// Provides a `platform` object that uses the bridge to communicate with Miniflare
// in development mode, while passing through the real platform in production.
// =============================================================================

import { type BindingHints, createEnvProxy, getClient, setBindingHints } from '../bridge'
import { type DevflareConfig, loadConfig } from '../config'
import {
	type DevRuntimeReading,
	getRuntimeStatusUrl,
	readDevRuntimeState
} from '../dev-server/runtime-status'
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
 * Budget for riding out a bridge outage NOBODY has vouched for — either because no dev coordinator
 * published a status channel (a hand-started `vite dev`, an older dev server) or because the one that
 * did says its runtime is up. Long enough for the sub-second gap of a socket that is merely mid-accept,
 * short enough that a bridge which is genuinely down surfaces promptly instead of hanging every request.
 */
const BRIDGE_CONNECT_MAX_WAIT_MS = 3000
/**
 * Budget while the dev coordinator affirmatively says its runtime is starting or coming back.
 *
 * Far longer than {@link BRIDGE_CONNECT_MAX_WAIT_MS}, and safely so: it applies only while something
 * that survives the outage keeps promising to end it, and collapses back the moment that promise stops.
 * It has to be this generous because the coordinator's own recovery is — three failed probes at 2s each
 * before a death is even declared, then a rebuild and a re-migration. The old flat 3s could not outlast
 * the DETECTION half alone, which is why every such outage reached the app as a lost binding.
 */
const BRIDGE_CONNECT_RELOAD_MAX_WAIT_MS = 30_000
/** Delay between bridge (re)connect attempts. */
const BRIDGE_CONNECT_RETRY_DELAY_MS = 150

/** Which of the mutually exclusive causes left this request without bindings. */
export type BridgeUnavailableReason =
	/** The dev coordinator did not answer — `devflare dev` is not running. */
	| 'coordinator-unreachable'
	/** The coordinator gave up rebuilding its runtime; nothing further is coming. */
	| 'runtime-failed'
	/** The coordinator is shutting down. */
	| 'coordinator-stopping'
	/** The coordinator kept saying "coming back", but not within the budget. */
	| 'reload-timeout'
	/** The bridge simply refused for the whole budget, with nobody to explain why. */
	| 'connect-timeout'

/**
 * The bridge could not be reached for this request, and WHY — in devflare's own words.
 *
 * The message matters as much as the type. Before this existed the failure reached the developer as
 * their own app's "`<BINDING>` binding is missing — run via `devflare dev`", which names a cause that
 * is not the cause and prescribes a fix they have already applied.
 */
export class BridgeUnavailableError extends Error {
	readonly reason: BridgeUnavailableReason

	constructor(reason: BridgeUnavailableReason, message: string, cause?: unknown) {
		super(message, { cause })
		this.name = 'BridgeUnavailableError'
		this.reason = reason
	}
}

/** One sentence per cause, written for whoever is reading their dev console. */
function explainBridgeFailure(reason: BridgeUnavailableReason, waitedMs: number): string {
	switch (reason) {
		case 'coordinator-unreachable':
			return 'the devflare dev coordinator is not answering, so nothing is going to bring the local runtime back — is `devflare dev` still running?'
		case 'runtime-failed':
			return 'devflare dev gave up rebuilding the local runtime — the underlying failure is in its output.'
		case 'coordinator-stopping':
			return 'devflare dev is shutting down.'
		case 'reload-timeout':
			return `the local runtime was still reloading after ${waitedMs}ms.`
		case 'connect-timeout':
			return `the bridge refused a connection for ${waitedMs}ms — the local runtime may not be running.`
	}
}

/**
 * Build the error a failed connect surfaces.
 *
 * The last transport error is kept BOTH as `cause` and inline in the message: the message is what
 * reaches a console or an error overlay, and dropping "WebSocket connection failed" from it would
 * trade one incomplete story for another.
 */
function bridgeUnavailable(
	reason: BridgeUnavailableReason,
	options: { waitedMs: number; bridgeUrl?: string; cause?: unknown }
): BridgeUnavailableError {
	const where = options.bridgeUrl ? ` (bridge ${options.bridgeUrl})` : ''
	const cause = options.cause instanceof Error ? `: ${options.cause.message}` : ''
	const message = `[devflare] Cloudflare bindings are unavailable — ${explainBridgeFailure(reason, options.waitedMs)}${where}${cause}`
	return new BridgeUnavailableError(reason, message, options.cause)
}

/** Readings that mean waiting is pointless, mapped to the reason they are reported as. */
const HOPELESS_READINGS: Partial<Record<DevRuntimeReading, BridgeUnavailableReason>> = {
	unreachable: 'coordinator-unreachable',
	failed: 'runtime-failed',
	stopping: 'coordinator-stopping'
}

/**
 * Connect to the bridge, riding out an outage for exactly as long as it is worth riding out.
 *
 * The bridge endpoint is served from inside the workerd runtime, so it goes away on every reload of
 * that runtime — an HMR worker change, a config change, a watchdog rebuild. A single per-request
 * `connect()` rejects the instant the socket is refused, which the handle turns into "no bindings for
 * this request", and an unrelated route 500s mid-reload.
 *
 * Retrying fixes that, but a flat budget cannot: the app cannot see the difference between a runtime
 * that is coming back and a dev server that was never started, and those two want opposite answers —
 * wait as long as it takes, versus fail immediately. `readRuntimeState` is what tells them apart. Ask
 * the coordinator, which is a plain Node process that outlives every runtime reload:
 *
 * - it says `reloading`/`starting` → keep waiting on the generous budget, re-asking each round so the
 *   budget collapses the moment it stops promising;
 * - it says `ready` → the modest budget; the runtime is up, so a refusal that persists is a real fault;
 * - it says `failed`/`stopping`, or does not answer at all → fail NOW. This is the case a long budget
 *   used to punish, and the reason the budget could never be long enough to cover a rebuild.
 *
 * With no reader supplied the behaviour is unchanged from before this existed: the modest budget, then
 * the failure. That is the path a hand-started `vite dev` takes.
 *
 * Exported for unit testing; `sleep`/`now` are injectable so the retry schedule is asserted without real time.
 *
 * @param connect - the bridge client's `connect()`; a fresh attempt each call (the client dedups in-flight ones).
 * @param options - the two budgets, the delay between attempts, the optional coordinator reader, the
 *   `bridgeUrl` to name in the error, and injectable `sleep`/`now` for tests.
 * @throws {BridgeUnavailableError} naming which of the causes ended the attempt.
 */
export async function connectBridgeWithRetry(
	connect: () => Promise<void>,
	options: {
		maxWaitMs?: number
		reloadMaxWaitMs?: number
		retryDelayMs?: number
		readRuntimeState?: () => Promise<DevRuntimeReading>
		bridgeUrl?: string
		sleep?: (ms: number) => Promise<void>
		now?: () => number
	} = {}
): Promise<void> {
	const maxWaitMs = options.maxWaitMs ?? BRIDGE_CONNECT_MAX_WAIT_MS
	const reloadMaxWaitMs = options.reloadMaxWaitMs ?? BRIDGE_CONNECT_RELOAD_MAX_WAIT_MS
	const retryDelayMs = options.retryDelayMs ?? BRIDGE_CONNECT_RETRY_DELAY_MS
	const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	const now = options.now ?? Date.now
	const readRuntimeState = options.readRuntimeState

	const startedAt = now()
	// The generous budget is a ceiling, never a shortening: a caller that asks for a longer plain
	// `maxWaitMs` than the reload budget keeps it.
	const reloadDeadline = startedAt + Math.max(maxWaitMs, reloadMaxWaitMs)
	let deadline = startedAt + maxWaitMs
	let timedOutReason: BridgeUnavailableReason = 'connect-timeout'

	for (;;) {
		try {
			await connect()
			return
		} catch (error) {
			if (readRuntimeState) {
				const state = await readRuntimeState()
				const hopeless = HOPELESS_READINGS[state]
				if (hopeless) {
					throw bridgeUnavailable(hopeless, {
						waitedMs: now() - startedAt,
						bridgeUrl: options.bridgeUrl,
						cause: error
					})
				}

				const comingBack = state !== 'ready'
				deadline = comingBack ? reloadDeadline : startedAt + maxWaitMs
				timedOutReason = comingBack ? 'reload-timeout' : 'connect-timeout'
			}

			// Stop once another delay would run past the budget.
			if (now() + retryDelayMs >= deadline) {
				throw bridgeUnavailable(timedOutReason, {
					waitedMs: now() - startedAt,
					bridgeUrl: options.bridgeUrl,
					cause: error
				})
			}
			await sleep(retryDelayMs)
		}
	}
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

	// Connect to bridge — riding out an outage the dev coordinator says it is ending, so a mid-reload
	// request keeps its bindings instead of 500ing with a "binding is missing" error. The status URL is
	// published by `devflare dev` into the process it spawns; without one the retry keeps its old,
	// modest budget rather than assuming anybody is coming.
	const runtimeStatusUrl = getRuntimeStatusUrl()
	await connectBridgeWithRetry(() => client.connect(), {
		bridgeUrl,
		readRuntimeState: runtimeStatusUrl ? () => readDevRuntimeState(runtimeStatusUrl) : undefined
	})

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

/**
 * A platform that serves the request but refuses its bindings, with the real reason.
 *
 * The third option, and the right one. Failing the whole request would turn a 200ms bridge blip into a
 * broken dev server for everything that never touches a binding — an asset, a static page, the Vite
 * client. Serving unbridged (what this used to do, by leaving `event.platform` unset) kept those
 * working but handed every request that DID touch a binding to the app's own "`<BINDING>` is missing —
 * run via `devflare dev`", which blames the developer for the one thing they are already doing.
 *
 * So: serve, and let the absence describe itself at the moment it is actually reached.
 *
 * The tradeoff, deliberately taken: an app that treats a missing binding as a soft signal
 * (`if (!platform.env.DB) …`) now throws where it used to branch. In dev, under a coordinator that has
 * just told us the runtime is gone, a loud cause beats a silent fallback down a path the developer did
 * not know they were on.
 *
 * @param cause - the failure to report; thrown as-is on the first binding read.
 * @returns a platform whose `context`/`caches`/`cf` work normally and whose `env` throws.
 */
function createUnavailablePlatform(cause: unknown): Platform {
	const pendingErrors: unknown[] = []
	const env = new Proxy({} as Record<string, unknown>, {
		get(_target, prop: string | symbol) {
			// Symbols are never a binding; they are how a runtime inspects an object it was handed
			// (`Symbol.toStringTag`, node's inspect hooks), and throwing at THOSE would move the failure
			// to a console.log far from any binding. `then` for the same reason: were this object ever
			// awaited or resolved through, V8 reads `.then` first, and a throw there is unreadable.
			if (typeof prop !== 'string' || prop === 'then') return undefined
			throw cause
		},
		has: () => false,
		ownKeys: () => [],
		getOwnPropertyDescriptor: () => undefined
	})

	return {
		env,
		context: createDevExecutionContext(pendingErrors),
		caches: {
			default: createMockCache(),
			open: async () => createMockCache()
		} as unknown as CacheStorage,
		cf: {},
		pendingErrors
	}
}

/**
 * Build this request's dev platform, degrading to {@link createUnavailablePlatform} instead of throwing.
 *
 * Deliberately covers ONLY the setup: resolving options and connecting. An error raised by the request
 * itself belongs to the request. Catching that here (as one try around setup AND `resolve()` used to)
 * blamed it on the platform, hid the real cause, and re-ran the whole request — repeating every side
 * effect and running the second pass outside the context {@link resolveWithPlatformContext} established
 * for the first.
 *
 * @param resolveOptions - produces the platform options; may itself fail (config load, hint extraction).
 * @returns a usable platform, or one that reports `error` when a binding is read.
 */
async function createPlatformOrReport(
	resolveOptions: () => Promise<DevflarePlatformOptions>
): Promise<Platform> {
	try {
		return await createDevflarePlatform(await resolveOptions())
	} catch (error) {
		// The error's own message now carries the diagnosis; the object is logged whole so its stack
		// and `cause` survive. The old prefix said "Failed to create platform", which was true and
		// useless — it named the symptom devflare saw, not the thing the developer has to fix.
		console.error('[devflare] Cloudflare bindings are unavailable for this request:', error)
		return createUnavailablePlatform(error)
	}
}

/**
 * Attach a built platform to the event and resolve the request under its context.
 *
 * @param event - the SvelteKit request event.
 * @param resolve - SvelteKit's resolve for this handle.
 * @param platform - the platform from {@link createPlatformOrReport}.
 */
function serveWithPlatform<
	TEvent extends { platform?: unknown; request?: Request },
	TResolve extends (event: unknown) => Response | Promise<Response>
>(event: TEvent, resolve: TResolve, platform: Platform): Response | Promise<Response> {
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
			// Always a platform, even when the bridge is gone — see createUnavailablePlatform.
			return serveWithPlatform(
				event,
				resolve,
				await createPlatformOrReport(() => getCustomPlatformOptions(platformOptions))
			)
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
		// Always a platform, even when the bridge is gone — see createUnavailablePlatform.
		return serveWithPlatform(event, resolve, await createPlatformOrReport(getAutoPlatformOptions))
	}

	return resolve(event)
}
