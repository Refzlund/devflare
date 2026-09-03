// =============================================================================
// WebSocket Constructor Resolution
// =============================================================================
// The bridge client and the DO pass-through connection both need a WebSocket
// implementation, chosen at runtime: the platform global (browser/Bun/undici)
// when present, else the `ws` package (Node). This module owns that selection so
// both `client.ts` and `do-websocket-connect.ts` share one source of truth
// without an import cycle.
// =============================================================================

/** A WebSocket constructor callable as `new Ctor(url)`. */
export type WebSocketConstructor = new (url: string) => WebSocket

let wsPackageConstructorPromise: Promise<WebSocketConstructor> | null = null

/**
 * Lazily import the `ws` package's WebSocket constructor (memoized). Used as the
 * Node fallback and whenever custom upgrade headers are required — unlike the
 * platform global, the `ws` constructor accepts an options object with headers.
 *
 * @returns The `ws` package WebSocket constructor.
 * @throws When the `ws` package does not export a usable WebSocket implementation.
 */
export async function importWsPackageConstructor(): Promise<WebSocketConstructor> {
	if (!wsPackageConstructorPromise) {
		wsPackageConstructorPromise = (async () => {
			const dynamicImport = new Function(
				'specifier',
				['return ', 'import', '(specifier)'].join('')
			) as (specifier: string) => Promise<{
				WebSocket?: unknown
				default?: unknown
			}>
			const wsModule = await dynamicImport('ws')
			const defaultExport = wsModule.default as { WebSocket?: unknown } | unknown
			const wsConstructor =
				wsModule.WebSocket ??
				(typeof defaultExport === 'object' && defaultExport !== null
					? (defaultExport as { WebSocket?: unknown }).WebSocket
					: undefined) ??
				defaultExport

			if (typeof wsConstructor !== 'function') {
				throw new Error('Could not load a WebSocket client implementation from the ws package')
			}

			return wsConstructor as WebSocketConstructor
		})()
	}

	return wsPackageConstructorPromise
}

/**
 * Return the runtime's global WebSocket constructor, or null when the runtime
 * has none (older Node without a global WebSocket).
 *
 * @param runtimeWebSocket - The candidate global (defaults to `globalThis.WebSocket`).
 * @returns The global constructor, or null.
 */
export function getRuntimeWebSocketConstructor(
	runtimeWebSocket: unknown = globalThis.WebSocket
): WebSocketConstructor | null {
	if (typeof runtimeWebSocket === 'function') {
		return runtimeWebSocket as WebSocketConstructor
	}

	return null
}

/**
 * Resolve a WebSocket constructor for the bridge socket: prefer the runtime
 * global, fall back to the `ws` package.
 *
 * @param runtimeWebSocket - The candidate global (defaults to `globalThis.WebSocket`).
 * @returns A usable WebSocket constructor.
 */
export async function resolveBridgeWebSocketConstructor(
	runtimeWebSocket: unknown = globalThis.WebSocket
): Promise<WebSocketConstructor> {
	const runtimeConstructor = getRuntimeWebSocketConstructor(runtimeWebSocket)
	if (runtimeConstructor) return runtimeConstructor

	return importWsPackageConstructor()
}

/**
 * Resolve the WebSocket constructor for a Durable Object pass-through
 * connection. Custom upgrade headers require the `ws` package (whose constructor
 * accepts an options object); the global WebSocket (undici/Bun) cannot set
 * request headers, so it is used only when there are no headers to forward.
 *
 * @param hasHeaders - Whether application headers must ride the upgrade request.
 * @returns A WebSocket constructor suitable for the connection.
 */
export async function resolveDoWebSocketConstructor(
	hasHeaders: boolean
): Promise<WebSocketConstructor> {
	if (hasHeaders) return importWsPackageConstructor()
	return resolveBridgeWebSocketConstructor()
}
