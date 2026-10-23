// =============================================================================
// Case 8: File-Based Routing - Route: /api/[...path]
// =============================================================================

import type { RouteHandler } from '../../lib/router'

/**
 * Catch-all route for /api/*
 */
export const GET: RouteHandler = async (request, params) => {
	const { path } = params

	return Response.json({
		catchAll: true,
		path: path || '',
		segments: path ? path.split('/').filter(Boolean) : []
	})
}
