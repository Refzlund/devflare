// =============================================================================
// Browser Shim Routes — the URLs @cloudflare/puppeteer asks for
// =============================================================================
/**
 * The route table of devflare's local Browser Rendering shim, kept pure so the
 * shim server, the Miniflare service-binding handler and their tests all read
 * the same one.
 *
 * `@cloudflare/puppeteer` moved every endpoint in 1.1.0 without a major bump:
 *
 * | version | acquire                          | devtools websocket                    |
 * | ------- | -------------------------------- | ------------------------------------- |
 * | ≤ 1.0.7 | `GET /v1/acquire?…`              | `GET /v1/connectDevtools?browser_session=…` |
 * | ≥ 1.1.0 | `POST /v1/devtools/browser?…`    | `GET /v1/devtools/browser/<sessionId>`      |
 *
 * Both generations are served, so which client version an app pins stays the
 * app's decision. `/v1/sessions`, `/v1/history` and `/v1/limits` never moved.
 *
 * → the generated binding worker cannot import this module — it is a script
 *   string compiled inside workerd — so it interpolates the path constants
 *   below rather than re-typing them. Keep the names it references stable.
 */

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------

/** Acquire a session, as `@cloudflare/puppeteer` ≤ 1.0.7 spells it. */
export const LEGACY_ACQUIRE_PATH = '/v1/acquire'

/** Acquire a session, as `@cloudflare/puppeteer` ≥ 1.1.0 spells it. */
export const ACQUIRE_PATH = '/v1/devtools/browser'

/** DevTools websocket ≤ 1.0.7; the session id rides in a query parameter. */
export const LEGACY_DEVTOOLS_PATH = '/v1/connectDevtools'

/**
 * DevTools websocket ≥ 1.1.0. Same base path as {@link ACQUIRE_PATH} by
 * design: the client POSTs the collection to create a session, then GETs the
 * member to connect to it.
 */
export const DEVTOOLS_PATH_PREFIX = `${ACQUIRE_PATH}/`

/** Query parameter carrying the session id on {@link LEGACY_DEVTOOLS_PATH}. */
export const LEGACY_SESSION_PARAM = 'browser_session'

/**
 * Session lookup. Not part of the puppeteer contract — the binding worker
 * calls it to learn Chrome's `wsEndpoint` before proxying a websocket.
 */
export const SESSION_PATH_PREFIX = '/v1/session/'

/** Liveness probe, devflare's own. */
export const HEALTH_PATH = '/_devflare/browser/health'

// -----------------------------------------------------------------------------
// Matching
// -----------------------------------------------------------------------------

/** A request the shim serves, already narrowed to the work it implies. */
export type ShimRoute =
	| { kind: 'acquire' }
	| { kind: 'sessions' }
	| { kind: 'history' }
	| { kind: 'limits' }
	/** @param sessionId - the id as written in the path; may not exist */
	| { kind: 'session'; sessionId: string }
	| { kind: 'health' }
	/** A websocket path reached over plain HTTP — the client must upgrade. */
	| { kind: 'devtools' }
	| { kind: 'not-found' }

/**
 * @description Whether a path acquires a browser session, in either client
 * generation's spelling.
 * @param pathname - request path, without query string
 */
export function isAcquirePath(pathname: string): boolean {
	return pathname === LEGACY_ACQUIRE_PATH || pathname === ACQUIRE_PATH
}

/**
 * @description Whether a path is a DevTools websocket endpoint, in either
 * client generation's spelling. Says nothing about whether the request
 * actually carries a usable session id — see {@link readDevtoolsSessionId}.
 * @param pathname - request path, without query string
 */
export function isDevtoolsPath(pathname: string): boolean {
	return pathname === LEGACY_DEVTOOLS_PATH || pathname.startsWith(DEVTOOLS_PATH_PREFIX)
}

/**
 * @description Resolve the browser session a DevTools request wants, from
 * whichever place its client generation put it.
 * @param pathname - request path, without query string
 * @param searchParams - the request's query string
 * @returns the session id, or `null` when the path is not a DevTools endpoint
 * or names no session
 */
export function readDevtoolsSessionId(
	pathname: string,
	searchParams: URLSearchParams
): string | null {
	if (pathname === LEGACY_DEVTOOLS_PATH) {
		return searchParams.get(LEGACY_SESSION_PARAM) || null
	}

	if (!pathname.startsWith(DEVTOOLS_PATH_PREFIX)) {
		return null
	}

	// The id is one trailing segment. Anything deeper is a path we do not
	// serve, and must not be mistaken for an id containing a slash.
	const sessionId = pathname.slice(DEVTOOLS_PATH_PREFIX.length)
	return sessionId.length > 0 && !sessionId.includes('/') ? sessionId : null
}

/**
 * @description Classify an incoming shim request.
 *
 * Acquire answers to both GET and POST on both of its paths: 1.0.7 sent GET
 * and 1.1.0 sends POST, and being liberal here costs nothing behind the shim's
 * loopback-only origin check.
 *
 * @param pathname - request path, without query string
 * @param method - HTTP method, upper case
 */
export function matchShimRoute(pathname: string, method: string): ShimRoute {
	// Before acquire: `/v1/devtools/browser` acquires, `/v1/devtools/browser/x`
	// connects. Disjoint, but the reading order matters to a human.
	if (isDevtoolsPath(pathname)) {
		return { kind: 'devtools' }
	}

	if (isAcquirePath(pathname) && (method === 'GET' || method === 'POST')) {
		return { kind: 'acquire' }
	}

	if (method === 'GET') {
		if (pathname === '/v1/sessions') return { kind: 'sessions' }
		if (pathname === '/v1/history') return { kind: 'history' }
		if (pathname === '/v1/limits') return { kind: 'limits' }
		if (pathname.startsWith(SESSION_PATH_PREFIX)) {
			return { kind: 'session', sessionId: pathname.slice(SESSION_PATH_PREFIX.length) }
		}
	}

	if (pathname === HEALTH_PATH) {
		return { kind: 'health' }
	}

	return { kind: 'not-found' }
}

// -----------------------------------------------------------------------------
// Acquire options
// -----------------------------------------------------------------------------

/**
 * The subset of `@cloudflare/puppeteer`'s acquire options the local shim can
 * honour. `location`, `recording` and `lab` are accepted and ignored: the shim
 * is one Chrome on this machine, with no region to pick, no session recording
 * and no lab mode to enter.
 */
export interface AcquireOptions {
	/** Idle milliseconds before an unconnected session is closed. */
	keep_alive?: number
}

/**
 * @description Coerce an untrusted `keep_alive` into a usable idle timeout.
 * @param value - a query-string value, a JSON body value, or nothing
 * @returns the timeout in milliseconds, or `undefined` to leave the shim's
 * configured default in force
 */
export function normalizeKeepAlive(value: unknown): number | undefined {
	// A non-numeric keep_alive used to reach the timer as NaN, where `NaN > 0`
	// is false — so the session got no idle timeout at all and leaked a Chrome.
	const milliseconds = typeof value === 'string' ? Number.parseInt(value, 10) : value
	if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) {
		return undefined
	}

	return milliseconds
}

/**
 * @description Read the acquire options a client passed in the query string.
 * Both generations put them there; 1.1.0 onwards sends no request body at all.
 * @param searchParams - the acquire request's query string
 */
export function readAcquireOptions(searchParams: URLSearchParams): AcquireOptions {
	const keepAlive = normalizeKeepAlive(searchParams.get('keep_alive'))
	return keepAlive === undefined ? {} : { keep_alive: keepAlive }
}
