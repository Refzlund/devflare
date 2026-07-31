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

import { dirname, resolve } from 'pathe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import type { WranglerConfig } from '../config/compiler'
import { loadConfig } from '../config/loader'
import type { DevflareConfig } from '../config/schema'
import { generatedDirName } from '../utils/generated-dir'
import { buildPluginConfigHookResult } from './plugin-config-hook'
import {
	buildPluginContextState,
	resolvePluginConfigPath,
	writeGeneratedWranglerConfig
} from './plugin-context'
import {
	type AuxiliaryWorkerConfig,
	type DODiscoveryResult,
	RESOLVED_VIRTUAL_DO_ENTRY,
	VIRTUAL_DO_ENTRY,
	generateVirtualDOEntry,
	logDiscoveredDurableObjects
} from './plugin-durable-objects'
import {
	RESOLVED_VIRTUAL_SERVICE_WORKER_PREFIX,
	VIRTUAL_SERVICE_WORKER_PREFIX
} from './plugin-service-bindings'
import { runDevflareTransform } from './plugin-transform'

export type { AuxiliaryWorkerConfig, DODiscoveryResult }

// Config directory name (same as dev.ts)

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
	auxiliaryWorkerConfigs: AuxiliaryWorkerConfig[]
	serviceWorkerVirtualModules: Map<string, string>

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
			auxiliaryWorkerConfigs: [],
			serviceWorkerVirtualModules: new Map(),
			durableObjects: null
		},
		projectRoot: process.cwd(),
		devflareConfig: null,
		resolvedPluginConfigPath: null
	}
}

/**
 * Reload `devflare.config.ts`, rebuild the plugin context state, mutate the
 * shared plugin state in-place, and write the generated wrangler config to
 * disk. Used by both `configResolved` (initial load) and the `configureServer`
 * watcher (HMR reload).
 */
async function loadAndApplyConfig(
	state: PluginInstanceState,
	options: { configPath: string | undefined; environment: string | undefined },
	mode: 'serve' | 'build',
	onContextUpdated: (ctx: DevflarePluginContext) => void
): Promise<void> {
	state.devflareConfig = await loadConfig({
		cwd: state.projectRoot,
		configFile: options.configPath
	})

	const pluginState = await buildPluginContextState(
		state.projectRoot,
		state.devflareConfig,
		options.environment,
		mode,
		state.resolvedPluginConfigPath ? dirname(state.resolvedPluginConfigPath) : state.projectRoot
	)
	Object.assign(state.context, {
		projectRoot: state.projectRoot,
		...pluginState
	})
	onContextUpdated(state.context)

	logDiscoveredDurableObjects(state.projectRoot, pluginState.durableObjects)
	await writeGeneratedWranglerConfig(state.projectRoot, pluginState.wranglerConfig)
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
 *         auxiliaryWorkers: getPluginContext().auxiliaryWorkerConfigs.length > 0
 *           ? getPluginContext().auxiliaryWorkerConfigs
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
		bridgePort = process.env.DEVFLARE_BRIDGE_PORT
			? Number.parseInt(process.env.DEVFLARE_BRIDGE_PORT, 10)
			: undefined,
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
			return buildPluginConfigHookResult(
				cwd,
				{ configPath, bridgePort, wsProxyPatterns },
				command as 'serve' | 'build',
				(config.define ?? {}) as Record<string, unknown>
			)
		},

		// Handle virtual module resolution
		resolveId(id: string) {
			if (id === VIRTUAL_DO_ENTRY) {
				return RESOLVED_VIRTUAL_DO_ENTRY
			}
			if (id.startsWith(VIRTUAL_SERVICE_WORKER_PREFIX)) {
				return '\0' + id
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
			if (id.startsWith(RESOLVED_VIRTUAL_SERVICE_WORKER_PREFIX)) {
				return state.context.serviceWorkerVirtualModules.get(id) ?? null
			}
			return null
		},

		async configResolved(config: ResolvedConfig) {
			state.projectRoot = config.root
			state.context.projectRoot = state.projectRoot
			state.resolvedPluginConfigPath = await resolvePluginConfigPath(state.projectRoot, configPath)

			try {
				await loadAndApplyConfig(
					state,
					{ configPath, environment },
					config.command === 'build' ? 'build' : 'serve',
					(ctx) => {
						lastPluginContext = ctx
					}
				)

				if (config.command === 'serve') {
					console.log(`[devflare] Config generated to ${generatedDirName()}/wrangler.jsonc`)
					if (state.context.auxiliaryWorkerConfig) {
						console.log('[devflare] ✓ Auxiliary DO worker configured')
					}
				}

				if (config.command === 'build') {
					console.log(`[devflare] Generated ${generatedDirName()}/wrangler.jsonc`)
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
			const fullConfigPath =
				state.resolvedPluginConfigPath ??
				resolve(state.projectRoot, configPath || 'devflare.config.ts')

			server.watcher.add(fullConfigPath)

			server.watcher.on('change', async (changedPath: string) => {
				if (changedPath === fullConfigPath) {
					console.log('[devflare] Config changed, reloading...')

					try {
						await loadAndApplyConfig(state, { configPath, environment }, 'serve', (ctx) => {
							lastPluginContext = ctx
						})

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
			return runDevflareTransform(code, id, { doTransforms })
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
