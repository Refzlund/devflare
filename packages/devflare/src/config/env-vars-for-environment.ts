import { type ResolveConfigEnvVarsOptions, resolveConfigEnvVars } from './env-vars'
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
