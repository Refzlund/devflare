// =============================================================================
// Case 10: Path Aliases - Fetch Handler
// =============================================================================
// Demonstrates a case with TypeScript path alias configuration.
// Runtime imports stay relative so Bun tests can execute this example reliably.
// =============================================================================

import { generateId, timestamp, slugify } from './utils/index'
import { createUser, successResponse, errorResponse } from './lib/index'

/**
 * Main fetch handler
 * Demonstrates the case10 routing and utility flow
 */
export default async function fetch(
	request: Request,
	env: unknown,
	ctx: ExecutionContext
): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json(successResponse({
			name: 'Case 10: Path Aliases',
			message: 'Demonstrates TypeScript path aliases'
		}))
	}

	// Route: POST /users
	if (url.pathname === '/users' && request.method === 'POST') {
		try {
			const body = await request.json() as { name: string, email: string }

			if (!body.name || !body.email) {
				return Response.json(
					errorResponse('Name and email required', 'INVALID_INPUT'),
					{ status: 400 }
				)
			}

			const user = createUser(body.name, body.email)
			return Response.json(successResponse(user), { status: 201 })
		} catch {
			return Response.json(
				errorResponse('Invalid JSON', 'PARSE_ERROR'),
				{ status: 400 }
			)
		}
	}

	// Route: GET /utils/demo
	if (url.pathname === '/utils/demo') {
		return Response.json(successResponse({
			id: generateId(),
			timestamp: timestamp(),
			slugified: slugify('Hello World Test')
		}))
	}

	return Response.json(
		errorResponse('Not found', 'NOT_FOUND'),
		{ status: 404 }
	)
}
