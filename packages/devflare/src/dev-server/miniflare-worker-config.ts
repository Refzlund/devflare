// =============================================================================
// Dev Server — Miniflare worker-config builders
// =============================================================================
// Pure helpers extracted from createDevServer().buildMiniflareConfig().
// Make these explicit-input so they can be unit-tested without spinning up
// the full dev server.
// =============================================================================

import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { getLocalD1DatabaseIdentifier, getLocalKVNamespaceIdentifier } from '../config/schema'
import type {
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

type Bindings = NonNullable<DevflareConfig['bindings']>
type SendEmailConfig = ReturnType<typeof buildSendEmailConfig>
type RateLimitsConfig = ReturnType<typeof buildRateLimitsConfig>
type VersionMetadataConfig = ReturnType<typeof buildVersionMetadataConfig>
type WorkerLoadersConfig = ReturnType<typeof buildWorkerLoadersConfig>
type MtlsCertificatesConfig = ReturnType<typeof buildMtlsCertificatesConfig>
type DispatchNamespacesConfig = ReturnType<typeof buildDispatchNamespacesConfig>
type WorkflowsConfig = ReturnType<typeof buildWorkflowsConfig>
type PipelinesConfig = ReturnType<typeof buildPipelinesConfig>
type HyperdrivesConfig = ReturnType<typeof buildHyperdrivesConfig>
type ImagesConfig = ReturnType<typeof buildImagesConfig>
type MediaConfig = ReturnType<typeof buildMediaConfig>
type ArtifactsConfig = ReturnType<typeof buildArtifactsConfig>
type AiSearchNamespacesConfig = ReturnType<typeof buildAiSearchNamespacesConfig>
type AiSearchInstancesConfig = ReturnType<typeof buildAiSearchInstancesConfig>
type SecretsStoreConfig = ReturnType<typeof buildSecretsStoreConfig>
type ModuleRule = NonNullable<DevflareConfig['rules']>[number]

export type MiniflareServiceBinding = { name: string; entrypoint?: string }

const DEFAULT_MODULE_RULES = [
	{ type: 'ESModule', include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.mjs'] },
	{ type: 'CommonJS', include: ['**/*.js', '**/*.cjs'] },
	{ type: 'ESModule', include: ['**/*.jsx'] }
] as const

function toMiniflareModuleRule(rule: ModuleRule): {
	type: ModuleRule['type']
	include: string[]
	fallthrough?: boolean
} {
	return {
		type: rule.type,
		include: rule.globs,
		...(rule.fallthrough !== undefined && { fallthrough: rule.fallthrough })
	}
}

/**
 * Build the per-worker `serviceBindings` map. Combines user-declared
 * `bindings.services` (config) with any extra bindings the caller wants to
 * inject (e.g. internal gateway -> app routing).
 */
export function buildServiceBindings(
	bindings: Bindings,
	extraBindings: Record<string, MiniflareServiceBinding> = {}
): Record<string, MiniflareServiceBinding> | undefined {
	const serviceBindings: Record<string, MiniflareServiceBinding> = {}

	if (bindings.services) {
		for (const [bindingName, serviceConfig] of Object.entries(bindings.services)) {
			serviceBindings[bindingName] = {
				name: serviceConfig.service,
				...(serviceConfig.entrypoint && { entrypoint: serviceConfig.entrypoint })
			}
		}
	}

	for (const [bindingName, target] of Object.entries(extraBindings)) {
		serviceBindings[bindingName] = target
	}

	return Object.keys(serviceBindings).length > 0 ? serviceBindings : undefined
}

export interface MakeMiniflareWorkerOptions {
	name: string
	script?: string
	scriptPath?: string
	durableObjects?: Record<string, string | { className: string; scriptName: string }>
	serviceBindings?: Record<string, MiniflareServiceBinding>
	queueConsumers?: Record<string, Record<string, unknown>>
	triggers?: { crons?: string[] }
}

export interface MakeMiniflareWorkerContext {
	cwd: string
	loadedConfig: DevflareConfig
	bindings: Bindings
	sendEmailConfig: SendEmailConfig
	rateLimitsConfig: RateLimitsConfig
	versionMetadataConfig: VersionMetadataConfig
	workerLoadersConfig: WorkerLoadersConfig
	mtlsCertificatesConfig: MtlsCertificatesConfig
	dispatchNamespacesConfig: DispatchNamespacesConfig
	workflowsConfig: WorkflowsConfig
	pipelinesConfig: PipelinesConfig
	hyperdrivesConfig: HyperdrivesConfig
	imagesConfig: ImagesConfig
	mediaConfig: MediaConfig
	artifactsConfig: ArtifactsConfig
	aiSearchNamespacesConfig: AiSearchNamespacesConfig
	aiSearchInstancesConfig: AiSearchInstancesConfig
	secretsStoreConfig: SecretsStoreConfig
	queueProducers: Record<string, { queueName: string }> | undefined
}

/**
 * Build a single worker config object for Miniflare's `workers` array.
 * All inputs are passed explicitly (no closures over the caller's locals).
 */
export function makeMiniflareWorker(
	context: MakeMiniflareWorkerContext,
	options: MakeMiniflareWorkerOptions
): any {
	const {
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
	} = context

	const baseFlags = loadedConfig.compatibilityFlags ?? []
	const compatFlags = baseFlags.includes('nodejs_compat')
		? baseFlags
		: [...baseFlags, 'nodejs_compat']
	const workerBindings: Record<string, unknown> = loadedConfig.vars ?? {}

	const workerConfig: any = {
		name: options.name,
		modules: true,
		compatibilityDate: loadedConfig.compatibilityDate,
		compatibilityFlags: compatFlags,
		...(bindings.kv && {
			kvNamespaces: Object.fromEntries(
				Object.entries(bindings.kv).map(([bindingName, bindingConfig]) => {
					return [bindingName, getLocalKVNamespaceIdentifier(bindingConfig)]
				})
			)
		}),
		...(bindings.r2 && { r2Buckets: bindings.r2 }),
		...(bindings.d1 && {
			d1Databases: Object.fromEntries(
				Object.entries(bindings.d1).map(([bindingName, bindingConfig]) => {
					return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
				})
			)
		}),
		...(Object.keys(workerBindings).length > 0 && { bindings: workerBindings }),
		...(sendEmailConfig && { email: sendEmailConfig }),
		...(rateLimitsConfig && { ratelimits: rateLimitsConfig }),
		...(versionMetadataConfig && { versionMetadata: versionMetadataConfig }),
		...(workerLoadersConfig && { workerLoaders: workerLoadersConfig }),
		...(mtlsCertificatesConfig && { mtlsCertificates: mtlsCertificatesConfig }),
		...(dispatchNamespacesConfig && { dispatchNamespaces: dispatchNamespacesConfig }),
		...(workflowsConfig && { workflows: workflowsConfig }),
		...(pipelinesConfig && { pipelines: pipelinesConfig }),
		...(hyperdrivesConfig && { hyperdrives: hyperdrivesConfig }),
		...(imagesConfig && { images: imagesConfig }),
		...(mediaConfig && { media: mediaConfig }),
		...(artifactsConfig && { artifacts: artifactsConfig }),
		...(aiSearchNamespacesConfig && { aiSearchNamespaces: aiSearchNamespacesConfig }),
		...(aiSearchInstancesConfig && { aiSearchInstances: aiSearchInstancesConfig }),
		...(secretsStoreConfig && { secretsStoreSecrets: secretsStoreConfig }),
		...(queueProducers && { queueProducers }),
		...(options.queueConsumers && { queueConsumers: options.queueConsumers }),
		...(options.triggers && { triggers: options.triggers })
	}

	if (options.scriptPath) {
		workerConfig.scriptPath = options.scriptPath
		workerConfig.modulesRoot = loadedConfig.baseDir
			? resolve(cwd, loadedConfig.baseDir)
			: cwd
		workerConfig.modulesRules = [
			...(loadedConfig.rules?.map(toMiniflareModuleRule) ?? []),
			...DEFAULT_MODULE_RULES
		]
	}

	if (options.script) {
		workerConfig.script = options.script
	}

	if (options.durableObjects && Object.keys(options.durableObjects).length > 0) {
		workerConfig.durableObjects = options.durableObjects
	}

	if (options.serviceBindings && Object.keys(options.serviceBindings).length > 0) {
		workerConfig.serviceBindings = options.serviceBindings
	}

	return workerConfig
}
