// =============================================================================
// Middleware System Tests — sequence() and fetch module dispatch
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	type FetchEvent,
	createFetchEvent,
	runWithEventContext
} from '../../../src/runtime/context'
import {
	type FetchMiddleware,
	type ResolveFetch,
	assertExplicitQueueHandlerStyle,
	assertExplicitScheduledHandlerStyle,
	createResolveFetch,
	defineFetchHandler,
	defineQueueHandler,
	defineScheduledHandler,
	invokeFetchHandler,
	invokeFetchModule,
	markResolveStyle,
	markWorkerStyle,
	resolveFetchHandler,
	sequence
} from '../../../src/runtime/middleware'

function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => {},
		passThroughOnException: () => {},
		props: {}
	} as ExecutionContext
}

describe('sequence()', () => {
	test('executes middlewares in order', async () => {
		const order: string[] = []

		const middleware1: FetchMiddleware = async (event, resolve) => {
			order.push('m1-before')
			const response = await resolve(event)
			order.push('m1-after')
			return response
		}

		const middleware2: FetchMiddleware = async (event, resolve) => {
			order.push('m2-before')
			const response = await resolve(event)
			order.push('m2-after')
			return response
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/items'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return sequence(middleware1, middleware2)(fetchEvent, async () => {
				order.push('leaf')
				return new Response('OK')
			})
		})

		expect(order).toEqual(['m1-before', 'm2-before', 'leaf', 'm2-after', 'm1-after'])
		expect(await response.text()).toBe('OK')
	})

	test('passes through when no middleware is configured', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/direct'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return sequence()(fetchEvent, async () => new Response('Direct'))
		})

		expect(await response.text()).toBe('Direct')
	})

	test('can short-circuit the chain', async () => {
		const order: string[] = []

		const authMiddleware: FetchMiddleware = async () => {
			order.push('auth')
			return new Response('Unauthorized', { status: 401 })
		}

		const skippedMiddleware: FetchMiddleware = async (event, resolve) => {
			order.push('skipped')
			return resolve(event)
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/secure'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return sequence(authMiddleware, skippedMiddleware)(fetchEvent, async () => {
				order.push('leaf')
				return new Response('OK')
			})
		})

		expect(order).toEqual(['auth'])
		expect(response.status).toBe(401)
	})

	test('can modify the response on the way out', async () => {
		const addHeader: FetchMiddleware = async (event, resolve) => {
			const response = await resolve(event)
			const wrapped = new Response(response.body, response)
			wrapped.headers.set('X-Custom', 'added')
			return wrapped
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/body'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return sequence(addHeader)(fetchEvent, async () => new Response('Body'))
		})

		expect(response.headers.get('X-Custom')).toBe('added')
	})

	test('propagates errors', async () => {
		const throwingMiddleware: FetchMiddleware = async () => {
			throw new Error('Middleware error')
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/error'),
			{},
			createMockCtx()
		)

		await expect(
			runWithEventContext(fetchEvent, async () => {
				return sequence(throwingMiddleware)(fetchEvent, async () => new Response('OK'))
			})
		).rejects.toThrow('Middleware error')
	})
})

describe('resolveFetchHandler()', () => {
	test('returns null when the module only exports method handlers', () => {
		expect(
			resolveFetchHandler({
				async GET() {
					return new Response('ok')
				}
			})
		).toBeNull()
	})

	test('returns the primary fetch entry when one is present', () => {
		const fetch = async () => new Response('ok')
		expect(resolveFetchHandler({ fetch })).toBe(fetch)
	})
})

describe('invokeFetchHandler()', () => {
	test('supports resolve-style handlers', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/resolve-style'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(
				defineFetchHandler(
					async (event: any, resolve: any) => {
						const downstream = await resolve(event)
						return new Response(`wrapped:${await downstream.text()}`)
					},
					{ style: 'resolve' }
				),
				fetchEvent,
				async () => new Response('ok')
			)
		})

		expect(await response.text()).toBe('wrapped:ok')
	})

	test('invokes event handlers without a resolve callback', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/items/123'),
			{},
			createMockCtx(),
			{ params: { id: '123' } }
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(async (event: any) => {
				return new Response(event.params.id)
			}, fetchEvent)
		})

		expect(await response.text()).toBe('123')
	})

	test('invokes worker-style request/env/ctx handlers', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/worker-style', { method: 'POST' }),
			{ message: 'ok' },
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(async (request: any, env: any, ctx: any) => {
				return new Response(`${request.method}:${env.message}:${typeof ctx.waitUntil}`)
			}, fetchEvent)
		})

		expect(await response.text()).toBe('POST:ok:function')
	})
})

describe('createResolveFetch()', () => {
	test('dispatches to matching method exports', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/users', { method: 'GET' }),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			const resolve = createResolveFetch(
				{
					async GET() {
						return new Response('method-response')
					}
				},
				null,
				fetchEvent
			)

			return resolve(fetchEvent)
		})

		expect(await response.text()).toBe('method-response')
	})

	test('reuses GET for HEAD without a response body', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/head', { method: 'HEAD' }),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			const resolve = createResolveFetch(
				{
					async GET() {
						return new Response('body')
					}
				},
				null,
				fetchEvent
			)

			return resolve(fetchEvent)
		})

		expect(response.status).toBe(200)
		expect(await response.text()).toBe('')
	})

	test('passes route params via event.params for 1-arg method handlers', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/users/42', { method: 'GET' }),
			{},
			createMockCtx(),
			{ params: { id: '42' } }
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			const resolve = createResolveFetch(
				{
					async GET(event: FetchEvent & { params: { id: string } }) {
						return new Response(event.params.id)
					}
				},
				null,
				fetchEvent
			)

			return resolve(fetchEvent)
		})

		expect(await response.text()).toBe('42')
	})

	test('supports worker-style method handlers with request/env/ctx', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/worker-style', { method: 'GET' }),
			{ message: 'ok' },
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			const resolve = createResolveFetch(
				{
					async GET(request: any, env: any, ctx: any) {
						return new Response(`${request.method}:${env.message}:${typeof ctx.waitUntil}`)
					}
				},
				null,
				fetchEvent
			)

			return resolve(fetchEvent)
		})

		expect(await response.text()).toBe('GET:ok:function')
	})
})

describe('invokeFetchModule()', () => {
	test('rejects modules that export both named handle and named fetch', async () => {
		const fetchEvent = createFetchEvent(new Request('https://example.com/api'), {}, createMockCtx())

		await expect(
			runWithEventContext(fetchEvent, async () => {
				return invokeFetchModule(
					{
						handle: sequence(async (event, resolve) => resolve(event)),
						async fetch() {
							return new Response('fetch-response')
						}
					},
					fetchEvent
				)
			})
		).rejects.toThrow('Export exactly one primary fetch entry per module')
	})

	test('rejects default export objects that expose both handle and fetch', async () => {
		const fetchEvent = createFetchEvent(new Request('https://example.com/api'), {}, createMockCtx())

		await expect(
			runWithEventContext(fetchEvent, async () => {
				return invokeFetchModule(
					{
						default: {
							handle: sequence(async (event, resolve) => resolve(event)),
							async fetch() {
								return new Response('fetch-response')
							}
						}
					},
					fetchEvent
				)
			})
		).rejects.toThrow('Export exactly one primary fetch entry per module')
	})

	test('uses named handle to wrap HTTP method exports', async () => {
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
			return invokeFetchModule(
				{
					handle: sequence(handle1, handle2),
					async GET() {
						order.push('GET')
						return new Response('method-response')
					}
				},
				fetchEvent
			)
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

	test('supports a named fetch export as the primary module entry', async () => {
		const order: string[] = []

		const middleware: FetchMiddleware = async (event, resolve) => {
			order.push('before')
			const response = await resolve(event)
			order.push('after')
			return response
		}

		const fetchEvent = createFetchEvent(
			new Request('https://example.com/health', { method: 'GET' }),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule(
				{
					fetch: sequence(middleware, async () => {
						order.push('fetch')
						return new Response('ok')
					})
				},
				fetchEvent
			)
		})

		expect(order).toEqual(['before', 'fetch', 'after'])
		expect(await response.text()).toBe('ok')
	})

	test('supports a worker-style named fetch(request, env) export as the primary module entry', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/worker-style-module', { method: 'PATCH' }),
			{ message: 'ok' },
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule(
				{
					fetch: defineFetchHandler(
						async (request: any, env: any) => {
							return new Response(`${request.method}:${env.message}`)
						},
						{ style: 'worker' }
					)
				},
				fetchEvent
			)
		})

		expect(await response.text()).toBe('PATCH:ok')
	})

	test('supports a default fetch(event) export', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/default-fetch'),
			{ message: 'ok' },
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule(
				{
					default: {
						async fetch(event: typeof fetchEvent) {
							return new Response(event.env.message)
						}
					}
				},
				fetchEvent
			)
		})

		expect(await response.text()).toBe('ok')
	})

	test('returns 404 when the module exposes no primary entry or method handler', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/missing'),
			{},
			createMockCtx()
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchModule({}, fetchEvent)
		})

		expect(response.status).toBe(404)
		expect(await response.text()).toBe('Not Found')
	})
})

describe('R1-strict: 2-arg fetch handlers require explicit style', () => {
	test('throws when an unmarked 2-arg handler is invoked via invokeFetchHandler', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/ambiguous'),
			{},
			createMockCtx()
		)

		const handler = async (event: FetchEvent, resolve: ResolveFetch) => resolve(event)

		await expect(
			runWithEventContext(fetchEvent, async () =>
				invokeFetchHandler(handler, fetchEvent, async () => new Response('ok'))
			)
		).rejects.toThrow(/Ambiguous 2-argument fetch handler/)
	})

	test('throws when an unmarked 2-arg method handler is dispatched via createResolveFetch', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/items/9', { method: 'GET' }),
			{},
			createMockCtx(),
			{ params: { id: '9' } }
		)

		const moduleHandlers = {
			async GET(_event: any, _params: { id: string }) {
				return new Response('unreachable')
			}
		}

		await expect(
			runWithEventContext(fetchEvent, async () => {
				const resolve = createResolveFetch(moduleHandlers, null, fetchEvent)
				return resolve(fetchEvent)
			})
		).rejects.toThrow(/Ambiguous 2-argument fetch handler/)
	})

	test('accepts a marked resolve-style 2-arg handler', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/marked-resolve'),
			{},
			createMockCtx()
		)

		const handler = defineFetchHandler(
			async (event: FetchEvent, resolve: ResolveFetch) => resolve(event),
			{ style: 'resolve' }
		)

		const response = await runWithEventContext(fetchEvent, async () =>
			invokeFetchHandler(handler, fetchEvent, async () => new Response('ok'))
		)

		expect(await response.text()).toBe('ok')
	})

	test('accepts a marked worker-style 2-arg handler', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/marked-worker', { method: 'POST' }),
			{ message: 'hi' },
			createMockCtx()
		)

		const handler = defineFetchHandler(
			async (request: any, env: any) => new Response(`${request.method}:${env.message}`),
			{ style: 'worker' }
		)

		const response = await runWithEventContext(fetchEvent, async () =>
			invokeFetchHandler(handler, fetchEvent, async () => new Response('fallback'))
		)

		expect(await response.text()).toBe('POST:hi')
	})

	test('markWorkerStyle alone is sufficient for 2-arg worker handlers', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/marked-worker-bare'),
			{ id: 1 },
			createMockCtx()
		)

		const handler = markWorkerStyle(async (_request: any, env: any) => new Response(String(env.id)))

		const response = await runWithEventContext(fetchEvent, async () =>
			invokeFetchHandler(handler, fetchEvent, async () => new Response('fallback'))
		)

		expect(await response.text()).toBe('1')
	})

	test('markResolveStyle alone is sufficient for 2-arg resolve handlers', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/marked-resolve-bare'),
			{},
			createMockCtx()
		)

		const handler = markResolveStyle(async (event: FetchEvent, resolve: ResolveFetch) =>
			resolve(event)
		)

		const response = await runWithEventContext(fetchEvent, async () =>
			invokeFetchHandler(handler, fetchEvent, async () => new Response('inner'))
		)

		expect(await response.text()).toBe('inner')
	})
})

describe('R1-strict: 2-arg queue handlers require explicit style', () => {
	test('throws when an unmarked 2-arg queue handler is asserted', () => {
		const handler = async (_batch: unknown, _env: unknown) => {}

		expect(() => assertExplicitQueueHandlerStyle(handler)).toThrow(
			/Ambiguous 2-argument queue handler/
		)
	})

	test('accepts a 1-arg queue handler', () => {
		const handler = async (_event: unknown) => {}

		expect(() => assertExplicitQueueHandlerStyle(handler)).not.toThrow()
	})

	test('accepts a 3-arg queue handler', () => {
		const handler = async (_batch: unknown, _env: unknown, _ctx: unknown) => {}

		expect(() => assertExplicitQueueHandlerStyle(handler)).not.toThrow()
	})

	test('accepts a marked 2-arg queue handler via defineQueueHandler', () => {
		const handler = defineQueueHandler(async (_batch: unknown, _env: unknown) => {})

		expect(() => assertExplicitQueueHandlerStyle(handler)).not.toThrow()
	})
})

describe('R1-strict: 2-arg scheduled handlers require explicit style', () => {
	test('throws when an unmarked 2-arg scheduled handler is asserted', () => {
		const handler = async (_controller: unknown, _env: unknown) => {}

		expect(() => assertExplicitScheduledHandlerStyle(handler)).toThrow(
			/Ambiguous 2-argument scheduled handler/
		)
	})

	test('accepts a 1-arg scheduled handler', () => {
		const handler = async (_event: unknown) => {}

		expect(() => assertExplicitScheduledHandlerStyle(handler)).not.toThrow()
	})

	test('accepts a 3-arg scheduled handler', () => {
		const handler = async (_controller: unknown, _env: unknown, _ctx: unknown) => {}

		expect(() => assertExplicitScheduledHandlerStyle(handler)).not.toThrow()
	})

	test('accepts a marked 2-arg scheduled handler via defineScheduledHandler', () => {
		const handler = defineScheduledHandler(async (_controller: unknown, _env: unknown) => {})

		expect(() => assertExplicitScheduledHandlerStyle(handler)).not.toThrow()
	})
})
