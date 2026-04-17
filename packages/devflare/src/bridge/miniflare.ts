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
	normalizeDOBinding
} from '../config'
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
	/** Send Email bindings */
	sendEmail?: Record<string, {
		destinationAddress?: string
		allowedDestinationAddresses?: string[]
		allowedSenderAddresses?: string[]
	}>
	/** Environment variables */
	bindings?: Record<string, string>
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
	return {
		modules: true,
		script: generateGatewayScript(),
		port: options.port ?? 8787,
		host: '127.0.0.1',
		log: options.verbose
			? new runtime.Log(runtime.LogLevel.DEBUG)
			: new runtime.Log(runtime.LogLevel.WARN),
		compatibilityDate: options.compatibilityDate ?? '2024-01-01',
		compatibilityFlags: options.compatibilityFlags ?? []
	}
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

function applyQueueConfig(
	config: MfOptionsWithEmail,
	queues: MiniflareOptions['queues']
): void {
	if (!queues?.length) {
		return
	}

	config.queueProducers = Object.fromEntries(
		queues.map((queueName) => [queueName, { queueName }])
	)
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

	return config
}

function createMiniflareInstanceHandle(mf: MiniflareType): MiniflareInstance {
	return {
		ready: Promise.resolve(),

		async dispose() {
			await mf.dispose()
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
	const bindings = config.bindings ?? {}

	// For Miniflare, pass the full mapping to ensure consistent namespace/database IDs
	const mfOptions: MiniflareOptions = {
		...options,
		compatibilityDate: config.compatibilityDate,
		compatibilityFlags: config.compatibilityFlags,
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
		sendEmail: bindings.sendEmail ? bindings.sendEmail : undefined,
		bindings: config.vars,
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

	return startMiniflare(mfOptions)
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
