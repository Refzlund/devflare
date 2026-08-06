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
import { startOutboundEmailService } from '../../email/host-service'
import { createHostEmailDeliverySink } from '../../email/host-sink'
import { startInboundEmailPoller } from '../../email/inbound-poller'
import { type ResolvedEmailRuntime, resolveEmailRuntime } from '../../email/runtime-config'
import { clearEmailDeliverySink, setEmailDeliverySink } from '../../utils/email-delivery'
import { generatedDir } from '../../utils/generated-dir'
import { setLocalSendEmailBindings } from '../../utils/send-email'
import { runD1Migrations } from '../d1-migrations'
import { resolveR2PresignOrigin } from '../miniflare-dev-config'
import { createMiniflareLog } from '../miniflare-log'
import { createRuntimeStdioForwarder } from '../runtime-stdio'
import { startViteProcess } from '../vite-process'
import { buildMergedWorkspaceConfig } from './merge-config'
import { type PreparedWorkspaceApp, prepareWorkspaceApp } from './prepare-app'

/** Default first browser-shim port; each app that binds browser rendering gets `+index`. */
export const DEFAULT_BROWSER_SHIM_BASE_PORT = 9700

/** Delay before running migrations, matching the single-app path's stabilization wait. */
const MIGRATION_STABILIZE_DELAY_MS = 1000

/**
 * Place one app's Browser Rendering shim inside the workspace's shim block.
 *
 * The block is contiguous from the base port so a user who moves it only has to
 * keep `apps.length` ports free, and an app's shim stays at the same offset for
 * the life of the manifest.
 *
 * @param basePort - First port of the block (the resolved `browserShimBasePort`).
 * @param appIndex - The app's position in the manifest.
 * @returns The port that app's shim listens on.
 */
export function resolveAppBrowserShimPort(basePort: number, appIndex: number): number {
	return basePort + appIndex
}

/** Options for {@link createWorkspaceDevServer}. */
export interface WorkspaceDevServerOptions {
	/** The validated workspace manifest. */
	manifest: WorkspaceManifest
	/** Directory containing the manifest — app config paths resolve against it. */
	manifestDir: string
	/** Persist storage to the shared workspace dir (default: true). */
	persist?: boolean
	/**
	 * First browser-shim port (default: 9700); each app that binds browser
	 * rendering listens on `base + its index`. Move the block when another local
	 * instance already owns it.
	 */
	browserShimBasePort?: number
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
	const browserShimBasePort = options.browserShimBasePort ?? DEFAULT_BROWSER_SHIM_BASE_PORT
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
	// Resolved from the environment first, because every app's composed worker is
	// built before any app config has been read. A per-app `email` block then
	// refines the relay/inbound settings; selecting `live` for a workspace has to
	// come from DEVFLARE_EMAIL_MODE, since that decision changes what is bundled.
	let emailRuntime: ResolvedEmailRuntime = resolveEmailRuntime(undefined, process.env)
	let outboundEmailService: Awaited<ReturnType<typeof startOutboundEmailService>> | null = null
	let inboundEmailPoller: ReturnType<typeof startInboundEmailPoller> | null = null
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
					browserShimPort: resolveAppBrowserShimPort(browserShimBasePort, index),
					r2PresignSecret,
					host,
					...(outboundEmailService ? { outboundEmailEndpoint: outboundEmailService.url } : {}),
					...(emailRuntime.mode === 'live' ? { skipLocalSendEmailBindings: true } : {}),
					logger
				})
			)
		}
		return prepared
	}

	/** Merge sendEmail bindings from all apps and register them once (global registry). */
	function registerSharedSendEmailBindings(apps: PreparedWorkspaceApp[]): void {
		if (emailRuntime.mode === 'live') {
			setLocalSendEmailBindings({})
			return
		}

		const merged: Record<string, any> = {}
		for (const app of apps) {
			Object.assign(merged, app.sendEmailBindings)
		}
		setLocalSendEmailBindings(merged)
	}

	/**
	 * Refine the email runtime from the first app that declares an `email` block.
	 *
	 * Runs AFTER the apps are prepared, because an app's config is only read
	 * inside `prepareWorkspaceApp`. That is fine for `capture` and `relay`, which
	 * the host decides per message, but `live` changes what is BUNDLED — so a
	 * per-app `live` cannot take effect and says so rather than pretending.
	 *
	 * @param apps - The prepared apps, in manifest order.
	 */
	function refineEmailRuntime(apps: PreparedWorkspaceApp[]): void {
		const declaring = apps.find((app) => app.config.email !== undefined)
		if (!declaring) {
			return
		}

		const bundledMode = emailRuntime.mode
		emailRuntime = resolveEmailRuntime(declaring.config.email, process.env)

		if (emailRuntime.mode === 'live' && bundledMode !== 'live') {
			logger?.warn(
				`App "${declaring.appName}" asks for email mode 'live', but each app's worker was already ` +
					'built before its config was read. Set DEVFLARE_EMAIL_MODE=live to apply it in a ' +
					`workspace; continuing in '${bundledMode}'.`
			)
			emailRuntime = { ...emailRuntime, mode: bundledMode }
			return
		}

		logger?.info(
			`Email mode: ${emailRuntime.mode} (from app "${declaring.appName}")` +
				(emailRuntime.relay ? ` → pinned to ${emailRuntime.relay.to}` : '')
		)
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

		setEmailDeliverySink(createHostEmailDeliverySink(() => emailRuntime))
		outboundEmailService = await startOutboundEmailService(() => emailRuntime)

		preparedApps = await prepareAllApps()
		refineEmailRuntime(preparedApps)

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

		if (emailRuntime.inbound) {
			logger?.info(
				`Email inbound: polling ${emailRuntime.inbound.mailbox} every ${emailRuntime.inbound.intervalMs}ms → src/email.ts`
			)
			inboundEmailPoller = startInboundEmailPoller({
				inbound: emailRuntime.inbound,
				runtimeOrigin: `http://${host}:${manifest.entryPort}`,
				...(logger ? { logger } : {})
			})
		}

		logger?.success(`Workspace ready — ${preparedApps.length} app(s) sharing one instance`)
	}

	async function stop(): Promise<void> {
		if (inboundEmailPoller) {
			await inboundEmailPoller.stop()
			inboundEmailPoller = null
		}

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

		if (outboundEmailService) {
			await outboundEmailService.close()
			outboundEmailService = null
		}

		clearEmailDeliverySink()
	}

	return {
		start,
		stop,
		getMiniflare: () => miniflare,
		getAppOrigins: () => appOrigins
	}
}
