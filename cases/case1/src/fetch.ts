// =============================================================================
// Case 1: Basic Worker - Fetch Handler
// =============================================================================
// Demonstrates devflare's unified env access pattern:
// - import { env } from 'devflare' works anywhere
// - GlobalDevflareEnv provides type safety
// =============================================================================

import { env } from 'devflare'

/**
 * Fetch handler demonstrating unified env access
 */
export default async function fetch(
	request: Request,
	_rawEnv: DevflareEnv,
	_ctx: ExecutionContext
): Promise<Response> {
	const url = new URL(request.url)

	// GET / - Welcome
	if (url.pathname === '/') {
		return new Response('Hello from Case 1: Basic Worker!', {
			headers: { 'Content-Type': 'text/plain' }
		})
	}

	// GET /env - Show vars
	if (url.pathname === '/env') {
		return Response.json({ LOG_LEVEL: env.LOG_LEVEL })
	}

	// /cache/:key - KV operations using unified env
	if (url.pathname.startsWith('/cache/')) {
		const key = url.pathname.slice(7)

		if (request.method === 'GET') {
			const value = await env.CACHE.get(key)
			return value
				? new Response(value)
				: new Response('Not found', { status: 404 })
		}

		if (request.method === 'PUT') {
			const value = await request.text()
			await env.CACHE.put(key, value)
			return new Response('Stored', { status: 201 })
		}

		if (request.method === 'DELETE') {
			await env.CACHE.delete(key)
			return new Response('Deleted')
		}

		return new Response('Method not allowed', { status: 405 })
	}

	return new Response('Not found', { status: 404 })
}
