// =============================================================================
// Case 11: Cross-Package DO - Fetch Handler (Monorepo Pattern)
// =============================================================================
// Demonstrates using a Durable Object from a workspace package via RPC.
// Uses devflare pattern: export function fetch() + import { env }
//
// In a monorepo, import types from the package name, not relative paths:
//   import type { SessionData } from '@devflare/case11-do-shared'
// =============================================================================

import { env } from 'devflare'
import type { SessionData, JsonValue } from '@devflare/case11-do-shared'

/**
 * Main fetch handler
 * Demonstrates using DO classes from shared packages via RPC
 */
export default async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json({
			name: 'Case 11: Cross-Package Durable Objects',
			message: 'Demonstrates using DO classes from shared packages via ref()'
		})
	}

	// Route: GET/POST/DELETE /session/:userId
	const sessionMatch = url.pathname.match(/^\/session\/([^/]+)$/)
	if (sessionMatch) {
		const userId = sessionMatch[1]
		const id = env.SESSION_STORE.idFromName(userId)
		const stub = env.SESSION_STORE.get(id)

		if (request.method === 'GET') {
			// Get session via RPC
			const session = await stub.getSession(userId)
			if (!session) {
				return Response.json({ error: 'Session not found' }, { status: 404 })
			}
			return Response.json(session)
		}

		if (request.method === 'POST') {
			// Create/update session via RPC
			const body = await request.json() as { data?: { [key: string]: JsonValue }; expiresAt?: number }
			const session = await stub.setSession(userId, body.data ?? {}, body.expiresAt)
			return Response.json(session, { status: 201 })
		}

		if (request.method === 'DELETE') {
			// Delete session via RPC
			await stub.deleteSession(userId)
			return new Response(null, { status: 204 })
		}
	}

	return Response.json({ error: 'Not found' }, { status: 404 })
}
