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

import { resolve } from 'pathe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { loadConfig } from '../config/loader'
import type { DevflareConfig } from '../config/schema'
import type { WranglerConfig } from '../config/compiler'
import {
	generateVirtualDOEntry,
	logDiscoveredDurableObjects,
	RESOLVED_VIRTUAL_DO_ENTRY,
	VIRTUAL_DO_ENTRY,
	type AuxiliaryWorkerConfig,
	type DODiscoveryResult
} from './plugin-durable-objects'
import {
	buildPluginContextState,
	resolvePluginConfigPath,
	writeGeneratedWranglerConfig
} from './plugin-context'
import {
	buildWebSocketProxyConfig,
	buildWorkerNameDefine,
	tryLoadDevflareConfig
} from './plugin-config-hook'

export type { AuxiliaryWorkerConfig, DODiscoveryResult }

// Config directory name (same as dev.ts)
const CONFIG_DIR = '.devflare'

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

interface PluginInstanceState {
	context: DevflarePluginContext
	projectRoot: string
	devflareConfig: DevflareConfig | null
	resolvedPluginConfigPath: string | null
}

function createPluginState(): PluginInstanceState {
	return {
		context: {
			wranglerConfig: null,
			cloudflareConfig: null,
			projectRoot: process.cwd(),
			auxiliaryWorkerConfig: null,
			durableObjects: null
		},
		projectRoot: process.cwd(),
		devflareConfig: null,
		resolvedPluginConfigPath: null
	}
}

// Module-level pointer to the most recently configured plugin instance.
// This is intentionally process-wide so that `getPluginContext()` — a
// convenience API typically called from a single `vite.config.ts` — can
// return the active plugin's context without requiring callers to hold a
// reference. Per-instance hooks do NOT read this; they close over their
// own state, so multiple `devflarePlugin()` calls in one process remain
// isolated from each other.
let lastPluginContext: DevflarePluginContext = createPluginState().context

/**
 * Get the compiled config context
 * Can be used by other plugins or CLI commands
 */
export function getPluginContext(): DevflarePluginContext {
	return lastPluginContext
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

	const state = createPluginState()

	return {
		name: 'devflare',

		// Run before other plugins
		enforce: 'pre',

		// Configure WebSocket proxy for DO connections in dev mode
		// Also inject build-time constants (workerName)
		async config(config, { command }) {
			const cwd = config.root ?? process.cwd()
			const returnConfig: Record<string, unknown> = {}

			const lfConfig = await tryLoadDevflareConfig(cwd, configPath, command as 'serve' | 'build')

			if (lfConfig) {
				returnConfig.define = buildWorkerNameDefine(lfConfig, (config.define ?? {}) as Record<string, unknown>)
			}

			// Only add proxy in dev mode when running under devflare dev
			if (command === 'serve' && process.env.DEVFLARE_DEV && lfConfig) {
				const port = bridgePort ?? 8787
				const proxyConfig = buildWebSocketProxyConfig(lfConfig, port, wsProxyPatterns)
				if (proxyConfig) {
					returnConfig.server = { proxy: proxyConfig }
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
				if (!state.context.durableObjects) {
					return '// No Durable Objects configured\nexport default { fetch: () => new Response("No DOs") }'
				}
				return generateVirtualDOEntry(state.context.durableObjects)
			}
			return null
		},

		async configResolved(config: ResolvedConfig) {
			state.projectRoot = config.root
			state.context.projectRoot = state.projectRoot
			state.resolvedPluginConfigPath = await resolvePluginConfigPath(state.projectRoot, configPath)

			try {
				// Load and compile config
				state.devflareConfig = await loadConfig({
					cwd: state.projectRoot,
					configFile: configPath
				})

				const pluginState = await buildPluginContextState(
					state.projectRoot,
					state.devflareConfig,
					environment,
					config.command === 'build' ? 'build' : 'serve'
				)
				Object.assign(state.context, {
					projectRoot: state.projectRoot,
					...pluginState
				})
				lastPluginContext = state.context

				logDiscoveredDurableObjects(state.projectRoot, pluginState.durableObjects)
				await writeGeneratedWranglerConfig(state.projectRoot, pluginState.wranglerConfig)

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
			const fullConfigPath = state.resolvedPluginConfigPath
				?? resolve(state.projectRoot, configPath || 'devflare.config.ts')

			server.watcher.add(fullConfigPath)

			server.watcher.on('change', async (changedPath: string) => {
				if (changedPath === fullConfigPath) {
					console.log('[devflare] Config changed, reloading...')

					try {
						state.devflareConfig = await loadConfig({
							cwd: state.projectRoot,
							configFile: configPath
						})

						const pluginState = await buildPluginContextState(state.projectRoot, state.devflareConfig, environment, 'serve')
						Object.assign(state.context, {
							projectRoot: state.projectRoot,
							...pluginState
						})
						lastPluginContext = state.context
						logDiscoveredDurableObjects(state.projectRoot, pluginState.durableObjects)
						await writeGeneratedWranglerConfig(state.projectRoot, pluginState.wranglerConfig)

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
 * Get cloudflare config for programmatic use with @cloudflare/vite-plugin.
 * Re-exported from `./plugin-programmatic`.
 */
export { getCloudflareConfig, getDevflareConfigs } from './plugin-programmatic'

// Default export for convenience
export default devflarePlugin
