// =============================================================================
// Dev Server — Miniflare-first Development Experience
// =============================================================================
// Provides Miniflare, DO hot reload, and optional Vite integration when enabled
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { Miniflare as MiniflareType } from 'miniflare'
import { dirname, resolve } from 'pathe'
import type { DevflareConfig, WsRouteConfig } from '../config'
import { loadConfig, resolveConfigPath } from '../config/loader'
import { getLocalD1DatabaseIdentifier, getLocalKVNamespaceIdentifier, getSingleBrowserBindingName } from '../config/schema'
import { bundleWorkerEntry, createDOBundler, type DOBundler, type DOBundleResult } from '../bundler'
import { createBrowserShim, type BrowserShim } from '../browser-shim'
import { getBrowserBindingScript } from '../browser-shim/binding-worker'
import { checkRemoteBindingRequirements } from '../cli/wrangler-auth'
import { clearLocalSendEmailBindings, setLocalSendEmailBindings } from '../utils/send-email'
import { writeGeneratedViteConfig } from '../vite'
import { prepareComposedWorkerEntrypoint } from '../worker-entry/composed-worker'
import { discoverRoutes, getRouteDirectoryCandidate, type RouteDiscoveryResult } from '../worker-entry/routes'
import { createCompatibilityAwareMiniflareLog } from './miniflare-log'
import { createRuntimeStdioForwarder } from './runtime-stdio'
import { detectViteProject, stopSpawnedProcessTree, waitForViteReady } from './vite-utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DevServerOptions {
	/** Project root directory */
	cwd: string
	/** Config file path (optional) */
	configPath?: string
	/** Vite dev server port (default: 5173) */
	vitePort?: number
	/** Miniflare port for gateway (default: 8787) */
	miniflarePort?: number
	/** Whether to start Vite for this package */
	enableVite?: boolean
	/** Persist storage data */
	persist?: boolean
	/** Logger instance */
	logger?: ConsolaInstance
	/** Enable verbose logging */
	verbose?: boolean
	/** Enable debug mode (extra logging in gateway worker) */
	debug?: boolean
}

export interface DevServer {
	/** Start the dev server */
	start(): Promise<void>
	/** Stop the dev server */
	stop(): Promise<void>
	/** Get Miniflare instance for testing */
	getMiniflare(): MiniflareType | null
}

const DEFAULT_FETCH_ENTRY_FILES = [
	'src/fetch.ts',
	'src/fetch.js',
	'src/fetch.mts',
	'src/fetch.mjs'
] as const

const DEFAULT_QUEUE_ENTRY_FILES = [
	'src/queue.ts',
	'src/queue.js',
	'src/queue.mts',
	'src/queue.mjs'
] as const

const DEFAULT_SCHEDULED_ENTRY_FILES = [
	'src/scheduled.ts',
	'src/scheduled.js',
	'src/scheduled.mts',
	'src/scheduled.mjs'
] as const

const DEFAULT_EMAIL_ENTRY_FILES = [
	'src/email.ts',
	'src/email.js',
	'src/email.mts',
	'src/email.mjs'
] as const

const DEFAULT_TRANSPORT_ENTRY_FILES = [
	'src/transport.ts',
	'src/transport.js',
	'src/transport.mts',
	'src/transport.mjs'
] as const

const INTERNAL_APP_SERVICE_BINDING = '__DEVFLARE_APP'

interface WorkerSurfacePaths {
	fetch: string | null
	queue: string | null
	scheduled: string | null
	email: string | null
}

type MiniflareServiceBinding = { name: string; entrypoint?: string }

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function resolveWorkerHandlerPath(
	cwd: string,
	configuredPath: string | false | undefined,
	defaultEntries: readonly string[]
): Promise<string | null> {
	if (configuredPath === false) {
		return null
	}

	const fs = await import('node:fs/promises')
	const candidates = new Set<string>()

	if (typeof configuredPath === 'string' && configuredPath) {
		candidates.add(configuredPath)
	}

	for (const defaultEntry of defaultEntries) {
		candidates.add(defaultEntry)
	}

	for (const candidate of candidates) {
		const absolutePath = resolve(cwd, candidate)
		try {
			await fs.access(absolutePath)
			return absolutePath
		} catch {
			continue
		}
	}

	return null
}

async function resolveMainWorkerSurfacePaths(
	cwd: string,
	config: DevflareConfig
): Promise<WorkerSurfacePaths> {
	return {
		fetch: await resolveWorkerHandlerPath(cwd, config.files?.fetch, DEFAULT_FETCH_ENTRY_FILES),
		queue: await resolveWorkerHandlerPath(cwd, config.files?.queue, DEFAULT_QUEUE_ENTRY_FILES),
		scheduled: await resolveWorkerHandlerPath(cwd, config.files?.scheduled, DEFAULT_SCHEDULED_ENTRY_FILES),
		email: await resolveWorkerHandlerPath(cwd, config.files?.email, DEFAULT_EMAIL_ENTRY_FILES)
	}
}

function hasWorkerSurfacePaths(surfacePaths: WorkerSurfacePaths): boolean {
	return Object.values(surfacePaths).some((surfacePath) => typeof surfacePath === 'string' && surfacePath.length > 0)
}

function addWorkerWatchRoots(
	roots: Set<string>,
	cwd: string,
	configuredPath: string | false | null | undefined,
	defaultEntries: readonly string[]
): void {
	if (configuredPath === false || configuredPath === null) {
		return
	}

	if (typeof configuredPath === 'string' && configuredPath) {
		roots.add(dirname(resolve(cwd, configuredPath)))
		return
	}

	for (const defaultEntry of defaultEntries) {
		roots.add(dirname(resolve(cwd, defaultEntry)))
	}
}

function collectWorkerWatchRoots(
	cwd: string,
	config: DevflareConfig,
	mainWorkerSurfacePaths: WorkerSurfacePaths
): string[] {
	const roots = new Set<string>()

	for (const surfacePath of Object.values(mainWorkerSurfacePaths)) {
		if (surfacePath) {
			roots.add(dirname(surfacePath))
		}
	}

	addWorkerWatchRoots(roots, cwd, config.files?.fetch, DEFAULT_FETCH_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.queue, DEFAULT_QUEUE_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.scheduled, DEFAULT_SCHEDULED_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.email, DEFAULT_EMAIL_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.transport, DEFAULT_TRANSPORT_ENTRY_FILES)

	const routeDirectory = getRouteDirectoryCandidate(cwd, config)
	if (routeDirectory) {
		roots.add(routeDirectory.absoluteDir)
	}

	return [...roots]
}

// -----------------------------------------------------------------------------
// Gateway Worker Script
// -----------------------------------------------------------------------------

/**
 * Generates the gateway worker script inline
 * @param wsRoutes - WebSocket routes for DO proxying
 * @param debug - Enable debug logging in gateway
 */
function getGatewayScript(
	wsRoutes: WsRouteConfig[] = [],
	debug = false,
	appServiceBindingName: string | null = null
): string {
	// Serialize wsRoutes for injection into the script
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
			const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
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

// -----------------------------------------------------------------------------
// Dev Server Implementation
// -----------------------------------------------------------------------------

export function createDevServer(options: DevServerOptions): DevServer {
	const {
		cwd,
		configPath,
		vitePort = 5173,
		miniflarePort = 8787,
		enableVite = true,
		persist = true, // Default to true for dev - migrations need persistence
		logger,
		verbose = false,
		debug = process.env.DEVFLARE_DEBUG === 'true'
	} = options

	let miniflare: MiniflareType | null = null
	let doBundler: DOBundler | null = null
	let workerSourceWatcher: import('chokidar').FSWatcher | null = null
	let workerWatchTargets: string[] = []
	let viteProcess: import('node:child_process').ChildProcess | null = null
	let config: DevflareConfig | null = null
	let browserShim: BrowserShim | null = null
	let browserShimPort = 8788
	let mainWorkerSurfacePaths: WorkerSurfacePaths = {
		fetch: null,
		queue: null,
		scheduled: null,
		email: null
	}
	let resolvedWorkerConfigPath: string | null = null
	let mainWorkerScriptPath: string | null = null
	let bundledMainWorkerScriptPath: string | null = null
	let currentDoResult: DOBundleResult | null = null
	let mainWorkerRoutes: RouteDiscoveryResult | null = null
	let generatedViteConfigPath: string | null = null
	let reloadChain = Promise.resolve()

	async function bundleMainWorker(): Promise<void> {
		if (!mainWorkerScriptPath || !config) {
			bundledMainWorkerScriptPath = null
			return
		}

		bundledMainWorkerScriptPath = await bundleWorkerEntry({
			cwd,
			inputFile: mainWorkerScriptPath,
			outFile: resolve(cwd, '.devflare', 'worker-entrypoints', 'main.js'),
			rolldownOptions: config.rolldown?.options,
			sourcemap: config.rolldown?.sourcemap,
			minify: config.rolldown?.minify,
			logger
		})
		logger?.debug(`Bundled main worker → ${bundledMainWorkerScriptPath}`)
	}

	/**
	 * Build Miniflare configuration
	 *
	 * IMPORTANT: When using multi-worker setup, ALL workers must go in the
	 * `workers` array. The FIRST worker is the entrypoint and receives all
	 * HTTP requests. Top-level script/modules options are NOT used when
	 * workers array is present.
	 */
	function buildMiniflareConfig(doResult: DOBundleResult | null) {
		if (!config) throw new Error('Config not loaded')

		const loadedConfig = config

		const bindings = loadedConfig.bindings ?? {}
		const persistPath = resolve(cwd, '.devflare/data')
		const appWorkerName = loadedConfig.name
		const shouldRunMainWorker = !enableVite && (
			hasWorkerSurfacePaths(mainWorkerSurfacePaths)
			|| Boolean(mainWorkerRoutes?.routes.length)
		)
		const queueProducers = (() => {
			if (!bindings.queues?.producers) {
				return undefined
			}

			const producers: Record<string, { queueName: string }> = {}
			for (const [bindingName, queueName] of Object.entries(bindings.queues.producers)) {
				producers[bindingName] = { queueName }
			}

			return producers
		})()
		const queueConsumers = (() => {
			if (!bindings.queues?.consumers || bindings.queues.consumers.length === 0) {
				return undefined
			}

			const consumers: Record<string, Record<string, unknown>> = {}
			for (const consumer of bindings.queues.consumers) {
				consumers[consumer.queue] = {
					...(consumer.maxBatchSize !== undefined && { maxBatchSize: consumer.maxBatchSize }),
					...(consumer.maxBatchTimeout !== undefined && { maxBatchTimeout: consumer.maxBatchTimeout }),
					...(consumer.maxRetries !== undefined && { maxRetries: consumer.maxRetries }),
					...(consumer.deadLetterQueue && { deadLetterQueue: consumer.deadLetterQueue }),
					...(consumer.maxConcurrency !== undefined && { maxConcurrency: consumer.maxConcurrency }),
					...(consumer.retryDelay !== undefined && { retryDelay: consumer.retryDelay })
				}
			}

			return consumers
		})()

		// Shared options (not worker-specific)
		const sharedOptions: any = {
			port: miniflarePort,
			host: '127.0.0.1',

			// Persistence paths
			kvPersist: persist ? `${persistPath}/kv` : undefined,
			r2Persist: persist ? `${persistPath}/r2` : undefined,
			d1Persist: persist ? `${persistPath}/d1` : undefined,
			durableObjectsPersist: persist ? `${persistPath}/do` : undefined
		}

		const createServiceBindings = (
			extraBindings: Record<string, MiniflareServiceBinding> = {}
		) => {
			const serviceBindings: Record<string, MiniflareServiceBinding> = {}

			if (bindings.services) {
				for (const [bindingName, serviceConfig] of Object.entries(bindings.services)) {
					serviceBindings[bindingName] = {
						name: serviceConfig.service,
						...(serviceConfig.entrypoint && { entrypoint: serviceConfig.entrypoint })
					}
				}
			}

			for (const [bindingName, target] of Object.entries(extraBindings)) {
				serviceBindings[bindingName] = target
			}

			return Object.keys(serviceBindings).length > 0 ? serviceBindings : undefined
		}

		const sendEmailConfig = bindings.sendEmail
			? {
				send_email: Object.entries(bindings.sendEmail).map(([name, binding]) => ({
					name,
					...(binding.destinationAddress && {
						destination_address: binding.destinationAddress
					}),
					...(binding.allowedDestinationAddresses && {
						allowed_destination_addresses: binding.allowedDestinationAddresses
					}),
					...(binding.allowedSenderAddresses && {
						allowed_sender_addresses: binding.allowedSenderAddresses
					})
				}))
			}
			: undefined

		const createWorkerConfig = (options: {
			name: string
			script?: string
			scriptPath?: string
			durableObjects?: Record<string, string | { className: string; scriptName: string }>
			serviceBindings?: Record<string, MiniflareServiceBinding>
			queueConsumers?: Record<string, Record<string, unknown>>
			triggers?: { crons?: string[] }
		}) => {
			const baseFlags = loadedConfig.compatibilityFlags ?? []
			const compatFlags = baseFlags.includes('nodejs_compat')
				? baseFlags
				: [...baseFlags, 'nodejs_compat']
			const workerBindings: Record<string, unknown> = loadedConfig.vars ?? {}

			const workerConfig: any = {
				name: options.name,
				modules: true,
				compatibilityDate: loadedConfig.compatibilityDate,
				compatibilityFlags: compatFlags,
				...(bindings.kv && {
					kvNamespaces: Object.fromEntries(
						Object.entries(bindings.kv).map(([bindingName, bindingConfig]) => {
							return [bindingName, getLocalKVNamespaceIdentifier(bindingConfig)]
						})
					)
				}),
				...(bindings.r2 && { r2Buckets: bindings.r2 }),
				...(bindings.d1 && {
					d1Databases: Object.fromEntries(
						Object.entries(bindings.d1).map(([bindingName, bindingConfig]) => {
							return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
						})
					)
				}),
				...(Object.keys(workerBindings).length > 0 && { bindings: workerBindings }),
				...(sendEmailConfig && { email: sendEmailConfig }),
				...(queueProducers && { queueProducers }),
				...(options.queueConsumers && { queueConsumers: options.queueConsumers }),
				...(options.triggers && { triggers: options.triggers })
			}

			if (options.scriptPath) {
				workerConfig.scriptPath = options.scriptPath
				workerConfig.modulesRoot = cwd
				workerConfig.modulesRules = [
					{ type: 'ESModule', include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.mjs'] },
					{ type: 'CommonJS', include: ['**/*.js', '**/*.cjs'] },
					{ type: 'ESModule', include: ['**/*.jsx'] }
				]
			}

			if (options.script) {
				workerConfig.script = options.script
			}

			if (options.durableObjects && Object.keys(options.durableObjects).length > 0) {
				workerConfig.durableObjects = options.durableObjects
			}

			if (options.serviceBindings && Object.keys(options.serviceBindings).length > 0) {
				workerConfig.serviceBindings = options.serviceBindings
			}

			return workerConfig
		}

		// Gateway worker configuration (receives all HTTP requests)
		// The first worker in the array is the entrypoint
		const gatewayWorker = createWorkerConfig({
			name: 'gateway',
			script: getGatewayScript(
				loadedConfig.wsRoutes,
				debug,
				shouldRunMainWorker ? INTERNAL_APP_SERVICE_BINDING : null
			),
			serviceBindings: shouldRunMainWorker
				? createServiceBindings({
					[INTERNAL_APP_SERVICE_BINDING]: { name: appWorkerName }
				})
				: createServiceBindings()
		})
		gatewayWorker.routes = ['*']

		const hasDurableObjectBundles = !!doResult && doResult.bundles.size > 0
		const browserBindingName = getSingleBrowserBindingName(bindings.browser)
		const needsBrowserWorker = Boolean(browserBindingName && (hasDurableObjectBundles || shouldRunMainWorker))

		// If there is no app worker, DO worker, or browser worker, keep the
		// lightweight gateway-only configuration.
		if (!shouldRunMainWorker && !hasDurableObjectBundles && !needsBrowserWorker) {
			return {
				...sharedOptions,
				...gatewayWorker
			}
		}

		// Multi-worker setup: gateway + DO workers + browser binding worker
		// CRITICAL: First worker in array is entrypoint (receives HTTP requests)
		const workers: any[] = []
		const durableObjects: Record<string, { className: string; scriptName: string }> = {}

		// Browser binding configuration
		const browserShimUrl = `http://127.0.0.1:${browserShimPort}`
		const browserWorkerName = 'browser-binding'

		if (shouldRunMainWorker && mainWorkerScriptPath) {
			const mainWorkerServiceBindings = createServiceBindings(
				browserBindingName
					? {
						[browserBindingName]: { name: browserWorkerName }
					}
					: {}
			)

			const mainWorkerConfig = createWorkerConfig({
				name: appWorkerName,
				scriptPath: bundledMainWorkerScriptPath ?? mainWorkerScriptPath,
				serviceBindings: mainWorkerServiceBindings,
				queueConsumers,
				triggers: loadedConfig.triggers?.crons?.length
					? { crons: loadedConfig.triggers.crons }
					: undefined
			})

			workers.push(mainWorkerConfig)
		}

		// Create a worker for each DO bundle
		if (doResult) {
			for (const [bindingName, bundlePath] of doResult.bundles) {
				const className = doResult.classes.get(bindingName)
				if (!className) continue

				const workerName = `do-${bindingName.toLowerCase()}`

				const workerConfig = createWorkerConfig({
					name: workerName,
					scriptPath: bundlePath,
					durableObjects: {
						[bindingName]: className
					},
					serviceBindings: createServiceBindings(
						browserBindingName
							? {
								[browserBindingName]: { name: browserWorkerName }
							}
							: {}
					)
				})

				if (browserBindingName) {
					logger?.debug(`DO ${workerName} has browser service binding: ${browserBindingName} → ${browserWorkerName}`)
				}

				logger?.debug(`DO ${workerName} config:`, JSON.stringify(workerConfig, null, 2))
				workers.push(workerConfig)

				// Reference this worker from the gateway
				durableObjects[bindingName] = {
					className,
					scriptName: workerName
				}
			}
		}

		// Add browser binding worker if configured
		// This worker runs inside workerd and handles WebSocket upgrades properly
		if (needsBrowserWorker) {
			const browserWorker = createWorkerConfig({
				name: browserWorkerName,
				script: getBrowserBindingScript(browserShimUrl, debug)
			})
			workers.push(browserWorker)
			logger?.info(`Browser binding worker configured: ${browserBindingName} → ${browserShimUrl}`)
		}

		// Add DO bindings to gateway worker
		if (Object.keys(durableObjects).length > 0) {
			gatewayWorker.durableObjects = durableObjects

			if (shouldRunMainWorker) {
				const mainWorker = workers.find((worker) => worker.name === appWorkerName)
				if (mainWorker) {
					mainWorker.durableObjects = durableObjects
				}
			}
		}

		// Return multi-worker config with gateway FIRST (entrypoint)
		// Note: Browser binding uses Node.js handler (not a worker)
		return {
			...sharedOptions,
			workers: [gatewayWorker, ...workers]
		}
	}

	/**
	 * Start Miniflare with current config
	 */
	async function startMiniflare(doResult: DOBundleResult | null): Promise<void> {
		const { Miniflare, Log, LogLevel } = await import('miniflare')

		const mfConfig = buildMiniflareConfig(doResult)
		mfConfig.log = createCompatibilityAwareMiniflareLog(Log, LogLevel.DEBUG, logger)
		mfConfig.handleRuntimeStdio = createRuntimeStdioForwarder(logger)
		const shouldLogMiniflareDiagnostics = verbose || debug

		if (shouldLogMiniflareDiagnostics) {
			logger?.info('=== MINIFLARE CONFIG DEBUG ===')
			logger?.info('Full config:', JSON.stringify(mfConfig, (key, value) => {
				// Truncate long scripts
				if (key === 'script' && typeof value === 'string' && value.length > 200) {
					return value.substring(0, 200) + '...[truncated]'
				}
				return value
			}, 2))

			if (mfConfig.workers) {
				logger?.info('Workers order:')
				for (const w of mfConfig.workers) {
					logger?.info(`  → ${w.name}:`)
					logger?.info(`      script: ${w.script ? 'inline' : w.scriptPath}`)
					logger?.info(`      browserRendering: ${JSON.stringify(w.browserRendering)}`)
					logger?.info(`      durableObjects: ${JSON.stringify(w.durableObjects)}`)
				}
			}
		}

		miniflare = new Miniflare(mfConfig)
		await miniflare.ready

		logger?.success(`Miniflare ready on http://localhost:${miniflarePort}`)

		if (shouldLogMiniflareDiagnostics) {
			try {
				const gatewayBindings = await miniflare.getBindings('gateway')
				logger?.info('Gateway worker bindings:', Object.keys(gatewayBindings))

				if (mfConfig.workers) {
					for (const w of mfConfig.workers) {
						if (w.name !== 'gateway') {
							try {
								const doBindings = await miniflare.getBindings(w.name)
								logger?.info(`${w.name} worker bindings:`, Object.keys(doBindings))
								if ('BROWSER' in doBindings) {
									logger?.success(`${w.name} has BROWSER binding!`)
								} else {
									logger?.warn(`${w.name} is MISSING BROWSER binding`)
								}
							} catch (error) {
								logger?.debug(`Skipping binding diagnostics for ${w.name}: ${formatErrorMessage(error)}`)
							}
						}
					}
				}
			} catch (error) {
				logger?.debug(`Skipping Miniflare binding diagnostics: ${formatErrorMessage(error)}`)
			}
		}
	}

	/**
	 * Reload Miniflare with updated DO bundles
	 */
	async function reloadMiniflare(doResult: DOBundleResult | null): Promise<void> {
		currentDoResult = doResult

		const queuedReload = reloadChain.then(async () => {
			if (!miniflare) return

			const { Log, LogLevel } = await import('miniflare')
			const mfConfig = buildMiniflareConfig(currentDoResult)
			// Always enable debug logging to see worker load errors
			mfConfig.log = createCompatibilityAwareMiniflareLog(Log, LogLevel.DEBUG, logger)
			mfConfig.handleRuntimeStdio = createRuntimeStdioForwarder(logger)

			logger?.info('Reloading Miniflare...')
			await miniflare.setOptions(mfConfig)
			logger?.success('Miniflare reloaded')
		})

		reloadChain = queuedReload.catch(() => { })
		await queuedReload
	}

	async function resolveWorkerConfigWatchPath(): Promise<string | null> {
		if (configPath) {
			const explicitPath = resolve(cwd, configPath)
			const fs = await import('node:fs/promises')
			try {
				await fs.access(explicitPath)
				return explicitPath
			} catch {
				// Fall back to config discovery below when the explicit path is not directly watchable.
			}
		}

		return await resolveConfigPath(cwd) ?? null
	}

	async function refreshWorkerOnlySurfaceState(): Promise<void> {
		if (!config) {
			return
		}

		mainWorkerSurfacePaths = await resolveMainWorkerSurfacePaths(cwd, config)
		mainWorkerRoutes = await discoverRoutes(cwd, config)
		const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, config, undefined, {
			devInternalEmail: true
		})
		mainWorkerScriptPath = composedMainEntry ? resolve(cwd, composedMainEntry) : null

		if (mainWorkerScriptPath) {
			await bundleMainWorker()
		} else {
			bundledMainWorkerScriptPath = null
		}

		await syncWorkerWatchTargets()
	}

	function getWorkerWatchTargets(): string[] {
		if (enableVite || !config) {
			return []
		}

		const targets = collectWorkerWatchRoots(cwd, config, mainWorkerSurfacePaths)
		if (resolvedWorkerConfigPath) {
			targets.push(resolvedWorkerConfigPath)
		}

		return [...new Set(targets)]
	}

	async function syncWorkerWatchTargets(): Promise<void> {
		if (!workerSourceWatcher) {
			return
		}

		const nextWatchTargets = getWorkerWatchTargets()
		const nextWatchTargetSet = new Set(nextWatchTargets)
		const targetsToRemove = workerWatchTargets.filter((target) => !nextWatchTargetSet.has(target))
		const targetsToAdd = nextWatchTargets.filter((target) => !workerWatchTargets.includes(target))

		if (targetsToRemove.length > 0) {
			await workerSourceWatcher.unwatch(targetsToRemove)
		}

		if (targetsToAdd.length > 0) {
			workerSourceWatcher.add(targetsToAdd)
		}

		workerWatchTargets = nextWatchTargets
	}

	async function reloadWorkerOnlyConfig(): Promise<void> {
		config = await loadConfig({ cwd, configFile: configPath })
		setLocalSendEmailBindings(config.bindings?.sendEmail ?? {})
		resolvedWorkerConfigPath = await resolveWorkerConfigWatchPath()
		await refreshWorkerOnlySurfaceState()
		await reloadMiniflare(currentDoResult)
	}

	async function startWorkerSourceWatcher(): Promise<void> {
		if (enableVite || !config) {
			return
		}

		const watchTargets = getWorkerWatchTargets()
		if (watchTargets.length === 0) {
			return
		}

		const chokidar = await import('chokidar')
		const isWindows = process.platform === 'win32'
		const ignoredSegments = ['/node_modules/', '/.git/', '/.devflare/', '/dist/']

		const normalizePath = (filePath: string) => filePath.replace(/\\/g, '/')
		const isIgnoredPath = (filePath: string) => {
			const normalizedPath = normalizePath(filePath)
			return ignoredSegments.some((segment) => normalizedPath.includes(segment))
		}

		let reloadTimeout: ReturnType<typeof setTimeout> | null = null
		let reloadInProgress = false
		let pendingReloadPath: string | null = null

		const triggerReload = async (filePath: string) => {
			if (reloadInProgress) {
				pendingReloadPath = filePath
				return
			}

			reloadInProgress = true

			try {
				const normalizedConfigPath = resolvedWorkerConfigPath ? normalizePath(resolvedWorkerConfigPath) : null
				if (normalizedConfigPath && normalizePath(filePath) === normalizedConfigPath) {
					logger?.info(`Devflare config changed: ${filePath}`)
					await reloadWorkerOnlyConfig()
					return
				}

				logger?.info(`Worker source changed: ${filePath}`)
				await refreshWorkerOnlySurfaceState()
				await reloadMiniflare(currentDoResult)
			} catch (error) {
				logger?.error('Worker source reload failed:', error)
			} finally {
				reloadInProgress = false

				if (pendingReloadPath) {
					const nextPath = pendingReloadPath
					pendingReloadPath = null
					await triggerReload(nextPath)
				}
			}
		}

		const scheduleReload = (filePath: string) => {
			if (reloadTimeout) {
				clearTimeout(reloadTimeout)
			}

			reloadTimeout = setTimeout(() => {
				void triggerReload(filePath)
			}, 150)
		}

		workerWatchTargets = watchTargets
		workerSourceWatcher = chokidar.watch(watchTargets, {
			ignoreInitial: true,
			usePolling: isWindows,
			interval: isWindows ? 300 : undefined,
			awaitWriteFinish: {
				stabilityThreshold: 100,
				pollInterval: 50
			},
			ignored: (filePath) => isIgnoredPath(filePath)
		})

		const onFileEvent = (filePath: string) => {
			if (isIgnoredPath(filePath)) {
				return
			}

			scheduleReload(filePath)
		}

		workerSourceWatcher.on('change', onFileEvent)
		workerSourceWatcher.on('add', onFileEvent)
		workerSourceWatcher.on('unlink', onFileEvent)

		workerSourceWatcher.on('error', (error) => {
			logger?.error('Worker source watcher error:', error)
		})

		await new Promise<void>((resolvePromise, rejectPromise) => {
			const handleReady = () => {
				workerSourceWatcher?.off('error', handleInitialError)
				logger?.info(`Worker source watcher ready (${watchTargets.length} target(s))`)
				resolvePromise()
			}

			const handleInitialError = (error: unknown) => {
				workerSourceWatcher?.off('ready', handleReady)
				rejectPromise(error instanceof Error ? error : new Error(String(error)))
			}

			workerSourceWatcher?.once('ready', handleReady)
			workerSourceWatcher?.once('error', handleInitialError)
		})
	}

	/**
	 * Run D1 migrations from migrations/ directory
	 * Uses HTTP endpoint in the gateway worker to run migrations inside workerd
	 */
	async function runD1Migrations(): Promise<void> {
		if (!miniflare || !config?.bindings?.d1) return

		const { existsSync, readdirSync, readFileSync } = await import('node:fs')
		const migrationsDir = resolve(cwd, 'migrations')

		if (!existsSync(migrationsDir)) {
			logger?.debug('No migrations/ directory found, skipping D1 migrations')
			return
		}

		// Get all SQL files sorted by name
		const files = readdirSync(migrationsDir)
			.filter((f: string) => f.endsWith('.sql'))
			.sort()

		if (files.length === 0) {
			logger?.debug('No SQL migration files found')
			return
		}

		logger?.info(`Running ${files.length} D1 migration(s)...`)

		// Collect all statements from all migration files
		const allStatements: string[] = []
		for (const file of files) {
			const sql = readFileSync(resolve(migrationsDir, file), 'utf-8')
			// Remove SQL comments (lines starting with --) before splitting
			const cleanedSql = sql
				.split('\n')
				.filter((line: string) => !line.trim().startsWith('--'))
				.join('\n')
			const statements = cleanedSql
				.split(';')
				.map((s: string) => s.trim())
				.filter((s: string) => s.length > 0)
			allStatements.push(...statements)
			logger?.debug(`File ${file}: ${statements.length} statement(s)`)
		}

		// Run migrations for each D1 binding via gateway HTTP endpoint
		for (const [bindingName] of Object.entries(config.bindings.d1)) {
			// Retry with exponential backoff
			for (let attempt = 0;attempt < 5;attempt++) {
				await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
				try {
					const response = await fetch(`http://127.0.0.1:${miniflarePort}/_devflare/migrate`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ bindingName, statements: allStatements })
					})

					if (!response.ok) {
						const text = await response.text()
						throw new Error(`HTTP ${response.status}: ${text}`)
					}

					const result = await response.json() as { success?: boolean; error?: string; results?: any[] }
					if (result.success) {
						logger?.success(`D1 migrations applied to ${bindingName}`)
						break
					} else {
						throw new Error(result.error || 'Unknown error')
					}
				} catch (error) {
					if (attempt === 4) {
						logger?.warn(`Failed to apply migrations to ${bindingName}: ${error}`)
					}
				}
			}
		}
	}

	/**
	 * Start Vite dev server
	 */
	async function startVite(): Promise<void> {
		const { spawn } = await import('node:child_process')

		const args = ['vite', 'dev', '--port', String(vitePort)]
		if (generatedViteConfigPath) {
			args.push('--config', generatedViteConfigPath)
		}

		viteProcess = spawn('bunx', args, {
			cwd,
			stdio: ['inherit', 'pipe', 'pipe'],
			windowsHide: true,
			env: {
				...process.env,
				DEVFLARE_DEV: 'true',
				DEVFLARE_BRIDGE_PORT: String(miniflarePort),
				FORCE_COLOR: '1'
			}
		})

		const readyUrl = await waitForViteReady(viteProcess, {
			onStdout(chunk) {
				process.stdout.write(chunk)
			},
			onStderr(chunk) {
				process.stderr.write(chunk)
			}
		})

		if (readyUrl) {
			logger?.success(`Vite dev server started on ${readyUrl}`)
			return
		}

		logger?.warn('Vite process started, but the final local URL could not be confirmed yet')
	}

	/**
	 * Start the complete dev server
	 */
	async function start(): Promise<void> {
		logger?.info('Starting unified dev server...')

		// Load config
		config = await loadConfig({ cwd, configFile: configPath })
		setLocalSendEmailBindings(config.bindings?.sendEmail ?? {})
		resolvedWorkerConfigPath = await resolveWorkerConfigWatchPath()
		logger?.debug('Loaded config:', config.name)
		if (enableVite) {
			const viteProject = await detectViteProject(cwd)
			generatedViteConfigPath = await writeGeneratedViteConfig({
				cwd,
				configPath,
				localConfigPath: viteProject.viteConfigPath,
				bridgePort: miniflarePort
			})
			logger?.debug(`Generated Vite config → ${generatedViteConfigPath}`)
		}
		await refreshWorkerOnlySurfaceState()

		if (
			!enableVite
			&& (hasWorkerSurfacePaths(mainWorkerSurfacePaths) || Boolean(mainWorkerRoutes?.routes.length))
		) {
			const detectedWorkerHandlers = Object.entries(mainWorkerSurfacePaths)
				.filter(([, surfacePath]) => !!surfacePath)
				.map(([surfaceName, surfacePath]) => `${surfaceName}=${surfacePath}`)
			const detectedRouteHandlers = mainWorkerRoutes?.routes.map((route) => `route=${route.filePath}`) ?? []
			logger?.info(`Worker handlers detected: ${[...detectedWorkerHandlers, ...detectedRouteHandlers].join(', ')}`)
		} else if (!enableVite) {
			logger?.warn('No local worker handler entry was found for worker-only mode')
		}

		// Check for remote bindings and warn if requirements not met
		const remoteCheck = await checkRemoteBindingRequirements(config)
		if (remoteCheck.hasRemoteBindings) {
			logger?.info('')
			logger?.warn('⚠️  Remote-only bindings detected:')
			for (const binding of remoteCheck.remoteBindings) {
				logger?.warn(`   • ${binding}`)
			}
			logger?.info('')

			if (remoteCheck.missingAccountId) {
				logger?.warn('⚠️  WARN: accountId is not set in devflare.config.ts')
				logger?.warn('   Remote bindings (AI, Vectorize) require accountId to charge the correct account.')
				logger?.warn('   Add: accountId: \'your-cloudflare-account-id\'')
				logger?.info('')
			}

			if (remoteCheck.notLoggedIn) {
				logger?.warn('⚠️  WARN: Not logged in to Wrangler')
				logger?.warn('   Remote bindings require authentication.')
				logger?.warn('   Run: bunx wrangler login')
				logger?.info('')
			}

			if (!remoteCheck.missingAccountId && !remoteCheck.notLoggedIn) {
				logger?.success('✓ Remote binding requirements met')
				logger?.info('')
			}
		}

		// Start browser shim if browser rendering is configured
		const browserBinding = getSingleBrowserBindingName(config.bindings?.browser)
		if (browserBinding) {
			logger?.info(`Starting Browser Rendering shim (binding: ${browserBinding})...`)
			browserShim = createBrowserShim({
				port: browserShimPort,
				host: '127.0.0.1',
				logger,
				verbose
			})
			await browserShim.start()
		}

		// Bundle DOs if pattern is set
		const doPattern = config.files?.durableObjects
		let doResult: DOBundleResult | null = null

		if (typeof doPattern === 'string' && doPattern) {
			const outDir = resolve(cwd, '.devflare/do-bundles')

			doBundler = createDOBundler({
				cwd,
				pattern: doPattern,
				outDir,
				rolldownOptions: config.rolldown?.options,
				sourcemap: config.rolldown?.sourcemap,
				minify: config.rolldown?.minify,
				logger,
				onRebuild: async (result) => {
					// Hot reload Miniflare when DOs change
					await reloadMiniflare(result)
				}
			})

			// Initial build
			doResult = await doBundler.build()
			currentDoResult = doResult

			// Start watching
			await doBundler.watch()
		}

		currentDoResult = doResult

		// Start Miniflare
		await startMiniflare(doResult)
		await startWorkerSourceWatcher()

		if (enableVite) {
			await startVite()
		} else {
			logger?.info('Vite startup skipped (no effective Vite config found for this package)')
		}

		// Run D1 migrations after the dev runtime is started (give Miniflare more time to stabilize)
		await new Promise((r) => setTimeout(r, 1000))
		await runD1Migrations()
	}

	/**
	 * Stop the dev server
	 */
	async function stop(): Promise<void> {
		if (doBundler) {
			await doBundler.close()
			doBundler = null
		}

		if (workerSourceWatcher) {
			await workerSourceWatcher.close()
			workerSourceWatcher = null
		}

		if (miniflare) {
			await miniflare.dispose()
			miniflare = null
		}

		if (viteProcess) {
			await stopSpawnedProcessTree(viteProcess)
			viteProcess = null
		}

		if (browserShim) {
			await browserShim.stop()
			browserShim = null
		}

		clearLocalSendEmailBindings()
	}

	/**
	 * Get Miniflare instance
	 */
	function getMiniflare(): MiniflareType | null {
		return miniflare
	}

	return {
		start,
		stop,
		getMiniflare
	}
}
