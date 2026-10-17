// =============================================================================
// DevTools Relay — the shim's own relay between a client and Chrome
// =============================================================================
/*
	The shim answers DevTools upgrades itself (/v1/devtools/browser/<id> and
	/v1/connectDevtools) and relays each to Chrome's own DevTools socket. The
	live `devflare dev` path does NOT come through here: its BROWSER binding
	relays inside workerd (./binding-worker). This serves a client that dials
	the shim directly. It lives apart from createBrowserShim() so a test can
	drive it with socket stand-ins — that closure only starts after a Chrome
	download.

	→ KEY: a Chrome that goes away is the REGISTRY's to notice, through
	  puppeteer's `disconnected`, which reaps it (./chrome-process). This relay
	  used to end the session itself when Chrome's socket closed or errored: a
	  CDP close aimed at a Chrome already exiting, whose fallback on Windows
	  printed taskkill's errors into the dev log. Each edge of the relay now only
	  RELEASES, so a session ends when its Chrome does, or when keep_alive runs
	  out with nobody attached.
	→ The one ending this relay still decides is a Chrome that never answers
	  the DevTools upgrade. That Chrome is running, and a CDP close is right.
*/

import type { ConsolaInstance } from 'consola'
import { relayedClose } from './close-codes'
import type { BrowserSessionRegistry } from './sessions'

/** How long Chrome gets to answer the DevTools upgrade before the relay gives up. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000

/**
 * The part of a `ws` WebSocket the relay drives; both ends are one.
 *
 * → `close()` follows the `ws` library's rule: a code RFC 6455's registry
 *   assigns for sending, or none, and a reason of at most 123 bytes — anything else
 *   throws. relayedClose() is what keeps a relayed close inside it.
 */
export interface RelaySocket {
	/** 1 is OPEN, as in the WebSocket API. */
	readonly readyState: number
	send(data: unknown): void
	close(code?: number, reason?: string): void
	on(event: 'open' | 'message' | 'close' | 'error', listener: (...args: never[]) => void): unknown
}

/** Who the relay serves, and where it reports. */
export interface DevtoolsRelayOptions {
	/** The session the client attached to. */
	sessionId: string
	/** The connection `attach()` returned; the release names it, so a late close cannot detach a newer client. */
	connectionId?: string
	/** The registry the session lives in. */
	registry: Pick<BrowserSessionRegistry, 'release' | 'close'>
	logger?: ConsolaInstance
	verbose?: boolean
	/** Milliseconds Chrome gets to answer the upgrade; see {@link DEFAULT_CONNECT_TIMEOUT_MS}. */
	connectTimeoutMs?: number
}

/**
 * @description Relay CDP between a client that upgraded to the shim and
 * Chrome's DevTools socket, until either end closes — and then close the
 * other end, with a close that end may carry.
 * @param client - the client's socket, already upgraded
 * @param chrome - a socket dialling Chrome's DevTools endpoint, not yet open
 * @param options - the session, the registry and the logger; see {@link DevtoolsRelayOptions}
 */
export function relayDevtools(
	client: RelaySocket,
	chrome: RelaySocket,
	options: DevtoolsRelayOptions
): void {
	const {
		sessionId,
		connectionId,
		registry,
		logger,
		verbose = false,
		connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
	} = options

	const connectTimeout = setTimeout(() => {
		logger?.error('[BrowserShim] Chrome connection timeout')
		try {
			client.close(1011, 'Chrome connection timeout')
			chrome.close()
		} catch (error) {
			logger?.error('[BrowserShim] Error closing sockets after Chrome timeout:', error)
		}
		registry.close(sessionId, 5, 'ChromeConnectionTimeout').catch((error) => {
			logger?.error('[BrowserShim] Error closing session after Chrome timeout:', error)
		})
	}, connectTimeoutMs)

	// A client may speak the moment its own upgrade completes, as puppeteer does,
	// before this relay's socket to Chrome is open. Its messages wait here; they
	// used to be dropped, and a dropped CDP command is one its caller waits on
	// until protocolTimeout. The connect timeout bounds how long they wait.
	const pending: unknown[] = []

	chrome.on('open', () => {
		clearTimeout(connectTimeout)
		for (const message of pending.splice(0)) chrome.send(message)
		if (verbose) logger?.debug('[BrowserShim] Connected to Chrome DevTools')
	})

	chrome.on('message', (data: unknown, isBinary?: boolean) => {
		if (client.readyState === 1) client.send(asFrame(data, isBinary))
	})

	chrome.on('close', (code: number, reason: Buffer) => {
		// A socket that has closed has nothing left to time out; a Chrome that
		// refused it is either gone (`disconnected` ends the session) or running
		// (the client's release below lets keep_alive end it).
		clearTimeout(connectTimeout)
		if (verbose) logger?.debug(`[BrowserShim] Chrome WS closed: ${code}`)

		// The code a closed socket reports is not always one a socket may send:
		// a 1000–4999 range check let Chrome's 1006 through, `ws` threw on it,
		// and the client was left open. See ./close-codes.
		const close = relayedClose(code, reason?.toString?.())
		try {
			client.close(close.code, close.reason)
		} catch (error) {
			logger?.error('[BrowserShim] Error closing client socket after Chrome closed:', error)
		}
	})

	chrome.on('error', (error: Error) => {
		logger?.error('[BrowserShim] Chrome WS error:', error.message)
		try {
			client.close(1011, 'Chrome WebSocket error')
		} catch (closeError) {
			logger?.error('[BrowserShim] Error closing client socket after Chrome error:', closeError)
		}
	})

	client.on('message', (data: unknown, isBinary?: boolean) => {
		const message = asFrame(data, isBinary)
		if (chrome.readyState === 1) chrome.send(message)
		else if (chrome.readyState === 0) pending.push(message)
		// CLOSING or CLOSED: Chrome's close listener has already closed the client.
	})

	client.on('close', (code: number, reason: Buffer) => {
		if (verbose) logger?.debug(`[BrowserShim] Client WS closed for session ${sessionId}`)

		// The same translation in this direction, where the common case is
		// @cloudflare/puppeteer's bare ws.close(): 1005.
		const close = relayedClose(code, reason?.toString?.())
		try {
			chrome.close(close.code, close.reason)
		} catch (error) {
			logger?.error('[BrowserShim] Error closing Chrome socket after disconnect:', error)
		}

		// Release rather than close: `keep_alive` is the budget a detached
		// session gets, and until it runs out the client can reconnect to this
		// same session by id — the reuse pattern /v1/sessions exists for.
		registry.release(sessionId, connectionId)
	})

	client.on('error', (error: Error) => {
		logger?.error('[BrowserShim] Client WS error:', error.message)
		try {
			chrome.close()
		} catch (closeError) {
			logger?.error('[BrowserShim] Error closing Chrome socket after client error:', closeError)
		}
	})
}

/**
 * @description The frame to forward for a message `ws` delivered.
 *
 * → `ws` hands every message over as a Buffer, text included, and `send()`
 *   turns a Buffer into a BINARY frame. Chrome's DevTools socket speaks text
 *   only and drops the connection on a binary one — so this relay, forwarding
 *   the Buffer as it came, never got a single reply from Chrome. A message
 *   `ws` did not flag binary goes on as the text it was.
 *
 * @param data - the message as `ws` delivered it
 * @param isBinary - `ws`'s flag for a binary frame; absent means text
 * @returns a string for a text message, the data untouched for a binary one
 */
function asFrame(data: unknown, isBinary?: boolean): unknown {
	if (isBinary || typeof data === 'string') return data
	return data instanceof Uint8Array ? new TextDecoder().decode(data) : data
}
