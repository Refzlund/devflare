// =============================================================================
// Route: GET /env
// =============================================================================

import type { FetchEvent } from 'devflare/runtime'
import { env } from 'devflare'

/**
 * GET /env - Returns environment variables via unified env
 */
export async function GET(_event: FetchEvent<DevflareEnv>): Promise<Response> {
	return Response.json({
		LOG_LEVEL: env.LOG_LEVEL
	})
}
