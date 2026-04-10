// =============================================================================
// Case 3: DO Service - Worker Entrypoint
// =============================================================================
// This worker hosts the Durable Objects and exposes them via bindings.
// Another worker can access these DOs through service bindings.
//
// The DOs are discovered automatically via files.durableObjects: 'do.*.ts'
// in devflare.config.ts - no need to export them here.
// =============================================================================

/**
 * Default fetch handler for the DO service worker.
 * This worker primarily hosts DOs - the fetch handler is minimal.
 */
export default async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	if (url.pathname === '/') {
		return Response.json({
			name: 'DO Service Worker',
			description: 'Hosts Durable Objects for cross-worker access',
			durableObjects: ['Counter', 'RateLimiter']
		})
	}

	return new Response('Not found', { status: 404 })
}
