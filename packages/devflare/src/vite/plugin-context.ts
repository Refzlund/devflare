// =============================================================================
// Devflare Vite Plugin — context builder + generated-config helpers
// =============================================================================
// Extracted from vite/plugin.ts (F35 step 2). Pure helpers used by the plugin
// hooks to:
// - Compile a `DevflareConfig` into a wrangler config + cloudflare-plugin
//   programmatic config + (optional) auxiliary DO worker config.
// - Manage the on-disk generated `.devflare/` directory.
// - Resolve the plugin's own config-file path on the user's project.
// =============================================================================

import { isAbsolute, relative, resolve } from 'pathe'
import { resolveConfigEnvVars, resolveResources } from '../config'
import {
	type WranglerConfig,
	compileBuildConfig,
	compileConfig,
	compileToProgrammaticConfig,
	isolateViteBuildOutputPaths,
	rebaseWranglerConfigPaths,
	writeWranglerConfig
} from '../config/compiler'
import { resolveConfigPath } from '../config/loader'
import type { ResolvedConfig as ResolvedDevflareConfig } from '../config/resolve-phased'
import type { DevflareConfig } from '../config/schema'
import { resolveServiceBindings } from '../test/resolve-service-bindings'
import { DEFAULT_DO_PATTERN } from '../utils/glob'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import {
	type AuxiliaryWorkerConfig,
	type DODiscoveryResult,
	createAuxiliaryWorkerConfig,
	discoverDurableObjects
} from './plugin-durable-objects'
import { createAuxiliaryServiceWorkerConfigs } from './plugin-service-bindings'

const CONFIG_DIR = '.devflare'

export interface ResolvedPluginContextState {
	wranglerConfig: WranglerConfig
	cloudflareConfig: Record<string, unknown>
	auxiliaryWorkerConfig: AuxiliaryWorkerConfig | null
	auxiliaryWorkerConfigs: AuxiliaryWorkerConfig[]
	serviceWorkerVirtualModules: Map<string, string>
	durableObjects: DODiscoveryResult | null
}

function removeDevflareHandledServeBindings(
	config: Record<string, unknown>
): Record<string, unknown> {
	const next = { ...config }

	// Devflare supplies these locally through its own Miniflare gateway and
	// SvelteKit platform shims. Passing them to @cloudflare/vite-plugin in
	// serve mode only produces upstream remote/local-development warnings.
	delete next.workflows
	delete next.media

	return next
}

/**
 * Compile a DevflareConfig into the bundle of artefacts the Vite plugin
 * exposes to consumers (wrangler config, cloudflare-plugin programmatic
 * config, auxiliary DO worker, discovered DOs).
 *
 * Mode discriminator:
 * - `'serve'` — materialize names into stable local identifiers
 *   (miniflare-friendly).
 * - `'build'` — preserve names in the emitted Wrangler artefact so deploy
 *   can later resolve them against the real Cloudflare account.
 */
export async function buildPluginContextState(
	projectRoot: string,
	devflareConfig: DevflareConfig,
	environment?: string,
	mode: 'serve' | 'build' = 'serve',
	configDir: string = projectRoot
): Promise<ResolvedPluginContextState> {
	const resourceResolvedConfig =
		mode === 'build'
			? await resolveResources(devflareConfig, { phase: 'build', environment })
			: await resolveResources(devflareConfig, { phase: 'local', environment })
	const effectiveConfig = await resolveConfigEnvVars(resourceResolvedConfig, {
		cwd: configDir,
		mode: mode === 'build' ? 'build' : 'dev'
	})
	const compiledWranglerConfig =
		mode === 'build'
			? compileBuildConfig(effectiveConfig)
			: compileConfig(effectiveConfig as ResolvedDevflareConfig)
	const wranglerConfig =
		mode === 'build'
			? isolateViteBuildOutputPaths(projectRoot, compiledWranglerConfig)
			: (removeDevflareHandledServeBindings(compiledWranglerConfig) as WranglerConfig)
	const cloudflareConfig = {
		...(mode === 'build'
			? isolateViteBuildOutputPaths(
					projectRoot,
					compileToProgrammaticConfig(effectiveConfig, environment, {
						preserveNamedBindings: true
					}) as WranglerConfig
				)
			: removeDevflareHandledServeBindings(
					compileToProgrammaticConfig(effectiveConfig, environment)
				))
	}
	const composedMainEntry =
		mode === 'build'
			? null
			: await prepareComposedWorkerEntrypoint(projectRoot, effectiveConfig, environment)
	if (composedMainEntry) {
		const relativeMain = relative(projectRoot, composedMainEntry)
		wranglerConfig.main = relativeMain
		cloudflareConfig.main = relativeMain
	}

	let durableObjects: DODiscoveryResult | null = null
	let auxiliaryWorkerConfig: AuxiliaryWorkerConfig | null = null
	let serviceWorkerVirtualModules = new Map<string, string>()
	let serviceAuxiliaryWorkerConfigs: AuxiliaryWorkerConfig[] = []

	const doPatternConfig = effectiveConfig.files?.durableObjects
	const doPattern = typeof doPatternConfig === 'string' ? doPatternConfig : DEFAULT_DO_PATTERN
	if (doPatternConfig !== false) {
		const doWorkerName = `${wranglerConfig.name}-do`
		const discovery = await discoverDurableObjects(projectRoot, doPattern, doWorkerName)

		if (discovery.files.size > 0) {
			durableObjects = discovery

			if (wranglerConfig.durable_objects?.bindings) {
				for (const binding of wranglerConfig.durable_objects.bindings) {
					binding.script_name = doWorkerName
				}
			}
			if (cloudflareConfig.durable_objects) {
				const doConfig = cloudflareConfig.durable_objects as {
					bindings: Array<{ script_name?: string }>
				}
				for (const binding of doConfig.bindings) {
					binding.script_name = doWorkerName
				}
			}

			auxiliaryWorkerConfig = createAuxiliaryWorkerConfig(wranglerConfig, discovery)
		}
	}

	if (mode === 'serve' && effectiveConfig.bindings?.services) {
		const serviceBindingResolution = await resolveServiceBindings(effectiveConfig, configDir)
		const serviceWorkers = createAuxiliaryServiceWorkerConfigs(serviceBindingResolution)
		serviceAuxiliaryWorkerConfigs = serviceWorkers.auxiliaryWorkers
		serviceWorkerVirtualModules = serviceWorkers.virtualModules
	}

	const auxiliaryWorkerConfigs = [
		...(auxiliaryWorkerConfig ? [auxiliaryWorkerConfig] : []),
		...serviceAuxiliaryWorkerConfigs
	]

	return {
		wranglerConfig,
		cloudflareConfig,
		auxiliaryWorkerConfigs,
		serviceWorkerVirtualModules,
		durableObjects,
		auxiliaryWorkerConfig
	}
}

export async function ensureGeneratedConfigDir(projectRoot: string): Promise<string> {
	const configDir = resolve(projectRoot, CONFIG_DIR)
	const fs = await import('node:fs/promises')
	await fs.mkdir(configDir, { recursive: true })

	const gitignorePath = resolve(configDir, '.gitignore')
	try {
		await fs.access(gitignorePath)
	} catch {
		await fs.writeFile(gitignorePath, '*\n', 'utf-8')
	}

	return configDir
}

export async function writeGeneratedWranglerConfig(
	projectRoot: string,
	wranglerConfig: WranglerConfig
): Promise<void> {
	const configDir = await ensureGeneratedConfigDir(projectRoot)
	const wranglerFileConfig = rebaseWranglerConfigPaths(projectRoot, configDir, wranglerConfig)

	await writeWranglerConfig(configDir, wranglerFileConfig, 'wrangler.jsonc')
}

export async function resolvePluginConfigPath(
	projectRoot: string,
	configPath?: string
): Promise<string | null> {
	if (configPath) {
		return isAbsolute(configPath) ? configPath : resolve(projectRoot, configPath)
	}

	return (await resolveConfigPath(projectRoot)) ?? null
}
