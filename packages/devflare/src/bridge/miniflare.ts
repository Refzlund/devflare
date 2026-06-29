// =============================================================================
// Miniflare Orchestration — Programmatic Miniflare Management
// =============================================================================
// Spawns and manages Miniflare instances with all binding types
// =============================================================================

import type { Miniflare as MiniflareType } from 'miniflare'
import {
	type DevflareConfig,
	getLocalD1DatabaseIdentifier,
	getLocalKVNamespaceIdentifier,
	normalizeArtifactsBinding,
	normalizeDOBinding,
	normalizeDispatchNamespaceBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeMtlsCertificateBinding,
	normalizePipelineBinding,
	normalizeR2Binding,
	normalizeSecretsStoreBinding,
	normalizeWorkflowBinding,
	resolveConfigEnvVars
} from '../config'
import { applyLocalDevVarsToConfig } from '../config/local-dev-vars'
import {
	buildStreamingTailConsumersConfig,
	buildTailConsumersConfig
} from '../dev-server/miniflare-bindings'
import { createMiniflareLog } from '../dev-server/miniflare-log'
import {
	type LocalSecretWrappedBindingConfig,
	buildLocalSecretNodeBindings,
	buildLocalSecretWrappedBindingConfig
} from '../secrets/local-secrets'
import { buildLocalBindingShimServiceConfig } from '../shims/local-media-bindings'
import { GATEWAY_RUNTIME_JS } from './gateway-runtime'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface MiniflareInstance {
	/** Ready promise - resolves when Miniflare is ready */
	ready: Promise<void>
	/** Dispose the Miniflare instance */
	dispose(): Promise<void>
	/** Get bindings directly from Miniflare */
	getBindings(): Promise<Record<string, unknown>>
	/** Get a specific KV namespace by binding name */
	getKVNamespace: MiniflareType['getKVNamespace']
	/** Get a specific R2 bucket by binding name */
	getR2Bucket: MiniflareType['getR2Bucket']
	/** Get a specific D1 database by binding name */
	getD1Database: MiniflareType['getD1Database']
	/** Get a Durable Object namespace by binding name */
	getDurableObjectNamespace: MiniflareType['getDurableObjectNamespace']
	/** Dispatch a fetch request to a worker */
	dispatchFetch: MiniflareType['dispatchFetch']
	/** The underlying Miniflare instance */
	_mf: MiniflareType
}

export function isIgnorableMiniflareDisposeError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false
	}

	const details = error as Error & { code?: unknown; syscall?: unknown }
	return details.code === 'EBADF' && details.syscall === 'kill'
}

export interface MiniflareOptions {
	/** Devflare config to derive bindings from */
	config?: DevflareConfig
	/** Port for HTTP server (default: 8787) */
	port?: number
	/** Persist data to disk */
	persist?: boolean | string
	/** Path to persist data (if persist is true) */
	persistPath?: string
	/** Enable verbose logging */
	verbose?: boolean
	/** Durable Object classes to register */
	durableObjects?: Record<string, { className: string; scriptPath?: string }>
	/** KV namespaces to create - can be array of names or Record<name, id> */
	kvNamespaces?: string[] | Record<string, string>
	/** R2 buckets to create - can be array of names or Record<name, id> */
	r2Buckets?: string[] | Record<string, string>
	/** D1 databases to create - can be array of names or Record<name, id> */
	d1Databases?: string[] | Record<string, string>
	/** Queue bindings */
	queues?: string[]
	/** Rate Limiting bindings */
	rateLimits?: Record<string, { simple: { limit: number; period: 10 | 60 } }>
	/** Version Metadata binding name */
	versionMetadata?: string
	/** Worker Loader bindings */
	workerLoaders?: Record<string, Record<string, never>>
	/** mTLS Certificate bindings */
	mtlsCertificates?: Record<string, { certificate_id: string; remote?: boolean }>
	/** Dispatch Namespace bindings */
	dispatchNamespaces?: Record<string, { namespace: string }>
	/** Workflow bindings */
	workflows?: Record<
		string,
		{ name: string; className: string; scriptName?: string; stepLimit?: number }
	>
	/** Pipeline bindings */
	pipelines?: Record<string, string | { pipeline: string }>
	/** Images binding */
	images?: { binding: string }
	/** Media Transformations binding */
	media?: { binding: string }
	/** Analytics Engine dataset bindings */
	analyticsEngine?: Record<string, { dataset: string }>
	/** Tail consumer service names (cross-Worker tail delivery) */
	tailConsumers?: string[]
	/** Streaming tail consumer service names (cross-Worker streaming tail delivery) */
	streamingTailConsumers?: string[]
	/** Artifacts bindings */
	artifacts?: Record<string, { namespace: string }>
	/** Secrets Store bindings */
	secretsStore?: Record<string, { store_id: string; secret_name: string }>
	/** Send Email bindings */
	sendEmail?: Record<
		string,
		{
			destinationAddress?: string
			allowedDestinationAddresses?: string[]
			allowedSenderAddresses?: string[]
			remote?: boolean
		}
	>
	/** Environment variables */
	bindings?: Record<string, unknown>
	/** Service bindings */
	serviceBindings?: Record<string, { name: string; entrypoint?: string }>
	/** Wrapped bindings to expose object-shaped local binding shims */
	wrappedBindings?: LocalSecretWrappedBindingConfig['wrappedBindings']
	/** Additional module workers needed by wrapped bindings */
	auxiliaryWorkers?: LocalSecretWrappedBindingConfig['workers']
	/** Node-side binding shims merged into `getBindings()` results */
	nodeBindingOverrides?: Record<string, unknown>
	/** Project root used to load `.dev.vars`/`.env*` for config-based Miniflare */
	cwd?: string
	/** Config file path used as the anchor for `.dev.vars`/`.env*` */
	configPath?: string
	/** Cloudflare environment name used for local dev var file selection */
	environment?: string
	/** Compatibility date */
	compatibilityDate?: string
	/** Compatibility flags */
	compatibilityFlags?: string[]
}

interface MiniflareSendEmailConfig {
	send_email: Array<{
		name: string
		destination_address?: string
		allowed_destination_addresses?: string[]
		allowed_sender_addresses?: string[]
		remote?: boolean
	}>
}

type MiniflareRuntime = Awaited<ReturnType<typeof loadMiniflareRuntime>>
type MfOptions = ConstructorParameters<MiniflareRuntime['Miniflare']>[0]
type MfOptionsWithEmail = MfOptions & {
	bindings?: MiniflareOptions['bindings']
	d1Databases?: MiniflareOptions['d1Databases']
	d1Persist?: string
	durableObjects?: MiniflareOptions['durableObjects']
	durableObjectsPersist?: string
	email?: MiniflareSendEmailConfig
	kvNamespaces?: MiniflareOptions['kvNamespaces']
	kvPersist?: string
	queueProducers?: Record<string, { queueName: string; deliveryDelay?: number }>
	ratelimits?: MiniflareOptions['rateLimits']
	versionMetadata?: string
	workerLoaders?: MiniflareOptions['workerLoaders']
	mtlsCertificates?: MiniflareOptions['mtlsCertificates']
	dispatchNamespaces?: MiniflareOptions['dispatchNamespaces']
	workflows?: MiniflareOptions['workflows']
	workflowsPersist?: string
	pipelines?: MiniflareOptions['pipelines']
	images?: MiniflareOptions['images']
	imagesPersist?: string
	media?: MiniflareOptions['media']
	analyticsEngineDatasets?: MiniflareOptions['analyticsEngine']
	tails?: MiniflareOptions['tailConsumers']
	streamingTails?: MiniflareOptions['streamingTailConsumers']
	artifacts?: MiniflareOptions['artifacts']
	secretsStoreSecrets?: MiniflareOptions['secretsStore']
	serviceBindings?: MiniflareOptions['serviceBindings']
	wrappedBindings?: MiniflareOptions['wrappedBindings']
	workers?: Array<Record<string, unknown>>
	r2Buckets?: MiniflareOptions['r2Buckets']
	r2Persist?: string
}

// -----------------------------------------------------------------------------
// Gateway Worker Script
// -----------------------------------------------------------------------------

/**
 * Generates a lightweight HTTP-only gateway worker script for
 * `startMiniflare()` usage (tests, scripts, programmatic access).
 *
 * The RPC dispatch logic is shared with `dev-server/gateway-script.ts` via
 * `GATEWAY_RUNTIME_JS`. This gateway exposes the dispatcher over a plain
 * HTTP endpoint (`POST /_devflare/rpc`). The full WebSocket bridge with
 * streaming and WebSocket proxying lives in `./server.ts` / the dev-server
 * gateway.
 */
function generateGatewayScript(): string {
	return `
${GATEWAY_RUNTIME_JS}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)

		if (url.pathname === '/_devflare/health') {
			return new Response(JSON.stringify({ ok: true, status: 'ok', bindings: Object.keys(env) }), {
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (url.pathname === '/_devflare/rpc' && request.method === 'POST') {
			try {
				const { method, params } = await request.json()
				const result = await executeRpcMethod(method, params, env, ctx)
				return new Response(JSON.stringify({ ok: true, result }), {
					headers: { 'Content-Type': 'application/json' }
				})
			} catch (error) {
				return new Response(JSON.stringify({
					ok: false,
					error: { code: error?.code || 'RPC_ERROR', message: error?.message || String(error) }
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}

		return new Response('Devflare Gateway', { status: 200 })
	}
}
`
}

function hasNamedBindings(bindings: string[] | Record<string, string> | undefined): boolean {
	if (!bindings) {
		return false
	}

	if (Array.isArray(bindings)) {
		return bindings.length > 0
	}

	return Object.keys(bindings).length > 0
}

function resolvePersistPath(options: MiniflareOptions): string | undefined {
	if (!options.persist) {
		return undefined
	}

	if (typeof options.persist === 'string' && options.persist.trim().length > 0) {
		return options.persist
	}

	return options.persistPath ?? '.devflare/data'
}

async function loadMiniflareRuntime() {
	return await import('miniflare')
}

function createBaseMiniflareConfig(
	options: MiniflareOptions,
	runtime: MiniflareRuntime
): MfOptionsWithEmail {
	const config: MfOptionsWithEmail = {
		modules: true,
		script: generateGatewayScript(),
		port: options.port ?? 8787,
		host: '127.0.0.1',
		compatibilityDate: options.compatibilityDate ?? '2024-01-01',
		compatibilityFlags: options.compatibilityFlags ?? []
	}

	const log = createMiniflareLog(runtime.Log, runtime.LogLevel, options.verbose ? 'DEBUG' : 'WARN')
	if (log) {
		config.log = log as MfOptionsWithEmail['log']
	}

	return config
}

function applyKVNamespaceConfig(
	config: MfOptionsWithEmail,
	kvNamespaces: MiniflareOptions['kvNamespaces'],
	persistPath: string | undefined
): void {
	if (!hasNamedBindings(kvNamespaces)) {
		return
	}

	config.kvNamespaces = kvNamespaces
	if (persistPath) {
		config.kvPersist = `${persistPath}/kv`
	}
}

function applyR2BucketConfig(
	config: MfOptionsWithEmail,
	r2Buckets: MiniflareOptions['r2Buckets'],
	persistPath: string | undefined
): void {
	if (!hasNamedBindings(r2Buckets)) {
		return
	}

	config.r2Buckets = r2Buckets
	if (persistPath) {
		config.r2Persist = `${persistPath}/r2`
	}
}

function applyD1DatabaseConfig(
	config: MfOptionsWithEmail,
	d1Databases: MiniflareOptions['d1Databases'],
	persistPath: string | undefined
): void {
	if (!hasNamedBindings(d1Databases)) {
		return
	}

	config.d1Databases = d1Databases
	if (persistPath) {
		config.d1Persist = `${persistPath}/d1`
	}
}

function applyDurableObjectConfig(
	config: MfOptionsWithEmail,
	durableObjects: MiniflareOptions['durableObjects'],
	persistPath: string | undefined
): void {
	if (!durableObjects) {
		return
	}

	config.durableObjects = durableObjects
	if (persistPath) {
		config.durableObjectsPersist = `${persistPath}/do`
	}
}

function applySendEmailConfig(
	config: MfOptionsWithEmail,
	sendEmail: MiniflareOptions['sendEmail']
): void {
	if (!sendEmail) {
		return
	}

	config.email = {
		send_email: Object.entries(sendEmail).map(([name, emailConfig]) => ({
			name,
			...(emailConfig.destinationAddress && {
				destination_address: emailConfig.destinationAddress
			}),
			...(emailConfig.allowedDestinationAddresses && {
				allowed_destination_addresses: emailConfig.allowedDestinationAddresses
			}),
			...(emailConfig.allowedSenderAddresses && {
				allowed_sender_addresses: emailConfig.allowedSenderAddresses
			}),
			...(emailConfig.remote !== undefined && { remote: emailConfig.remote })
		}))
	}
}

function applyBindingsConfig(
	config: MfOptionsWithEmail,
	bindings: MiniflareOptions['bindings']
): void {
	if (!bindings || Object.keys(bindings).length === 0) {
		return
	}

	config.bindings = bindings
}

function applyQueueConfig(config: MfOptionsWithEmail, queues: MiniflareOptions['queues']): void {
	if (!queues?.length) {
		return
	}

	config.queueProducers = Object.fromEntries(queues.map((queueName) => [queueName, { queueName }]))
}

function applyRateLimitConfig(
	config: MfOptionsWithEmail,
	rateLimits: MiniflareOptions['rateLimits']
): void {
	if (!rateLimits || Object.keys(rateLimits).length === 0) {
		return
	}

	config.ratelimits = rateLimits
}

function applyVersionMetadataConfig(
	config: MfOptionsWithEmail,
	versionMetadata: MiniflareOptions['versionMetadata']
): void {
	if (!versionMetadata) {
		return
	}

	config.versionMetadata = versionMetadata
}

function applyWorkerLoaderConfig(
	config: MfOptionsWithEmail,
	workerLoaders: MiniflareOptions['workerLoaders']
): void {
	if (!workerLoaders || Object.keys(workerLoaders).length === 0) {
		return
	}

	config.workerLoaders = workerLoaders
}

function applyMtlsCertificateConfig(
	config: MfOptionsWithEmail,
	mtlsCertificates: MiniflareOptions['mtlsCertificates']
): void {
	if (!mtlsCertificates || Object.keys(mtlsCertificates).length === 0) {
		return
	}

	config.mtlsCertificates = mtlsCertificates
}

function applyDispatchNamespaceConfig(
	config: MfOptionsWithEmail,
	dispatchNamespaces: MiniflareOptions['dispatchNamespaces']
): void {
	if (!dispatchNamespaces || Object.keys(dispatchNamespaces).length === 0) {
		return
	}

	config.dispatchNamespaces = dispatchNamespaces
}

function applyWorkflowConfig(
	config: MfOptionsWithEmail,
	workflows: MiniflareOptions['workflows'],
	persistPath: string | undefined
): void {
	if (!workflows || Object.keys(workflows).length === 0) {
		return
	}

	config.workflows = workflows
	if (persistPath) {
		config.workflowsPersist = `${persistPath}/workflows`
	}
}

function applyPipelineConfig(
	config: MfOptionsWithEmail,
	pipelines: MiniflareOptions['pipelines']
): void {
	if (!pipelines || Object.keys(pipelines).length === 0) {
		return
	}

	config.pipelines = pipelines
}

function applyImagesConfig(
	config: MfOptionsWithEmail,
	images: MiniflareOptions['images'],
	persistPath: string | undefined
): void {
	if (!images) {
		return
	}

	config.images = images
	if (persistPath) {
		config.imagesPersist = `${persistPath}/images`
	}
}

function applyMediaConfig(config: MfOptionsWithEmail, media: MiniflareOptions['media']): void {
	if (!media) {
		return
	}

	config.media = media
}

function applyAnalyticsEngineConfig(
	config: MfOptionsWithEmail,
	analyticsEngine: MiniflareOptions['analyticsEngine']
): void {
	if (!analyticsEngine || Object.keys(analyticsEngine).length === 0) {
		return
	}

	config.analyticsEngineDatasets = analyticsEngine
}

function applyArtifactsConfig(
	config: MfOptionsWithEmail,
	artifacts: MiniflareOptions['artifacts']
): void {
	if (!artifacts || Object.keys(artifacts).length === 0) {
		return
	}

	config.artifacts = artifacts
}

function applySecretsStoreConfig(
	config: MfOptionsWithEmail,
	secretsStore: MiniflareOptions['secretsStore']
): void {
	if (!secretsStore || Object.keys(secretsStore).length === 0) {
		return
	}

	config.secretsStoreSecrets = secretsStore
}

function applyServiceBindingsConfig(
	config: MfOptionsWithEmail,
	serviceBindings: MiniflareOptions['serviceBindings']
): void {
	if (!serviceBindings || Object.keys(serviceBindings).length === 0) {
		return
	}

	config.serviceBindings = serviceBindings
}

function applyWrappedBindingsConfig(
	config: MfOptionsWithEmail,
	wrappedBindings: MiniflareOptions['wrappedBindings']
): void {
	if (!wrappedBindings || Object.keys(wrappedBindings).length === 0) {
		return
	}

	config.wrappedBindings = wrappedBindings
}

function createConfigWithAuxiliaryWorkers(
	config: MfOptionsWithEmail,
	auxiliaryWorkers: MiniflareOptions['auxiliaryWorkers']
): MfOptionsWithEmail {
	if (!auxiliaryWorkers || auxiliaryWorkers.length === 0) {
		return config
	}

	const {
		port,
		host,
		log,
		kvPersist,
		r2Persist,
		d1Persist,
		durableObjectsPersist,
		workflowsPersist,
		imagesPersist,
		...primaryWorker
	} = config
	const primaryWorkerRecord = primaryWorker as Record<string, unknown>
	const primaryWorkerName =
		typeof primaryWorkerRecord.name === 'string' ? primaryWorkerRecord.name : 'devflare-gateway'

	return {
		...(port !== undefined && { port }),
		...(host && { host }),
		...(log && { log }),
		...(kvPersist && { kvPersist }),
		...(r2Persist && { r2Persist }),
		...(d1Persist && { d1Persist }),
		...(durableObjectsPersist && { durableObjectsPersist }),
		...(workflowsPersist && { workflowsPersist }),
		...(imagesPersist && { imagesPersist }),
		workers: [
			{
				...primaryWorkerRecord,
				name: primaryWorkerName
			},
			...auxiliaryWorkers
		]
	} as unknown as MfOptionsWithEmail
}

function createMiniflareConfig(
	options: MiniflareOptions,
	runtime: MiniflareRuntime
): MfOptionsWithEmail {
	const persistPath = resolvePersistPath(options)
	const config = createBaseMiniflareConfig(options, runtime)

	applyKVNamespaceConfig(config, options.kvNamespaces, persistPath)
	applyR2BucketConfig(config, options.r2Buckets, persistPath)
	applyD1DatabaseConfig(config, options.d1Databases, persistPath)
	applyDurableObjectConfig(config, options.durableObjects, persistPath)
	applySendEmailConfig(config, options.sendEmail)
	applyBindingsConfig(config, options.bindings)
	applyQueueConfig(config, options.queues)
	applyRateLimitConfig(config, options.rateLimits)
	applyVersionMetadataConfig(config, options.versionMetadata)
	applyWorkerLoaderConfig(config, options.workerLoaders)
	applyMtlsCertificateConfig(config, options.mtlsCertificates)
	applyDispatchNamespaceConfig(config, options.dispatchNamespaces)
	applyWorkflowConfig(config, options.workflows, persistPath)
	applyPipelineConfig(config, options.pipelines)
	applyImagesConfig(config, options.images, persistPath)
	applyMediaConfig(config, options.media)
	applyAnalyticsEngineConfig(config, options.analyticsEngine)
	if (options.tailConsumers && options.tailConsumers.length > 0) {
		config.tails = options.tailConsumers
	}
	if (options.streamingTailConsumers && options.streamingTailConsumers.length > 0) {
		config.streamingTails = options.streamingTailConsumers
	}
	applyArtifactsConfig(config, options.artifacts)
	applySecretsStoreConfig(config, options.secretsStore)
	applyServiceBindingsConfig(config, options.serviceBindings)
	applyWrappedBindingsConfig(config, options.wrappedBindings)

	return createConfigWithAuxiliaryWorkers(config, options.auxiliaryWorkers)
}

function bindMiniflareMethod<TMethodName extends keyof MiniflareType>(
	mf: MiniflareType,
	methodName: TMethodName
): MiniflareType[TMethodName] {
	const method = mf[methodName]
	if (typeof method === 'function') {
		return method.bind(mf) as MiniflareType[TMethodName]
	}

	return (async () => {
		throw new Error(`Miniflare runtime does not expose ${String(methodName)}`)
	}) as unknown as MiniflareType[TMethodName]
}

function getPrimaryWorkerName(config: MfOptionsWithEmail): string | undefined {
	const [primaryWorker] = config.workers ?? []
	const name = primaryWorker?.name
	return typeof name === 'string' ? name : undefined
}

export function createMiniflareInstanceHandle(
	mf: MiniflareType,
	primaryWorkerName?: string,
	nodeBindingOverrides: Record<string, unknown> = {}
): MiniflareInstance {
	return {
		ready: Promise.resolve(),

		async dispose() {
			const dispose = (mf as { dispose?: unknown }).dispose
			if (typeof dispose !== 'function') {
				return
			}

			try {
				await dispose.call(mf)
			} catch (error) {
				if (!isIgnorableMiniflareDisposeError(error)) {
					throw error
				}
			}
		},

		async getBindings() {
			const bindings = primaryWorkerName
				? await mf.getBindings(primaryWorkerName)
				: await mf.getBindings()
			return {
				...bindings,
				...nodeBindingOverrides
			}
		},

		getKVNamespace: bindMiniflareMethod(mf, 'getKVNamespace'),
		getR2Bucket: bindMiniflareMethod(mf, 'getR2Bucket'),
		getD1Database: bindMiniflareMethod(mf, 'getD1Database'),
		getDurableObjectNamespace: bindMiniflareMethod(mf, 'getDurableObjectNamespace'),
		dispatchFetch: bindMiniflareMethod(mf, 'dispatchFetch'),

		_mf: mf
	}
}

// -----------------------------------------------------------------------------
// Miniflare Instance Creation
// -----------------------------------------------------------------------------

/**
 * Start a Miniflare instance with the given configuration
 */
export async function startMiniflare(options: MiniflareOptions = {}): Promise<MiniflareInstance> {
	const runtime = await loadMiniflareRuntime()
	const mfConfig = createMiniflareConfig(options, runtime)
	const mf = new runtime.Miniflare(mfConfig as MfOptions)
	await mf.ready

	return createMiniflareInstanceHandle(
		mf,
		getPrimaryWorkerName(mfConfig),
		options.nodeBindingOverrides
	)
}

// -----------------------------------------------------------------------------
// Config-based Miniflare Creation
// -----------------------------------------------------------------------------

/**
 * Start Miniflare from a devflare config
 */
export async function startMiniflareFromConfig(
	config: DevflareConfig,
	options: Partial<MiniflareOptions> = {}
): Promise<MiniflareInstance> {
	const runtimeConfig = options.cwd
		? await applyLocalDevVarsToConfig(
				await resolveConfigEnvVars(config, {
					cwd: options.cwd,
					configPath: options.configPath,
					mode: 'dev'
				}),
				{
					cwd: options.cwd,
					configPath: options.configPath,
					environment: options.environment
				}
			)
		: config
	const bindings = runtimeConfig.bindings ?? {}
	const localSecretWrappedBindingConfig = options.cwd
		? buildLocalSecretWrappedBindingConfig(runtimeConfig, options.cwd)
		: undefined
	const localSecretNodeBindings = options.cwd
		? buildLocalSecretNodeBindings(runtimeConfig, options.cwd)
		: undefined
	const localSecretBindingNames = new Set(localSecretWrappedBindingConfig?.localBindingNames ?? [])
	const localBindingShimServiceConfig = buildLocalBindingShimServiceConfig(runtimeConfig)
	const wrappedBindings = {
		...(localSecretWrappedBindingConfig?.wrappedBindings ?? {})
	}
	const auxiliaryWorkers = [
		...(localSecretWrappedBindingConfig?.workers ?? []),
		...localBindingShimServiceConfig.workers
	]

	// For Miniflare, pass the full mapping to ensure consistent namespace/database IDs
	const mfOptions: MiniflareOptions = {
		...options,
		compatibilityDate: runtimeConfig.compatibilityDate,
		compatibilityFlags: runtimeConfig.compatibilityFlags,
		kvNamespaces: bindings.kv
			? Object.fromEntries(
					Object.entries(bindings.kv).map(([bindingName, bindingConfig]) => {
						return [bindingName, getLocalKVNamespaceIdentifier(bindingConfig)]
					})
				)
			: undefined,
		r2Buckets: bindings.r2
			? Object.fromEntries(
					Object.entries(bindings.r2).map(([bindingName, bindingConfig]) => {
						return [bindingName, normalizeR2Binding(bindingConfig).bucketName]
					})
				)
			: undefined,
		d1Databases: bindings.d1
			? Object.fromEntries(
					Object.entries(bindings.d1).map(([bindingName, bindingConfig]) => {
						return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
					})
				)
			: undefined,
		queues: bindings.queues?.consumers?.map((c) => c.queue),
		rateLimits: bindings.rateLimits
			? Object.fromEntries(
					Object.entries(bindings.rateLimits).map(([bindingName, binding]) => [
						bindingName,
						{
							simple: {
								limit: binding.simple.limit,
								period: binding.simple.period
							}
						}
					])
				)
			: undefined,
		versionMetadata: bindings.versionMetadata?.binding,
		workerLoaders: bindings.workerLoaders
			? Object.fromEntries(
					Object.keys(bindings.workerLoaders).map((bindingName) => [bindingName, {}])
				)
			: undefined,
		mtlsCertificates: bindings.mtlsCertificates
			? Object.fromEntries(
					Object.entries(bindings.mtlsCertificates).map(([bindingName, binding]) => {
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
			: undefined,
		dispatchNamespaces: bindings.dispatchNamespaces
			? Object.fromEntries(
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
			: undefined,
		workflows: bindings.workflows
			? Object.fromEntries(
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
			: undefined,
		pipelines: bindings.pipelines
			? Object.fromEntries(
					Object.entries(bindings.pipelines).map(([bindingName, binding]) => {
						const normalized = normalizePipelineBinding(binding)
						return [
							bindingName,
							typeof binding === 'string' ? normalized.pipeline : { pipeline: normalized.pipeline }
						]
					})
				)
			: undefined,
		images: bindings.images
			? (() => {
					if (localBindingShimServiceConfig.localBindingNames.length > 0) return undefined
					const [entry] = Object.entries(bindings.images ?? {})
					if (!entry) return undefined
					const [bindingName, binding] = entry
					const normalized = normalizeImagesBinding(bindingName, binding)
					return { binding: normalized.binding }
				})()
			: undefined,
		media: bindings.media
			? (() => {
					if (localBindingShimServiceConfig.localBindingNames.length > 0) return undefined
					const [entry] = Object.entries(bindings.media ?? {})
					if (!entry) return undefined
					const [bindingName, binding] = entry
					const normalized = normalizeMediaBinding(bindingName, binding)
					return { binding: normalized.binding }
				})()
			: undefined,
		analyticsEngine: bindings.analyticsEngine
			? Object.fromEntries(
					Object.entries(bindings.analyticsEngine).map(([bindingName, binding]) => [
						bindingName,
						{
							dataset: binding.dataset
						}
					])
				)
			: undefined,
		tailConsumers: buildTailConsumersConfig(runtimeConfig),
		streamingTailConsumers: buildStreamingTailConsumersConfig(runtimeConfig),
		artifacts: bindings.artifacts
			? Object.fromEntries(
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
			: undefined,
		secretsStore: bindings.secretsStore
			? Object.fromEntries(
					Object.entries(bindings.secretsStore).flatMap(([bindingName, binding]) => {
						if (localSecretBindingNames.has(bindingName)) {
							return []
						}

						const normalized = normalizeSecretsStoreBinding(
							binding,
							runtimeConfig.secretsStoreId,
							bindingName
						)
						return [
							[
								bindingName,
								{
									store_id: normalized.storeId,
									secret_name: normalized.secretName
								}
							]
						]
					})
				)
			: undefined,
		sendEmail: bindings.sendEmail ? bindings.sendEmail : undefined,
		bindings: runtimeConfig.vars,
		serviceBindings: {
			...(options.serviceBindings ?? {}),
			...localBindingShimServiceConfig.serviceBindings
		},
		wrappedBindings: Object.keys(wrappedBindings).length > 0 ? wrappedBindings : undefined,
		auxiliaryWorkers: auxiliaryWorkers.length > 0 ? auxiliaryWorkers : undefined,
		nodeBindingOverrides: localSecretNodeBindings,
		durableObjects: bindings.durableObjects
			? Object.fromEntries(
					Object.entries(bindings.durableObjects).map(([bindingName, doConfig]) => {
						const normalized = normalizeDOBinding(doConfig)
						return [
							bindingName,
							{
								className: normalized.className,
								scriptPath: normalized.scriptName
							}
						]
					})
				)
			: undefined
	}

	return await startMiniflare(mfOptions)
}

// -----------------------------------------------------------------------------
// Singleton Instance Management
// -----------------------------------------------------------------------------

let globalMiniflare: MiniflareInstance | null = null

/**
 * Get or start the global Miniflare instance
 */
export async function getMiniflare(options?: MiniflareOptions): Promise<MiniflareInstance> {
	if (!globalMiniflare) {
		globalMiniflare = await startMiniflare(options)
	}
	return globalMiniflare
}

/**
 * Stop the global Miniflare instance
 */
export async function stopMiniflare(): Promise<void> {
	if (globalMiniflare) {
		await globalMiniflare.dispose()
		globalMiniflare = null
	}
}
