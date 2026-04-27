import {
	type D1Binding,
	type DevflareConfig,
	type HyperdriveBinding,
	type KVBinding,
	browserBindingSchema,
	getSingleBrowserBindingName,
	normalizeArtifactsBinding,
	normalizeD1Binding,
	normalizeDOBinding,
	normalizeDispatchNamespaceBinding,
	normalizeHyperdriveBinding,
	normalizeImagesBinding,
	normalizeKVBinding,
	normalizeMediaBinding,
	normalizeMtlsCertificateBinding,
	normalizePipelineBinding,
	normalizeSecretsStoreBinding,
	normalizeWorkflowBinding
} from '../schema'
import type {
	CompileConfigOptions,
	WranglerConfig,
	WranglerD1DatabaseBinding,
	WranglerHyperdriveBinding,
	WranglerKVNamespaceBinding
} from './types'

export function getWranglerD1DatabaseBinding(
	bindingName: string,
	bindingConfig: D1Binding,
	options: CompileConfigOptions = {}
): WranglerD1DatabaseBinding {
	const normalized = normalizeD1Binding(bindingConfig)
	if (normalized.databaseId) {
		return {
			binding: bindingName,
			database_id: normalized.databaseId
		}
	}

	if (options.preserveNamedBindings && normalized.name) {
		return {
			binding: bindingName,
			database_name: normalized.name
		}
	}

	throw new Error(
		`D1 binding "${bindingName}" is configured by name (${normalized.name}) and must be resolved before compiling Wrangler config. Use loadResolvedConfig() or resolveConfigResources() for build/deploy/automation flows.`
	)
}

export function getWranglerKVNamespaceBinding(
	bindingName: string,
	bindingConfig: KVBinding,
	options: CompileConfigOptions = {}
): WranglerKVNamespaceBinding {
	const normalized = normalizeKVBinding(bindingConfig)
	if (normalized.namespaceId) {
		return {
			binding: bindingName,
			id: normalized.namespaceId
		}
	}

	if (options.preserveNamedBindings && normalized.name) {
		return {
			binding: bindingName,
			name: normalized.name
		}
	}

	throw new Error(
		`KV binding "${bindingName}" is configured by name (${normalized.name}) and must be resolved before compiling Wrangler config. Use loadResolvedConfig() or resolveConfigResources() for build/deploy/automation flows.`
	)
}

export function getWranglerHyperdriveBinding(
	bindingName: string,
	bindingConfig: HyperdriveBinding,
	options: CompileConfigOptions = {}
): WranglerHyperdriveBinding {
	const normalized = normalizeHyperdriveBinding(bindingConfig)
	if (normalized.configurationId) {
		return {
			binding: bindingName,
			id: normalized.configurationId,
			...(normalized.localConnectionString && {
				localConnectionString: normalized.localConnectionString
			})
		}
	}

	if (options.preserveNamedBindings && normalized.name) {
		return {
			binding: bindingName,
			name: normalized.name,
			...(normalized.localConnectionString && {
				localConnectionString: normalized.localConnectionString
			})
		}
	}

	throw new Error(
		`Hyperdrive binding "${bindingName}" is configured by name (${normalized.name}) and must be resolved before compiling Wrangler config. Use loadResolvedConfig() or resolveConfigResources() for build/deploy/automation flows.`
	)
}

export function getWranglerBrowserBinding(
	browserBindings: NonNullable<DevflareConfig['bindings']>['browser']
): { binding: string; remote?: boolean } | undefined {
	if (!browserBindings) {
		return undefined
	}

	// Re-validate via Zod so the canonical browser-binding-limit error is
	// raised even when `compileConfig()` is called with input that bypassed
	// `configSchema.parse()` (e.g. raw objects cast as DevflareConfig).
	const parsed = browserBindingSchema.parse(browserBindings)
	const bindingName = getSingleBrowserBindingName(parsed)
	if (!bindingName) {
		return undefined
	}

	const bindingConfig = parsed[bindingName]
	return {
		binding: bindingName,
		...(typeof bindingConfig === 'object' &&
			bindingConfig.remote !== undefined && {
				remote: bindingConfig.remote
			})
	}
}

/**
 * Compile bindings from devflare format to wrangler format
 */
export function compileBindings(
	bindings: NonNullable<DevflareConfig['bindings']>,
	result: WranglerConfig,
	options: CompileConfigOptions = {},
	defaultSecretsStoreId?: string
): void {
	// KV Namespaces
	if (bindings.kv) {
		result.kv_namespaces = Object.entries(bindings.kv).map(([binding, namespace]) => {
			return getWranglerKVNamespaceBinding(binding, namespace, options)
		})
	}

	// D1 Databases
	if (bindings.d1) {
		result.d1_databases = Object.entries(bindings.d1).map(([binding, database_id]) => {
			return getWranglerD1DatabaseBinding(binding, database_id, options)
		})
	}

	// R2 Buckets
	if (bindings.r2) {
		result.r2_buckets = Object.entries(bindings.r2).map(([binding, bucket_name]) => ({
			binding,
			bucket_name
		}))
	}

	// Durable Objects
	if (bindings.durableObjects) {
		result.durable_objects = {
			bindings: Object.entries(bindings.durableObjects).map(([name, config]) => {
				const normalized = normalizeDOBinding(config)
				const binding: { name: string; class_name: string; script_name?: string } = {
					name,
					class_name: normalized.className
				}
				if (normalized.kind === 'cross-worker' && normalized.scriptName) {
					binding.script_name = normalized.scriptName
				}
				return binding
			})
		}
	}

	// Queues
	if (bindings.queues) {
		result.queues = {}

		if (bindings.queues.producers) {
			result.queues.producers = Object.entries(bindings.queues.producers).map(
				([binding, queue]) => ({ binding, queue })
			)
		}

		if (bindings.queues.consumers) {
			result.queues.consumers = bindings.queues.consumers.map((consumer) => ({
				queue: consumer.queue,
				...(consumer.maxBatchSize && { max_batch_size: consumer.maxBatchSize }),
				...(consumer.maxBatchTimeout && { max_batch_timeout: consumer.maxBatchTimeout }),
				...(consumer.maxRetries && { max_retries: consumer.maxRetries }),
				...(consumer.deadLetterQueue && { dead_letter_queue: consumer.deadLetterQueue }),
				...(consumer.maxConcurrency && { max_concurrency: consumer.maxConcurrency }),
				...(consumer.retryDelay && { retry_delay: consumer.retryDelay })
			}))
		}
	}

	// Rate Limiting
	if (bindings.rateLimits) {
		result.ratelimits = Object.entries(bindings.rateLimits).map(([name, config]) => ({
			name,
			namespace_id: config.namespaceId,
			simple: {
				limit: config.simple.limit,
				period: config.simple.period
			}
		}))
	}

	// Version Metadata
	if (bindings.versionMetadata) {
		result.version_metadata = {
			binding: bindings.versionMetadata.binding
		}
	}

	// Worker Loaders
	if (bindings.workerLoaders) {
		result.worker_loaders = Object.keys(bindings.workerLoaders).map((binding) => ({ binding }))
	}

	// mTLS Certificates
	if (bindings.mtlsCertificates) {
		result.mtls_certificates = Object.entries(bindings.mtlsCertificates).map(
			([binding, config]) => {
				const normalized = normalizeMtlsCertificateBinding(config)
				return {
					binding,
					certificate_id: normalized.certificateId,
					...(normalized.remote !== undefined && { remote: normalized.remote })
				}
			}
		)
	}

	// Dispatch Namespaces
	if (bindings.dispatchNamespaces) {
		result.dispatch_namespaces = Object.entries(bindings.dispatchNamespaces).map(
			([binding, config]) => {
				const normalized = normalizeDispatchNamespaceBinding(config)
				return {
					binding,
					namespace: normalized.namespace,
					...(normalized.outbound && { outbound: normalized.outbound }),
					...(normalized.remote !== undefined && { remote: normalized.remote })
				}
			}
		)
	}

	// Workflows
	if (bindings.workflows) {
		result.workflows = Object.entries(bindings.workflows).map(([binding, config]) => {
			const normalized = normalizeWorkflowBinding(config)
			return {
				binding,
				name: normalized.name,
				class_name: normalized.className,
				...(normalized.scriptName && { script_name: normalized.scriptName }),
				...(normalized.remote !== undefined && { remote: normalized.remote }),
				...(normalized.limits && { limits: normalized.limits })
			}
		})
	}

	// Pipelines
	if (bindings.pipelines) {
		result.pipelines = Object.entries(bindings.pipelines).map(([binding, config]) => {
			const normalized = normalizePipelineBinding(config)
			return {
				binding,
				pipeline: normalized.pipeline,
				...(normalized.remote !== undefined && { remote: normalized.remote })
			}
		})
	}

	// Images
	if (bindings.images) {
		const [entry] = Object.entries(bindings.images)
		if (entry) {
			const [binding, config] = entry
			const normalized = normalizeImagesBinding(binding, config)
			result.images = {
				binding: normalized.binding,
				...(normalized.remote !== undefined && { remote: normalized.remote })
			}
		}
	}

	// Media Transformations
	if (bindings.media) {
		const [entry] = Object.entries(bindings.media)
		if (entry) {
			const [binding, config] = entry
			const normalized = normalizeMediaBinding(binding, config)
			result.media = {
				binding: normalized.binding,
				...(normalized.remote !== undefined && { remote: normalized.remote })
			}
		}
	}

	// Artifacts
	if (bindings.artifacts) {
		result.artifacts = Object.entries(bindings.artifacts).map(([binding, config]) => {
			const normalized = normalizeArtifactsBinding(config)
			return {
				binding,
				namespace: normalized.namespace,
				...(normalized.remote !== undefined && { remote: normalized.remote })
			}
		})
	}

	// Secrets Store
	if (bindings.secretsStore) {
		result.secrets_store_secrets = Object.entries(bindings.secretsStore).map(
			([binding, config]) => {
				const normalized = normalizeSecretsStoreBinding(config, defaultSecretsStoreId, binding)
				return {
					binding,
					store_id: normalized.storeId,
					secret_name: normalized.secretName
				}
			}
		)
	}

	// Services
	if (bindings.services) {
		result.services = Object.entries(bindings.services).map(([binding, config]) => ({
			binding,
			service: config.service,
			...(config.entrypoint && { entrypoint: config.entrypoint }),
			...(config.environment && { environment: config.environment })
		}))
	}

	// AI
	if (bindings.ai?.binding) {
		result.ai = {
			binding: bindings.ai.binding,
			...(bindings.ai.remote !== undefined && { remote: bindings.ai.remote }),
			...(bindings.ai.staging !== undefined && { staging: bindings.ai.staging })
		}
	}

	// AI Search
	if (bindings.aiSearchNamespaces) {
		result.ai_search_namespaces = Object.entries(bindings.aiSearchNamespaces).map(
			([binding, config]) => ({
				binding,
				namespace: config.namespace,
				...(config.remote !== undefined && { remote: config.remote })
			})
		)
	}

	if (bindings.aiSearch) {
		result.ai_search = Object.entries(bindings.aiSearch).map(([binding, config]) => ({
			binding,
			instance_name: config.instanceName,
			...(config.remote !== undefined && { remote: config.remote })
		}))
	}

	// Vectorize
	if (bindings.vectorize) {
		result.vectorize = Object.entries(bindings.vectorize).map(([binding, config]) => ({
			binding,
			index_name: config.indexName,
			...(config.remote !== undefined && { remote: config.remote })
		}))
	}

	// Hyperdrive
	if (bindings.hyperdrive) {
		result.hyperdrive = Object.entries(bindings.hyperdrive).map(([binding, config]) => {
			return getWranglerHyperdriveBinding(binding, config, options)
		})
	}

	// Browser
	const browserBinding = getWranglerBrowserBinding(bindings.browser)
	if (browserBinding) {
		result.browser = browserBinding
	}

	// Analytics Engine
	if (bindings.analyticsEngine) {
		result.analytics_engine_datasets = Object.entries(bindings.analyticsEngine).map(
			([binding, config]) => ({
				binding,
				dataset: config.dataset
			})
		)
	}

	// Send Email
	if (bindings.sendEmail) {
		result.send_email = Object.entries(bindings.sendEmail).map(([name, config]) => ({
			name,
			...(config.destinationAddress && {
				destination_address: config.destinationAddress
			}),
			...(config.allowedDestinationAddresses && {
				allowed_destination_addresses: config.allowedDestinationAddresses
			}),
			...(config.allowedSenderAddresses && {
				allowed_sender_addresses: config.allowedSenderAddresses
			})
		}))
	}
}
