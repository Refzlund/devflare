// =============================================================================
// Workspace Dev Server — one Miniflare, many apps, shared live bindings
// =============================================================================
// The coordinator for `devflare workspace dev`. It prepares every app's worker
// set (reusing the single-app pipeline), merges them into ONE Miniflare
// instance, exposes each app on its own direct socket (preserving cross-origin),
// runs each app's D1 migrations once against the shared store, and spawns Vite
// children pointed at the shared instance's bridge.
//
// Sharing is automatic: workers that bind the same D1/KV/R2/DO id inside one
// instance resolve to one live store (see docs/shared-bindings-dev.md §3.1).
//
// Sibling to `createDevServer`; the single-app path is untouched.
// =============================================================================

import type { ChildProcess } from 'node:child_process'
import type { ConsolaInstance } from 'consola'
import type { Miniflare as MiniflareType } from 'miniflare'
import { dirname, resolve } from 'pathe'
import {
	type WorkspaceManifest,
	assertSharedBindingIds,
	resolveAppDirectSocketPort
} from '../../config/workspace'
import { generatedDir } from '../../utils/generated-dir'
import { setLocalSendEmailBindings } from '../../utils/send-email'
import { runD1Migrations } from '../d1-migrations'
import { resolveR2PresignOrigin } from '../miniflare-dev-config'
import { createMiniflareLog } from '../miniflare-log'
import { createRuntimeStdioForwarder } from '../runtime-stdio'
import { startViteProcess } from '../vite-process'
import { buildMergedWorkspaceConfig } from './merge-config'
import { type PreparedWorkspaceApp, prepareWorkspaceApp } from './prepare-app'

/** The first browser-shim port; each app that binds browser rendering gets `+index`. */
const BROWSER_SHIM_BASE_PORT = 9700

/** Delay before running migrations, matching the single-app path's stabilization wait. */
const MIGRATION_STABILIZE_DELAY_MS = 1000

/** Options for {@link createWorkspaceDevServer}. */
export interface WorkspaceDevServerOptions {
	/** The validated workspace manifest. */
	manifest: WorkspaceManifest
	/** Directory containing the manifest — app config paths resolve against it. */
	manifestDir: string
	/** Persist storage to the shared workspace dir (default: true). */
	persist?: boolean
	/** Logger. */
	logger?: ConsolaInstance
	/** Verbose logging. */
	verbose?: boolean
	/** Debug logging in gateway workers. */
	debug?: boolean
}

/** A running app's browser origin, for reporting. */
export interface WorkspaceAppOrigin {
	/** The app namespace. */
	appName: string
	/** The browser origin the app is reached on. */
	url: string
	/** Whether the app is served by a Vite child. */
	vite: boolean
}

/** The workspace dev server handle. */
export interface WorkspaceDevServer {
	/** Prepare, merge, start Miniflare, run migrations, and spawn Vite children. */
	start(): Promise<void>
	/** Tear everything down (Miniflare, Vite children, shims, bundlers). */
	stop(): Promise<void>
	/** The shared Miniflare instance (or null before start / after stop). */
	getMiniflare(): MiniflareType | null
	/** Each app's resolved browser origin. */
	getAppOrigins(): WorkspaceAppOrigin[]
}

/**
 * Create a workspace dev server that co-hosts every manifest app in one
 * Miniflare instance with live-shared bindings.
 *
 * @param options - The manifest, its directory, and logging/persist settings.
 * @returns A {@link WorkspaceDevServer} handle.
 */
export function createWorkspaceDevServer(options: WorkspaceDevServerOptions): WorkspaceDevServer {
	const { manifest, manifestDir, logger } = options
	const persist = options.persist ?? true
	const verbose = options.verbose ?? false
	const debug = options.debug ?? process.env.DEVFLARE_DEBUG === 'true'

	const host = manifest.host ?? '127.0.0.1'
	const persistDir = manifest.persist
		? resolve(manifestDir, manifest.persist)
		: generatedDir(manifestDir, 'workspace-data')
	// One per-boot HMAC secret for the whole instance; each app mints presigned
	// R2 URLs against its OWN origin (injected per-app via its direct-socket port).
	const r2PresignSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`

	let miniflare: MiniflareType | null = null
	let preparedApps: PreparedWorkspaceApp[] = []
	const viteChildren: ChildProcess[] = []
	const appOrigins: WorkspaceAppOrigin[] = []

	/**
	 * Prepare each manifest app (sequentially — config load + bundling mutate
	 * app-local `.devflare/` dirs and we want deterministic, non-interleaved
	 * work).
	 */
	async function prepareAllApps(): Promise<PreparedWorkspaceApp[]> {
		const prepared: PreparedWorkspaceApp[] = []
		for (let index = 0; index < manifest.apps.length; index++) {
			const app = manifest.apps[index]
			const label = app.name ?? app.config
			const directSocketPort = resolveAppDirectSocketPort(app, label)
			const configPath = resolve(manifestDir, app.config)

			logger?.info(`Preparing workspace app "${label}" (port ${directSocketPort})…`)
			prepared.push(
				await prepareWorkspaceApp({
					appName: app.name,
					configPath,
					appCwd: dirname(configPath),
					directSocketPort,
					vite: app.vite ?? false,
					vitePort: app.vitePort ?? 5173,
					env: app.env,
					persist,
					debug,
					verbose,
					browserShimPort: BROWSER_SHIM_BASE_PORT + index,
					r2PresignSecret,
					host,
					logger
				})
			)
		}
		return prepared
	}

	/** Merge sendEmail bindings from all apps and register them once (global registry). */
	function registerSharedSendEmailBindings(apps: PreparedWorkspaceApp[]): void {
		const merged: Record<string, any> = {}
		for (const app of apps) {
			Object.assign(merged, app.sendEmailBindings)
		}
		setLocalSendEmailBindings(merged)
	}

	async function startMiniflare(apps: PreparedWorkspaceApp[]): Promise<void> {
		const { Miniflare, Log, LogLevel } = await import('miniflare')

		const { config, directSockets } = buildMergedWorkspaceConfig({
			apps: apps.map((app) => ({
				appName: app.appName,
				workers: app.workers,
				directSocketPort: app.directSocketPort
			})),
			host,
			persist,
			persistDir,
			entryPort: manifest.entryPort
		})

		const log = createMiniflareLog(Log, LogLevel, 'DEBUG', logger)
		if (log) {
			config.log = log
		}
		config.handleRuntimeStdio = createRuntimeStdioForwarder(logger)

		miniflare = new Miniflare(config as ConstructorParameters<typeof Miniflare>[0])
		await miniflare.ready

		// Resolve + record each app's browser origin from its direct socket.
		for (const socket of directSockets) {
			const url = await miniflare.unsafeGetDirectURL(socket.gatewayWorkerName)
			const app = apps.find((candidate) => candidate.appName === socket.appName)
			const isVite = app?.enableVite ?? false
			const origin = isVite ? `http://${host}:${app?.vitePort ?? socket.port}` : url.href
			appOrigins.push({ appName: socket.appName, url: origin, vite: isVite })
			logger?.success(
				isVite
					? `App "${socket.appName}" → Vite ${origin} (bridge ${url.href})`
					: `App "${socket.appName}" → ${url.href}`
			)
		}
	}

	/** Run each app's D1 migrations once against the shared store (ledger dedupes). */
	async function runMigrations(apps: PreparedWorkspaceApp[]): Promise<void> {
		await new Promise((r) => setTimeout(r, MIGRATION_STABILIZE_DELAY_MS))
		for (const app of apps) {
			if (!app.config.bindings?.d1) {
				continue
			}
			await runD1Migrations({
				cwd: app.appCwd,
				config: app.config,
				miniflarePort: app.directSocketPort,
				logger
			})
		}
	}

	/** Spawn a Vite child per Vite app, pointed at its gateway's direct socket (bridge). */
	async function startViteChildren(apps: PreparedWorkspaceApp[]): Promise<void> {
		for (const app of apps) {
			if (!app.enableVite) {
				continue
			}
			const child = await startViteProcess({
				cwd: app.appCwd,
				configPath: app.configPath,
				vitePort: app.vitePort,
				miniflarePort: app.directSocketPort,
				generatedViteConfigPath: app.generatedViteConfigPath,
				r2Presign: app.config.bindings?.r2
					? {
							secret: r2PresignSecret,
							origin: resolveR2PresignOrigin(app.config.server, host, app.directSocketPort)
						}
					: null,
				logger
			})
			viteChildren.push(child)
		}
	}

	async function start(): Promise<void> {
		logger?.info('Starting workspace dev server…')

		preparedApps = await prepareAllApps()

		if (manifest.shared) {
			assertSharedBindingIds(
				manifest.shared,
				preparedApps.map((app) => ({
					appLabel: app.appName,
					d1: app.sharedIds.d1,
					r2: app.sharedIds.r2,
					kv: app.sharedIds.kv
				}))
			)
		}

		registerSharedSendEmailBindings(preparedApps)
		await startMiniflare(preparedApps)
		await startViteChildren(preparedApps)
		await runMigrations(preparedApps)

		logger?.success(`Workspace ready — ${preparedApps.length} app(s) sharing one instance`)
	}

	async function stop(): Promise<void> {
		for (const child of viteChildren) {
			child.kill()
		}
		viteChildren.length = 0

		for (const app of preparedApps) {
			try {
				await app.doBundler?.close()
			} catch (error) {
				logger?.debug(`DO bundler close failed for ${app.appName}: ${String(error)}`)
			}
			try {
				await app.browserShim?.stop()
			} catch (error) {
				logger?.debug(`Browser shim stop failed for ${app.appName}: ${String(error)}`)
			}
		}

		if (miniflare) {
			await miniflare.dispose()
			miniflare = null
		}
	}

	return {
		start,
		stop,
		getMiniflare: () => miniflare,
		getAppOrigins: () => appOrigins
	}
}
