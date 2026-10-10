// =============================================================================
// Business Logic: Users
// =============================================================================
// Shared utilities that use the env proxy
// =============================================================================

import { env } from 'devflare'

/**
 * Get user from cache by ID
 * No need to pass env as parameter — it's globally available via ASL
 */
export async function getUser(id: string) {
	const cached = await env.CACHE.get(`user:${id}`, 'json')
	return cached as { id: string; name: string } | null
}

/**
 * Store user in cache
 */
export async function storeUser(id: string, data: { name: string }) {
	await env.CACHE.put(`user:${id}`, JSON.stringify({ id, ...data }), {
		expirationTtl: 300 // 5 minutes
	})
	return { id, ...data }
}
