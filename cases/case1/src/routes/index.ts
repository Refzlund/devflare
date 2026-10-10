// =============================================================================
// Route: GET /
// =============================================================================

import type { FetchEvent } from 'devflare/runtime'

/**
 * GET / - Returns welcome message
 */
export async function GET(_event: FetchEvent<DevflareEnv>): Promise<Response> {
	return new Response('Hello from Case 1: Basic Worker!', {
		headers: { 'Content-Type': 'text/plain' }
	})
}
