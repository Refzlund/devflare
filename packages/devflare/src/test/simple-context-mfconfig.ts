// =============================================================================
// Test-context inline-bridge Miniflare config builder
// =============================================================================
// Translates the user's `config.bindings` (KV / R2 / D1 / queues / send_email)
// and `config.vars` into the seed `mfConfig` object that the bridge gateway
// script will run as a single worker. This is the "single-worker" baseline;
// `applyMultiWorkerConfig` rewrites it in place when cross-worker bindings
// are detected.
// =============================================================================

import {
	getLocalD1DatabaseIdentifier,
	normalizeArtifactsBinding,
	normalizeDispatchNamespaceBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeMtlsCertificateBinding,
	normalizePipelineBinding,
	normalizeQueueProducer,
	normalizeSecretsStoreBinding,
	normalizeWorkflowBinding
} from '../config'
import type { DevflareConfig } from '../config'
import {
	buildAnalyticsEngineConfig,
	buildHyperdrivesConfig,
	buildTailConsumersConfig
} from '../dev-server/miniflare-bindings'
import { buildLocalSecretWrappedBindingConfig } from '../secrets/local-secrets'
import { buildLocalBindingShimServiceConfig } from '../shims/local-media-bindings'

export interface BuildInlineBridgeMfConfigOptions {
	cwd?: string
}

/**
 * Build the seed Miniflare config for an inline (single-worker) bridge.
 * Pure: no I/O, no closures.
 */
export function buildInlineBridgeMfConfig(
	config: DevflareConfig,
	options: BuildInlineBridgeMfConfigOptions = {}
): any {
	const localWorkerBindings: Record<string, unknown> = config.vars ?? {}
	const localSecretWrappedBindingConfig = options.cwd
		? buildLocalSecretWrappedBindingConfig(config, options.cwd)
		: undefined
	const localBindingShimServiceConfig = buildLocalBindingShimServiceConfig(config)
	const localSecretBindingNames = new Set(localSecretWrappedBindingConfig?.localBindingNames ?? [])
	const mfConfig: any = {
		modules: true,
		compatibilityDate: config.compatibilityDate ?? '2025-01-01',
		...(config.compatibilityFlags && { compatibilityFlags: config.compatibilityFlags })
	}

	if (config.bindings?.kv) {
		mfConfig.kvNamespaces = Object.keys(config.bindings.kv)
	}
	if (config.bindings?.r2) {
		mfConfig.r2Buckets = Object.keys(config.bindings.r2)
	}
	if (config.bindings?.d1) {
		mfConfig.d1Databases = Object.fromEntries(
			Object.entries(config.bindings.d1).map(([bindingName, bindingConfig]) => {
				return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
			})
		)
	}
	const hyperdrivesConfig = buildHyperdrivesConfig(config.bindings ?? {})
	if (hyperdrivesConfig) {
		mfConfig.hyperdrives = hyperdrivesConfig
	}

	if (config.bindings?.queues?.producers) {
		const queueProducers: Record<string, { queueName: string }> = {}
		for (const [bindingName, producer] of Object.entries(config.bindings.queues.producers)) {
			queueProducers[bindingName] = { queueName: normalizeQueueProducer(producer).queue }
		}
		mfConfig.queueProducers = queueProducers
	}

	if (config.bindings?.rateLimits) {
		mfConfig.ratelimits = Object.fromEntries(
			Object.entries(config.bindings.rateLimits).map(([bindingName, binding]) => [
				bindingName,
				{
					simple: {
						limit: binding.simple.limit,
						period: binding.simple.period
					}
				}
			])
		)
	}

	if (config.bindings?.versionMetadata) {
		mfConfig.versionMetadata = config.bindings.versionMetadata.binding
	}

	if (config.bindings?.workerLoaders) {
		mfConfig.workerLoaders = Object.fromEntries(
			Object.keys(config.bindings.workerLoaders).map((bindingName) => [bindingName, {}])
		)
	}

	if (config.bindings?.mtlsCertificates) {
		mfConfig.mtlsCertificates = Object.fromEntries(
			Object.entries(config.bindings.mtlsCertificates).map(([bindingName, binding]) => {
				const normalized = normalizeMtlsCertificateBinding(binding)
				return [
					bindingName,
					{
						certificate_id: normalized.certificateId,
						...(normalized.remote !== undefined && { remote: normalized.remote })
					}
				]
			})
		)
	}

	if (config.bindings?.dispatchNamespaces) {
		mfConfig.dispatchNamespaces = Object.fromEntries(
			Object.entries(config.bindings.dispatchNamespaces).map(([bindingName, binding]) => {
				const normalized = normalizeDispatchNamespaceBinding(binding)
				return [
					bindingName,
					{
						namespace: normalized.namespace
					}
				]
			})
		)
	}

	if (config.bindings?.workflows) {
		mfConfig.workflows = Object.fromEntries(
			Object.entries(config.bindings.workflows).map(([bindingName, binding]) => {
				const normalized = normalizeWorkflowBinding(binding)
				return [
					bindingName,
					{
						name: normalized.name,
						className: normalized.className,
						...(normalized.scriptName && { scriptName: normalized.scriptName }),
						...(normalized.limits && { stepLimit: normalized.limits.steps })
					}
				]
			})
		)
	}

	if (config.bindings?.pipelines) {
		mfConfig.pipelines = Object.fromEntries(
			Object.entries(config.bindings.pipelines).map(([bindingName, binding]) => {
				const normalized = normalizePipelineBinding(binding)
				return [
					bindingName,
					typeof binding === 'string' ? normalized.pipeline : { pipeline: normalized.pipeline }
				]
			})
		)
	}

	if (config.bindings?.images && localBindingShimServiceConfig.localBindingNames.length === 0) {
		const [entry] = Object.entries(config.bindings.images)
		if (entry) {
			const [bindingName, binding] = entry
			const normalized = normalizeImagesBinding(bindingName, binding)
			mfConfig.images = {
				binding: normalized.binding
			}
		}
	}

	if (config.bindings?.media && localBindingShimServiceConfig.localBindingNames.length === 0) {
		const [entry] = Object.entries(config.bindings.media)
		if (entry) {
			const [bindingName, binding] = entry
			const normalized = normalizeMediaBinding(bindingName, binding)
			mfConfig.media = {
				binding: normalized.binding
			}
		}
	}

	const analyticsEngineConfig = buildAnalyticsEngineConfig(config.bindings ?? {})
	if (analyticsEngineConfig) {
		mfConfig.analyticsEngineDatasets = analyticsEngineConfig
	}

	const tailConsumersConfig = buildTailConsumersConfig(config)
	if (tailConsumersConfig) {
		mfConfig.tails = tailConsumersConfig
	}

	if (config.bindings?.artifacts) {
		mfConfig.artifacts = Object.fromEntries(
			Object.entries(config.bindings.artifacts).map(([bindingName, binding]) => {
				const normalized = normalizeArtifactsBinding(binding)
				return [
					bindingName,
					{
						namespace: normalized.namespace
					}
				]
			})
		)
	}

	if (config.bindings?.aiSearchNamespaces) {
		mfConfig.aiSearchNamespaces = Object.fromEntries(
			Object.entries(config.bindings.aiSearchNamespaces).map(([bindingName, binding]) => [
				bindingName,
				{
					namespace: binding.namespace
				}
			])
		)
	}

	if (config.bindings?.aiSearch) {
		mfConfig.aiSearchInstances = Object.fromEntries(
			Object.entries(config.bindings.aiSearch).map(([bindingName, binding]) => [
				bindingName,
				{
					instance_name: binding.instanceName
				}
			])
		)
	}

	if (config.bindings?.secretsStore) {
		const secretsStoreEntries = Object.entries(config.bindings.secretsStore).flatMap(
			([bindingName, binding]) => {
				if (localSecretBindingNames.has(bindingName)) {
					return []
				}

				const normalized = normalizeSecretsStoreBinding(binding, config.secretsStoreId, bindingName)
				return [
					[
						bindingName,
						{
							store_id: normalized.storeId,
							secret_name: normalized.secretName
						}
					]
				]
			}
		)

		if (secretsStoreEntries.length > 0) {
			mfConfig.secretsStoreSecrets = Object.fromEntries(secretsStoreEntries)
		}
	}

	const wrappedBindings = {
		...(localSecretWrappedBindingConfig?.wrappedBindings ?? {})
	}
	const localBindingWorkers = [
		...(localSecretWrappedBindingConfig?.workers ?? []),
		...localBindingShimServiceConfig.workers
	]

	if (Object.keys(wrappedBindings).length > 0) {
		mfConfig.wrappedBindings = wrappedBindings
	}

	if (localBindingShimServiceConfig.localBindingNames.length > 0) {
		mfConfig.serviceBindings = {
			...(mfConfig.serviceBindings ?? {}),
			...localBindingShimServiceConfig.serviceBindings
		}
	}

	if (localBindingWorkers.length > 0) {
		mfConfig.__devflareLocalBindingWorkers = localBindingWorkers
	}

	if (Object.keys(localWorkerBindings).length > 0) {
		mfConfig.bindings = localWorkerBindings
	}

	if (config.bindings?.sendEmail) {
		mfConfig.email = {
			send_email: Object.entries(config.bindings.sendEmail).map(([name, binding]) => ({
				name,
				...(binding.destinationAddress && {
					destination_address: binding.destinationAddress
				}),
				...(binding.allowedDestinationAddresses && {
					allowed_destination_addresses: binding.allowedDestinationAddresses
				}),
				...(binding.allowedSenderAddresses && {
					allowed_sender_addresses: binding.allowedSenderAddresses
				})
			}))
		}
	}

	return mfConfig
}
