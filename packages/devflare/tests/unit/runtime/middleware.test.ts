// =============================================================================
// Middleware System Tests — sequence() and fetch module dispatch
// =============================================================================

import { describe, expect, spyOn, test } from 'bun:test'
import {
	__resetToStringFallbackWarnings,
	createResolveFetch,
	invokeFetchHandler,
	invokeFetchModule,
	resolveFetchHandler,
	sequence,
	type FetchMiddleware
} from '../../../src/runtime/middleware'
import { createFetchEvent, runWithEventContext } from '../../../src/runtime/context'

function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => { },
		passThroughOnException: () => { },
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

		await expect(runWithEventContext(fetchEvent, async () => {
			return sequence(throwingMiddleware)(fetchEvent, async () => new Response('OK'))
		})).rejects.toThrow('Middleware error')
	})
})

describe('resolveFetchHandler()', () => {
	test('returns null when the module only exports method handlers', () => {
		expect(resolveFetchHandler({
			async GET() {
				return new Response('ok')
			}
		})).toBeNull()
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
			return invokeFetchHandler(async (event: any, resolve: any) => {
				const downstream = await resolve(event)
				return new Response(`wrapped:${await downstream.text()}`)
			}, fetchEvent, async () => new Response('ok'))
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
			const resolve = createResolveFetch({
				async GET() {
					return new Response('method-response')
				}
			}, null, fetchEvent)

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
			const resolve = createResolveFetch({
				async GET() {
					return new Response('body')
				}
			}, null, fetchEvent)

			return resolve(fetchEvent)
		})

		expect(response.status).toBe(200)
		expect(await response.text()).toBe('')
	})

	test('passes route params as the second argument to method handlers', async () => {
		const fetchEvent = createFetchEvent(
			new Request('https://example.com/api/users/42', { method: 'GET' }),
			{},
			createMockCtx(),
			{ params: { id: '42' } }
		)

		const response = await runWithEventContext(fetchEvent, async () => {
			const resolve = createResolveFetch({
				async GET(_event: any, params: { id: string }) {
					return new Response(params.id)
				}
			}, null, fetchEvent)

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
			const resolve = createResolveFetch({
				async GET(request: any, env: any, ctx: any) {
					return new Response(`${request.method}:${env.message}:${typeof ctx.waitUntil}`)
				}
			}, null, fetchEvent)

			return resolve(fetchEvent)
		})

		expect(await response.text()).toBe('GET:ok:function')
	})
})

describe('invokeFetchModule()', () => {
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
			return invokeFetchModule({
				fetch: sequence(middleware, async () => {
					order.push('fetch')
					return new Response('ok')
				})
			}, fetchEvent)
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
			return invokeFetchModule({
				async fetch(request: any, env: any) {
					return new Response(`${request.method}:${env.message}`)
				}
			}, fetchEvent)
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
			return invokeFetchModule({
				default: {
					async fetch(event: typeof fetchEvent) {
						return new Response(event.env.message)
					}
				}
			}, fetchEvent)
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

describe('toString() fallback warning', () => {
	test('warns only once per unique handler source even when detection runs multiple times', async () => {
		__resetToStringFallbackWarnings()
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => { })

		try {
			// Unmarked 2-arg handler — triggers the toString() fallback path.
			const handler = async (event: unknown, resolve: (event: unknown) => Promise<Response>) => {
				return resolve(event)
			}

			const fetchEvent = createFetchEvent(
				new Request('https://example.com/toString-warn'),
				{},
				createMockCtx()
			)

			// Invoke detection multiple times on the same handler body.
			await runWithEventContext(fetchEvent, async () => {
				await invokeFetchHandler(handler, fetchEvent, async () => new Response('ok'))
				await invokeFetchHandler(handler, fetchEvent, async () => new Response('ok'))
				await invokeFetchHandler(handler, fetchEvent, async () => new Response('ok'))
			})

			const fallbackWarnings = warnSpy.mock.calls.filter((args) =>
				typeof args[0] === 'string' && args[0].includes('Function.prototype.toString()')
			)
			expect(fallbackWarnings.length).toBe(1)
		} finally {
			warnSpy.mockRestore()
			__resetToStringFallbackWarnings()
		}
	})
})
