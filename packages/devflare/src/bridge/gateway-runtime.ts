// =============================================================================
// Bridge Gateway Runtime — Shared Inline Script Source
// =============================================================================
// The gateway worker runs inside the Miniflare sandbox and cannot import from
// the host package at runtime. To avoid keeping two diverging copies of the
// dispatch/serialization logic, the shared pieces are defined here as a
// stringified JS template that is concatenated into both generated gateway
// scripts (see `miniflare.ts` and `dev-server/gateway-script.ts`).
//
// The canonical TypeScript transport lives in `./server.ts`. This file only
// contains the subset of behavior that both inline gateway variants need to
// agree on (RPC method vocabulary, error envelope, serialization helpers).
// =============================================================================

/**
 * Shared gateway helpers (base64, R2 serializers, email) and the RPC method
 * dispatcher. Designed to be embedded verbatim at the top level of a worker
 * module. All symbols are declared with `function`/`const` so they are
 * hoisted in both embedding sites.
 */
export const GATEWAY_RUNTIME_JS = `
const RAW_EMAIL = 'EmailMessage::raw'

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
	return {
		objects: result.objects.map(serializeR2Object),
		truncated: result.truncated,
		cursor: result.cursor,
		delimitedPrefixes: result.delimitedPrefixes
	}
}

async function serializeResponse(response) {
	let body = null
	if (response.body) {
		const bytes = await response.arrayBuffer()
		if (bytes.byteLength > 0) {
			body = { type: 'bytes', data: arrayBufferToBase64(bytes) }
		}
	}
	return {
		status: response.status,
		statusText: response.statusText,
		headers: [...response.headers.entries()],
		body
	}
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

function isDurableObjectNamespace(binding) {
	return !!binding
		&& typeof binding.idFromName === 'function'
		&& typeof binding.idFromString === 'function'
		&& typeof binding.newUniqueId === 'function'
}

/**
 * Execute an RPC method against the gateway's bindings.
 *
 * Method format: "binding.operation" (operation may contain dots, e.g.
 * "r2.get", "stmt.first", "stub.rpc"). Method vocabulary must stay in sync
 * with the canonical server in src/bridge/server.ts.
 */
async function executeRpcMethod(method, params, env, _ctx) {
	const parts = method.split('.')
	if (parts.length < 2) throw new Error('Invalid method format: ' + method)

	const bindingName = parts[0]
	const operation = parts.slice(1).join('.')
	const binding = env[bindingName]

	if (!binding) throw new Error('Binding not found: ' + bindingName)

	// KV Namespace / DO (disambiguated by binding shape)
	if (operation === 'get') {
		if (isDurableObjectNamespace(binding)) {
			return { __type: 'DOStub', binding: bindingName, id: params[0] }
		}
		return binding.get(params[0], params[1])
	}
	if (operation === 'put') return binding.put(params[0], params[1], params[2])
	if (operation === 'delete') return binding.delete(params[0])
	if (operation === 'list') return binding.list(params[0])
	if (operation === 'getWithMetadata') return binding.getWithMetadata(params[0], params[1])

	// R2
	if (operation === 'head') return serializeR2Object(await binding.head(params[0]))
	if (operation === 'r2.get') {
		const obj = await binding.get(params[0], params[1])
		if (!obj) return null
		const body = await obj.arrayBuffer()
		return serializeR2ObjectBody(obj, arrayBufferToBase64(body))
	}
	if (operation === 'r2.put') {
		let value = params[1]
		if (value && typeof value === 'object') {
			if (value.__type === 'ArrayBuffer' || value.__type === 'Uint8Array') {
				value = base64ToArrayBuffer(value.data)
			}
		}
		return serializeR2Object(await binding.put(params[0], value, params[2]))
	}
	if (operation === 'r2.delete') return binding.delete(params[0])
	if (operation === 'r2.list') return serializeR2Objects(await binding.list(params[0]))

	// D1
	if (operation === 'exec') return binding.exec(params[0])
	if (operation === 'batch') {
		const statements = params[0].map((s) => binding.prepare(s.sql).bind(...(s.bindings || [])))
		return binding.batch(statements)
	}
	if (operation.startsWith('stmt.')) {
		const mode = operation.split('.')[1]
		const [sql, ...rest] = params
		let bindings = rest
		let extraParam
		if (mode === 'first' || mode === 'raw') {
			extraParam = rest[rest.length - 1]
			bindings = rest.slice(0, -1)
		}
		let stmt = binding.prepare(sql)
		if (bindings.length > 0) stmt = stmt.bind(...bindings)
		if (mode === 'first') {
			if (typeof extraParam === 'string' && extraParam.length > 0) return stmt.first(extraParam)
			return stmt.first()
		}
		if (mode === 'all') return stmt.all()
		if (mode === 'run') return stmt.run()
		if (mode === 'raw') return stmt.raw(extraParam)
		throw new Error('Unknown stmt mode: ' + mode)
	}

	// Durable Objects
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
		const id = binding.idFromString(serializedId.hex)
		const stub = binding.get(id)
		const response = await stub.fetch(new Request(serializedReq.url, {
			method: serializedReq.method,
			headers: serializedReq.headers,
			body: serializedReq.body?.type === 'bytes'
				? base64ToArrayBuffer(serializedReq.body.data)
				: undefined
		}))
		return serializeResponse(response)
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

	// Queues
	if (operation === 'send') return binding.send(params[0], params[1])
	if (operation === 'sendBatch') return binding.sendBatch(params[0], params[1])

	// Send Email
	if (operation === 'email.send') {
		if (binding && typeof binding.send === 'function') {
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
		return { ok: true, simulated: true }
	}

	// AI / generic run()
	if (operation === 'run') {
		if (typeof binding.run !== 'function') {
			throw new Error('Binding ' + bindingName + ' does not support run(): ' + method)
		}
		return binding.run(params[0], params[1])
	}

	throw new Error('Unknown operation: ' + method)
}

// ---------------------------------------------------------------------------
// WebSocket bridge (shared with src/bridge/server.ts in shape)
// ---------------------------------------------------------------------------
// NOTE: wsProxies is intentionally created per handleBridgeWebSocket call so
// state never leaks across connections or across gateway-script regenerations.

async function handleBridgeRpcCall(msg, ws, env, ctx) {
	try {
		const result = await executeRpcMethod(msg.method, msg.params, env, ctx)
		ws.send(JSON.stringify({ t: 'rpc.ok', id: msg.id, result }))
	} catch (error) {
		ws.send(JSON.stringify({
			t: 'rpc.err',
			id: msg.id,
			error: {
				code: error?.code || 'INTERNAL_ERROR',
				message: error?.message || String(error)
			}
		}))
	}
}

async function handleBridgeWsOpen(msg, ws, env, wsProxies) {
	try {
		const binding = env[msg.target.binding]
		const id = binding.idFromString(msg.target.id)
		const stub = binding.get(id)

		const headers = new Headers(msg.target.headers || [])
		headers.set('Upgrade', 'websocket')

		const response = await stub.fetch(new Request(msg.target.url, { method: 'GET', headers }))
		const doWs = response.webSocket

		if (!doWs) {
			ws.send(JSON.stringify({
				t: 'rpc.err',
				id: 'ws_' + msg.wid,
				error: { code: 'WS_FAILED', message: 'No WebSocket returned' }
			}))
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
		ws.send(JSON.stringify({
			t: 'rpc.err',
			id: 'ws_' + msg.wid,
			error: { code: 'WS_FAILED', message: error.message }
		}))
	}
}

function handleBridgeWsClose(msg, wsProxies) {
	const proxy = wsProxies.get(msg.wid)
	if (proxy) {
		proxy.doWs.close(msg.code, msg.reason)
		wsProxies.delete(msg.wid)
	}
}

async function handleBridgeJsonMessage(data, ws, env, ctx, wsProxies) {
	const msg = JSON.parse(data)
	switch (msg.t) {
		case 'rpc.call':
			await handleBridgeRpcCall(msg, ws, env, ctx)
			break
		case 'ws.open':
			await handleBridgeWsOpen(msg, ws, env, wsProxies)
			break
		case 'ws.close':
			handleBridgeWsClose(msg, wsProxies)
			break
	}
}

function handleBridgeWebSocket(request, env, ctx) {
	const { 0: client, 1: server } = new WebSocketPair()
	server.accept()

	// Per-connection state: recreated for every bridge client so reloads and
	// concurrent clients never share WS proxy entries.
	const wsProxies = new Map()

	server.addEventListener('message', async (event) => {
		try {
			if (typeof event.data === 'string') {
				await handleBridgeJsonMessage(event.data, server, env, ctx, wsProxies)
			}
		} catch (error) {
			console.error('[Gateway] Error:', error)
		}
	})

	server.addEventListener('close', () => {
		for (const proxy of wsProxies.values()) {
			try { proxy.doWs.close() } catch {}
		}
		wsProxies.clear()
	})

	return new Response(null, { status: 101, webSocket: client })
}

// ---------------------------------------------------------------------------
// HTTP transfer for R2 bodies (shared with src/bridge/server.ts in shape)
// ---------------------------------------------------------------------------

async function handleHttpTransfer(request, env, url) {
	const transferIdEncoded = url.pathname.split('/').pop()
	const transferId = decodeURIComponent(transferIdEncoded || '')
	const [binding, ...keyParts] = transferId.split(':')
	const key = keyParts.join(':')
	const bucket = env[binding]

	if (!bucket) return new Response('Bucket not found: ' + binding, { status: 404 })

	if (request.method === 'PUT' || request.method === 'POST') {
		const result = await bucket.put(key, request.body)
		return new Response(JSON.stringify(serializeR2Object(result)), {
			headers: { 'Content-Type': 'application/json' }
		})
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
`
