// =============================================================================
// Case 14: Hyperdrive — Fetch Handler
// =============================================================================
// Demonstrates PostgreSQL access via Hyperdrive connection pooling.
// In production, Hyperdrive provides optimized connection pooling to PostgreSQL.
// In local dev, Hyperdrive binding provides a connectionString for direct access.
// =============================================================================

import { env } from 'devflare'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface User {
	id: number
	name: string
	email: string
	created_at: string
}

// -----------------------------------------------------------------------------
// Fetch Handler
// -----------------------------------------------------------------------------

/**
 * HTTP fetch handler demonstrating Hyperdrive usage.
 * Hyperdrive provides a `connectionString` for PostgreSQL connections.
 */
export default async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	if (url.pathname === '/health') {
		return Response.json({ status: 'ok', binding: 'hyperdrive' })
	}

	if (url.pathname === '/connection-info') {
		// Access Hyperdrive binding — provides connectionString for PostgreSQL
		// In a real app, you'd use this with a PostgreSQL driver:
		// const sql = postgres(env.DB.connectionString)
		return Response.json({
			hasBinding: Boolean(env.DB),
			hasConnectionString: Boolean(env.DB?.connectionString)
		})
	}

	return new Response('Not found', { status: 404 })
}
