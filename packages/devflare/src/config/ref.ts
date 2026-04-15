// =============================================================================
// ref() — Cross-config referencing for multi-worker setups
// =============================================================================
// Provides type-safe references to other worker configs for service bindings
// and cross-worker Durable Object access.
//
// Usage in devflare.config.ts:
//   const mathWorker = ref(() => import('./math-worker/devflare.config'))
//
//   bindings: {
//     services: {
//       MATH_SERVICE: mathWorker.worker           // Default worker.ts export
//       ADMIN: mathWorker.worker('AdminEntrypoint')  // Named entrypoint
//     },
//     durableObjects: {
//       COUNTER: doService.COUNTER                // Cross-worker DO binding
//     }
//   }
//
// With explicit name override:
//   const mathWorker = ref('custom-name', () => import('./math-worker/devflare.config'))
//
// Type Hints for Entrypoints:
//   After running `devflare types`, the referenced config will have generated
//   entrypoint types that enable autocomplete in .worker('...') calls.
//
// Naming Conventions:
//   worker.ts    — Default worker export (transformed to WorkerEntrypoint)
//   ep.*.ts      — Named entrypoints (classes extending WorkerEntrypoint)
//   do.*.ts      — Durable Objects (classes extending DurableObject)
//   wf.*.ts      — Workflows (classes extending Workflow)
// =============================================================================

import type { DevflareConfigInput } from './schema'
import type { TypedConfig } from './define'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Extract entrypoint type from a TypedConfig
 * Falls back to string if no type parameter was provided
 */
type ExtractEntrypoints<TConfig> = TConfig extends TypedConfig<infer E> ? E : string

/**
 * Extract the config type from a dynamic import function
 * Handles both `{ default: Config }` and direct `Config` module shapes
 */
type ExtractConfig<TImport> = TImport extends () => Promise<infer TModule>
	? TModule extends { default: infer TConfig }
	? TConfig
	: TModule
	: DevflareConfigInput

/**
 * Dynamic import function type for config modules
 */
type ConfigImport<T extends DevflareConfigInput = DevflareConfigInput> =
	() => Promise<{ default: T } | T>

/**
 * Worker binding reference - returned by ref().worker or ref().worker('entrypoint')
 */
export interface WorkerBinding {
	/** Worker name (resolved lazily) */
	readonly service: string
	/** Entrypoint class name (if specified) */
	readonly entrypoint?: string
	/** @internal Reference for test context setup - contains import function and metadata */
	readonly __ref?: RefResult
}

/**
 * Durable Object binding reference - returned by ref().DO_NAME
 * Named differently from schema's DurableObjectBinding to avoid confusion
 */
export interface DOBindingRef {
	/** DO class name */
	readonly className: string
	/** Worker name that hosts this DO (for cross-worker access) */
	readonly scriptName: string
	/** @internal Reference for test context setup */
	readonly __ref?: RefResult
}

/**
 * Template literal type for matching uppercase DO binding names.
 * This allows the index signature to return DOBindingRef for UPPER_CASE
 * property access while keeping specific types for known properties.
 */
type UpperCaseName = `${Uppercase<string>}`

/**
 * Accessor for worker bindings - can be accessed directly or called with entrypoint
 * @template TEntrypoints - Union of valid entrypoint names from config
 */
export interface WorkerBindingAccessor<TEntrypoints extends string = string> extends WorkerBinding {
	/**
	 * Get a service binding with a specific named entrypoint
	 * @param entrypoint - The entrypoint class name from ep.*.ts files
	 */
	(entrypoint: TEntrypoints): WorkerBinding
}

/**
 * Result of ref() - a lazy proxy to the referenced config
 * Supports dynamic DO binding access via property lookup (e.g., ref.COUNTER)
 */
export interface RefResult<TConfig extends DevflareConfigInput = DevflareConfigInput> {
	/**
	 * The worker name from the config (or overridden)
	 * Accessing this triggers resolution if not already resolved.
	 */
	readonly name: string

	/**
	 * Raw config object (for advanced usage)
	 * Accessing this triggers resolution if not already resolved.
	 */
	readonly config: TConfig

	/**
	 * Path to the config file (for resolution)
	 */
	readonly configPath: string

	/**
	 * Get a service binding to this worker's default export (WorkerEntrypoint)
	 * Call as function to specify entrypoint: .worker('AdminEntrypoint')
	 * Or access directly for default export: .worker
	 */
	readonly worker: WorkerBindingAccessor<ExtractEntrypoints<TConfig>>

	/**
	 * @internal The import function for lazy resolution
	 */
	readonly __import: ConfigImport<TConfig>

	/**
	 * @internal Optional name override
	 */
	readonly __nameOverride?: string

	/**
	 * Resolve the reference and get the config
	 */
	resolve(): Promise<{ name: string; config: TConfig; configPath: string }>

	/**
	 * Dynamic DO binding access: ref.COUNTER, ref.RATE_LIMITER, etc.
	 * Returns a DOBindingRef for cross-worker DO access.
	 * Uses template literal type to match UPPER_CASE binding names only.
	 */
	readonly [K: UpperCaseName]: DOBindingRef
}

// -----------------------------------------------------------------------------
// Internal State — Resolution Cache
// -----------------------------------------------------------------------------

interface ResolvedData<TConfig = DevflareConfigInput> {
	name: string
	config: TConfig
	configPath: string
}

const resolvedCache = new WeakMap<RefResult, ResolvedData>()
const pendingResolutions = new WeakMap<RefResult, Promise<ResolvedData>>()

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Create a typed reference to another worker's config.
 * Returns a lazy proxy - the import is resolved only when needed.
 *
 * @param nameOrImport - Worker name override, OR the import function
 * @param maybeImport - Import function (if first arg is name)
 * @returns RefResult proxy with lazy access to config metadata
 *
 * @example
 * // Basic usage - name from config
 * const mathWorker = ref(() => import('./math-worker/devflare.config'))
 *
 * export default defineConfig({
 *   bindings: {
 *     services: {
 *       MATH: mathWorker.worker                    // Default export
 *       // or: mathWorker.worker('MathService')    // Specific entrypoint
 *     }
 *   }
 * })
 *
 * @example
 * // With name override
 * const mathWorker = ref('custom-math', () => import('./math-worker/devflare.config'))
 */
export function ref<TImport extends () => Promise<{ default: DevflareConfigInput } | DevflareConfigInput>>(
	nameOrImport: string | TImport,
	maybeImport?: TImport
): RefResult<ExtractConfig<TImport>>
export function ref<TImport extends () => Promise<{ default: DevflareConfigInput } | DevflareConfigInput>>(
	nameOrImport: string | TImport,
	maybeImport?: TImport
): RefResult<ExtractConfig<TImport>> {
	type TConfig = ExtractConfig<TImport>
	const nameOverride = typeof nameOrImport === 'string' ? nameOrImport : undefined
	const importFn = (typeof nameOrImport === 'function' ? nameOrImport : maybeImport!) as unknown as ConfigImport<TConfig>

	if (!importFn) {
		throw new Error('ref() requires an import function')
	}

	// Extract the import path from the function's source code
	const fnSource = importFn.toString()
	const importMatch = fnSource.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/)
	const configPath = importMatch?.[1] ?? '<pending>'

	// Helper to resolve the config
	async function doResolve(): Promise<ResolvedData<TConfig>> {
		// Check cache first
		const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
		if (cached) return cached

		// Check if resolution is in progress
		const pending = pendingResolutions.get(proxy)
		if (pending) return pending as Promise<ResolvedData<TConfig>>

		// Start resolution
		const promise = (async () => {
			const module = await importFn()
			const config = ('default' in module ? module.default : module) as TConfig

			if (!config.name && !nameOverride) {
				throw new Error('Referenced config must have a "name" property')
			}

			const resolved: ResolvedData<TConfig> = {
				name: nameOverride ?? config.name,
				config,
				configPath
			}

			resolvedCache.set(proxy, resolved)
			return resolved
		})()

		pendingResolutions.set(proxy, promise as Promise<ResolvedData>)
		return promise
	}

	// Helper to get resolved value synchronously (throws if not resolved)
	function getResolved(): ResolvedData<TConfig> {
		const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
		if (cached) return cached
		throw new Error(
			'ref() not yet resolved. Call ref().resolve() first, or use top-level await ' +
			'in your config file to resolve all refs before exporting.'
		)
	}

	// Create worker binding (deferred - doesn't need resolution immediately)
	function createWorkerBinding(entrypoint?: string): WorkerBinding {
		return {
			// Service name is deferred - will be resolved when config is loaded
			get service() {
				// Try to get from cache, but don't throw if not resolved yet
				const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
				if (cached) return cached.name
				// If name override is provided, use it directly
				if (nameOverride) return nameOverride
				// Otherwise, indicate pending (this will be resolved by test context)
				return '<pending>'
			},
			entrypoint,
			__ref: proxy
		}
	}

	// Worker accessor using a Proxy to defer property access
	const workerAccessor = new Proxy(
		(entrypoint: string) => createWorkerBinding(entrypoint),
		{
			get(target, prop) {
				if (prop === 'service') {
					const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
					if (cached) return cached.name
					if (nameOverride) return nameOverride
					return '<pending>'
				}
				if (prop === 'entrypoint') return undefined
				if (prop === '__ref') return proxy
				return Reflect.get(target, prop)
			}
		}
	) as WorkerBindingAccessor

	// Create DO binding for cross-worker access
	function createDOBinding(bindingName: string): DOBindingRef {
		return {
			// className is a getter that resolves lazily from the config
			get className() {
				const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
				if (cached?.config.bindings?.durableObjects) {
					const doBindings = cached.config.bindings.durableObjects as Record<string, unknown>
					const doConfig = doBindings[bindingName]
					if (typeof doConfig === 'string') {
						return doConfig
					} else if (doConfig && typeof doConfig === 'object' && 'className' in doConfig) {
						return (doConfig as { className: string }).className
					}
				}
				// Default to binding name if not resolved (will be updated after resolve())
				return bindingName
			},
			get scriptName() {
				// Worker name for cross-worker access
				const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
				if (cached) return cached.name
				if (nameOverride) return nameOverride
				return '<pending>'
			},
			__ref: proxy
		}
	}

	// Known properties on RefResult (not DO bindings)
	const knownProps = new Set(['name', 'config', 'configPath', 'worker', '__import', '__nameOverride', 'resolve', 'then'])

	// Create the proxy object with dynamic DO binding support
	const proxyTarget = {
		get name() { return getResolved().name },
		get config() { return getResolved().config },
		configPath,
		worker: workerAccessor,
		__import: importFn,
		__nameOverride: nameOverride,
		resolve: doResolve
	}

	const proxy = new Proxy(proxyTarget, {
		get(target, prop) {
			// Handle known properties
			if (typeof prop === 'string' && knownProps.has(prop)) {
				return Reflect.get(target, prop)
			}

			// Handle symbol properties (like Symbol.toStringTag)
			if (typeof prop === 'symbol') {
				return Reflect.get(target, prop)
			}

			// Dynamic DO binding access: ref.COUNTER, ref.RATE_LIMITER, etc.
			// Property names that are UPPER_CASE are assumed to be DO bindings
			if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) {
				return createDOBinding(prop)
			}

			return Reflect.get(target, prop)
		},
		has(target, prop) {
			// Known props + any UPPER_CASE prop for DO bindings
			if (typeof prop === 'string') {
				if (knownProps.has(prop)) return true
				if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return true
			}
			return Reflect.has(target, prop)
		}
	}) as unknown as RefResult<TConfig>

	return proxy
}
