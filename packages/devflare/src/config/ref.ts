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
	/**
	 * Worker name that hosts this DO (for cross-worker access).
	 *
	 * Prefer the `kind` discriminator below for branching; reach for
	 * `scriptName` only when you need the actual script identifier.
	 */
	readonly scriptName: string
	/**
	 * Discriminator: `ref()`-produced DO bindings are always
	 * `'cross-worker'` because they target a host worker imported via a
	 * separate `devflare.config`. Bindings on the same worker are emitted
	 * directly via `bindings.durableObjects` and surface as a
	 * `NormalizedDOBinding` with `kind: 'local'`.
	 */
	readonly kind: 'cross-worker'
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
const PENDING_REF_VALUE = '<pending>'

// -----------------------------------------------------------------------------
// Config Path Extraction
// -----------------------------------------------------------------------------

/**
 * Extract the import specifier string from an import-thunk function's source.
 *
 * Uses a narrow regex over `fn.toString()`. To avoid returning bogus paths for
 * minified or hand-written functions that do not contain a parseable
 * `import(...)` call, the result is validated before being returned.
 *
 * Throws a clear error instead of returning a silent placeholder when the
 * function source is not in a recognized shape.
 */
function extractConfigPathFromImportFn(
	fn: (...args: unknown[]) => unknown
): string {
	let source: string
	try {
		source = Function.prototype.toString.call(fn)
	} catch {
		// Exotic function (bound/native/Proxy) — treat as unresolved until
		// runtime resolution and fail loudly only when the path is actually
		// needed.
		return PENDING_REF_VALUE
	}

	// Functions that do not contain a dynamic `import(...)` at all (e.g. the
	// mock thunks used in tests and in programmatic test contexts) are treated
	// as having a pending config path — not an error. The path is only
	// consulted by consumers that need it and those consumers already handle
	// the pending sentinel.
	if (!/import\s*\(/.test(source)) {
		return PENDING_REF_VALUE
	}

	const match = source.match(/import\s*\(\s*(['"`])([^'"`]+)\1\s*\)/)
	const raw = match?.[2]

	if (!raw || raw.length === 0) {
		throw new Error(
			'ref() could not extract a config path from the import function source. '
			+ 'The specifier must be a static string literal — dynamic or computed '
			+ 'specifiers (e.g. template literals with expressions) are not supported. '
			+ 'If this input has been minified, pass an unminified config source.'
		)
	}

	// Reject template literals with embedded expressions — the resulting
	// path is dynamic and can only be resolved at runtime.
	if (match?.[1] === '`' && /\$\{/.test(raw)) {
		throw new Error(
			'ref() import specifier is a template literal with an embedded expression. '
			+ 'The specifier must be a static string literal so the config path can '
			+ 'be resolved ahead of time.'
		)
	}

	// Obvious minification artefact: a 1-char specifier with no separator or
	// extension is almost certainly the product of a bundler rewriting the
	// original literal. Refuse to guess.
	if (raw.length < 2 && !/[./]/.test(raw)) {
		throw new Error(
			`ref() extracted a suspiciously short config path (${JSON.stringify(raw)}). `
			+ 'This usually indicates a minified bundle where the original specifier '
			+ 'was rewritten. Pass an unminified config source.'
		)
	}

	return raw
}

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
	let importFn: ConfigImport<TConfig> | undefined

	if (typeof nameOrImport === 'function') {
		importFn = nameOrImport as unknown as ConfigImport<TConfig>
	} else if (typeof maybeImport === 'function') {
		importFn = maybeImport as unknown as ConfigImport<TConfig>
	}

	if (!importFn) {
		throw new Error('ref() requires an import function')
	}

	const resolvedImportFn = importFn

	// Extract the import path from the function's source code.
	//
	// Ideal approach: runtime probe via Proxy (call `fn(rootProxy)` and observe
	// the property chains the proxy was accessed on). That approach doesn't apply
	// here because the input is a dynamic `import()` expression — a syntactic
	// operator that cannot be intercepted by replacing globals or parameters.
	//
	// We therefore parse the function source with a narrow regex, then guard the
	// result against obviously-minified or otherwise-unparseable inputs so we
	// fail loudly instead of silently returning a bogus path.
	const configPath = extractConfigPathFromImportFn(resolvedImportFn)
	const doBindingCache = new Map<string, DOBindingRef>()

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
			const module = await resolvedImportFn()
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

		const trackedPromise = promise.finally(() => {
			pendingResolutions.delete(proxy)
		}) as Promise<ResolvedData<TConfig>>

		pendingResolutions.set(proxy, trackedPromise as Promise<ResolvedData>)
		return trackedPromise
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
				return PENDING_REF_VALUE
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
					return PENDING_REF_VALUE
				}
				if (prop === 'entrypoint') return undefined
				if (prop === '__ref') return proxy
				return Reflect.get(target, prop)
			}
		}
	) as WorkerBindingAccessor

	// Create DO binding for cross-worker access
	function createDOBinding(bindingName: string): DOBindingRef {
		const cachedBinding = doBindingCache.get(bindingName)
		if (cachedBinding) {
			return cachedBinding
		}

		const doBinding: DOBindingRef = {
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
				return PENDING_REF_VALUE
			},
			get scriptName() {
				// Worker name for cross-worker access
				const cached = resolvedCache.get(proxy) as ResolvedData<TConfig> | undefined
				if (cached) return cached.name
				if (nameOverride) return nameOverride
				return PENDING_REF_VALUE
			},
			kind: 'cross-worker',
			__ref: proxy
		}

		doBindingCache.set(bindingName, doBinding)
		return doBinding
	}

	// Known properties on RefResult (not DO bindings)
	const knownProps = new Set(['name', 'config', 'configPath', 'worker', '__import', '__nameOverride', 'resolve', 'then'])

	// Create the proxy object with dynamic DO binding support
	const proxyTarget = {
		get name() { return getResolved().name },
		get config() { return getResolved().config },
		configPath,
		worker: workerAccessor,
		__import: resolvedImportFn,
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
