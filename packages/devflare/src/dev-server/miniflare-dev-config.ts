// =============================================================================
// Dev Server — Top-level Miniflare config orchestrator
// =============================================================================
// Pure helper extracted from createDevServer().buildMiniflareConfig().
// Composes gateway + main app worker + DO workers + browser-binding worker
// from explicit inputs (no closures), so the multi-worker assembly logic can
// be unit-tested independently of the dev-server lifecycle.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import { resolve } from 'pathe'
import { getBrowserBindingScript } from '../browser-shim/binding-worker'
import type { DOBundleResult } from '../bundler'
import type { DevflareConfig } from '../config'
import { getSingleBrowserBindingName } from '../config/schema'
import { buildLocalSecretWrappedBindingConfig } from '../secrets/local-secrets'
import { buildLocalBindingShimServiceConfig } from '../shims/local-media-bindings'
import type { resolveServiceBindings } from '../test/resolve-service-bindings'
import type { RouteDiscoveryResult } from '../worker-entry/routes'
import { getGatewayScript } from './gateway-script'
import {
	buildAiSearchInstancesConfig,
	buildAiSearchNamespacesConfig,
	buildAnalyticsEngineConfig,
	buildArtifactsConfig,
	buildDispatchNamespacesConfig,
	buildFlagshipConfig,
	buildHyperdrivesConfig,
	buildImagesConfig,
	buildMediaConfig,
	buildMtlsCertificatesConfig,
	buildPipelinesConfig,
	buildQueueConsumers,
	buildQueueProducers,
	buildRateLimitsConfig,
	buildSecretsStoreConfig,
	buildSendEmailConfig,
	buildStreamConfig,
	buildStreamingTailConsumersConfig,
	buildTailConsumersConfig,
	buildVersionMetadataConfig,
	buildWorkerLoadersConfig,
	buildWorkflowsConfig
} from './miniflare-bindings'
import {
	type MakeMiniflareWorkerContext,
	type MiniflareServiceBinding,
	buildServiceBindings,
	makeMiniflareWorker
} from './miniflare-worker-config'
import { type WorkerSurfacePaths, hasWorkerSurfacePaths } from './worker-surface-paths'

const INTERNAL_APP_SERVICE_BINDING = '__DEVFLARE_APP'
type ServiceBindingResolution = Awaited<ReturnType<typeof resolveServiceBindings>>

export interface BuildMiniflareDevConfigInput {
	config: DevflareConfig
	cwd: string
	miniflarePort: number
	miniflareHost?: string
	persist: boolean
	enableVite: boolean
	debug: boolean
	mainWorkerSurfacePaths: WorkerSurfacePaths
	mainWorkerRoutes: RouteDiscoveryResult | null
	mainWorkerScriptPath: string | null
	bundledMainWorkerScriptPath: string | null
	workflowEntrypointScript: string
	browserShimPort: number
	doResult: DOBundleResult | null
	serviceBindingResolution?: ServiceBindingResolution | null
	/**
	 * Per-boot HMAC secret for the local R2 presign endpoint. Injected (with
	 * the gateway origin) as `DEVFLARE_R2_PRESIGN_*` vars into every worker
	 * when the config declares R2 bindings; ignored otherwise.
	 */
	r2PresignSecret?: string | null
	logger?: ConsolaInstance
}

/**
 * Resolve the browser-facing origin of the local dev runtime, used inside
 * locally-presigned R2 URLs. Honors `server.publicUrl` (reverse proxy /
 * tunnel setups); otherwise derives `http(s)://<host>:<port>` from the
 * Miniflare listen address, normalizing wildcard hosts to `localhost`.
 */
export function resolveR2PresignOrigin(
	serverConfig: DevflareConfig['server'],
	miniflareHost: string,
	miniflarePort: number
): string {
	if (serverConfig?.publicUrl) {
		return serverConfig.publicUrl.replace(/\/$/, '')
	}
	const protocol = serverConfig?.https ? 'https' : 'http'
	const host = miniflareHost === '0.0.0.0' || miniflareHost === '::' ? 'localhost' : miniflareHost
	return `${protocol}://${host}:${miniflarePort}`
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
		miniflareHost = '127.0.0.1',
		persist,
		enableVite,
		debug,
		mainWorkerSurfacePaths,
		mainWorkerRoutes,
		mainWorkerScriptPath,
		bundledMainWorkerScriptPath,
		workflowEntrypointScript,
		browserShimPort,
		doResult,
		serviceBindingResolution,
		r2PresignSecret,
		logger
	} = input

	const bindings = loadedConfig.bindings ?? {}
	const persistPath = resolve(cwd, '.devflare/data')
	const appWorkerName = loadedConfig.name
	const shouldRunMainWorker =
		!enableVite &&
		(hasWorkerSurfacePaths(mainWorkerSurfacePaths) || Boolean(mainWorkerRoutes?.routes.length))
	const queueProducers = buildQueueProducers(bindings)
	const queueConsumers = buildQueueConsumers(bindings)

	const serverConfig = loadedConfig.server
	const sharedOptions: any = {
		port: miniflarePort,
		host: miniflareHost,
		kvPersist: persist ? `${persistPath}/kv` : undefined,
		r2Persist: persist ? `${persistPath}/r2` : undefined,
		d1Persist: persist ? `${persistPath}/d1` : undefined,
		cachePersist: persist ? `${persistPath}/cache` : undefined,
		durableObjectsPersist: persist ? `${persistPath}/do` : undefined,
		workflowsPersist: persist ? `${persistPath}/workflows` : undefined,
		imagesPersist: persist ? `${persistPath}/images` : undefined,
		streamPersist: persist ? `${persistPath}/stream` : undefined,
		...(serverConfig?.https !== undefined && { https: serverConfig.https }),
		...(serverConfig?.httpsKeyPath !== undefined && { httpsKeyPath: serverConfig.httpsKeyPath }),
		...(serverConfig?.httpsCertPath !== undefined && {
			httpsCertPath: serverConfig.httpsCertPath
		}),
		...(serverConfig?.inspectorPort !== undefined && {
			inspectorPort: serverConfig.inspectorPort
		}),
		...(serverConfig?.inspectorHost !== undefined && {
			inspectorHost: serverConfig.inspectorHost
		}),
		...(serverConfig?.upstream !== undefined && { upstream: serverConfig.upstream }),
		...(serverConfig?.liveReload !== undefined && { liveReload: serverConfig.liveReload }),
		...(serverConfig?.verbose !== undefined && { verbose: serverConfig.verbose }),
		...(serverConfig?.logRequests !== undefined && { logRequests: serverConfig.logRequests }),
		...(serverConfig?.cf !== undefined && { cf: serverConfig.cf }),
		...(serverConfig?.publicUrl !== undefined && { publicUrl: serverConfig.publicUrl })
	}

	const localBindingShimServiceConfig = buildLocalBindingShimServiceConfig(loadedConfig)
	const createServiceBindings = (extraBindings: Record<string, MiniflareServiceBinding> = {}) =>
		buildServiceBindings(bindings, {
			...(serviceBindingResolution?.primaryServiceBindings ?? {}),
			...localBindingShimServiceConfig.serviceBindings,
			...extraBindings
		})

	const sendEmailConfig = buildSendEmailConfig(bindings)
	const rateLimitsConfig = buildRateLimitsConfig(bindings)
	const versionMetadataConfig = buildVersionMetadataConfig(bindings)
	const workerLoadersConfig = buildWorkerLoadersConfig(bindings)
	const mtlsCertificatesConfig = buildMtlsCertificatesConfig(bindings)
	const dispatchNamespacesConfig = buildDispatchNamespacesConfig(bindings)
	const workflowsConfig = buildWorkflowsConfig(bindings)
	const pipelinesConfig = buildPipelinesConfig(bindings)
	const hyperdrivesConfig = buildHyperdrivesConfig(bindings)
	const imagesConfig = bindings.images ? undefined : buildImagesConfig(bindings)
	const mediaConfig = bindings.media ? undefined : buildMediaConfig(bindings)
	const streamConfig = buildStreamConfig(bindings)
	const flagshipConfig = buildFlagshipConfig(bindings)
	const analyticsEngineConfig = buildAnalyticsEngineConfig(bindings)
	const tailConsumersConfig = buildTailConsumersConfig(loadedConfig)
	const streamingTailConsumersConfig = buildStreamingTailConsumersConfig(loadedConfig)
	const artifactsConfig = buildArtifactsConfig(bindings)
	const aiSearchNamespacesConfig = buildAiSearchNamespacesConfig(bindings)
	const aiSearchInstancesConfig = buildAiSearchInstancesConfig(bindings)
	const localSecretWrappedBindingConfig = buildLocalSecretWrappedBindingConfig(loadedConfig, cwd)
	const localSecretBindingNames = new Set(localSecretWrappedBindingConfig.localBindingNames)
	const secretsStoreConfig = buildSecretsStoreConfig(
		bindings,
		loadedConfig.secretsStoreId,
		localSecretBindingNames
	)

	// Local R2 presign vars ride on every worker so both the gateway (validator)
	// and worker-mode app code (URL minting) share the per-boot secret.
	const injectedVars =
		bindings.r2 && r2PresignSecret
			? {
					DEVFLARE_R2_PRESIGN_SECRET: r2PresignSecret,
					DEVFLARE_R2_PRESIGN_ORIGIN: resolveR2PresignOrigin(
						serverConfig,
						miniflareHost,
						miniflarePort
					)
				}
			: undefined

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
		streamConfig,
		flagshipConfig,
		analyticsEngineConfig,
		tailConsumersConfig,
		streamingTailConsumersConfig,
		artifactsConfig,
		aiSearchNamespacesConfig,
		aiSearchInstancesConfig,
		secretsStoreConfig,
		localSecretWrappedBindingConfig,
		queueProducers,
		injectedVars
	}

	const createWorkerConfig = (options: Parameters<typeof makeMiniflareWorker>[1]) =>
		makeMiniflareWorker(workerContext, options)

	const gatewayWorker = createWorkerConfig({
		name: 'gateway',
		script: [
			workflowEntrypointScript,
			getGatewayScript(
				loadedConfig.wsRoutes,
				debug,
				shouldRunMainWorker ? INTERNAL_APP_SERVICE_BINDING : null
			)
		]
			.filter(Boolean)
			.join('\n\n'),
		serviceBindings: shouldRunMainWorker
			? createServiceBindings({
					[INTERNAL_APP_SERVICE_BINDING]: { name: appWorkerName }
				})
			: createServiceBindings()
	})
	gatewayWorker.routes = ['*']

	const hasDurableObjectBundles = !!doResult && doResult.bundles.size > 0
	const browserBindingName = getSingleBrowserBindingName(bindings.browser)
	const needsBrowserWorker = Boolean(
		browserBindingName && (hasDurableObjectBundles || shouldRunMainWorker)
	)

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
				logger?.debug(
					`DO ${workerName} has browser service binding: ${browserBindingName} → ${browserWorkerName}`
				)
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
		workers: [
			gatewayWorker,
			...workers,
			...(serviceBindingResolution?.workers ?? []),
			...localSecretWrappedBindingConfig.workers,
			...localBindingShimServiceConfig.workers
		]
	}
}
