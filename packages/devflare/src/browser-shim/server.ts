// =============================================================================
// Browser Shim Server — HTTP/WebSocket server for local Browser Rendering
// =============================================================================
/**
 * Devflare's **local browser-rendering shim**.
 *
 * Accepts only loopback browser origins (e.g. `http://127.0.0.1:*`,
 * `http://localhost:*`) plus origin-less tool traffic (Puppeteer, curl, and
 * other non-browser clients that do not send an `Origin` header). Cross-origin
 * browser traffic is rejected at the request boundary.
 *
 * This is NOT a user-facing app route — it is devflare's protected helper
 * endpoint used by the local Browser Rendering binding to satisfy the
 * `@cloudflare/puppeteer` contract during local dev. The loopback-only posture
 * applies to this shim only and does not apply to the user's normal worker
 * routes.
 */
// Provides endpoints that @cloudflare/puppeteer expects, in both the spellings
// it has used — 1.1.0 moved acquire and DevTools without a major bump, so a
// shim that serves only one generation locks apps to one client version:
// - GET|POST /v1/acquire → Launch browser, return sessionId (client ≤ 1.0.7)
// - GET|POST /v1/devtools/browser → Launch browser, return sessionId (≥ 1.1.0)
// - GET /v1/connectDevtools?browser_session=X → WebSocket to Chrome DevTools (≤ 1.0.7)
// - GET /v1/devtools/browser/X → WebSocket to Chrome DevTools (≥ 1.1.0)
// - GET /v1/sessions → List active sessions
// - GET /v1/limits → Return limits info
// - GET /v1/history → Return session history
// - GET /v1/session/X → Session info incl. wsEndpoint (devflare's own)
//
// The path table itself lives in ./routes.
//
// Auto-installs Chrome Headless Shell using @puppeteer/browsers
// Works with both Node.js and Bun runtimes
// =============================================================================

import { existsSync } from 'node:fs'
import {
	type Server as HttpServer,
	type IncomingMessage,
	type ServerResponse,
	createServer
} from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
	Browser as BrowserType,
	detectBrowserPlatform,
	install,
	resolveBuildId
} from '@puppeteer/browsers'
import type { ConsolaInstance } from 'consola'
import puppeteerCore, { type Browser } from 'puppeteer-core'
import {
	type AcquireOptions,
	isDevtoolsPath,
	matchShimRoute,
	normalizeKeepAlive,
	readAcquireOptions,
	readDevtoolsSessionId
} from './routes'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BrowserShimOptions {
	/** Port to run the shim server on (default: 8788) */
	port?: number
	/** Host to bind to (default: 127.0.0.1) */
	host?: string
	/** Logger instance */
	logger?: ConsolaInstance
	/** Enable verbose logging */
	verbose?: boolean
	/** Keep alive timeout in ms (default: 60000 = 1 minute) */
	keepAlive?: number
	/** Custom cache directory for Chrome (default: ~/.devflare/chrome) */
	cacheDir?: string
	/**
	 * Opt-in to launching Chrome with `--no-sandbox` / `--disable-setuid-sandbox`.
	 *
	 * Disabling the Chromium sandbox is a significant security regression: a
	 * compromised page can access the host with the privileges of the process
	 * running the browser. Only enable this in trusted CI containers or rootless
	 * environments where the sandbox cannot start. Defaults to `false`.
	 */
	allowNoSandbox?: boolean
}

export interface BrowserShim {
	/** Start the browser shim server */
	start(): Promise<void>
	/** Stop the server and close all browsers */
	stop(): Promise<void>
	/** Get the server URL (for creating Fetcher) */
	getUrl(): string
}

interface BrowserSession {
	sessionId: string
	browser: Browser
	wsEndpoint: string
	connectionId?: string
	connectionStartTime?: number
	startTime: number
	idleTimeout?: ReturnType<typeof setTimeout>
}

interface ClosedSession {
	sessionId: string
	startTime: number
	endTime: number
	closeReason: number
	closeReasonText: string
}

// Cached browser executable path
let cachedExecutablePath: string | null = null

// -----------------------------------------------------------------------------
// Chrome launch flags
// -----------------------------------------------------------------------------

/**
 * Default Chrome flags used when launching headless Chrome for local
 * browser-rendering emulation. Each flag is included for a deliberate reason;
 * edit cautiously.
 *
 * NOTE: `--no-sandbox` / `--disable-setuid-sandbox` are intentionally NOT part
 * of the defaults. Disabling the sandbox removes the primary boundary between
 * untrusted web content and the host and must be opted into explicitly via
 * `BrowserShimOptions.allowNoSandbox`.
 */
export const DEFAULT_CHROME_FLAGS: readonly string[] = [
	// Avoid /dev/shm exhaustion in small containers (common on CI).
	'--disable-dev-shm-usage',
	// Headless shell has no GPU; skip GL init to avoid startup errors.
	'--disable-gpu',
	'--disable-software-rasterizer',
	// Trim background/extension surface that complex test pages don't need.
	'--disable-extensions',
	'--disable-background-networking',
	'--disable-background-timer-throttling',
	'--disable-backgrounding-occluded-windows',
	'--disable-renderer-backgrounding',
	'--disable-features=TranslateUI',
	'--disable-ipc-flooding-protection',
	// Reduce resource usage during automated runs.
	'--disable-default-apps',
	'--mute-audio',
	// Prevent OOM on memory-heavy pages inside constrained runners.
	'--js-flags=--max-old-space-size=4096'
]

/**
 * Flags appended only when `allowNoSandbox` is explicitly enabled. Kept in a
 * separate constant so callers and tests can assert they are opt-in.
 */
export const NO_SANDBOX_FLAGS: readonly string[] = ['--no-sandbox', '--disable-setuid-sandbox']

/**
 * Resolve the Chrome argv for a shim launch. Exported for testability.
 */
export function resolveChromeFlags(options: { allowNoSandbox?: boolean } = {}): string[] {
	const flags = [...DEFAULT_CHROME_FLAGS]
	if (options.allowNoSandbox) {
		flags.unshift(...NO_SANDBOX_FLAGS)
	}
	return flags
}

// -----------------------------------------------------------------------------
// Download progress tracker
// -----------------------------------------------------------------------------

export interface DownloadProgress {
	bytesReceived: number
	totalBytes: number
}

/**
 * Create a download progress logger that emits at most one "start" line and
 * exactly one "complete" line per download. Avoids the previous heuristic
 * percent-spam which could log the same bucket multiple times.
 *
 * The returned callback matches `@puppeteer/browsers` `downloadProgressCallback`.
 */
export function createDownloadProgressLogger(
	logger?: ConsolaInstance,
	label = 'Chrome'
): {
	onProgress: (downloadedBytes: number, totalBytes: number) => void
	finalize: () => void
	readonly progress: DownloadProgress
	readonly started: boolean
	readonly completed: boolean
} {
	const state: { started: boolean; completed: boolean; progress: DownloadProgress } = {
		started: false,
		completed: false,
		progress: { bytesReceived: 0, totalBytes: 0 }
	}

	return {
		onProgress(downloadedBytes: number, totalBytes: number) {
			if (state.completed) return

			state.progress.bytesReceived = downloadedBytes
			state.progress.totalBytes = totalBytes

			if (!state.started) {
				state.started = true
				logger?.info(`[BrowserShim] Downloading ${label}...`)
			}

			if (totalBytes > 0 && downloadedBytes >= totalBytes) {
				state.completed = true
				logger?.info(`[BrowserShim] ${label} download complete`)
			}
		},
		/**
		 * Emit the single "complete" line if a download was started but the
		 * progress stream never reported final totals. No-op if the download
		 * never started (e.g. fully-cached build) or already completed.
		 */
		finalize() {
			if (!state.started || state.completed) return
			state.completed = true
			logger?.info(`[BrowserShim] ${label} download complete`)
		},
		get progress() {
			return state.progress
		},
		get started() {
			return state.started
		},
		get completed() {
			return state.completed
		}
	}
}

// -----------------------------------------------------------------------------
// Browser Installation
// -----------------------------------------------------------------------------

/**
 * Get or install Chrome Headless Shell
 * Uses a shared cache directory so Chrome is only installed once globally
 */
async function ensureChrome(cacheDir: string, logger?: ConsolaInstance): Promise<string> {
	// Return cached path if already resolved
	if (cachedExecutablePath && existsSync(cachedExecutablePath)) {
		return cachedExecutablePath
	}

	const platform = detectBrowserPlatform()
	if (!platform) {
		throw new Error('Could not detect browser platform')
	}

	// Resolve latest stable build ID for Chrome Headless Shell
	const buildId = await resolveBuildId(BrowserType.CHROMEHEADLESSSHELL, platform, 'stable')

	logger?.debug(`[BrowserShim] Resolved Chrome Headless Shell build: ${buildId}`)

	const progressLogger = createDownloadProgressLogger(logger, 'Chrome')

	// Install Chrome Headless Shell if not present
	const installedBrowser = await install({
		browser: BrowserType.CHROMEHEADLESSSHELL,
		buildId,
		cacheDir,
		downloadProgressCallback: (downloadedBytes, totalBytes) => {
			progressLogger.onProgress(downloadedBytes, totalBytes)
		}
	})

	// Fallback: if a download started but progress events never reported final
	// totals, emit the single "complete" line so logs are not dangling. No-op
	// when the build was already cached (nothing was downloaded).
	progressLogger.finalize()

	cachedExecutablePath = installedBrowser.executablePath
	logger?.success(`[BrowserShim] Chrome ready: ${installedBrowser.executablePath}`)

	return installedBrowser.executablePath
}

// -----------------------------------------------------------------------------
// Browser Shim Server Implementation (Node.js compatible)
// -----------------------------------------------------------------------------

export function createBrowserShim(options: BrowserShimOptions = {}): BrowserShim {
	const {
		port = 8788,
		host = '127.0.0.1',
		logger,
		verbose = false,
		keepAlive = 60000,
		cacheDir = join(homedir(), '.devflare', 'chrome'),
		allowNoSandbox = false
	} = options

	const chromeLaunchArgs = resolveChromeFlags({ allowNoSandbox })
	if (allowNoSandbox) {
		logger?.warn(
			'[BrowserShim] Launching Chrome with --no-sandbox (allowNoSandbox=true). ' +
				'Only use this in trusted CI/rootless environments.'
		)
	}

	let server: HttpServer | null = null
	let executablePath: string | null = null
	const sessions = new Map<string, BrowserSession>()
	const history: ClosedSession[] = []

	// Dynamic import of ws package (may not be installed)
	let WebSocketServerClass: any = null
	let WebSocketClass: any = null
	const maxRequestBodyBytes = 1024 * 1024

	function getRequestOrigin(req: IncomingMessage): string | null {
		const origin = req.headers.origin
		if (typeof origin === 'string') {
			return origin
		}

		if (Array.isArray(origin) && origin[0]) {
			return origin[0]
		}

		return null
	}

	function isLoopbackOrigin(origin: string): boolean {
		try {
			const url = new URL(origin)
			return (
				url.hostname === '127.0.0.1' ||
				url.hostname === 'localhost' ||
				url.hostname === '::1' ||
				url.hostname === '[::1]'
			)
		} catch {
			return false
		}
	}

	function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): boolean {
		const origin = getRequestOrigin(req)
		if (!origin) {
			return true
		}

		if (!isLoopbackOrigin(origin)) {
			res.writeHead(403, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ error: 'Forbidden origin' }))
			return false
		}

		res.setHeader('Access-Control-Allow-Origin', origin)
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
		res.setHeader('Vary', 'Origin')
		return true
	}

	/**
	 * Launch a new browser and create a session
	 */
	async function acquireSession(acquireOptions?: AcquireOptions): Promise<{ sessionId: string }> {
		if (!executablePath) {
			throw new Error('Chrome not initialized')
		}

		// Launch browser with remote debugging enabled
		// Additional flags for stability with complex pages
		const browser = await puppeteerCore.launch({
			executablePath,
			headless: true,
			// Increase protocol timeout for complex pages
			protocolTimeout: 120000,
			args: chromeLaunchArgs
		})

		const wsEndpoint = browser.wsEndpoint()
		const sessionId = crypto.randomUUID()

		const session: BrowserSession = {
			sessionId,
			browser,
			wsEndpoint,
			startTime: Date.now()
		}

		sessions.set(sessionId, session)

		// Set up idle timeout
		const timeout = acquireOptions?.keep_alive ?? keepAlive
		if (timeout > 0) {
			session.idleTimeout = setTimeout(async () => {
				const s = sessions.get(sessionId)
				if (s && !s.connectionId) {
					// No active connection, close browser
					await closeSession(sessionId, 2, 'BrowserIdle')
				}
			}, timeout)
		}

		if (verbose) {
			logger?.debug(`[BrowserShim] Acquired session ${sessionId}`)
		}

		return { sessionId }
	}

	/**
	 * Close a browser session
	 */
	async function closeSession(
		sessionId: string,
		closeReason = 1,
		closeReasonText = 'NormalClosure'
	): Promise<void> {
		const session = sessions.get(sessionId)
		if (!session) return

		// Clear idle timeout
		if (session.idleTimeout) {
			clearTimeout(session.idleTimeout)
		}

		try {
			await session.browser.close()
		} catch {
			// Ignore errors closing browser
		}

		sessions.delete(sessionId)

		// Add to history
		history.unshift({
			sessionId,
			startTime: session.startTime,
			endTime: Date.now(),
			closeReason,
			closeReasonText
		})

		// Keep only last 100 entries
		if (history.length > 100) {
			history.pop()
		}

		if (verbose) {
			logger?.debug(`[BrowserShim] Closed session ${sessionId}: ${closeReasonText}`)
		}
	}

	/**
	 * Handle HTTP requests
	 */
	async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url || '/', `http://${host}:${port}`)
		const method = req.method || 'GET'

		// Always log incoming requests for debugging
		logger?.debug(`[BrowserShim] ${method} ${url.pathname}${url.search ? url.search : ''}`)

		if (!applyCorsHeaders(req, res)) {
			return
		}

		if (method === 'OPTIONS') {
			res.writeHead(204)
			res.end()
			return
		}

		const route = matchShimRoute(url.pathname, method)

		switch (route.kind) {
			// Launch a new browser
			case 'acquire': {
				try {
					const result = await acquireSession(await readAcquire(req, url, method))
					sendJson(res, 200, result)
				} catch (error) {
					const msg = error instanceof Error ? error.message : 'Failed to acquire browser'
					logger?.error(`[BrowserShim] Acquire failed: ${msg}`)
					sendJson(res, 500, { error: msg })
				}
				return
			}

			// List active sessions. Named field, not a bare array: every
			// @cloudflare/puppeteer version reads `JSON.parse(text).sessions`,
			// so an array reaches the caller of sessions() as undefined.
			case 'sessions': {
				const activeSessions = Array.from(sessions.values()).map((s) => ({
					sessionId: s.sessionId,
					startTime: s.startTime,
					connectionId: s.connectionId,
					connectionStartTime: s.connectionStartTime
				}))
				sendJson(res, 200, { sessions: activeSessions })
				return
			}

			// List recent sessions, likewise read off `.history`
			case 'history':
				sendJson(res, 200, { history: history.slice(0, 50) })
				return

			case 'limits':
				sendJson(res, 200, {
					activeSessions: Array.from(sessions.keys()).map((id) => ({ id })),
					allowedBrowserAcquisitions: 10,
					maxConcurrentSessions: 10,
					timeUntilNextAllowedBrowserAcquisition: 0
				})
				return

			// Session info including wsEndpoint, used by the browser rendering
			// worker to connect to Chrome directly
			case 'session': {
				const session = sessions.get(route.sessionId)
				if (!session) {
					sendJson(res, 404, { error: 'Session not found' })
					return
				}
				sendJson(res, 200, {
					sessionId: session.sessionId,
					wsEndpoint: session.wsEndpoint,
					startTime: session.startTime,
					connectionId: session.connectionId,
					connectionStartTime: session.connectionStartTime
				})
				return
			}

			case 'health':
				sendJson(res, 200, {
					ok: true,
					activeSessions: sessions.size,
					historySize: history.length,
					executablePath
				})
				return

			// Reached over plain HTTP; the upgrade handler takes it otherwise
			case 'devtools':
				res.writeHead(426, { 'Content-Type': 'text/plain' })
				res.end('WebSocket upgrade required')
				return

			case 'not-found':
				res.writeHead(404, { 'Content-Type': 'text/plain' })
				res.end('Not found')
				return
		}
	}

	/**
	 * Read the options an acquire request asked for.
	 *
	 * Both client generations pass them in the query string. A JSON body is
	 * optional and wins where it overlaps — 1.1.0 onwards sends none, but a
	 * `POST /v1/acquire` from an older integration could, and used to be the
	 * only place this looked.
	 */
	async function readAcquire(
		req: IncomingMessage,
		url: URL,
		method: string
	): Promise<AcquireOptions> {
		const options = readAcquireOptions(url.searchParams)

		const body = method === 'POST' ? (await readBody(req)).trim() : ''
		if (body) {
			const keepAlive = normalizeKeepAlive((JSON.parse(body) as AcquireOptions).keep_alive)
			if (keepAlive !== undefined) {
				options.keep_alive = keepAlive
			}
		}

		return options
	}

	/**
	 * Read request body as string
	 */
	function readBody(req: IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = []
			let totalBytes = 0

			req.on('data', (chunk: Buffer) => {
				totalBytes += chunk.length
				if (totalBytes > maxRequestBodyBytes) {
					req.destroy()
					reject(new Error(`Request body exceeds ${maxRequestBodyBytes} bytes`))
					return
				}

				chunks.push(chunk)
			})
			req.on('end', () => resolve(Buffer.concat(chunks).toString()))
			req.on('error', reject)
		})
	}

	/**
	 * Send JSON response
	 */
	function sendJson(res: ServerResponse, status: number, data: unknown): void {
		const body = JSON.stringify(data)
		res.writeHead(status, {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(body)
		})
		res.end(body)
	}

	/**
	 * Start the browser shim server
	 */
	async function start(): Promise<void> {
		// Ensure Chrome is installed
		logger?.info('[BrowserShim] Ensuring Chrome Headless Shell is available...')
		executablePath = await ensureChrome(cacheDir, logger)

		// Try to dynamically import ws package
		try {
			const wsModule = (await import('ws')) as unknown as {
				WebSocketServer?: typeof import('ws').WebSocketServer
				WebSocket?: typeof import('ws').WebSocket
				default?: {
					WebSocketServer?: typeof import('ws').WebSocketServer
					WebSocket?: typeof import('ws').WebSocket
				}
			}
			WebSocketServerClass = wsModule.WebSocketServer || wsModule.default?.WebSocketServer
			WebSocketClass = (wsModule.WebSocket || wsModule.default?.WebSocket || wsModule.default) as
				| typeof import('ws').WebSocket
				| undefined
		} catch {
			logger?.warn('[BrowserShim] ws package not found, WebSocket proxy disabled')
			logger?.warn('[BrowserShim] Install with: npm install ws')
		}

		// Create HTTP server
		server = createServer((req, res) => {
			handleRequest(req, res).catch((error) => {
				logger?.error('[BrowserShim] Request error:', error)
				res.writeHead(500)
				res.end('Internal server error')
			})
		})

		// Set up WebSocket server for DevTools proxy
		if (WebSocketServerClass) {
			const wss = new WebSocketServerClass({ noServer: true })

			server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
				const origin = getRequestOrigin(request)
				if (origin && !isLoopbackOrigin(origin)) {
					socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
					socket.destroy()
					return
				}

				const url = new URL(request.url || '/', `http://${host}:${port}`)

				if (!isDevtoolsPath(url.pathname)) {
					socket.destroy()
					return
				}

				const sessionId = readDevtoolsSessionId(url.pathname, url.searchParams)
				if (!sessionId) {
					socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
					socket.destroy()
					return
				}

				const session = sessions.get(sessionId)
				if (!session) {
					socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
					socket.destroy()
					return
				}

				// Mark session as connected
				const connectionId = crypto.randomUUID()
				session.connectionId = connectionId
				session.connectionStartTime = Date.now()

				// Clear idle timeout since we have an active connection
				if (session.idleTimeout) {
					clearTimeout(session.idleTimeout)
					session.idleTimeout = undefined
				}

				wss.handleUpgrade(request, socket, head, (ws: any) => {
					if (verbose) {
						logger?.debug(`[BrowserShim] WebSocket connected for session ${sessionId}`)
					}

					// Connect to Chrome's DevTools WebSocket
					const chromeWs = new WebSocketClass(session.wsEndpoint)
					let chromeConnected = false

					// Set a connection timeout
					const connectTimeout = setTimeout(() => {
						if (!chromeConnected) {
							logger?.error('[BrowserShim] Chrome connection timeout')
							try {
								ws.close(1011, 'Chrome connection timeout')
								chromeWs.close()
							} catch {
								// Ignore errors
							}
							closeSession(sessionId, 5, 'ChromeConnectionTimeout').catch(() => {})
						}
					}, 10000) // 10 second timeout

					chromeWs.on('open', () => {
						chromeConnected = true
						clearTimeout(connectTimeout)
						if (verbose) {
							logger?.debug('[BrowserShim] Connected to Chrome DevTools')
						}
					})

					chromeWs.on('message', (data: Buffer | string) => {
						if (ws.readyState === 1) {
							// OPEN
							ws.send(data)
						}
					})

					chromeWs.on('close', (code: number, reason: Buffer) => {
						if (verbose) {
							logger?.debug(`[BrowserShim] Chrome WS closed: ${code}`)
						}
						// Ensure valid close code (1000-4999)
						const validCode = typeof code === 'number' && code >= 1000 && code <= 4999 ? code : 1000
						try {
							ws.close(validCode, reason?.toString?.() || '')
						} catch {
							// Ignore errors when closing already closed socket
						}

						// Chrome connection closed - clean up the session entirely
						// This handles crashes, timeouts, and normal closures
						closeSession(sessionId, 2, 'ChromeDisconnected').catch((err) => {
							logger?.error('[BrowserShim] Error closing session after Chrome disconnect:', err)
						})
					})

					chromeWs.on('error', (error: Error) => {
						logger?.error('[BrowserShim] Chrome WS error:', error.message)
						try {
							ws.close(1011, 'Chrome WebSocket error')
						} catch {
							// Ignore errors when closing already closed socket
						}

						// Chrome error - clean up the session
						closeSession(sessionId, 4, 'ChromeError').catch((err) => {
							logger?.error('[BrowserShim] Error closing session after Chrome error:', err)
						})
					})

					ws.on('message', (data: Buffer | string) => {
						if (chromeWs.readyState === 1) {
							// OPEN
							chromeWs.send(data)
						}
					})

					ws.on('close', (code: number, reason: Buffer) => {
						if (verbose) {
							logger?.debug(`[BrowserShim] Client WS closed for session ${sessionId}`)
						}
						// Ensure valid close code (1000-4999)
						const validCode = typeof code === 'number' && code >= 1000 && code <= 4999 ? code : 1000
						try {
							chromeWs.close(validCode, reason?.toString?.() || '')
						} catch {
							// Ignore errors when closing already closed socket
						}

						// Clear connection from session and close browser immediately
						// This prevents zombie browsers from accumulating
						const s = sessions.get(sessionId)
						if (s && s.connectionId === connectionId) {
							s.connectionId = undefined
							s.connectionStartTime = undefined

							// Close the browser session immediately when client disconnects
							// Don't wait for idle timeout - clean up now
							closeSession(sessionId, 1, 'ClientDisconnected').catch((err) => {
								logger?.error('[BrowserShim] Error closing session after disconnect:', err)
							})
						}
					})

					ws.on('error', (error: Error) => {
						logger?.error('[BrowserShim] Client WS error:', error.message)
						try {
							chromeWs.close()
						} catch {
							// Ignore errors when closing already closed socket
						}
					})
				})
			})
		}

		// Start listening
		await new Promise<void>((resolve, reject) => {
			server!.on('error', reject)
			server!.listen(port, host, () => {
				resolve()
			})
		})

		logger?.success(`Browser shim server ready on http://${host}:${port}`)
	}

	/**
	 * Stop the server and close all browsers
	 */
	async function stop(): Promise<void> {
		// Close all browser sessions
		for (const sessionId of Array.from(sessions.keys())) {
			await closeSession(sessionId, 3, 'ServerShutdown')
		}

		// Stop server
		if (server) {
			await new Promise<void>((resolve) => {
				server!.close(() => resolve())
			})
			server = null
		}

		logger?.info('Browser shim server stopped')
	}

	/**
	 * Get the server URL
	 */
	function getUrl(): string {
		return `http://${host}:${port}`
	}

	return {
		start,
		stop,
		getUrl
	}
}
