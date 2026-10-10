// =============================================================================
// Case 8: File-Based Routing - Route: /users/:id
// =============================================================================

import type { RouteHandler } from '../../lib/router'

export const GET: RouteHandler = async (request, params) => {
	const { id } = params

	return Response.json({
		user: {
			id,
			name: `User ${id}`,
			email: `user${id}@example.com`
		}
	})
}

export const PUT: RouteHandler = async (request, params) => {
	const { id } = params
	const body = await request.json()

	return Response.json({
		message: `Updated user ${id}`,
		data: body
	})
}

export const DELETE: RouteHandler = async (request, params) => {
	const { id } = params

	return Response.json({
		message: `Deleted user ${id}`
	})
}
