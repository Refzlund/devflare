// =============================================================================
// Dev Server — startup-time helpers
// =============================================================================
// Pure helpers extracted from createDevServer().start(). All inputs are
// explicit so these can be unit-tested without spinning up Miniflare.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { Miniflare as MiniflareType } from 'miniflare'
import { resolve } from 'pathe'
import { type BrowserShim, createBrowserShim } from '../browser-shim'
import { type DOBundleResult, type DOBundler, createDOBundler } from '../bundler'
import type { checkRemoteBindingRequirements } from '../cli/wrangler-auth'
import { resolveConfigPath } from '../config/loader'
import type { DevflareConfig } from '../config/schema'
import { getSingleBrowserBindingName } from '../config/schema'
import { writeGeneratedViteConfig } from '../vite'
import type { RouteDiscoveryResult } from '../worker-entry/routes'
import { resolveViteMode } from './vite-utils'
import type { WorkerSurfacePaths } from './worker-surface-paths'

type RemoteBindingCheck = Awaited<ReturnType<typeof checkRemoteBindingRequirements>>

/**
 * Emit informational/warning lines about detected worker handlers in
 * worker-only (no-Vite) mode.
 */
export function logWorkerHandlerDetection(
	logger: ConsolaInstance | undefined,
	enableVite: boolean,
	hasSurface: boolean,
	mainWorkerSurfacePaths: WorkerSurfacePaths,
	mainWorkerRoutes: RouteDiscoveryResult | null
): void {
	if (enableVite) return

	if (hasSurface) {
		const detectedWorkerHandlers = Object.entries(mainWorkerSurfacePaths)
			.filter(([, surfacePath]) => !!surfacePath)
			.map(([surfaceName, surfacePath]) => `${surfaceName}=${surfacePath}`)
		const detectedRouteHandlers =
			mainWorkerRoutes?.routes.map((route) => `route=${route.filePath}`) ?? []
		logger?.info(
			`Worker handlers detected: ${[...detectedWorkerHandlers, ...detectedRouteHandlers].join(', ')}`
		)
	} else {
		logger?.warn('No local worker handler entry was found for worker-only mode')
	}
}

/**
 * Emit warnings about remote-only bindings (AI, Vectorize) and any missing
 * prerequisites (accountId, wrangler login).
 */
export function logRemoteBindingRequirements(
	logger: ConsolaInstance | undefined,
	remoteCheck: RemoteBindingCheck
): void {
	if (!remoteCheck.hasRemoteBindings) return

	logger?.info('')
	logger?.warn('⚠️  Remote-only bindings detected:')
	for (const binding of remoteCheck.remoteBindings) {
		logger?.warn(`   • ${binding}`)
	}
	logger?.info('')

	if (remoteCheck.missingAccountId) {
		logger?.warn('⚠️  WARN: accountId is not set in devflare.config.ts')
		logger?.warn(
			'   Remote bindings (AI, Vectorize) require accountId to charge the correct account.'
		)
		logger?.warn("   Add: accountId: 'your-cloudflare-account-id'")
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

export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/**
 * Resolve the path to watch for config changes. Prefers an explicit
 * `configPath` if it's directly accessible on disk, otherwise falls back to
 * the auto-discovered config path under `cwd`. Returns `null` when neither
 * is available.
 */
export async function resolveWorkerConfigWatchPath(
	cwd: string,
	configPath: string | undefined
): Promise<string | null> {
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

	return (await resolveConfigPath(cwd)) ?? null
}

/**
 * Pretty-print the resolved Miniflare config (truncating long inline scripts)
 * before `Miniflare` is constructed. Only emits when verbose/debug logging is
 * requested by the caller.
 */
export function logMiniflareConfigDiagnostics(
	logger: ConsolaInstance | undefined,
	mfConfig: any
): void {
	logger?.info('=== MINIFLARE CONFIG DEBUG ===')
	logger?.info(
		'Full config:',
		JSON.stringify(
			mfConfig,
			(key, value) => {
				if (key === 'script' && typeof value === 'string' && value.length > 200) {
					return value.substring(0, 200) + '...[truncated]'
				}
				return value
			},
			2
		)
	)

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

/**
 * After `Miniflare` is `ready`, query each declared worker's bindings and
 * log them. Best-effort: any per-worker failure is logged at debug and does
 * not abort the rest of the diagnostics.
 */
export async function logMiniflareBindingDiagnostics(
	logger: ConsolaInstance | undefined,
	miniflare: MiniflareType,
	mfConfig: any
): Promise<void> {
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
						logger?.debug(
							`Skipping binding diagnostics for ${w.name}: ${formatErrorMessage(error)}`
						)
					}
				}
			}
		}
	} catch (error) {
		logger?.debug(`Skipping Miniflare binding diagnostics: ${formatErrorMessage(error)}`)
	}
}

/**
 * If the config declares a single browser-rendering binding, construct and
 * start a `BrowserShim` listening on `browserShimPort`. Returns `null` when
 * no browser binding is configured (no shim needed).
 */
export async function maybeStartBrowserShim(
	config: DevflareConfig,
	options: { browserShimPort: number; logger?: ConsolaInstance; verbose: boolean }
): Promise<BrowserShim | null> {
	const browserBinding = getSingleBrowserBindingName(config.bindings?.browser)
	if (!browserBinding) return null

	options.logger?.info(`Starting Browser Rendering shim (binding: ${browserBinding})...`)
	const shim = createBrowserShim({
		port: options.browserShimPort,
		host: '127.0.0.1',
		logger: options.logger,
		verbose: options.verbose
	})
	await shim.start()
	return shim
}

/**
 * If the config declares a `files.durableObjects` glob, construct a
 * `DOBundler`, run an initial build, and start watching. Returns
 * `{ bundler, result }` (`{ null, null }` when no DO pattern is configured).
 * The `onRebuild` callback fires on each subsequent rebuild — typically used
 * to schedule a Miniflare reload.
 */
export async function maybeStartDOBundler(
	config: DevflareConfig,
	options: {
		cwd: string
		logger?: ConsolaInstance
		onRebuild: (result: DOBundleResult) => Promise<void>
	}
): Promise<{ bundler: DOBundler | null; result: DOBundleResult | null }> {
	const doPattern = config.files?.durableObjects
	if (typeof doPattern !== 'string' || !doPattern) {
		return { bundler: null, result: null }
	}

	const outDir = resolve(options.cwd, '.devflare/do-bundles')
	const bundler = createDOBundler({
		cwd: options.cwd,
		pattern: doPattern,
		outDir,
		rolldownOptions: config.rolldown?.options,
		sourcemap: config.rolldown?.sourcemap,
		minify: config.rolldown?.minify,
		logger: options.logger,
		onRebuild: options.onRebuild
	})

	const result = await bundler.build()
	await bundler.watch()
	return { bundler, result }
}

/**
 * Resolve whether Vite should run for this package, and if so, write the
 * generated Vite config under `.devflare/`. Returns:
 *   - `{ enableVite: false, generatedViteConfigPath: null }` when Vite is
 *     not requested or no Vite config exists for this package
 *   - `{ enableVite: true, generatedViteConfigPath }` after writing the
 *     generated config
 */
export async function resolveViteIntegration(options: {
	cwd: string
	configPath: string | undefined
	miniflarePort: number
	enableViteRequested: boolean
	logger?: ConsolaInstance
}): Promise<{ enableVite: boolean; generatedViteConfigPath: string | null }> {
	if (!options.enableViteRequested) {
		return { enableVite: false, generatedViteConfigPath: null }
	}

	const viteMode = await resolveViteMode(options.cwd, { requested: true })
	if (!viteMode.enableVite) {
		options.logger?.info('Vite disabled: no vite config found for this package')
		return { enableVite: false, generatedViteConfigPath: null }
	}

	const generatedViteConfigPath = await writeGeneratedViteConfig({
		cwd: options.cwd,
		configPath: options.configPath,
		localConfigPath: viteMode.viteConfigPath,
		bridgePort: options.miniflarePort
	})
	options.logger?.debug(`Generated Vite config → ${generatedViteConfigPath}`)
	return { enableVite: true, generatedViteConfigPath }
}
