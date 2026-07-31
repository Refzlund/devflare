// =============================================================================
// Dev Server — Miniflare-first Development Experience
// =============================================================================
// Provides Miniflare, DO hot reload, and optional Vite integration when enabled
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { Miniflare as MiniflareType } from 'miniflare'
import { dirname, resolve } from 'pathe'
import { isIgnorableMiniflareDisposeError } from '../bridge/miniflare'
import { type DOBundleResult, bundleWorkerEntry } from '../bundler'
import { checkRemoteBindingRequirements } from '../cli/wrangler-auth'
import {
	EnvVarResolutionError,
	getDevflareDotenvPaths,
	resolveConfigEnvVars
} from '../config/env-vars'
import { loadConfig } from '../config/loader'
import { applyLocalDevVarsToConfig } from '../config/local-dev-vars'
import { resolveServiceBindings } from '../test/resolve-service-bindings'
import { generatedDir } from '../utils/generated-dir'
import { setLocalSendEmailBindings } from '../utils/send-email'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import { discoverRoutes } from '../worker-entry/routes'
import { bundleWorkflowEntrypointScript } from '../workflows/local-workflow-entrypoints'
import { runD1Migrations } from './d1-migrations'
import {
	type DevServerState,
	createDevServerState,
	disposeDevServerState
} from './dev-server-state'
import { buildMiniflareDevConfig, resolveR2PresignOrigin } from './miniflare-dev-config'
import { createMiniflareLog } from './miniflare-log'
import { createReloadQueue } from './reload-queue'
import {
	type RuntimeWatchdog,
	createRuntimeWatchdog,
	dialableHost,
	probeTcpReachable
} from './runtime-health'
import { createRuntimeStdioForwarder } from './runtime-stdio'
import {
	logMiniflareBindingDiagnostics,
	logMiniflareConfigDiagnostics,
	logRemoteBindingRequirements,
	logWorkerHandlerDetection,
	maybeStartBrowserShim,
	maybeStartDOBundler,
	resolveViteIntegration,
	resolveWorkerConfigWatchPath
} from './server-startup-helpers'
import { startViteProcess } from './vite-process'
import {
	applyWatcherTargetDiff,
	startWorkerSourceWatcher as createWorkerSourceWatcher
} from './worker-source-watcher'
import {
	collectWorkerWatchRoots,
	hasWorkerSurfacePaths,
	resolveMainWorkerSurfacePaths
} from './worker-surface-paths'

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
	/** Host the Miniflare runtime instance binds to (default: 127.0.0.1) */
	miniflareHost?: string
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
		miniflareHost = '127.0.0.1',
		enableVite: enableViteRequested = true,
		persist = true, // Default to true for dev - migrations need persistence
		logger,
		verbose = false,
		debug = process.env.DEVFLARE_DEBUG === 'true'
	} = options

	const state: DevServerState = createDevServerState({ enableVite: enableViteRequested })

	// Per-boot HMAC secret for the local R2 presign endpoint. Stable across
	// Miniflare reloads within this dev-server instance so already-minted
	// URLs stay valid; only injected when the config declares R2 bindings.
	const r2PresignSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`

	/** Whether the local runtime is still accepting connections. */
	async function isRuntimeReachable(): Promise<boolean> {
		return probeTcpReachable({ host: dialableHost(miniflareHost), port: miniflarePort })
	}

	/**
	 * Drop a runtime that has already gone away.
	 *
	 * Disposing a dead Miniflare routinely throws (its runtime is not there to talk to), which is not a
	 * reason to abandon the rebuild — so anything unrecognised is logged rather than propagated.
	 */
	async function discardDeadMiniflare(): Promise<void> {
		if (!state.miniflare) return
		try {
			await state.miniflare.dispose()
		} catch (error) {
			if (!isIgnorableMiniflareDisposeError(error)) {
				logger?.debug('Disposing the dead Miniflare threw (continuing with the rebuild):', error)
			}
		}
		state.miniflare = null
	}

	/**
	 * Set once {@link stop} begins. A rebuild started just before shutdown would otherwise construct a
	 * fresh Miniflare AFTER the teardown disposed the old one, leaking a runtime that outlives the
	 * server — which shows up as the next thing to use the port hanging.
	 */
	let isStopping = false

	/**
	 * Set once the runtime has come up at least once. Gates the rebuild path so a reload that arrives
	 * before the first start cannot mistake "not started yet" for "died".
	 */
	let hasStartedRuntime = false

	const reloadQueue = createReloadQueue({
		reload: async () => {
			if (isStopping) return

			// A runtime that has gone away cannot be reconfigured — `setOptions` would talk to a socket
			// that is no longer there. Rebuild it instead. This is the path the watchdog drives when
			// workerd dies on its own, which nothing used to notice.
			//
			// Checked BEFORE `state.miniflare`, deliberately: a rebuild that failed leaves that field
			// null, and gating on it would make every later reload — including the watchdog's own
			// retries — a silent no-op, wedging the server in the state we are here to escape.
			if (hasStartedRuntime && !(await isRuntimeReachable())) {
				if (isStopping) return
				logger?.warn('Local runtime stopped responding — rebuilding it')
				await discardDeadMiniflare()
				await startMiniflare(state.currentDoResult)
				// A rebuilt runtime starts empty unless storage is persisted, so the schema has to be
				// re-applied — otherwise the failure just changes shape, from a loud "binding is missing"
				// to a quiet "no such table" under a cheerful "Miniflare ready".
				await runD1Migrations({ cwd, config: state.config, miniflarePort, logger })
				return
			}

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

	/**
	 * Watches the runtime for the rest of the process's life, once it is first up.
	 *
	 * Held here rather than on {@link DevServerState} because it is pure server orchestration — it owns
	 * no resource the teardown sequence has to order around, only a timer.
	 */
	let runtimeWatchdog: RuntimeWatchdog | null = null

	/**
	 * Begin watching the runtime, if it is not already being watched.
	 *
	 * Deliberately idempotent, because `startMiniflare` also runs on the REBUILD path — replacing the
	 * watchdog there would hand each rebuild a fresh recovery budget, so a probe that is wrong about a
	 * healthy runtime could rebuild it forever without the attempt limit ever biting. One watchdog for
	 * the server's lifetime keeps that budget meaningful; only a successful probe clears it.
	 */
	function watchRuntimeHealth(): void {
		if (isStopping || runtimeWatchdog) return
		runtimeWatchdog = createRuntimeWatchdog({
			probe: isRuntimeReachable,
			// Rebuilding goes through the queue so it cannot race a config- or worker-driven reload.
			onRuntimeLost: () => reloadQueue.schedule(),
			logger
		})
	}

	async function bundleMainWorker(): Promise<void> {
		if (!state.mainWorkerScriptPath || !state.config) {
			state.bundledMainWorkerScriptPath = null
			return
		}

		state.bundledMainWorkerScriptPath = await bundleWorkerEntry({
			cwd,
			inputFile: state.mainWorkerScriptPath,
			outFile: generatedDir(cwd, 'worker-entrypoints', 'main.js'),
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
			miniflareHost,
			persist,
			enableVite: state.enableVite,
			debug,
			mainWorkerSurfacePaths: state.mainWorkerSurfacePaths,
			mainWorkerRoutes: state.mainWorkerRoutes,
			mainWorkerScriptPath: state.mainWorkerScriptPath,
			bundledMainWorkerScriptPath: state.bundledMainWorkerScriptPath,
			workflowEntrypointScript: state.workflowEntrypointScript,
			browserShimPort: state.browserShimPort,
			doResult,
			serviceBindingResolution: state.serviceBindingResolution,
			r2PresignSecret,
			logger
		})
	}

	async function bundleWorkflowEntrypoints(): Promise<void> {
		if (!state.config) {
			state.workflowEntrypointScript = ''
			return
		}

		state.workflowEntrypointScript = await bundleWorkflowEntrypointScript(state.config, cwd, {
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

		// Constructed into a local first: Miniflare validates synchronously and can throw, and assigning
		// only what was built keeps a failed rebuild from leaving a half-set field behind.
		const miniflare = new Miniflare(mfConfig)
		state.miniflare = miniflare
		await miniflare.ready

		const displayHost =
			miniflareHost === '0.0.0.0' || miniflareHost === '::' ? 'localhost' : miniflareHost
		logger?.success(`Miniflare ready on http://${displayHost}:${miniflarePort}`)

		// From here the runtime is a live child process that can die on its own; watch it so the dev
		// server rebuilds instead of silently serving every request against a runtime that is gone.
		hasStartedRuntime = true
		watchRuntimeHealth()

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
		await loadRuntimeConfigWhenEnvReady()
		if (!state.config) {
			return
		}
		setLocalSendEmailBindings(state.config.bindings?.sendEmail ?? {})
		await bundleWorkflowEntrypoints()
		await refreshWorkerOnlySurfaceState()
		await reloadMiniflare(state.currentDoResult)
	}

	async function loadRuntimeConfig(): Promise<void> {
		state.resolvedWorkerConfigPath = await resolveWorkerConfigWatchPath(cwd, configPath)
		const loadedConfig = await loadConfig({ cwd, configFile: configPath })
		const envResolvedConfig = await resolveConfigEnvVars(loadedConfig, {
			cwd,
			configPath: state.resolvedWorkerConfigPath ?? configPath,
			mode: 'dev'
		})
		state.config = await applyLocalDevVarsToConfig(envResolvedConfig, {
			cwd,
			configPath: state.resolvedWorkerConfigPath ?? undefined
		})
		state.serviceBindingResolution = state.config.bindings?.services
			? await resolveServiceBindings(
					state.config,
					state.resolvedWorkerConfigPath ? dirname(state.resolvedWorkerConfigPath) : cwd
				)
			: null
	}

	async function waitForDotenvChange(): Promise<void> {
		const configWatchPath =
			state.resolvedWorkerConfigPath ?? (await resolveWorkerConfigWatchPath(cwd, configPath))
		const startDir = configWatchPath ? dirname(configWatchPath) : cwd
		const watchPaths = getDevflareDotenvPaths(startDir)
		const { watch } = await import('chokidar')

		await new Promise<void>((resolveWait, rejectWait) => {
			const watcher = watch(watchPaths, {
				ignoreInitial: true,
				awaitWriteFinish: {
					stabilityThreshold: 100,
					pollInterval: 25
				}
			})
			const finish = () => {
				watcher.close().then(resolveWait, rejectWait)
			}

			watcher.on('add', finish)
			watcher.on('change', finish)
			watcher.on('unlink', finish)
			watcher.on('error', rejectWait)
		})
	}

	async function loadRuntimeConfigWhenEnvReady(): Promise<void> {
		while (true) {
			try {
				await loadRuntimeConfig()
				return
			} catch (error) {
				if (!(error instanceof EnvVarResolutionError)) {
					throw error
				}

				logger?.warn(error.message)
				logger?.info('Devflare dev is waiting for .env or .env.dev to change before starting.')
				await waitForDotenvChange()
			}
		}
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
		await loadRuntimeConfigWhenEnvReady()
		if (!state.config) {
			throw new Error('Config not loaded')
		}
		setLocalSendEmailBindings(state.config.bindings?.sendEmail ?? {})
		logger?.debug('Loaded config:', state.config.name)
		await bundleWorkflowEntrypoints()
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
			!state.enableVite &&
			(hasWorkerSurfacePaths(state.mainWorkerSurfacePaths) ||
				Boolean(state.mainWorkerRoutes?.routes.length))
		) {
			logWorkerHandlerDetection(
				logger,
				state.enableVite,
				true,
				state.mainWorkerSurfacePaths,
				state.mainWorkerRoutes
			)
		} else if (!state.enableVite) {
			logWorkerHandlerDetection(
				logger,
				state.enableVite,
				false,
				state.mainWorkerSurfacePaths,
				state.mainWorkerRoutes
			)
		}

		// Check for remote bindings and warn if requirements not met
		const remoteCheck = await checkRemoteBindingRequirements(state.config)
		logRemoteBindingRequirements(logger, remoteCheck)

		// Start browser shim if browser rendering is configured
		state.browserShim = await maybeStartBrowserShim(state.config, {
			browserShimPort: state.browserShimPort,
			logger,
			verbose
		})

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
				configPath,
				vitePort,
				miniflarePort,
				generatedViteConfigPath: state.generatedViteConfigPath,
				r2Presign: state.config.bindings?.r2
					? {
							secret: r2PresignSecret,
							origin: resolveR2PresignOrigin(state.config.server, miniflareHost, miniflarePort)
						}
					: null,
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
		// Order matters: refuse new rebuilds, stop probing so none is scheduled, then let any rebuild
		// already running finish. Disposing while one is in flight would leave the runtime it builds
		// behind, outliving the server that owns it.
		isStopping = true
		runtimeWatchdog?.stop()
		runtimeWatchdog = null
		await reloadQueue.drain()
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
