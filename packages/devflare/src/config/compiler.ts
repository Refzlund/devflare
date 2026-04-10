// =============================================================================
// Config Compiler — Transforms DevflareConfig to wrangler.jsonc format
// =============================================================================

import { isAbsolute, relative, resolve } from 'pathe'
import {
	getSingleBrowserBindingName,
	normalizeKVBinding,
	normalizeD1Binding,
	normalizeDOBinding,
	type DevflareConfig,
	type D1Binding,
	type KVBinding
} from './schema'
import { resolveConfigForEnvironment } from './resolve'

/**
 * Wrangler config type — represents the output format for wrangler.jsonc
 */
export interface WranglerConfig {
	name: string
	account_id?: string
	main?: string
	compatibility_date: string
	compatibility_flags?: string[]
	preview_urls?: boolean
	workers_dev?: boolean

	// Bindings
	kv_namespaces?: Array<{ binding: string; id: string }>
	d1_databases?: Array<{ binding: string; database_id: string }>
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
	services?: Array<{
		binding: string
		service: string
		entrypoint?: string
		environment?: string
	}>
	ai?: { binding: string }
	vectorize?: Array<{ binding: string; index_name: string }>
	hyperdrive?: Array<{ binding: string; id: string }>
	browser?: { binding: string }
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

	// Variables
	vars?: Record<string, string>

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
	}

	// Observability
	observability?: {
		enabled?: boolean
		head_sampling_rate?: number
	}

	// Limits
	limits?: {
		cpu_ms?: number
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

function getWranglerD1DatabaseId(bindingName: string, bindingConfig: D1Binding): string {
	const normalized = normalizeD1Binding(bindingConfig)
	if (normalized.databaseId) {
		return normalized.databaseId
	}

	throw new Error(
		`D1 binding "${bindingName}" is configured by name (${normalized.name}) and must be resolved before compiling Wrangler config. Use loadResolvedConfig() or resolveConfigResources() for build/deploy/automation flows.`
	)
}

function getWranglerKVNamespaceId(bindingName: string, bindingConfig: KVBinding): string {
	const normalized = normalizeKVBinding(bindingConfig)
	if (normalized.namespaceId) {
		return normalized.namespaceId
	}

	throw new Error(
		`KV binding "${bindingName}" is configured by name (${normalized.name}) and must be resolved before compiling Wrangler config. Use loadResolvedConfig() or resolveConfigResources() for build/deploy/automation flows.`
	)
}

function getWranglerBrowserBinding(
	browserBindings: NonNullable<DevflareConfig['bindings']>['browser']
): { binding: string } | undefined {
	const bindingName = getSingleBrowserBindingName(browserBindings)
	return bindingName ? { binding: bindingName } : undefined
}

/**
 * Compile DevflareConfig to WranglerConfig
 *
 * @param config - The devflare configuration
 * @param environment - Optional environment name for env-specific overrides
 * @returns Wrangler-compatible configuration object
 */
export function compileConfig(
	config: DevflareConfig,
	environment?: string
): WranglerConfig {
	const mergedConfig = resolveConfigForEnvironment(config, environment)

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

	// Compatibility flags
	if (mergedConfig.compatibilityFlags && mergedConfig.compatibilityFlags.length > 0) {
		result.compatibility_flags = mergedConfig.compatibilityFlags
	}

	// Compile bindings
	if (mergedConfig.bindings) {
		compileBindings(mergedConfig.bindings, result)
	}

	// Compile triggers
	if (mergedConfig.triggers?.crons && mergedConfig.triggers.crons.length > 0) {
		result.triggers = { crons: mergedConfig.triggers.crons }
	}

	// Variables
	if (mergedConfig.vars && Object.keys(mergedConfig.vars).length > 0) {
		result.vars = mergedConfig.vars
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
			...(mergedConfig.assets.binding && { binding: mergedConfig.assets.binding })
		}
	}

	// Observability
	if (mergedConfig.observability) {
		result.observability = mergedConfig.observability
	}

	// Limits
	if (mergedConfig.limits) {
		result.limits = mergedConfig.limits
	}

	// Migrations
	if (mergedConfig.migrations && mergedConfig.migrations.length > 0) {
		result.migrations = mergedConfig.migrations.map((migration) => ({
			tag: migration.tag,
			...(migration.new_classes && { new_classes: migration.new_classes }),
			...(migration.renamed_classes && {
				renamed_classes: migration.renamed_classes.map((rc) => ({
					from: rc.from,
					to: rc.to
				}))
			}),
			...(migration.deleted_classes && { deleted_classes: migration.deleted_classes }),
			...(migration.new_sqlite_classes && { new_sqlite_classes: migration.new_sqlite_classes })
		}))
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
	environment?: string
): Record<string, unknown> {
	// Get the wrangler config first
	const wranglerConfig = compileConfig(config, environment)

	// Return as a plain object for programmatic use
	// The cloudflare vite plugin accepts the same format as wrangler config
	return { ...wranglerConfig }
}

/**
 * Compile bindings from devflare format to wrangler format
 */
function compileBindings(
	bindings: NonNullable<DevflareConfig['bindings']>,
	result: WranglerConfig
): void {
	// KV Namespaces
	if (bindings.kv) {
		result.kv_namespaces = Object.entries(bindings.kv).map(([binding, namespace]) => ({
			binding,
			id: getWranglerKVNamespaceId(binding, namespace)
		}))
	}

	// D1 Databases - d1 is Record<string, string>
	if (bindings.d1) {
		result.d1_databases = Object.entries(bindings.d1).map(([binding, database_id]) => ({
			binding,
			database_id: getWranglerD1DatabaseId(binding, database_id)
		}))
	}

	// R2 Buckets - r2 is Record<string, string>
	if (bindings.r2) {
		result.r2_buckets = Object.entries(bindings.r2).map(([binding, bucket_name]) => ({
			binding,
			bucket_name: bucket_name as string
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
				if (normalized.scriptName) {
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
		result.ai = { binding: bindings.ai.binding }
	}

	// Vectorize
	if (bindings.vectorize) {
		result.vectorize = Object.entries(bindings.vectorize).map(([binding, config]) => ({
			binding,
			index_name: config.indexName
		}))
	}

	// Hyperdrive
	if (bindings.hyperdrive) {
		result.hyperdrive = Object.entries(bindings.hyperdrive).map(([binding, config]) => ({
			binding,
			id: config.id
		}))
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

/**
 * Compile DO Worker config from DevflareConfig
 * This creates a separate worker config that exports the DO classes
 *
 * @param config - The devflare configuration
 * @param doWorkerEntry - Path to the DO worker entry file (e.g., 'src/workers/do-worker.ts')
 * @param options - Additional options
 * @param options.absoluteMain - If true, resolve main to absolute path using cwd
 * @param options.cwd - Working directory for resolving absolute paths
 * @returns Wrangler config for the DO worker, or null if no DOs configured
 */
export function compileDOWorkerConfig(
	config: DevflareConfig,
	doWorkerEntry: string,
	options?: { absoluteMain?: boolean; cwd?: string }
): WranglerConfig | null {
	// Check if there are any DOs configured
	if (!config.bindings?.durableObjects || Object.keys(config.bindings.durableObjects).length === 0) {
		return null
	}

	// Get the script name from the first DO binding (they should all have the same scriptName)
	const firstDO = normalizeDOBinding(Object.values(config.bindings.durableObjects)[0])
	const workerName = firstDO.scriptName || `${config.name}-do`

	// Resolve main path (absolute if needed for wrangler pages dev)
	let mainPath = doWorkerEntry
	if (options?.absoluteMain && options.cwd) {
		// Use path.resolve to get absolute path
		const path = require('pathe')
		mainPath = path.resolve(options.cwd, doWorkerEntry)
	}

	const result: WranglerConfig = {
		name: workerName,
		main: mainPath,
		compatibility_date: config.compatibilityDate
	}

	// Add compatibility flags
	if (config.compatibilityFlags && config.compatibilityFlags.length > 0) {
		result.compatibility_flags = config.compatibilityFlags
	}

	// Add DO bindings WITHOUT script_name (since they're defined in this worker)
	result.durable_objects = {
		bindings: Object.entries(config.bindings.durableObjects).map(([name, doConfig]) => {
			const normalized = normalizeDOBinding(doConfig)
			return {
				name,
				class_name: normalized.className
				// No script_name - the classes are exported from this worker
			}
		})
	}

	// Add migrations if present
	if (config.migrations && config.migrations.length > 0) {
		result.migrations = config.migrations.map((migration) => ({
			tag: migration.tag,
			...(migration.new_classes && { new_classes: migration.new_classes }),
			...(migration.renamed_classes && {
				renamed_classes: migration.renamed_classes.map((rc) => ({
					from: rc.from,
					to: rc.to
				}))
			}),
			...(migration.deleted_classes && { deleted_classes: migration.deleted_classes }),
			...(migration.new_sqlite_classes && { new_sqlite_classes: migration.new_sqlite_classes })
		}))
	}

	// Include bindings that DOs might need (storage, browser, etc.)
	if (config.bindings.kv) {
		result.kv_namespaces = Object.entries(config.bindings.kv).map(([binding, namespace]) => ({
			binding,
			id: getWranglerKVNamespaceId(binding, namespace)
		}))
	}

	if (config.bindings.d1) {
		result.d1_databases = Object.entries(config.bindings.d1).map(([binding, database_id]) => ({
			binding,
			database_id: getWranglerD1DatabaseId(binding, database_id)
		}))
	}

	if (config.bindings.r2) {
		result.r2_buckets = Object.entries(config.bindings.r2).map(([binding, bucket_name]) => ({
			binding,
			bucket_name: bucket_name as string
		}))
	}

	const browserBinding = getWranglerBrowserBinding(config.bindings.browser)
	if (browserBinding) {
		result.browser = browserBinding
	}

	return result
}
