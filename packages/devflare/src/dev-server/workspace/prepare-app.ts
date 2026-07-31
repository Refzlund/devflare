// =============================================================================
// Workspace — prepare ONE app's Miniflare worker set
// =============================================================================
// Runs the same per-app pipeline `createDevServer().start()` uses (config load
// → env/dev-vars → route+surface discovery → worker/workflow/DO bundling →
// `buildMiniflareDevConfig`) but STOPS at the built worker array instead of
// starting Miniflare. The coordinator merges these across apps into one
// instance. Reusing `buildMiniflareDevConfig` verbatim is what guarantees each
// co-hosted app is assembled exactly as it is under `devflare dev`.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import { resolve } from 'pathe'
import { type BrowserShim, createBrowserShim } from '../../browser-shim'
import {
	type DOBundleResult,
	type DOBundler,
	bundleWorkerEntry,
	createDOBundler
} from '../../bundler'
import type { DevflareConfig } from '../../config'
import { resolveConfigEnvVars } from '../../config/env-vars'
import { loadConfig } from '../../config/loader'
import { applyLocalDevVarsToConfig } from '../../config/local-dev-vars'
import {
	getLocalD1DatabaseIdentifier,
	getLocalKVNamespaceIdentifier,
	getSingleBrowserBindingName,
	normalizeR2Binding
} from '../../config/schema'
import { resolveServiceBindings } from '../../test/resolve-service-bindings'
import { generatedDir } from '../../utils/generated-dir'
import { prepareComposedWorkerEntrypoint } from '../../worker-entry/composed-worker'
import { discoverRoutes } from '../../worker-entry/routes'
import { bundleWorkflowEntrypointScript } from '../../workflows/local-workflow-entrypoints'
import { buildMiniflareDevConfig } from '../miniflare-dev-config'
import { resolveViteIntegration } from '../server-startup-helpers'
import { resolveMainWorkerSurfacePaths } from '../worker-surface-paths'

/** Input for {@link prepareWorkspaceApp}. */
export interface PrepareWorkspaceAppInput {
	/**
	 * Per-app namespace override (prefixes worker names in the merged instance).
	 * Defaults to the app config's `name` when omitted.
	 */
	appName?: string
	/** Absolute path to the app's `devflare.config.*`. */
	configPath: string
	/** The app's project root (`dirname(configPath)`). */
	appCwd: string
	/** Browser-reachable direct-socket port for this app's gateway. */
	directSocketPort: number
	/** Whether this app is a Vite app (spawned as a child, worker not co-run). */
	vite: boolean
	/** Vite dev-server port (Vite apps only). */
	vitePort: number
	/** Extra worker vars from the manifest (`env`, e.g. seed flags). */
	env?: Record<string, string>
	/** Persist toggle (the coordinator owns the actual shared persist dir). */
	persist: boolean
	/** Debug logging in the gateway worker. */
	debug: boolean
	/** Verbose logging (browser shim etc.). */
	verbose: boolean
	/** Port for this app's browser-rendering shim (only used if it binds one). */
	browserShimPort: number
	/** Shared per-boot R2 presign secret (one for the whole instance). */
	r2PresignSecret: string
	/** Host the instance binds. */
	host: string
	/** Logger. */
	logger?: ConsolaInstance
}

/** A prepared app: its built workers plus the side resources the coordinator owns. */
export interface PreparedWorkspaceApp {
	/** The app namespace. */
	appName: string
	/** The app's project root. */
	appCwd: string
	/** Absolute config path (passed to the Vite child as `DEVFLARE_CONFIG_PATH`). */
	configPath: string
	/** The resolved app config. */
	config: DevflareConfig
	/** The app's Miniflare worker array (pre-namespacing). */
	workers: Record<string, any>[]
	/** The port this app's gateway direct socket binds. */
	directSocketPort: number
	/** Vite dev-server port (Vite apps only). */
	vitePort: number
	/** Whether Vite is actually enabled (manifest asked AND a vite config exists). */
	enableVite: boolean
	/** Generated Vite config path to launch the child against (Vite apps only). */
	generatedViteConfigPath: string | null
	/** The DO bundler (kept for teardown; not watched in the coordinator). */
	doBundler: DOBundler | null
	/** The browser-rendering shim, if the app binds one. */
	browserShim: BrowserShim | null
	/** This app's `sendEmail` bindings, merged once at the coordinator. */
	sendEmailBindings: Record<string, any>
	/** Resolved local ids per binding kind, for the `shared` assertion. */
	sharedIds: { d1: Record<string, string>; r2: Record<string, string>; kv: Record<string, string> }
}

/**
 * Load an app's config and build its Miniflare worker set, mirroring the
 * single-app dev startup up to (but not including) `new Miniflare(...)`.
 *
 * Side effects: bundles the worker/workflow/DO entrypoints under the app's
 * `.devflare/`, and starts a browser-rendering shim when the app binds one. The
 * returned `doBundler`/`browserShim` are disposed by the coordinator.
 *
 * @param input - App identity, ports, and shared instance settings.
 * @returns The prepared app (see {@link PreparedWorkspaceApp}).
 */
export async function prepareWorkspaceApp(
	input: PrepareWorkspaceAppInput
): Promise<PreparedWorkspaceApp> {
	const { appCwd, configPath, directSocketPort, host, logger } = input

	// --- config load (mirrors createDevServer.loadRuntimeConfig) --------------
	const loaded = await loadConfig({ cwd: appCwd, configFile: configPath })
	const envResolved = await resolveConfigEnvVars(loaded, { cwd: appCwd, configPath, mode: 'dev' })
	const config = await applyLocalDevVarsToConfig(envResolved, { cwd: appCwd, configPath })
	const appName = input.appName ?? config.name
	const serviceBindingResolution = config.bindings?.services
		? await resolveServiceBindings(config, appCwd)
		: null

	// --- Vite integration (may downgrade to worker-only if no vite config) ----
	let enableVite = false
	let generatedViteConfigPath: string | null = null
	if (input.vite) {
		const viteIntegration = await resolveViteIntegration({
			cwd: appCwd,
			configPath,
			miniflarePort: directSocketPort,
			enableViteRequested: true,
			logger
		})
		enableVite = viteIntegration.enableVite
		generatedViteConfigPath = viteIntegration.generatedViteConfigPath
		if (!enableVite) {
			logger?.warn(
				`Workspace app "${appName}" set vite: true but no Vite config was found; running it worker-only.`
			)
		}
	}

	// --- worker surface + workflow/main bundling ------------------------------
	const workflowEntrypointScript = await bundleWorkflowEntrypointScript(config, appCwd, { logger })
	const mainWorkerSurfacePaths = await resolveMainWorkerSurfacePaths(appCwd, config)
	const mainWorkerRoutes = await discoverRoutes(appCwd, config)
	const composedMainEntry = await prepareComposedWorkerEntrypoint(appCwd, config, undefined, {
		devInternalEmail: true
	})
	const mainWorkerScriptPath = composedMainEntry ?? null

	// The main worker only runs (and is only bundled) in worker mode; a Vite app
	// serves its HTTP surface from the child process, not a co-hosted worker.
	let bundledMainWorkerScriptPath: string | null = null
	if (mainWorkerScriptPath && !enableVite) {
		bundledMainWorkerScriptPath = await bundleWorkerEntry({
			cwd: appCwd,
			inputFile: mainWorkerScriptPath,
			outFile: generatedDir(appCwd, 'worker-entrypoints', 'main.js'),
			rolldownOptions: config.rolldown?.options,
			sourcemap: config.rolldown?.sourcemap,
			minify: config.rolldown?.minify,
			logger
		})
	}

	// --- Durable Objects (one-shot bundle; hot reload is a coordinator v2) -----
	let doResult: DOBundleResult | null = null
	let doBundler: DOBundler | null = null
	const doPattern = config.files?.durableObjects
	if (typeof doPattern === 'string' && doPattern) {
		doBundler = createDOBundler({
			cwd: appCwd,
			pattern: doPattern,
			outDir: generatedDir(appCwd, 'do-bundles'),
			rolldownOptions: config.rolldown?.options,
			sourcemap: config.rolldown?.sourcemap,
			minify: config.rolldown?.minify,
			logger,
			onRebuild: async () => {
				// No watcher is started for the workspace instance, so this never
				// fires. Restart `devflare workspace dev` to pick up DO changes.
			}
		})
		doResult = await doBundler.build()
	}

	// --- browser-rendering shim (only when the app binds one) -----------------
	let browserShim: BrowserShim | null = null
	const browserBinding = getSingleBrowserBindingName(config.bindings?.browser)
	if (browserBinding) {
		browserShim = createBrowserShim({
			port: input.browserShimPort,
			host: '127.0.0.1',
			logger,
			verbose: input.verbose
		})
		await browserShim.start()
	}

	// --- build this app's worker set (reused verbatim) ------------------------
	const built = buildMiniflareDevConfig({
		config,
		cwd: appCwd,
		miniflarePort: directSocketPort,
		miniflareHost: host,
		persist: input.persist,
		enableVite,
		debug: input.debug,
		mainWorkerSurfacePaths,
		mainWorkerRoutes,
		mainWorkerScriptPath,
		bundledMainWorkerScriptPath,
		workflowEntrypointScript,
		browserShimPort: input.browserShimPort,
		doResult,
		serviceBindingResolution,
		r2PresignSecret: input.r2PresignSecret,
		additionalInjectedVars: input.env,
		logger
	})
	const workers = built.workers as Record<string, any>[]

	// --- resolved ids for the `shared` assertion ------------------------------
	const sharedIds = { d1: {}, r2: {}, kv: {} } as PreparedWorkspaceApp['sharedIds']
	for (const [name, cfg] of Object.entries(config.bindings?.d1 ?? {})) {
		sharedIds.d1[name] = getLocalD1DatabaseIdentifier(cfg)
	}
	for (const [name, cfg] of Object.entries(config.bindings?.r2 ?? {})) {
		sharedIds.r2[name] = normalizeR2Binding(cfg).bucketName
	}
	for (const [name, cfg] of Object.entries(config.bindings?.kv ?? {})) {
		sharedIds.kv[name] = getLocalKVNamespaceIdentifier(cfg)
	}

	return {
		appName,
		appCwd,
		configPath,
		config,
		workers,
		directSocketPort,
		vitePort: input.vitePort,
		enableVite,
		generatedViteConfigPath,
		doBundler,
		browserShim,
		sendEmailBindings: config.bindings?.sendEmail ?? {},
		sharedIds
	}
}
