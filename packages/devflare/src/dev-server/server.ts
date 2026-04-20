// =============================================================================
// Dev Server — Miniflare-first Development Experience
// =============================================================================
// Provides Miniflare, DO hot reload, and optional Vite integration when enabled
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { Miniflare as MiniflareType } from 'miniflare'
import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { loadConfig, resolveConfigPath } from '../config/loader'
import { getLocalD1DatabaseIdentifier, getLocalKVNamespaceIdentifier, getSingleBrowserBindingName } from '../config/schema'
import { bundleWorkerEntry, createDOBundler, type DOBundler, type DOBundleResult } from '../bundler'
import { createBrowserShim, type BrowserShim } from '../browser-shim'
import { getBrowserBindingScript } from '../browser-shim/binding-worker'
import { checkRemoteBindingRequirements } from '../cli/wrangler-auth'
import { clearLocalSendEmailBindings, setLocalSendEmailBindings } from '../utils/send-email'
import { writeGeneratedViteConfig } from '../vite'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import { discoverRoutes, type RouteDiscoveryResult } from '../worker-entry/routes'
import { runD1Migrations } from './d1-migrations'
import { getGatewayScript } from './gateway-script'
import { createCompatibilityAwareMiniflareLog } from './miniflare-log'
import { buildQueueConsumers, buildQueueProducers, buildSendEmailConfig } from './miniflare-bindings'
import { createRuntimeStdioForwarder } from './runtime-stdio'
import { resolveViteMode, stopSpawnedProcessTree } from './vite-utils'
import { startViteProcess } from './vite-process'
import { createReloadQueue } from './reload-queue'
import {
	collectWorkerWatchRoots,
	hasWorkerSurfacePaths,
	resolveMainWorkerSurfacePaths,
	type WorkerSurfacePaths
} from './worker-surface-paths'
import { startWorkerSourceWatcher as createWorkerSourceWatcher } from './worker-source-watcher'

// -----------------------------------------------------------------------------
// Types
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

const INTERNAL_APP_SERVICE_BINDING = '__DEVFLARE_APP'

type MiniflareServiceBinding = { name: string; entrypoint?: string }

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
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

	let enableVite = enableViteRequested
	let miniflare: MiniflareType | null = null
	let doBundler: DOBundler | null = null
	let workerSourceWatcher: import('chokidar').FSWatcher | null = null
	let workerWatchTargets: string[] = []
	let viteProcess: import('node:child_process').ChildProcess | null = null
	let config: DevflareConfig | null = null
	let browserShim: BrowserShim | null = null
	let browserShimPort = 8788
	let mainWorkerSurfacePaths: WorkerSurfacePaths = {
		fetch: null,
		queue: null,
		scheduled: null,
		email: null
	}
	let resolvedWorkerConfigPath: string | null = null
	let mainWorkerScriptPath: string | null = null
	let bundledMainWorkerScriptPath: string | null = null
	let currentDoResult: DOBundleResult | null = null
	let mainWorkerRoutes: RouteDiscoveryResult | null = null
	let generatedViteConfigPath: string | null = null

	const reloadQueue = createReloadQueue({
		reload: async () => {
			if (!miniflare) return

			const { Log, LogLevel } = await import('miniflare')
			const mfConfig = buildMiniflareConfig(currentDoResult)
			// Always enable debug logging to see worker load errors
			mfConfig.log = createCompatibilityAwareMiniflareLog(Log, LogLevel.DEBUG, logger)
			mfConfig.handleRuntimeStdio = createRuntimeStdioForwarder(logger)

			logger?.info('Reloading Miniflare...')
			await miniflare.setOptions(mfConfig)
			logger?.success('Miniflare reloaded')
		},
		logger
	})

	async function bundleMainWorker(): Promise<void> {
		if (!mainWorkerScriptPath || !config) {
			bundledMainWorkerScriptPath = null
			return
		}

		bundledMainWorkerScriptPath = await bundleWorkerEntry({
			cwd,
			inputFile: mainWorkerScriptPath,
			outFile: resolve(cwd, '.devflare', 'worker-entrypoints', 'main.js'),
			rolldownOptions: config.rolldown?.options,
			sourcemap: config.rolldown?.sourcemap,
			minify: config.rolldown?.minify,
			logger
		})
		logger?.debug(`Bundled main worker → ${bundledMainWorkerScriptPath}`)
	}

	/**
	 * Build Miniflare configuration
	 *
	 * IMPORTANT: When using multi-worker setup, ALL workers must go in the
	 * `workers` array. The FIRST worker is the entrypoint and receives all
	 * HTTP requests. Top-level script/modules options are NOT used when
	 * workers array is present.
	 */
	function buildMiniflareConfig(doResult: DOBundleResult | null) {
		if (!config) throw new Error('Config not loaded')

		const loadedConfig = config

		const bindings = loadedConfig.bindings ?? {}
		const persistPath = resolve(cwd, '.devflare/data')
		const appWorkerName = loadedConfig.name
		const shouldRunMainWorker = !enableVite && (
			hasWorkerSurfacePaths(mainWorkerSurfacePaths)
			|| Boolean(mainWorkerRoutes?.routes.length)
		)
		const queueProducers = buildQueueProducers(bindings)
		const queueConsumers = buildQueueConsumers(bindings)

		// Shared options (not worker-specific)
		const sharedOptions: any = {
			port: miniflarePort,
			host: '127.0.0.1',

			// Persistence paths
			kvPersist: persist ? `${persistPath}/kv` : undefined,
			r2Persist: persist ? `${persistPath}/r2` : undefined,
			d1Persist: persist ? `${persistPath}/d1` : undefined,
			durableObjectsPersist: persist ? `${persistPath}/do` : undefined
		}

		const createServiceBindings = (
			extraBindings: Record<string, MiniflareServiceBinding> = {}
		) => {
			const serviceBindings: Record<string, MiniflareServiceBinding> = {}

			if (bindings.services) {
				for (const [bindingName, serviceConfig] of Object.entries(bindings.services)) {
					serviceBindings[bindingName] = {
						name: serviceConfig.service,
						...(serviceConfig.entrypoint && { entrypoint: serviceConfig.entrypoint })
					}
				}
			}

			for (const [bindingName, target] of Object.entries(extraBindings)) {
				serviceBindings[bindingName] = target
			}

			return Object.keys(serviceBindings).length > 0 ? serviceBindings : undefined
		}

		const sendEmailConfig = buildSendEmailConfig(bindings)

		const createWorkerConfig = (options: {
			name: string
			script?: string
			scriptPath?: string
			durableObjects?: Record<string, string | { className: string; scriptName: string }>
			serviceBindings?: Record<string, MiniflareServiceBinding>
			queueConsumers?: Record<string, Record<string, unknown>>
			triggers?: { crons?: string[] }
		}) => {
			const baseFlags = loadedConfig.compatibilityFlags ?? []
			const compatFlags = baseFlags.includes('nodejs_compat')
				? baseFlags
				: [...baseFlags, 'nodejs_compat']
			const workerBindings: Record<string, unknown> = loadedConfig.vars ?? {}

			const workerConfig: any = {
				name: options.name,
				modules: true,
				compatibilityDate: loadedConfig.compatibilityDate,
				compatibilityFlags: compatFlags,
				...(bindings.kv && {
					kvNamespaces: Object.fromEntries(
						Object.entries(bindings.kv).map(([bindingName, bindingConfig]) => {
							return [bindingName, getLocalKVNamespaceIdentifier(bindingConfig)]
						})
					)
				}),
				...(bindings.r2 && { r2Buckets: bindings.r2 }),
				...(bindings.d1 && {
					d1Databases: Object.fromEntries(
						Object.entries(bindings.d1).map(([bindingName, bindingConfig]) => {
							return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
						})
					)
				}),
				...(Object.keys(workerBindings).length > 0 && { bindings: workerBindings }),
				...(sendEmailConfig && { email: sendEmailConfig }),
				...(queueProducers && { queueProducers }),
				...(options.queueConsumers && { queueConsumers: options.queueConsumers }),
				...(options.triggers && { triggers: options.triggers })
			}

			if (options.scriptPath) {
				workerConfig.scriptPath = options.scriptPath
				workerConfig.modulesRoot = cwd
				workerConfig.modulesRules = [
					{ type: 'ESModule', include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.mjs'] },
					{ type: 'CommonJS', include: ['**/*.js', '**/*.cjs'] },
					{ type: 'ESModule', include: ['**/*.jsx'] }
				]
			}

			if (options.script) {
				workerConfig.script = options.script
			}

			if (options.durableObjects && Object.keys(options.durableObjects).length > 0) {
				workerConfig.durableObjects = options.durableObjects
			}

			if (options.serviceBindings && Object.keys(options.serviceBindings).length > 0) {
				workerConfig.serviceBindings = options.serviceBindings
			}

			return workerConfig
		}

		// Gateway worker configuration (receives all HTTP requests)
		// The first worker in the array is the entrypoint
		const gatewayWorker = createWorkerConfig({
			name: 'gateway',
			script: getGatewayScript(
				loadedConfig.wsRoutes,
				debug,
				shouldRunMainWorker ? INTERNAL_APP_SERVICE_BINDING : null
			),
			serviceBindings: shouldRunMainWorker
				? createServiceBindings({
					[INTERNAL_APP_SERVICE_BINDING]: { name: appWorkerName }
				})
				: createServiceBindings()
		})
		gatewayWorker.routes = ['*']

		const hasDurableObjectBundles = !!doResult && doResult.bundles.size > 0
		const browserBindingName = getSingleBrowserBindingName(bindings.browser)
		const needsBrowserWorker = Boolean(browserBindingName && (hasDurableObjectBundles || shouldRunMainWorker))

		// If there is no app worker, DO worker, or browser worker, keep the
		// lightweight gateway-only configuration.
		if (!shouldRunMainWorker && !hasDurableObjectBundles && !needsBrowserWorker) {
			return {
				...sharedOptions,
				...gatewayWorker
			}
		}

		// Multi-worker setup: gateway + DO workers + browser binding worker
		// CRITICAL: First worker in array is entrypoint (receives HTTP requests)
		const workers: any[] = []
		const durableObjects: Record<string, { className: string; scriptName: string }> = {}

		// Browser binding configuration
		const browserShimUrl = `http://127.0.0.1:${browserShimPort}`
		const browserWorkerName = 'browser-binding'

		if (shouldRunMainWorker && mainWorkerScriptPath) {
			const mainWorkerServiceBindings = createServiceBindings(
				browserBindingName
					? {
						[browserBindingName]: { name: browserWorkerName }
					}
					: {}
			)

			const mainWorkerConfig = createWorkerConfig({
				name: appWorkerName,
				scriptPath: bundledMainWorkerScriptPath ?? mainWorkerScriptPath,
				serviceBindings: mainWorkerServiceBindings,
				queueConsumers,
				triggers: loadedConfig.triggers?.crons?.length
					? { crons: loadedConfig.triggers.crons }
					: undefined
			})

			workers.push(mainWorkerConfig)
		}

		// Create a worker for each DO bundle
		if (doResult) {
			for (const [bindingName, bundlePath] of doResult.bundles) {
				const className = doResult.classes.get(bindingName)
				if (!className) continue

				const workerName = `do-${bindingName.toLowerCase()}`

				const workerConfig = createWorkerConfig({
					name: workerName,
					scriptPath: bundlePath,
					durableObjects: {
						[bindingName]: className
					},
					serviceBindings: createServiceBindings(
						browserBindingName
							? {
								[browserBindingName]: { name: browserWorkerName }
							}
							: {}
					)
				})

				if (browserBindingName) {
					logger?.debug(`DO ${workerName} has browser service binding: ${browserBindingName} → ${browserWorkerName}`)
				}

				logger?.debug(`DO ${workerName} config:`, JSON.stringify(workerConfig, null, 2))
				workers.push(workerConfig)

				// Reference this worker from the gateway
				durableObjects[bindingName] = {
					className,
					scriptName: workerName
				}
			}
		}

		// Add browser binding worker if configured
		// This worker runs inside workerd and handles WebSocket upgrades properly
		if (needsBrowserWorker) {
			const browserWorker = createWorkerConfig({
				name: browserWorkerName,
				script: getBrowserBindingScript(browserShimUrl, debug)
			})
			workers.push(browserWorker)
			logger?.info(`Browser binding worker configured: ${browserBindingName} → ${browserShimUrl}`)
		}

		// Add DO bindings to gateway worker
		if (Object.keys(durableObjects).length > 0) {
			gatewayWorker.durableObjects = durableObjects

			if (shouldRunMainWorker) {
				const mainWorker = workers.find((worker) => worker.name === appWorkerName)
				if (mainWorker) {
					mainWorker.durableObjects = durableObjects
				}
			}
		}

		// Return multi-worker config with gateway FIRST (entrypoint)
		// Note: Browser binding uses Node.js handler (not a worker)
		return {
			...sharedOptions,
			workers: [gatewayWorker, ...workers]
		}
	}

	/**
	 * Start Miniflare with current config
	 */
	async function startMiniflare(doResult: DOBundleResult | null): Promise<void> {
		const { Miniflare, Log, LogLevel } = await import('miniflare')

		const mfConfig = buildMiniflareConfig(doResult)
		mfConfig.log = createCompatibilityAwareMiniflareLog(Log, LogLevel.DEBUG, logger)
		mfConfig.handleRuntimeStdio = createRuntimeStdioForwarder(logger)
		const shouldLogMiniflareDiagnostics = verbose || debug

		if (shouldLogMiniflareDiagnostics) {
			logger?.info('=== MINIFLARE CONFIG DEBUG ===')
			logger?.info('Full config:', JSON.stringify(mfConfig, (key, value) => {
				// Truncate long scripts
				if (key === 'script' && typeof value === 'string' && value.length > 200) {
					return value.substring(0, 200) + '...[truncated]'
				}
				return value
			}, 2))

			if (mfConfig.workers) {
				logger?.info('Workers order:')
				for (const w of mfConfig.workers) {
					logger?.info(`  → ${w.name}:`)
					logger?.info(`      script: ${w.script ? 'inline' : w.scriptPath}`)
					logger?.info(`      browserRendering: ${JSON.stringify(w.browserRendering)}`)
					logger?.info(`      durableObjects: ${JSON.stringify(w.durableObjects)}`)
				}
			}
		}

		miniflare = new Miniflare(mfConfig)
		await miniflare.ready

		logger?.success(`Miniflare ready on http://localhost:${miniflarePort}`)

		if (shouldLogMiniflareDiagnostics) {
			try {
				const gatewayBindings = await miniflare.getBindings('gateway')
				logger?.info('Gateway worker bindings:', Object.keys(gatewayBindings))

				if (mfConfig.workers) {
					for (const w of mfConfig.workers) {
						if (w.name !== 'gateway') {
							try {
								const doBindings = await miniflare.getBindings(w.name)
								logger?.info(`${w.name} worker bindings:`, Object.keys(doBindings))
								if ('BROWSER' in doBindings) {
									logger?.success(`${w.name} has BROWSER binding!`)
								} else {
									logger?.warn(`${w.name} is MISSING BROWSER binding`)
								}
							} catch (error) {
								logger?.debug(`Skipping binding diagnostics for ${w.name}: ${formatErrorMessage(error)}`)
							}
						}
					}
				}
			} catch (error) {
				logger?.debug(`Skipping Miniflare binding diagnostics: ${formatErrorMessage(error)}`)
			}
		}
	}

	/**
	 * Reload Miniflare with updated DO bundles
	 */
	async function reloadMiniflare(doResult: DOBundleResult | null): Promise<void> {
		currentDoResult = doResult
		await reloadQueue.schedule()
	}

	async function resolveWorkerConfigWatchPath(): Promise<string | null> {
		if (configPath) {
			const explicitPath = resolve(cwd, configPath)
			const fs = await import('node:fs/promises')
			try {
				await fs.access(explicitPath)
				return explicitPath
			} catch {
				// Fall back to config discovery below when the explicit path is not directly watchable.
			}
		}

		return await resolveConfigPath(cwd) ?? null
	}

	async function refreshWorkerOnlySurfaceState(): Promise<void> {
		if (!config) {
			return
		}

		mainWorkerSurfacePaths = await resolveMainWorkerSurfacePaths(cwd, config)
		mainWorkerRoutes = await discoverRoutes(cwd, config)
		const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, config, undefined, {
			devInternalEmail: true
		})
		mainWorkerScriptPath = composedMainEntry ? resolve(cwd, composedMainEntry) : null

		if (mainWorkerScriptPath) {
			await bundleMainWorker()
		} else {
			bundledMainWorkerScriptPath = null
		}

		await syncWorkerWatchTargets()
	}

	function getWorkerWatchTargets(): string[] {
		if (enableVite || !config) {
			return []
		}

		const targets = collectWorkerWatchRoots(cwd, config, mainWorkerSurfacePaths)
		if (resolvedWorkerConfigPath) {
			targets.push(resolvedWorkerConfigPath)
		}

		return [...new Set(targets)]
	}

	async function syncWorkerWatchTargets(): Promise<void> {
		if (!workerSourceWatcher) {
			return
		}

		const nextWatchTargets = getWorkerWatchTargets()
		const nextWatchTargetSet = new Set(nextWatchTargets)
		const targetsToRemove = workerWatchTargets.filter((target) => !nextWatchTargetSet.has(target))
		const targetsToAdd = nextWatchTargets.filter((target) => !workerWatchTargets.includes(target))

		if (targetsToRemove.length > 0) {
			await workerSourceWatcher.unwatch(targetsToRemove)
		}

		if (targetsToAdd.length > 0) {
			workerSourceWatcher.add(targetsToAdd)
		}

		workerWatchTargets = nextWatchTargets
	}

	async function reloadWorkerOnlyConfig(): Promise<void> {
		config = await loadConfig({ cwd, configFile: configPath })
		setLocalSendEmailBindings(config.bindings?.sendEmail ?? {})
		resolvedWorkerConfigPath = await resolveWorkerConfigWatchPath()
		await refreshWorkerOnlySurfaceState()
		await reloadMiniflare(currentDoResult)
	}

	async function startWorkerSourceWatcher(): Promise<void> {
		if (enableVite || !config) {
			return
		}

		const watchTargets = getWorkerWatchTargets()
		if (watchTargets.length === 0) {
			return
		}

		workerWatchTargets = watchTargets
		workerSourceWatcher = await createWorkerSourceWatcher({
			watchTargets,
			resolvedWorkerConfigPath,
			logger,
			onConfigChange: reloadWorkerOnlyConfig,
			onWorkerChange: async () => {
				await refreshWorkerOnlySurfaceState()
				await reloadMiniflare(currentDoResult)
			}
		})
	}

	/**
	 * Start the complete dev server
	 */
	async function start(): Promise<void> {
		logger?.info('Starting unified dev server...')

		// Load config
		config = await loadConfig({ cwd, configFile: configPath })
		setLocalSendEmailBindings(config.bindings?.sendEmail ?? {})
		resolvedWorkerConfigPath = await resolveWorkerConfigWatchPath()
		logger?.debug('Loaded config:', config.name)
		if (enableVite) {
			const viteMode = await resolveViteMode(cwd, { requested: true })
			if (!viteMode.enableVite) {
				logger?.info('Vite disabled: no vite config found for this package')
				enableVite = false
			} else {
				generatedViteConfigPath = await writeGeneratedViteConfig({
					cwd,
					configPath,
					localConfigPath: viteMode.viteConfigPath,
					bridgePort: miniflarePort
				})
				logger?.debug(`Generated Vite config → ${generatedViteConfigPath}`)
			}
		}
		await refreshWorkerOnlySurfaceState()

		if (
			!enableVite
			&& (hasWorkerSurfacePaths(mainWorkerSurfacePaths) || Boolean(mainWorkerRoutes?.routes.length))
		) {
			const detectedWorkerHandlers = Object.entries(mainWorkerSurfacePaths)
				.filter(([, surfacePath]) => !!surfacePath)
				.map(([surfaceName, surfacePath]) => `${surfaceName}=${surfacePath}`)
			const detectedRouteHandlers = mainWorkerRoutes?.routes.map((route) => `route=${route.filePath}`) ?? []
			logger?.info(`Worker handlers detected: ${[...detectedWorkerHandlers, ...detectedRouteHandlers].join(', ')}`)
		} else if (!enableVite) {
			logger?.warn('No local worker handler entry was found for worker-only mode')
		}

		// Check for remote bindings and warn if requirements not met
		const remoteCheck = await checkRemoteBindingRequirements(config)
		if (remoteCheck.hasRemoteBindings) {
			logger?.info('')
			logger?.warn('⚠️  Remote-only bindings detected:')
			for (const binding of remoteCheck.remoteBindings) {
				logger?.warn(`   • ${binding}`)
			}
			logger?.info('')

			if (remoteCheck.missingAccountId) {
				logger?.warn('⚠️  WARN: accountId is not set in devflare.config.ts')
				logger?.warn('   Remote bindings (AI, Vectorize) require accountId to charge the correct account.')
				logger?.warn('   Add: accountId: \'your-cloudflare-account-id\'')
				logger?.info('')
			}

			if (remoteCheck.notLoggedIn) {
				logger?.warn('⚠️  WARN: Not logged in to Wrangler')
				logger?.warn('   Remote bindings require authentication.')
				logger?.warn('   Run: bunx wrangler login')
				logger?.info('')
			}

			if (!remoteCheck.missingAccountId && !remoteCheck.notLoggedIn) {
				logger?.success('✓ Remote binding requirements met')
				logger?.info('')
			}
		}

		// Start browser shim if browser rendering is configured
		const browserBinding = getSingleBrowserBindingName(config.bindings?.browser)
		if (browserBinding) {
			logger?.info(`Starting Browser Rendering shim (binding: ${browserBinding})...`)
			browserShim = createBrowserShim({
				port: browserShimPort,
				host: '127.0.0.1',
				logger,
				verbose
			})
			await browserShim.start()
		}

		// Bundle DOs if pattern is set
		const doPattern = config.files?.durableObjects
		let doResult: DOBundleResult | null = null

		if (typeof doPattern === 'string' && doPattern) {
			const outDir = resolve(cwd, '.devflare/do-bundles')

			doBundler = createDOBundler({
				cwd,
				pattern: doPattern,
				outDir,
				rolldownOptions: config.rolldown?.options,
				sourcemap: config.rolldown?.sourcemap,
				minify: config.rolldown?.minify,
				logger,
				onRebuild: async (result) => {
					// Hot reload Miniflare when DOs change
					await reloadMiniflare(result)
				}
			})

			// Initial build
			doResult = await doBundler.build()
			currentDoResult = doResult

			// Start watching
			await doBundler.watch()
		}

		currentDoResult = doResult

		// Start Miniflare
		await startMiniflare(doResult)
		await startWorkerSourceWatcher()

		if (enableVite) {
			viteProcess = await startViteProcess({
				cwd,
				vitePort,
				miniflarePort,
				generatedViteConfigPath,
				logger
			})
		} else {
			logger?.info('Vite startup skipped (no effective Vite config found for this package)')
		}

		// Run D1 migrations after the dev runtime is started (give Miniflare more time to stabilize)
		await new Promise((r) => setTimeout(r, 1000))
		await runD1Migrations({ cwd, config, miniflarePort, logger })
	}

	/**
	 * Stop the dev server
	 */
	async function stop(): Promise<void> {
		if (doBundler) {
			await doBundler.close()
			doBundler = null
		}

		if (workerSourceWatcher) {
			await workerSourceWatcher.close()
			workerSourceWatcher = null
		}

		if (miniflare) {
			await miniflare.dispose()
			miniflare = null
		}

		if (viteProcess) {
			await stopSpawnedProcessTree(viteProcess)
			viteProcess = null
		}

		if (browserShim) {
			await browserShim.stop()
			browserShim = null
		}

		clearLocalSendEmailBindings()
	}

	/**
	 * Get Miniflare instance
	 */
	function getMiniflare(): MiniflareType | null {
		return miniflare
	}

	return {
		start,
		stop,
		getMiniflare
	}
}
