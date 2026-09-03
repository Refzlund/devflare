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
*/
import { resolve } from 'pathe'

/** The generated-state directory used when nothing overrides it. */
export const DEFAULT_GENERATED_DIR = '.devflare'

/** The environment variable that overrides {@link DEFAULT_GENERATED_DIR}. */
export const GENERATED_DIR_ENV = 'DEVFLARE_DIR'

/**
 * The generated-state directory NAME for this process.
 *
 * @param env - The environment to read; injected so callers can test the
 *   resolution without mutating `process.env`.
 * @returns The override when set to a non-blank value, else `.devflare`. A path
 *   is accepted as given — relative names resolve against the app's cwd, and an
 *   absolute path is honoured, which is how an instance can put its state
 *   outside the project entirely.
 */
export function generatedDirName(env: Record<string, string | undefined> = process.env): string {
	const override = env[GENERATED_DIR_ENV]?.trim()
	return override ? override : DEFAULT_GENERATED_DIR
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
