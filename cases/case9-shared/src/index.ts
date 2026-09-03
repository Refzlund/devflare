// =============================================================================
// Case 9: Monorepo - Shared Package
// =============================================================================
// Shared utilities used across multiple workers in the monorepo
// =============================================================================

/**
 * Shared utility to format a response
 */
export function formatResponse<T>(data: T) {
	return {
		success: true as const,
		data,
		timestamp: Date.now()
	}
}

/**
 * Shared utility to format an error
 */
export function formatError(message: string, code: string, status = 500) {
	return {
		success: false as const,
		error: {
			message,
			code,
			status
		},
		timestamp: Date.now()
	}
}

/**
 * Shared constants
 */
export const CONSTANTS = {
	MAX_PAGE_SIZE: 100,
	DEFAULT_PAGE_SIZE: 20,
	VERSION: '1.0.0'
} as const

/**
 * Shared type definitions
 */
export interface PaginatedRequest {
	page?: number
	pageSize?: number
}

export interface PaginatedResponse<T> {
	items: T[]
	pagination: {
		page: number
		pageSize: number
		totalItems: number
		totalPages: number
		hasNext: boolean
		hasPrev: boolean
	}
}

/**
 * Create paginated response
 */
export function paginate<T>(
	items: T[],
	totalItems: number,
	page: number,
	pageSize: number
): PaginatedResponse<T> {
	const totalPages = Math.ceil(totalItems / pageSize)
	return {
		items,
		pagination: {
			page,
			pageSize,
			totalItems,
			totalPages,
			hasNext: page < totalPages,
			hasPrev: page > 1
		}
	}
}
