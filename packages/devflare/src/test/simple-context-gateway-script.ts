export function buildGatewayScript(
	bundledCode: string,
	wrappers: string,
	nativeRpcBindingNames: string[] = []
): string {
	const nativeRpcBindingsLiteral = JSON.stringify(nativeRpcBindingNames)

	return `
// Bundled transport + DO classes
${bundledCode}

// DO Wrappers with RPC
${wrappers}

const __nativeRpcBindings = new Set(${nativeRpcBindingsLiteral})

// Transport encoding helper
const __transportEncoders = typeof transport !== 'undefined' ? transport : {}

function __encodeTransport(value) {
	if (value === null || value === undefined) return value
	
	// Try each encoder
	for (const [typeName, transporter] of Object.entries(__transportEncoders)) {
		const encoded = transporter.encode(value)
		if (encoded !== false && encoded !== undefined) {
			return { __transport: typeName, value: encoded }
		}
	}
	
	// Recursively encode arrays and objects
	if (Array.isArray(value)) {
		return value.map(__encodeTransport)
	}
	if (typeof value === 'object') {
		const result = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = __encodeTransport(v)
		}
		return result
	}
	
	return value
}

// Gateway with WebSocket RPC
export default {
	async fetch(request, env) {
		if (request.headers.get('Upgrade') === 'websocket') {
			const { 0: client, 1: server } = new WebSocketPair()
			server.accept()
			server.addEventListener('message', async (e) => {
				try {
					const m = JSON.parse(e.data)
					if (m.t === 'rpc.call') {
						const result = await executeRpc(env, m.method, m.params)
						server.send(JSON.stringify({ t: 'rpc.ok', id: m.id, result }))
					}
				} catch (error) {
					server.send(JSON.stringify({ t: 'rpc.err', id: 'unknown', error: { code: 'RPC_ERROR', message: error.message } }))
				}
			})
			return new Response(null, { status: 101, webSocket: client })
		}
		return new Response('Gateway')
	}
}

async function executeRpc(env, method, params) {
	const [bindingName, ...rest] = method.split('.')
	let op = rest.join('.')
	const binding = env[bindingName]
	const RAW_EMAIL = 'EmailMessage::raw'
	if (!binding) throw new Error('Binding not found: ' + bindingName)

	// Normalize namespaced op names (kv.*, r2.*, d1.*, do.*, queue.*, ai.*, var.*)
	// down to the legacy verbs this dispatcher historically used. The bridge
	// proxy always emits namespaced forms (see src/bridge/proxy.ts and B3 in
	// REMAINING.md); this keeps the dispatcher backwards-compatible while the
	// rest of the codebase converges on the namespaced convention.
	if (op.indexOf('kv.') === 0) op = op.slice(3)
	else if (op.indexOf('do.') === 0) {
		const tail = op.slice(3)
		if (tail === 'fetch') op = 'stub.fetch'
		else if (tail === 'rpc') op = 'stub.rpc'
		else op = tail
	}
	else if (op.indexOf('queue.') === 0) op = op.slice(6)
	else if (op.indexOf('ai.') === 0) op = op.slice(3)
	else if (op.indexOf('var.') === 0) op = op.slice(4)
	else if (op.indexOf('d1.stmt.') === 0) op = 'prepare.' + op.slice('d1.stmt.'.length)
	else if (op.indexOf('d1.') === 0) op = op.slice(3)
	// r2.* and email.* keep their existing prefixes

	// KV operations
	if (op === 'get') return binding.get(params[0], params[1])
	if (op === 'put') return binding.put(params[0], params[1], params[2])
	if (op === 'delete') return binding.delete(params[0])
	if (op === 'list') return binding.list(params[0])
	if (op === 'getWithMetadata') return binding.getWithMetadata(params[0], params[1])

	// R2 operations
	if (op === 'r2.get') return binding.get(params[0], params[1])
	if (op === 'r2.put') return binding.put(params[0], params[1], params[2])
	if (op === 'r2.delete') return binding.delete(params[0])
	if (op === 'r2.list') return binding.list(params[0])
	if (op === 'r2.head' || op === 'head') return binding.head(params[0])

	// D1 operations
	if (op === 'exec') return binding.exec(params[0])
	if (op === 'dump') return binding.dump()
	if (op === 'batch') {
		const stmts = params[0].map(s => {
			const stmt = binding.prepare(s.sql)
			return s.bindings?.length ? stmt.bind(...s.bindings) : stmt
		})
		return binding.batch(stmts)
	}
	if (op === 'prepare.run') return binding.prepare(params[0]).bind(...(params[1] || [])).run()
	if (op === 'prepare.all') return binding.prepare(params[0]).bind(...(params[1] || [])).all()
	if (op === 'prepare.first') return binding.prepare(params[0]).bind(...(params[1] || [])).first(params[2])
	if (op === 'prepare.raw') return binding.prepare(params[0]).bind(...(params[1] || [])).raw({ columnNames: params[2] })

	// Send email operations
	if (op === 'email.send') {
		return binding.send(__normalizeEmailMessage(params[0]))
	}

	// DO operations
	if (op === 'idFromName') {
		return { __type: 'DOId', hex: binding.idFromName(params[0]).toString() }
	}
	if (op === 'stub.rpc') {
		const [, idSerialized, rpcMethod, rpcParams] = params
		const stub = binding.get(binding.idFromString(idSerialized.hex))

		if (__nativeRpcBindings.has(bindingName) && typeof stub[rpcMethod] === 'function') {
			let result = await stub[rpcMethod](...(rpcParams || []))
			result = __encodeTransport(result)
			return result
		}

		const response = await stub.fetch(new Request('http://do/_rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: rpcMethod, params: rpcParams || [] })
		}))

		const payload = await response.json()
		if (!response.ok || !payload?.ok) {
			throw new Error(payload?.error?.message || ('DO RPC failed with status ' + response.status))
		}

		return payload.result
	}

	throw new Error('Unknown operation: ' + method)
}

function __createEmailMessageRaw(raw) {
	if (typeof raw === 'string' || raw instanceof ReadableStream) {
		return raw
	}
	if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
		return new Response(raw).body
	}
	throw new Error('Unsupported EmailMessage raw payload')
}

function __buildRawEmail(message) {
	const lines = []
	const messageId = '<' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@devflare.dev>'

	lines.push('From: ' + message.from)
	lines.push('To: ' + (Array.isArray(message.to) ? message.to.join(', ') : message.to))
	lines.push('Date: ' + new Date().toUTCString())
	lines.push('Message-ID: ' + messageId)

	if (message.subject) lines.push('Subject: ' + message.subject)
	if (message.replyTo) lines.push('Reply-To: ' + String(message.replyTo))
	if (message.cc) lines.push('Cc: ' + (Array.isArray(message.cc) ? message.cc.join(', ') : message.cc))
	if (message.bcc) lines.push('Bcc: ' + (Array.isArray(message.bcc) ? message.bcc.join(', ') : message.bcc))

	for (const [key, value] of Object.entries(message.headers || {})) {
		lines.push(key + ': ' + value)
	}

	lines.push('MIME-Version: 1.0')
	lines.push('Content-Type: ' + (message.html ? 'text/html' : 'text/plain') + '; charset=UTF-8')
	lines.push('')
	lines.push(String(message.html ?? message.text ?? '').replace(/\\r?\\n/g, '\\r\\n'))

	return lines.join('\\r\\n')
}

function __normalizeEmailMessage(message) {
	if (!message || typeof message !== 'object' || !('from' in message) || !('to' in message)) {
		return message
	}
	if ('EmailMessage::raw' in message) {
		return message
	}
	if ('raw' in message && message.raw !== undefined) {
		return {
			from: message.from,
			to: message.to,
			[RAW_EMAIL]: __createEmailMessageRaw(message.raw)
		}
	}
	return {
		from: message.from,
		to: message.to,
		[RAW_EMAIL]: __createEmailMessageRaw(__buildRawEmail(message))
	}
}
`
}
