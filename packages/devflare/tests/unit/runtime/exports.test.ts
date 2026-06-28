// =============================================================================
// Runtime Exports Tests — env, vars, ctx, event, locals proxies
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { createFetchEvent, runWithContext, runWithEventContext } from '../../../src/runtime/context'
import { ContextAccessError } from '../../../src/runtime/validation'

// Import the actual exports we'll create
import { ctx, env, event, locals, vars } from '../../../src/runtime/exports'

/** Helper to create a mock ExecutionContext */
function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => {},
		passThroughOnException: () => {},
		props: {}
	} as ExecutionContext
}

describe('env proxy', () => {
	test('throws ContextAccessError outside request handler', () => {
		expect(() => (env as Record<string, unknown>).DB).toThrow(ContextAccessError)
	})

	test('provides access to env bindings within context', () => {
		const mockEnv = { DB: 'd1-instance', KV: 'kv-namespace' }
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			expect((env as Record<string, unknown>).DB).toBe('d1-instance')
			expect((env as Record<string, unknown>).KV).toBe('kv-namespace')
		})
	})

	test('env is readonly', () => {
		const mockEnv = { DB: 'original' }
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			// TypeScript should prevent this, but let's verify runtime behavior
			expect(() => {
				;(env as Record<string, unknown>).DB = 'modified'
			}).toThrow()
		})
	})
})

describe('vars proxy', () => {
	test('throws ContextAccessError outside request handler', () => {
		expect(() => (vars as Record<string, unknown>).mongo).toThrow(ContextAccessError)
	})

	test('provides typed runtime vars from the active env object', () => {
		const mockEnv = {
			mongo: {
				database: 'voices'
			},
			isNumber: 42
		}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			expect((vars as Record<string, { database: string }>).mongo.database).toBe('voices')
			expect((vars as Record<string, unknown>).isNumber).toBe(42)
		})
	})

	test('vars is readonly', () => {
		const mockEnv = { APP_ENV: 'local' }
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			expect(() => {
				;(vars as Record<string, unknown>).APP_ENV = 'production'
			}).toThrow()
		})
	})
})

describe('ctx proxy', () => {
	test('throws ContextAccessError outside request handler', () => {
		expect(() => (ctx as ExecutionContext).waitUntil).toThrow(ContextAccessError)
	})

	test('provides access to ExecutionContext within context', () => {
		const mockEnv = {}
		const waitUntilFn = () => {}
		const mockCtx: ExecutionContext = {
			waitUntil: waitUntilFn,
			passThroughOnException: () => {},
			props: {}
		}

		runWithContext(mockEnv, mockCtx, null, () => {
			expect((ctx as ExecutionContext).waitUntil).toBe(waitUntilFn)
		})
	})
})

describe('event proxy', () => {
	test('throws ContextAccessError outside request handler', () => {
		expect(() => event.request).toThrow(ContextAccessError)
	})

	test('provides access to request within context', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()
		const mockRequest = new Request('https://example.com/api')

		runWithContext(mockEnv, mockCtx, mockRequest, () => {
			expect(event.request).toBe(mockRequest)
			expect(event.request!.url).toBe('https://example.com/api')
		})
	})

	test('provides context type', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			expect(event.type).toBe('fetch')
		})
	})

	test('reflects the active event-first fetch object', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()
		const mockRequest = new Request('https://example.com/users/123')
		const fetchEvent = createFetchEvent(mockRequest, mockEnv, mockCtx, {
			params: { id: '123' }
		})

		runWithEventContext(fetchEvent, () => {
			expect(event.type).toBe('fetch')
			expect(event.request).toBe(mockRequest)
			expect((event as unknown as { params: { id: string } }).params.id).toBe('123')
		})
	})
})

describe('locals proxy', () => {
	test('throws ContextAccessError outside request handler', () => {
		expect(() => (locals as Record<string, unknown>).userId).toThrow(ContextAccessError)
	})

	test('provides mutable storage within context', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			;(locals as Record<string, unknown>).userId = '123'
			;(locals as Record<string, unknown>).authenticated = true

			expect(locals.userId).toBe('123')
			expect(locals.authenticated).toBe(true)
		})
	})

	test('locals are isolated between requests', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		// First request
		runWithContext(mockEnv, mockCtx, null, () => {
			;(locals as Record<string, unknown>).value = 'request-1'
		})

		// Second request should have fresh locals
		runWithContext(mockEnv, mockCtx, null, () => {
			expect((locals as Record<string, unknown>).value).toBeUndefined()
		})
	})
})

describe('combined usage', () => {
	test('all exports work together within same context', async () => {
		const mockEnv = { API_KEY: 'secret' }
		const mockRequest = new Request('https://api.example.com/users')
		const waitUntilPromises: Promise<unknown>[] = []
		const mockCtx: ExecutionContext = {
			waitUntil: (p: Promise<unknown>) => {
				waitUntilPromises.push(p)
			},
			passThroughOnException: () => {},
			props: {}
		}

		await runWithContext(mockEnv, mockCtx, mockRequest, async () => {
			// Access env
			expect((env as Record<string, unknown>).API_KEY).toBe('secret')

			// Use ctx
			;(ctx as ExecutionContext).waitUntil(Promise.resolve('background-task'))

			// Access event
			expect(event.request!.url).toBe('https://api.example.com/users')

			// Use locals
			;(locals as Record<string, unknown>).processedAt = Date.now()
			expect(typeof locals.processedAt).toBe('number')
		})

		// Verify waitUntil was called
		expect(waitUntilPromises.length).toBe(1)
	})
})
