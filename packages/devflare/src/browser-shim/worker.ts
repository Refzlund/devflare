// =============================================================================
// Browser Rendering Worker — Internal Miniflare worker for Browser Rendering API
// =============================================================================
// This worker runs inside Miniflare and provides the proper Cloudflare WebSocket
// interface that @cloudflare/puppeteer expects. It proxies requests to the external
// browser shim server which actually manages Chrome instances.
//
// Why this exists:
// - @cloudflare/puppeteer expects `response.webSocket.accept()` API (workerd-specific)
// - Service binding functions in Miniflare return standard HTTP, not WebSocket responses
// - This worker runs in workerd and can return proper WebSocket Response objects
// =============================================================================

interface Env {
	BROWSER_SHIM_URL: string
}

/**
 * Generate the inline worker script for Browser Rendering
 * This is embedded in Miniflare as a script string
 *
 * The worker acts as a bridge between @cloudflare/puppeteer and our browser shim:
 * 1. HTTP requests (like /v1/acquire) are proxied to the shim
 * 2. WebSocket requests are handled by connecting to Chrome's DevTools directly
 *    (Chrome is launched by the shim and its ws endpoint is returned)
 *
 * @param browserShimUrl - URL of the browser shim server
 * @param debug - Enable debug logging (default: false, uses DEVFLARE_DEBUG env)
 */
export function generateBrowserWorkerScript(browserShimUrl: string, debug = false): string {
	return /* javascript */ `
// Browser Rendering Worker - provides WebSocket support for @cloudflare/puppeteer
// Sessions map: sessionId -> wsEndpoint
const sessionEndpoints = new Map()
const DEBUG = ${debug}
const log = (...args) => DEBUG && console.log('[BrowserWorker]', ...args)

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const browserShimUrl = '${browserShimUrl}'
		
		log('Request:', request.method, url.pathname, url.search)
		
		// Handle WebSocket upgrade for DevTools connection
		if (url.pathname === '/v1/connectDevtools') {
			const upgradeHeader = request.headers.get('Upgrade')
			if (upgradeHeader?.toLowerCase() === 'websocket') {
				return await handleWebSocketUpgrade(request, url, browserShimUrl)
			}
		}
		
		// Handle acquire - we need to intercept the response to store the WS endpoint
		if (url.pathname === '/v1/acquire') {
			return await handleAcquire(request, browserShimUrl)
		}
		
		// Forward all other requests to browser shim
		const targetUrl = browserShimUrl + url.pathname + url.search
		
		log('Proxying to:', targetUrl)
		
		// Clone request but change URL
		const proxyRequest = new Request(targetUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body
		})
		
		const response = await fetch(proxyRequest)
		
		// Return response with CORS headers
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		})
	}
}

async function handleAcquire(request, browserShimUrl) {
	// Forward acquire request to shim
	const targetUrl = browserShimUrl + '/v1/acquire'
	
	// Parse query params for GET requests
	const url = new URL(request.url)
	const keepAlive = url.searchParams.get('keep_alive')
	
	let proxyUrl = targetUrl
	if (keepAlive) {
		proxyUrl = targetUrl + '?keep_alive=' + keepAlive
	}
	
	log('Acquire request to:', proxyUrl)
	
	const response = await fetch(proxyUrl, {
		method: request.method,
		headers: request.headers,
		body: request.method === 'POST' ? request.body : undefined
	})
	
	if (!response.ok) {
		return response
	}
	
	// Get the sessionId from response
	const data = await response.json()
	log('Acquire response:', JSON.stringify(data))
	
	// After acquiring, get the session info to store the WS endpoint
	if (data.sessionId) {
		try {
			const infoResp = await fetch(browserShimUrl + '/v1/session/' + data.sessionId)
			if (infoResp.ok) {
				const info = await infoResp.json()
				if (info.wsEndpoint) {
					sessionEndpoints.set(data.sessionId, info.wsEndpoint)
					log('Stored wsEndpoint for session:', data.sessionId)
				}
			}
		} catch (e) {
			DEBUG && console.error('[BrowserWorker] Failed to get session info:', e)
		}
	}
	
	return Response.json(data)
}

async function handleWebSocketUpgrade(request, url, browserShimUrl) {
	const sessionId = url.searchParams.get('browser_session')
	if (!sessionId) {
		return new Response('Missing browser_session parameter', { status: 400 })
	}
	
	log('WebSocket upgrade for session:', sessionId)
	
	// Convert browserShimUrl from http:// to ws:// for WebSocket connection
	// The browser shim server handles WebSocket upgrades at /v1/connectDevtools
	const shimWsUrl = browserShimUrl.replace('http://', 'ws://') + '/v1/connectDevtools?browser_session=' + sessionId
	
	log('Connecting to shim WebSocket:', shimWsUrl)
	
	try {
		// workerd supports WebSocket connections via fetch() to ws:// URLs when using
		// the "Upgrade: websocket" header. However, the shim runs on HTTP, so we need
		// to connect via HTTP upgrade, not ws:// URL.
		//
		// Use fetch() with Upgrade header to the HTTP endpoint
		const shimUrl = browserShimUrl + '/v1/connectDevtools?browser_session=' + sessionId
		log('Upgrading via HTTP to:', shimUrl)
		
		const shimResp = await fetch(shimUrl, {
			headers: {
				'Upgrade': 'websocket',
				'Connection': 'Upgrade',
				'Sec-WebSocket-Key': btoa(crypto.randomUUID()),
				'Sec-WebSocket-Version': '13'
			}
		})
		
		const shimWs = shimResp.webSocket
		if (!shimWs) {
			DEBUG && console.error('[BrowserWorker] Shim did not return WebSocket, status:', shimResp.status)
			const body = await shimResp.text()
			DEBUG && console.error('[BrowserWorker] Response body:', body)
			return new Response('Browser shim WebSocket upgrade failed: ' + body, { status: 500 })
		}
		
		shimWs.accept()
		log('Connected to browser shim WebSocket')
		
		// Create WebSocket pair for the DO client
		const { 0: client, 1: server } = new WebSocketPair()
		server.accept()
		
		// Proxy messages between client (puppeteer in DO) and shim (which proxies to Chrome)
		server.addEventListener('message', (event) => {
			if (shimWs.readyState === WebSocket.READY_STATE_OPEN) {
				shimWs.send(event.data)
			}
		})
		
		server.addEventListener('close', (event) => {
			shimWs.close(event.code || 1000, event.reason || '')
		})
		
		shimWs.addEventListener('message', (event) => {
			if (server.readyState === WebSocket.READY_STATE_OPEN) {
				server.send(event.data)
			}
		})
		
		shimWs.addEventListener('close', (event) => {
			server.close(event.code || 1000, event.reason || '')
		})
		
		// Return response with client WebSocket to the DO
		return new Response(null, {
			status: 101,
			webSocket: client
		})
		
	} catch (err) {
		DEBUG && console.error('[BrowserWorker] WebSocket error:', err)
		return new Response('WebSocket connection failed: ' + (err.message || 'Unknown error'), { status: 500 })
	}
}
`
}
