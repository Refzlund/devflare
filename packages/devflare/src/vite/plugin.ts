// =============================================================================
// Devflare Vite Plugin
// =============================================================================
// Integrates with @cloudflare/vite-plugin to provide:
// - Config compilation (devflare.config.ts → generated wrangler.jsonc)
// - Durable Object transforms
// - Virtual DO entry module for auxiliaryWorkers
// - Development-time generated config in .devflare/
//
// Architecture:
// - Main worker: SvelteKit/main app
// - Auxiliary worker: Auto-generated DO worker from files.durableObjects pattern
// - auxiliaryWorkers config passed to @cloudflare/vite-plugin
// =============================================================================

import { isAbsolute, relative, resolve } from 'pathe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { loadConfig, resolveConfigPath } from '../config/loader'
import type { DevflareConfig } from '../config/schema'
import {
	loadResolvedConfig,
	resolveConfigForLocalRuntime,
	resolveConfigResources
} from '../config'
import {
	compileConfig,
	compileToProgrammaticConfig,
	isolateViteBuildOutputPaths,
	rebaseWranglerConfigPaths,
	writeWranglerConfig,
	type WranglerConfig
} from '../config/compiler'
import { findDurableObjectClasses } from '../transform/durable-object'
import { findFiles, DEFAULT_DO_PATTERN } from '../utils/glob'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'

// Config directory name (same as dev.ts)
const CONFIG_DIR = '.devflare'

// Virtual module ID for DO entry
const VIRTUAL_DO_ENTRY = 'virtual:devflare-do-entry'
const RESOLVED_VIRTUAL_DO_ENTRY = '\0' + VIRTUAL_DO_ENTRY

export interface DevflarePluginOptions {
	/**
	 * Path to devflare.config.ts
	 * @default 'devflare.config.ts'
	 */
	configPath?: string

	/**
	 * Environment to use from config
	 */
	environment?: string

	/**
	 * Enable Durable Object transforms
	 * @default true
	 */
	doTransforms?: boolean

	/**
	 * Watch config file for changes in dev mode
	 * @default true
	 */
	watchConfig?: boolean

	/**
	 * Miniflare bridge port for WebSocket proxying
	 * If set, WebSocket requests will be proxied to Miniflare
	 * @default process.env.DEVFLARE_BRIDGE_PORT
	 */
	bridgePort?: number

	/**
	 * Additional patterns to proxy to Miniflare (for WebSocket DO connections)
	 * These patterns will have WebSocket requests proxied to Miniflare.
	 * Note: Patterns from `wsRoutes` in devflare.config.ts are automatically included.
	 * @default []
	 */
	wsProxyPatterns?: string[]
}

export interface DevflarePluginContext {
	/**
	 * The compiled wrangler config (for programmatic use)
	 */
	wranglerConfig: WranglerConfig | null

	/**
	 * Config ready for @cloudflare/vite-plugin's programmatic config option
	 */
	cloudflareConfig: Record<string, unknown> | null

	/**
	 * Project root directory
	 */
	projectRoot: string

	/**
	 * Auxiliary worker config for DOs (if any)
	 * Pass to @cloudflare/vite-plugin's auxiliaryWorkers option
	 */
	auxiliaryWorkerConfig: AuxiliaryWorkerConfig | null

	/**
	 * Discovered DO files and their classes
	 */
	durableObjects: DODiscoveryResult | null
}

export interface DODiscoveryResult {
	/** Map of file path → array of class names */
	files: Map<string, string[]>
	/** Worker name for the auxiliary DO worker */
	workerName: string
}

export interface AuxiliaryWorkerConfig {
	config: Record<string, unknown>
}

interface ResolvedPluginContextState {
	wranglerConfig: WranglerConfig
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkerConfig: AuxiliaryWorkerConfig | null
	durableObjects: DODiscoveryResult | null
}

// Shared context for accessing compiled config
let pluginContext: DevflarePluginContext = {
	wranglerConfig: null,
	cloudflareConfig: null,
	projectRoot: process.cwd(),
	auxiliaryWorkerConfig: null,
	durableObjects: null
}

/**
 * Get the compiled config context
 * Can be used by other plugins or CLI commands
 */
export function getPluginContext(): DevflarePluginContext {
	return pluginContext
}

/**
 * Discover DO classes from files matching the glob pattern.
 * Respects .gitignore automatically.
 */
async function discoverDurableObjects(
	projectRoot: string,
	pattern: string,
	workerName: string
): Promise<DODiscoveryResult> {
	const files = new Map<string, string[]>()

	// Find matching files with gitignore support
	const matchedFiles = await findFiles(pattern, { cwd: projectRoot })

	// Read each file and extract DO class names
	const fs = await import('node:fs/promises')

	for (const filePath of matchedFiles) {
		try {
			const code = await fs.readFile(filePath, 'utf-8')
			const classNames = findDurableObjectClasses(code)

			if (classNames.length > 0) {
				files.set(filePath, classNames)
			}
		} catch (error) {
			console.warn(`[devflare] Failed to read DO file: ${filePath}`, error)
		}
	}

	return { files, workerName }
}

/**
 * Generate virtual DO entry module code
 */
function generateVirtualDOEntry(discovery: DODiscoveryResult): string {
	const lines: string[] = [
		'// Auto-generated by devflare — DO entry module',
		'// Re-exports all Durable Object classes discovered from files.durableObjects pattern',
		''
	]

	// Re-export each class from its file
	for (const [filePath, classNames] of discovery.files) {
		const normalizedPath = filePath.replace(/\\/g, '/')
		lines.push(`export { ${classNames.join(', ')} } from '${normalizedPath}'`)
	}

	// Add default fetch handler (required for worker)
	lines.push('')
	lines.push('// Default fetch handler for DO worker')
	lines.push('export default {')
	lines.push('\tasync fetch(request: Request): Promise<Response> {')
	lines.push('\t\treturn new Response("Devflare DO Worker", { status: 200 })')
	lines.push('\t}')
	lines.push('}')

	return lines.join('\n')
}

/**
 * Create auxiliary worker config for Durable Objects
 */
function createAuxiliaryWorkerConfig(
	wranglerConfig: WranglerConfig,
	discovery: DODiscoveryResult
): AuxiliaryWorkerConfig {
	// Build DO bindings without script_name (they're exported from this worker)
	const doBindings = wranglerConfig.durable_objects?.bindings?.map((binding) => ({
		name: binding.name,
		class_name: binding.class_name
		// No script_name — classes are in this worker
	})) ?? []

	return {
		config: {
			name: discovery.workerName,
			main: VIRTUAL_DO_ENTRY,
			compatibility_date: wranglerConfig.compatibility_date,
			compatibility_flags: wranglerConfig.compatibility_flags,
			durable_objects: { bindings: doBindings },
			migrations: wranglerConfig.migrations,
			// Include bindings that DOs might need
			kv_namespaces: wranglerConfig.kv_namespaces,
			d1_databases: wranglerConfig.d1_databases,
			r2_buckets: wranglerConfig.r2_buckets,
			browser: wranglerConfig.browser
		}
	}
}

function logDiscoveredDurableObjects(
	projectRoot: string,
	discovery: DODiscoveryResult | null
): void {
	if (!discovery || discovery.files.size === 0) {
		return
	}

	console.log(`[devflare] Discovered ${discovery.files.size} DO file(s):`)
	for (const [filePath, classes] of discovery.files) {
		console.log(`  • ${filePath.replace(projectRoot, '.')} → ${classes.join(', ')}`)
	}
}

async function buildPluginContextState(
	projectRoot: string,
	devflareConfig: DevflareConfig,
	environment?: string,
	mode: 'serve' | 'build' = 'serve'
): Promise<ResolvedPluginContextState> {
	const effectiveConfig = mode === 'build'
		? await resolveConfigResources(devflareConfig, { environment })
		: resolveConfigForLocalRuntime(devflareConfig, environment)
	const compiledWranglerConfig = compileConfig(effectiveConfig)
	const wranglerConfig = mode === 'build'
		? isolateViteBuildOutputPaths(projectRoot, compiledWranglerConfig)
		: compiledWranglerConfig
	const cloudflareConfig = {
		...(mode === 'build'
			? isolateViteBuildOutputPaths(projectRoot, compileToProgrammaticConfig(effectiveConfig) as WranglerConfig)
			: compileToProgrammaticConfig(effectiveConfig))
	}
	const composedMainEntry = mode === 'build'
		? null
		: await prepareComposedWorkerEntrypoint(projectRoot, effectiveConfig, environment)
	if (composedMainEntry) {
		wranglerConfig.main = composedMainEntry
		cloudflareConfig.main = composedMainEntry
	}

	let durableObjects: DODiscoveryResult | null = null
	let auxiliaryWorkerConfig: AuxiliaryWorkerConfig | null = null

	const doPatternConfig = effectiveConfig.files?.durableObjects
	const doPattern = typeof doPatternConfig === 'string' ? doPatternConfig : DEFAULT_DO_PATTERN
	if (doPatternConfig !== false) {
		const doWorkerName = `${wranglerConfig.name}-do`
		const discovery = await discoverDurableObjects(projectRoot, doPattern, doWorkerName)

		if (discovery.files.size > 0) {
			durableObjects = discovery

			if (wranglerConfig.durable_objects?.bindings) {
				for (const binding of wranglerConfig.durable_objects.bindings) {
					binding.script_name = doWorkerName
				}
			}
			if (cloudflareConfig.durable_objects) {
				const doConfig = cloudflareConfig.durable_objects as { bindings: Array<{ script_name?: string }> }
				for (const binding of doConfig.bindings) {
					binding.script_name = doWorkerName
				}
			}

			auxiliaryWorkerConfig = createAuxiliaryWorkerConfig(wranglerConfig, discovery)
		}
	}

	return {
		wranglerConfig,
		cloudflareConfig,
		durableObjects,
		auxiliaryWorkerConfig
	}
}

async function ensureGeneratedConfigDir(projectRoot: string): Promise<string> {
	const configDir = resolve(projectRoot, CONFIG_DIR)
	const fs = await import('node:fs/promises')
	await fs.mkdir(configDir, { recursive: true })

	const gitignorePath = resolve(configDir, '.gitignore')
	try {
		await fs.access(gitignorePath)
	} catch {
		await fs.writeFile(gitignorePath, '*\n', 'utf-8')
	}

	return configDir
}

async function writeGeneratedWranglerConfig(
	projectRoot: string,
	wranglerConfig: WranglerConfig
): Promise<void> {
	const configDir = await ensureGeneratedConfigDir(projectRoot)
	const wranglerFileConfig = rebaseWranglerConfigPaths(projectRoot, configDir, wranglerConfig)

	await writeWranglerConfig(configDir, wranglerFileConfig, 'wrangler.jsonc')
}

async function resolvePluginConfigPath(
	projectRoot: string,
	configPath?: string
): Promise<string | null> {
	if (configPath) {
		return isAbsolute(configPath)
			? configPath
			: resolve(projectRoot, configPath)
	}

	return await resolveConfigPath(projectRoot) ?? null
}

/**
 * Devflare Vite Plugin
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { sveltekit } from '@sveltejs/kit/vite'
 * import { devflarePlugin, getPluginContext } from 'devflare/vite'
 * import { cloudflare } from '@cloudflare/vite-plugin'
 *
 * export default defineConfig(async () => {
 *   // First, run devflare to get context
 *   const lfPlugin = devflarePlugin()
 *
 *   return {
 *     plugins: [
 *       lfPlugin,
 *       sveltekit(),
 *       // Access context after configResolved
 *       cloudflare({
 *         config: getPluginContext().cloudflareConfig,
 *         auxiliaryWorkers: getPluginContext().auxiliaryWorkerConfig
 *           ? [getPluginContext().auxiliaryWorkerConfig]
 *           : undefined
 *       })
 *     ]
 *   }
 * })
 * ```
 */
export function devflarePlugin(options: DevflarePluginOptions = {}): Plugin {
	const {
		configPath,
		environment,
		doTransforms = true,
		watchConfig = true,
		bridgePort = process.env.DEVFLARE_BRIDGE_PORT ? parseInt(process.env.DEVFLARE_BRIDGE_PORT, 10) : undefined,
		wsProxyPatterns = []
	} = options

	let projectRoot: string
	let devflareConfig: DevflareConfig
	let resolvedPluginConfigPath: string | null = null

	return {
		name: 'devflare',

		// Run before other plugins
		enforce: 'pre',

		// Configure WebSocket proxy for DO connections in dev mode
		// Also inject build-time constants (workerName)
		async config(config, { command }) {
			const cwd = config.root ?? process.cwd()
			const returnConfig: Record<string, unknown> = {}

			// Load devflare config for worker name and routes
			let lfConfig: DevflareConfig | null = null
			try {
				lfConfig = await loadConfig({
					cwd,
					configFile: configPath
				})
			} catch (error) {
				// Config may not exist yet, continue without it
				if (command === 'build') {
					console.warn('[devflare] Could not load config:', error)
				}
			}

			// Inject __DEVFLARE_WORKER_NAME__ as build-time constant
			if (lfConfig) {
				const workerNameValue = lfConfig.name ?? 'unknown'
				returnConfig.define = {
					...((config.define ?? {}) as Record<string, unknown>),
					'__DEVFLARE_WORKER_NAME__': JSON.stringify(workerNameValue)
				}
			}

			// Only add proxy in dev mode when running under devflare dev
			if (command === 'serve' && process.env.DEVFLARE_DEV && lfConfig) {
				const port = bridgePort ?? 8787
				const patterns: string[] = [...wsProxyPatterns]

				// Extract patterns from wsRoutes
				if (lfConfig.wsRoutes && lfConfig.wsRoutes.length > 0) {
					for (const route of lfConfig.wsRoutes) {
						if (!patterns.includes(route.pattern)) {
							patterns.push(route.pattern)
						}
					}
				}

				// Build proxy config for WebSocket patterns
				const proxyConfig: Record<string, unknown> = {}

				for (const pattern of patterns) {
					proxyConfig[pattern] = {
						target: `http://127.0.0.1:${port}`,
						changeOrigin: true,
						ws: true,
						// Forward WebSocket upgrade requests
						configure: (proxy: unknown) => {
							; (proxy as { on: (event: string, handler: (err: Error) => void) => void })
								.on('error', (err: Error) => {
									console.error(`[devflare] Proxy error: ${err.message}`)
								})
						}
					}
				}

				if (Object.keys(proxyConfig).length > 0) {
					console.log(`[devflare] WebSocket proxy configured for: ${patterns.join(', ')}`)
					returnConfig.server = {
						proxy: proxyConfig
					}
				}
			}

			return Object.keys(returnConfig).length > 0 ? returnConfig : undefined
		},

		// Handle virtual module resolution
		resolveId(id: string) {
			if (id === VIRTUAL_DO_ENTRY) {
				return RESOLVED_VIRTUAL_DO_ENTRY
			}
			return null
		},

		// Load virtual module content
		async load(id: string) {
			if (id === RESOLVED_VIRTUAL_DO_ENTRY) {
				if (!pluginContext.durableObjects) {
					return '// No Durable Objects configured\nexport default { fetch: () => new Response("No DOs") }'
				}
				return generateVirtualDOEntry(pluginContext.durableObjects)
			}
			return null
		},

		async configResolved(config: ResolvedConfig) {
			projectRoot = config.root
			pluginContext.projectRoot = projectRoot
			resolvedPluginConfigPath = await resolvePluginConfigPath(projectRoot, configPath)

			try {
				// Load and compile config
				devflareConfig = await loadConfig({
					cwd: projectRoot,
					configFile: configPath
				})

				const pluginState = await buildPluginContextState(
					projectRoot,
					devflareConfig,
					environment,
					config.command === 'build' ? 'build' : 'serve'
				)
				Object.assign(pluginContext, {
					projectRoot,
					...pluginState
				})

				logDiscoveredDurableObjects(projectRoot, pluginState.durableObjects)
				await writeGeneratedWranglerConfig(projectRoot, pluginState.wranglerConfig)

				if (config.command === 'serve') {
					console.log('[devflare] Config generated to .devflare/wrangler.jsonc')
					if (pluginState.auxiliaryWorkerConfig) {
						console.log('[devflare] ✓ Auxiliary DO worker configured')
					}
				}

				if (config.command === 'build') {
					console.log(`[devflare] Generated ${CONFIG_DIR}/wrangler.jsonc`)
				}
			} catch (error) {
				if (error instanceof Error) {
					console.error('[devflare] Config error:', error.message)
				}
				throw error
			}
		},

		configureServer(server: ViteDevServer) {
			if (!watchConfig) return

			// Watch devflare.config.ts for changes
			const fullConfigPath = resolvedPluginConfigPath
				?? resolve(projectRoot, configPath || 'devflare.config.ts')

			server.watcher.add(fullConfigPath)

			server.watcher.on('change', async (changedPath: string) => {
				if (changedPath === fullConfigPath) {
					console.log('[devflare] Config changed, reloading...')

					try {
						devflareConfig = await loadConfig({
							cwd: projectRoot,
							configFile: configPath
						})

						const pluginState = await buildPluginContextState(projectRoot, devflareConfig, environment, 'serve')
						Object.assign(pluginContext, {
							projectRoot,
							...pluginState
						})
						logDiscoveredDurableObjects(projectRoot, pluginState.durableObjects)
						await writeGeneratedWranglerConfig(projectRoot, pluginState.wranglerConfig)

						console.log('[devflare] Config reloaded')

						// Trigger HMR
						server.ws.send({
							type: 'full-reload',
							path: '*'
						})
					} catch (error) {
						console.error('[devflare] Failed to reload config:', error)
					}
				}
			})
		},

		// Transform Durable Object classes and Worker Entrypoints
		async transform(code: string, id: string) {
			// Skip node_modules
			if (id.includes('node_modules')) return null

			// Only transform .ts/.js files
			if (!id.endsWith('.ts') && !id.endsWith('.tsx') && !id.endsWith('.js')) {
				return null
			}

			// 1. Worker Entrypoint Transform (worker.ts files)
			if (id.endsWith('worker.ts') || id.endsWith('worker.js')) {
				const {
					shouldTransformWorker,
					transformWorkerEntrypoint
				} = await import('../transform/worker-entrypoint')

				if (shouldTransformWorker(code, id)) {
					const result = transformWorkerEntrypoint(code, id)
					if (result) {
						return {
							code: result.code,
							map: result.map
						}
					}
				}
			}

			// 2. Durable Object transforms (if enabled)
			if (doTransforms) {
				// Check if file contains DurableObject import or class
				if (code.includes('DurableObject') || code.includes('@durableObject')) {
					const { transformDurableObject } = await import('../transform/durable-object')
					return transformDurableObject(code, id)
				}
			}

			return null
		}
	}
}

/**
 * Get cloudflare config for programmatic use with @cloudflare/vite-plugin
 * Call this in vite.config.ts before setting up plugins
 */
export async function getCloudflareConfig(options: {
	cwd?: string
	configPath?: string
	environment?: string
} = {}): Promise<Record<string, unknown>> {
	const cwd = options.cwd ?? process.cwd()
	const devflareConfig = await loadResolvedConfig({
		cwd,
		configFile: options.configPath,
		environment: options.environment
	})
	const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, devflareConfig)
	const cloudflareConfig = compileToProgrammaticConfig(devflareConfig)
	if (composedMainEntry) {
		cloudflareConfig.main = composedMainEntry
	}

	return cloudflareConfig
}

/**
 * Get auxiliary worker configs for Durable Objects
 * Use this when configuring @cloudflare/vite-plugin's auxiliaryWorkers option
 *
 * @example
 * ```ts
 * const { cloudflareConfig, auxiliaryWorkers } = await getDevflareConfigs()
 *
 * cloudflare({
 *   config: cloudflareConfig,
 *   auxiliaryWorkers
 * })
 * ```
 */
export async function getDevflareConfigs(options: {
	cwd?: string
	configPath?: string
	environment?: string
} = {}): Promise<{
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkers: AuxiliaryWorkerConfig[]
}> {
	const cwd = options.cwd ?? process.cwd()
	const devflareConfig = await loadResolvedConfig({
		cwd,
		configFile: options.configPath,
		environment: options.environment
	})
	const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, devflareConfig)

	const wranglerConfig = compileConfig(devflareConfig)
	const cloudflareConfig = { ...wranglerConfig }
	if (composedMainEntry) {
		wranglerConfig.main = composedMainEntry
		cloudflareConfig.main = composedMainEntry
	}

	const auxiliaryWorkers: AuxiliaryWorkerConfig[] = []

	// Check for DO pattern (use default if not explicitly set to false)
	const doPatternConfig = devflareConfig.files?.durableObjects
	const doPattern = typeof doPatternConfig === 'string' ? doPatternConfig : DEFAULT_DO_PATTERN
	if (doPatternConfig !== false) {
		const doWorkerName = `${wranglerConfig.name}-do`
		const discovery = await discoverDurableObjects(cwd, doPattern, doWorkerName)

		if (discovery.files.size > 0) {
			// Update main worker's DO bindings with script_name
			if (cloudflareConfig.durable_objects) {
				const doConfig = cloudflareConfig.durable_objects as { bindings: Array<{ script_name?: string }> }
				for (const binding of doConfig.bindings) {
					binding.script_name = doWorkerName
				}
			}

			auxiliaryWorkers.push(createAuxiliaryWorkerConfig(wranglerConfig, discovery))
		}
	}

	return { cloudflareConfig, auxiliaryWorkers }
}

// Default export for convenience
export default devflarePlugin
