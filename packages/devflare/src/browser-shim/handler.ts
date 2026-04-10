// =============================================================================
// Browser Rendering Handler — Service binding handler for BROWSER
// =============================================================================
// This handler runs as a Miniflare service binding custom fetch handler.
// It proxies requests to the browser shim server, which:
// - Launches Chrome instances on demand
// - Manages browser sessions
// - Provides WebSocket proxy to Chrome DevTools
//
// Why this exists:
// - workerd's fetch() cannot make outgoing WebSocket connections to external servers
// - Using a browser worker inside Miniflare fails for WebSocket DevTools connections
// - Miniflare's custom fetch handler runs in Node.js with full networking
//
// WebSocket Architecture:
// - For WebSocket upgrade requests, we use Miniflare's WebSocketPair and coupleWebSocket
// - These APIs allow us to create a WebSocket pair, couple one end to a Node.js ws connection,
//   and return the other end in the Response for workerd to use
// =============================================================================

import type { Miniflare } from 'miniflare'
import type { ConsolaInstance } from 'consola'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BrowserNodeHandlerOptions {
	/** URL of the browser shim server (e.g., http://127.0.0.1:8788) */
	browserShimUrl: string
	/** Logger instance */
	logger?: ConsolaInstance
	/** Enable verbose logging */
	verbose?: boolean
}

// WebSocket types from Miniflare (will be imported dynamically)
type WebSocketPair = [WebSocket, WebSocket]
type CoupleWebSocket = (ws: import('ws').WebSocket, pair: WebSocket) => Promise<void>

// Cache for dynamically imported modules
let cachedWebSocketPair: (new () => { 0: WebSocket; 1: WebSocket }) | null = null
let cachedCoupleWebSocket: CoupleWebSocket | null = null
let cachedResponse: typeof Response | null = null

/**
 * Lazily import Miniflare's WebSocket utilities
 * These are the same utilities Miniflare uses for upgradingFetch
 */
async function getWebSocketUtils() {
	if (!cachedWebSocketPair || !cachedCoupleWebSocket || !cachedResponse) {
		// Import from miniflare package - it re-exports from @miniflare/web-sockets
		const miniflare = await import('miniflare')
		cachedWebSocketPair = (miniflare as any).WebSocketPair
		cachedCoupleWebSocket = (miniflare as any).coupleWebSocket
		cachedResponse = (miniflare as any).Response
	}
	return {
		WebSocketPair: cachedWebSocketPair!,
		coupleWebSocket: cachedCoupleWebSocket!,
		MfResponse: cachedResponse!
	}
}

// -----------------------------------------------------------------------------
// Handler Factory
// -----------------------------------------------------------------------------

/**
 * Create a service binding handler for browser rendering
 *
 * This handler is passed to Miniflare's serviceBindings option directly as a function.
 * It uses the fetch-style signature: (request: Request, miniflare: Miniflare) => Response
 *
 * @param options - Handler configuration
 * @returns Fetch-style handler function
 */
export function createBrowserNodeHandler(options: BrowserNodeHandlerOptions) {
	const { browserShimUrl, logger, verbose } = options

	return async function browserHandler(
		request: Request,
		_miniflare: Miniflare
	): Promise<Response> {
		const url = new URL(request.url)
		const targetUrl = browserShimUrl + url.pathname + url.search

		if (verbose) {
			logger?.debug(`[BrowserHandler] ${request.method} ${url.pathname}${url.search}`)
		}

		// Check if this is a WebSocket upgrade request
		const upgradeHeader = request.headers.get('upgrade')
		if (upgradeHeader?.toLowerCase() === 'websocket') {
			return await handleWebSocketUpgrade(url, browserShimUrl, logger, verbose)
		}

		// Handle HTTP requests by proxying to the browser shim
		return await handleHttpRequest(request, targetUrl, logger, verbose)
	}
}

// -----------------------------------------------------------------------------
// HTTP Request Handling
// -----------------------------------------------------------------------------

async function handleHttpRequest(
	request: Request,
	targetUrl: string,
	logger?: ConsolaInstance,
	verbose?: boolean
): Promise<Response> {
	if (verbose) {
		logger?.debug(`[BrowserHandler] Proxying HTTP to: ${targetUrl}`)
	}

	try {
		// Proxy request to browser shim
		const response = await fetch(targetUrl, {
			method: request.method,
			headers: {
				'Content-Type': request.headers.get('content-type') || 'application/json',
				'Accept': request.headers.get('accept') || '*/*'
			},
			body: request.body
		})

		// Return the response directly
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		})
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Proxy error'
		logger?.error(`[BrowserHandler] HTTP proxy error: ${msg}`)
		return new Response(JSON.stringify({ error: msg }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		})
	}
}

// -----------------------------------------------------------------------------
// WebSocket Upgrade Handling
// -----------------------------------------------------------------------------

/**
 * Handle WebSocket upgrade requests for DevTools protocol
 *
 * This function:
 * 1. Connects to the browser shim's WebSocket endpoint using Node.js ws library
 * 2. Creates a Miniflare WebSocketPair
 * 3. Couples the Node.js ws with one end of the pair (for relaying messages)
 * 4. Returns a 101 Response with the other end as `webSocket` property
 *
 * This allows workerd to communicate with Chrome DevTools through the relay.
 */
async function handleWebSocketUpgrade(
	url: URL,
	browserShimUrl: string,
	logger?: ConsolaInstance,
	verbose?: boolean
): Promise<Response> {
	// Get session ID from query params
	const sessionId = url.searchParams.get('browser_session')
	if (!sessionId) {
		return new Response('Missing browser_session parameter', { status: 400 })
	}

	if (verbose) {
		logger?.debug(`[BrowserHandler] WebSocket upgrade for session: ${sessionId}`)
	}

	try {
		// Import ws library and Miniflare WebSocket utilities
		const { WebSocket: WsWebSocket } = await import('ws')
		const { WebSocketPair, coupleWebSocket, MfResponse } = await getWebSocketUtils()

		// Build target WebSocket URL
		const targetWsUrl = browserShimUrl.replace('http://', 'ws://') + url.pathname + url.search

		if (verbose) {
			logger?.debug(`[BrowserHandler] Connecting to browser shim WebSocket: ${targetWsUrl}`)
		}

		// Connect to browser shim WebSocket
		const shimWs = new WsWebSocket(targetWsUrl)

		// Wait for connection to open
		await new Promise<void>((resolve, reject) => {
			shimWs.once('open', () => {
				if (verbose) {
					logger?.debug(`[BrowserHandler] WebSocket connection opened to shim`)
				}
				resolve()
			})
			shimWs.once('error', (err) => {
				logger?.error(`[BrowserHandler] WebSocket connection error: ${err.message}`)
				reject(err)
			})
			setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000)
		})

		// Create a WebSocketPair - this is Miniflare's implementation
		// that works in Node.js and can be returned to workerd
		// IMPORTANT: The order is [worker, client] - worker is returned in response,
		// client is coupled to the external WebSocket connection
		const pair = new WebSocketPair()
		const [worker, client] = Object.values(pair) as [WebSocket, WebSocket]

		if (verbose) {
			logger?.debug(`[BrowserHandler] WebSocketPair created, MfResponse type: ${MfResponse?.name || typeof MfResponse}`)
		}

		// Couple the Node.js ws (to browser shim) with the client end of the pair
		// This sets up bidirectional message relaying:
		// - Messages from shimWs → client → (through pair) → worker → workerd
		// - Messages from workerd → worker → (through pair) → client → shimWs
		await coupleWebSocket(shimWs, client)

		if (verbose) {
			logger?.debug(`[BrowserHandler] WebSocket coupled successfully, returning 101 response`)
		}

		// Return a 101 Switching Protocols response with the worker end of the pair
		// Use Miniflare's Response class which accepts webSocket in the init object
		logger?.info(`[BrowserHandler] Creating 101 response with MfResponse: ${MfResponse?.name}`)
		const response = new MfResponse(null, {
			status: 101,
			webSocket: worker
		} as any)
		logger?.info(`[BrowserHandler] 101 response created, status: ${response.status}`)
		return response as Response
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'WebSocket error'
		logger?.error(`[BrowserHandler] WebSocket upgrade error: ${msg}`)
		return new Response(`WebSocket upgrade failed: ${msg}`, { status: 500 })
	}
}
