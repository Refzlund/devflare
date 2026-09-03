// =============================================================================
// Route: /cache/:key
// =============================================================================

import type { FetchEvent } from 'devflare/runtime'
import { env } from 'devflare'

type CacheRouteEvent = FetchEvent<DevflareEnv, { key: string }>

/**
 * GET /cache/:key - Retrieves cached value via unified env
 */
export async function GET({ params }: CacheRouteEvent): Promise<Response> {
	const value = await env.CACHE.get(params.key)
	if (!value) {
		return new Response('Not found', { status: 404 })
	}
	return new Response(value)
}

/**
 * PUT /cache/:key - Stores value in cache via unified env
 */
export async function PUT({ request, params }: CacheRouteEvent): Promise<Response> {
	const value = await request.text()
	await env.CACHE.put(params.key, value)
	return new Response('Stored', { status: 201 })
}

/**
 * DELETE /cache/:key - Removes value from cache via unified env
 */
export async function DELETE({ params }: CacheRouteEvent): Promise<Response> {
	await env.CACHE.delete(params.key)
	return new Response('Deleted')
}
