// =============================================================================
// DO Bundler — Rolldown-based Durable Object bundling
// =============================================================================
// Uses Rolldown for fast bundling of DO files with watch mode
// Supports TypeScript out of the box, handles cloudflare: imports
// =============================================================================

import { resolve, dirname, basename, relative } from 'pathe'
import type { ConsolaInstance } from 'consola'
import picomatch from 'picomatch'
import type { DevflareRolldownOptions } from '../config/schema'
import { findFiles, DEFAULT_DO_PATTERN } from '../utils/glob'
import { transformDurableObject } from '../transform/durable-object'
import { discoverDurableObjectFiles } from '../worker-entry/durable-object-discovery'
import {
	ensureDebugShim,
	resolveWorkerCompatibleRolldownConfig,
	writeWorkerCompatibleBundle
} from './rolldown-shared'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DOBundlerOptions {
	/** Project root directory */
	cwd: string
	/** Glob pattern for DO files (e.g., 'src/do.*.ts') */
	pattern: string
	/** Output directory for bundled files */
	outDir: string
	/** Additional Rolldown options for Durable Object bundling */
	rolldownOptions?: DevflareRolldownOptions
	/** Default source map setting for emitted bundles */
	sourcemap?: boolean
	/** Default minification setting for emitted bundles */
	minify?: boolean
	/** Logger instance */
	logger?: ConsolaInstance
	/** Callback when a DO is rebuilt */
	onRebuild?: (result: DOBundleResult) => void | Promise<void>
}

export interface DOBundleResult {
	/** Map of binding name → bundled file path */
	bundles: Map<string, string>
	/** Map of binding name → class name */
	classes: Map<string, string>
	/** Map of source file → class names found */
	sourceFiles: Map<string, string[]>
	/** Errors during bundling */
	errors: Error[]
}

export interface DOBundler {
	/** Initial build of all DOs */
	build(): Promise<DOBundleResult>
	/** Start watching for changes */
	watch(): Promise<void>
	/** Stop watching */
	close(): Promise<void>
	/** Get the latest bundle result */
	getResult(): DOBundleResult
}

// -----------------------------------------------------------------------------
// DO Discovery
// -----------------------------------------------------------------------------

interface DiscoveredDO {
	/** Source file path */
	filePath: string
	/** Class name */
	className: string
	/** Suggested binding name (e.g., CHAT_ROOM from ChatRoom) */
	bindingName: string
}

/**
 * Convert PascalCase class name to SCREAMING_SNAKE_CASE binding name
 */
function classToBindingName(className: string): string {
	return className
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toUpperCase()
}

/**
 * Discover DO classes from a glob pattern.
 * Respects .gitignore automatically.
 */
async function discoverDOs(cwd: string, pattern: string): Promise<DiscoveredDO[]> {
	const discovered: DiscoveredDO[] = []
	const files = await discoverDurableObjectFiles(cwd, pattern)

	for (const [filePath, classNames] of files) {
		for (const className of classNames) {
			discovered.push({
				filePath,
				className,
				bindingName: classToBindingName(className)
			})
		}
	}

	return discovered
}

// -----------------------------------------------------------------------------
// DO Bundling with Rolldown
// -----------------------------------------------------------------------------

/**
 * Strip @durableObject decorator and its import from source code
 * For dev mode, we just need to remove the decorator syntax - the DO class works as-is
 */
function stripDecoratorSyntax(code: string): string {
	let result = code

	// 1. Remove @durableObject(...) decorator followed by export class
	// Pattern: @durableObject({ ... }) or @durableObject() followed by newlines/whitespace and export class
	result = result.replace(
		/@durableObject\s*\([^)]*\)\s*\n?\s*(?=export\s+class)/g,
		''
	)

	// 2. Remove import of durableObject from devflare/runtime
	// Handle various import patterns:
	// - import { durableObject } from 'devflare/runtime'
	// - import { durableObject, otherThing } from 'devflare/runtime'
	// - import { durableObject as do } from 'devflare/runtime'

	// First try to remove just `durableObject` from multi-import
	result = result.replace(
		/import\s*\{([^}]*)\bdurableObject\b[^}]*\}\s*from\s*['"]devflare\/runtime['"]\s*;?/g,
		(match, imports) => {
			// Remove durableObject from the imports list
			const cleanedImports = imports
				.split(',')
				.map((s: string) => s.trim())
				.filter((s: string) => !s.startsWith('durableObject'))
				.join(', ')

			if (cleanedImports.trim() === '') {
				// No other imports, remove the whole statement
				return ''
			}
			// Keep other imports
			return `import { ${cleanedImports} } from 'devflare/runtime'`
		}
	)

	return result
}

// NOTE: @cloudflare/puppeteer is now fully supported via our local browser shim!
// The shim provides a Fetcher service binding that emulates Cloudflare's
// Browser Rendering API using puppeteer-core + chrome-headless-shell.

/**
 * Bundle a single DO file using Rolldown
 *
 * Strategy:
 * 1. Read the source file
 * 2. Strip @durableObject decorator (not needed at runtime - just a marker)
 * 3. Feed the cleaned code to Rolldown through a virtual-entry plugin whose id
 *    sits in the source directory, so relative imports resolve identically to
 *    the original Durable Object module — without ever writing a temp file
 *    next to user source.
 * 4. Bundle with Rolldown.
 */
async function bundleDOFile(
	sourcePath: string,
	className: string,
	outDir: string,
	cwd: string,
	bundleOptions?: Pick<DOBundlerOptions, 'rolldownOptions' | 'sourcemap' | 'minify'>
): Promise<string> {
	const fs = await import('node:fs/promises')

	// Ensure output directory exists
	await fs.mkdir(outDir, { recursive: true })

	// Read the original source file
	const sourceCode = await fs.readFile(sourcePath, 'utf-8')

	// Apply the Durable Object wrapper transform so event-first handlers receive
	// AsyncLocalStorage-backed event injection in non-Vite dev/build paths too.
	const transformedCode = (await transformDurableObject(sourceCode, sourcePath))?.code
		?? stripDecoratorSyntax(sourceCode)

	// Create entry code that re-exports the class and has a default fetch handler
	const entryCode = `${transformedCode}

// Default export for worker (required by Miniflare)
export default {
	async fetch(request) {
		return new Response('DO Worker for ${className}', { status: 200 });
	}
};
`

	// Virtual entry id lives inside the source directory so rolldown resolves
	// relative imports (./Foo, ../bar) from the original DO module's location.
	const virtualEntryId = resolve(dirname(sourcePath), `.devflare-do-${className}.virtual.ts`)

	// Output directory for this specific class - clean it first to remove old chunks
	const classOutDir = resolve(outDir, className)
	try {
		await fs.rm(classOutDir, { recursive: true, force: true })
	} catch {
		// Ignore if doesn't exist
	}
	await fs.mkdir(classOutDir, { recursive: true })

	// Create a shim for the 'debug' module that @cloudflare/puppeteer uses.
	const debugShimPath = await ensureDebugShim(outDir)

	const virtualEntryPlugin = {
		name: 'devflare-do-virtual-entry',
		resolveId(id: string) {
			if (id === virtualEntryId) {
				return virtualEntryId
			}
			return null
		},
		load(id: string) {
			if (id === virtualEntryId) {
				return entryCode
			}
			return null
		}
	}

	const userRolldownOptions = bundleOptions?.rolldownOptions
	const userPlugins = userRolldownOptions?.plugins
	const mergedPlugins = userPlugins === undefined
		? [virtualEntryPlugin]
		: Array.isArray(userPlugins)
			? [virtualEntryPlugin, ...userPlugins]
			: [virtualEntryPlugin, userPlugins]

	const outFile = resolve(classOutDir, 'index.js')
	const { inputOptions, outputOptions } = resolveWorkerCompatibleRolldownConfig({
		cwd,
		inputFile: virtualEntryId,
		outFile,
		platform: 'neutral',
		alias: {
			debug: debugShimPath
		},
		rolldownOptions: {
			...userRolldownOptions,
			plugins: mergedPlugins
		},
		sourcemap: bundleOptions?.sourcemap,
		minify: bundleOptions?.minify,
		inlineDynamicImports: true,
		defaultTsconfigMode: 'always'
	})

	await writeWorkerCompatibleBundle({
		inputOptions,
		outputOptions,
		outFile
	})

	// Return path to the bundled entry
	return resolve(classOutDir, 'index.js')
}

/**
 * Bundle all discovered DOs
 */
async function bundleAllDOs(
	discovered: DiscoveredDO[],
	outDir: string,
	cwd: string,
	logger?: ConsolaInstance,
	bundleOptions?: Pick<DOBundlerOptions, 'rolldownOptions' | 'sourcemap' | 'minify'>
): Promise<DOBundleResult> {
	const fs = await import('node:fs/promises')
	const bundles = new Map<string, string>()
	const classes = new Map<string, string>()
	const sourceFiles = new Map<string, string[]>()
	const errors: Error[] = []

	// Group by source file
	for (const do_ of discovered) {
		const existing = sourceFiles.get(do_.filePath) || []
		existing.push(do_.className)
		sourceFiles.set(do_.filePath, existing)
	}

	// Bundle each DO
	for (const do_ of discovered) {
		try {
			logger?.debug(`Bundling ${do_.className} from ${do_.filePath}`)

			const outFile = await bundleDOFile(
				do_.filePath,
				do_.className,
				outDir,
				cwd,
				bundleOptions
			)

			bundles.set(do_.bindingName, outFile)
			classes.set(do_.bindingName, do_.className)

			logger?.debug(`  → ${outFile}`)
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))
			errors.push(err)
			logger?.error(`Failed to bundle ${do_.className}:`, err.message)
		}
	}

	return { bundles, classes, sourceFiles, errors }
}

// -----------------------------------------------------------------------------
// Bundler Factory
// -----------------------------------------------------------------------------

/**
 * Create a DO bundler with watch support
 */
export function createDOBundler(options: DOBundlerOptions): DOBundler {
	const { cwd, pattern, outDir, logger, onRebuild, rolldownOptions, sourcemap, minify } = options

	let result: DOBundleResult = {
		bundles: new Map(),
		classes: new Map(),
		sourceFiles: new Map(),
		errors: []
	}

	let watcher: Awaited<ReturnType<typeof import('rolldown')['watch']>> | null = null
	let chokidarWatcher: import('chokidar').FSWatcher | null = null

	/**
	 * Perform initial build
	 */
	async function build(): Promise<DOBundleResult> {
		const discovered = await discoverDOs(cwd, pattern)

		if (discovered.length === 0) {
			logger?.debug('No DOs found matching pattern:', pattern)
			return result
		}

		logger?.info(`Found ${discovered.length} Durable Object(s)`)
		for (const do_ of discovered) {
			logger?.info(`  • ${do_.className} → ${do_.bindingName}`)
		}

		result = await bundleAllDOs(discovered, outDir, cwd, logger, {
			rolldownOptions,
			sourcemap,
			minify
		})

		if (result.errors.length === 0) {
			logger?.success(`Bundled ${result.bundles.size} DO(s) to ${outDir}`)
		}

		return result
	}

	/**
	 * Watch for changes and rebuild
	 * 
	 * Strategy: Watch parent directories of DO files with a filter for matching files.
	 * This allows detection of new DO files created during dev.
	 * Uses compiled picomatch for fast pattern matching instead of re-globbing on every event.
	 */
	async function watch(): Promise<void> {
		const chokidar = await import('chokidar')

		// Get all source files from the pattern using gitignore-aware glob
		const files = await findFiles(pattern, { cwd })

		// Derive directories to watch from pattern OR existing files
		// This ensures we can detect new DO files even if none exist at startup
		let dirsToWatch: string[]

		if (files.length > 0) {
			// Watch parent directories of existing files
			dirsToWatch = [...new Set(files.map((f) => dirname(f)))]
		} else {
			// No files yet - derive watch directory from pattern
			// e.g., "src/do.*.ts" → watch "src/"
			const patternDir = dirname(pattern)
			const absolutePatternDir = resolve(cwd, patternDir === '.' ? '' : patternDir) || cwd
			dirsToWatch = [absolutePatternDir]
			logger?.debug(`No DO files yet, watching pattern directory: ${absolutePatternDir}`)
		}

		logger?.info(`Watching ${files.length} DO file(s) in ${dirsToWatch.length} director(ies)...`)

		// Use chokidar for file watching
		// Watch directories but filter events for matching files
		const isWindows = process.platform === 'win32'
		chokidarWatcher = chokidar.watch(dirsToWatch, {
			ignoreInitial: true,
			// Use polling on Windows for reliability, native fs.watch elsewhere
			usePolling: isWindows,
			interval: isWindows ? 300 : undefined,
			awaitWriteFinish: {
				stabilityThreshold: 100,
				pollInterval: 50
			},
			// Depth 0 = only files in the watched directories, not subdirectories
			depth: 0
		})

		// Compile glob pattern once for fast matching
		// Normalize paths to forward slashes for cross-platform comparison
		const normalizePath = (p: string): string => {
			let normalized = p.replace(/\\/g, '/')
			// Normalize drive letter casing on Windows (C: vs c:)
			if (isWindows && /^[a-zA-Z]:/.test(normalized)) {
				normalized = normalized[0].toLowerCase() + normalized.slice(1)
			}
			return normalized
		}

		// Create compiled matcher for the glob pattern
		const isMatch = picomatch(pattern, {
			dot: true,
			// Match from the start of the path
			matchBase: false
		})

		// Match file against pattern using relative path
		const matchesPattern = (filePath: string): boolean => {
			const normalizedPath = normalizePath(filePath)
			const relativePath = relative(normalizePath(cwd), normalizedPath)
			return isMatch(relativePath)
		}

		// Rebuild queue with single-flight guard
		// Ensures only one rebuild runs at a time, with at most one pending rebuild
		let isRebuilding = false
		let pendingRebuild: string | null = null
		let rebuildTimeout: ReturnType<typeof setTimeout> | null = null

		const scheduleRebuild = (changedPath: string) => {
			// Clear any pending debounce timeout
			if (rebuildTimeout) {
				clearTimeout(rebuildTimeout)
			}

			// Debounce: wait 150ms before starting rebuild
			rebuildTimeout = setTimeout(() => {
				triggerRebuild(changedPath)
			}, 150)
		}

		const triggerRebuild = async (changedPath: string) => {
			// If already rebuilding, queue this one
			if (isRebuilding) {
				pendingRebuild = changedPath
				logger?.debug(`Rebuild already in progress, queuing: ${changedPath}`)
				return
			}

			isRebuilding = true

			try {
				logger?.info(`DO file changed: ${changedPath}`)
				logger?.info('Rebuilding DOs...')
				const startTime = Date.now()
				result = await build()
				const elapsed = Date.now() - startTime
				logger?.success(`DO rebuild complete (${elapsed}ms)`)
				await onRebuild?.(result)
			} catch (error) {
				logger?.error('DO rebuild failed:', error)
			} finally {
				isRebuilding = false

				// If another rebuild was queued, run it now
				if (pendingRebuild) {
					const nextPath = pendingRebuild
					pendingRebuild = null
					triggerRebuild(nextPath)
				}
			}
		}

		chokidarWatcher.on('change', (filePath) => {
			if (matchesPattern(filePath)) {
				logger?.debug(`File changed: ${filePath}`)
				scheduleRebuild(filePath)
			}
		})

		chokidarWatcher.on('add', (filePath) => {
			if (matchesPattern(filePath)) {
				logger?.debug(`File added: ${filePath}`)
				scheduleRebuild(filePath)
			}
		})

		chokidarWatcher.on('unlink', (filePath) => {
			// Use same pattern matcher for unlink events
			// Even though the file is deleted, we can still check if the path matches the pattern
			if (matchesPattern(filePath)) {
				logger?.debug(`File removed: ${filePath}`)
				scheduleRebuild(filePath)
			}
		})

		chokidarWatcher.on('ready', () => {
			logger?.info('DO file watcher ready')
		})

		chokidarWatcher.on('error', (error) => {
			logger?.error('DO file watcher error:', error)
		})
	}

	/**
	 * Stop watching
	 */
	async function close(): Promise<void> {
		if (watcher) {
			await watcher.close()
			watcher = null
		}
		if (chokidarWatcher) {
			await chokidarWatcher.close()
			chokidarWatcher = null
		}
	}

	/**
	 * Get the latest result
	 */
	function getResult(): DOBundleResult {
		return result
	}

	return {
		build,
		watch,
		close,
		getResult
	}
}

// -----------------------------------------------------------------------------
// Convenience Function
// -----------------------------------------------------------------------------

/**
 * Bundle DOs without watching (one-shot build)
 */
export async function bundleDOs(options: Omit<DOBundlerOptions, 'onRebuild'>): Promise<DOBundleResult> {
	const bundler = createDOBundler(options)
	const result = await bundler.build()
	return result
}
