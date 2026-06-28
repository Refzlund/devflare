// =============================================================================
// Bridge Gateway Worker — Runs Inside Miniflare
// =============================================================================
// Receives RPC calls from the bridge client and executes them against bindings
// =============================================================================

import { normalizeSendEmailMessage } from '../utils/send-email'
import {
	type SerializedRequest,
	type StreamRef,
	base64Decode,
	base64Encode,
	deserializeDOId,
	deserializeRequest,
	deserializeValue,
	serializeDOId,
	serializeValue
} from './v2/value-serialization'
import {
	BinaryFlags,
	BinaryKind,
	type JsonMsg,
	type RpcCall,
	type RpcErr,
	type RpcOk,
	type StreamOpen,
	type StreamPull,
	type WsClose,
	type WsOpen,
	decodeBinaryFrame,
	encodeBinaryFrame,
	parseJsonMsg,
	stringifyJsonMsg
} from './v2/wire'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface GatewayEnv {
	// All bindings are passed dynamically
	[key: string]: unknown
}

interface ActiveStream {
	reader: ReadableStreamDefaultReader<Uint8Array>
	seq: number
}

interface ActiveWsProxy {
	doWs: WebSocket
	clientWid: number
}

// -----------------------------------------------------------------------------
// Gateway Worker
// -----------------------------------------------------------------------------

export default {
	async fetch(request: Request, env: GatewayEnv, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url)

		// WebSocket upgrade for RPC bridge
		if (request.headers.get('Upgrade') === 'websocket') {
			return handleWebSocket(request, env, ctx)
		}

		// HTTP endpoint for large file transfers
		if (url.pathname.startsWith('/_devflare/transfer/')) {
			return handleHttpTransfer(request, env, url)
		}

		// Health check
		if (url.pathname === '/_devflare/health') {
			return new Response(JSON.stringify({ ok: true, bindings: Object.keys(env) }), {
				headers: { 'Content-Type': 'application/json' }
			})
		}

		return new Response('Devflare Bridge Gateway', { status: 200 })
	}
}

// -----------------------------------------------------------------------------
// WebSocket Handler
// -----------------------------------------------------------------------------

async function handleWebSocket(
	request: Request,
	env: GatewayEnv,
	ctx: ExecutionContext
): Promise<Response> {
	const { 0: client, 1: server } = new WebSocketPair()

	const activeStreams = new Map<number, ActiveStream>()
	const wsProxies = new Map<number, ActiveWsProxy>()
	const incomingStreams = new Map<
		number,
		{
			controller: ReadableStreamDefaultController<Uint8Array>
			stream: ReadableStream<Uint8Array>
		}
	>()

	server.accept()

	server.addEventListener('message', async (event) => {
		try {
			if (typeof event.data === 'string') {
				await handleJsonMessage(
					event.data,
					server,
					env,
					ctx,
					activeStreams,
					wsProxies,
					incomingStreams
				)
			} else if (event.data instanceof ArrayBuffer) {
				handleBinaryMessage(new Uint8Array(event.data), server, wsProxies, incomingStreams)
			}
		} catch (error) {
			console.error('[devflare bridge] message handler error:', error)
			try {
				server.send(JSON.stringify({ type: 'error', message: String(error) }))
			} catch {
				// best-effort notification; swallow send failures to keep listener alive
			}
		}
	})

	server.addEventListener('close', () => {
		// Clean up streams
		for (const [_sid, stream] of activeStreams) {
			stream.reader.cancel()
		}
		activeStreams.clear()

		// Clean up WS proxies
		for (const [_wid, proxy] of wsProxies) {
			proxy.doWs.close()
		}
		wsProxies.clear()
	})

	return new Response(null, { status: 101, webSocket: client })
}

// -----------------------------------------------------------------------------
// JSON Message Handler
// -----------------------------------------------------------------------------

async function handleJsonMessage(
	data: string,
	ws: WebSocket,
	env: GatewayEnv,
	ctx: ExecutionContext,
	activeStreams: Map<number, ActiveStream>,
	wsProxies: Map<number, ActiveWsProxy>,
	incomingStreams: Map<
		number,
		{ controller: ReadableStreamDefaultController<Uint8Array>; stream: ReadableStream<Uint8Array> }
	>
): Promise<void> {
	const msg = parseJsonMsg(data)

	switch (msg.t) {
		case 'rpc.call':
			await handleRpcCall(msg, ws, env, ctx, activeStreams, incomingStreams)
			break
		case 'stream.pull':
			await handleStreamPull(msg, ws, activeStreams)
			break
		case 'stream.open':
			handleStreamOpen(msg, incomingStreams)
			break
		case 'stream.end':
			handleStreamEnd(msg, incomingStreams)
			break
		case 'stream.abort':
			handleStreamAbort(msg, incomingStreams)
			break
		case 'ws.open':
			await handleWsOpen(msg, ws, env, wsProxies)
			break
		case 'ws.close':
			handleWsClose(msg, wsProxies)
			break
	}
}

// -----------------------------------------------------------------------------
// RPC Handler
// -----------------------------------------------------------------------------

async function handleRpcCall(
	msg: RpcCall,
	ws: WebSocket,
	env: GatewayEnv,
	ctx: ExecutionContext,
	activeStreams: Map<number, ActiveStream>,
	incomingStreams: Map<
		number,
		{ controller: ReadableStreamDefaultController<Uint8Array>; stream: ReadableStream<Uint8Array> }
	>
): Promise<void> {
	try {
		// Deserialize params
		const getStream = (sid: number) => incomingStreams.get(sid)?.stream ?? null
		const params = deserializeValue(msg.params, getStream) as unknown[]

		// Execute the RPC method
		const result = await executeRpcMethod(msg.method, params, env, ctx)

		// Serialize result (may produce streams)
		const { value: serializedResult, streams } = await serializeValue(result)

		// Register outgoing streams
		for (const streamRef of streams) {
			activeStreams.set(streamRef.sid, {
				reader: streamRef.stream.getReader(),
				seq: 0
			})
		}

		// Send success response
		const response: RpcOk = {
			t: 'rpc.ok',
			id: msg.id,
			result: serializedResult
		}
		ws.send(stringifyJsonMsg(response))
	} catch (error) {
		// Send error response
		const response: RpcErr = {
			t: 'rpc.err',
			id: msg.id,
			error: {
				code: (error as any).code ?? 'INTERNAL_ERROR',
				message: error instanceof Error ? error.message : String(error)
			}
		}
		ws.send(stringifyJsonMsg(response))
	}
}

// -----------------------------------------------------------------------------
// RPC Method Execution
// -----------------------------------------------------------------------------

export async function executeRpcMethod(
	method: string,
	params: unknown[],
	env: GatewayEnv,
	ctx: ExecutionContext
): Promise<unknown> {
	// Parse method: "binding.operation" or "binding.sub.operation"
	const parts = method.split('.')
	if (parts.length < 2) {
		throw new Error(`Invalid method format: ${method}`)
	}

	const bindingName = parts[0]
	const operation = parts.slice(1).join('.')
	const binding = env[bindingName]

	if (!binding) {
		throw new Error(`Binding not found: ${bindingName}`)
	}

	// Strict namespacing — bare verbs (e.g. `get`, `put`) and the older
	// `stmt.*` / `stub.*` sub-prefixes are no longer accepted. All operations
	// must be prefixed with a binding kind: `kv.`, `r2.`, `d1.`, `do.`,
	// `service.`, `queue.`, `email.`, `ai.`, or `var.`.
	const isNamespaced =
		operation.startsWith('kv.') ||
		operation.startsWith('r2.') ||
		operation.startsWith('d1.') ||
		operation.startsWith('do.') ||
		operation.startsWith('service.') ||
		operation.startsWith('queue.') ||
		operation.startsWith('email.') ||
		operation.startsWith('ai.') ||
		operation.startsWith('workflow.') ||
		operation.startsWith('var.')
	if (!isNamespaced) {
		throw createUnsupportedBridgeOperationError(bindingName, operation)
	}

	// Handle different binding types (namespaced operations)
	switch (operation) {
		// KV Namespace
		case 'kv.get':
			return (binding as KVNamespace).get(params[0] as string, params[1] as any)
		case 'kv.put':
			return (binding as KVNamespace).put(params[0] as string, params[1] as any, params[2] as any)
		case 'kv.delete':
			return (binding as KVNamespace).delete(params[0] as string)
		case 'kv.list':
			return (binding as KVNamespace).list(params[0] as any)
		case 'kv.getWithMetadata':
			return (binding as KVNamespace).getWithMetadata(params[0] as string, params[1] as any)

		// R2 Bucket
		case 'r2.head':
			return serializeR2Object(await (binding as R2Bucket).head(params[0] as string))
		case 'r2.get':
			return serializeR2ObjectBody(
				await (binding as R2Bucket).get(params[0] as string, params[1] as any)
			)
		case 'r2.put':
			return (binding as R2Bucket).put(params[0] as string, params[1] as any, params[2] as any)
		case 'r2.delete':
			return (binding as R2Bucket).delete(params[0] as any)
		case 'r2.list':
			return (binding as R2Bucket).list(params[0] as any)

		// D1 Database
		case 'd1.prepare':
			return serializeD1Statement((binding as D1Database).prepare(params[0] as string))
		case 'd1.batch':
			return (binding as D1Database).batch(params[0] as any)
		case 'd1.exec':
			return (binding as D1Database).exec(params[0] as string)
		case 'd1.dump':
			return (binding as D1Database).dump()

		// D1 Statement operations (from prepared statement)
		case 'd1.stmt.bind':
			// Statement binding handled specially
			return { __type: 'D1Statement', sql: params[0], bindings: params.slice(1) }
		case 'd1.stmt.first':
			return executeD1Statement(
				binding as D1Database,
				params[0] as string,
				params.slice(1),
				'first',
				params[params.length - 1]
			)
		case 'd1.stmt.all':
			return executeD1Statement(binding as D1Database, params[0] as string, params.slice(1), 'all')
		case 'd1.stmt.run':
			return executeD1Statement(binding as D1Database, params[0] as string, params.slice(1), 'run')
		case 'd1.stmt.raw':
			return executeD1Statement(
				binding as D1Database,
				params[0] as string,
				params.slice(1),
				'raw',
				params[params.length - 1]
			)

		// Durable Objects
		case 'do.idFromName':
			return serializeDOId(
				resolveDoNamespace(binding as DurableObjectNamespace, params[1]).idFromName(
					params[0] as string
				)
			)
		case 'do.idFromString':
			return serializeDOId((binding as DurableObjectNamespace).idFromString(params[0] as string))
		case 'do.newUniqueId':
			return serializeDOId(
				resolveDoNamespace(binding as DurableObjectNamespace, params[1]).newUniqueId(
					params[0] as any
				)
			)
		case 'do.get': {
			const doId = deserializeDOId(params[0] as any, binding as DurableObjectNamespace)
			// Instantiate stub to validate id; we return a DOStub reference for the client
			;(binding as DurableObjectNamespace).get(doId)
			return { __type: 'DOStub', binding: bindingName, id: params[0] }
		}
		case 'do.fetch':
			return executeDoFetch(env, params[0] as string, params[1] as any, params[2] as any)
		case 'do.rpc':
			// DO RPC: Call a method on the Durable Object stub
			// params = [bindingName, serializedId, methodName, methodArgs]
			return executeDoRpc(
				env,
				params[0] as string,
				params[1] as any,
				params[2] as string,
				params[3] as unknown[]
			)

		// Service Bindings
		case 'service.fetch':
			return executeServiceFetch(bindingName, binding, params[0] as SerializedRequest)
		case 'service.rpc':
			return executeServiceRpc(bindingName, binding, params[0], params[1])

		// Email
		case 'email.send':
			return executeSendEmail(binding as SendEmail, params[0])

		// Workflows
		case 'workflow.create':
			return serializeWorkflowInstance(await (binding as Workflow).create(params[0] as any))
		case 'workflow.get':
			return serializeWorkflowInstance(await (binding as Workflow).get(params[0] as string))
		case 'workflow.status':
			return (await (binding as Workflow).get(params[0] as string)).status()
		case 'workflow.pause':
			return (await (binding as Workflow).get(params[0] as string)).pause()
		case 'workflow.resume':
			return (await (binding as Workflow).get(params[0] as string)).resume()
		case 'workflow.terminate':
			return (await (binding as Workflow).get(params[0] as string)).terminate()
		case 'workflow.restart':
			return (await (binding as Workflow).get(params[0] as string)).restart()
		case 'workflow.sendEvent':
			return (await (binding as Workflow).get(params[0] as string)).sendEvent(params[1] as any)

		// Queue
		case 'queue.send':
			return (binding as Queue<unknown>).send(params[0], params[1] as any)
		case 'queue.sendBatch':
			return (binding as Queue<unknown>).sendBatch(params[0] as any, params[1] as any)

		// AI (if available)
		case 'ai.run':
			if (typeof (binding as any).run !== 'function') {
				throw new Error(`Binding ${bindingName} does not support run(): ${method}`)
			}
			return (binding as any).run(params[0], params[1])

		default:
			throw new Error(`Unknown operation: ${method}`)
	}
}

function createUnsupportedBridgeOperationError(bindingName: string, operation: string): Error {
	const base = `[devflare][bridge] Unsupported bridge operation '${operation}' for binding '${bindingName}'.`

	if (operation === 'fetch') {
		return new Error(
			`${base} Devflare could not dispatch fetch() for this binding through the local bridge. ` +
				`Expected Cloudflare API: env.${bindingName}.fetch(request). ` +
				'If this came from SvelteKit platform.env, make sure the binding is declared as a service binding; ' +
				'this is a Devflare local bridge issue when service bindings fall back to a bare fetch operation.'
		)
	}

	if (operation === 'toString') {
		return new Error(
			`${base} A platform.env value was coerced to a string through the bridge. ` +
				'For SvelteKit local dev, declared vars should be plain string values and missing env names should read as undefined.'
		)
	}

	return new Error(
		`${base} Bare verbs and the legacy \`stmt.*\` / \`stub.*\` sub-prefixes are not supported; ` +
			'use the namespaced form (e.g. `kv.get`, `r2.put`, `d1.stmt.first`, `do.fetch`, `service.fetch`).'
	)
}

async function executeServiceFetch(
	bindingName: string,
	binding: unknown,
	requestSerialized: SerializedRequest
): Promise<Response> {
	if (!binding || typeof (binding as { fetch?: unknown }).fetch !== 'function') {
		throw new Error(`Service binding ${bindingName} does not support fetch()`)
	}

	const request = deserializeRequest(requestSerialized)
	return (binding as Fetcher).fetch(request)
}

async function executeServiceRpc(
	bindingName: string,
	binding: unknown,
	methodName: unknown,
	methodArgs: unknown
): Promise<unknown> {
	if (typeof methodName !== 'string') {
		throw new Error(`Service binding ${bindingName} RPC method name must be a string`)
	}

	const args = Array.isArray(methodArgs) ? methodArgs : []
	const method = (binding as Record<string, unknown> | null | undefined)?.[methodName]
	if (typeof method !== 'function') {
		throw new Error(`Service binding ${bindingName} does not support ${methodName}()`)
	}

	return method.apply(binding, args)
}

async function executeSendEmail(binding: SendEmail, message: unknown): Promise<EmailSendResult> {
	return binding.send(normalizeSendEmailMessage(message))
}

function serializeWorkflowInstance(instance: WorkflowInstance): unknown {
	return {
		__type: 'WorkflowInstance',
		id: instance.id
	}
}

/**
 * Resolve a (possibly jurisdiction-scoped) DurableObjectNamespace.
 *
 * Forwards the jurisdiction faithfully when the binding implements it (real
 * Cloudflare), and degrades to the plain binding otherwise (miniflare/workerd
 * local emulation does not pin jurisdictions for storage/routing).
 */
function resolveDoNamespace(
	binding: DurableObjectNamespace,
	jurisdiction?: unknown
): DurableObjectNamespace {
	const withJurisdiction = binding as DurableObjectNamespace & {
		jurisdiction?: (j: string) => DurableObjectNamespace
	}
	if (typeof jurisdiction === 'string' && typeof withJurisdiction.jurisdiction === 'function') {
		return withJurisdiction.jurisdiction(jurisdiction)
	}
	return binding
}

// -----------------------------------------------------------------------------
// R2 Helpers
// -----------------------------------------------------------------------------

/** Serialize R2Object metadata (no body) */
function serializeR2Object(obj: R2Object | null): unknown {
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

/** Serialize R2ObjectBody (includes body data) */
async function serializeR2ObjectBody(obj: R2ObjectBody | R2Object | null): Promise<unknown> {
	if (!obj) return null

	// Check if it's an R2ObjectBody (has body/arrayBuffer)
	const hasBody = 'body' in obj || 'arrayBuffer' in obj

	if (!hasBody) {
		// It's just R2Object (metadata only)
		return serializeR2Object(obj as R2Object)
	}

	// It's R2ObjectBody - read the body content
	const body = obj as R2ObjectBody
	const arrayBuffer = await body.arrayBuffer()
	const bodyData = base64Encode(new Uint8Array(arrayBuffer))

	return {
		__type: 'R2ObjectBody',
		key: body.key,
		version: body.version,
		size: body.size,
		etag: body.etag,
		httpEtag: body.httpEtag,
		checksums: body.checksums,
		uploaded: body.uploaded?.toISOString(),
		httpMetadata: body.httpMetadata,
		customMetadata: body.customMetadata,
		range: body.range,
		storageClass: body.storageClass,
		// Body data as base64
		bodyData
	}
}

// -----------------------------------------------------------------------------
// D1 Helpers
// -----------------------------------------------------------------------------

function serializeD1Statement(stmt: D1PreparedStatement): unknown {
	return { __type: 'D1Statement' }
}

async function executeD1Statement(
	db: D1Database,
	sql: string,
	bindings: unknown[],
	mode: 'first' | 'all' | 'run' | 'raw',
	extra?: unknown
): Promise<unknown> {
	let stmt = db.prepare(sql)
	if (bindings.length > 0) {
		stmt = stmt.bind(...bindings)
	}

	switch (mode) {
		case 'first':
			return typeof extra === 'string' ? stmt.first(extra) : stmt.first()
		case 'all':
			return stmt.all()
		case 'run':
			return stmt.run()
		case 'raw':
			return stmt.raw(extra as any)
	}
}

// -----------------------------------------------------------------------------
// Durable Object Helpers
// -----------------------------------------------------------------------------

async function executeDoFetch(
	env: GatewayEnv,
	bindingName: string,
	idSerialized: any,
	requestSerialized: any
): Promise<Response> {
	const binding = env[bindingName] as DurableObjectNamespace
	const id = deserializeDOId(idSerialized, binding)
	const stub = binding.get(id)

	// Reconstruct request
	const bodyBytes =
		requestSerialized.body?.type === 'bytes' ? base64Decode(requestSerialized.body.data) : undefined
	// Convert Uint8Array to ArrayBuffer for BodyInit compatibility
	const bodyBuffer = bodyBytes
		? (bodyBytes.buffer.slice(
				bodyBytes.byteOffset,
				bodyBytes.byteOffset + bodyBytes.byteLength
			) as ArrayBuffer)
		: undefined
	const request = new Request(requestSerialized.url, {
		method: requestSerialized.method,
		headers: requestSerialized.headers,
		body: bodyBuffer
	})

	return stub.fetch(request)
}

/**
 * Execute an RPC method on a Durable Object stub
 *
 * This uses the DO's internal `_rpc` endpoint convention to call methods.
 * The DO class must expose an RPC handler via fetch() that routes to methods.
 */
async function executeDoRpc(
	env: GatewayEnv,
	bindingName: string,
	idSerialized: any,
	methodName: string,
	args: unknown[]
): Promise<unknown> {
	const binding = env[bindingName] as DurableObjectNamespace
	const id = deserializeDOId(idSerialized, binding)
	const stub = binding.get(id)

	// Call the DO's RPC endpoint
	// Convention: POST to /_rpc with { method, params }
	const response = await stub.fetch(
		new Request('http://do/_rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: methodName, params: args })
		})
	)

	const result = (await response.json()) as {
		ok: boolean
		result?: unknown
		error?: { message: string }
	}
	if (!result.ok) {
		throw new Error(result.error?.message ?? 'DO RPC failed')
	}
	return result.result
}

// -----------------------------------------------------------------------------
// Stream Handlers
// -----------------------------------------------------------------------------

async function handleStreamPull(
	msg: StreamPull,
	ws: WebSocket,
	activeStreams: Map<number, ActiveStream>
): Promise<void> {
	const stream = activeStreams.get(msg.sid)
	if (!stream) return

	let sent = 0
	const maxBytes = msg.creditBytes

	try {
		while (sent < maxBytes) {
			const { done, value } = await stream.reader.read()

			if (done) {
				ws.send(stringifyJsonMsg({ t: 'stream.end', sid: msg.sid }))
				activeStreams.delete(msg.sid)
				break
			}

			if (value) {
				const frame = encodeBinaryFrame(BinaryKind.StreamChunk, msg.sid, stream.seq++, 0, value)
				ws.send(frame)
				sent += value.byteLength
			}
		}
	} catch (error) {
		ws.send(
			stringifyJsonMsg({
				t: 'stream.abort',
				sid: msg.sid,
				error: String(error)
			})
		)
		activeStreams.delete(msg.sid)
	}
}

function handleStreamOpen(
	msg: StreamOpen,
	incomingStreams: Map<
		number,
		{ controller: ReadableStreamDefaultController<Uint8Array>; stream: ReadableStream<Uint8Array> }
	>
): void {
	let controller!: ReadableStreamDefaultController<Uint8Array>
	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c
		}
	})
	incomingStreams.set(msg.sid, { controller, stream })
}

function handleStreamEnd(
	msg: { sid: number },
	incomingStreams: Map<
		number,
		{ controller: ReadableStreamDefaultController<Uint8Array>; stream: ReadableStream<Uint8Array> }
	>
): void {
	const stream = incomingStreams.get(msg.sid)
	if (stream) {
		stream.controller.close()
		incomingStreams.delete(msg.sid)
	}
}

function handleStreamAbort(
	msg: { sid: number; error?: string },
	incomingStreams: Map<
		number,
		{ controller: ReadableStreamDefaultController<Uint8Array>; stream: ReadableStream<Uint8Array> }
	>
): void {
	const stream = incomingStreams.get(msg.sid)
	if (stream) {
		stream.controller.error(new Error(msg.error ?? 'Stream aborted'))
		incomingStreams.delete(msg.sid)
	}
}

// -----------------------------------------------------------------------------
// Binary Message Handler
// -----------------------------------------------------------------------------

function handleBinaryMessage(
	frame: Uint8Array,
	ws: WebSocket,
	wsProxies: Map<number, ActiveWsProxy>,
	incomingStreams: Map<
		number,
		{ controller: ReadableStreamDefaultController<Uint8Array>; stream: ReadableStream<Uint8Array> }
	>
): void {
	const decoded = decodeBinaryFrame(frame)

	switch (decoded.kind) {
		case BinaryKind.StreamChunk: {
			// Incoming stream chunk from client
			const stream = incomingStreams.get(decoded.id)
			if (stream) {
				stream.controller.enqueue(decoded.payload)
			}
			break
		}
		case BinaryKind.WsData: {
			// Forward to DO WebSocket
			const proxy = wsProxies.get(decoded.id)
			if (proxy) {
				const isText = (decoded.flags & BinaryFlags.TEXT) !== 0
				if (isText) {
					proxy.doWs.send(new TextDecoder().decode(decoded.payload))
				} else {
					proxy.doWs.send(decoded.payload)
				}
			}
			break
		}
	}
}

// -----------------------------------------------------------------------------
// WebSocket Proxy Handlers
// -----------------------------------------------------------------------------

async function handleWsOpen(
	msg: WsOpen,
	ws: WebSocket,
	env: GatewayEnv,
	wsProxies: Map<number, ActiveWsProxy>
): Promise<void> {
	try {
		const binding = env[msg.target.binding] as DurableObjectNamespace
		const id = binding.idFromString(msg.target.id)
		const stub = binding.get(id)

		// Create request for DO WebSocket upgrade
		const headers = new Headers(msg.target.headers ?? [])
		headers.set('Upgrade', 'websocket')

		const request = new Request(msg.target.url, {
			method: 'GET',
			headers
		})

		const response = await stub.fetch(request)
		const doWs = response.webSocket

		if (!doWs) {
			ws.send(
				stringifyJsonMsg({
					t: 'rpc.err',
					id: `ws_${msg.wid}`,
					error: { code: 'WS_UPGRADE_FAILED', message: 'DO did not return WebSocket' }
				})
			)
			return
		}

		doWs.accept()

		// Set up proxy
		const proxy: ActiveWsProxy = {
			doWs,
			clientWid: msg.wid
		}
		wsProxies.set(msg.wid, proxy)

		// Forward messages from DO to client
		doWs.addEventListener('message', (event) => {
			const isText = typeof event.data === 'string'
			const payload = isText
				? new TextEncoder().encode(event.data)
				: new Uint8Array(event.data as ArrayBuffer)
			const flags = isText ? BinaryFlags.TEXT : 0

			const frame = encodeBinaryFrame(BinaryKind.WsData, msg.wid, 0, flags, payload)
			ws.send(frame)
		})

		doWs.addEventListener('close', (event) => {
			ws.send(
				stringifyJsonMsg({
					t: 'ws.close',
					wid: msg.wid,
					code: event.code,
					reason: event.reason
				})
			)
			wsProxies.delete(msg.wid)
		})

		// Send opened confirmation
		ws.send(stringifyJsonMsg({ t: 'ws.opened', wid: msg.wid }))
	} catch (error) {
		ws.send(
			stringifyJsonMsg({
				t: 'rpc.err',
				id: `ws_${msg.wid}`,
				error: {
					code: 'WS_OPEN_FAILED',
					message: error instanceof Error ? error.message : String(error)
				}
			})
		)
	}
}

function handleWsClose(msg: WsClose, wsProxies: Map<number, ActiveWsProxy>): void {
	const proxy = wsProxies.get(msg.wid)
	if (proxy) {
		proxy.doWs.close(msg.code, msg.reason)
		wsProxies.delete(msg.wid)
	}
}

// -----------------------------------------------------------------------------
// HTTP Transfer Handler (for large files)
// -----------------------------------------------------------------------------

async function handleHttpTransfer(request: Request, env: GatewayEnv, url: URL): Promise<Response> {
	// URL format: /_devflare/transfer/{id}
	const transferId = decodeURIComponent(url.pathname.split('/').pop() ?? '')

	// For uploads, the body is streamed directly
	if (request.method === 'PUT' || request.method === 'POST') {
		// Transfer ID contains binding info: {binding}:{key}
		const [binding, ...keyParts] = transferId.split(':')
		const key = keyParts.join(':')

		const bucket = env[binding] as R2Bucket
		if (!bucket) {
			return new Response('Binding not found', { status: 404 })
		}

		const result = await bucket.put(key, request.body)
		return new Response(JSON.stringify(serializeR2Object(result)), {
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// For downloads
	if (request.method === 'GET') {
		const [binding, ...keyParts] = transferId.split(':')
		const key = keyParts.join(':')

		const bucket = env[binding] as R2Bucket
		if (!bucket) {
			return new Response('Binding not found', { status: 404 })
		}

		const object = await bucket.get(key)
		if (!object) {
			return new Response('Object not found', { status: 404 })
		}

		return new Response(object.body, {
			headers: {
				'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
				'Content-Length': String(object.size)
			}
		})
	}

	return new Response('Method not allowed', { status: 405 })
}
