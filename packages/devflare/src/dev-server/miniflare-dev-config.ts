// =============================================================================
// Dev Server — Top-level Miniflare config orchestrator
// =============================================================================
// Pure helper extracted from createDevServer().buildMiniflareConfig().
// Composes gateway + main app worker + DO workers + browser-binding worker
// from explicit inputs (no closures), so the multi-worker assembly logic can
// be unit-tested independently of the dev-server lifecycle.
// =============================================================================

import { resolve } from 'pathe'
import type { ConsolaInstance } from 'consola'
import type { DevflareConfig } from '../config'
import { getSingleBrowserBindingName } from '../config/schema'
import type { DOBundleResult } from '../bundler'
import { getBrowserBindingScript } from '../browser-shim/binding-worker'
import type { RouteDiscoveryResult } from '../worker-entry/routes'
import {
	buildQueueConsumers,
	buildQueueProducers,
	buildRateLimitsConfig,
	buildSecretsStoreConfig,
	buildSendEmailConfig,
	buildVersionMetadataConfig,
	buildWorkerLoadersConfig,
	buildMtlsCertificatesConfig,
	buildDispatchNamespacesConfig,
	buildWorkflowsConfig,
	buildPipelinesConfig,
	buildHyperdrivesConfig,
	buildImagesConfig,
	buildMediaConfig,
	buildArtifactsConfig,
	buildAiSearchNamespacesConfig,
	buildAiSearchInstancesConfig
} from './miniflare-bindings'
import { getGatewayScript } from './gateway-script'
import {
	buildServiceBindings,
	makeMiniflareWorker,
	type MakeMiniflareWorkerContext,
	type MiniflareServiceBinding
} from './miniflare-worker-config'
import { hasWorkerSurfacePaths, type WorkerSurfacePaths } from './worker-surface-paths'

const INTERNAL_APP_SERVICE_BINDING = '__DEVFLARE_APP'

export interface BuildMiniflareDevConfigInput {
	config: DevflareConfig
	cwd: string
	miniflarePort: number
	persist: boolean
	enableVite: boolean
	debug: boolean
	mainWorkerSurfacePaths: WorkerSurfacePaths
	mainWorkerRoutes: RouteDiscoveryResult | null
	mainWorkerScriptPath: string | null
	bundledMainWorkerScriptPath: string | null
	browserShimPort: number
	doResult: DOBundleResult | null
	logger?: ConsolaInstance
}

/**
 * Build the complete Miniflare configuration for the dev server.
 *
 * IMPORTANT: When using multi-worker setup, ALL workers must go in the
 * `workers` array. The FIRST worker is the entrypoint and receives all
 * HTTP requests. Top-level script/modules options are NOT used when
 * workers array is present.
 */
export function buildMiniflareDevConfig(input: BuildMiniflareDevConfigInput): any {
	const {
		config: loadedConfig,
		cwd,
		miniflarePort,
		persist,
		enableVite,
		debug,
		mainWorkerSurfacePaths,
		mainWorkerRoutes,
		mainWorkerScriptPath,
		bundledMainWorkerScriptPath,
		browserShimPort,
		doResult,
		logger
	} = input

	const bindings = loadedConfig.bindings ?? {}
	const persistPath = resolve(cwd, '.devflare/data')
	const appWorkerName = loadedConfig.name
	const shouldRunMainWorker = !enableVite && (
		hasWorkerSurfacePaths(mainWorkerSurfacePaths)
		|| Boolean(mainWorkerRoutes?.routes.length)
	)
	const queueProducers = buildQueueProducers(bindings)
	const queueConsumers = buildQueueConsumers(bindings)

	const sharedOptions: any = {
		port: miniflarePort,
		host: '127.0.0.1',
		kvPersist: persist ? `${persistPath}/kv` : undefined,
		r2Persist: persist ? `${persistPath}/r2` : undefined,
		d1Persist: persist ? `${persistPath}/d1` : undefined,
		durableObjectsPersist: persist ? `${persistPath}/do` : undefined,
		workflowsPersist: persist ? `${persistPath}/workflows` : undefined,
		imagesPersist: persist ? `${persistPath}/images` : undefined
	}

	const createServiceBindings = (
		extraBindings: Record<string, MiniflareServiceBinding> = {}
	) => buildServiceBindings(bindings, extraBindings)

	const sendEmailConfig = buildSendEmailConfig(bindings)
	const rateLimitsConfig = buildRateLimitsConfig(bindings)
	const versionMetadataConfig = buildVersionMetadataConfig(bindings)
	const workerLoadersConfig = buildWorkerLoadersConfig(bindings)
	const mtlsCertificatesConfig = buildMtlsCertificatesConfig(bindings)
	const dispatchNamespacesConfig = buildDispatchNamespacesConfig(bindings)
	const workflowsConfig = buildWorkflowsConfig(bindings)
	const pipelinesConfig = buildPipelinesConfig(bindings)
	const hyperdrivesConfig = buildHyperdrivesConfig(bindings)
	const imagesConfig = buildImagesConfig(bindings)
	const mediaConfig = buildMediaConfig(bindings)
	const artifactsConfig = buildArtifactsConfig(bindings)
	const aiSearchNamespacesConfig = buildAiSearchNamespacesConfig(bindings)
	const aiSearchInstancesConfig = buildAiSearchInstancesConfig(bindings)
	const secretsStoreConfig = buildSecretsStoreConfig(bindings)

	const workerContext: MakeMiniflareWorkerContext = {
		cwd,
		loadedConfig,
		bindings,
		sendEmailConfig,
		rateLimitsConfig,
		versionMetadataConfig,
		workerLoadersConfig,
		mtlsCertificatesConfig,
		dispatchNamespacesConfig,
		workflowsConfig,
		pipelinesConfig,
		hyperdrivesConfig,
		imagesConfig,
		mediaConfig,
		artifactsConfig,
		aiSearchNamespacesConfig,
		aiSearchInstancesConfig,
		secretsStoreConfig,
		queueProducers
	}

	const createWorkerConfig = (options: Parameters<typeof makeMiniflareWorker>[1]) =>
		makeMiniflareWorker(workerContext, options)

	const gatewayWorker = createWorkerConfig({
		name: 'gateway',
		script: getGatewayScript(
			loadedConfig.wsRoutes,
			debug,
			shouldRunMainWorker ? INTERNAL_APP_SERVICE_BINDING : null
		),
		serviceBindings: shouldRunMainWorker
			? createServiceBindings({
				[INTERNAL_APP_SERVICE_BINDING]: { name: appWorkerName }
			})
			: createServiceBindings()
	})
	gatewayWorker.routes = ['*']

	const hasDurableObjectBundles = !!doResult && doResult.bundles.size > 0
	const browserBindingName = getSingleBrowserBindingName(bindings.browser)
	const needsBrowserWorker = Boolean(browserBindingName && (hasDurableObjectBundles || shouldRunMainWorker))

	const workers: any[] = []
	const durableObjects: Record<string, { className: string; scriptName: string }> = {}

	const browserShimUrl = `http://127.0.0.1:${browserShimPort}`
	const browserWorkerName = 'browser-binding'

	if (shouldRunMainWorker && mainWorkerScriptPath) {
		const mainWorkerServiceBindings = createServiceBindings(
			browserBindingName
				? {
					[browserBindingName]: { name: browserWorkerName }
				}
				: {}
		)

		const mainWorkerConfig = createWorkerConfig({
			name: appWorkerName,
			scriptPath: bundledMainWorkerScriptPath ?? mainWorkerScriptPath,
			serviceBindings: mainWorkerServiceBindings,
			queueConsumers,
			triggers: loadedConfig.triggers?.crons?.length
				? { crons: loadedConfig.triggers.crons }
				: undefined
		})

		workers.push(mainWorkerConfig)
	}

	if (doResult) {
		for (const [bindingName, bundlePath] of doResult.bundles) {
			const className = doResult.classes.get(bindingName)
			if (!className) continue

			const workerName = `do-${bindingName.toLowerCase()}`

			const workerConfig = createWorkerConfig({
				name: workerName,
				scriptPath: bundlePath,
				durableObjects: {
					[bindingName]: className
				},
				serviceBindings: createServiceBindings(
					browserBindingName
						? {
							[browserBindingName]: { name: browserWorkerName }
						}
						: {}
				)
			})

			if (browserBindingName) {
				logger?.debug(`DO ${workerName} has browser service binding: ${browserBindingName} → ${browserWorkerName}`)
			}

			logger?.debug(`DO ${workerName} config:`, JSON.stringify(workerConfig, null, 2))
			workers.push(workerConfig)

			durableObjects[bindingName] = {
				className,
				scriptName: workerName
			}
		}
	}

	if (needsBrowserWorker) {
		const browserWorker = createWorkerConfig({
			name: browserWorkerName,
			script: getBrowserBindingScript(browserShimUrl, debug)
		})
		workers.push(browserWorker)
		logger?.info(`Browser binding worker configured: ${browserBindingName} → ${browserShimUrl}`)
	}

	if (Object.keys(durableObjects).length > 0) {
		gatewayWorker.durableObjects = durableObjects

		if (shouldRunMainWorker) {
			const mainWorker = workers.find((worker) => worker.name === appWorkerName)
			if (mainWorker) {
				mainWorker.durableObjects = durableObjects
			}
		}
	}

	return {
		...sharedOptions,
		workers: [gatewayWorker, ...workers]
	}
}
