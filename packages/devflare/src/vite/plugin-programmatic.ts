// =============================================================================
// Vite plugin — public programmatic config helpers
// =============================================================================
// Standalone helpers that callers can use from `vite.config.ts` to feed
// `@cloudflare/vite-plugin` programmatically without instantiating the
// `devflarePlugin()` itself. These are independent of plugin state.
// =============================================================================

import { relative } from 'pathe'
import {
	loadResolvedConfig,
	resolveResources
} from '../config'
import { loadConfig } from '../config/loader'
import { compileConfig, compileToProgrammaticConfig } from '../config/compiler'
import { DEFAULT_DO_PATTERN } from '../utils/glob'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import {
	createAuxiliaryWorkerConfig,
	discoverDurableObjects,
	type AuxiliaryWorkerConfig
} from './plugin-durable-objects'
import { resolveServiceBindings } from '../test/resolve-service-bindings'
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
	const devflareConfig = strategy === 'remote'
		? await loadResolvedConfig({
			cwd,
			configFile: options.configPath,
			environment: options.environment
		})
		: await resolveResources(
			await loadConfig({ cwd, configFile: options.configPath }),
			{ phase: 'local', environment: options.environment }
		)
	return { cwd, devflareConfig }
}

interface ProgrammaticArtifacts {
	cwd: string
	devflareConfig: Awaited<ReturnType<typeof loadProgrammaticDevflareConfig>>['devflareConfig']
	composedMainEntry: string | null
	wranglerConfig: ReturnType<typeof compileConfig>
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkers: AuxiliaryWorkerConfig[]
}

/**
 * Single canonical builder for programmatic config artifacts.
 *
 * Both public helpers (`getCloudflareConfig`, `getDevflareConfigs`) project
 * out of this. The function loads the devflare config, prepares the composed
 * worker entrypoint, compiles the wrangler config, derives the matching
 * cloudflare-vite-plugin config (with optional `programmatic` projection),
 * and discovers auxiliary DO workers when applicable.
 */
async function buildProgrammaticArtifacts(
	options: ProgrammaticConfigOptions,
	mode: 'wrangler' | 'programmatic'
): Promise<ProgrammaticArtifacts> {
	const { cwd, devflareConfig } = await loadProgrammaticDevflareConfig(options)
	const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, devflareConfig)

	const wranglerConfig = compileConfig(devflareConfig)
	const cloudflareConfig: Record<string, unknown> = mode === 'programmatic'
		? compileToProgrammaticConfig(devflareConfig)
		: { ...wranglerConfig }

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
				const doConfig = cloudflareConfig.durable_objects as { bindings: Array<{ script_name?: string }> }
				for (const binding of doConfig.bindings) {
					binding.script_name = doWorkerName
				}
			}
			auxiliaryWorkers.push(createAuxiliaryWorkerConfig(wranglerConfig, discovery))
		}
	}

	if (devflareConfig.bindings?.services) {
		const serviceBindingResolution = await resolveServiceBindings(devflareConfig, cwd)
		auxiliaryWorkers.push(
			...createAuxiliaryServiceWorkerConfigs(serviceBindingResolution).auxiliaryWorkers
		)
	}

	return { cwd, devflareConfig, composedMainEntry, wranglerConfig, cloudflareConfig, auxiliaryWorkers }
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
 * Get auxiliary worker configs for Durable Objects
 * Use this when configuring @cloudflare/vite-plugin's auxiliaryWorkers option
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
export async function getDevflareConfigs(
	options: ProgrammaticConfigOptions = {}
): Promise<{
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkers: AuxiliaryWorkerConfig[]
}> {
	const { cloudflareConfig, auxiliaryWorkers } = await buildProgrammaticArtifacts(options, 'wrangler')
	return { cloudflareConfig, auxiliaryWorkers }
}
