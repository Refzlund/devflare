// =============================================================================
// Middleware System Tests — sequence() and handle()
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	invokeFetchModule,
	sequence,
	handle,
	resolve,
	type FetchMiddleware,
	type Middleware,
	type Handler
} from '../../../src/runtime/middleware'
import { createFetchEvent, runWithContext, runWithEventContext } from '../../../src/runtime/context'

/** Helper to create a mock ExecutionContext */
function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => { },
		passThroughOnException: () => { },
		props: {}
	} as ExecutionContext
}

describe('sequence()', () => {
	test('executes middlewares in order', async () => {
		const order: number[] = []

		const m1: Middleware = async (next) => {
			order.push(1)
			const response = await next()
			order.push(4)
			return response
		}

		const m2: Middleware = async (next) => {
			order.push(2)
			const response = await next()
			order.push(3)
			return response
		}

		const handler: Handler = async () => {
			return new Response('OK')
		}

		const composed = sequence(m1, m2)(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()
		const request = new Request('https://example.com')

		const response = await runWithContext(mockEnv, mockCtx, request, () => composed())

		expect(order).toEqual([1, 2, 3, 4])
		expect(await response!.text()).toBe('OK')
	})

	test('works with empty middleware array', async () => {
		const handler: Handler = async () => new Response('Direct')
		const composed = sequence()(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())
		expect(await response!.text()).toBe('Direct')
	})

	test('works with single middleware', async () => {
		const m1: Middleware = async (next) => {
			const response = await next()
			return new Response(`Wrapped: ${await response.text()}`)
		}

		const handler: Handler = async () => new Response('Content')
		const composed = sequence(m1)(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())
		expect(await response!.text()).toBe('Wrapped: Content')
	})

	test('middleware can short-circuit', async () => {
		const order: number[] = []

		const authMiddleware: Middleware = async (next) => {
			order.push(1)
			// Simulate auth failure - short circuit
			return new Response('Unauthorized', { status: 401 })
		}

		const m2: Middleware = async (next) => {
			order.push(2)
			return next()
		}

		const handler: Handler = async () => {
			order.push(3)
			return new Response('OK')
		}

		const composed = sequence(authMiddleware, m2)(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(order).toEqual([1]) // Only first middleware ran
		expect(response!.status).toBe(401)
	})

	test('middleware can modify response on way out', async () => {
		const addHeader: Middleware = async (next) => {
			const response = await next()
			const newResponse = new Response(response.body, response)
			newResponse.headers.set('X-Custom', 'added')
			return newResponse
		}

		const handler: Handler = async () => new Response('Body')
		const composed = sequence(addHeader)(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(response!.headers.get('X-Custom')).toBe('added')
	})

	test('error propagates correctly', async () => {
		const throwingMiddleware: Middleware = async () => {
			throw new Error('Middleware error')
		}

		const handler: Handler = async () => new Response('OK')
		const composed = sequence(throwingMiddleware)(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		await expect(
			runWithContext(mockEnv, mockCtx, null, () => composed())
		).rejects.toThrow('Middleware error')
	})
})

describe('handle()', () => {
	test('chains handlers with fallthrough', async () => {
		const order: string[] = []

		const h1: Handler = async () => {
			order.push('h1')
			return null // Pass through
		}

		const h2: Handler = async () => {
			order.push('h2')
			return new Response('Handled by h2')
		}

		const h3: Handler = async () => {
			order.push('h3')
			return new Response('Should not reach')
		}

		const composed = handle(h1, h2, h3)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(order).toEqual(['h1', 'h2'])
		expect(await response!.text()).toBe('Handled by h2')
	})

	test('returns null if no handler responds', async () => {
		const h1: Handler = async () => null
		const h2: Handler = async () => null

		const composed = handle(h1, h2)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(response).toBeNull()
	})

	test('works with single handler', async () => {
		const handler: Handler = async () => new Response('Single')
		const composed = handle(handler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(await response!.text()).toBe('Single')
	})

	test('first responding handler wins', async () => {
		const h1: Handler = async () => new Response('First')
		const h2: Handler = async () => new Response('Second')

		const composed = handle(h1, h2)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(await response!.text()).toBe('First')
	})

	test('error propagates from handler', async () => {
		const throwingHandler: Handler = async () => {
			throw new Error('Handler error')
		}

		const composed = handle(throwingHandler)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		await expect(
			runWithContext(mockEnv, mockCtx, null, () => composed())
		).rejects.toThrow('Handler error')
	})
})

describe('resolve() compatibility alias', () => {
	test('preserves handler chaining behavior', async () => {
		const order: string[] = []

		const h1: Handler = async () => {
			order.push('h1')
			return null
		}

		const h2: Handler = async () => {
			order.push('h2')
			return new Response('Handled by h2')
		}

		const composed = resolve(h1, h2)

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(order).toEqual(['h1', 'h2'])
		expect(await response!.text()).toBe('Handled by h2')
	})
})

describe('sequence() + handle() integration', () => {
	test('middleware wraps resolved handlers', async () => {
		const log: string[] = []

		const loggingMiddleware: Middleware = async (next) => {
			log.push('before')
			const response = await next()
			log.push('after')
			return response
		}

		const skipHandler: Handler = async () => {
			log.push('skip')
			return null
		}

		const actualHandler: Handler = async () => {
			log.push('actual')
			return new Response('Done')
		}

		const composed = sequence(loggingMiddleware)(handle(skipHandler, actualHandler))

		const mockEnv = {}
		const mockCtx = createMockCtx()

		const response = await runWithContext(mockEnv, mockCtx, null, () => composed())

		expect(log).toEqual(['before', 'skip', 'actual', 'after'])
		expect(await response!.text()).toBe('Done')
	})
})

describe('request-wide fetch middleware', () => {
	test('sequence(handle1, handle2) resolves in SvelteKit order', async () => {
		const order: string[] = []

		const handle1: FetchMiddleware = async (event, resolve) => {
			order.push('handle1-before')
			const response = await resolve(event)
			order.push('handle1-after')
			return response
		}

		const handle2: FetchMiddleware = async (event, resolve) => {
			order.push('handle2-before')
			const response = await resolve(event)
			order.push('handle2-after')
			return response
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/items'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return sequence(handle1, handle2)(fetchEvent, async () => {
				order.push('GET')
				return new Response('OK')
			})
		})

		expect(order).toEqual([
			'handle1-before',
			'handle2-before',
			'GET',
			'handle2-after',
			'handle1-after'
		])
		expect(await response.text()).toBe('OK')
	})

	test('rejects modules that export both named handle and named fetch', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api'),
			{},
			createMockCtx()
		)

		await expect(runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule({
				handle: sequence(async (event, resolve) => resolve(event)),
				async fetch() {
					return new Response('fetch-response')
				}
			}, fetchEvent)
		})).rejects.toThrow('Export exactly one primary fetch entry per module')
	})

	test('rejects default export objects that expose both handle and fetch', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api'),
			{},
			createMockCtx()
		)

		await expect(runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule({
				default: {
					handle: sequence(async (event, resolve) => resolve(event)),
					async fetch() {
						return new Response('fetch-response')
					}
				}
			}, fetchEvent)
		})).rejects.toThrow('Export exactly one primary fetch entry per module')
	})

	test('named handle resolves to HTTP method exports', async () => {
		const order: string[] = []

		const handle1: FetchMiddleware = async (event, resolve) => {
			order.push('handle1-before')
			const response = await resolve(event)
			order.push('handle1-after')
			return response
		}

		const handle2: FetchMiddleware = async (event, resolve) => {
			order.push('handle2-before')
			const response = await resolve(event)
			order.push('handle2-after')
			return response
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/users', { method: 'GET' }),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule({
				handle: sequence(handle1, handle2),
				async GET() {
					order.push('GET')
					return new Response('method-response')
				}
			}, fetchEvent)
		})

		expect(order).toEqual([
			'handle1-before',
			'handle2-before',
			'GET',
			'handle2-after',
			'handle1-after'
		])
		expect(await response.text()).toBe('method-response')
	})

	test('named fetch can be a single exported middleware chain', async () => {
		const order: string[] = []

		const handle1: FetchMiddleware = async (event, resolve) => {
			order.push('handle-before')
			const response = await resolve(event)
			order.push('handle-after')
			return response
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/health', { method: 'GET' }),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule({
				fetch: sequence(handle1, async () => {
					order.push('fetch')
					return new Response('ok')
				})
			}, fetchEvent)
		})

		expect(order).toEqual(['handle-before', 'fetch', 'handle-after'])
		expect(await response.text()).toBe('ok')
	})

	test('legacy two-parameter fetch(request, env) still works', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/legacy'),
			{ message: 'legacy-ok' },
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule({
				default: {
					async fetch(_request: Request, env: { message: string }) {
						return new Response(env.message)
					}
				}
			}, fetchEvent)
		})

		expect(await response.text()).toBe('legacy-ok')
	})
})
