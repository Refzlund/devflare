// =============================================================================
// Vite plugin — public programmatic config helpers
// =============================================================================
// Standalone helpers that callers can use from `vite.config.ts` to feed
// `@cloudflare/vite-plugin` programmatically without instantiating the
// `devflarePlugin()` itself. These are independent of plugin state.
// =============================================================================

import { relative } from 'pathe'
import { loadResolvedConfig, resolveConfigEnvVars, resolveResources } from '../config'
import { compileConfig, compileToProgrammaticConfig } from '../config/compiler'
import type { EnvResolutionMode } from '../config/env-vars'
import { loadConfig } from '../config/loader'
import type { DevflareConfig } from '../config/schema'
import { resolveServiceBindingsFor } from '../test/resolve-service-bindings'
import { DEFAULT_DO_PATTERN } from '../utils/glob'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import {
	type AuxiliaryWorkerConfig,
	createAuxiliaryWorkerConfig,
	discoverDurableObjects
} from './plugin-durable-objects'
import { createAuxiliaryServiceWorkerConfigs } from './plugin-service-bindings'

interface ProgrammaticConfigOptions {
	cwd?: string
	configPath?: string
	environment?: string
	/**
	 * Resolution strategy for name-based KV/D1/Hyperdrive bindings.
	 * - `'offline-local'` (default) — no network; use stable local identifiers
	 * - `'remote'` — resolve against the live Cloudflare account (legacy)
	 */
	resolve?: 'offline-local' | 'remote'
}

async function loadProgrammaticDevflareConfig(options: ProgrammaticConfigOptions) {
	const cwd = options.cwd ?? process.cwd()
	const strategy = options.resolve ?? 'offline-local'
	const resourceResolvedConfig =
		strategy === 'remote'
			? await loadResolvedConfig({
					cwd,
					configFile: options.configPath,
					environment: options.environment
				})
			: await resolveResources(await loadConfig({ cwd, configFile: options.configPath }), {
					phase: 'local',
					environment: options.environment
				})
	// The ONE mode every config this path emits resolves its `env.NAME` vars in, referenced
	// workers included, so a declaration never resolves one way here and another there.
	const envMode: EnvResolutionMode = strategy === 'remote' ? 'build' : 'dev'
	const devflareConfig = await resolveConfigEnvVars(resourceResolvedConfig, {
		cwd,
		configPath: options.configPath,
		mode: envMode
	})
	return { cwd, devflareConfig, envMode }
}

interface ProgrammaticArtifacts {
	cwd: string
	devflareConfig: Awaited<ReturnType<typeof loadProgrammaticDevflareConfig>>['devflareConfig']
	composedMainEntry: string | null
	wranglerConfig: ReturnType<typeof compileConfig>
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkers: AuxiliaryWorkerConfig[]
	/** The mode `devflareConfig`'s vars were resolved in, which its referenced workers share. */
	envMode: EnvResolutionMode
}

/**
 * Single canonical builder for programmatic config artifacts.
 *
 * Both public helpers (`getCloudflareConfig`, `getDevflareConfigs`) project
 * out of this. The function loads the devflare config, prepares the composed
 * worker entrypoint, compiles the wrangler config, derives the matching
 * cloudflare-vite-plugin config (with optional `programmatic` projection),
 * and discovers auxiliary DO workers when applicable. The workers `ref()`
 * service bindings name are added by `getDevflareConfigs` alone, since
 * `getCloudflareConfig` returns no auxiliary workers to put them in.
 */
async function buildProgrammaticArtifacts(
	options: ProgrammaticConfigOptions,
	mode: 'wrangler' | 'programmatic'
): Promise<ProgrammaticArtifacts> {
	const { cwd, devflareConfig, envMode } = await loadProgrammaticDevflareConfig(options)
	const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, devflareConfig)

	const wranglerConfig = compileConfig(devflareConfig)
	const cloudflareConfig: Record<string, unknown> =
		mode === 'programmatic' ? compileToProgrammaticConfig(devflareConfig) : { ...wranglerConfig }

	if (composedMainEntry) {
		const relativeMain = relative(cwd, composedMainEntry)
		wranglerConfig.main = relativeMain
		cloudflareConfig.main = relativeMain
	}

	const auxiliaryWorkers: AuxiliaryWorkerConfig[] = []

	const doPatternConfig = devflareConfig.files?.durableObjects
	const doPattern = typeof doPatternConfig === 'string' ? doPatternConfig : DEFAULT_DO_PATTERN
	if (doPatternConfig !== false) {
		const doWorkerName = `${wranglerConfig.name}-do`
		const discovery = await discoverDurableObjects(cwd, doPattern, doWorkerName)

		if (discovery.files.size > 0) {
			if (cloudflareConfig.durable_objects) {
				const doConfig = cloudflareConfig.durable_objects as {
					bindings: Array<{ script_name?: string }>
				}
				for (const binding of doConfig.bindings) {
					binding.script_name = doWorkerName
				}
			}
			auxiliaryWorkers.push(createAuxiliaryWorkerConfig(wranglerConfig, discovery))
		}
	}

	return {
		cwd,
		devflareConfig,
		composedMainEntry,
		wranglerConfig,
		cloudflareConfig,
		auxiliaryWorkers,
		envMode
	}
}

/**
 * Get cloudflare config for programmatic use with @cloudflare/vite-plugin.
 * Call this in vite.config.ts before setting up plugins.
 *
 * By default the config is resolved **offline** using local stable
 * identifiers (no Cloudflare credentials required — matches the Miniflare /
 * workerd behaviour of `vite dev`). Pass `{ resolve: 'remote' }` to restore
 * the legacy behaviour that talks to the Cloudflare API and fails without
 * credentials (e.g. when you want the programmatic config to reflect real
 * production IDs during an automation script).
 */
export async function getCloudflareConfig(
	options: ProgrammaticConfigOptions = {}
): Promise<Record<string, unknown>> {
	const { cloudflareConfig } = await buildProgrammaticArtifacts(options, 'programmatic')
	return cloudflareConfig
}

/**
 * @description Builds the `devOnly` auxiliary workers for the workers a config's `ref()`
 * service bindings name. Their `env.NAME` vars resolve in the main config's mode, and no
 * `.dev.vars` is laid over them, because this path's output reaches `vite build` as well as
 * `vite dev` and cannot tell which.
 *
 * → NOTE: `devOnly` keeps these workers out of a build on `@cloudflare/vite-plugin` 1.39.0 and
 *   later. An older 1.x, which devflare's peer range still admits, ignores it and builds them, and
 *   then a referenced worker's `.dev()` fallbacks reach `dist` exactly as the main config's do in
 *   the `'offline-local'` strategy. `.dev.vars` secrets reach it on no version.
 * @param devflareConfig - the loaded config, its refs already resolved
 * @param cwd - the directory the refs' config paths are relative to
 * @param envMode - the mode the main config's vars were resolved in
 * @returns one auxiliary worker per referenced worker and per helper worker it needs
 * @throws {EnvVarResolutionError} When a referenced worker's required var has no value.
 */
async function buildReferencedAuxiliaryWorkers(
	devflareConfig: DevflareConfig,
	cwd: string,
	envMode: EnvResolutionMode
): Promise<AuxiliaryWorkerConfig[]> {
	if (!devflareConfig.bindings?.services) {
		return []
	}

	const resolution = await resolveServiceBindingsFor(devflareConfig, cwd, {
		referencedEnv: envMode
	})
	return createAuxiliaryServiceWorkerConfigs(resolution).auxiliaryWorkers
}

/**
 * Get auxiliary worker configs for Durable Objects and `ref()` service bindings
 * Use this when configuring @cloudflare/vite-plugin's auxiliaryWorkers option
 *
 * A worker a `ref()` binding names is returned `devOnly`. Its vars resolve in the same mode as
 * the main config's, and without its `.dev.vars`, because this function cannot tell `vite dev`
 * from `vite build`.
 *
 * @example
 * ```ts
 * const { cloudflareConfig, auxiliaryWorkers } = await getDevflareConfigs()
 *
 * cloudflare({
 *   config: cloudflareConfig,
 *   auxiliaryWorkers
 * })
 * ```
 */
export async function getDevflareConfigs(options: ProgrammaticConfigOptions = {}): Promise<{
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkers: AuxiliaryWorkerConfig[]
}> {
	const { cwd, devflareConfig, cloudflareConfig, auxiliaryWorkers, envMode } =
		await buildProgrammaticArtifacts(options, 'wrangler')
	return {
		cloudflareConfig,
		auxiliaryWorkers: [
			...auxiliaryWorkers,
			...(await buildReferencedAuxiliaryWorkers(devflareConfig, cwd, envMode))
		]
	}
}
