import type { RequestHandler } from './$types'

/**
 * GET /chat/api - WebSocket upgrade endpoint for ChatRoom DO
 *
 * Architecture:
 * - SvelteKit calls ChatRoom DO via DurableObjectNamespace binding
 * - Works in production directly
 * - In dev: SvelteKit + Cloudflare DO dev support is BLOCKED on SvelteKit 3.0
 *   See: https://github.com/sveltejs/kit/pull/14008
 *   Current workaround: Build first, then run wrangler dev with multi-config
 */
export const GET: RequestHandler = async ({ request, platform, url }) => {
	try {
		if (!platform?.env?.CHAT_ROOM) {
			return new Response(JSON.stringify({
				error: 'CHAT_ROOM binding not available',
				hint: 'In dev mode, DOs require SvelteKit 3.0 (PR #14008). Use build-first approach: vite build && wrangler dev -c .devflare/wrangler.jsonc -c .devflare/wrangler.do.jsonc',
				hasPlatform: !!platform,
				hasEnv: !!platform?.env,
				envKeys: platform?.env ? Object.keys(platform.env) : []
			}, null, 2), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const roomId = url.searchParams.get('roomId') || 'default'
		const username = url.searchParams.get('username') || 'Anonymous'
		const userId = url.searchParams.get('userId') || crypto.randomUUID()

		// Get or create DO instance for this room
		const doId = platform.env.CHAT_ROOM.idFromName(roomId)
		const stub = platform.env.CHAT_ROOM.get(doId)

		// Construct the request URL for the DO
		const doUrl = new URL('/websocket', url.origin)
		doUrl.searchParams.set('roomId', roomId)
		doUrl.searchParams.set('username', username)
		doUrl.searchParams.set('userId', userId)

		// Forward request to DO
		const doResponse = await stub.fetch(doUrl.toString(), {
			method: request.method,
			headers: request.headers
		})

		// For WebSocket upgrade, return the response directly
		const upgradeHeader = request.headers.get('Upgrade')
		if (upgradeHeader === 'websocket') {
			return doResponse as unknown as Response
		}

		// For regular requests, reconstruct response for SvelteKit compatibility
		const body = await doResponse.text()
		return new Response(body, {
			status: doResponse.status,
			headers: { 'Content-Type': 'application/json' }
		})
	} catch (error) {
		console.error('[chat/api] Error:', error)
		return new Response(JSON.stringify({
			error: error instanceof Error ? error.message : String(error),
			hint: 'In dev mode, stub.fetch() to external DO workers does not work with getPlatformProxy. See GitHub issue #5918.'
		}, null, 2), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}
}
