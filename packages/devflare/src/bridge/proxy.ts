// =============================================================================
// Bridge Proxy — The Magic `env` Object
// =============================================================================
// Creates a Proxy that transparently routes binding calls through the bridge
// =============================================================================

import { getClient, type BridgeClient } from './client'
import { HTTP_TRANSFER_THRESHOLD } from './v2/wire'
import {
	deserializeValue,
	serializeRequest,
	deserializeResponse,
	type SerializedResponse
} from './v2/value-serialization'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EnvProxyOptions {
	/** Bridge client to use (uses default if not provided) */
	client?: BridgeClient
	/** Lazily connect on first access */
	lazy?: boolean
	/** Transform results before returning (e.g., for transport decoding) */
	transformResult?: (result: unknown) => unknown
}

// -----------------------------------------------------------------------------
// KV Namespace Proxy
// -----------------------------------------------------------------------------

// Note: We use `any` at RPC boundaries because:
// 1. Values are serialized and sent cross-runtime (Node.js → workerd)
// 2. Cloudflare's KVNamespace types use generics that can't be preserved across RPC
// 3. The actual type safety is enforced by the real binding in Miniflare

function createKVProxy(client: BridgeClient, bindingName: string): KVNamespace {
	return {
		async get(key: string, options?: any): Promise<any> {
			return client.call(`${bindingName}.kv.get`, [key, options])
		},
		async put(key: string, value: any, options?: any): Promise<void> {
			await client.call(`${bindingName}.kv.put`, [key, value, options])
		},
		async delete(key: string): Promise<void> {
			await client.call(`${bindingName}.kv.delete`, [key])
		},
		async list(options?: any): Promise<any> {
			return client.call(`${bindingName}.kv.list`, [options])
		},
		async getWithMetadata(key: string, options?: any): Promise<any> {
			return client.call(`${bindingName}.kv.getWithMetadata`, [key, options])
		}
	} as KVNamespace
}

// -----------------------------------------------------------------------------
// R2 Bucket Proxy
// -----------------------------------------------------------------------------

function createR2Proxy(client: BridgeClient, bindingName: string): R2Bucket {
	return {
		async head(key: string): Promise<R2Object | null> {
			return client.call(`${bindingName}.r2.head`, [key]) as Promise<R2Object | null>
		},
		async get(key: string, options?: any): Promise<R2ObjectBody | R2Object | null> {
			return client.call(`${bindingName}.r2.get`, [key, options]) as Promise<R2ObjectBody | R2Object | null>
		},
		async put(key: string, value: any, options?: any): Promise<R2Object | null> {
			// Check if value is large enough to use HTTP transfer
			const size = getValueSize(value)
			if (size > HTTP_TRANSFER_THRESHOLD) {
				// Use HTTP transfer for large files
				// Send to Miniflare gateway which handles the transfer
				const transferId = `${bindingName}:${key}`
				const httpUrl = client.getHttpUrl()
				const transferUrl = httpUrl.replace(/\/$/, '') + `/_devflare/transfer/${encodeURIComponent(transferId)}`

				// Upload via HTTP directly to the gateway
				const response = await fetch(transferUrl, {
					method: 'PUT',
					body: value,
					headers: {
						...(options?.httpMetadata?.contentType
							? { 'Content-Type': options.httpMetadata.contentType }
							: {})
					}
				})

				if (!response.ok) {
					const error = await response.text()
					throw new Error(`HTTP transfer failed: ${error}`)
				}

				const serialized = await response.json() as unknown
				return deserializeValue(serialized) as R2Object | null
			}

			return client.call(`${bindingName}.r2.put`, [key, value, options]) as Promise<R2Object | null>
		},
		async delete(keys: string | string[]): Promise<void> {
			await client.call(`${bindingName}.r2.delete`, [keys])
		},
		async list(options?: any): Promise<R2Objects> {
			return client.call(`${bindingName}.r2.list`, [options]) as Promise<R2Objects>
		},
		async createMultipartUpload(key: string, options?: any): Promise<R2MultipartUpload> {
			return client.call(`${bindingName}.r2.createMultipartUpload`, [key, options]) as Promise<R2MultipartUpload>
		},
		async resumeMultipartUpload(key: string, uploadId: string): Promise<R2MultipartUpload> {
			return client.call(`${bindingName}.r2.resumeMultipartUpload`, [key, uploadId]) as Promise<R2MultipartUpload>
		}
	} as unknown as R2Bucket
}

function getValueSize(value: unknown): number {
	if (value instanceof Blob) return value.size
	if (value instanceof ArrayBuffer) return value.byteLength
	if (value instanceof Uint8Array) return value.byteLength
	if (typeof value === 'string') return new TextEncoder().encode(value).byteLength
	if (value instanceof ReadableStream) return Infinity  // Assume large
	return 0
}

// -----------------------------------------------------------------------------
// D1 Database Proxy
// -----------------------------------------------------------------------------

function createD1Proxy(client: BridgeClient, bindingName: string): D1Database {
	return {
		prepare(sql: string): D1PreparedStatement {
			return createD1StatementProxy(client, bindingName, sql, [])
		},
		async batch(statements: D1PreparedStatement[]): Promise<any> {
			// Serialize statements
			const serialized = statements.map((stmt) => {
				const s = stmt as any
				return { sql: s._sql, bindings: s._bindings }
			})
			return client.call(`${bindingName}.d1.batch`, [serialized])
		},
		async exec(sql: string): Promise<any> {
			return client.call(`${bindingName}.d1.exec`, [sql])
		},
		async dump(): Promise<ArrayBuffer> {
			return client.call(`${bindingName}.d1.dump`, []) as Promise<ArrayBuffer>
		}
	} as D1Database
}

function createD1StatementProxy(
	client: BridgeClient,
	bindingName: string,
	sql: string,
	bindings: unknown[]
): D1PreparedStatement {
	const stmt = {
		_sql: sql,
		_bindings: bindings,
		bind(...values: unknown[]): D1PreparedStatement {
			return createD1StatementProxy(client, bindingName, sql, values)
		},
		async first(column?: string): Promise<any> {
			return client.call(`${bindingName}.d1.stmt.first`, [sql, ...bindings, column])
		},
		async all(): Promise<any> {
			return client.call(`${bindingName}.d1.stmt.all`, [sql, ...bindings])
		},
		async run(): Promise<any> {
			return client.call(`${bindingName}.d1.stmt.run`, [sql, ...bindings])
		},
		async raw(options?: any): Promise<any> {
			return client.call(`${bindingName}.d1.stmt.raw`, [sql, ...bindings, options])
		}
	}
	return stmt as D1PreparedStatement
}

// -----------------------------------------------------------------------------
// Durable Object Namespace Proxy
// -----------------------------------------------------------------------------

interface DOProxyOptions {
	transformResult?: (result: unknown) => unknown
}

function createDOProxy(
	client: BridgeClient,
	bindingName: string,
	proxyOptions: DOProxyOptions = {}
): DurableObjectNamespace & { getByName(name: string): DurableObjectStub } {
	return {
		idFromName(name: string): DurableObjectId {
			// Create a local ID reference that will be used in RPC calls
			return createDOIdProxy(client, bindingName, { type: 'name', value: name })
		},
		idFromString(hexId: string): DurableObjectId {
			return createDOIdProxy(client, bindingName, { type: 'hex', value: hexId })
		},
		newUniqueId(options?: any): DurableObjectId {
			// Generate a unique ID locally (this will be synced on first use)
			const tempId = crypto.randomUUID().replace(/-/g, '')
			return createDOIdProxy(client, bindingName, { type: 'unique', value: tempId, options })
		},
		get(id: DurableObjectId): DurableObjectStub {
			const idProxy = id as DOIdProxy
			return createDOStubProxy(client, bindingName, idProxy._idInfo, proxyOptions)
		},
		/**
		 * Convenience method: Get a stub directly by name
		 * Equivalent to: namespace.get(namespace.idFromName(name))
		 */
		getByName(name: string): DurableObjectStub {
			const id = this.idFromName(name)
			return this.get(id)
		},
		jurisdiction(jurisdiction: string): DurableObjectNamespace {
			// Return a new proxy with jurisdiction info
			return createDOProxy(client, bindingName, proxyOptions)  // TODO: Add jurisdiction support
		}
	} as DurableObjectNamespace & { getByName(name: string): DurableObjectStub }
}

interface DOIdInfo {
	type: 'name' | 'hex' | 'unique'
	value: string
	options?: any
}

interface DOIdProxy extends DurableObjectId {
	_idInfo: DOIdInfo
}

function createDOIdProxy(client: BridgeClient, bindingName: string, idInfo: DOIdInfo): DurableObjectId {
	return {
		_idInfo: idInfo,
		toString(): string {
			if (idInfo.type === 'hex') return idInfo.value
			// For name-based IDs, we need to get the actual hex ID from the server
			// This is a limitation - toString() is sync but we need async
			return `${idInfo.type}:${idInfo.value}`
		},
		equals(other: DurableObjectId): boolean {
			return this.toString() === other.toString()
		}
	} as DOIdProxy
}

function createDOStubProxy(
	client: BridgeClient,
	bindingName: string,
	idInfo: DOIdInfo,
	proxyOptions: DOProxyOptions = {}
): DurableObjectStub {
	const { transformResult } = proxyOptions

	// Resolve the ID first
	let resolvedId: any = null
	const resolveId = async () => {
		if (resolvedId) return resolvedId
		switch (idInfo.type) {
			case 'name':
				resolvedId = await client.call(`${bindingName}.do.idFromName`, [idInfo.value])
				break
			case 'hex':
				resolvedId = { __type: 'DOId', hex: idInfo.value }
				break
			case 'unique':
				resolvedId = await client.call(`${bindingName}.do.newUniqueId`, [idInfo.options])
				break
		}
		return resolvedId
	}

	// Create a proxy that intercepts method calls for RPC
	const stubBase = {
		async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
			const id = await resolveId()
			const request = input instanceof Request ? input : new Request(input, init)

			const { serialized } = await serializeRequest(request)
			const result = await client.call(`${bindingName}.do.fetch`, [bindingName, id, serialized])

			// Deserialize response
			return deserializeResponse(result as SerializedResponse)
		},

		/**
		 * Connect to the Durable Object via WebSocket (hibernation pattern)
		 * 
		 * This creates a proxied WebSocket connection through the bridge.
		 * The DO must implement webSocketMessage/webSocketClose handlers.
		 */
		async connect(url: string, options?: { headers?: HeadersInit }): Promise<Socket> {
			const id = await resolveId()

			// Extract headers as array of tuples
			const headersList: [string, string][] = []
			if (options?.headers) {
				const headers = new Headers(options.headers)
				headers.forEach((value, key) => {
					headersList.push([key, value])
				})
			}

			// Create WebSocket proxy via bridge
			const wsProxy = await client.createWsProxy(
				bindingName,
				id.hex,
				url,
				headersList
			)

			// Create readable stream from WS messages
			let readController: ReadableStreamDefaultController<Uint8Array> | null = null
			const readable = new ReadableStream<Uint8Array>({
				start(controller) {
					readController = controller
				},
				cancel() {
					wsProxy.close()
				}
			})

			// Set up message handler
			wsProxy.onMessage((data) => {
				if (readController) {
					const chunk = typeof data === 'string'
						? new TextEncoder().encode(data)
						: data
					readController.enqueue(chunk)
				}
			})

			// Set up close handler
			wsProxy.onClose((code, reason) => {
				if (readController) {
					readController.close()
				}
			})

			// Create writable stream for sending
			const writable = new WritableStream<Uint8Array>({
				write(chunk) {
					wsProxy.send(chunk)
				},
				close() {
					wsProxy.close(1000, 'Normal closure')
				},
				abort(reason) {
					wsProxy.close(1001, reason?.toString() ?? 'Aborted')
				}
			})

			// Return Socket-like object
			return {
				readable,
				writable,
				get opened() {
					return Promise.resolve({
						remoteAddress: '127.0.0.1',
						localAddress: '127.0.0.1'
					})
				},
				get closed() {
					return new Promise<void>((resolve) => {
						wsProxy.onClose(() => resolve())
					})
				},
				close() {
					wsProxy.close(1000, 'Normal closure')
					return Promise.resolve()
				},
				startTls() {
					throw new Error('startTls not supported on DO WebSocket proxy')
				}
			} as unknown as Socket
		},

		get id(): DurableObjectId {
			return createDOIdProxy(client, bindingName, idInfo)
		},

		get name(): string | undefined {
			return idInfo.type === 'name' ? idInfo.value : undefined
		}
	}

	// Return a Proxy that intercepts any method call and routes to RPC
	return new Proxy(stubBase, {
		get(target, prop: string | symbol) {
			// Return known properties from the base stub
			if (prop in target) {
				return (target as any)[prop]
			}

			// Symbol properties - pass through
			if (typeof prop === 'symbol') {
				return undefined
			}

			if (prop === 'then' || prop === 'catch' || prop === 'finally') {
				return undefined
			}

			// Any other property is treated as an RPC method
			// Return a function that calls the DO via RPC
			return async (...args: unknown[]) => {
				const id = await resolveId()
				let result = await client.call(`${bindingName}.do.rpc`, [
					bindingName,
					id,
					prop,
					args
				])
				// Apply transport decoding if configured
				if (transformResult) {
					result = transformResult(result)
				}
				return result
			}
		}
	}) as unknown as DurableObjectStub
}

// -----------------------------------------------------------------------------
// Queue Proxy
// -----------------------------------------------------------------------------

function createQueueProxy(client: BridgeClient, bindingName: string): Queue<unknown> {
	return {
		async send(message: unknown, options?: any): Promise<void> {
			await client.call(`${bindingName}.queue.send`, [message, options])
		},
		async sendBatch(messages: any[], options?: any): Promise<void> {
			await client.call(`${bindingName}.queue.sendBatch`, [messages, options])
		}
	} as Queue<unknown>
}

// -----------------------------------------------------------------------------
// AI Proxy
// -----------------------------------------------------------------------------

function createAIProxy(client: BridgeClient, bindingName: string): any {
	return {
		async run(model: string, inputs: any, options?: any): Promise<any> {
			return client.call(`${bindingName}.ai.run`, [model, inputs, options])
		}
	}
}

// -----------------------------------------------------------------------------
// Send Email Proxy
// -----------------------------------------------------------------------------

function createSendEmailProxy(client: BridgeClient, bindingName: string): SendEmail {
	return {
		async send(message: EmailMessage | {
			from: string
			to: string | string[]
			subject: string
			replyTo?: string | EmailAddress
			cc?: string | string[]
			bcc?: string | string[]
			headers?: Record<string, string>
			text?: string
			html?: string
			attachments?: EmailAttachment[]
		}): Promise<EmailSendResult> {
			return client.call(`${bindingName}.email.send`, [message]) as Promise<EmailSendResult>
		}
	} as SendEmail
}

// -----------------------------------------------------------------------------
// Main Env Proxy
// -----------------------------------------------------------------------------

/** Binding type hints for better proxy creation */
export interface BindingHints {
	[key: string]: 'kv' | 'r2' | 'd1' | 'do' | 'queue' | 'ai' | 'service' | 'sendEmail' | 'secret' | 'var'
}

/** Module-level storage for binding hints */
let globalBindingHints: BindingHints = {}

/**
 * Create an env proxy that routes all binding access through the bridge
 */
export function createEnvProxy(options: EnvProxyOptions & { hints?: BindingHints } = {}): Record<string, unknown> {
	const client = options.client ?? getClient()
	const bindingProxies = new Map<string, unknown>()
	const doProxyOptions: DOProxyOptions = { transformResult: options.transformResult }

	// Merge provided hints with global hints (provided takes precedence)
	const hints: BindingHints = { ...globalBindingHints, ...options.hints }

	return new Proxy({} as Record<string, unknown>, {
		get(target, prop: string | symbol) {
			if (typeof prop !== 'string') return undefined

			// Return cached proxy
			if (bindingProxies.has(prop)) {
				return bindingProxies.get(prop)
			}

			// Create proxy based on hint or default behavior
			const hint = hints[prop]
			let proxy: unknown

			switch (hint) {
				case 'kv':
					proxy = createKVProxy(client, prop)
					break
				case 'r2':
					proxy = createR2Proxy(client, prop)
					break
				case 'd1':
					proxy = createD1Proxy(client, prop)
					break
				case 'do':
					proxy = createDOProxy(client, prop, doProxyOptions)
					break
				case 'queue':
					proxy = createQueueProxy(client, prop)
					break
				case 'ai':
					proxy = createAIProxy(client, prop)
					break
				case 'sendEmail':
					proxy = createSendEmailProxy(client, prop)
					break
				case 'secret':
				case 'var':
					// Simple values - need to fetch from server
					proxy = createSimpleBindingProxy(client, prop)
					break
				default:
					// Unknown binding - create a generic proxy that tries to detect type
					proxy = createGenericBindingProxy(client, prop)
			}

			bindingProxies.set(prop, proxy)
			return proxy
		},

		has(target, prop: string | symbol) {
			// Allow any string property
			return typeof prop === 'string'
		},

		ownKeys() {
			return Object.keys(hints)
		},

		getOwnPropertyDescriptor(target, prop) {
			if (typeof prop === 'string') {
				return { configurable: true, enumerable: true, writable: false }
			}
			return undefined
		}
	})
}

// Generic proxy for unknown binding types
function createGenericBindingProxy(client: BridgeClient, bindingName: string): unknown {
	return new Proxy({}, {
		get(target, prop: string | symbol) {
			if (typeof prop !== 'string') return undefined

			// Common KV methods
			if (['get', 'put', 'delete', 'list', 'getWithMetadata'].includes(prop)) {
				return createKVProxy(client, bindingName)[prop as keyof KVNamespace]
			}

			// Common DO methods
			if (['idFromName', 'idFromString', 'newUniqueId', 'get'].includes(prop)) {
				return createDOProxy(client, bindingName)[prop as keyof DurableObjectNamespace]
			}

			// Common D1 methods
			if (['prepare', 'batch', 'exec', 'dump'].includes(prop)) {
				return createD1Proxy(client, bindingName)[prop as keyof D1Database]
			}

			// Common R2 methods
			if (['head'].includes(prop)) {
				return createR2Proxy(client, bindingName)[prop as keyof R2Bucket]
			}

			// Fallback: call as generic method
			return async (...args: unknown[]) => {
				return client.call(`${bindingName}.${prop}`, args)
			}
		}
	})
}

// Simple binding proxy (for secrets/vars)
function createSimpleBindingProxy(client: BridgeClient, bindingName: string): unknown {
	// Return a thenable that fetches the value on await
	let cachedValue: unknown
	let fetched = false
	let pendingValue: Promise<unknown> | null = null

	const loadValue = () => {
		if (fetched) {
			return Promise.resolve(cachedValue)
		}

		if (!pendingValue) {
			pendingValue = client.call(`${bindingName}.var.value`, [])
				.then((value) => {
					cachedValue = value
					fetched = true
					return value
				})
				.catch((error) => {
					pendingValue = null
					throw error
				})
		}

		return pendingValue
	}

	return {
		then(
			resolve?: ((value: unknown) => unknown) | null,
			reject?: ((error: unknown) => unknown) | null
		) {
			return loadValue().then(resolve ?? undefined, reject ?? undefined)
		},
		toString() {
			if (!fetched) throw new Error(`Binding ${bindingName} not yet fetched. Use await.`)
			return String(cachedValue)
		}
	}
}

// -----------------------------------------------------------------------------
// Global env Export
// -----------------------------------------------------------------------------

let globalEnvProxy: Record<string, unknown> | null = null

/**
 * Get the global env proxy for bridge RPC.
 *
 * @internal
 * Internal bridge surface — not part of the documented public API. Prefer
 * `import { env } from 'devflare'`, which transparently picks the right
 * source (request context, test context, or bridge) for the current
 * environment. `bridgeEnv` is retained as an internal escape hatch for the
 * bridge implementation itself and may change without a major version bump.
 *
 * @example
 * ```ts
 * await bridgeEnv.MY_KV.get('key')
 * await bridgeEnv.MY_DO.get(id).fetch(request)
 * ```
 */
export const bridgeEnv: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
	get(target, prop: string | symbol) {
		if (!globalEnvProxy) {
			globalEnvProxy = createEnvProxy({ lazy: true })
		}
		return (globalEnvProxy as any)[prop]
	}
})

/**
 * Initialize the env proxy with specific options
 */
export function initEnv(options: EnvProxyOptions = {}): Record<string, unknown> {
	globalEnvProxy = createEnvProxy(options)
	return globalEnvProxy
}

/**
 * Set binding hints for better proxy creation
 * Hints help the bridge create optimized proxies for each binding type
 */
export function setBindingHints(hints: BindingHints): void {
	globalBindingHints = { ...globalBindingHints, ...hints }
	// Clear cached proxies so they're recreated with new hints
	globalEnvProxy = null
}
