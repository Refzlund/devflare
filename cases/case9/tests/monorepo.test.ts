// =============================================================================
// Case 9: Monorepo - Tests
// =============================================================================
// Tests for shared package utilities
// =============================================================================

import { describe, expect, it } from 'bun:test'
import {
	formatResponse,
	formatError,
	paginate,
	CONSTANTS
} from '@devflare/case9-shared'

describe('Case 9: Monorepo', () => {
	describe('formatResponse', () => {
		it('wraps data in success envelope', () => {
			const result = formatResponse({ foo: 'bar' })

			expect(result.success).toBe(true)
			expect(result.data).toEqual({ foo: 'bar' })
			expect(result.timestamp).toBeTypeOf('number')
		})

		it('handles arrays', () => {
			const result = formatResponse([1, 2, 3])

			expect(result.success).toBe(true)
			expect(result.data).toEqual([1, 2, 3])
		})

		it('handles null', () => {
			const result = formatResponse(null)

			expect(result.success).toBe(true)
			expect(result.data).toBeNull()
		})
	})

	describe('formatError', () => {
		it('wraps error in envelope', () => {
			const result = formatError('Bad request', 'INVALID_INPUT', 400)

			expect(result.success).toBe(false)
			expect(result.error).toEqual({
				message: 'Bad request',
				code: 'INVALID_INPUT',
				status: 400
			})
			expect(result.timestamp).toBeTypeOf('number')
		})

		it('uses default status 500', () => {
			const result = formatError('Server error', 'INTERNAL')

			expect(result.error.status).toBe(500)
		})
	})

	describe('paginate', () => {
		it('calculates pagination metadata', () => {
			const items = [{ id: 1 }, { id: 2 }]
			const result = paginate(items, 100, 2, 10)

			expect(result.items).toEqual(items)
			expect(result.pagination).toEqual({
				page: 2,
				pageSize: 10,
				totalItems: 100,
				totalPages: 10,
				hasNext: true,
				hasPrev: true
			})
		})

		it('handles first page', () => {
			const result = paginate([], 50, 1, 10)

			expect(result.pagination.page).toBe(1)
			expect(result.pagination.hasPrev).toBe(false)
			expect(result.pagination.hasNext).toBe(true)
		})

		it('handles last page', () => {
			const result = paginate([], 50, 5, 10)

			expect(result.pagination.page).toBe(5)
			expect(result.pagination.hasPrev).toBe(true)
			expect(result.pagination.hasNext).toBe(false)
		})

		it('handles single page', () => {
			const result = paginate([], 5, 1, 10)

			expect(result.pagination.totalPages).toBe(1)
			expect(result.pagination.hasPrev).toBe(false)
			expect(result.pagination.hasNext).toBe(false)
		})
	})

	describe('CONSTANTS', () => {
		it('has expected values', () => {
			expect(CONSTANTS.VERSION).toBe('1.0.0')
			expect(CONSTANTS.DEFAULT_PAGE_SIZE).toBe(20)
			expect(CONSTANTS.MAX_PAGE_SIZE).toBe(100)
		})
	})
})
