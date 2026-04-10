// =============================================================================
// Case 10: Path Aliases - Lib
// =============================================================================

import type { User, ApiResponse, ErrorResponse } from '../types/index'
import { generateId, timestamp } from '../utils/index'

export function createUser(name: string, email: string): User {
	return {
		id: generateId(),
		name,
		email,
		createdAt: timestamp()
	}
}

export function successResponse<T>(data: T): ApiResponse<T> {
	return { success: true, data }
}

export function errorResponse(error: string, code: string): ErrorResponse {
	return { success: false, error, code }
}
