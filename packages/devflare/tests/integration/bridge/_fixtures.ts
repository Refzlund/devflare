// =============================================================================
// Bridge Test Fixtures — Shared test utilities and DO classes
// =============================================================================

import type { Miniflare } from 'miniflare'
import type { MiniflareInstance } from '../../../src/bridge/miniflare'

// =============================================================================
// Port Allocation (must be first - used by other exports)
// =============================================================================

// Use different ports for each test file to avoid conflicts
export const PORTS = {
	miniflare: 9787,
	durableObject: 9790,
	bridgeProxy: 9791,
	multiInstance1: 9788,
	multiInstance2: 9789,
	r2Transfer: 9793,
	r2Large: 9794,
	case18Do: 9795
} as const

// =============================================================================
// Gateway Worker Script Generator (must be before scripts that use it)
// =============================================================================

/**
 * Common executeRpc function used by all gateway workers.
 * Handles KV and DO RPC operations via WebSocket bridge.
 *
 * Operation names follow the namespaced convention shipped by the
 * production bridge proxy (see src/bridge/proxy.ts and src/bridge/server.ts):
 *   - kv.get / kv.put / kv.delete / kv.list
 *   - do.idFromName / do.fetch / do.rpc
 *
 * Bare-verb forms are also accepted for back-compat with older test scripts.
 */
const executeRpcScript = `
	async function executeRpc(env, method, params) {
		const [bindingName, ...rest] = method.split('.')
		let operation = rest.join('.')
		const binding = env[bindingName]

		if (!binding) throw new Error('Binding not found: ' + bindingName)

		// Strip leading kind prefix if present so the dispatcher below can stay
		// flat. (Test fixture only — production server warns and translates.)
		if (operation.indexOf('kv.') === 0) operation = operation.slice(3)
		else if (operation.indexOf('do.') === 0) {
			const tail = operation.slice(3)
			if (tail === 'fetch') operation = 'stub.fetch'
			else if (tail === 'rpc') operation = 'stub.rpc'
			else operation = tail
		}

		// KV operations
		if (operation === 'get') return binding.get(params[0], params[1])
		if (operation === 'put') return binding.put(params[0], params[1], params[2])
		if (operation === 'delete') return binding.delete(params[0])
		if (operation === 'list') return binding.list(params[0])

		// DO operations
		if (operation === 'idFromName') {
			const id = binding.idFromName(params[0])
			return { __type: 'DOId', hex: id.toString() }
		}
		if (operation === 'stub.fetch') {
			const [, idSerialized, reqSerialized] = params
			const id = binding.idFromString(idSerialized.hex)
			const stub = binding.get(id)
			const request = new Request(reqSerialized.url, {
				method: reqSerialized.method,
				headers: reqSerialized.headers,
				body: reqSerialized.body?.data ? atob(reqSerialized.body.data) : undefined
			})
			const response = await stub.fetch(request)
			return {
				status: response.status,
				statusText: response.statusText,
				headers: [...response.headers.entries()],
				body: null
			}
		}
		if (operation === 'stub.rpc') {
			const [, idSerialized, rpcMethod, rpcParams] = params
			const id = binding.idFromString(idSerialized.hex)
			const stub = binding.get(id)
			const response = await stub.fetch(new Request('http://do/_rpc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ method: rpcMethod, params: rpcParams })
			}))
			const result = await response.json()
			if (!result.ok) throw new Error(result.error?.message || 'RPC failed')
			return result.result
		}

		throw new Error('Unknown operation: ' + method)
	}
`

/**
 * Generate a gateway worker script with custom DO classes.
 * @param doClasses - String containing DO class definitions
 * @param gatewayName - Optional name for the gateway (for logging)
 */
export function createGatewayScript(
	doClasses: string,
	gatewayName = 'Devflare Bridge Gateway'
): string {
	return `
${doClasses}

	// Gateway worker that handles RPC over WebSocket
	export default {
		async fetch(request, env) {
			const url = new URL(request.url)

			// Health check
			if (url.pathname === '/_devflare/health') {
				return Response.json({ ok: true, bindings: Object.keys(env) })
			}

			// WebSocket upgrade for RPC
			if (request.headers.get('Upgrade') === 'websocket') {
				const { 0: client, 1: server } = new WebSocketPair()
				server.accept()

				server.addEventListener('message', async (event) => {
					try {
						const msg = JSON.parse(event.data)
						if (msg.t === 'rpc.call') {
							const result = await executeRpc(env, msg.method, msg.params)
							server.send(JSON.stringify({ t: 'rpc.ok', id: msg.id, result }))
						}
					} catch (error) {
						server.send(JSON.stringify({
							t: 'rpc.err',
							id: 'unknown',
							error: { code: 'RPC_ERROR', message: error.message }
						}))
					}
				})

				return new Response(null, { status: 101, webSocket: client })
			}

			return new Response('${gatewayName}')
		}
	}

${executeRpcScript}
`
}

// =============================================================================
// Durable Object Worker Scripts
// =============================================================================

/**
 * Counter DO worker script with RPC support.
 * This is used by both durable-object.test.ts and bridge-proxy.test.ts
 */
export const counterDoWorkerScript = `
	export class CounterDO {
		constructor(state, env) {
			this.state = state
			this.count = 0
			this.state.blockConcurrencyWhile(async () => {
				this.count = (await this.state.storage.get('count')) ?? 0
			})
		}

		async increment() {
			this.count++
			await this.state.storage.put('count', this.count)
			return this.count
		}

		async decrement() {
			this.count--
			await this.state.storage.put('count', this.count)
			return this.count
		}

		async getCount() {
			return this.count
		}

		async reset() {
			this.count = 0
			await this.state.storage.put('count', 0)
			return 0
		}

		async fetch(request) {
			const url = new URL(request.url)

			if (url.pathname === '/_rpc' && request.method === 'POST') {
				try {
					const { method, params } = await request.json()
					const fn = this[method]
					if (typeof fn !== 'function') {
						return Response.json({ ok: false, error: { message: 'Method not found: ' + method } })
					}
					const result = await fn.apply(this, params)
					return Response.json({ ok: true, result })
				} catch (error) {
					return Response.json({ ok: false, error: { message: error.message } })
				}
			}

			return new Response('Counter: ' + this.count)
		}
	}

	export default {
		async fetch(request, env) {
			return new Response('DO Worker Ready')
		}
	}
`

/**
 * Gateway worker script with DO RPC support.
 * Used by bridge-proxy.test.ts to test the full bridge flow.
 */
export const gatewayWorkerScript = createGatewayScript(`
	// Counter DO for testing RPC
	export class CounterDO {
		constructor(state, env) {
			this.state = state
			this.count = 0
			this.state.blockConcurrencyWhile(async () => {
				this.count = (await this.state.storage.get('count')) ?? 0
			})
		}

		async increment() {
			this.count++
			await this.state.storage.put('count', this.count)
			return this.count
		}

		async getCount() {
			return this.count
		}

		async reset() {
			this.count = 0
			await this.state.storage.put('count', 0)
			return 0
		}

		async fetch(request) {
			const url = new URL(request.url)
			if (url.pathname === '/_rpc' && request.method === 'POST') {
				try {
					const { method, params } = await request.json()
					const fn = this[method]
					if (typeof fn !== 'function') {
						return Response.json({ ok: false, error: { message: 'Method not found: ' + method } })
					}
					const result = await fn.apply(this, params)
					return Response.json({ ok: true, result })
				} catch (error) {
					return Response.json({ ok: false, error: { message: error.message } })
				}
			}
			return new Response('Counter: ' + this.count)
		}
	}
`)

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a MiniflareInstance wrapper from a raw Miniflare instance
 */
export function wrapMiniflare(miniflare: Miniflare): MiniflareInstance {
	return {
		ready: Promise.resolve(),
		dispose: () => miniflare.dispose(),
		getBindings: () => miniflare.getBindings(),
		getKVNamespace: miniflare.getKVNamespace.bind(miniflare),
		getR2Bucket: miniflare.getR2Bucket.bind(miniflare),
		getD1Database: miniflare.getD1Database.bind(miniflare),
		getDurableObjectNamespace: miniflare.getDurableObjectNamespace.bind(miniflare),
		dispatchFetch: miniflare.dispatchFetch.bind(miniflare),
		_mf: miniflare
	}
}

/**
 * Helper to call RPC on a DO stub
 */
export async function callDoRpc(
	stub: DurableObjectStub,
	method: string,
	params: unknown[] = []
): Promise<{ ok: boolean; result?: unknown; error?: { message: string } }> {
	const response = await stub.fetch('http://do/_rpc', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ method, params })
	})
	return response.json() as Promise<{ ok: boolean; result?: unknown; error?: { message: string } }>
}
