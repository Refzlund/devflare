// =============================================================================
// Dev Server — Miniflare-first Development Experience
// =============================================================================
// Provides Miniflare, DO hot reload, and optional Vite integration when enabled
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { Miniflare as MiniflareType } from 'miniflare'
import { resolve } from 'pathe'
import { loadConfig } from '../config/loader'
import { applyLocalDevVarsToConfig } from '../config/local-dev-vars'
import { bundleWorkerEntry, type DOBundleResult } from '../bundler'
import { checkRemoteBindingRequirements } from '../cli/wrangler-auth'
import { setLocalSendEmailBindings } from '../utils/send-email'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import { discoverRoutes } from '../worker-entry/routes'
import { runD1Migrations } from './d1-migrations'
import { createMiniflareLog } from './miniflare-log'
import { buildMiniflareDevConfig } from './miniflare-dev-config'
import { createRuntimeStdioForwarder } from './runtime-stdio'
import { startViteProcess } from './vite-process'
import { createReloadQueue } from './reload-queue'
import {
	collectWorkerWatchRoots,
	hasWorkerSurfacePaths,
	resolveMainWorkerSurfacePaths
} from './worker-surface-paths'
import { applyWatcherTargetDiff, startWorkerSourceWatcher as createWorkerSourceWatcher } from './worker-source-watcher'
import { logMiniflareBindingDiagnostics, logMiniflareConfigDiagnostics, logRemoteBindingRequirements, logWorkerHandlerDetection, maybeStartBrowserShim, maybeStartDOBundler, resolveViteIntegration, resolveWorkerConfigWatchPath } from './server-startup-helpers'
import { createDevServerState, disposeDevServerState, type DevServerState } from './dev-server-state'

// -----------------------------------------------------------------------------

export interface DevServerOptions {
	/** Project root directory */
	cwd: string
	/** Config file path (optional) */
	configPath?: string
	/** Vite dev server port (default: 5173) */
	vitePort?: number
	/** Miniflare port for gateway (default: 8787) */
	miniflarePort?: number
	/** Whether to start Vite for this package */
	enableVite?: boolean
	/** Persist storage data */
	persist?: boolean
	/** Logger instance */
	logger?: ConsolaInstance
	/** Enable verbose logging */
	verbose?: boolean
	/** Enable debug mode (extra logging in gateway worker) */
	debug?: boolean
}

export interface DevServer {
	/** Start the dev server */
	start(): Promise<void>
	/** Stop the dev server */
	stop(): Promise<void>
	/** Get Miniflare instance for testing */
	getMiniflare(): MiniflareType | null
}

// -----------------------------------------------------------------------------
// Dev Server Implementation
// -----------------------------------------------------------------------------

export function createDevServer(options: DevServerOptions): DevServer {
	const {
		cwd,
		configPath,
		vitePort = 5173,
		miniflarePort = 8787,
		enableVite: enableViteRequested = true,
		persist = true, // Default to true for dev - migrations need persistence
		logger,
		verbose = false,
		debug = process.env.DEVFLARE_DEBUG === 'true'
	} = options

	const state: DevServerState = createDevServerState({ enableVite: enableViteRequested })

	const reloadQueue = createReloadQueue({
		reload: async () => {
			if (!state.miniflare) return

			const { Log, LogLevel } = await import('miniflare')
			const mfConfig = buildMiniflareConfig(state.currentDoResult)
			// Always enable debug logging to see worker load errors
			const log = createMiniflareLog(Log, LogLevel, 'DEBUG', logger)
			if (log) {
				mfConfig.log = log as typeof mfConfig.log
			}
			mfConfig.handleRuntimeStdio = createRuntimeStdioForwarder(logger)

			logger?.info('Reloading Miniflare...')
			await state.miniflare.setOptions(mfConfig)
			logger?.success('Miniflare reloaded')
		},
		logger
	})

	async function bundleMainWorker(): Promise<void> {
		if (!state.mainWorkerScriptPath || !state.config) {
			state.bundledMainWorkerScriptPath = null
			return
		}

		state.bundledMainWorkerScriptPath = await bundleWorkerEntry({
			cwd,
			inputFile: state.mainWorkerScriptPath,
			outFile: resolve(cwd, '.devflare', 'worker-entrypoints', 'main.js'),
			rolldownOptions: state.config.rolldown?.options,
			sourcemap: state.config.rolldown?.sourcemap,
			minify: state.config.rolldown?.minify,
			logger
		})
		logger?.debug(`Bundled main worker → ${state.bundledMainWorkerScriptPath}`)
	}

	function buildMiniflareConfig(doResult: DOBundleResult | null) {
		if (!state.config) throw new Error('Config not loaded')

		return buildMiniflareDevConfig({
			config: state.config,
			cwd,
			miniflarePort,
			persist,
			enableVite: state.enableVite,
			debug,
			mainWorkerSurfacePaths: state.mainWorkerSurfacePaths,
			mainWorkerRoutes: state.mainWorkerRoutes,
			mainWorkerScriptPath: state.mainWorkerScriptPath,
			bundledMainWorkerScriptPath: state.bundledMainWorkerScriptPath,
			browserShimPort: state.browserShimPort,
			doResult,
			logger
		})
	}

	/**
	 * Start Miniflare with current config
	 */
	async function startMiniflare(doResult: DOBundleResult | null): Promise<void> {
		const { Miniflare, Log, LogLevel } = await import('miniflare')

		const mfConfig = buildMiniflareConfig(doResult)
		const log = createMiniflareLog(Log, LogLevel, 'DEBUG', logger)
		if (log) {
			mfConfig.log = log as typeof mfConfig.log
		}
		mfConfig.handleRuntimeStdio = createRuntimeStdioForwarder(logger)
		const shouldLogMiniflareDiagnostics = verbose || debug

		if (shouldLogMiniflareDiagnostics) {
			logMiniflareConfigDiagnostics(logger, mfConfig)
		}

		state.miniflare = new Miniflare(mfConfig)
		await state.miniflare.ready

		logger?.success(`Miniflare ready on http://localhost:${miniflarePort}`)

		if (shouldLogMiniflareDiagnostics) {
			await logMiniflareBindingDiagnostics(logger, state.miniflare, mfConfig)
		}
	}

	/**
	 * Reload Miniflare with updated DO bundles
	 */
	async function reloadMiniflare(doResult: DOBundleResult | null): Promise<void> {
		state.currentDoResult = doResult
		await reloadQueue.schedule()
	}



	async function refreshWorkerOnlySurfaceState(): Promise<void> {
		if (!state.config) {
			return
		}

		state.mainWorkerSurfacePaths = await resolveMainWorkerSurfacePaths(cwd, state.config)
		state.mainWorkerRoutes = await discoverRoutes(cwd, state.config)
		const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, state.config, undefined, {
			devInternalEmail: true
		})
		state.mainWorkerScriptPath = composedMainEntry ? composedMainEntry : null

		if (state.mainWorkerScriptPath) {
			await bundleMainWorker()
		} else {
			state.bundledMainWorkerScriptPath = null
		}

		await syncWorkerWatchTargets()
	}

	function getWorkerWatchTargets(): string[] {
		if (state.enableVite || !state.config) {
			return []
		}

		const targets = collectWorkerWatchRoots(cwd, state.config, state.mainWorkerSurfacePaths)
		if (state.resolvedWorkerConfigPath) {
			targets.push(state.resolvedWorkerConfigPath)
		}

		return [...new Set(targets)]
	}

	async function syncWorkerWatchTargets(): Promise<void> {
		if (!state.workerSourceWatcher) {
			return
		}
		state.workerWatchTargets = await applyWatcherTargetDiff(
			state.workerSourceWatcher,
			state.workerWatchTargets,
			getWorkerWatchTargets()
		)
	}

	async function reloadWorkerOnlyConfig(): Promise<void> {
		await loadRuntimeConfig()
		if (!state.config) {
			return
		}
		setLocalSendEmailBindings(state.config.bindings?.sendEmail ?? {})
		await refreshWorkerOnlySurfaceState()
		await reloadMiniflare(state.currentDoResult)
	}

	async function loadRuntimeConfig(): Promise<void> {
		const loadedConfig = await loadConfig({ cwd, configFile: configPath })
		state.resolvedWorkerConfigPath = await resolveWorkerConfigWatchPath(cwd, configPath)
		state.config = await applyLocalDevVarsToConfig(loadedConfig, {
			cwd,
			configPath: state.resolvedWorkerConfigPath ?? undefined
		})
	}

	async function startWorkerSourceWatcher(): Promise<void> {
		if (state.enableVite || !state.config) {
			return
		}

		const watchTargets = getWorkerWatchTargets()
		if (watchTargets.length === 0) {
			return
		}

		state.workerWatchTargets = watchTargets
		state.workerSourceWatcher = await createWorkerSourceWatcher({
			watchTargets,
			resolvedWorkerConfigPath: state.resolvedWorkerConfigPath,
			logger,
			onConfigChange: reloadWorkerOnlyConfig,
			onWorkerChange: async () => {
				await refreshWorkerOnlySurfaceState()
				await reloadMiniflare(state.currentDoResult)
			}
		})
	}

	/**
	 * Start the complete dev server
	 */
	async function start(): Promise<void> {
		logger?.info('Starting unified dev server...')

		// Load config
		await loadRuntimeConfig()
		if (!state.config) {
			throw new Error('Config not loaded')
		}
		setLocalSendEmailBindings(state.config.bindings?.sendEmail ?? {})
		logger?.debug('Loaded config:', state.config.name)
		const viteIntegration = await resolveViteIntegration({
			cwd,
			configPath,
			miniflarePort,
			enableViteRequested: state.enableVite,
			logger
		})
		state.enableVite = viteIntegration.enableVite
		state.generatedViteConfigPath = viteIntegration.generatedViteConfigPath
		await refreshWorkerOnlySurfaceState()

		if (
			!state.enableVite
			&& (hasWorkerSurfacePaths(state.mainWorkerSurfacePaths) || Boolean(state.mainWorkerRoutes?.routes.length))
		) {
			logWorkerHandlerDetection(
				logger,
				state.enableVite,
				true,
				state.mainWorkerSurfacePaths,
				state.mainWorkerRoutes
			)
		} else if (!state.enableVite) {
			logWorkerHandlerDetection(logger, state.enableVite, false, state.mainWorkerSurfacePaths, state.mainWorkerRoutes)
		}

		// Check for remote bindings and warn if requirements not met
		const remoteCheck = await checkRemoteBindingRequirements(state.config)
		logRemoteBindingRequirements(logger, remoteCheck)

		// Start browser shim if browser rendering is configured
		state.browserShim = await maybeStartBrowserShim(state.config, { browserShimPort: state.browserShimPort, logger, verbose })

		// Bundle DOs if pattern is set
		const doInit = await maybeStartDOBundler(state.config, {
			cwd,
			logger,
			onRebuild: async (result) => {
				// Hot reload Miniflare when DOs change
				await reloadMiniflare(result)
			}
		})
		state.doBundler = doInit.bundler
		const doResult: DOBundleResult | null = doInit.result
		state.currentDoResult = doResult

		// Start Miniflare
		await startMiniflare(doResult)
		await startWorkerSourceWatcher()

		if (state.enableVite) {
			state.viteProcess = await startViteProcess({
				cwd,
				vitePort,
				miniflarePort,
				generatedViteConfigPath: state.generatedViteConfigPath,
				logger
			})
		} else {
			logger?.info('Vite startup skipped (no effective Vite config found for this package)')
		}

		// Run D1 migrations after the dev runtime is started (give Miniflare more time to stabilize)
		await new Promise((r) => setTimeout(r, 1000))
		await runD1Migrations({ cwd, config: state.config, miniflarePort, logger })
	}

	/**
	 * Stop the dev server
	 */
	async function stop(): Promise<void> {
		await disposeDevServerState(state)
	}

	/**
	 * Get Miniflare instance
	 */
	function getMiniflare(): MiniflareType | null {
		return state.miniflare
	}

	return {
		start,
		stop,
		getMiniflare
	}
}
