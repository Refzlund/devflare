// =============================================================================
// Config Compiler — Transforms DevflareConfig to wrangler.jsonc format
// =============================================================================

import { basename, isAbsolute, relative, resolve } from 'pathe'
import {
	browserBindingSchema,
	getSingleBrowserBindingName,
	normalizeHyperdriveBinding,
	normalizeKVBinding,
	normalizeD1Binding,
	normalizeDOBinding,
	normalizeMtlsCertificateBinding,
	normalizeDispatchNamespaceBinding,
	normalizeWorkflowBinding,
	normalizePipelineBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeArtifactsBinding,
	type DevflareConfig,
	type D1Binding,
	type HyperdriveBinding,
	type KVBinding
} from './schema'
import { normalizeCompatibilityFlags } from './compatibility'
import { toWranglerSecretsConfig } from './local-dev-vars'
import { resolveConfigForEnvironment } from './resolve'
import type { ResolvedConfig } from './resolve-phased'

/**
 * Wrangler config type — represents the output format for wrangler.jsonc
 */
export interface WranglerConfig {
	name: string
	account_id?: string
	main?: string
	compatibility_date: string
	compatibility_flags?: string[]
	rules?: WranglerModuleRule[]
	find_additional_modules?: boolean
	base_dir?: string
	preserve_file_names?: boolean
	preview_urls?: boolean
	workers_dev?: boolean

	// Bindings
	kv_namespaces?: WranglerKVNamespaceBinding[]
	d1_databases?: WranglerD1DatabaseBinding[]
	r2_buckets?: Array<{ binding: string; bucket_name: string }>
	durable_objects?: {
		bindings: Array<{
			name: string
			class_name: string
			script_name?: string
		}>
	}
	queues?: {
		producers?: Array<{ binding: string; queue: string }>
		consumers?: Array<{
			queue: string
			max_batch_size?: number
			max_batch_timeout?: number
			max_retries?: number
			dead_letter_queue?: string
			max_concurrency?: number
			retry_delay?: number
		}>
	}
	ratelimits?: Array<{
		name: string
		namespace_id: string
		simple: {
			limit: number
			period: 10 | 60
		}
	}>
	version_metadata?: {
		binding: string
	}
	worker_loaders?: Array<{
		binding: string
	}>
	secrets_store_secrets?: Array<{
		binding: string
		store_id: string
		secret_name: string
	}>
	mtls_certificates?: Array<{
		binding: string
		certificate_id: string
		remote?: boolean
	}>
	dispatch_namespaces?: Array<{
		binding: string
		namespace: string
		outbound?: {
			service: string
			environment?: string
			parameters?: string[]
		}
		remote?: boolean
	}>
	workflows?: Array<{
		binding: string
		name: string
		class_name: string
		script_name?: string
		remote?: boolean
		limits?: {
			steps: number
		}
	}>
	pipelines?: Array<{
		binding: string
		pipeline: string
		remote?: boolean
	}>
	services?: Array<{
		binding: string
		service: string
		entrypoint?: string
		environment?: string
	}>
	ai?: { binding: string; remote?: boolean; staging?: boolean }
	ai_search_namespaces?: Array<{ binding: string; namespace: string; remote?: boolean }>
	ai_search?: Array<{ binding: string; instance_name: string; remote?: boolean }>
	vectorize?: Array<{ binding: string; index_name: string; remote?: boolean }>
	hyperdrive?: WranglerHyperdriveBinding[]
	browser?: { binding: string; remote?: boolean }
	images?: {
		binding: string
		remote?: boolean
	}
	media?: {
		binding: string
		remote?: boolean
	}
	artifacts?: Array<{
		binding: string
		namespace: string
		remote?: boolean
	}>
	containers?: Array<{
		class_name: string
		image: string
		max_instances?: number
		instance_type?: string
		name?: string
		image_build_context?: string
		image_vars?: Record<string, string>
		rollout_active_grace_period?: number
		rollout_step_percentage?: number | number[]
	}>
	analytics_engine_datasets?: Array<{ binding: string; dataset: string }>
	send_email?: Array<{
		name: string
		destination_address?: string
		allowed_destination_addresses?: string[]
		allowed_sender_addresses?: string[]
	}>

	// Triggers
	triggers?: {
		crons?: string[]
	}
	tail_consumers?: Array<{
		service: string
		environment?: string
	}>

	// Variables
	vars?: Record<string, string>
	secrets?: {
		required?: string[]
	}

	// Routes
	routes?: Array<{
		pattern: string
		zone_name?: string
		zone_id?: string
		custom_domain?: boolean
	}>

	// Assets
	assets?: {
		directory: string
		binding?: string
		html_handling?: 'auto-trailing-slash' | 'force-trailing-slash' | 'drop-trailing-slash' | 'none'
		not_found_handling?: 'single-page-application' | '404-page' | 'none'
		run_worker_first?: boolean | string[]
	}

	// Placement
	placement?: {
		mode: 'off' | 'smart'
		hint?: string
	} | {
		mode?: 'targeted'
		region: string
	} | {
		mode?: 'targeted'
		host: string
	} | {
		mode?: 'targeted'
		hostname: string
	}

	// Observability
	observability?: {
		enabled?: boolean
		head_sampling_rate?: number
		logs?: {
			enabled?: boolean
			head_sampling_rate?: number
			invocation_logs?: boolean
			persist?: boolean
			destinations?: string[]
		}
		traces?: {
			enabled?: boolean
			head_sampling_rate?: number
			persist?: boolean
			destinations?: string[]
		}
	}

	// Limits
	limits?: {
		cpu_ms?: number
		subrequests?: number
	}

	// Migrations
	migrations?: Array<{
		tag: string
		new_classes?: string[]
		renamed_classes?: Array<{ from: string; to: string }>
		deleted_classes?: string[]
		new_sqlite_classes?: string[]
	}>

	// Passthrough fields (any additional fields)
	[key: string]: unknown
}

export type WranglerKVNamespaceBinding =
	| { binding: string; id: string }
	| { binding: string; name: string }

export type WranglerD1DatabaseBinding =
	| { binding: string; database_id: string }
	| { binding: string; database_name: string }

export type WranglerHyperdriveBinding =
	| { binding: string; id: string; localConnectionString?: string }
	| { binding: string; name: string; localConnectionString?: string }

export interface WranglerModuleRule {
	type: 'ESModule' | 'CommonJS' | 'CompiledWasm' | 'Text' | 'Data'
	globs: string[]
	fallthrough?: boolean
}

interface CompileConfigOptions {
	preserveNamedBindings?: boolean
	/**
	 * If true, skip the internal `resolveConfigForEnvironment` call. Use when
	 * the caller has already merged environment overrides and materialized
	 * preview-scoped bindings (e.g. the deploy path). Idempotent today, but
	 * `R1` step 4 will make env-merge non-idempotent for some array-additive
	 * fields, so callers on the deploy path should set this explicitly. (CR1.)
	 */
	alreadyResolved?: boolean
}

function getWranglerD1DatabaseBinding(
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

function getWranglerKVNamespaceBinding(
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

function getWranglerHyperdriveBinding(
	bindingName: string,
	bindingConfig: HyperdriveBinding,
	options: CompileConfigOptions = {}
): WranglerHyperdriveBinding {
	const normalized = normalizeHyperdriveBinding(bindingConfig)
	if (normalized.configurationId) {
		return {
			binding: bindingName,
			id: normalized.configurationId,
			...(normalized.localConnectionString && { localConnectionString: normalized.localConnectionString })
		}
	}

	if (options.preserveNamedBindings && normalized.name) {
		return {
			binding: bindingName,
			name: normalized.name,
			...(normalized.localConnectionString && { localConnectionString: normalized.localConnectionString })
		}
	}

	throw new Error(
		`Hyperdrive binding "${bindingName}" is configured by name (${normalized.name}) and must be resolved before compiling Wrangler config. Use loadResolvedConfig() or resolveConfigResources() for build/deploy/automation flows.`
	)
}

function getWranglerBrowserBinding(
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
		...(typeof bindingConfig === 'object' && bindingConfig.remote !== undefined && {
			remote: bindingConfig.remote
		})
	}
}

function compileWranglerMigrations(
	migrations: NonNullable<DevflareConfig['migrations']>
): NonNullable<WranglerConfig['migrations']> {
	return migrations.map((migration) => ({
		tag: migration.tag,
		...(migration.new_classes && { new_classes: migration.new_classes }),
		...(migration.renamed_classes && {
			renamed_classes: migration.renamed_classes.map((renamedClass) => ({
				from: renamedClass.from,
				to: renamedClass.to
			}))
		}),
		...(migration.deleted_classes && { deleted_classes: migration.deleted_classes }),
		...(migration.new_sqlite_classes && { new_sqlite_classes: migration.new_sqlite_classes })
	}))
}

function compileModuleOptions(
	config: DevflareConfig,
	result: WranglerConfig
): void {
	if (config.rules && config.rules.length > 0) {
		result.rules = config.rules
	}

	if (config.findAdditionalModules !== undefined) {
		result.find_additional_modules = config.findAdditionalModules
	}

	if (config.baseDir) {
		result.base_dir = config.baseDir
	}

	if (config.preserveFileNames !== undefined) {
		result.preserve_file_names = config.preserveFileNames
	}
}

function compileContainers(
	config: DevflareConfig,
	result: WranglerConfig
): void {
	if (!config.containers || config.containers.length === 0) {
		return
	}

	result.containers = config.containers.map((container) => ({
		class_name: container.className,
		image: container.image,
		...(container.maxInstances !== undefined && { max_instances: container.maxInstances }),
		...(container.instanceType && { instance_type: container.instanceType }),
		...(container.name && { name: container.name }),
		...(container.imageBuildContext && { image_build_context: container.imageBuildContext }),
		...(container.imageVars && { image_vars: container.imageVars }),
		...(container.rolloutActiveGracePeriod !== undefined && {
			rollout_active_grace_period: container.rolloutActiveGracePeriod
		}),
		...(container.rolloutStepPercentage !== undefined && {
			rollout_step_percentage: container.rolloutStepPercentage
		})
	}))
}

/**
 * Compile a phase-resolved DevflareConfig to WranglerConfig.
 *
 * R1 step 3 — input is type-narrowed to `ResolvedConfig` (`LocalConfig |
 * DeployConfig`) so callers cannot accidentally pass a raw `DevflareConfig`
 * whose KV/D1/Hyperdrive bindings might still be name-only. The runtime
 * throw remains as a defence-in-depth guard for callers that bypass the
 * type system (e.g. via `as any`).
 *
 * @param config - A phase-resolved devflare configuration (`LocalConfig` or `DeployConfig`)
 * @param environment - Optional environment name for env-specific overrides
 * @returns Wrangler-compatible configuration object
 */
export function compileConfig(
	config: ResolvedConfig,
	environment?: string
): WranglerConfig {
	return compileConfigInternal(config, environment)
}

export function compileBuildConfig(
	config: DevflareConfig,
	environment?: string,
	options: { alreadyResolved?: boolean } = {}
): WranglerConfig {
	return compileConfigInternal(config, environment, {
		preserveNamedBindings: true,
		alreadyResolved: options.alreadyResolved
	})
}

function compileConfigInternal(
	config: DevflareConfig,
	environment?: string,
	options: CompileConfigOptions = {}
): WranglerConfig {
	const resolvedConfig = options.alreadyResolved
		? config
		: resolveConfigForEnvironment(config, environment)
	const mergedConfig = {
		...resolvedConfig,
		compatibilityFlags: normalizeCompatibilityFlags(resolvedConfig.compatibilityFlags)
	}

	const result: WranglerConfig = {
		name: mergedConfig.name,
		compatibility_date: mergedConfig.compatibilityDate,
		preview_urls: true,
		workers_dev: true
	}

	// Account ID (required for remote bindings like AI, Vectorize)
	if (mergedConfig.accountId) {
		result.account_id = mergedConfig.accountId
	}

	// Main entry point - derived from files.fetch by devflare
	// (no longer a user-facing config option)
	const mainEntry = mergedConfig.files?.fetch
	if (typeof mainEntry === 'string') {
		result.main = mainEntry
	}

	compileModuleOptions(mergedConfig, result)

	// Compatibility flags
	if (mergedConfig.compatibilityFlags && mergedConfig.compatibilityFlags.length > 0) {
		result.compatibility_flags = mergedConfig.compatibilityFlags
	}

	// Compile bindings
	if (mergedConfig.bindings) {
		compileBindings(mergedConfig.bindings, result, options)
	}

	// Compile triggers
	if (mergedConfig.triggers?.crons && mergedConfig.triggers.crons.length > 0) {
		result.triggers = { crons: mergedConfig.triggers.crons }
	}

	if (mergedConfig.tailConsumers && mergedConfig.tailConsumers.length > 0) {
		result.tail_consumers = mergedConfig.tailConsumers.map((consumer) => (
			typeof consumer === 'string'
				? { service: consumer }
				: {
					service: consumer.service,
					...(consumer.environment && { environment: consumer.environment })
				}
		))
	}

	// Variables
	if (mergedConfig.vars && Object.keys(mergedConfig.vars).length > 0) {
		result.vars = mergedConfig.vars
	}

	const secrets = toWranglerSecretsConfig(mergedConfig.secrets)
	if (secrets) {
		result.secrets = secrets
	}

	// Routes
	if (mergedConfig.routes && mergedConfig.routes.length > 0) {
		result.routes = mergedConfig.routes.map((route) => ({
			pattern: route.pattern,
			...(route.zone_name && { zone_name: route.zone_name }),
			...(route.zone_id && { zone_id: route.zone_id }),
			...(route.custom_domain !== undefined && { custom_domain: route.custom_domain })
		}))
	}

	// Assets
	if (mergedConfig.assets && mergedConfig.assets.directory) {
		result.assets = {
			directory: mergedConfig.assets.directory,
			...(mergedConfig.assets.binding && { binding: mergedConfig.assets.binding }),
			...(mergedConfig.assets.html_handling && { html_handling: mergedConfig.assets.html_handling }),
			...(mergedConfig.assets.not_found_handling && {
				not_found_handling: mergedConfig.assets.not_found_handling
			}),
			...(mergedConfig.assets.run_worker_first !== undefined && {
				run_worker_first: mergedConfig.assets.run_worker_first
			})
		}
	}

	// Placement
	if (mergedConfig.placement) {
		result.placement = mergedConfig.placement
	}

	// Observability
	if (mergedConfig.observability) {
		result.observability = mergedConfig.observability
	}

	// Limits
	if (mergedConfig.limits) {
		result.limits = mergedConfig.limits
	}

	compileContainers(mergedConfig, result)

	// Migrations
	if (mergedConfig.migrations && mergedConfig.migrations.length > 0) {
		result.migrations = compileWranglerMigrations(mergedConfig.migrations)
	}

	// Merge passthrough config
	if (mergedConfig.wrangler?.passthrough) {
		Object.assign(result, mergedConfig.wrangler.passthrough)
	}

	return result
}

/**
 * Compile DevflareConfig to programmatic config for @cloudflare/vite-plugin
 * This is used instead of wrangler.jsonc in dev mode
 *
 * @param config - The devflare configuration
 * @param environment - Optional environment name for env-specific overrides
 * @returns Config object compatible with cloudflare({ config: ... })
 */
export function compileToProgrammaticConfig(
	config: DevflareConfig,
	environment?: string,
	options: { preserveNamedBindings?: boolean } = {}
): Record<string, unknown> {
	return options.preserveNamedBindings
		? compileBuildConfig(config, environment)
		: compileConfig(config as ResolvedConfig, environment)
}

/**
 * Compile bindings from devflare format to wrangler format
 */
function compileBindings(
	bindings: NonNullable<DevflareConfig['bindings']>,
	result: WranglerConfig,
	options: CompileConfigOptions = {}
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
		result.mtls_certificates = Object.entries(bindings.mtlsCertificates).map(([binding, config]) => {
			const normalized = normalizeMtlsCertificateBinding(config)
			return {
				binding,
				certificate_id: normalized.certificateId,
				...(normalized.remote !== undefined && { remote: normalized.remote })
			}
		})
	}

	// Dispatch Namespaces
	if (bindings.dispatchNamespaces) {
		result.dispatch_namespaces = Object.entries(bindings.dispatchNamespaces).map(([binding, config]) => {
			const normalized = normalizeDispatchNamespaceBinding(config)
			return {
				binding,
				namespace: normalized.namespace,
				...(normalized.outbound && { outbound: normalized.outbound }),
				...(normalized.remote !== undefined && { remote: normalized.remote })
			}
		})
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
		result.secrets_store_secrets = Object.entries(bindings.secretsStore).map(([binding, config]) => ({
			binding,
			store_id: config.storeId,
			secret_name: config.secretName
		}))
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
	if (bindings.ai && bindings.ai.binding) {
		result.ai = {
			binding: bindings.ai.binding,
			...(bindings.ai.remote !== undefined && { remote: bindings.ai.remote }),
			...(bindings.ai.staging !== undefined && { staging: bindings.ai.staging })
		}
	}

	// AI Search
	if (bindings.aiSearchNamespaces) {
		result.ai_search_namespaces = Object.entries(bindings.aiSearchNamespaces).map(([binding, config]) => ({
			binding,
			namespace: config.namespace,
			...(config.remote !== undefined && { remote: config.remote })
		}))
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

/**
 * Convert WranglerConfig to JSONC string with comments
 */
export function stringifyConfig(config: WranglerConfig): string {
	const header = `// Generated by devflare — Do not edit directly
// Edit devflare.config.ts instead

`
	return header + JSON.stringify(config, null, '\t')
}

function rebasePathForConfigDir(
	projectRoot: string,
	configDir: string,
	pathValue: string
): string {
	const absolutePath = isAbsolute(pathValue)
		? pathValue
		: resolve(projectRoot, pathValue)

	return relative(configDir, absolutePath).replace(/\\/g, '/')
}

function isLocalContainerPath(pathValue: string): boolean {
	return pathValue === 'Dockerfile'
		|| pathValue.startsWith('.')
		|| pathValue.startsWith('/')
		|| pathValue.startsWith('\\')
		|| isAbsolute(pathValue)
		|| pathValue.endsWith('/Dockerfile')
		|| pathValue.endsWith('\\Dockerfile')
}

function pathIsInsideDirectory(directoryPath: string, candidatePath: string): boolean {
	const normalizedDirectoryPath = directoryPath.replace(/\\/g, '/')
	const normalizedCandidatePath = candidatePath.replace(/\\/g, '/')

	return (
		normalizedCandidatePath === normalizedDirectoryPath ||
		normalizedCandidatePath.startsWith(`${normalizedDirectoryPath}/`)
	)
}

export function isolateViteBuildOutputPaths(
	projectRoot: string,
	config: WranglerConfig
): WranglerConfig {
	const assetsDirectory = config.assets?.directory
	if (!assetsDirectory) {
		return config
	}

	const isolatedAssetsDirectoryPath = resolve(
		projectRoot,
		'.devflare',
		'vite-build-output',
		basename(assetsDirectory)
	)
	const isolatedAssetsDirectory = relative(projectRoot, isolatedAssetsDirectoryPath).replace(/\\/g, '/')
	const isolatedConfig: WranglerConfig = {
		...config,
		assets: config.assets
			? {
				...config.assets,
				directory: isolatedAssetsDirectory
			}
			: config.assets
	}

	if (!config.main) {
		return isolatedConfig
	}

	const originalAssetsDirectoryPath = resolve(projectRoot, assetsDirectory)
	const originalMainEntryPath = resolve(projectRoot, config.main)
	if (!pathIsInsideDirectory(originalAssetsDirectoryPath, originalMainEntryPath)) {
		return isolatedConfig
	}

	const relativeMainEntryPath = relative(originalAssetsDirectoryPath, originalMainEntryPath)
	const isolatedMainEntryPath = resolve(isolatedAssetsDirectoryPath, relativeMainEntryPath)

	return {
		...isolatedConfig,
		main: relative(projectRoot, isolatedMainEntryPath).replace(/\\/g, '/')
	}
}

export function rebaseWranglerConfigPaths(
	projectRoot: string,
	configDir: string,
	config: WranglerConfig
): WranglerConfig {
	return {
		...config,
		...(config.main
			? { main: rebasePathForConfigDir(projectRoot, configDir, config.main) }
			: {}),
		...(config.assets?.directory
			? {
				assets: {
					...config.assets,
					directory: rebasePathForConfigDir(projectRoot, configDir, config.assets.directory)
				}
			}
			: {}),
		...(config.containers
			? {
				containers: config.containers.map((container) => ({
					...container,
					image: isLocalContainerPath(container.image)
						? rebasePathForConfigDir(projectRoot, configDir, container.image)
						: container.image,
					...(container.image_build_context && {
						image_build_context: rebasePathForConfigDir(
							projectRoot,
							configDir,
							container.image_build_context
						)
					})
				}))
			}
			: {})
	}
}

/**
 * Write wrangler.jsonc file to the specified directory
 *
 * @param cwd - Working directory to write to
 * @param config - Wrangler configuration to write
 * @param filename - Optional filename (default: 'wrangler.jsonc')
 * @returns Path to the written file
 */
export async function writeWranglerConfig(
	cwd: string,
	config: WranglerConfig,
	filename: string = 'wrangler.jsonc'
): Promise<string> {
	const { resolve } = await import('pathe')
	const fs = await import('node:fs/promises')

	// Ensure directory exists
	try {
		await fs.mkdir(cwd, { recursive: true })
	} catch {
		// Directory may already exist
	}

	const content = stringifyConfig(config)
	const wranglerPath = resolve(cwd, filename)
	await fs.writeFile(wranglerPath, content, 'utf-8')
	return wranglerPath
}

export async function readWranglerConfig(filePath: string): Promise<WranglerConfig> {
	const fs = await import('node:fs/promises')
	const { parse } = await import('jsonc-parser')
	const content = await fs.readFile(filePath, 'utf-8')
	const parsedConfig = parse(content)

	if (!parsedConfig || typeof parsedConfig !== 'object') {
		throw new Error(`Could not parse Wrangler config at ${filePath}.`)
	}

	return parsedConfig as WranglerConfig
}

/**
 * Derive a deterministic worker name from a Durable Object class name.
 * Converts PascalCase/camelCase to kebab-case so it is safe to use as a
 * Wrangler worker name.
 */
function kebabCaseClassName(className: string): string {
	return className
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase()
}

/**
 * Filter a migration entry down to the subset that applies to the given
 * Durable Object class. Returns null when nothing in the migration references
 * the class (so that worker does not need that migration tag).
 */
function filterMigrationForClass(
	migration: NonNullable<DevflareConfig['migrations']>[number],
	className: string
): NonNullable<DevflareConfig['migrations']>[number] | null {
	const newClasses = migration.new_classes?.filter((name) => name === className)
	const newSqliteClasses = migration.new_sqlite_classes?.filter((name) => name === className)
	const deletedClasses = migration.deleted_classes?.filter((name) => name === className)
	const renamedClasses = migration.renamed_classes?.filter((entry) => entry.to === className || entry.from === className)

	const hasAny = Boolean(
		(newClasses && newClasses.length > 0)
		|| (newSqliteClasses && newSqliteClasses.length > 0)
		|| (deletedClasses && deletedClasses.length > 0)
		|| (renamedClasses && renamedClasses.length > 0)
	)

	if (!hasAny) {
		return null
	}

	return {
		tag: migration.tag,
		...(newClasses && newClasses.length > 0 && { new_classes: newClasses }),
		...(newSqliteClasses && newSqliteClasses.length > 0 && { new_sqlite_classes: newSqliteClasses }),
		...(deletedClasses && deletedClasses.length > 0 && { deleted_classes: deletedClasses }),
		...(renamedClasses && renamedClasses.length > 0 && { renamed_classes: renamedClasses })
	}
}

/**
 * Compile DO Worker configs from DevflareConfig.
 *
 * Each distinct Durable Object class is emitted as its own compiled worker
 * entry. The worker name is derived from the class being compiled (or from
 * an explicit `scriptName` on a binding for that class), never from the
 * first binding encountered.
 *
 * **Public-API only.** This helper is exported for downstream tooling that
 * orchestrates multi-worker DO topologies on top of devflare. The internal
 * `devflare build` / `devflare deploy` pipeline does **not** call this —
 * it emits a single Wrangler config and relies on `wrangler` to handle DO
 * placement. C9 in `REMAINING.md` tracks this caveat: nothing inside the
 * package exercises this function, so behaviour for current consumers is
 * defined by the (small) test surface rather than by the build/deploy
 * happy path. Pass `preserveNamedBindings: true` if you want the same
 * build-time name preservation that `compileBuildConfig()` uses.
 *
 * @param config - The devflare configuration
 * @param doWorkerEntry - Path to the DO worker entry file (e.g., 'src/workers/do-worker.ts')
 * @param options - Additional options
 * @param options.absoluteMain - If true, resolve main to absolute path using cwd
 * @param options.cwd - Working directory for resolving absolute paths
 * @returns Array of Wrangler configs — one per DO class. Empty when no DOs configured.
 */
export function compileDOWorkerConfig(
	config: DevflareConfig,
	doWorkerEntry: string,
	options?: { absoluteMain?: boolean; cwd?: string; environment?: string; preserveNamedBindings?: boolean }
): WranglerConfig[] {
	const resolvedConfig = resolveConfigForEnvironment(config, options?.environment)

	const doBindings = resolvedConfig.bindings?.durableObjects
	if (!doBindings || Object.keys(doBindings).length === 0) {
		return []
	}

	// Group bindings by class name. Multiple bindings may point to the same
	// class; they are hosted by a single worker dedicated to that class.
	const bindingsByClass = new Map<
		string,
		Array<{ bindingName: string; normalized: ReturnType<typeof normalizeDOBinding> }>
	>()
	for (const [bindingName, doConfig] of Object.entries(doBindings)) {
		const normalized = normalizeDOBinding(doConfig)
		const group = bindingsByClass.get(normalized.className) ?? []
		group.push({ bindingName, normalized })
		bindingsByClass.set(normalized.className, group)
	}

	// Resolve main path (absolute if needed for wrangler pages dev)
	let mainPath = doWorkerEntry
	if (options?.absoluteMain && options.cwd) {
		mainPath = resolve(options.cwd, doWorkerEntry)
	}

	const results: WranglerConfig[] = []

	for (const [className, entries] of bindingsByClass) {
		const explicitScriptName = entries.find((entry) => entry.normalized.scriptName)?.normalized.scriptName
		const workerName = explicitScriptName ?? `${resolvedConfig.name}-${kebabCaseClassName(className)}`

		const result: WranglerConfig = {
			name: workerName,
			main: mainPath,
			compatibility_date: resolvedConfig.compatibilityDate
		}

		compileModuleOptions(resolvedConfig, result)

		if (resolvedConfig.compatibilityFlags && resolvedConfig.compatibilityFlags.length > 0) {
			result.compatibility_flags = resolvedConfig.compatibilityFlags
		}

		// DO bindings WITHOUT script_name (the class is defined in this worker)
		result.durable_objects = {
			bindings: entries.map(({ bindingName, normalized }) => ({
				name: bindingName,
				class_name: normalized.className
			}))
		}

		// Scope migrations to this class only so each worker declares only the
		// classes it actually exports.
		if (resolvedConfig.migrations && resolvedConfig.migrations.length > 0) {
			const classMigrations = resolvedConfig.migrations
				.map((migration) => filterMigrationForClass(migration, className))
				.filter((migration): migration is NonNullable<typeof migration> => migration !== null)

			if (classMigrations.length > 0) {
				result.migrations = compileWranglerMigrations(classMigrations)
			}
		}

		// Include bindings that DOs might need (storage, browser, etc.)
		if (resolvedConfig.bindings?.kv) {
			result.kv_namespaces = Object.entries(resolvedConfig.bindings.kv).map(([binding, namespace]) => {
				return getWranglerKVNamespaceBinding(binding, namespace, options)
			})
		}

		if (resolvedConfig.bindings?.d1) {
			result.d1_databases = Object.entries(resolvedConfig.bindings.d1).map(([binding, database_id]) => {
				return getWranglerD1DatabaseBinding(binding, database_id, options)
			})
		}

		if (resolvedConfig.bindings?.r2) {
			result.r2_buckets = Object.entries(resolvedConfig.bindings.r2).map(([binding, bucket_name]) => ({
				binding,
				bucket_name
			}))
		}

		const browserBinding = getWranglerBrowserBinding(resolvedConfig.bindings?.browser)
		if (browserBinding) {
			result.browser = browserBinding
		}

		results.push(result)
	}

	return results
}
