// =============================================================================
// Dev server — pure binding-config translators
// =============================================================================
// Translates `DevflareConfig.bindings.queues` and `bindings.sendEmail` into
// the shapes Miniflare expects. Extracted from the long buildMiniflareConfig
// closure in server.ts so the translations are independently testable and the
// main dev-server file is easier to read.
// =============================================================================

import {
	normalizeArtifactsBinding,
	normalizeDispatchNamespaceBinding,
	normalizeHyperdriveBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeMtlsCertificateBinding,
	normalizePipelineBinding,
	normalizeSecretsStoreBinding,
	normalizeWorkflowBinding,
	type DevflareConfig
} from '../config'

type Bindings = NonNullable<DevflareConfig['bindings']>

export function buildQueueProducers(
	bindings: Bindings
): Record<string, { queueName: string }> | undefined {
	if (!bindings.queues?.producers) {
		return undefined
	}

	const producers: Record<string, { queueName: string }> = {}
	for (const [bindingName, queueName] of Object.entries(bindings.queues.producers)) {
		producers[bindingName] = { queueName }
	}

	return producers
}

export function buildQueueConsumers(
	bindings: Bindings
): Record<string, Record<string, unknown>> | undefined {
	if (!bindings.queues?.consumers || bindings.queues.consumers.length === 0) {
		return undefined
	}

	const consumers: Record<string, Record<string, unknown>> = {}
	for (const consumer of bindings.queues.consumers) {
		consumers[consumer.queue] = {
			...(consumer.maxBatchSize !== undefined && { maxBatchSize: consumer.maxBatchSize }),
			...(consumer.maxBatchTimeout !== undefined && { maxBatchTimeout: consumer.maxBatchTimeout }),
			...(consumer.maxRetries !== undefined && { maxRetries: consumer.maxRetries }),
			...(consumer.deadLetterQueue && { deadLetterQueue: consumer.deadLetterQueue }),
			...(consumer.maxConcurrency !== undefined && { maxConcurrency: consumer.maxConcurrency }),
			...(consumer.retryDelay !== undefined && { retryDelay: consumer.retryDelay })
		}
	}

	return consumers
}

export function buildRateLimitsConfig(
	bindings: Bindings
): Record<string, { simple: { limit: number; period: 10 | 60 } }> | undefined {
	if (!bindings.rateLimits) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.rateLimits).map(([name, binding]) => [
			name,
			{
				simple: {
					limit: binding.simple.limit,
					period: binding.simple.period
				}
			}
		])
	)
}

export function buildVersionMetadataConfig(
	bindings: Bindings
): string | undefined {
	return bindings.versionMetadata?.binding
}

export function buildWorkerLoadersConfig(
	bindings: Bindings
): Record<string, Record<string, never>> | undefined {
	if (!bindings.workerLoaders) {
		return undefined
	}

	return Object.fromEntries(
		Object.keys(bindings.workerLoaders).map((bindingName) => [bindingName, {}])
	)
}

export function buildMtlsCertificatesConfig(
	bindings: Bindings
): Record<string, { certificate_id: string }> | undefined {
	if (!bindings.mtlsCertificates) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.mtlsCertificates).map(([bindingName, binding]) => {
			const normalized = normalizeMtlsCertificateBinding(binding)
			return [
				bindingName,
				{
					certificate_id: normalized.certificateId
				}
			]
		})
	)
}

export function buildDispatchNamespacesConfig(
	bindings: Bindings
): Record<string, { namespace: string }> | undefined {
	if (!bindings.dispatchNamespaces) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.dispatchNamespaces).map(([bindingName, binding]) => {
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

export function buildWorkflowsConfig(
	bindings: Bindings
): Record<string, {
	name: string
	className: string
	scriptName?: string
	stepLimit?: number
}> | undefined {
	if (!bindings.workflows) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.workflows).map(([bindingName, binding]) => {
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

export function buildPipelinesConfig(
	bindings: Bindings
): Record<string, string | { pipeline: string }> | undefined {
	if (!bindings.pipelines) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.pipelines).map(([bindingName, binding]) => {
			const normalized = normalizePipelineBinding(binding)
			return [
				bindingName,
				typeof binding === 'string'
					? normalized.pipeline
					: { pipeline: normalized.pipeline }
			]
		})
	)
}

function getHyperdriveLocalConnectionString(
	bindingName: string,
	binding: NonNullable<Bindings['hyperdrive']>[string]
): string | undefined {
	const cloudflareEnvName = `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${bindingName}`
	const wranglerEnvName = `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${bindingName}`
	const envValue = process.env[cloudflareEnvName] ?? process.env[wranglerEnvName]
	if (envValue?.trim()) {
		return envValue
	}

	const normalized = normalizeHyperdriveBinding(binding)
	return normalized.localConnectionString
}

export function buildHyperdrivesConfig(
	bindings: Bindings
): Record<string, string> | undefined {
	if (!bindings.hyperdrive) {
		return undefined
	}

	const hyperdrives = Object.fromEntries(
		Object.entries(bindings.hyperdrive)
			.map(([bindingName, binding]) => {
				const localConnectionString = getHyperdriveLocalConnectionString(bindingName, binding)
				return localConnectionString
					? [bindingName, localConnectionString]
					: null
			})
			.filter((entry): entry is [string, string] => entry !== null)
	)

	return Object.keys(hyperdrives).length > 0 ? hyperdrives : undefined
}

export function buildImagesConfig(
	bindings: Bindings
): { binding: string } | undefined {
	if (!bindings.images) {
		return undefined
	}

	const [entry] = Object.entries(bindings.images)
	if (!entry) {
		return undefined
	}

	const [bindingName, binding] = entry
	const normalized = normalizeImagesBinding(bindingName, binding)
	return {
		binding: normalized.binding
	}
}

export function buildMediaConfig(
	bindings: Bindings
): { binding: string } | undefined {
	if (!bindings.media) {
		return undefined
	}

	const [entry] = Object.entries(bindings.media)
	if (!entry) {
		return undefined
	}

	const [bindingName, binding] = entry
	const normalized = normalizeMediaBinding(bindingName, binding)
	return {
		binding: normalized.binding
	}
}

export function buildArtifactsConfig(
	bindings: Bindings
): Record<string, { namespace: string }> | undefined {
	if (!bindings.artifacts) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.artifacts).map(([bindingName, binding]) => {
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

export function buildAiSearchNamespacesConfig(
	bindings: Bindings
): Record<string, { namespace: string }> | undefined {
	if (!bindings.aiSearchNamespaces) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.aiSearchNamespaces).map(([bindingName, binding]) => [
			bindingName,
			{
				namespace: binding.namespace
			}
		])
	)
}

export function buildAiSearchInstancesConfig(
	bindings: Bindings
): Record<string, { instance_name: string }> | undefined {
	if (!bindings.aiSearch) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.aiSearch).map(([bindingName, binding]) => [
			bindingName,
			{
				instance_name: binding.instanceName
			}
		])
	)
}

export function buildSecretsStoreConfig(
	bindings: Bindings,
	defaultSecretsStoreId?: string
): Record<string, { store_id: string; secret_name: string }> | undefined {
	if (!bindings.secretsStore) {
		return undefined
	}

	return Object.fromEntries(
		Object.entries(bindings.secretsStore).map(([bindingName, binding]) => {
			const normalized = normalizeSecretsStoreBinding(binding, defaultSecretsStoreId, bindingName)
			return [
				bindingName,
				{
					store_id: normalized.storeId,
					secret_name: normalized.secretName
				}
			]
		})
	)
}

export function buildSendEmailConfig(
	bindings: Bindings
):
	| {
		send_email: Array<{
			name: string
			destination_address?: string
			allowed_destination_addresses?: string[]
			allowed_sender_addresses?: string[]
		}>
	}
	| undefined {
	if (!bindings.sendEmail) {
		return undefined
	}

	return {
		send_email: Object.entries(bindings.sendEmail).map(([name, binding]) => ({
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
