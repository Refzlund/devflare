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
	assertSharedBindingIds,
	resolveAppDirectSocketPort,
	type WorkspaceManifest
} from '../../config/workspace'
import { startOutboundEmailService } from '../../email/host-service'
import { createHostEmailDeliverySink } from '../../email/host-sink'
import { startInboundEmailPoller } from '../../email/inbound-poller'
import { type ResolvedEmailRuntime, resolveEmailRuntime } from '../../email/runtime-config'
import { clearEmailDeliverySink, setEmailDeliverySink } from '../../utils/email-delivery'
import { generatedDir } from '../../utils/generated-dir'
import { toMiniflareOptions } from '../../utils/miniflare-options'
import { setLocalSendEmailBindings } from '../../utils/send-email'
import { runD1Migrations } from '../d1-migrations'
import { resolveR2PresignOrigin } from '../miniflare-dev-config'
import { createMiniflareLog } from '../miniflare-log'
import { createRuntimeLogForwarder } from '../runtime-logs'
import { startViteProcess } from '../vite-process'
import { stopSpawnedProcessTree } from '../vite-utils'
import { acquireCoordinatorLock, type HeldCoordinatorLock } from './coordinator-lock'
import { coordinatorLockEnabled } from './coordinator-lock-protocol'
import { buildMergedWorkspaceConfig } from './merge-config'
import { type PreparedWorkspaceApp, prepareWorkspaceApp } from './prepare-app'

/** Default first browser-shim port; each app that binds browser rendering gets `+index`. */
export const DEFAULT_BROWSER_SHIM_BASE_PORT = 9700

/** Delay before running migrations, matching the single-app path's stabilization wait. */
const MIGRATION_STABILIZE_DELAY_MS = 1000

/**
 * How long `stop()` waits for an in-flight `start()` to notice the stop before
 * tearing down anyway. Bounded so a start step that hangs cannot make Ctrl+C hang.
 */
const STOP_WAITS_FOR_START_MS = 30_000

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
	 * Hold the coordinator lock on the persist dir for the server's whole life
	 * (default: true when persisting, unless `DEVFLARE_PERSIST_LOCK=0`). A second
	 * coordinator on the same dir is then refused. `false` overrides the
	 * environment; a non-persisting server never takes the lock.
	 */
	persistLock?: boolean
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

/**
 * Collaborators {@link createWorkspaceDevServer} reaches through, replaceable so a
 * test can observe the ORDER of the lock and the Miniflare instance's life.
 * Production passes nothing.
 */
export interface WorkspaceDevServerDeps {
	/** Load the `miniflare` module (default: a dynamic import). */
	loadMiniflare?: () => Promise<typeof import('miniflare')>
	/** Take the coordinator lock (default: {@link acquireCoordinatorLock}). */
	acquireCoordinatorLock?: typeof acquireCoordinatorLock
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
	/**
	 * Take the coordinator lock, then prepare, merge, start Miniflare, run
	 * migrations, and spawn Vite children. A failed start does NOT tear down what
	 * it started or release the lock: call {@link WorkspaceDevServer.stop} even
	 * when this rejects, as the CLI does. A `stop()` while this runs makes it
	 * reject at its next step.
	 */
	start(): Promise<void>
	/**
	 * Tear everything down (Miniflare, Vite children, shims, bundlers), then
	 * release the coordinator lock. A `start()` still in flight is told to stop
	 * (a lock wait is aborted at once) and awaited first, so nothing it opens
	 * outlives the lock.
	 */
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
 * @param deps - Replacement collaborators, for tests; production passes none.
 * @returns A {@link WorkspaceDevServer} handle.
 */
export function createWorkspaceDevServer(
	options: WorkspaceDevServerOptions,
	deps: WorkspaceDevServerDeps = {}
): WorkspaceDevServer {
	const { manifest, manifestDir, logger } = options
	const persist = options.persist ?? true
	const browserShimBasePort = options.browserShimBasePort ?? DEFAULT_BROWSER_SHIM_BASE_PORT
	const verbose = options.verbose ?? false
	const debug = options.debug ?? process.env.DEVFLARE_DEBUG === 'true'
	const persistLock = persist && coordinatorLockEnabled(process.env, options.persistLock)

	const host = manifest.host ?? '127.0.0.1'
	const persistDir = manifest.persist
		? resolve(manifestDir, manifest.persist)
		: generatedDir(manifestDir, 'workspace-data')
	// One per-boot HMAC secret for the whole instance; each app mints presigned
	// R2 URLs against its OWN origin (injected per-app via its direct-socket port).
	const r2PresignSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`

	let miniflare: MiniflareType | null = null
	/**
	 * The coordinator lock, held from the first step of `start()` to the last of
	 * `stop()`. → GOTCHA: it must stay reachable from here — a SQLite connection
	 * that is garbage-collected closes and frees the lock (the module pins it too).
	 */
	let coordinatorLock: HeldCoordinatorLock | null = null
	/** Aborts a lock wait in progress when `stop()` runs (Ctrl+C during the wait). */
	let lockWait: AbortController | null = null
	/** Set by `stop()`; an in-flight `start()` checks it after every step and rejects. */
	let stopRequested = false
	/** The `start()` in flight (or last run), which `stop()` awaits before tearing down. */
	let starting: Promise<void> | null = null
	const loadMiniflare = deps.loadMiniflare ?? (() => import('miniflare'))
	const acquireLock = deps.acquireCoordinatorLock ?? acquireCoordinatorLock
	let preparedApps: PreparedWorkspaceApp[] = []
	// Resolved from the environment first, because every app's composed worker is
	// built before any app config has been read. A per-app `email` block then
	// refines the relay/inbound settings; selecting `live` for a workspace has to
	// come from DEVFLARE_EMAIL_MODE, since that decision changes what is bundled.
	let emailRuntime: ResolvedEmailRuntime = resolveEmailRuntime(undefined, process.env)
	let outboundEmailService: Awaited<ReturnType<typeof startOutboundEmailService>> | null = null
	let inboundEmailPoller: ReturnType<typeof startInboundEmailPoller> | null = null
	/** Each running Vite child, with what a report about it needs to name. */
	const viteChildren: Array<{ appName: string; vitePort: number; child: ChildProcess }> = []
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
		const miniflareModule = await loadMiniflare()
		throwIfStopping()
		const { Miniflare, Log, LogLevel } = miniflareModule

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
		config.handleStructuredLogs = createRuntimeLogForwarder(logger)

		miniflare = new Miniflare(await toMiniflareOptions(miniflareModule, config))
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

	/**
	 * Spawn a Vite child per Vite app, pointed at its gateway's direct socket
	 * (bridge). The app's manifest `env` goes with it: that child serves the
	 * app's `platform.env` itself, so the vars on the app's workers never reach it.
	 */
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
				appEnv: app.env,
				r2Presign: app.config.bindings?.r2
					? {
							secret: r2PresignSecret,
							origin: resolveR2PresignOrigin(app.config.server, host, app.directSocketPort)
						}
					: null,
				logger
			})
			viteChildren.push({ appName: app.appName, vitePort: app.vitePort, child })
		}
	}

	/**
	 * Stop every Vite child's whole process tree, as `devflare dev` does: the
	 * child is `bunx`, and a plain kill() on Windows ends only that shim, leaving
	 * Vite (and the workerd its adapter starts) running on the app's port. A
	 * child the stop could not see exit is reported, not thrown: the rest of the
	 * teardown still has to run.
	 */
	async function stopViteChildren(): Promise<void> {
		const stopped = await Promise.all(
			viteChildren.map(async (entry) => ({
				entry,
				exited: await stopSpawnedProcessTree(entry.child)
			}))
		)
		viteChildren.length = 0

		for (const { entry, exited } of stopped) {
			if (!exited) {
				logger?.warn(
					`Vite for app "${entry.appName}" (pid ${entry.child.pid}) did not exit when the ` +
						`workspace stopped; it may still be serving port ${entry.vitePort}.`
				)
			}
		}
	}

	/**
	 * Take the coordinator lock before anything opens the persist dir. A stop that
	 * lands during the wait aborts it; one that lands during the attempt that
	 * takes the lock releases it again, and `start()` rejects either way.
	 */
	async function takeCoordinatorLock(): Promise<void> {
		lockWait = new AbortController()
		const held = await acquireLock({
			persistDir,
			signal: lockWait.signal,
			...(logger ? { logger } : {})
		})
		if (held) {
			coordinatorLock = held
			logger?.debug(`Holding the coordinator lock ${held.lockPath}`)
		}
	}

	/**
	 * Reject when `stop()` has been called, so an in-flight `start()` opens
	 * nothing more once the server is stopping.
	 *
	 * @throws {Error} when a stop was requested.
	 */
	function throwIfStopping(): void {
		if (stopRequested) {
			throw new Error('The workspace dev server was stopped while it was starting.')
		}
	}

	function start(): Promise<void> {
		stopRequested = false
		starting = runStart()
		return starting
	}

	async function runStart(): Promise<void> {
		logger?.info('Starting workspace dev server…')

		if (persistLock) {
			await takeCoordinatorLock()
			throwIfStopping()
		}

		setEmailDeliverySink(createHostEmailDeliverySink(() => emailRuntime))
		outboundEmailService = await startOutboundEmailService(() => emailRuntime)
		throwIfStopping()

		preparedApps = await prepareAllApps()
		throwIfStopping()
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
		throwIfStopping()
		await startViteChildren(preparedApps)
		throwIfStopping()
		await runMigrations(preparedApps)
		throwIfStopping()

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

	/**
	 * Wait for an in-flight `start()` to settle — it rejects at its next step once
	 * `stopRequested` is set — but never longer than {@link STOP_WAITS_FOR_START_MS}.
	 * Its rejection belongs to whoever awaited `start()`; this only waits.
	 */
	async function waitForStartToSettle(): Promise<void> {
		if (!starting) return
		let timer: ReturnType<typeof setTimeout> | undefined
		const settled = await Promise.race([
			Promise.allSettled([starting]).then(() => true),
			new Promise<false>((done) => {
				timer = setTimeout(() => done(false), STOP_WAITS_FOR_START_MS)
			})
		])
		clearTimeout(timer)
		if (!settled) {
			logger?.warn(
				`start() did not settle within ${STOP_WAITS_FOR_START_MS / 1000}s of stop(); tearing down anyway.`
			)
		}
	}

	async function stop(): Promise<void> {
		stopRequested = true
		lockWait?.abort()
		await waitForStartToSettle()

		if (inboundEmailPoller) {
			await inboundEmailPoller.stop()
			inboundEmailPoller = null
		}

		await stopViteChildren()

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

		// Last, after Miniflare's dispose has awaited workerd's exit, so nothing still
		// has the store open when the next coordinator (or another holder) takes it.
		// Not in a `finally`: a teardown that threw may have left the store open, and
		// a retried stop() releases it then.
		coordinatorLock?.release()
		coordinatorLock = null
	}

	return {
		start,
		stop,
		getMiniflare: () => miniflare,
		getAppOrigins: () => appOrigins
	}
}
