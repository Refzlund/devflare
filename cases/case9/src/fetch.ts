// =============================================================================
// Case 9: Monorepo - Fetch Handler
// =============================================================================
// Demonstrates using shared packages from a monorepo
// Using devflare's file-based patterns
// =============================================================================

import {
	formatResponse,
	formatError,
	paginate,
	CONSTANTS,
	type PaginatedRequest
} from '@devflare/case9-shared'

/**
 * Main fetch handler
 * Uses shared utilities from monorepo package
 */
export default async function fetch(
	request: Request,
	env: unknown,
	ctx: ExecutionContext
): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json(
			formatResponse({
				name: 'Case 9: Monorepo Worker',
				version: CONSTANTS.VERSION
			})
		)
	}

	// Route: GET /items
	if (url.pathname === '/items') {
		const page = parseInt(url.searchParams.get('page') || '1')
		const pageSize = Math.min(
			parseInt(url.searchParams.get('pageSize') || String(CONSTANTS.DEFAULT_PAGE_SIZE)),
			CONSTANTS.MAX_PAGE_SIZE
		)

		// Mock data
		const allItems = Array.from({ length: 100 }, (_, i) => ({
			id: i + 1,
			name: `Item ${i + 1}`
		}))

		const start = (page - 1) * pageSize
		const items = allItems.slice(start, start + pageSize)

		return Response.json(
			formatResponse(paginate(items, allItems.length, page, pageSize))
		)
	}

	// Route: GET /error
	if (url.pathname === '/error') {
		return Response.json(formatError('Something went wrong', 'ERR_DEMO', 500), {
			status: 500
		})
	}

	return Response.json(formatError('Not found', 'NOT_FOUND', 404), {
		status: 404
	})
}
