// =============================================================================
// Durable Object WebSocket Pass-Through Connection
// =============================================================================
// Opens a REAL loopback WebSocket to the gateway's `/_devflare/do-ws` endpoint,
// which forwards the upgrade to the target Durable Object and passes through its
// `101` response. This is the ONLY way a bridged DO WebSocket triggers the
// runtime's hibernation dispatch under miniflare: the gateway returns the DO's
// client socket for a genuine inbound connection, so workerd pumps it and
// invokes `webSocketMessage`/`webSocketClose` and delivers `ctx.getWebSockets()`
// broadcasts. The legacy in-process relay (BridgeClient.createWsProxy + gateway
// `stub.fetch()` pump) never fires hibernation, so two sockets to the same
// `getByName(id)` could not see each other's messages. Here they share ONE DO
// instance and broadcast across each other, exactly as on real Cloudflare.
// =============================================================================

import { nextWsId } from './v2/wire'
import { resolveDoWebSocketConstructor } from './websocket-constructor'

/**
 * Hop-by-hop / WebSocket-control request headers that the WebSocket client sets
 * itself. They must never be copied from the user's `connect(url, { headers })`
 * onto the outgoing upgrade — a duplicate `Upgrade`/`Sec-WebSocket-*` breaks the
 * handshake (the `ws` package rejects it). Auth/cookie headers are preserved.
 */
const WS_CONTROL_HEADERS = new Set([
	'upgrade',
	'connection',
	'host',
	'sec-websocket-key',
	'sec-websocket-version',
	'sec-websocket-extensions',
	'sec-websocket-protocol'
])

/**
 * Strip WebSocket-control headers from user-supplied upgrade headers, leaving
 * only the application headers (auth, cookies) worth forwarding to the DO.
 *
 * @param headers - Header tuples from `connect(url, { headers })`, or undefined.
 * @returns A plain object of the forwardable headers (may be empty).
 */
function forwardableUpgradeHeaders(headers?: [string, string][]): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [key, value] of headers ?? []) {
		if (!WS_CONTROL_HEADERS.has(key.toLowerCase())) out[key] = value
	}
	return out
}

/**
 * Normalize an inbound WebSocket payload to the `Uint8Array | string` contract
 * the DO Socket facade expects: text frames stay strings, binary frames become
 * a `Uint8Array` view regardless of whether the runtime delivered an
 * `ArrayBuffer`, a `Buffer`, or another typed-array/DataView.
 *
 * @param data - The raw `MessageEvent.data` from the DO pass-through socket.
 * @returns The payload as a string (text) or `Uint8Array` (binary).
 */
function normalizeIncomingWsData(data: unknown): Uint8Array | string {
	if (typeof data === 'string') return data
	if (data instanceof Uint8Array) return data
	if (data instanceof ArrayBuffer) return new Uint8Array(data)
	if (ArrayBuffer.isView(data)) {
		const view = data as ArrayBufferView
		return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
	}
	return String(data)
}

/**
 * The minimal proxy surface over a DO pass-through socket, matching the shape
 * consumed by the DO Socket facade in `proxy.ts` `connect()`.
 */
export interface DoWebSocketProxy {
	/** Synthetic id for parity with the legacy relay proxy (not on the wire). */
	wid: number
	/** Send a frame to the DO (binary for bytes, text for strings). */
	send: (data: Uint8Array | string) => void
	/** Close the socket. */
	close: (code?: number, reason?: string) => void
	/** Attach the inbound-frame handler; buffered frames flush immediately. */
	onMessage: (handler: (data: Uint8Array | string) => void) => void
	/** Attach the close handler; a buffered close fires immediately. */
	onClose: (handler: (code?: number, reason?: string) => void) => void
}

/**
 * Open a real pass-through WebSocket to a Durable Object through the gateway's
 * `/_devflare/do-ws` endpoint. Unlike the legacy relay, this is a standalone
 * connection with its own lifecycle, so it is unaffected by the bridge client's
 * `disconnect()`/reconnect bookkeeping.
 *
 * @param bridgeUrl - The bridge/gateway base URL (e.g. `ws://127.0.0.1:8787`).
 * @param binding - DO namespace binding name (e.g. `DOC_ROOM`).
 * @param idHex - Already-resolved Durable Object id, hex form.
 * @param targetUrl - The DO fetch URL the caller passed to `stub.connect(url)`.
 * @param headers - Optional upgrade headers (auth/cookies) forwarded to the DO.
 * @returns A proxy surface (send/close/onMessage/onClose) over the socket.
 * @throws When the pass-through socket fails to open (bad binding/id, or the DO
 *   rejected the upgrade).
 */
export async function openDurableObjectWebSocket(
	bridgeUrl: string,
	binding: string,
	idHex: string,
	targetUrl: string,
	headers?: [string, string][]
): Promise<DoWebSocketProxy> {
	const wsUrl = new URL(bridgeUrl)
	wsUrl.pathname = '/_devflare/do-ws'
	wsUrl.searchParams.set('binding', binding)
	wsUrl.searchParams.set('id', idHex)
	wsUrl.searchParams.set('u', targetUrl)

	const forwardHeaders = forwardableUpgradeHeaders(headers)
	const hasHeaders = Object.keys(forwardHeaders).length > 0
	const WebSocketCtor = await resolveDoWebSocketConstructor(hasHeaders)

	const socket: WebSocket = hasHeaders
		? new (
				WebSocketCtor as unknown as new (
					u: string,
					o: { headers: Record<string, string> }
				) => WebSocket
			)(wsUrl.toString(), { headers: forwardHeaders })
		: new WebSocketCtor(wsUrl.toString())
	socket.binaryType = 'arraybuffer'

	// Buffer frames/close that arrive before the caller attaches handlers (the DO
	// may broadcast to a fresh peer immediately on connect).
	let opened = false
	let messageHandler: ((data: Uint8Array | string) => void) | null = null
	let closeHandler: ((code?: number, reason?: string) => void) | null = null
	const pendingMessages: Array<Uint8Array | string> = []
	let pendingClose: { code?: number; reason?: string } | null = null

	// Event params are left unannotated so the handler shapes match whichever
	// WebSocket type the runtime resolves to (DOM/undici/Bun/ws).
	socket.onmessage = (event) => {
		const data = normalizeIncomingWsData(event.data)
		if (messageHandler) messageHandler(data)
		else pendingMessages.push(data)
	}

	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => {
			opened = true
			resolve()
		}
		socket.onerror = () => {
			if (!opened) reject(new Error(`DO WebSocket connection failed: ${binding}/${idHex}`))
		}
		socket.onclose = (event) => {
			if (!opened) {
				reject(new Error(`DO WebSocket closed before open: ${binding}/${idHex}`))
				return
			}
			if (closeHandler) closeHandler(event?.code, event?.reason)
			else pendingClose = { code: event?.code, reason: event?.reason }
		}
	})

	return {
		wid: nextWsId(),
		send: (data) => socket.send(data as never),
		close: (code, reason) => socket.close(code, reason),
		onMessage: (handler) => {
			messageHandler = handler
			if (pendingMessages.length > 0) {
				for (const data of pendingMessages.splice(0)) handler(data)
			}
		},
		onClose: (handler) => {
			closeHandler = handler
			if (pendingClose) {
				handler(pendingClose.code, pendingClose.reason)
				pendingClose = null
			}
		}
	}
}
