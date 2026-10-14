import { type ChildProcess, spawn } from 'node:child_process'
import type { ConsolaInstance } from 'consola'
import { COPIED_DOTENV_NAMES_ENV, encodeCopiedDotenvNames } from '../config/copied-dotenv-names'
import { listCopiedDotenvNames } from '../config/env-vars'
import { encodeInjectedVars, INJECTED_VARS_ENV } from '../config/injected-vars'
import { isReservedAppEnvKey } from '../config/workspace'
import { GENERATED_DIR_ENV } from '../utils/generated-dir'
import { RUNTIME_STATUS_URL_ENV } from './runtime-status'
import { type ViteReadyOutcome, waitForViteReady } from './vite-utils'

/** The parts of {@link StartViteProcessOptions} that decide the Vite child's environment. */
export interface ViteChildEnvOptions {
	/** Absolute config path, exposed as `DEVFLARE_CONFIG_PATH`. */
	configPath?: string
	/** The bridge (gateway direct-socket) port, exposed as `DEVFLARE_BRIDGE_PORT`. */
	miniflarePort: number
	/**
	 * Absolute URL of the coordinator's runtime-status listener, exposed to the app
	 * process as `DEVFLARE_RUNTIME_STATUS_URL`. Its ABSENCE is meaningful — the bridge
	 * connect path reads that as "no coordinator to ask" and keeps its old, modest
	 * retry budget rather than assuming a reload is under way.
	 */
	runtimeStatusUrl?: string
	/**
	 * Local R2 presign context, exposed to the app process as
	 * `DEVFLARE_R2_PRESIGN_SECRET`/`DEVFLARE_R2_PRESIGN_ORIGIN` so
	 * `presignR2Put`/`presignR2Get` mint gateway-local URLs in dev.
	 */
	r2Presign?: { secret: string; origin: string } | null
	/**
	 * A workspace app's manifest `env`. Each entry is set in the child's
	 * environment, and the whole map is also passed as
	 * {@link INJECTED_VARS_ENV} so the child can layer it over the config's
	 * `vars`. The single-app `devflare dev` path has none.
	 */
	appEnv?: Record<string, string>
	/**
	 * Names of values the coordinator copied into its own environment from some
	 * config's `.env` (`listCopiedDotenvNames`). Those the child inherits
	 * unchanged are passed as {@link COPIED_DOTENV_NAMES_ENV}, so the child ranks
	 * them below the app's own `.env`, as the coordinator does.
	 */
	copiedDotenvNames?: readonly string[]
	/**
	 * The generated-state root a workspace assigned this app, because the
	 * inherited `DEVFLARE_DIR` lands outside it. Exposed as `DEVFLARE_DIR`, so the
	 * child finds the files the coordinator generated for THIS app rather than
	 * the directory every app shares.
	 */
	generatedRoot?: string
}

/** What a caller passes; the copied `.env` names are the coordinator's own state, read at spawn. */
export interface StartViteProcessOptions extends Omit<ViteChildEnvOptions, 'copiedDotenvNames'> {
	cwd: string
	vitePort: number
	generatedViteConfigPath: string | null
	logger?: ConsolaInstance
	/** The workspace app this Vite serves, named in its log lines. */
	appName?: string
	/** See {@link WatchViteStartupOptions.isStopping}. */
	isStopping?: () => boolean
}

/**
 * @description Builds the environment the Vite child is spawned with.
 *
 * Three layers, later winning: the inherited environment, then the app's
 * manifest `env`, then devflare's own variables. The inherited layer is kept
 * whole on purpose, except for devflare's two channels ({@link INJECTED_VARS_ENV}
 * and {@link COPIED_DOTENV_NAMES_ENV}): apps read their shell's variables
 * through it, and a workspace consumer relies on it to pass values the manifest
 * does not carry. devflare's layer wins so a manifest can never redirect the
 * bridge or the config path (the manifest also refuses those names when it loads).
 *
 * @param inherited - the coordinator's own environment (`process.env`)
 * @param options - what this child needs devflare to tell it
 * @returns the child's complete environment
 */
export function buildViteChildEnv(
	inherited: Record<string, string | undefined>,
	options: ViteChildEnvOptions
): Record<string, string | undefined> {
	const { configPath, miniflarePort, runtimeStatusUrl, r2Presign } = options
	const appEnv = options.appEnv ?? {}
	const hasAppEnv = Object.keys(appEnv).length > 0

	// A copy the manifest or devflare sets over is no longer the copied value in
	// the child: it is the child's environment there, as an overwritten copy is
	// the coordinator's. Every name devflare sets is reserved, which also keeps a
	// copied `DEVFLARE_*` name the child's environment, as it was before.
	const inheritedCopies = (options.copiedDotenvNames ?? []).filter(
		(name) => !Object.hasOwn(appEnv, name) && !isReservedAppEnvKey(name, { vite: true })
	)

	// Both channels are devflare's to set per child. Inheriting one would hand
	// this child another app's values — or, from a nested launch, a parent's —
	// so neither passes through from the inherited layer.
	const {
		[INJECTED_VARS_ENV]: _injectedNotInherited,
		[COPIED_DOTENV_NAMES_ENV]: _copiedNotInherited,
		...inheritedWithoutChannels
	} = inherited

	return {
		...inheritedWithoutChannels,
		...appEnv,
		...(hasAppEnv ? { [INJECTED_VARS_ENV]: encodeInjectedVars(appEnv) } : {}),
		...(inheritedCopies.length > 0
			? { [COPIED_DOTENV_NAMES_ENV]: encodeCopiedDotenvNames(inheritedCopies) }
			: {}),
		DEVFLARE_DEV: 'true',
		DEVFLARE_BRIDGE_PORT: String(miniflarePort),
		...(runtimeStatusUrl ? { [RUNTIME_STATUS_URL_ENV]: runtimeStatusUrl } : {}),
		...(configPath ? { DEVFLARE_CONFIG_PATH: configPath } : {}),
		...(options.generatedRoot ? { [GENERATED_DIR_ENV]: options.generatedRoot } : {}),
		...(r2Presign
			? {
					DEVFLARE_R2_PRESIGN_SECRET: r2Presign.secret,
					DEVFLARE_R2_PRESIGN_ORIGIN: r2Presign.origin
				}
			: {}),
		FORCE_COLOR: '1'
	}
}

/** How long startup waits for Vite's URL before moving on without it. */
export const VITE_STARTUP_WAIT_MS = 15_000

/**
 * How long Vite may go without reporting a URL before devflare says it may be
 * stuck. A slow first start (a cold SvelteKit dep scan) takes 25–30 s, so this
 * sits well past that.
 */
export const VITE_STALL_WARNING_MS = 60_000

/** A running Vite child and what is known about its startup. */
export interface ViteProcessHandle {
	/** The spawned child (a `bunx` shim on every platform), for teardown. */
	child: ChildProcess
	/**
	 * Settles once startup is decided: `ready` with the URL, or `failed` when the
	 * child exited or errored AFTER the startup wait gave up on it. Never rejects,
	 * and stays pending while Vite neither serves nor exits.
	 */
	ready: Promise<ViteReadyOutcome>
	/** The outcome once {@link ready} has settled, read synchronously; null before. */
	readonly outcome: ViteReadyOutcome | null
}

/** What {@link watchViteStartup} needs besides the child. */
export interface WatchViteStartupOptions {
	/** The workspace app this Vite serves; the single-app `devflare dev` has none. */
	appName?: string
	logger?: ConsolaInstance
	/**
	 * Whether the caller is shutting down. A child the stop itself ended exits
	 * "before it became ready", which is not news, so late failures and the stall
	 * warning are not logged once this returns true.
	 */
	isStopping?: () => boolean
	/** Default {@link VITE_STARTUP_WAIT_MS}. */
	startupWaitMs?: number
	/** Default {@link VITE_STALL_WARNING_MS}, measured from the start of the watch. */
	stallWarningMs?: number
	/** Receives every stdout chunk (default: this process's stdout). */
	onStdout?: (chunk: string | Buffer) => void
	/** Receives every stderr chunk (default: this process's stderr). */
	onStderr?: (chunk: string | Buffer) => void
}

/**
 * @description Watches a freshly spawned Vite child until it reports its URL,
 * logging what happens in words that match what is known: ready, still starting
 * (not a fault — a cold start often outlasts the startup wait), ready late,
 * apparently stuck, or exited before it ever served.
 *
 * Returns after at most `startupWaitMs`, so a caller can register the child for
 * teardown and carry on starting; the watch continues past that and settles
 * {@link ViteProcessHandle.ready} whenever startup is decided.
 * → GOTCHA: do not make the startup wait unbounded. Both callers register the
 *   child only once this returns, so a stop during an unbounded wait would leave
 *   a Vite that never serves running with nothing to end it.
 * @param child - the spawned Vite child
 * @param options - labels, logger, stop flag and timings
 * @returns the child with its readiness
 * @throws {Error} when the child errors or exits within the startup wait, as before
 */
export async function watchViteStartup(
	child: ChildProcess,
	options: WatchViteStartupOptions = {}
): Promise<ViteProcessHandle> {
	const {
		appName,
		logger,
		isStopping = () => false,
		startupWaitMs = VITE_STARTUP_WAIT_MS,
		stallWarningMs = VITE_STALL_WARNING_MS,
		onStdout = (chunk) => process.stdout.write(chunk),
		onStderr = (chunk) => process.stderr.write(chunk)
	} = options
	const subject = appName ? `Vite for app "${appName}"` : 'Vite dev server'
	const startedAt = performance.now()
	const elapsed = () => `${((performance.now() - startedAt) / 1000).toFixed(1)}s`

	let outcome: ViteReadyOutcome | null = null
	let resolveReady!: (outcome: ViteReadyOutcome) => void
	const ready = new Promise<ViteReadyOutcome>((resolve) => {
		resolveReady = resolve
	})
	const handle: ViteProcessHandle = {
		child,
		ready,
		get outcome() {
			return outcome
		}
	}

	let stallTimer: ReturnType<typeof setTimeout> | undefined
	const record = (decided: ViteReadyOutcome) => {
		clearTimeout(stallTimer)
		outcome = decided
		resolveReady(decided)
	}

	const initialUrl = await waitForViteReady(child, {
		timeoutMs: startupWaitMs,
		onStdout,
		onStderr,
		onLateOutcome(late) {
			record(late)
			if (late.status === 'ready') {
				logger?.success(`${subject} started on ${late.url} (after ${elapsed()})`)
			} else if (!isStopping()) {
				logger?.error(`${subject} stopped before it became ready: ${late.error.message}`)
			}
		}
	})

	if (initialUrl) {
		record({ status: 'ready', url: initialUrl })
		logger?.success(`${subject} started on ${initialUrl}`)
		return handle
	}

	logger?.info(
		`${subject} is still starting after ${elapsed()}; devflare will report its URL when it is ready`
	)
	stallTimer = setTimeout(
		() => {
			if (outcome === null && !isStopping()) {
				logger?.warn(
					`${subject} has not reported a local URL after ${elapsed()} and has not exited; ` +
						'it may be stuck — check its output above'
				)
			}
		},
		Math.max(0, stallWarningMs - (performance.now() - startedAt))
	)
	// The warning is advice; it must never be what keeps the process alive.
	stallTimer.unref?.()
	return handle
}

/**
 * @description Spawns the Vite dev server (`bunx vite dev`) for one app and
 * watches its startup ({@link watchViteStartup}).
 * @param options - where and how to run it, and what its environment carries
 * @returns the child with its readiness, after at most the startup wait
 * @throws {Error} when Vite errors or exits within the startup wait
 */
export async function startViteProcess(
	options: StartViteProcessOptions
): Promise<ViteProcessHandle> {
	const { cwd, vitePort, generatedViteConfigPath, logger, appName, isStopping } = options

	const args = ['vite', 'dev', '--port', String(vitePort)]
	if (generatedViteConfigPath) {
		args.push('--config', generatedViteConfigPath)
	}

	const viteProcess = spawn('bunx', args, {
		cwd,
		stdio: ['inherit', 'pipe', 'pipe'],
		windowsHide: true,
		// Read at spawn, after both callers have loaded the configs they read at
		// startup and so copied each one's `.env`.
		env: buildViteChildEnv(process.env, {
			...options,
			copiedDotenvNames: listCopiedDotenvNames()
		})
	})

	return await watchViteStartup(viteProcess, {
		...(appName ? { appName } : {}),
		...(logger ? { logger } : {}),
		...(isStopping ? { isStopping } : {})
	})
}
