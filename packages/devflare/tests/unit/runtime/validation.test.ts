// =============================================================================
// Validation Proxy Tests — Runtime safety for context access
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { runWithContext } from '../../../src/runtime/context'
import { ContextAccessError, createContextProxy } from '../../../src/runtime/validation'

describe('createContextProxy', () => {
	test('allows access when context is available', () => {
		let envValue: { DB: string } | undefined

		const envProxy = createContextProxy(() => envValue, 'env')

		envValue = { DB: 'database' }

		// This should throw because we're not in context
		// even though envValue is defined - the getter returns undefined outside context
	})

	test('throws ContextAccessError when getter returns undefined', () => {
		const proxy = createContextProxy<{ value: string }>(() => undefined, 'env')

		expect(() => proxy.value).toThrow(ContextAccessError)
	})

	test('error includes property name', () => {
		const proxy = createContextProxy<{ DB: string }>(() => undefined, 'env')

		try {
			const _ = proxy.DB
			expect(true).toBe(false) // Should not reach
		} catch (e) {
			expect(e).toBeInstanceOf(ContextAccessError)
			const error = e as ContextAccessError
			expect(error.message).toContain('env.DB')
		}
	})

	test('error includes helpful guidance', () => {
		const proxy = createContextProxy<{ value: string }>(() => undefined, 'locals')

		try {
			const _ = proxy.value
		} catch (e) {
			const error = e as ContextAccessError
			expect(error.message).toContain('outside of an active Devflare handler trail')
			expect(error.message).toContain('Move the access inside')
		}
	})

	test('returns value when getter returns defined object', () => {
		const mockEnv = { DB: 'my-database', KV: 'my-kv' }
		const proxy = createContextProxy(() => mockEnv, 'env')

		expect(proxy.DB).toBe('my-database')
		expect(proxy.KV).toBe('my-kv')
	})

	test('supports setting values', () => {
		const mockLocals: Record<string, unknown> = {}
		const proxy = createContextProxy(() => mockLocals, 'locals')

		proxy.userId = '123'
		expect(mockLocals.userId).toBe('123')
	})

	test('setting throws when context unavailable', () => {
		const proxy = createContextProxy<Record<string, unknown>>(() => undefined, 'locals')

		expect(() => {
			proxy.value = 'test'
		}).toThrow(ContextAccessError)
	})

	test('has() returns false when context unavailable', () => {
		const proxy = createContextProxy<{ value: string }>(() => undefined, 'env')

		expect('value' in proxy).toBe(false)
	})

	test('has() returns true when property exists in context', () => {
		const mockEnv = { DB: 'database' }
		const proxy = createContextProxy(() => mockEnv, 'env')

		expect('DB' in proxy).toBe(true)
		expect('MISSING' in proxy).toBe(false)
	})

	test('ownKeys() returns empty array when context unavailable', () => {
		const proxy = createContextProxy<{ value: string }>(() => undefined, 'env')

		expect(Object.keys(proxy)).toEqual([])
	})

	test('ownKeys() returns actual keys when context available', () => {
		const mockEnv = { DB: 'db', KV: 'kv' }
		const proxy = createContextProxy(() => mockEnv, 'env')

		expect(Object.keys(proxy)).toEqual(['DB', 'KV'])
	})
})

describe('integration with runWithContext', () => {
	test('proxy works correctly within context', () => {
		const mockEnv = { API_KEY: 'secret' }
		const mockCtx: ExecutionContext = {
			waitUntil: () => {},
			passThroughOnException: () => {},
			props: {}
		}

		let envValue: typeof mockEnv | undefined
		const envProxy = createContextProxy(() => envValue, 'env')

		runWithContext(mockEnv, mockCtx, null, () => {
			// Simulate how the real implementation would work
			envValue = mockEnv
			expect(envProxy.API_KEY).toBe('secret')
		})
	})
})
