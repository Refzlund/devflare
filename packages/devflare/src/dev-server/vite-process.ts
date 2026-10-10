import { type ChildProcess, spawn } from 'node:child_process'
import type { ConsolaInstance } from 'consola'
import { COPIED_DOTENV_NAMES_ENV, encodeCopiedDotenvNames } from '../config/copied-dotenv-names'
import { listCopiedDotenvNames } from '../config/env-vars'
import { encodeInjectedVars, INJECTED_VARS_ENV } from '../config/injected-vars'
import { isReservedAppEnvKey } from '../config/workspace'
import { RUNTIME_STATUS_URL_ENV } from './runtime-status'
import { waitForViteReady } from './vite-utils'

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
}

/** What a caller passes; the copied `.env` names are the coordinator's own state, read at spawn. */
export interface StartViteProcessOptions extends Omit<ViteChildEnvOptions, 'copiedDotenvNames'> {
	cwd: string
	vitePort: number
	generatedViteConfigPath: string | null
	logger?: ConsolaInstance
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
		...(r2Presign
			? {
					DEVFLARE_R2_PRESIGN_SECRET: r2Presign.secret,
					DEVFLARE_R2_PRESIGN_ORIGIN: r2Presign.origin
				}
			: {}),
		FORCE_COLOR: '1'
	}
}

/**
 * Start the Vite dev server process.
 */
export async function startViteProcess(options: StartViteProcessOptions): Promise<ChildProcess> {
	const { cwd, vitePort, generatedViteConfigPath, logger } = options

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

	const readyUrl = await waitForViteReady(viteProcess, {
		onStdout(chunk) {
			process.stdout.write(chunk)
		},
		onStderr(chunk) {
			process.stderr.write(chunk)
		}
	})

	if (readyUrl) {
		logger?.success(`Vite dev server started on ${readyUrl}`)
		return viteProcess
	}

	logger?.warn('Vite process started, but the final local URL could not be confirmed yet')
	return viteProcess
}
