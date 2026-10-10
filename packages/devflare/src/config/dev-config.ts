// =============================================================================
// Dev config — a loaded config, as a local dev runtime serves it
// =============================================================================
// Every dev surface that builds an env from a config goes through this one
// step: the dev coordinator, a workspace app, Miniflare started from a config,
// the test contexts, and the SvelteKit handle in a Vite child. A surface that
// hand-copies the step can drop half of it, and its env then disagrees with the
// workers' — the SvelteKit handle served `env.NAME` descriptors as objects, and
// no `.dev.vars` at all, until it came through here.
// =============================================================================

import { resolveConfigEnvVars } from './env-vars'
import { applyLocalDevVarsToConfig } from './local-dev-vars'
import type { DevflareConfig } from './schema'

/** Where a config was loaded from, which decides the files its env is read from. */
export interface ResolveDevConfigOptions {
	/** The app root. `.dev.vars` (or wrangler's `.env` fallback) is read from here. */
	cwd: string
	/**
	 * The config file. `.env` discovery for `env.NAME` descriptors starts beside it,
	 * and at `cwd` when it is omitted.
	 */
	configPath?: string
	/** The Cloudflare environment selecting `.dev.vars.<environment>`. Defaults to `CLOUDFLARE_ENV`. */
	environment?: string
}

/**
 * @description Resolves a loaded config into the one a local dev runtime serves: the
 * `env.NAME` descriptors under `vars` resolved in dev mode, then the wrangler-compatible
 * `.dev.vars` overlay on top.
 * @param config - the config as `loadConfig` returned it
 * @param options - where the config was loaded from; see {@link ResolveDevConfigOptions}
 * @returns the config with every var in `vars` a plain value
 * @throws {EnvVarResolutionError} When a required `env.NAME` var has no value and no dev fallback.
 * @throws {EnvVarParseError} When a descriptor's parser throws.
 */
export async function resolveDevConfig(
	config: DevflareConfig,
	options: ResolveDevConfigOptions
): Promise<DevflareConfig> {
	const envResolved = await resolveConfigEnvVars(config, {
		cwd: options.cwd,
		configPath: options.configPath,
		mode: 'dev'
	})

	return applyLocalDevVarsToConfig(envResolved, {
		cwd: options.cwd,
		environment: options.environment
	})
}
