// =============================================================================
// Miniflare Orchestration — Programmatic Miniflare Management
// =============================================================================
// Spawns and manages Miniflare instances with all binding types
// =============================================================================

import type { Miniflare as MiniflareType } from 'miniflare'
import {
	getLocalD1DatabaseIdentifier,
	getLocalKVNamespaceIdentifier,
	normalizeDOBinding,
	type DevflareConfig,
	type DurableObjectBinding
} from '../config'

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

// -----------------------------------------------------------------------------
// Gateway Worker Script
// -----------------------------------------------------------------------------

/**
 * Generates a simple gateway worker script for direct Miniflare API access.
 * 
 * Note: This is a lightweight gateway for `startMiniflare()` usage (testing, scripts).
 * For the full bridge with WebSocket RPC, streaming, and WebSocket proxying,
 * see `server.ts` which is used by the dev command.
 */
function generateGatewayScript(): string {
	return `
// Gateway Worker — Provides RPC access to all bindings
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		
		// Health check
		if (url.pathname === '/_devflare/health') {
			return new Response(JSON.stringify({ status: 'ok', bindings: Object.keys(env) }), {
				headers: { 'Content-Type': 'application/json' }
			})
		}
		
		// RPC endpoint
		if (url.pathname === '/_devflare/rpc' && request.method === 'POST') {
			try {
				const { method, params } = await request.json()
				const result = await executeRpc(env, method, params)
				return new Response(JSON.stringify({ ok: true, result }), {
					headers: { 'Content-Type': 'application/json' }
				})
			} catch (error) {
				return new Response(JSON.stringify({
					ok: false,
					error: { code: 'RPC_ERROR', message: error.message }
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}
		
		return new Response('Devflare Gateway', { status: 200 })
	}
}

async function executeRpc(env, method, params) {
	const [bindingName, ...methodPath] = method.split('.')
	const binding = env[bindingName]
	const RAW_EMAIL = 'EmailMessage::raw'
	
	if (!binding) {
		throw new Error(\`Binding "\${bindingName}" not found\`)
	}
	
	const methodName = methodPath.join('.')
	
	// KV operations
	if (methodName === 'get') return binding.get(params[0], params[1])
	if (methodName === 'put') return binding.put(params[0], params[1], params[2])
	if (methodName === 'delete') return binding.delete(params[0])
	if (methodName === 'list') return binding.list(params[0])
	if (methodName === 'getWithMetadata') return binding.getWithMetadata(params[0], params[1])
	
	// R2 operations
	if (methodName === 'head') return binding.head(params[0])
	if (methodName === 'r2.get') return serializeR2Object(await binding.get(params[0], params[1]))
	if (methodName === 'r2.put') return serializeR2Object(await binding.put(params[0], params[1], params[2]))
	if (methodName === 'r2.delete') return binding.delete(params[0])
	if (methodName === 'r2.list') return serializeR2Objects(await binding.list(params[0]))
	
	// D1 operations
	if (methodName === 'exec') return binding.exec(params[0])
	if (methodName === 'batch') {
		const statements = params[0].map(s => binding.prepare(s.sql).bind(...(s.bindings || [])))
		return binding.batch(statements)
	}
	if (methodName.startsWith('stmt.')) {
		const [, stmtMethod] = methodName.split('.')
		const [sql, ...bindings] = params
		const stmt = binding.prepare(sql).bind(...bindings.slice(0, -1))
		
		if (stmtMethod === 'first') return stmt.first(bindings[bindings.length - 1])
		if (stmtMethod === 'all') return stmt.all()
		if (stmtMethod === 'run') return stmt.run()
		if (stmtMethod === 'raw') return stmt.raw(bindings[bindings.length - 1])
	}
	
	// DO operations
	if (methodName === 'idFromName') {
		const id = binding.idFromName(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (methodName === 'idFromString') {
		const id = binding.idFromString(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (methodName === 'newUniqueId') {
		const id = binding.newUniqueId(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (methodName === 'stub.fetch') {
		const [, doId, serializedReq] = params
		const id = binding.idFromString(doId.hex)
		const stub = binding.get(id)
		const response = await stub.fetch(new Request(serializedReq.url, {
			method: serializedReq.method,
			headers: serializedReq.headers,
			body: serializedReq.body?.type === 'bytes' ? atob(serializedReq.body.data) : undefined
		}))
		return serializeResponse(response)
	}
	if (methodName === 'stub.rpc') {
		// DO RPC: Call a method on the DO instance
		const [, doId, rpcMethod, rpcParams] = params
		const id = binding.idFromString(doId.hex)
		const stub = binding.get(id)
		
		// Use fetch to call the RPC endpoint
		const response = await stub.fetch(new Request('http://do/_rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: rpcMethod, params: rpcParams })
		}))
		
		const result = await response.json()
		if (!result.ok) throw new Error(result.error?.message || 'RPC failed')
		return result.result
	}
	
	// Queue operations
	if (methodName === 'send') return binding.send(params[0], params[1])
	if (methodName === 'sendBatch') return binding.sendBatch(params[0], params[1])

	// Send Email operations
	if (methodName === 'email.send') {
		const message = params[0]
		if (message && typeof message === 'object' && 'from' in message && 'to' in message && 'raw' in message) {
			return binding.send({
				from: message.from,
				to: message.to,
				[RAW_EMAIL]: createEmailMessageRaw(message.raw)
			})
		}
		return binding.send(message)
	}
	
	// Generic fallback
	if (typeof binding[methodName] === 'function') {
		return binding[methodName](...params)
	}
	
	throw new Error(\`Unknown method: \${method}\`)
}

function createEmailMessageRaw(raw) {
	if (typeof raw === 'string' || raw instanceof ReadableStream) {
		return raw
	}
	if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
		return new Response(raw).body
	}
	throw new Error('Unsupported EmailMessage raw payload')
}

function serializeResponse(response) {
	return {
		status: response.status,
		statusText: response.statusText,
		headers: [...response.headers.entries()],
		body: null // Will be streamed separately for large bodies
	}
}

function serializeR2Object(obj) {
	if (!obj) return null
	return {
		key: obj.key,
		version: obj.version,
		size: obj.size,
		etag: obj.etag,
		httpEtag: obj.httpEtag,
		uploaded: obj.uploaded?.toISOString(),
		httpMetadata: obj.httpMetadata,
		customMetadata: obj.customMetadata
	}
}

function serializeR2Objects(result) {
	if (!result) return null
	return {
		objects: result.objects.map(serializeR2Object),
		truncated: result.truncated,
		cursor: result.cursor,
		delimitedPrefixes: result.delimitedPrefixes
	}
}
`
}

// -----------------------------------------------------------------------------
// Miniflare Instance Creation
// -----------------------------------------------------------------------------

/**
 * Start a Miniflare instance with the given configuration
 */
export async function startMiniflare(options: MiniflareOptions = {}): Promise<MiniflareInstance> {
	// Dynamic import to avoid bundling issues
	const { Miniflare, Log, LogLevel } = await import('miniflare')
	type MfOptions = ConstructorParameters<typeof Miniflare>[0]
	type MfOptionsWithEmail = MfOptions & {
		email?: MiniflareSendEmailConfig
	}

	const port = options.port ?? 8787
	const persistPath = options.persistPath ?? '.devflare/data'

	// Build Miniflare configuration
	const mfConfig: MfOptionsWithEmail = {
		modules: true,
		script: generateGatewayScript(),
		port,
		host: '127.0.0.1',
		log: options.verbose ? new Log(LogLevel.DEBUG) : new Log(LogLevel.WARN),
		compatibilityDate: options.compatibilityDate ?? '2024-01-01',
		compatibilityFlags: options.compatibilityFlags ?? []
	}

	// Helper to check if binding config has entries
	const hasBindings = (val: string[] | Record<string, string> | undefined): boolean => {
		if (!val) return false
		if (Array.isArray(val)) return val.length > 0
		return Object.keys(val).length > 0
	}

	// Add KV namespaces
	if (hasBindings(options.kvNamespaces)) {
		mfConfig.kvNamespaces = options.kvNamespaces
		if (options.persist) {
			mfConfig.kvPersist = `${persistPath}/kv`
		}
	}

	// Add R2 buckets
	if (hasBindings(options.r2Buckets)) {
		mfConfig.r2Buckets = options.r2Buckets
		if (options.persist) {
			mfConfig.r2Persist = `${persistPath}/r2`
		}
	}

	// Add D1 databases
	if (hasBindings(options.d1Databases)) {
		mfConfig.d1Databases = options.d1Databases
		if (options.persist) {
			mfConfig.d1Persist = `${persistPath}/d1`
		}
	}

	// Add Durable Objects
	if (options.durableObjects) {
		mfConfig.durableObjects = options.durableObjects
		if (options.persist) {
			mfConfig.durableObjectsPersist = `${persistPath}/do`
		}
	}

	if (options.sendEmail) {
		mfConfig.email = {
			send_email: Object.entries(options.sendEmail).map(([name, config]) => ({
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

	// Add environment variables
	if (options.bindings && Object.keys(options.bindings).length > 0) {
		mfConfig.bindings = options.bindings
	}

	// Add queues
	if (options.queues?.length) {
		mfConfig.queueProducers = Object.fromEntries(
			options.queues.map((q) => [q, { queueName: q }])
		)
	}

	// Create Miniflare instance
	const mf = new Miniflare(mfConfig as MfOptions)

	// Wait for ready
	await mf.ready

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
