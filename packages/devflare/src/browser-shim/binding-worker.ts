// =============================================================================
// Browser Binding Worker — Runs inside workerd for WebSocket support
// =============================================================================
// This worker acts as the BROWSER binding inside workerd.
// It proxies HTTP requests to the browser shim server and handles WebSocket
// connections using WebSocketPair to properly support @cloudflare/puppeteer.
//
// Flow:
// 1. puppeteer.launch() → acquire → proxy to browser shim → get sessionId
// 2. puppeteer.connect() → DevTools upgrade
//    → Create WebSocketPair, connect to Chrome's DevTools endpoint via shim
//    → Return Response with webSocket property (Cloudflare style)
//
// The browser shim server provides:
// - GET|POST /v1/acquire and /v1/devtools/browser → Launch browser, return sessionId
// - GET /v1/connectDevtools?browser_session=X and /v1/devtools/browser/X → DevTools
// - GET /v1/session/:sessionId → Get session info including wsEndpoint
// - GET /v1/sessions → List active sessions
// - GET /v1/limits → Return limits info
// - GET /v1/history → Return session history
//
// CRITICAL: @cloudflare/puppeteer ≤ 1.0.7 wraps CDP traffic in a multi-chunk
// framing protocol, and 1.1.0 dropped it for plain unframed messages. The two
// generations also connect on different paths (see ./routes), and they changed
// together — so the DevTools path decides the framing. Chunked means:
// - First chunk: 4-byte little-endian length header + payload slice
// - Subsequent chunks: raw payload slices (no header)
// - Max chunk size: 1048575 bytes (just under 1MB Workers limit)
// - Must reassemble chunks before forwarding to Chrome
// - Must split Chrome responses into chunks for puppeteer
// =============================================================================

import { DEVTOOLS_PATH_PREFIX, LEGACY_DEVTOOLS_PATH, LEGACY_SESSION_PARAM } from './routes'

// Max chunk size for WebSocket messages (Workers limit is ~1MB, leave room)
const MAX_CHUNK_SIZE = 1048575

/**
 * Generate the browser binding worker script
 * @param browserShimUrl - URL of the external browser shim server (e.g., http://127.0.0.1:8788)
 * @param debug - Enable debug logging (default: false)
 */
export function getBrowserBindingScript(browserShimUrl: string, debug = false): string {
	// Safely encode the URL for injection
	const safeUrl = JSON.stringify(browserShimUrl)

	return `
// Browser Binding Worker — Proxies puppeteer requests to external browser shim
// Handles WebSocket upgrades using WebSocketPair for @cloudflare/puppeteer compatibility

const BROWSER_SHIM_URL = ${safeUrl}
const MAX_CHUNK_SIZE = ${MAX_CHUNK_SIZE}
const DEBUG = ${debug}
const log = (...args) => DEBUG && console.log('[BrowserBinding]', ...args)

// Interpolated from src/browser-shim/routes.ts, which a workerd script string
// cannot import. Keep the matching below in step with that module.
const LEGACY_DEVTOOLS_PATH = ${JSON.stringify(LEGACY_DEVTOOLS_PATH)}
const LEGACY_SESSION_PARAM = ${JSON.stringify(LEGACY_SESSION_PARAM)}
const DEVTOOLS_PATH_PREFIX = ${JSON.stringify(DEVTOOLS_PATH_PREFIX)}

// A DevTools endpoint, in either @cloudflare/puppeteer generation's spelling
function isDevtoolsPath(pathname) {
	return pathname === LEGACY_DEVTOOLS_PATH || pathname.startsWith(DEVTOOLS_PATH_PREFIX)
}

// The session a DevTools request wants: <= 1.0.7 puts it in a query parameter,
// >= 1.1.0 in the last path segment. Null when the request names none.
function readDevtoolsSessionId(url) {
	if (url.pathname === LEGACY_DEVTOOLS_PATH) {
		return url.searchParams.get(LEGACY_SESSION_PARAM) || null
	}
	if (!url.pathname.startsWith(DEVTOOLS_PATH_PREFIX)) {
		return null
	}
	const sessionId = url.pathname.slice(DEVTOOLS_PATH_PREFIX.length)
	return sessionId.length > 0 && !sessionId.includes('/') ? sessionId : null
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const upgradeHeader = request.headers.get('Upgrade')
		const isWebSocket = upgradeHeader && upgradeHeader.toLowerCase() === 'websocket'
		
		log('Request:', url.pathname, isWebSocket ? '(WebSocket)' : '(HTTP)')

		// Handle WebSocket upgrade for DevTools connection
		if (isDevtoolsPath(url.pathname) && isWebSocket) {
			return handleDevToolsWebSocket(request, url)
		}

		// Proxy all other requests to the browser shim server
		return proxyToBrowserShim(request, url)
	}
}

// Proxy HTTP requests to the external browser shim server
async function proxyToBrowserShim(request, url) {
	const shimUrl = new URL(url.pathname + url.search, BROWSER_SHIM_URL)
	
	log('Proxying to:', shimUrl.toString())
	
	const response = await fetch(shimUrl.toString(), {
		method: request.method,
		headers: request.headers,
		body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
	})
	
	log('Response:', response.status)
	
	// Return the response as-is
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	})
}

// Validate WebSocket close code to be in valid range
function validateCloseCode(code) {
	if (typeof code !== 'number' || isNaN(code)) return 1000
	if (code < 1000 || code > 4999) return 1000
	return code
}

// Split a message into chunks following @cloudflare/puppeteer protocol
// First chunk has 4-byte LE length header, subsequent chunks are raw payload
function messageToChunks(message) {
	const data = typeof message === 'string'
		? new TextEncoder().encode(message)
		: new Uint8Array(message)
	
	const chunks = []
	const totalLength = data.length
	let offset = 0
	let isFirst = true
	
	while (offset < totalLength) {
		const remaining = totalLength - offset
		let chunkSize
		
		if (isFirst) {
			// First chunk: 4-byte header + payload
			chunkSize = Math.min(remaining, MAX_CHUNK_SIZE - 4)
			const chunk = new Uint8Array(chunkSize + 4)
			new DataView(chunk.buffer).setUint32(0, totalLength, true) // little-endian
			chunk.set(data.subarray(offset, offset + chunkSize), 4)
			chunks.push(chunk)
			isFirst = false
		} else {
			// Subsequent chunks: raw payload only
			chunkSize = Math.min(remaining, MAX_CHUNK_SIZE)
			const chunk = data.subarray(offset, offset + chunkSize)
			chunks.push(chunk)
		}
		
		offset += chunkSize
	}
	
	return chunks
}

// Reassemble chunks back into a complete message
// Returns null if more chunks are needed
function chunksToMessage(chunks) {
	if (chunks.length === 0) return null
	
	// First chunk must have 4-byte header
	const firstChunk = chunks[0]
	if (firstChunk.length < 4) return null
	
	const expectedLength = new DataView(firstChunk.buffer, firstChunk.byteOffset).getUint32(0, true)
	
	// Calculate total received payload
	let totalReceived = firstChunk.length - 4 // first chunk payload (minus header)
	for (let i = 1; i < chunks.length; i++) {
		totalReceived += chunks[i].length
	}
	
	if (totalReceived < expectedLength) {
		return null // Need more chunks
	}
	
	// Reassemble the message
	const assembled = new Uint8Array(expectedLength)
	let offset = 0
	
	// Copy first chunk payload (skip 4-byte header)
	const firstPayload = firstChunk.subarray(4)
	assembled.set(firstPayload, offset)
	offset += firstPayload.length
	
	// Copy remaining chunks
	for (let i = 1; i < chunks.length; i++) {
		const chunk = chunks[i]
		const toCopy = Math.min(chunk.length, expectedLength - offset)
		assembled.set(chunk.subarray(0, toCopy), offset)
		offset += toCopy
	}
	
	return new TextDecoder().decode(assembled)
}

// Handle WebSocket upgrade for DevTools connection
// Creates a WebSocketPair and proxies to Chrome's DevTools WebSocket
async function handleDevToolsWebSocket(request, url) {
	const sessionId = readDevtoolsSessionId(url)
	if (!sessionId) {
		return new Response('browser session id required', { status: 400 })
	}

	// The legacy DevTools path is the one whose client generation chunks CDP
	// traffic; from 1.1.0 the path changed and the framing went away with it.
	const chunked = url.pathname === LEGACY_DEVTOOLS_PATH

	log('DevTools WebSocket request for session:', sessionId, chunked ? '(chunked)' : '(plain)')

	// Get session info from browser shim (includes Chrome's wsEndpoint)
	const sessionUrl = new URL('/v1/session/' + sessionId, BROWSER_SHIM_URL)
	
	// Add timeout for session fetch
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 5000)
	
	let sessionRes
	try {
		sessionRes = await fetch(sessionUrl.toString(), { signal: controller.signal })
	} catch (e) {
		DEBUG && console.error('[BrowserBinding] Session fetch timeout or error:', e.message)
		return new Response('Session fetch timeout', { status: 504 })
	} finally {
		clearTimeout(timeout)
	}
	
	if (!sessionRes.ok) {
		DEBUG && console.error('[BrowserBinding] Session not found:', sessionId)
		return new Response('Session not found', { status: 404 })
	}
	
	const sessionInfo = await sessionRes.json()
	const wsEndpoint = sessionInfo.wsEndpoint
	
	if (!wsEndpoint) {
		DEBUG && console.error('[BrowserBinding] No wsEndpoint in session info')
		return new Response('No wsEndpoint for session', { status: 500 })
	}
	
	log('Connecting to Chrome DevTools:', wsEndpoint)
	
	// Connect to Chrome's DevTools WebSocket
	// Chrome uses ws:// but fetch expects http:// for WebSocket upgrade
	const chromeUrl = wsEndpoint.replace('ws://', 'http://').replace('wss://', 'https://')
	
	const chromeRes = await fetch(chromeUrl, {
		headers: { Upgrade: 'websocket' }
	})
	
	if (!chromeRes.webSocket) {
		DEBUG && console.error('[BrowserBinding] Failed to connect to Chrome DevTools')
		return new Response('Failed to connect to Chrome DevTools', { status: 502 })
	}
	
	const chromeWs = chromeRes.webSocket
	chromeWs.accept()
	
	log('Connected to Chrome DevTools')
	
	// Create WebSocketPair for client connection
	const { 0: client, 1: server } = new WebSocketPair()
	server.accept()
	
	// Chunk buffer for reassembling multi-chunk messages from puppeteer
	let chunks = []
	const MAX_BUFFER_SIZE = 50 * 1024 * 1024 // 50MB max buffer
	let bufferSize = 0
	
	// Proxy messages from client (puppeteer) to Chrome
	// Handle multi-chunk framing protocol
	server.addEventListener('message', (event) => {
		// Keep-alive ping from puppeteer (<= 1.0.7 only)
		if (event.data === 'ping') {
			return
		}

		// A plain client sends CDP messages whole, so pass them straight on
		if (!chunked) {
			if (chromeWs.readyState === 1) { // OPEN
				chromeWs.send(event.data)
			}
			return
		}

		// Handle binary data (chunked protocol)
		if (event.data instanceof ArrayBuffer) {
			const chunk = new Uint8Array(event.data)
			bufferSize += chunk.length
			
			// Prevent unbounded buffering
			if (bufferSize > MAX_BUFFER_SIZE) {
				DEBUG && console.error('[BrowserBinding] Buffer overflow, closing connection')
				server.close(1009, 'Message too big')
				chromeWs.close(1009, 'Message too big')
				return
			}
			
			chunks.push(chunk)
			
			// Try to reassemble complete message
			const message = chunksToMessage(chunks)
			if (message !== null) {
				// Send complete message to Chrome
				if (chromeWs.readyState === 1) { // OPEN
					chromeWs.send(message)
				}
				// Clear buffer
				chunks = []
				bufferSize = 0
			}
		} else if (typeof event.data === 'string') {
			// Shouldn't happen in normal protocol, but handle it
			if (chromeWs.readyState === 1) {
				chromeWs.send(event.data)
			}
		}
	})
	
	// Proxy messages from Chrome to client (puppeteer)
	// Split into chunks following the multi-chunk protocol
	chromeWs.addEventListener('message', (event) => {
		if (server.readyState !== 1) return // Not OPEN

		// A plain client reads what arrives as the CDP message itself, so a
		// length header would be parsed as part of the payload
		if (!chunked) {
			server.send(event.data)
			return
		}

		// Split message into chunks
		const outChunks = messageToChunks(event.data)
		for (const chunk of outChunks) {
			server.send(chunk)
		}
	})
	
	// Handle close events with validated codes
	server.addEventListener('close', (event) => {
		log('Client WebSocket closed:', event.code)
		const code = validateCloseCode(event.code)
		try {
			if (chromeWs.readyState === 1 || chromeWs.readyState === 0) {
				chromeWs.close(code, event.reason || '')
			}
		} catch {}
	})
	
	chromeWs.addEventListener('close', (event) => {
		log('Chrome WebSocket closed:', event.code)
		const code = validateCloseCode(event.code)
		try {
			if (server.readyState === 1 || server.readyState === 0) {
				server.close(code, event.reason || '')
			}
		} catch {}
	})
	
	// Handle errors
	server.addEventListener('error', (event) => {
		DEBUG && console.error('[BrowserBinding] Client WebSocket error')
		try { chromeWs.close(1011, 'Client error') } catch {}
	})
	
	chromeWs.addEventListener('error', (event) => {
		DEBUG && console.error('[BrowserBinding] Chrome WebSocket error')
		try { server.close(1011, 'Chrome error') } catch {}
	})
	
	log('WebSocket proxy established')
	
	// Return Cloudflare-style WebSocket response
	return new Response(null, {
		status: 101,
		webSocket: client
	})
}
`
}
