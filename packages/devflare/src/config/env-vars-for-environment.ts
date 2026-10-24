import {
	type EnvResolutionMode,
	type MissingEnvVar,
	type ResolveConfigEnvVarsOptions,
	resolveConfigEnvVars,
	resolveVarsReportingMissing
} from './env-vars'
import { resolveConfigForEnvironment } from './resolve'
import type { DevflareConfig } from './schema'

/** Options for {@link resolveConfigEnvVarsForEnvironment}. */
export interface ResolveConfigEnvVarsForEnvironmentOptions extends ResolveConfigEnvVarsOptions {
	/** The `env.<name>` section to merge over the base before resolving; nothing is merged when omitted. */
	environment?: string
}

/**
 * Merge a config's environment over its base, then resolve the `env.NAME` descriptors in the merged `vars`.
 *
 * @description This is the config a build or a deploy targets. The order matters:
 * {@link resolveConfigEnvVars} reads `config.vars` alone. On an unmerged config it therefore never sees a
 * descriptor in `env.<name>.vars`, which the merge later brings in unresolved. It also demands a base
 * descriptor that the environment replaces. `devflare build`, `deploy --dry-run` and `deploy` all resolve
 * through this one call, so a deploy ships the values its dry run prints.
 * @param config - A loaded config whose `env` sections are not merged yet.
 * @param options - Where `.env` discovery starts, the resolution mode, and the environment to merge.
 * @returns The merged config, with preview-scoped values materialised and every descriptor in `vars` resolved.
 * @throws {EnvVarResolutionError} When a required variable the merged `vars` read has no value.
 * @throws {EnvVarParseError} When a descriptor's parser throws.
 */
export async function resolveConfigEnvVarsForEnvironment(
	config: DevflareConfig,
	options: ResolveConfigEnvVarsForEnvironmentOptions
): Promise<DevflareConfig> {
	return resolveConfigEnvVars(resolveConfigForEnvironment(config, options.environment), options)
}

/** Options for {@link resolveConfigEnvVarsFromSources}. */
export interface ResolveConfigEnvVarsFromSourcesOptions {
	/** The `env.<name>` section to merge over the base before resolving; nothing is merged when omitted. */
	environment?: string

	/**
	 * The values a descriptor reads, by variable name, and the only ones a descriptor reads. No `.env`
	 * file is read, and `process.env` is not consulted for a descriptor unless it is what you pass.
	 *
	 * → GOTCHA: pass a plain object, such as `{ ...process.env }`. On Windows `process.env` itself
	 *   matches names case-insensitively, and a build's lookup does not, so `env.node_env` would
	 *   resolve here and not there.
	 *
	 * @example { ...process.env }
	 */
	sources: Record<string, string | undefined>

	/**
	 * Resolution mode. `build` is what `devflare build` and `devflare deploy` resolve in: `.dev()` and
	 * `.absentInDev()` do not apply.
	 *
	 * @default 'build'
	 */
	mode?: EnvResolutionMode
}

/** What {@link resolveConfigEnvVarsFromSources} resolved. */
export interface ConfigEnvVarsResolution {
	/**
	 * The config merged for the environment, preview-scoped names materialised, and every descriptor in
	 * `vars` replaced by its value. A missing required variable is dropped from `vars`, so this is what a
	 * deploy would ship once that variable is supplied, minus that variable. The `env` sections are
	 * gone: their target is merged in already, and merging it again would bring that environment's
	 * descriptors back unresolved.
	 */
	config: DevflareConfig

	/**
	 * Every required variable that had no value, with its path under `vars`, in the order the merged
	 * `vars` are walked. `devflare build` and `devflare deploy` refuse to run while this is non-empty.
	 */
	missing: MissingEnvVar[]
}

/**
 * Merge a config's environment over its base, then resolve its `env.NAME` descriptors from the values
 * given — reading no file, and reporting a missing required variable instead of throwing.
 *
 * @description This is the resolution `devflare build` and `devflare deploy` run, in the same order, for
 * a script that has to know what a deploy would ship under conditions it controls: a predeploy check
 * evaluating a config with nothing provisioned, where a `.default()` that would ship must be seen and a
 * required variable that nobody set must not fail an otherwise correct config. Compile the result with
 * `compileBuildConfig(result.config, undefined, { alreadyResolved: true })`, as `deploy --dry-run` does.
 *
 * → GOTCHA: what a deploy resolves from is not what this resolves from. A deploy reads `process.env`
 *   and the config's `.env.public`, `.env.dev` and `.env` files; a descriptor here reads `sources`
 *   alone. That is the point — the caller decides the conditions — but it means the result is a
 *   deploy's only when `sources` holds what that deploy's environment and files would.
 * → GOTCHA: preview-scoped names are materialised as a build materialises them, which reads
 *   `DEVFLARE_PREVIEW_*` from `process.env`, not from `sources`. `deploy --prod` clears those
 *   variables before it loads the config; a caller grading a production deploy clears them too.
 * @param config - A loaded config whose `env` sections are not merged yet, as `loadConfig` returns it.
 * @param options - The environment to merge, the values to resolve from, and the mode.
 * @returns The resolved config and the required variables that were missing.
 * @throws When a descriptor's parser refuses a value in `sources`: devflare's `EnvVarParseError`, whose
 *   `code` is `'ENV_VAR_PARSE_FAILED'`. A build fails on the same value.
 *
 * @example
 * ```ts
 * import { compileBuildConfig, loadConfig, resolveConfigEnvVarsFromSources } from 'devflare'
 *
 * const loaded = await loadConfig({ cwd, dotenv: false })
 * const { config, missing } = resolveConfigEnvVarsFromSources(loaded, {
 *   environment: 'production',
 *   sources: { NODE_ENV: 'production' }
 * })
 * const vars = compileBuildConfig(config, undefined, { alreadyResolved: true }).vars
 * ```
 */
export function resolveConfigEnvVarsFromSources(
	config: DevflareConfig,
	options: ResolveConfigEnvVarsFromSourcesOptions
): ConfigEnvVarsResolution {
	// `env` is dropped with the merge done, so no later compile can merge an unresolved section in.
	const { env: _merged, ...merged } = resolveConfigForEnvironment(config, options.environment)
	const { vars, missing } = resolveVarsReportingMissing(
		merged.vars,
		options.sources,
		options.mode ?? 'build'
	)

	return { config: { ...merged, vars }, missing }
}
