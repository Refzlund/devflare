// =============================================================================
// Case 8: File-Based Routing - Route: /
// =============================================================================

import type { RouteHandler } from '../lib/router'

export const GET: RouteHandler = async (request, params) => {
	return Response.json({
		name: 'Case 8: File-Based Routing',
		message: 'Welcome to the home page'
	})
}
