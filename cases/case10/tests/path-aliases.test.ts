// =============================================================================
// Case 10: Path Aliases - Tests
// =============================================================================
// Tests for the case10 utilities.
// These imports are relative because Bun does not resolve package-local TS aliases here.
// =============================================================================

import { describe, expect, it } from 'bun:test'

import { generateId, timestamp, slugify } from '../src/utils/index'
import { createUser, successResponse, errorResponse } from '../src/lib/index'
import type { User, ApiResponse, ErrorResponse } from '../src/types/index'

describe('Case 10: Path Aliases', () => {
	describe('@utils', () => {
		describe('generateId', () => {
			it('generates UUID format', () => {
				const id = generateId()

				expect(id).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
				)
			})

			it('generates unique IDs', () => {
				const ids = new Set(Array.from({ length: 100 }, () => generateId()))
				expect(ids.size).toBe(100)
			})
		})

		describe('timestamp', () => {
			it('returns current time in milliseconds', () => {
				const before = Date.now()
				const ts = timestamp()
				const after = Date.now()

				expect(ts).toBeGreaterThanOrEqual(before)
				expect(ts).toBeLessThanOrEqual(after)
			})
		})

		describe('slugify', () => {
			it('converts to lowercase', () => {
				expect(slugify('HELLO')).toBe('hello')
			})

			it('replaces spaces with dashes', () => {
				expect(slugify('hello world')).toBe('hello-world')
			})

			it('removes special characters', () => {
				expect(slugify('hello! @world#')).toBe('hello-world')
			})

			it('handles complex strings', () => {
				expect(slugify('My Blog Post Title!')).toBe('my-blog-post-title')
			})
		})
	})

	describe('@lib', () => {
		describe('createUser', () => {
			it('creates user with all fields', () => {
				const user = createUser('John Doe', 'john@example.com')

				expect(user.name).toBe('John Doe')
				expect(user.email).toBe('john@example.com')
				expect(user.id).toBeDefined()
				expect(user.createdAt).toBeTypeOf('number')
			})
		})

		describe('successResponse', () => {
			it('wraps data in success envelope', () => {
				const response = successResponse({ foo: 'bar' })

				expect(response.success).toBe(true)
				expect(response.data).toEqual({ foo: 'bar' })
			})
		})

		describe('errorResponse', () => {
			it('creates error envelope', () => {
				const response = errorResponse('Something failed', 'ERR_FAIL')

				expect(response.success).toBe(false)
				expect(response.error).toBe('Something failed')
				expect(response.code).toBe('ERR_FAIL')
			})
		})
	})

	describe('@types', () => {
		it('types are usable', () => {
			const user: User = {
				id: '123',
				name: 'Test',
				email: 'test@example.com',
				createdAt: Date.now()
			}

			const response: ApiResponse<User> = {
				success: true,
				data: user
			}

			expect(response.success).toBe(true)
			expect(response.data.id).toBe('123')
		})
	})
})
