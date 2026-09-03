// =============================================================================
// Test Route — Demonstrates unified env from devflare
// =============================================================================

import type { RequestHandler } from './$types'
import { env } from 'devflare'

/**
 * GET /api/test-env - Test unified env from devflare
 */
export const GET: RequestHandler = async () => {
	try {
		// Test: Access KV via unified env (context → bridge fallback)
		await env.CACHE.put('__test', 'hello')
		const value = await env.CACHE.get('__test')

		return Response.json({ ok: true, value })
	} catch (e) {
		return Response.json({
			ok: false,
			error: e instanceof Error ? e.message : String(e)
		}, { status: 500 })
	}
}
