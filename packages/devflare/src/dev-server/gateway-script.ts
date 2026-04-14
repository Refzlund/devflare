import type { WsRouteConfig } from '../config'

/**
 * Generates the gateway worker script inline.
 * @param wsRoutes - WebSocket routes for DO proxying
 * @param debug - Enable debug logging in gateway
 */
export function getGatewayScript(
	wsRoutes: WsRouteConfig[] = [],
	debug = false,
	appServiceBindingName: string | null = null
): string {
	const wsRoutesJson = JSON.stringify(wsRoutes)
	const appServiceBindingJson = JSON.stringify(appServiceBindingName)

	return `
// Bridge Gateway Worker — RPC Handler
// Handles all binding operations via WebSocket RPC
// Also handles WebSocket proxying to Durable Objects

const DEBUG = ${debug}
const log = (...args) => DEBUG && console.log('[Gateway]', ...args)

const activeStreams = new Map()
const wsProxies = new Map()
const incomingStreams = new Map()

// WebSocket routes configuration (injected at build time)
const WS_ROUTES = ${wsRoutesJson}
const APP_SERVICE_BINDING = ${appServiceBindingJson}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const isWebSocket = request.headers.get('Upgrade') === 'websocket'

		// Check if this is a WebSocket request matching a DO route
		if (isWebSocket) {
			const matchedRoute = matchWsRoute(url.pathname)
			if (matchedRoute) {
				return handleDoWebSocket(request, env, url, matchedRoute)
			}
			// Otherwise handle as bridge RPC WebSocket
			return handleBridgeWebSocket(request, env, ctx)
		}

		// HTTP endpoint for large file transfers
		if (url.pathname.startsWith('/_devflare/transfer/')) {
			return handleHttpTransfer(request, env, url)
		}

		// D1 migration endpoint
		if (url.pathname === '/_devflare/migrate' && request.method === 'POST') {
			return handleMigration(request, env)
		}

		// Email handler endpoint (simulates incoming email)
		if (url.pathname === '/cdn-cgi/handler/email' && request.method === 'POST') {
			return handleEmailIncoming(request, env, ctx, url)
		}

		// Health check
		if (url.pathname === '/_devflare/health') {
			return new Response(JSON.stringify({
				ok: true,
				bindings: Object.keys(env),
				wsRoutes: WS_ROUTES
			}), { headers: { 'Content-Type': 'application/json' } })
		}

		if (APP_SERVICE_BINDING) {
			const appWorker = env[APP_SERVICE_BINDING]
			if (appWorker && typeof appWorker.fetch === 'function') {
				return appWorker.fetch(request)
			}
		}

		return new Response('Devflare Bridge Gateway', { status: 200 })
	}
}

// Handle D1 migrations
async function handleMigration(request, env) {
	try {
		const { bindingName, statements } = await request.json()
		log('Migration request for binding:', bindingName, 'statements count:', statements?.length, 'bindings:', Object.keys(env))
		const db = env[bindingName]
		if (!db) {
			return Response.json({ error: 'Binding not found: ' + bindingName }, { status: 404 })
		}

		const results = []
		for (const sql of statements) {
			try {
				log('Running migration SQL:', sql.slice(0, 80))
				await db.prepare(sql).run()
				results.push({ sql: sql.slice(0, 50), success: true })
				log('Migration SQL succeeded')
			} catch (error) {
				const msg = error?.message || String(error)
				log('Migration SQL error:', msg)
				if (msg.includes('already exists')) {
					results.push({ sql: sql.slice(0, 50), success: true, skipped: true })
				} else {
					results.push({ sql: sql.slice(0, 50), success: false, error: msg })
				}
			}
		}
		
		// Verify table exists after migration
		try {
			const tables = await db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all()
			log('Tables after migration:', JSON.stringify(tables))
		} catch (e) {
			log('Error listing tables:', e.message)
		}
		
		return Response.json({ success: true, results })
	} catch (error) {
		return Response.json({ error: error?.message || String(error) }, { status: 500 })
	}
}

// Handle incoming email (simulates email() handler)
async function handleEmailIncoming(request, env, ctx, url) {
	try {
		const from = url.searchParams.get('from') || 'unknown@example.com'
		const to = url.searchParams.get('to') || 'worker@example.com'
		const rawBody = await request.text()
		
		log('Email incoming:', { from, to, bodyLength: rawBody.length })

		if (APP_SERVICE_BINDING) {
			const appWorker = env[APP_SERVICE_BINDING]
			if (appWorker && typeof appWorker.fetch === 'function') {
				const response = await appWorker.fetch(new Request('http://devflare.internal/_devflare/internal/email', {
					method: 'POST',
					headers: {
						'x-devflare-event': 'email',
						'x-devflare-email-from': from,
						'x-devflare-email-to': to,
						'content-type': request.headers.get('content-type') || 'text/plain'
					},
					body: rawBody
				}))

				if (!response.ok) {
					return response
				}
			}
		}
		
		return new Response(JSON.stringify({ ok: true, from, to }), {
			headers: { 'Content-Type': 'application/json' }
		})
	} catch (error) {
		console.error('[Gateway] Email handler error:', error)
		return Response.json({ error: error?.message || String(error) }, { status: 500 })
	}
}

// Match URL path against configured WS routes
function matchWsRoute(pathname) {
	for (const route of WS_ROUTES) {
		// Simple exact match for now (could add glob/regex later)
		if (pathname === route.pattern || pathname.startsWith(route.pattern + '?')) {
			return route
		}
	}
	return null
}

// Handle WebSocket upgrade that should go to a Durable Object
async function handleDoWebSocket(request, env, url, route) {
	try {
		// Get the DO namespace
		const namespace = env[route.doNamespace]
		if (!namespace) {
			console.error('[Gateway] DO namespace not found:', route.doNamespace)
			return new Response('DO namespace not found: ' + route.doNamespace, { status: 500 })
		}

		// Get the instance ID from query params
		const idValue = url.searchParams.get(route.idParam) || 'default'

		// Get or create DO instance
		const doId = namespace.idFromName(idValue)
		const stub = namespace.get(doId)

		// Construct the forward URL for the DO
		const forwardUrl = new URL(route.forwardPath, url.origin)
		// Forward all query params
		url.searchParams.forEach((v, k) => forwardUrl.searchParams.set(k, v))

		log('Forwarding WebSocket to DO:', route.doNamespace, 'id:', idValue, 'path:', forwardUrl.pathname)

		// Forward the request to the DO
		return stub.fetch(forwardUrl.toString(), {
			method: request.method,
			headers: request.headers
		})
	} catch (error) {
		console.error('[Gateway] Error forwarding to DO:', error)
		return new Response('Error forwarding to DO: ' + error.message, { status: 500 })
	}
}

// Handle bridge RPC WebSocket (for Node.js Vite server communication)
function handleBridgeWebSocket(request, env, ctx) {
	const { 0: client, 1: server } = new WebSocketPair()
	server.accept()

	server.addEventListener('message', async (event) => {
		try {
			if (typeof event.data === 'string') {
				await handleJsonMessage(event.data, server, env, ctx)
			}
		} catch (error) {
			console.error('[Gateway] Error:', error)
		}
	})

	server.addEventListener('close', () => {
		activeStreams.clear()
		wsProxies.clear()
	})

	return new Response(null, { status: 101, webSocket: client })
}

async function handleJsonMessage(data, ws, env, ctx) {
	const msg = JSON.parse(data)

	switch (msg.t) {
		case 'rpc.call':
			await handleRpcCall(msg, ws, env, ctx)
			break
		case 'ws.open':
			await handleWsOpen(msg, ws, env)
			break
		case 'ws.close':
			handleWsClose(msg)
			break
	}
}

async function handleRpcCall(msg, ws, env, ctx) {
	try {
		const result = await executeRpcMethod(msg.method, msg.params, env, ctx)
		ws.send(JSON.stringify({ t: 'rpc.ok', id: msg.id, result }))
	} catch (error) {
		ws.send(JSON.stringify({
			t: 'rpc.err',
			id: msg.id,
			error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
		}))
	}
}

async function executeRpcMethod(method, params, env, ctx) {
	const parts = method.split('.')
	const bindingName = parts[0]
	const operation = parts.slice(1).join('.')
	const binding = env[bindingName]
	const RAW_EMAIL = 'EmailMessage::raw'

	if (!binding) throw new Error('Binding not found: ' + bindingName)

	// KV operations
	if (operation === 'get') return binding.get(params[0], params[1])
	if (operation === 'put') return binding.put(params[0], params[1], params[2])
	if (operation === 'delete') return binding.delete(params[0])
	if (operation === 'list') return binding.list(params[0])
	if (operation === 'getWithMetadata') return binding.getWithMetadata(params[0], params[1])

	// R2 operations
	if (operation === 'head') return serializeR2Object(await binding.head(params[0]))
	if (operation === 'r2.get') {
		const obj = await binding.get(params[0], params[1])
		if (!obj) return null
		const body = await obj.arrayBuffer()
		return serializeR2ObjectBody(obj, arrayBufferToBase64(body))
	}
	if (operation === 'r2.put') {
		// Deserialize the value if it's a serialized ArrayBuffer/Uint8Array
		let value = params[1]
		if (value && typeof value === 'object') {
			if (value.__type === 'ArrayBuffer') {
				value = base64ToArrayBuffer(value.data)
			} else if (value.__type === 'Uint8Array') {
				value = base64ToArrayBuffer(value.data)
			}
		}
		return serializeR2Object(await binding.put(params[0], value, params[2]))
	}
	if (operation === 'r2.delete') return binding.delete(params[0])
	if (operation === 'r2.list') return serializeR2Objects(await binding.list(params[0]))

	// D1 operations
	if (operation === 'exec') return binding.exec(params[0])
	if (operation.startsWith('stmt.')) {
		log('D1 RPC:', bindingName, operation, 'sql:', String(params[0]).slice(0, 60))
		const mode = operation.split('.')[1]
		const [sql, ...rest] = params
		
		// For first/raw, the last element is the column/options parameter (may be undefined)
		// For all/run, rest contains only bindings
		let bindings = rest
		let extraParam = undefined
		
		if (mode === 'first' || mode === 'raw') {
			// Last element is the column/options (may be undefined)
			extraParam = rest[rest.length - 1]
			bindings = rest.slice(0, -1)
		}
		
		let stmt = binding.prepare(sql)
		if (bindings.length > 0) stmt = stmt.bind(...bindings)
		
		if (mode === 'first') {
			// Only pass column if it's a non-empty string
			if (typeof extraParam === 'string' && extraParam.length > 0) {
				return stmt.first(extraParam)
			}
			return stmt.first()
		}
		if (mode === 'all') return stmt.all()
		if (mode === 'run') return stmt.run()
		if (mode === 'raw') return stmt.raw(extraParam)
	}

	// DO operations
	if (operation === 'idFromName') {
		const id = binding.idFromName(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (operation === 'idFromString') {
		const id = binding.idFromString(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (operation === 'newUniqueId') {
		const id = binding.newUniqueId(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (operation === 'stub.fetch') {
		const [, serializedId, serializedReq] = params
		log('stub.fetch request:', {
			url: serializedReq.url,
			method: serializedReq.method,
			headers: serializedReq.headers,
			hasBody: !!serializedReq.body
		})
		const id = binding.idFromString(serializedId.hex)
		const stub = binding.get(id)
		try {
			const response = await stub.fetch(new Request(serializedReq.url, {
				method: serializedReq.method,
				headers: serializedReq.headers,
				body: serializedReq.body?.type === 'bytes' ? base64ToArrayBuffer(serializedReq.body.data) : undefined
			}))
			// Clone to read body for logging if there's an error
			const cloned = response.clone()
			const serialized = await serializeResponse(response)
			log('stub.fetch response:', {
				status: serialized.status,
				headers: serialized.headers,
				bodyLength: serialized.body?.data?.length || 0
			})
			// If 500, log the body content
			if (response.status >= 400) {
				const errBody = await cloned.text()
				log('Error response body:', errBody)
			}
			return serialized
		} catch (err) {
			console.error('[Gateway] stub.fetch error:', err)
			throw err
		}
	}
	if (operation === 'stub.rpc') {
		const [, serializedId, methodName, args] = params
		const id = binding.idFromString(serializedId.hex)
		const stub = binding.get(id)
		const response = await stub.fetch(new Request('http://do/_rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: methodName, params: args })
		}))
		const result = await response.json()
		if (!result.ok) throw new Error(result.error?.message || 'RPC failed')
		return result.result
	}

	// Queue operations
	if (operation === 'send') return binding.send(params[0], params[1])
	if (operation === 'sendBatch') return binding.sendBatch(params[0], params[1])

	// Email send operations (send_email binding)
	if (operation === 'email.send') {
		const message = params[0]
		log('Email send:', { from: message?.from, to: message?.to })
		if (binding && typeof binding.send === 'function') {
			if (message && typeof message === 'object' && 'from' in message && 'to' in message && 'raw' in message) {
				return binding.send({
					from: message.from,
					to: message.to,
					[RAW_EMAIL]: createEmailMessageRaw(message.raw)
				})
			}
			return binding.send(message)
		}
		// Return success even if no real binding (simulated)
		return { ok: true, simulated: true }
	}

	throw new Error('Unknown operation: ' + method)
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

async function handleWsOpen(msg, ws, env) {
	try {
		const binding = env[msg.target.binding]
		const id = binding.idFromString(msg.target.id)
		const stub = binding.get(id)

		const headers = new Headers(msg.target.headers || [])
		headers.set('Upgrade', 'websocket')

		const response = await stub.fetch(new Request(msg.target.url, { method: 'GET', headers }))
		const doWs = response.webSocket

		if (!doWs) {
			ws.send(JSON.stringify({ t: 'rpc.err', id: 'ws_' + msg.wid, error: { code: 'WS_FAILED', message: 'No WebSocket returned' } }))
			return
		}

		doWs.accept()
		wsProxies.set(msg.wid, { doWs })

		doWs.addEventListener('message', (event) => {
			const isText = typeof event.data === 'string'
			const data = isText ? event.data : arrayBufferToBase64(event.data)
			ws.send(JSON.stringify({ t: 'ws.data', wid: msg.wid, data, isText }))
		})

		doWs.addEventListener('close', (event) => {
			ws.send(JSON.stringify({ t: 'ws.close', wid: msg.wid, code: event.code, reason: event.reason }))
			wsProxies.delete(msg.wid)
		})

		ws.send(JSON.stringify({ t: 'ws.opened', wid: msg.wid }))
	} catch (error) {
		ws.send(JSON.stringify({ t: 'rpc.err', id: 'ws_' + msg.wid, error: { code: 'WS_FAILED', message: error.message } }))
	}
}

function handleWsClose(msg) {
	const proxy = wsProxies.get(msg.wid)
	if (proxy) {
		proxy.doWs.close(msg.code, msg.reason)
		wsProxies.delete(msg.wid)
	}
}

async function handleHttpTransfer(request, env, url) {
	const transferIdEncoded = url.pathname.split('/').pop()
	const transferId = decodeURIComponent(transferIdEncoded || '')
	const [binding, ...keyParts] = transferId.split(':')
	const key = keyParts.join(':')
	const bucket = env[binding]

	if (!bucket) return new Response('Bucket not found: ' + binding, { status: 404 })

	if (request.method === 'PUT' || request.method === 'POST') {
		const result = await bucket.put(key, request.body)
		return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
	}

	if (request.method === 'GET') {
		const object = await bucket.get(key)
		if (!object) return new Response('Not found', { status: 404 })
		return new Response(object.body, {
			headers: {
				'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
				'Content-Length': String(object.size)
			}
		})
	}

	return new Response('Method not allowed', { status: 405 })
}

// Helpers
function serializeR2Object(obj) {
	if (!obj) return null
	return {
		__type: 'R2Object',
		key: obj.key,
		version: obj.version,
		size: obj.size,
		etag: obj.etag,
		httpEtag: obj.httpEtag,
		checksums: obj.checksums,
		uploaded: obj.uploaded?.toISOString(),
		httpMetadata: obj.httpMetadata,
		customMetadata: obj.customMetadata,
		range: obj.range,
		storageClass: obj.storageClass
	}
}
function serializeR2ObjectBody(obj, bodyData) {
	if (!obj) return null
	return {
		__type: 'R2ObjectBody',
		key: obj.key,
		version: obj.version,
		size: obj.size,
		etag: obj.etag,
		httpEtag: obj.httpEtag,
		checksums: obj.checksums,
		uploaded: obj.uploaded?.toISOString(),
		httpMetadata: obj.httpMetadata,
		customMetadata: obj.customMetadata,
		range: obj.range,
		storageClass: obj.storageClass,
		bodyData
	}
}
function serializeR2Objects(result) {
	if (!result) return null
	return { objects: result.objects.map(serializeR2Object), truncated: result.truncated, cursor: result.cursor }
}
async function serializeResponse(response) {
	// Read body as bytes and encode as base64
	let body = null
	if (response.body) {
		const bytes = await response.arrayBuffer()
		if (bytes.byteLength > 0) {
			body = { type: 'bytes', data: arrayBufferToBase64(bytes) }
		}
	}
	return { status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], body }
}
function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
	return btoa(binary)
}
function base64ToArrayBuffer(base64) {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes.buffer
}
`
}
