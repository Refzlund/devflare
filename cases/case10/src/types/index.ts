// =============================================================================
// Case 10: Path Aliases - Types
// =============================================================================

export interface User {
	id: string
	name: string
	email: string
	createdAt: number
}

export interface ApiResponse<T> {
	success: boolean
	data: T
}

export interface ErrorResponse {
	success: false
	error: string
	code: string
}
