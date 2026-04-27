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
	normalizeDOBinding,
	normalizeArtifactsBinding,
	normalizeDispatchNamespaceBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeMtlsCertificateBinding,
	normalizePipelineBinding,
	normalizeSecretsStoreBinding,
	normalizeWorkflowBinding
} from '../config'
import { applyLocalDevVarsToConfig } from '../config/local-dev-vars'
import { seedMiniflareLocalSecrets } from '../secrets/local-secrets'
import { createMiniflareLog } from '../dev-server/miniflare-log'
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
	mtlsCertificates?: Record<string, { certificate_id: string }>
	/** Dispatch Namespace bindings */
	dispatchNamespaces?: Record<string, { namespace: string }>
	/** Workflow bindings */
	workflows?: Record<
		string,
		{
			name: string
			className: string
			scriptName?: string
			stepLimit?: number
		}
	>
	/** Pipeline bindings */
	pipelines?: Record<string, string | { pipeline: string }>
	/** Images binding */
	images?: { binding: string }
	/** Media Transformations binding */
	media?: { binding: string }
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
		}
	>
	/** Environment variables */
	bindings?: Record<string, string>
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
	queueProducers?: Record<string, { queueName: string }>
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
	artifacts?: MiniflareOptions['artifacts']
	secretsStoreSecrets?: MiniflareOptions['secretsStore']
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

	const log = createMiniflareLog(
		runtime.Log,
		runtime.LogLevel,
		options.verbose ? 'DEBUG' : 'WARN'
	)
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
			})
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
	applyArtifactsConfig(config, options.artifacts)
	applySecretsStoreConfig(config, options.secretsStore)

	return config
}

function createMiniflareInstanceHandle(mf: MiniflareType): MiniflareInstance {
	return {
		ready: Promise.resolve(),

		async dispose() {
			try {
				await mf.dispose()
			} catch (error) {
				if (!isIgnorableMiniflareDisposeError(error)) {
					throw error
				}
			}
		},

		async getBindings() {
			return mf.getBindings()
		},

		getKVNamespace: mf.getKVNamespace.bind(mf),
		getR2Bucket: mf.getR2Bucket.bind(mf),
		getD1Database: mf.getD1Database.bind(mf),
		getDurableObjectNamespace: mf.getDurableObjectNamespace.bind(mf),
		dispatchFetch: mf.dispatchFetch.bind(mf),

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
	const mf = new runtime.Miniflare(createMiniflareConfig(options, runtime) as MfOptions)
	await mf.ready

	return createMiniflareInstanceHandle(mf)
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
		? await applyLocalDevVarsToConfig(config, {
				cwd: options.cwd,
				configPath: options.configPath,
				environment: options.environment
			})
		: config
	const bindings = runtimeConfig.bindings ?? {}

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
		r2Buckets: bindings.r2 ? bindings.r2 : undefined,
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
								certificate_id: normalized.certificateId
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
					const [entry] = Object.entries(bindings.images ?? {})
					if (!entry) return undefined
					const [bindingName, binding] = entry
					const normalized = normalizeImagesBinding(bindingName, binding)
					return { binding: normalized.binding }
				})()
			: undefined,
		media: bindings.media
			? (() => {
					const [entry] = Object.entries(bindings.media ?? {})
					if (!entry) return undefined
					const [bindingName, binding] = entry
					const normalized = normalizeMediaBinding(bindingName, binding)
					return { binding: normalized.binding }
				})()
			: undefined,
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
					Object.entries(bindings.secretsStore).map(([bindingName, binding]) => {
						const normalized = normalizeSecretsStoreBinding(
							binding,
							runtimeConfig.secretsStoreId,
							bindingName
						)
						return [
							bindingName,
							{
								store_id: normalized.storeId,
								secret_name: normalized.secretName
							}
						]
					})
				)
			: undefined,
		sendEmail: bindings.sendEmail ? bindings.sendEmail : undefined,
		bindings: runtimeConfig.vars,
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

	const instance = await startMiniflare(mfOptions)
	if (options.cwd) {
		await seedMiniflareLocalSecrets(instance._mf, runtimeConfig, options.cwd)
	}

	return instance
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
