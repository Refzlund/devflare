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
// - POST /v1/session/X/release → The attached client has gone (devflare's own)
//
// The path table itself lives in ./routes, and the session lifecycle — acquire,
// attach, release, reap — in ./sessions.
//
// Auto-installs Chrome Headless Shell using @puppeteer/browsers
// Works with both Node.js and Bun runtimes
// =============================================================================

import { existsSync } from 'node:fs'
import {
	createServer,
	type Server as HttpServer,
	type IncomingMessage,
	type ServerResponse
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
import puppeteerCore from 'puppeteer-core'
import {
	type AcquireOptions,
	isDevtoolsPath,
	matchShimRoute,
	normalizeKeepAlive,
	readAcquireOptions,
	readConnectionId,
	readDevtoolsSessionId,
	shouldAttachSession
} from './routes'
import {
	type BrowserSessionRegistry,
	createSessionRegistry,
	DEFAULT_KEEP_ALIVE_MS,
	DEFAULT_MAX_CONCURRENT_SESSIONS,
	SessionLimitError
} from './sessions'

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
	/**
	 * Idle milliseconds a session with no client attached is kept before its
	 * Chrome is closed (default: 60000 = 1 minute). A client's own `keep_alive`
	 * acquire option overrides it per session; `0` disables idle reaping.
	 */
	keepAlive?: number
	/**
	 * Concurrent browser sessions this shim will hold (default: 10, the figure
	 * `/v1/limits` reports). An acquire past the ceiling answers 429 rather
	 * than launching an unbounded number of Chrome processes.
	 */
	maxConcurrentSessions?: number
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
// HTTP request handling
// -----------------------------------------------------------------------------
/*
	Kept out of createBrowserShim() on purpose. start() downloads Chrome before
	it will listen, so anything inside that closure can only be reached by a
	real dev server — which is how the shim came to serve a `/v1/limits` nobody
	enforced and, until the session registry landed beside it, an idle reaper
	that closed live sessions.

	→ the handler takes a registry rather than owning one, so a test can drive
	  every route against stub browsers.
*/

/** What the request handler needs from the shim that owns it. */
export interface ShimRequestContext {
	/** The session lifecycle the routes read and write. */
	registry: BrowserSessionRegistry
	logger?: ConsolaInstance
	/** Origin the shim listens on; resolves the relative URLs node reports. */
	baseUrl: string
	/** Chrome's path for the health route — null until `start()` has resolved it. */
	getExecutablePath?: () => string | null
}

const MAX_REQUEST_BODY_BYTES = 1024 * 1024

/**
 * @description Read a request's `Origin`, tolerating node's array form.
 * @param req - the incoming request
 * @returns the origin, or `null` for origin-less tool traffic
 */
export function getRequestOrigin(req: IncomingMessage): string | null {
	const origin = req.headers.origin
	if (typeof origin === 'string') {
		return origin
	}

	if (Array.isArray(origin) && origin[0]) {
		return origin[0]
	}

	return null
}

/**
 * @description Whether an origin is one of this machine's own loopback names —
 * the only browser origins the shim serves.
 * @param origin - an `Origin` header value
 */
export function isLoopbackOrigin(origin: string): boolean {
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

/**
 * Apply the shim's CORS posture, answering 403 itself when the origin is not
 * loopback. Returns whether the caller should carry on serving the request.
 */
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
 * @description Build the shim's HTTP handler over a session registry.
 * @param context - the registry, logger and listening origin; see
 * {@link ShimRequestContext}
 * @returns a node request handler; it rejects rather than answering 500 itself,
 * so the caller decides what an unhandled fault looks like on the wire
 */
export function createShimRequestHandler(
	context: ShimRequestContext
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
	const { registry, logger, baseUrl, getExecutablePath } = context

	return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url || '/', baseUrl)
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
					const result = await registry.acquire(await readAcquire(req, url, method))
					sendJson(res, 200, result)
				} catch (error) {
					// A refused acquire is the shim at capacity, not a fault: 429
					// is what Browser Rendering answers, and what a client can
					// tell apart from "Chrome would not start".
					if (error instanceof SessionLimitError) {
						logger?.warn(`[BrowserShim] ${error.message}`)
						sendJson(res, 429, { error: error.message, maxConcurrentSessions: error.limit })
						return
					}

					const msg = error instanceof Error ? error.message : 'Failed to acquire browser'
					logger?.error(`[BrowserShim] Acquire failed: ${msg}`)
					sendJson(res, 500, { error: msg })
				}
				return
			}

			// List active sessions. Named field, not a bare array: every
			// @cloudflare/puppeteer version reads `JSON.parse(text).sessions`,
			// so an array reaches the caller of sessions() as undefined.
			case 'sessions':
				sendJson(res, 200, { sessions: registry.list() })
				return

			// List recent sessions, likewise read off `.history`
			case 'history':
				sendJson(res, 200, { history: registry.history() })
				return

			case 'limits':
				sendJson(res, 200, registry.limits())
				return

			// Session info including wsEndpoint, used by the browser rendering
			// worker to connect to Chrome directly.
			//
			// → KEY: with `?attach=1` this is also the live path's only "a client
			//   is connecting now" signal — the binding worker dials Chrome's own
			//   DevTools port, so the shim never sees that socket open. Attaching
			//   cancels the idle reaper until the worker releases the session; a
			//   lookup without the flag stays a pure read.
			case 'session': {
				const session = shouldAttachSession(url.searchParams)
					? registry.attach(route.sessionId)
					: registry.get(route.sessionId)

				if (!session) {
					sendJson(res, 404, { error: 'Session not found' })
					return
				}

				sendJson(res, 200, session)
				return
			}

			// The other half of that signal: the client has gone, so keep_alive
			// starts counting and the session becomes reapable again.
			case 'release': {
				if (!registry.get(route.sessionId)) {
					sendJson(res, 404, { error: 'Session not found' })
					return
				}

				// Idempotent: a relay whose two ends both close reports twice,
				// and the second call finds nothing attached. `released` says
				// which one did the work.
				sendJson(res, 200, {
					released: registry.release(route.sessionId, readConnectionId(url.searchParams))
				})
				return
			}

			case 'health':
				sendJson(res, 200, {
					ok: true,
					activeSessions: registry.size,
					historySize: registry.historySize,
					executablePath: getExecutablePath?.() ?? null
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
			if (totalBytes > MAX_REQUEST_BODY_BYTES) {
				req.destroy()
				reject(new Error(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`))
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

// -----------------------------------------------------------------------------
// Browser Shim Server Implementation (Node.js compatible)
// -----------------------------------------------------------------------------

export function createBrowserShim(options: BrowserShimOptions = {}): BrowserShim {
	const {
		port = 8788,
		host = '127.0.0.1',
		logger,
		verbose = false,
		keepAlive = DEFAULT_KEEP_ALIVE_MS,
		maxConcurrentSessions = DEFAULT_MAX_CONCURRENT_SESSIONS,
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

	// The lifecycle lives in ./sessions, which knows nothing about Chrome or
	// HTTP — this shim cannot start without downloading a browser, so anything
	// kept in here is reachable only by running a dev server, and the idle
	// reaper spent months killing live sessions because of exactly that.
	const registry = createSessionRegistry({
		launch: launchChrome,
		keepAlive,
		maxConcurrentSessions,
		logger,
		verbose
	})

	// Dynamic import of ws package (may not be installed)
	let WebSocketServerClass: any = null
	let WebSocketClass: any = null

	const handleRequest = createShimRequestHandler({
		registry,
		logger,
		baseUrl: `http://${host}:${port}`,
		getExecutablePath: () => executablePath
	})

	/**
	 * Start one headless Chrome with remote debugging enabled.
	 *
	 * The registry's sole route to a browser; everything about what happens to
	 * that browser afterwards lives in ./sessions.
	 */
	async function launchChrome() {
		if (!executablePath) {
			throw new Error('Chrome not initialized')
		}

		const browser = await puppeteerCore.launch({
			executablePath,
			headless: true,
			// Increase protocol timeout for complex pages
			protocolTimeout: 120000,
			args: chromeLaunchArgs
		})

		return { browser, wsEndpoint: browser.wsEndpoint() }
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

				// Attaching here is what the live dev path cannot do: this handler
				// owns the client's socket, so it sees both edges itself.
				const session = registry.attach(sessionId)
				if (!session) {
					socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
					socket.destroy()
					return
				}

				const connectionId = session.connectionId

				wss.handleUpgrade(request, socket, head, (ws: any) => {
					if (verbose) {
						logger?.debug(`[BrowserShim] WebSocket connected for session ${sessionId}`)
					}

					// Connect to Chrome's DevTools WebSocket
					const chromeWs = new WebSocketClass(session.wsEndpoint)
					let chromeConnected = false

					// Which end went first. Tearing the relay down closes this
					// socket too, and without knowing who started it the close
					// below reads its own teardown as "Chrome disconnected" and
					// closes a session the client was entitled to reconnect to.
					let clientGone = false

					// Set a connection timeout
					const connectTimeout = setTimeout(() => {
						if (!chromeConnected) {
							logger?.error('[BrowserShim] Chrome connection timeout')
							try {
								ws.close(1011, 'Chrome connection timeout')
								chromeWs.close()
							} catch (error) {
								logger?.error('[BrowserShim] Error closing sockets after Chrome timeout:', error)
							}
							registry.close(sessionId, 5, 'ChromeConnectionTimeout').catch((err) => {
								logger?.error('[BrowserShim] Error closing session after Chrome timeout:', err)
							})
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
						} catch (error) {
							logger?.error('[BrowserShim] Error closing client socket after Chrome closed:', error)
						}

						// Nothing but this relay's own teardown closes this socket
						// once the client has gone, and that is a release, not a
						// Chrome that died. Otherwise: a crash, a kill or a real
						// close, and the session is spent.
						if (clientGone) return

						registry.close(sessionId, 2, 'ChromeDisconnected').catch((err) => {
							logger?.error('[BrowserShim] Error closing session after Chrome disconnect:', err)
						})
					})

					chromeWs.on('error', (error: Error) => {
						logger?.error('[BrowserShim] Chrome WS error:', error.message)
						try {
							ws.close(1011, 'Chrome WebSocket error')
						} catch (error2) {
							logger?.error('[BrowserShim] Error closing client socket after Chrome error:', error2)
						}

						// Chrome error - clean up the session
						registry.close(sessionId, 4, 'ChromeError').catch((err) => {
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

						clientGone = true

						// Ensure valid close code (1000-4999)
						const validCode = typeof code === 'number' && code >= 1000 && code <= 4999 ? code : 1000
						try {
							chromeWs.close(validCode, reason?.toString?.() || '')
						} catch (error) {
							logger?.error('[BrowserShim] Error closing Chrome socket after disconnect:', error)
						}

						// Release rather than close: `keep_alive` is the budget a
						// detached session gets, and until it runs out the client
						// can reconnect to this same session by id — the reuse
						// pattern /v1/sessions exists for. The connection id keeps
						// a late close from a superseded client from detaching a
						// newer one.
						registry.release(sessionId, connectionId)
					})

					ws.on('error', (error: Error) => {
						logger?.error('[BrowserShim] Client WS error:', error.message)
						try {
							chromeWs.close()
						} catch (closeError) {
							logger?.error(
								'[BrowserShim] Error closing Chrome socket after client error:',
								closeError
							)
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
		// Close all browser sessions — the backstop for any session still
		// attached because its client went away without saying so.
		await registry.closeAll(3, 'ServerShutdown')

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
