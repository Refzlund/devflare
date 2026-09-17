// =============================================================================
// Browser Shim Sessions — one local Chrome per session, and when it dies
// =============================================================================
/**
 * The session registry behind devflare's local Browser Rendering shim: acquire
 * a Chrome, hand out its DevTools endpoint, track who is attached to it, and
 * close it again once nobody is.
 *
 * It lives apart from `./server` and knows nothing about Chrome or HTTP — it
 * takes a `launch()` and talks to a {@link SessionBrowser}. That is what makes
 * the lifecycle testable: the shim server cannot start without downloading a
 * real browser, so every rule below used to be reachable only by running the
 * dev server, and none of it was graded.
 *
 * → KEY: exactly two things reap a session — the **idle timer**, which exists
 *   only while nothing is attached, and Chrome's own **`disconnected`** event.
 *   The idle timer used to be armed unconditionally and re-check
 *   `session.connectionId` when it fired; on the live dev path nothing ever
 *   sets that field, so the check was always true and every session was killed
 *   60 seconds after acquire with a client mid-render. Arming is now the whole
 *   decision, so "attached" and "armed" cannot disagree.
 * → KEY: `keep_alive` is the idle budget measured from the moment a client
 *   DETACHES, matching Browser Rendering. {@link BrowserSessionRegistry.release}
 *   re-arms rather than closing, so `puppeteer.connect(env.BROWSER, sessionId)`
 *   can reuse a session the way it does in production.
 * → GOTCHA: the shim cannot see the client's socket. On the live dev path the
 *   binding worker connects straight to Chrome's own DevTools port, so attach
 *   and release are things the worker REPORTS. A worker that dies without
 *   reporting leaves a session attached until Chrome exits — bounded by
 *   {@link SessionRegistryOptions.maxConcurrentSessions} and by `closeAll()` at
 *   dev-server shutdown, and closed for good only by routing the websocket
 *   through the shim itself.
 */

import type { ConsolaInstance } from 'consola'
import type { AcquireOptions } from './routes'

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

/** Idle milliseconds a detached session is kept before its Chrome is closed. */
export const DEFAULT_KEEP_ALIVE_MS = 60000

/**
 * Concurrent sessions one shim will hold. Matches the figure `/v1/limits` has
 * always advertised — which was a literal the shim did not enforce, so an app
 * in a launch loop could spawn unbounded Chrome processes while being told the
 * ceiling was ten.
 */
export const DEFAULT_MAX_CONCURRENT_SESSIONS = 10

/** Closed sessions kept for `/v1/history`. */
const MAX_HISTORY_ENTRIES = 100

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * The part of a puppeteer `Browser` the registry uses.
 *
 * Deliberately narrow: a test supplies a stub, and the registry cannot start
 * reaching for page or target APIs without widening this on purpose.
 */
export interface SessionBrowser {
	/** Close Chrome and everything in it. */
	close(): Promise<void>
	/**
	 * Subscribe to Chrome going away — a crash, a kill, or the client's own
	 * `Browser.close`. The registry treats it as the session ending.
	 */
	on(event: 'disconnected', handler: () => void): unknown
}

/** A freshly launched browser and the DevTools endpoint a client connects to. */
export interface LaunchedBrowser {
	browser: SessionBrowser
	/** Chrome's own `ws://127.0.0.1:<port>/devtools/browser/<id>` URL. */
	wsEndpoint: string
}

export interface SessionRegistryOptions {
	/**
	 * Start one Chrome. Called once per acquire; whatever it rejects with
	 * reaches the caller of {@link BrowserSessionRegistry.acquire} unchanged.
	 */
	launch(): Promise<LaunchedBrowser>
	/** Idle budget for a detached session, in ms. `0` disables reaping. */
	keepAlive?: number
	/** Ceiling on live sessions; an acquire past it throws {@link SessionLimitError}. */
	maxConcurrentSessions?: number
	logger?: ConsolaInstance
	verbose?: boolean
}

/** A live session, in the shape `/v1/sessions` reports. */
export interface SessionSummary {
	sessionId: string
	startTime: number
	/** Present while a client is attached; the id it must release with. */
	connectionId?: string
	connectionStartTime?: number
}

/** A live session plus the endpoint only the binding worker needs. */
export interface SessionDetail extends SessionSummary {
	wsEndpoint: string
}

/** A closed session, in the shape `/v1/history` reports. */
export interface ClosedSessionSummary {
	sessionId: string
	startTime: number
	endTime: number
	/** Numeric close reason, mirroring Browser Rendering's own vocabulary. */
	closeReason: number
	closeReasonText: string
}

/** The `/v1/limits` payload, derived rather than asserted. */
export interface SessionLimits {
	activeSessions: { id: string }[]
	/** How many more acquires would succeed right now. */
	allowedBrowserAcquisitions: number
	maxConcurrentSessions: number
	timeUntilNextAllowedBrowserAcquisition: number
}

/**
 * Thrown by {@link BrowserSessionRegistry.acquire} when the shim is already
 * holding {@link SessionRegistryOptions.maxConcurrentSessions} browsers.
 */
export class SessionLimitError extends Error {
	/** The ceiling that refused the acquire. */
	readonly limit: number

	constructor(limit: number) {
		super(
			`Browser session limit reached: ${limit} concurrent sessions. Close one, or raise the shim's maxConcurrentSessions.`
		)
		this.name = 'SessionLimitError'
		this.limit = limit
	}
}

export interface BrowserSessionRegistry {
	/**
	 * @description Launch a browser and register it.
	 * @param options - what the client asked for; only `keep_alive` is honoured
	 * @returns the id the client connects with
	 * @throws {SessionLimitError} when the concurrency ceiling is reached
	 */
	acquire(options?: AcquireOptions): Promise<{ sessionId: string }>
	/**
	 * @description Record that a client is now connected: cancels the idle
	 * reaper for as long as it stays attached.
	 * @param sessionId - the session being connected to
	 * @returns the detail the caller needs, including the `connectionId` to
	 * release with, or `undefined` when no such session exists
	 */
	attach(sessionId: string): SessionDetail | undefined
	/**
	 * @description Record that a client has gone, restarting the `keep_alive`
	 * countdown so the session can still be reconnected to before it closes.
	 * @param sessionId - the session being released
	 * @param connectionId - the id {@link attach} returned; when given, a
	 * release naming a connection that has since been replaced is ignored, so a
	 * late close from an old client cannot detach the current one
	 * @returns whether this call detached a connection
	 */
	release(sessionId: string, connectionId?: string): boolean
	/**
	 * @description Close a session's browser and move it into history.
	 * Re-entrant and idempotent: closing Chrome fires `disconnected`, which
	 * lands back here.
	 * @param sessionId - the session to close
	 * @param closeReason - numeric reason recorded in history
	 * @param closeReasonText - human reason recorded in history
	 */
	close(sessionId: string, closeReason?: number, closeReasonText?: string): Promise<void>
	/** @description Close every live session, e.g. at dev-server shutdown. */
	closeAll(closeReason?: number, closeReasonText?: string): Promise<void>
	/** @description Read a session without attaching to it. */
	get(sessionId: string): SessionDetail | undefined
	/** @description Every live session, newest last. */
	list(): SessionSummary[]
	/** @description The most recently closed sessions, newest first. */
	history(limit?: number): ClosedSessionSummary[]
	/** @description The concurrency picture, derived from live state. */
	limits(): SessionLimits
	/** @description How many sessions are live. */
	readonly size: number
	/** @description How many closed sessions are retained, capped at 100. */
	readonly historySize: number
}

interface SessionRecord {
	sessionId: string
	browser: SessionBrowser
	wsEndpoint: string
	connectionId?: string
	connectionStartTime?: number
	startTime: number
	/** The idle budget this session was acquired with. */
	keepAliveMs: number
	/** Armed only while nothing is attached. */
	idleTimeout?: ReturnType<typeof setTimeout>
}

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

/**
 * @description Create the session registry the browser shim serves from.
 * @param options - the launcher and the lifetime policy; see
 * {@link SessionRegistryOptions}
 */
export function createSessionRegistry(options: SessionRegistryOptions): BrowserSessionRegistry {
	const {
		launch,
		keepAlive = DEFAULT_KEEP_ALIVE_MS,
		maxConcurrentSessions = DEFAULT_MAX_CONCURRENT_SESSIONS,
		logger,
		verbose = false
	} = options

	const sessions = new Map<string, SessionRecord>()
	const history: ClosedSessionSummary[] = []

	// Launches in flight hold a slot each. Without this the ceiling is checked
	// against a map that only grows once `launch()` has resolved, so N
	// simultaneous acquires all pass a check that only one of them should.
	let pendingLaunches = 0

	function clearIdleTimer(session: SessionRecord): void {
		if (session.idleTimeout) {
			clearTimeout(session.idleTimeout)
			session.idleTimeout = undefined
		}
	}

	/**
	 * Start the idle countdown for a session nobody is attached to.
	 *
	 * → the existence of this timer IS the "nobody is attached" claim. Nothing
	 *   re-checks it when it fires, deliberately: a second guard over the same
	 *   hazard is one nothing can grade, and re-checking is what hid the
	 *   original defect for as long as it did.
	 */
	function armIdleTimer(session: SessionRecord): void {
		clearIdleTimer(session)

		if (session.keepAliveMs <= 0) return

		session.idleTimeout = setTimeout(() => {
			session.idleTimeout = undefined
			void close(session.sessionId, 2, 'BrowserIdle')
		}, session.keepAliveMs)
	}

	async function acquire(acquireOptions?: AcquireOptions): Promise<{ sessionId: string }> {
		if (sessions.size + pendingLaunches >= maxConcurrentSessions) {
			throw new SessionLimitError(maxConcurrentSessions)
		}

		pendingLaunches += 1

		let launched: LaunchedBrowser
		try {
			launched = await launch()
		} finally {
			pendingLaunches -= 1
		}

		const sessionId = crypto.randomUUID()
		const session: SessionRecord = {
			sessionId,
			browser: launched.browser,
			wsEndpoint: launched.wsEndpoint,
			startTime: Date.now(),
			keepAliveMs: acquireOptions?.keep_alive ?? keepAlive
		}

		sessions.set(sessionId, session)

		// Chrome exiting is the one disconnect signal the shim gets for free —
		// `browser.close()` from the client reaches Chrome directly on the dev
		// path, and this is how the shim learns the session is spent.
		session.browser.on('disconnected', () => {
			void close(sessionId, 2, 'ChromeDisconnected')
		})

		// Acquired, not yet connected: the client has `keep_alive` to attach.
		armIdleTimer(session)

		if (verbose) {
			logger?.debug(`[BrowserShim] Acquired session ${sessionId}`)
		}

		return { sessionId }
	}

	function attach(sessionId: string): SessionDetail | undefined {
		const session = sessions.get(sessionId)
		if (!session) return undefined

		session.connectionId = crypto.randomUUID()
		session.connectionStartTime = Date.now()
		clearIdleTimer(session)

		if (verbose) {
			logger?.debug(`[BrowserShim] Session ${sessionId} attached (${session.connectionId})`)
		}

		return toDetail(session)
	}

	function release(sessionId: string, connectionId?: string): boolean {
		const session = sessions.get(sessionId)
		if (!session || !session.connectionId) return false
		if (connectionId && session.connectionId !== connectionId) return false

		session.connectionId = undefined
		session.connectionStartTime = undefined
		armIdleTimer(session)

		if (verbose) {
			logger?.debug(
				`[BrowserShim] Session ${sessionId} released; idle for ${session.keepAliveMs}ms`
			)
		}

		return true
	}

	async function close(
		sessionId: string,
		closeReason = 1,
		closeReasonText = 'NormalClosure'
	): Promise<void> {
		const session = sessions.get(sessionId)
		if (!session) return

		// Remove first. `browser.close()` below fires `disconnected`, which
		// re-enters this function; taking the session out of the map up front is
		// what makes the second pass a no-op instead of a second close and a
		// duplicate history entry.
		sessions.delete(sessionId)
		clearIdleTimer(session)

		try {
			await session.browser.close()
		} catch (error) {
			// REPORT rather than rethrow: the session is already out of the
			// registry, and throwing here would abort a closeAll() midway and
			// strand every session after this one. A Chrome that will not close
			// is a process the developer may have to reap by hand, so it must
			// not pass silently either.
			logger?.error(`[BrowserShim] Failed to close Chrome for session ${sessionId}:`, error)
		}

		history.unshift({
			sessionId,
			startTime: session.startTime,
			endTime: Date.now(),
			closeReason,
			closeReasonText
		})

		if (history.length > MAX_HISTORY_ENTRIES) {
			history.pop()
		}

		if (verbose) {
			logger?.debug(`[BrowserShim] Closed session ${sessionId}: ${closeReasonText}`)
		}
	}

	async function closeAll(closeReason = 3, closeReasonText = 'ServerShutdown'): Promise<void> {
		for (const sessionId of Array.from(sessions.keys())) {
			await close(sessionId, closeReason, closeReasonText)
		}
	}

	function toDetail(session: SessionRecord): SessionDetail {
		return {
			sessionId: session.sessionId,
			wsEndpoint: session.wsEndpoint,
			startTime: session.startTime,
			connectionId: session.connectionId,
			connectionStartTime: session.connectionStartTime
		}
	}

	return {
		acquire,
		attach,
		release,
		close,
		closeAll,
		get(sessionId) {
			const session = sessions.get(sessionId)
			return session ? toDetail(session) : undefined
		},
		list() {
			return Array.from(sessions.values()).map((session) => ({
				sessionId: session.sessionId,
				startTime: session.startTime,
				connectionId: session.connectionId,
				connectionStartTime: session.connectionStartTime
			}))
		},
		history(limit = 50) {
			return history.slice(0, limit)
		},
		limits() {
			return {
				activeSessions: Array.from(sessions.keys()).map((id) => ({ id })),
				allowedBrowserAcquisitions: Math.max(
					0,
					maxConcurrentSessions - sessions.size - pendingLaunches
				),
				maxConcurrentSessions,
				timeUntilNextAllowedBrowserAcquisition: 0
			}
		},
		get size() {
			return sessions.size
		},
		get historySize() {
			return history.length
		}
	}
}
