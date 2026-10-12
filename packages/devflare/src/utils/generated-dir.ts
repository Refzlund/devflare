/*
	──────────────────────────────────────────────
	   Where devflare writes its generated state
	──────────────────────────────────────────────
	Every generated artifact — the dev Wrangler config, the composed worker
	entrypoint, the synthesized Vite config, the local Miniflare data — lives
	under ONE root, `.devflare` by default, resolved from the process cwd.

	That root is overridable so a project can run MORE THAN ONE devflare instance
	against the same directory. It previously could not: the name was a constant
	repeated across six modules, so every instance started in the same app wrote
	the same files. Vite watches the config it loaded, so starting a second
	instance hot-restarted the first onto the SECOND's configuration; when that
	second instance shut down and took its runtime port with it, the first was
	left dialling a port that no longer existed — socket still bound, every
	request hanging forever. Separate ports did not help, because the collision
	was on a file path rather than a socket.

	The motivating case is a Playwright suite running beside a dev server in one
	working tree, but it applies to any two concurrent instances.

	→ KEY: `DEVFLARE_DIR` is per-INSTANCE, set in the environment of the process
	  you are starting. Leave it unset and nothing changes.
	→ GOTCHA: it must be set for the whole life of an instance, including any
	  later `build`/`deploy` that expects to find that instance's artifacts —
	  the override applies uniformly, it is not dev-only.
	→ GOTCHA: a workspace instance hosts several apps. An override that stays
	  inside each app gives each its own directory, but one that lands outside
	  (any absolute path, or `../gen`) names ONE directory for all of them, so
	  every app's bundle would land on one path and the last app prepared would
	  win for all of them, silently. The workspace therefore prepares each app
	  under {@link withGeneratedRoot}, at {@link workspaceAppGeneratedRoot}.
*/
import { AsyncLocalStorage } from 'node:async_hooks'
import { relative, resolve } from 'pathe'
import { isWithin } from './is-within'

/** The generated-state directory used when nothing overrides it. */
export const DEFAULT_GENERATED_DIR = '.devflare'

/** The environment variable that overrides {@link DEFAULT_GENERATED_DIR}. */
export const GENERATED_DIR_ENV = 'DEVFLARE_DIR'

/**
 * The root a workspace assigned to the app it is preparing. An async context
 * rather than a parameter, so every lookup below the preparation honours it,
 * however deep, without each helper having to carry it.
 */
const assignedGeneratedRoot = new AsyncLocalStorage<string>()

/**
 * @description Reads the `DEVFLARE_DIR` override alone, ignoring any root a
 * workspace assigned.
 * @param env - the environment to read
 * @returns the trimmed override, or `undefined` when unset or blank
 */
function overrideFromEnv(env: Record<string, string | undefined>): string | undefined {
	const override = env[GENERATED_DIR_ENV]?.trim()
	return override ? override : undefined
}

/**
 * The generated-state directory NAME for this process.
 *
 * @param env - The environment to read; injected so callers can test the
 *   resolution without mutating `process.env`.
 * @returns The root a workspace assigned to the app being prepared, when there
 *   is one ({@link withGeneratedRoot}); else the override when set to a
 *   non-blank value; else `.devflare`. A path is accepted as given — relative
 *   names resolve against the app's cwd, and an absolute path is honoured,
 *   which is how an instance can put its state outside the project entirely.
 */
export function generatedDirName(env: Record<string, string | undefined> = process.env): string {
	return assignedGeneratedRoot.getStore() ?? overrideFromEnv(env) ?? DEFAULT_GENERATED_DIR
}

/**
 * Resolve a path inside this process's generated-state directory.
 *
 * @param cwd - The app directory the state belongs to.
 * @param segments - Path segments below the generated root, e.g.
 *   `'worker-entrypoints', 'main.js'`.
 * @returns The absolute path.
 */
export function generatedDir(cwd: string, ...segments: string[]): string {
	return resolve(cwd, generatedDirName(), ...segments)
}

/**
 * @description Runs `work` with every generated-state lookup inside it — and
 * inside anything it starts, timers and promises included — rooted at `root`.
 * @param root - an absolute directory, normally from {@link workspaceAppGeneratedRoot}
 * @param work - the preparation to run
 * @returns whatever `work` returns
 */
export function withGeneratedRoot<T>(root: string, work: () => T): T {
	return assignedGeneratedRoot.run(root, work)
}

/**
 * @description Where one app of a workspace keeps its generated state, when the
 * override cannot place it on its own. An override that resolves INSIDE the
 * app (the default `.devflare`, `.devflare-e2e`) gives every app its own
 * directory. One that resolves outside it — any absolute path, or a relative
 * one climbing out such as `../gen` — is shared by every app it reaches, so
 * each app gets the subdirectory matching its path below the manifest:
 * `<override>/apps/api` for `apps/api`. The workspace's own state
 * (`workspace-data`) stays at the override itself.
 * @param manifestDir - the directory the workspace manifest's paths resolve from
 * @param appDir - the app's directory
 * @param env - the environment to read
 * @returns the app's root, or `undefined` when the app's own resolution stays
 *   inside it
 * @throws When the override lands outside the app and the app is not below the
 *   manifest directory, since no subdirectory of the override corresponds to it.
 */
export function workspaceAppGeneratedRoot(
	manifestDir: string,
	appDir: string,
	env: Record<string, string | undefined> = process.env
): string | undefined {
	const override = overrideFromEnv(env)
	if (override === undefined) return undefined

	const shared = resolve(appDir, override)
	if (isWithin(appDir, shared)) return undefined

	if (!isWithin(manifestDir, appDir)) {
		throw new Error(
			`Workspace app ${appDir} is not inside the manifest directory ${manifestDir}, so ${GENERATED_DIR_ENV}=${override}, which every app shares, has no subdirectory to give it. Move the app below the manifest, or use a ${GENERATED_DIR_ENV} that stays inside each app, such as .devflare-e2e.`
		)
	}
	return resolve(shared, relative(manifestDir, appDir))
}
