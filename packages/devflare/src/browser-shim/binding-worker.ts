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
//    → Ask the shim for the session, ATTACHING to it
//    → Create WebSocketPair, connect straight to Chrome's DevTools port
//    → Return Response with webSocket property (Cloudflare style)
// 3. Either end closes → RELEASE the session back to the shim
//
// → KEY: step 2 bypasses the shim's own websocket server, so the shim cannot
//   observe this relay at all. Attach and release are therefore things this
//   worker must REPORT; a version of this file that only did step 2 left every
//   session looking unused, and the shim closed each one 60 seconds after
//   acquire with a client mid-render.
//
// The browser shim server provides:
// - GET|POST /v1/acquire and /v1/devtools/browser → Launch browser, return sessionId
// - GET /v1/connectDevtools?browser_session=X and /v1/devtools/browser/X → DevTools
// - GET /v1/session/:sessionId[?attach=1] → Session info incl. wsEndpoint; attach
// - POST /v1/session/:sessionId/release → This client is done with the session
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

import {
	DEVTOOLS_PATH_PREFIX,
	LEGACY_DEVTOOLS_PATH,
	LEGACY_SESSION_PARAM,
	SESSION_ATTACH_PARAM,
	SESSION_CONNECTION_PARAM,
	SESSION_PATH_PREFIX,
	SESSION_RELEASE_SUFFIX
} from './routes'

// Max chunk size for WebSocket messages (Workers limit is ~1MB, leave room)
const MAX_CHUNK_SIZE = 1048575

/**
 * Budget for every call this worker makes back to the shim, and for the
 * DevTools upgrade to Chrome itself.
 *
 * → GOTCHA: the Chrome upgrade used to carry no bound at all while the session
 *   lookup beside it carried 5s. A wedged Chrome therefore hung the upgrade for
 *   as long as the runtime allowed, with the client holding an open socket and
 *   nothing to time it out but puppeteer's 180s protocolTimeout.
 */
const SHIM_FETCH_TIMEOUT_MS = 5000

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
const SHIM_FETCH_TIMEOUT_MS = ${SHIM_FETCH_TIMEOUT_MS}
const DEBUG = ${debug}
const log = (...args) => DEBUG && console.log('[BrowserBinding]', ...args)

// Interpolated from src/browser-shim/routes.ts, which a workerd script string
// cannot import. Keep the matching below in step with that module.
const LEGACY_DEVTOOLS_PATH = ${JSON.stringify(LEGACY_DEVTOOLS_PATH)}
const LEGACY_SESSION_PARAM = ${JSON.stringify(LEGACY_SESSION_PARAM)}
const DEVTOOLS_PATH_PREFIX = ${JSON.stringify(DEVTOOLS_PATH_PREFIX)}
const SESSION_PATH_PREFIX = ${JSON.stringify(SESSION_PATH_PREFIX)}
const SESSION_RELEASE_SUFFIX = ${JSON.stringify(SESSION_RELEASE_SUFFIX)}
const SESSION_ATTACH_PARAM = ${JSON.stringify(SESSION_ATTACH_PARAM)}
const SESSION_CONNECTION_PARAM = ${JSON.stringify(SESSION_CONNECTION_PARAM)}

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

// Close a socket that may already be closing, and say so when that fails.
//
// The state this is usually reached from is exactly the one where close()
// throws, hence the readyState precondition. Anything that gets past it is
// unexpected and is logged rather than swallowed: these calls sit inside event
// listeners, where a throw has no boundary to reach.
function closeSocket(socket, code, reason) {
	if (socket.readyState !== 0 && socket.readyState !== 1) return
	try {
		socket.close(validateCloseCode(code), reason || '')
	} catch (error) {
		console.error('[BrowserBinding] Failed to close socket:', error && error.message ? error.message : error)
	}
}

// Forward one CDP message to Chrome, failing the client fast when Chrome's
// socket has gone.
//
// → KEY: a dropped CDP command is INVISIBLE to the caller. puppeteer registers
//   a callback against the message id and resolves it when the reply arrives;
//   with nothing forwarded there is no reply and no close event to reject it,
//   so the await sits there for the full protocolTimeout — 180s by default.
//   Closing the client's end turns a three-minute hang into an error at the
//   call site. This branch was a bare return statement, and is the whole reason
//   browser.close() appeared to hang after the shim had reaped a session.
function forwardToChrome(chromeWs, server, data) {
	if (chromeWs.readyState === 1) { // OPEN
		chromeWs.send(data)
		return true
	}

	DEBUG && console.error('[BrowserBinding] Chrome socket not open; closing client')
	closeSocket(server, 1011, 'chrome devtools socket is not open')
	return false
}

// Tell the shim this client is done with the session, so its keep_alive can
// start counting. Fire-and-forget: it runs from a socket close listener, where
// there is nothing to await it and nothing to act on a rejection — but a
// release that never lands leaves a Chrome alive until it exits on its own, so
// the failure is reported rather than dropped.
function releaseSession(sessionId, connectionId) {
	const releaseUrl = new URL(
		SESSION_PATH_PREFIX + sessionId + SESSION_RELEASE_SUFFIX,
		BROWSER_SHIM_URL
	)
	if (connectionId) {
		releaseUrl.searchParams.set(SESSION_CONNECTION_PARAM, connectionId)
	}

	return fetch(releaseUrl.toString(), { method: 'POST' }).catch((error) => {
		console.error(
			'[BrowserBinding] Failed to release session ' + sessionId + ':',
			error && error.message ? error.message : error
		)
	})
}

// Fetch with a bound, so a wedged shim or a wedged Chrome cannot hold an
// upgrade open indefinitely.
async function fetchBounded(url, init) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), SHIM_FETCH_TIMEOUT_MS)
	try {
		return await fetch(url, Object.assign({}, init, { signal: controller.signal }))
	} finally {
		clearTimeout(timeout)
	}
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

	// Get session info from browser shim (includes Chrome's wsEndpoint).
	//
	// → KEY: the attach flag is not decoration. The relay below goes straight to
	//   Chrome's own DevTools port, so this request is the only thing that tells
	//   the shim a client has arrived — without it the shim sees a session
	//   nobody ever connected to and reaps it mid-render once keep_alive
	//   elapses (60s by default).
	const sessionUrl = new URL(SESSION_PATH_PREFIX + sessionId, BROWSER_SHIM_URL)
	sessionUrl.searchParams.set(SESSION_ATTACH_PARAM, '1')

	let sessionRes
	try {
		sessionRes = await fetchBounded(sessionUrl.toString())
	} catch (e) {
		DEBUG && console.error('[BrowserBinding] Session fetch timeout or error:', e.message)
		return new Response('Session fetch timeout', { status: 504 })
	}

	if (!sessionRes.ok) {
		DEBUG && console.error('[BrowserBinding] Session not found:', sessionId)
		return new Response('Session not found', { status: 404 })
	}

	const sessionInfo = await sessionRes.json()
	const wsEndpoint = sessionInfo.wsEndpoint
	const connectionId = sessionInfo.connectionId

	// Attached from here on: every path out of this function either establishes
	// the relay or releases, or the session stays pinned until Chrome exits.
	let released = false
	function releaseOnce() {
		if (released) return
		released = true
		return releaseSession(sessionId, connectionId)
	}

	if (!wsEndpoint) {
		DEBUG && console.error('[BrowserBinding] No wsEndpoint in session info')
		releaseOnce()
		return new Response('No wsEndpoint for session', { status: 500 })
	}

	log('Connecting to Chrome DevTools:', wsEndpoint)

	// Connect to Chrome's DevTools WebSocket
	// Chrome uses ws:// but fetch expects http:// for WebSocket upgrade
	const chromeUrl = wsEndpoint.replace('ws://', 'http://').replace('wss://', 'https://')

	let chromeRes
	try {
		chromeRes = await fetchBounded(chromeUrl, { headers: { Upgrade: 'websocket' } })
	} catch (e) {
		DEBUG && console.error('[BrowserBinding] Chrome upgrade timeout or error:', e.message)
		releaseOnce()
		return new Response('Chrome DevTools upgrade timeout', { status: 504 })
	}

	if (!chromeRes.webSocket) {
		DEBUG && console.error('[BrowserBinding] Failed to connect to Chrome DevTools')
		releaseOnce()
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
			forwardToChrome(chromeWs, server, event.data)
			return
		}

		// Handle binary data (chunked protocol)
		if (event.data instanceof ArrayBuffer) {
			const chunk = new Uint8Array(event.data)
			bufferSize += chunk.length

			// Prevent unbounded buffering
			if (bufferSize > MAX_BUFFER_SIZE) {
				DEBUG && console.error('[BrowserBinding] Buffer overflow, closing connection')
				closeSocket(server, 1009, 'Message too big')
				closeSocket(chromeWs, 1009, 'Message too big')
				return
			}

			chunks.push(chunk)

			// Try to reassemble complete message
			const message = chunksToMessage(chunks)
			if (message !== null) {
				// Send complete message to Chrome
				forwardToChrome(chromeWs, server, message)
				// Clear buffer
				chunks = []
				bufferSize = 0
			}
		} else if (typeof event.data === 'string') {
			// Shouldn't happen in normal protocol, but handle it
			forwardToChrome(chromeWs, server, event.data)
		}
	})
	
	// Proxy messages from Chrome to client (puppeteer)
	// Split into chunks following the multi-chunk protocol
	chromeWs.addEventListener('message', (event) => {
		// Dropping is right in THIS direction, unlike the one above: a client
		// that is no longer open has nothing left waiting on this reply, and its
		// own close listener has already closed Chrome's end.
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
	
	// Handle close events with validated codes. Either end going quiet ends the
	// relay, and the shim is told so its keep_alive can start counting.
	server.addEventListener('close', (event) => {
		log('Client WebSocket closed:', event.code)
		closeSocket(chromeWs, event.code, event.reason)
		releaseOnce()
	})

	chromeWs.addEventListener('close', (event) => {
		log('Chrome WebSocket closed:', event.code)
		closeSocket(server, event.code, event.reason)
		releaseOnce()
	})

	// Handle errors
	server.addEventListener('error', (event) => {
		DEBUG && console.error('[BrowserBinding] Client WebSocket error')
		closeSocket(chromeWs, 1011, 'Client error')
		releaseOnce()
	})

	chromeWs.addEventListener('error', (event) => {
		DEBUG && console.error('[BrowserBinding] Chrome WebSocket error')
		closeSocket(server, 1011, 'Chrome error')
		releaseOnce()
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
