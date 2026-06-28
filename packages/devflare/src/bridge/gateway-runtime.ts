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

// Inline body cap for proxied DO/service-fetch responses. Matches
// HTTP_TRANSFER_THRESHOLD in wire.ts (512 KB). A larger body would exceed
// workerd's ~1 MB WebSocket message limit once base64-encoded into the rpc.ok
// frame, so it is rejected with a clear error rather than silently truncated.
const HTTP_TRANSFER_THRESHOLD = 512 * 1024

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

// Binary WsData frame codec (10-byte header: kind:u8, id:u32 LE, seq:u32 LE,
// flags:u8 + payload). MUST match wire.ts encodeBinaryFrame/decodeBinaryFrame so
// the bridge client and this gateway agree on the WS-data wire format
// (BinaryKind.WsData = 2, BinaryFlags.TEXT = 2).
function encodeWsDataFrame(wid, flags, payload) {
	const frame = new Uint8Array(10 + payload.byteLength)
	const view = new DataView(frame.buffer)
	view.setUint8(0, 2)
	view.setUint32(1, wid, true)
	view.setUint32(5, 0, true)
	view.setUint8(9, flags)
	frame.set(payload, 10)
	return frame
}

function decodeWsDataFrame(buffer) {
	const bytes = new Uint8Array(buffer)
	if (bytes.byteLength < 10) return null
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	return {
		kind: view.getUint8(0),
		id: view.getUint32(1, true),
		flags: view.getUint8(9),
		payload: bytes.subarray(10)
	}
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
		if (bytes.byteLength > HTTP_TRANSFER_THRESHOLD) {
			throw new Error(
				'[devflare][bridge] Response body (' + bytes.byteLength + ' bytes) exceeds the '
				+ HTTP_TRANSFER_THRESHOLD + '-byte inline limit. DO and service-binding fetch responses '
				+ 'are delivered inline over the bridge WebSocket and cannot be streamed locally; keep '
				+ 'proxied response bodies under the limit (large R2 objects are exempt — read them through '
				+ 'the R2 binding, which uses the HTTP transfer side-channel).'
			)
		}
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

function deserializeRequest(serializedReq) {
	return new Request(serializedReq.url, {
		method: serializedReq.method,
		headers: serializedReq.headers,
		body: serializedReq.body?.type === 'bytes'
			? base64ToArrayBuffer(serializedReq.body.data)
			: undefined,
		redirect: serializedReq.redirect
	})
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
 * Resolve a (possibly jurisdiction-scoped) DurableObjectNamespace.
 * Forwards the jurisdiction faithfully when the binding supports it
 * (real Cloudflare), and degrades to the plain binding otherwise
 * (miniflare/workerd local emulation, which does not pin jurisdictions).
 */
function resolveDoNamespace(binding, jurisdiction) {
	if (jurisdiction && typeof binding.jurisdiction === 'function') {
		return binding.jurisdiction(jurisdiction)
	}
	return binding
}

/**
 * Execute an RPC method against the gateway's bindings.
 *
 * Method format: "binding.operation". Operations must be namespaced by
 * binding kind (e.g. "kv.get", "r2.head", "d1.stmt.first", "do.fetch",
 * "service.fetch", "queue.send", "email.send", "ai.run"). Bare verbs and the legacy
 * "stmt.*" / "stub.*" sub-prefixes were removed in B3-final and now throw.
 * Method vocabulary must stay in sync with the canonical server in
 * src/bridge/server.ts.
 */
async function executeRpcMethod(method, params, env, _ctx) {
	const parts = method.split('.')
	if (parts.length < 2) throw new Error('Invalid method format: ' + method)

	const bindingName = parts[0]
	const operation = parts.slice(1).join('.')
	const binding = env[bindingName]

	if (!binding) throw new Error('Binding not found: ' + bindingName)

	const isNamespaced =
		operation.indexOf('kv.') === 0 ||
		operation.indexOf('r2.') === 0 ||
		operation.indexOf('d1.') === 0 ||
		operation.indexOf('do.') === 0 ||
		operation.indexOf('service.') === 0 ||
		operation.indexOf('queue.') === 0 ||
		operation.indexOf('email.') === 0 ||
		operation.indexOf('ai.') === 0 ||
		operation.indexOf('workflow.') === 0 ||
		operation.indexOf('var.') === 0
	if (!isNamespaced) {
		throw new Error(createUnsupportedBridgeOperationErrorMessage(bindingName, operation))
	}

	// KV
	if (operation === 'kv.get') return binding.get(params[0], params[1])
	if (operation === 'kv.put') return binding.put(params[0], params[1], params[2])
	if (operation === 'kv.delete') return binding.delete(params[0])
	if (operation === 'kv.list') return binding.list(params[0])
	if (operation === 'kv.getWithMetadata') return binding.getWithMetadata(params[0], params[1])

	// DO get (returns DOStub reference)
	if (operation === 'do.get') {
		return { __type: 'DOStub', binding: bindingName, id: params[0] }
	}

	// R2
	if (operation === 'r2.head') return serializeR2Object(await binding.head(params[0]))
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
	if (operation === 'd1.exec') return binding.exec(params[0])
	if (operation === 'd1.batch') {
		const statements = params[0].map((s) => binding.prepare(s.sql).bind(...(s.bindings || [])))
		return binding.batch(statements)
	}
	if (operation.indexOf('d1.stmt.') === 0) {
		const mode = operation.split('.')[2]
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
	if (operation === 'do.idFromName') {
		const ns = resolveDoNamespace(binding, params[1])
		const id = ns.idFromName(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (operation === 'do.idFromString') {
		const id = binding.idFromString(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (operation === 'do.newUniqueId') {
		const ns = resolveDoNamespace(binding, params[1])
		const id = ns.newUniqueId(params[0])
		return { __type: 'DOId', hex: id.toString() }
	}
	if (operation === 'do.fetch') {
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
	if (operation === 'do.rpc') {
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

	// Service Bindings
	if (operation === 'service.fetch') {
		if (!binding || typeof binding.fetch !== 'function') {
			throw new Error('Service binding ' + bindingName + ' does not support fetch()')
		}
		const response = await binding.fetch(deserializeRequest(params[0]))
		return serializeResponse(response)
	}
	if (operation === 'service.rpc') {
		const methodName = params[0]
		if (typeof methodName !== 'string') {
			throw new Error('Service binding ' + bindingName + ' RPC method name must be a string')
		}
		const args = Array.isArray(params[1]) ? params[1] : []
		const method = binding && binding[methodName]
		if (typeof method !== 'function') {
			throw new Error('Service binding ' + bindingName + ' does not support ' + methodName + '()')
		}
		return method.apply(binding, args)
	}

	// Queues
	if (operation === 'queue.send') return binding.send(params[0], params[1])
	if (operation === 'queue.sendBatch') return binding.sendBatch(params[0], params[1])

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

	// Workflows
	if (operation === 'workflow.create') {
		return serializeWorkflowInstance(await binding.create(params[0]))
	}
	if (operation === 'workflow.get') {
		return serializeWorkflowInstance(await binding.get(params[0]))
	}
	if (operation === 'workflow.status') {
		return (await binding.get(params[0])).status()
	}
	if (operation === 'workflow.pause') {
		return (await binding.get(params[0])).pause()
	}
	if (operation === 'workflow.resume') {
		return (await binding.get(params[0])).resume()
	}
	if (operation === 'workflow.terminate') {
		return (await binding.get(params[0])).terminate()
	}
	if (operation === 'workflow.restart') {
		return (await binding.get(params[0])).restart()
	}
	if (operation === 'workflow.sendEvent') {
		return (await binding.get(params[0])).sendEvent(params[1])
	}

	// AI / generic run()
	if (operation === 'ai.run') {
		if (typeof binding.run !== 'function') {
			throw new Error('Binding ' + bindingName + ' does not support run(): ' + method)
		}
		return binding.run(params[0], params[1])
	}

	throw new Error('Unknown operation: ' + method)
}

function createUnsupportedBridgeOperationErrorMessage(bindingName, operation) {
	const base = "[devflare][bridge] Unsupported bridge operation '" + operation + "' for binding '" + bindingName + "'."
	if (operation === 'fetch') {
		return base + ' Devflare could not dispatch fetch() for this binding through the local bridge. '
			+ 'Expected Cloudflare API: env.' + bindingName + '.fetch(request). '
			+ 'If this came from SvelteKit platform.env, make sure the binding is declared as a service binding; '
			+ 'this is a Devflare local bridge issue when service bindings fall back to a bare fetch operation.'
	}
	if (operation === 'toString') {
		return base + ' A platform.env value was coerced to a string through the bridge. '
			+ 'For SvelteKit local dev, declared vars should be plain string values and missing env names should read as undefined.'
	}
	return base + ' Bare verbs and the legacy stmt.*/stub.* sub-prefixes are not supported; '
		+ 'use the namespaced form (e.g. kv.get, r2.put, d1.stmt.first, do.fetch, service.fetch).'
}

function serializeWorkflowInstance(instance) {
	return {
		__type: 'WorkflowInstance',
		id: instance.id
	}
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
			const payload = isText
				? new TextEncoder().encode(event.data)
				: new Uint8Array(event.data)
			const flags = isText ? 2 : 0
			ws.send(encodeWsDataFrame(msg.wid, flags, payload))
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

// Relay an inbound binary WsData frame (client -> DO). Mirrors server.ts
// handleBinaryMessage: decode the frame, look up the proxy by ws id, and forward
// the payload to the DO socket honoring the TEXT flag.
function handleBridgeBinaryMessage(buffer, wsProxies) {
	const frame = decodeWsDataFrame(buffer)
	if (!frame || frame.kind !== 2) return
	const proxy = wsProxies.get(frame.id)
	if (!proxy) return
	if ((frame.flags & 2) !== 0) {
		proxy.doWs.send(new TextDecoder().decode(frame.payload))
	} else {
		proxy.doWs.send(frame.payload)
	}
}

async function handleBridgeJsonMessage(data, ws, env, ctx, wsProxies) {
	const msg = JSON.parse(data)
	switch (msg.t) {
		case 'hello':
			// v2 handshake — acknowledge with welcome echoing the negotiated
			// capability intersection. The gateway advertises only what it
			// implements end-to-end: 'ws-relay' (binary WsData relay to/from DO
			// sockets) and 'http-transfer' (the R2 transfer HTTP side-channel).
			// 'streams' is intentionally NOT advertised — large DO/service-fetch
			// responses are inlined, not streamed, in this gateway.
			ws.send(JSON.stringify({
				t: 'welcome',
				protocolVersion: 2,
				capabilities: ['ws-relay', 'http-transfer']
					.filter((c) => Array.isArray(msg.capabilities) && msg.capabilities.includes(c))
					.sort()
			}))
			break
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
			} else {
				handleBridgeBinaryMessage(event.data, wsProxies)
			}
		} catch (error) {
			console.error('[Gateway] Error:', error)
		}
	})

	server.addEventListener('close', () => {
		for (const proxy of wsProxies.values()) {
			// Best-effort cleanup: the DO-side WS may already be closed or in an
			// invalid state; any throw here would abort sibling closes. Surface
			// the swallowed error when DEVFLARE_DEBUG_BRIDGE is enabled.
			try { proxy.doWs.close() } catch (error) {
				if (globalThis.DEVFLARE_DEBUG_BRIDGE) {
					console.warn('[devflare:bridge] proxy.doWs.close() failed', error)
				}
			}
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
