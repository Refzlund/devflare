// =============================================================================
// Referenced config — how a worker a ref() binding names is read
// =============================================================================
// A `ref()` binding names another worker's config. Building that worker takes
// its config file's location and its config with its env resolved. Which env
// it gets depends on what the result feeds, and the wrong choice puts local
// secrets into a build: see `ReferencedEnv`.
// =============================================================================

import { dirname } from 'node:path'
import { configSchema, type DevflareConfig } from '../config'
import { resolveDevConfig } from '../config/dev-config'
import {
	type EnvResolutionMode,
	EnvVarParseError,
	EnvVarResolutionError,
	resolveConfigEnvVars
} from '../config/env-vars'
import type { RefResult } from '../config/ref'
import { resolvePackageSpecifier } from '../utils/resolve-package'

/**
 * @description Locates the config file a ref imports.
 * @param ref - the ref; its `configPath` is the specifier its import function names
 * @param parentConfigDir - the directory that specifier is relative to
 * @returns the absolute path, or null when the ref carries no usable specifier
 */
export function resolveReferencedConfigPath(
	ref: RefResult,
	parentConfigDir: string
): string | null {
	const configPath = ref.configPath
	if (!configPath || configPath === '<resolved>') {
		return null
	}

	return resolvePackageSpecifier(configPath, parentConfigDir)
}

/**
 * @description Locates the directory of the config file a ref imports.
 * @param ref - the ref
 * @param parentConfigDir - the directory its specifier is relative to
 * @returns the directory, or null when the ref carries no usable specifier
 */
export function resolveReferencedConfigDir(ref: RefResult, parentConfigDir: string): string | null {
	const configPath = resolveReferencedConfigPath(ref, parentConfigDir)
	return configPath ? dirname(configPath) : null
}

/**
 * Which env a referenced worker's config is resolved with, decided by what the result feeds.
 *
 * - `'local'` — a local runtime and nothing else (the dev server, a test context, the plugin in
 *   `vite dev`): `env.NAME` vars in dev mode, then the `.dev.vars` beside the referenced config
 *   on top, as wrangler gives each worker its own.
 * - `'dev'` / `'build'` — a result that can reach a build output: `env.NAME` vars in that mode,
 *   and NO `.dev.vars`. Pass the mode the main config's own vars were resolved in, so the two
 *   never disagree about one declaration.
 */
export type ReferencedEnv = 'local' | EnvResolutionMode

/**
 * @description Reads a referenced worker's config with the env {@link ReferencedEnv} names.
 * `'local'` reads it the way the dev coordinator reads the main one ({@link resolveDevConfig}).
 *
 * → GOTCHA: `'local'` puts `.dev.vars` secrets into the worker's vars as plain values, and
 *   `@cloudflare/vite-plugin` writes an auxiliary worker's vars into `dist` on `vite build`. So a
 *   path whose workers can reach a build passes a mode instead. `getDevflareConfigs()` cannot tell
 *   `vite dev` from `vite build` and passes its main config's mode. The `devflarePlugin()` path
 *   resolves service bindings in serve mode only and passes `'local'`.
 * @param ref - the resolved ref
 * @param parentConfigDir - the directory the ref's `configPath` is relative to
 * @param referencedEnv - which env to resolve; see {@link ReferencedEnv}
 * @returns the config; its vars stay unresolved only when the ref carries no config path,
 *   in which case no worker is built from it
 * @throws {EnvVarResolutionError} When a required var has no value; the message names the worker.
 * @throws {EnvVarParseError} When a var's parser throws; the message names the worker.
 */
export async function resolveReferencedConfig(
	ref: RefResult,
	parentConfigDir: string,
	referencedEnv: ReferencedEnv
): Promise<DevflareConfig> {
	const config = configSchema.parse(ref.config)
	const configPath = resolveReferencedConfigPath(ref, parentConfigDir)
	if (!configPath) {
		return config
	}

	const cwd = dirname(configPath)
	try {
		return referencedEnv === 'local'
			? await resolveDevConfig(config, { cwd, configPath })
			: await resolveConfigEnvVars(config, { cwd, configPath, mode: referencedEnv })
	} catch (error) {
		// The variable tree names a var, not the config that declared it, and with several workers
		// that is the question. The class is kept on purpose: the dev server waits for `.env` to
		// change on an EnvVarResolutionError, and wrapping it would turn that wait into a crash.
		if (error instanceof EnvVarResolutionError || error instanceof EnvVarParseError) {
			error.message = `Service-bound worker "${ref.name}" (${configPath}):\n${error.message}`
		}
		throw error
	}
}
