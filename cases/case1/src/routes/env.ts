// =============================================================================
// Route: GET /env
// =============================================================================

import { env } from 'devflare'
import type { FetchEvent } from 'devflare/runtime'

/**
 * GET /env - Returns environment variables via unified env
 */
export async function GET(_event: FetchEvent<DevflareEnv>): Promise<Response> {
	return Response.json({
		LOG_LEVEL: env.LOG_LEVEL
	})
}
