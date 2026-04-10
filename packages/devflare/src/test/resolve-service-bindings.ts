// =============================================================================
// Service Binding Resolution — Resolves service bindings for multi-worker tests
// =============================================================================
// When createTestContext detects service bindings with __ref metadata,
// this module resolves the referenced worker configs and bundles their scripts.
// =============================================================================

import { dirname, join, resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { normalizeDOBinding, type DevflareConfig, type DurableObjectBinding, type DOBindingRef } from '../config'
import type { RefResult, WorkerBinding } from '../config/ref'
import { transformWorkerEntrypoint } from '../transform/worker-entrypoint'
import { discoverEntrypointsSync } from '../utils/entrypoint-discovery'
import { findDurableObjectClasses } from '../transform/durable-object'
import { findFilesSync, DEFAULT_DO_PATTERN } from '../utils/glob'
import { resolvePackageSpecifier } from '../utils/resolve-package'

// -----------------------------------------------------------------------------
// Bun Runtime Detection
// -----------------------------------------------------------------------------

function getBunRuntime(): {
	build: (options: {
		entrypoints: string[]
		target: string
		format: string
		minify: boolean
		external?: string[]
	}) => Promise<{
		success: boolean
		logs: string[]
		outputs: Array<{ text: () => Promise<string> }>
	}>
} | undefined {
	const g = globalThis as { Bun?: unknown }
	if (typeof g.Bun === 'object' && g.Bun !== null) {
		return g.Bun as ReturnType<typeof getBunRuntime>
	}
	return undefined
}

// Entrypoint discovery imported from shared utils: discoverEntrypointsSync

// -----------------------------------------------------------------------------
// DO File Discovery
// -----------------------------------------------------------------------------

/**
 * Discover DO files matching do.*.ts/js pattern recursively in a directory
 * Uses the same glob pattern as the rest of the codebase for consistency.
 * Returns map of className -> filePath
 */
function discoverDOFilesSync(dir: string): Map<string, string> {
	const classToPath = new Map<string, string>()

	try {
		const files = findFilesSync(DEFAULT_DO_PATTERN, { cwd: dir })

		for (const filePath of files) {
			try {
				const code = readFileSync(filePath, 'utf-8')
				const classNames = findDurableObjectClasses(code)

				for (const className of classNames) {
					if (!classToPath.has(className)) {
						classToPath.set(className, filePath)
					}
				}
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// Glob failed — return empty map
	}

	return classToPath
}

// -----------------------------------------------------------------------------
// Bundle Cache
// -----------------------------------------------------------------------------

/**
 * Cache for bundled worker scripts to avoid re-bundling in repeated test runs.
 * Key: entryPath + entrypoint, Value: bundled script code
 */
const bundleCache = new Map<string, string>()

/**
 * Clear the bundle cache (useful between test suites)
 */
export function clearBundleCache(): void {
	bundleCache.clear()
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Resolved worker configuration for Miniflare
 */
export interface ResolvedWorker {
	/** Worker name */
	name: string
	/** Bundled script code */
	script: string
	/** Whether the script uses ES modules */
	modules: boolean
	/** Compatibility date */
	compatibilityDate: string
	/** Service bindings to other workers */
	serviceBindings?: Record<string, { name: string; entrypoint?: string }>
	/** Durable Object bindings (className → wrapperClassName) */
	durableObjects?: Record<string, string>
}

/**
 * Result of resolving service bindings
 */
export interface ServiceBindingResolution {
	/** All resolved workers (including primary) */
	workers: ResolvedWorker[]
	/** Service bindings for the primary worker */
	primaryServiceBindings: Record<string, { name: string; entrypoint?: string }>
}

function findDefaultServiceWorkerEntrypoint(refConfigDir: string): string | null {
	for (const candidate of ['src/worker.ts', 'src/worker.js']) {
		const absolutePath = resolve(refConfigDir, candidate)
		if (existsSync(absolutePath)) {
			return absolutePath
		}
	}

	return null
}

// -----------------------------------------------------------------------------
// Main API
// -----------------------------------------------------------------------------

/**
 * Check if a config has service bindings that need multi-worker setup
 */
export function hasServiceBindings(config: DevflareConfig): boolean {
	const services = config.bindings?.services
	if (!services) return false
	return Object.keys(services).length > 0
}

/**
 * Resolve service bindings from a config
 * Returns the workers array and service bindings for Miniflare setup
 */
export async function resolveServiceBindings(
	config: DevflareConfig,
	configDir: string
): Promise<ServiceBindingResolution> {
	const services = config.bindings?.services
	if (!services) {
		return { workers: [], primaryServiceBindings: {} }
	}

	// Track resolved workers by name to avoid duplicates
	const workersByName = new Map<string, ResolvedWorker>()
	const primaryServiceBindings: Record<string, { name: string; entrypoint?: string }> = {}

	for (const [bindingName, binding] of Object.entries(services)) {
		const workerBinding = binding as WorkerBinding
		const ref = workerBinding.__ref

		if (ref) {
			// Resolve the ref if it has an __import function (new API)
			if ('__import' in ref && typeof ref.__import === 'function') {
				await ref.resolve()
			}

			const workerName = ref.name
			const entrypoint = workerBinding.entrypoint

			// Only resolve worker once per unique worker name
			// bundleAllEntrypoints will include the default worker entrypoint plus
			// all named entrypoints discovered from files.entrypoints.
			if (!workersByName.has(workerName)) {
				const worker = await resolveRefWorker(ref, entrypoint, configDir)
				if (worker) {
					workersByName.set(workerName, worker)
				}
			}

			primaryServiceBindings[bindingName] = {
				name: workerName,
				...(entrypoint && { entrypoint })
			}
		} else {
			// No ref, just use the service binding as-is
			// This means the worker must be set up separately
			primaryServiceBindings[bindingName] = {
				name: workerBinding.service,
				...(workerBinding.entrypoint && { entrypoint: workerBinding.entrypoint })
			}
		}
	}

	return {
		workers: [...workersByName.values()],
		primaryServiceBindings
	}
}

/**
 * Resolve a referenced worker config to a bundled script.
 * Bundles the default `src/worker.{ts,js}` RPC surface plus any named
 * entrypoints discovered from `files.entrypoints` into a single script.
 */
async function resolveRefWorker(
	ref: RefResult,
	_entrypoint: string | undefined, // Ignored - we bundle all entrypoints
	parentConfigDir: string
): Promise<ResolvedWorker | null> {
	const config = ref.config
	if (!config) return null

	// Resolve the config path relative to parent config
	const configPath = ref.configPath
	if (!configPath || configPath === '<resolved>') {
		console.warn(`[devflare] Cannot resolve worker "${ref.name}" - configPath not available`)
		return null
	}

	// Resolve the config directory
	const refConfigDir = resolve(parentConfigDir, dirname(configPath))

	// Collect all entrypoints to bundle
	const entrypoints: Array<{ path: string; className: string; isWorkerTs: boolean }> = []

	// 1. Default worker RPC surface from src/worker.{ts,js}
	const workerEntrypointPath = findDefaultServiceWorkerEntrypoint(refConfigDir)

	if (workerEntrypointPath) {
		entrypoints.push({
			path: workerEntrypointPath,
			className: 'Worker',
			isWorkerTs: true
		})
	}

	// 2. Auto-discover named entrypoints from files.entrypoints (or the default pattern)
	if (config.files?.entrypoints !== false) {
		const discoveredEntrypoints = discoverEntrypointsSync(
			refConfigDir,
			typeof config.files?.entrypoints === 'string'
				? config.files.entrypoints
				: undefined
		)

		for (const ep of discoveredEntrypoints) {
			entrypoints.push({
				path: ep.filePath,
				className: ep.className,
				isWorkerTs: false // files.entrypoints files already export WorkerEntrypoint classes
			})
		}
	}

	if (entrypoints.length === 0) {
		console.warn(`[devflare] Worker "${ref.name}" has no entry points`)
		return null
	}

	// Bundle all entrypoints into a single script
	const script = await bundleAllEntrypoints(entrypoints, ref.name)
	if (!script) return null

	return {
		name: ref.name,
		script,
		modules: true,
		compatibilityDate: config.compatibilityDate ?? '2025-01-01'
	}
}

/**
 * Bundle multiple entrypoints into a single worker script
 */
async function bundleAllEntrypoints(
	entrypoints: Array<{ path: string; className: string; isWorkerTs: boolean }>,
	workerName: string
): Promise<string | null> {
	// Check cache first (use all paths as cache key)
	const cacheKey = entrypoints.map((ep) => `${ep.path}::${ep.className}`).join('|')
	const cached = bundleCache.get(cacheKey)
	if (cached) {
		return cached
	}

	const bun = getBunRuntime()
	if (!bun) {
		console.warn('[devflare] Bun runtime required for bundling worker scripts')
		return null
	}

	try {
		const { readFileSync, writeFileSync, mkdirSync, unlinkSync } = await import('fs')

		// Create a virtual entry file that re-exports all entrypoints
		const imports: string[] = []
		const exports: string[] = []
		let defaultExportClass: string | null = null

		for (let i = 0; i < entrypoints.length; i++) {
			const ep = entrypoints[i]
			const sourceCode = readFileSync(ep.path, 'utf-8')

			if (ep.isWorkerTs) {
				// Transform worker.ts to WorkerEntrypoint class
				const result = transformWorkerEntrypoint(sourceCode, ep.path, {
					className: ep.className,
					injectContext: false
				})

				if (result) {
					// Write transformed code to temp file
					const tempDir = join(dirname(ep.path), '.devflare')
					mkdirSync(tempDir, { recursive: true })
					const tempPath = join(tempDir, `__${ep.className}_${i}.ts`)
					writeFileSync(tempPath, result.code)

					imports.push(`import { ${ep.className} } from '${tempPath.replace(/\\/g, '/')}'`)
					exports.push(ep.className)

					// The default worker.ts becomes the default export
					if (!defaultExportClass) {
						defaultExportClass = ep.className
					}
				}
			} else {
				// ep.*.ts already exports WorkerEntrypoint class - import directly
				imports.push(`import { ${ep.className} } from '${ep.path.replace(/\\/g, '/')}'`)
				exports.push(ep.className)
			}
		}

		// Create the unified entry file
		// Include default export for the Worker class (used when no entrypoint is specified)
		const defaultExport = defaultExportClass
			? `\nexport default ${defaultExportClass}`
			: ''

		const entryCode = `
${imports.join('\n')}
export { ${exports.join(', ')} }${defaultExport}
`

		// Write entry file
		const tempDir = join(dirname(entrypoints[0].path), '.devflare')
		mkdirSync(tempDir, { recursive: true })
		const entryPath = join(tempDir, `__entry_${workerName}.ts`)
		writeFileSync(entryPath, entryCode)

		try {
			const result = await bun.build({
				entrypoints: [entryPath],
				target: 'browser',
				format: 'esm',
				minify: false,
				external: ['cloudflare:workers', 'cloudflare:*']
			})

			if (!result.success) {
				console.warn(`[devflare] Failed to bundle worker "${workerName}": ${result.logs.join('\n')}`)
				return null
			}

			const bundledCode = await result.outputs[0].text()

			// Cache the result
			bundleCache.set(cacheKey, bundledCode)

			return bundledCode
		} finally {
			// Clean up temp files
			try {
				unlinkSync(entryPath)
			} catch {
				// Ignore cleanup errors
			}
		}
	} catch (error) {
		console.warn(`[devflare] Error bundling worker "${workerName}":`, error)
		return null
	}
}

// -----------------------------------------------------------------------------
// Cross-Worker DO Binding Resolution
// -----------------------------------------------------------------------------

/**
 * Result of resolving cross-worker DO bindings
 */
export interface DOBindingResolution {
	/** Workers that host cross-worker DOs */
	workers: ResolvedWorker[]
	/** DO bindings for the primary worker (pointing to cross-worker DO hosting workers) */
	crossWorkerDOBindings: Record<string, { className: string; scriptName: string }>
}

/**
 * Check if a config has cross-worker DO bindings
 */
export function hasCrossWorkerDOs(config: DevflareConfig): boolean {
	const dos = config.bindings?.durableObjects
	if (!dos) return false
	for (const doConfig of Object.values(dos)) {
		const normalized = normalizeDOBinding(doConfig)
		if (normalized.__ref) return true
	}
	return false
}

/**
 * Resolve cross-worker DO bindings
 * Returns workers to set up and DO bindings for the primary worker
 */
export async function resolveDOBindings(
	config: DevflareConfig,
	configDir: string
): Promise<DOBindingResolution> {
	const dos = config.bindings?.durableObjects
	if (!dos) {
		return { workers: [], crossWorkerDOBindings: {} }
	}

	const workersByName = new Map<string, ResolvedWorker>()
	const crossWorkerDOBindings: Record<string, { className: string; scriptName: string }> = {}

	for (const [bindingName, rawDoConfig] of Object.entries(dos)) {
		// Check for __ref first (before normalizing) to detect cross-worker DOs
		const hasRef = typeof rawDoConfig === 'object' && '__ref' in rawDoConfig

		if (!hasRef) {
			// Local DO, skip (handled by regular DO bundling)
			continue
		}

		const ref = (rawDoConfig as DOBindingRef).__ref!

		// Resolve the ref BEFORE reading className/scriptName
		if ('__import' in ref && typeof ref.__import === 'function') {
			await ref.resolve()
		}

		// Now normalize after resolution - className will be correct
		const doConfig = normalizeDOBinding(rawDoConfig)
		const workerName = ref.name

		// Bundle the worker if not already done
		if (!workersByName.has(workerName)) {
			const worker = await resolveDORefWorker(ref, configDir)
			if (worker) {
				workersByName.set(workerName, worker)
			}
		}

		// Add the cross-worker DO binding
		crossWorkerDOBindings[bindingName] = {
			className: doConfig.className,
			scriptName: workerName
		}
	}

	return {
		workers: [...workersByName.values()],
		crossWorkerDOBindings
	}
}

/**
 * Resolve a referenced worker for DO hosting
 * Bundles the DO classes with RPC wrappers
 */
async function resolveDORefWorker(
	ref: RefResult,
	parentConfigDir: string
): Promise<ResolvedWorker | null> {
	const config = ref.config
	if (!config) return null

	const configPath = ref.configPath
	if (!configPath || configPath === '<resolved>') {
		console.warn(`[devflare] Cannot resolve DO worker "${ref.name}" - configPath not available`)
		return null
	}

	// Resolve the config path (handles both relative paths and package specifiers)
	const resolvedConfigPath = resolvePackageSpecifier(configPath, parentConfigDir)
	const refConfigDir = dirname(resolvedConfigPath)

	// Get DO classes from the referenced config
	const dosConfig = config.bindings?.durableObjects
	if (!dosConfig || Object.keys(dosConfig).length === 0) {
		console.warn(`[devflare] Referenced worker "${ref.name}" has no Durable Objects`)
		return null
	}

	// Auto-discover DO files in the referenced directory for classes without scriptName
	const discoveredDOs = discoverDOFilesSync(refConfigDir)

	// Collect DO classes to bundle
	const doClasses: Array<{ bindingName: string; className: string; scriptPath: string }> = []

	for (const [bindingName, rawDoConfig] of Object.entries(dosConfig)) {
		const doConfig = normalizeDOBinding(rawDoConfig as DurableObjectBinding)
		const className = doConfig.className
		const scriptName = doConfig.scriptName

		if (scriptName) {
			// Explicit scriptName provided - resolve it
			const scriptPath = resolve(refConfigDir, 'src', scriptName)
			if (!existsSync(scriptPath)) {
				// Try without src/
				const altPath = resolve(refConfigDir, scriptName)
				if (!existsSync(altPath)) {
					console.warn(`[devflare] DO script not found: ${scriptPath} or ${altPath}`)
					continue
				}
				doClasses.push({ bindingName, className, scriptPath: altPath })
			} else {
				doClasses.push({ bindingName, className, scriptPath })
			}
		} else {
			// No scriptName - try to auto-discover from do.*.ts files
			const discoveredPath = discoveredDOs.get(className)
			if (discoveredPath) {
				doClasses.push({ bindingName, className, scriptPath: discoveredPath })
			} else {
				console.warn(`[devflare] DO "${bindingName}" (class: ${className}) not found in do.*.ts files in "${ref.name}"`)
				continue
			}
		}
	}

	if (doClasses.length === 0) {
		console.warn(`[devflare] No valid DO classes found in "${ref.name}"`)
		return null
	}

	// Bundle DO classes (native RPC, no wrappers needed)
	const script = await bundleDOClasses(doClasses, ref.name)
	if (!script) return null

	// Build DO bindings for Miniflare - use original class names (native RPC)
	const durableObjects: Record<string, string> = {}
	for (const do_ of doClasses) {
		durableObjects[do_.bindingName] = do_.className
	}

	return {
		name: ref.name,
		script,
		modules: true,
		compatibilityDate: config.compatibilityDate ?? '2025-01-01',
		durableObjects
	}
}

/**
 * Bundle DO classes with RPC wrappers for Miniflare
 */
async function bundleDOClasses(
	doClasses: Array<{ bindingName: string; className: string; scriptPath: string }>,
	workerName: string
): Promise<string | null> {
	const cacheKey = `do:${doClasses.map((d) => `${d.scriptPath}::${d.className}`).join('|')}`
	const cached = bundleCache.get(cacheKey)
	if (cached) return cached

	const bun = getBunRuntime()
	if (!bun) {
		console.warn('[devflare] Bun runtime required for bundling DO classes')
		return null
	}

	try {
		const { writeFileSync, mkdirSync, unlinkSync } = await import('fs')

		// Build imports and exports for DO classes
		const imports = doClasses.map((d) =>
			`import { ${d.className} } from '${d.scriptPath.replace(/\\/g, '/')}'`
		).join('\n')

		const exports = doClasses.map((d) => d.className).join(', ')

		// Build the final script - no wrappers, native RPC via DurableObject base class
		const entryCode = `
${imports}

// Re-export DO classes for Miniflare binding
export { ${exports} }

// Default export with fetch handler
export default {
	async fetch(request, env) {
		return new Response('DO Worker: ${workerName}')
	}
}
`

		// Write and bundle
		const tempDir = join(dirname(doClasses[0].scriptPath), '.devflare')
		mkdirSync(tempDir, { recursive: true })
		const entryPath = join(tempDir, `__do_entry_${workerName}.ts`)
		writeFileSync(entryPath, entryCode)

		try {
			const result = await bun.build({
				entrypoints: [entryPath],
				target: 'browser',
				format: 'esm',
				minify: false,
				external: ['cloudflare:workers', 'cloudflare:*']
			})

			if (!result.success) {
				console.warn(`[devflare] Failed to bundle DO worker "${workerName}": ${result.logs.join('\n')}`)
				return null
			}

			const bundledCode = await result.outputs[0].text()
			bundleCache.set(cacheKey, bundledCode)
			return bundledCode
		} finally {
			try { unlinkSync(entryPath) } catch { /* ignore */ }
		}
	} catch (error) {
		console.warn(`[devflare] Error bundling DO worker "${workerName}":`, error)
		return null
	}
}
