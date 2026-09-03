// =============================================================================
// Middleware Detection Tests — minification-safe handler style detection
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { createFetchEvent, runWithEventContext } from '../../../src/runtime/context'
import {
	type FetchMiddleware,
	defineFetchHandler,
	invokeFetchHandler,
	sequence
} from '../../../src/runtime/middleware'

function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => {},
		passThroughOnException: () => {},
		props: {}
	} as ExecutionContext
}

function createEvent(url = 'https://example.com/') {
	return createFetchEvent(new Request(url), { FOO: 'bar' }, createMockCtx())
}

function simulateMinification<T extends (...args: any[]) => any>(fn: T): T {
	Object.defineProperty(fn, 'name', { value: 'o', configurable: true })
	Object.defineProperty(fn, 'toString', { value: () => '', configurable: true })
	return fn
}

describe('middleware detection', () => {
	test('sequence() produces a resolve-style handler that runs middlewares in order plus a leaf', async () => {
		const order: string[] = []

		const middlewareA: FetchMiddleware = async (event, resolve) => {
			order.push('a-before')
			const response = await resolve(event)
			order.push('a-after')
			return response
		}

		const middlewareB: FetchMiddleware = async (event, resolve) => {
			order.push('b-before')
			const response = await resolve(event)
			order.push('b-after')
			return response
		}

		const composed = sequence(middlewareA, middlewareB)
		const fetchEvent = createEvent()

		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(composed, fetchEvent, async () => {
				order.push('leaf')
				return new Response('leaf-ok')
			})
		})

		expect(order).toEqual(['a-before', 'b-before', 'leaf', 'b-after', 'a-after'])
		expect(await response.text()).toBe('leaf-ok')
	})

	test('3-arg fetch(request, env, ctx) handler is routed worker-style', async () => {
		let seen: { request: Request; env: unknown; ctx: unknown } | null = null

		const handler = (request: Request, env: unknown, ctx: unknown) => {
			seen = { request, env, ctx }
			return new Response('worker-3')
		}

		const fetchEvent = createEvent('https://example.com/three')
		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(handler, fetchEvent)
		})

		expect(await response.text()).toBe('worker-3')
		expect(seen).not.toBeNull()
		expect(seen!.request).toBe(fetchEvent.request)
		expect(seen!.env).toBe(fetchEvent.env)
		expect(seen!.ctx).toBe(fetchEvent.ctx)
	})

	test('2-arg unmarked handler throws under R1-strict (no parameter-name fallback)', async () => {
		const handler = simulateMinification(
			((_a: any, _b: any) => new Response('unreachable')) as (a: any, b: any) => Response
		)

		const fetchEvent = createEvent('https://example.com/two')

		await expect(
			runWithEventContext(fetchEvent, async () => invokeFetchHandler(handler, fetchEvent))
		).rejects.toThrow(/Ambiguous 2-argument fetch handler/)
	})

	test('2-arg handler marked worker-style is routed worker-style even when minified', async () => {
		let seen: { a: unknown; b: unknown } | null = null

		const handler = simulateMinification(
			defineFetchHandler(
				((a: any, b: any) => {
					seen = { a, b }
					return new Response('worker-2')
				}) as (a: any, b: any) => Response,
				{ style: 'worker' }
			)
		)

		const fetchEvent = createEvent('https://example.com/two-marked')
		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(handler, fetchEvent)
		})

		expect(await response.text()).toBe('worker-2')
		expect(seen).not.toBeNull()
		expect(seen!.a).toBe(fetchEvent.request)
		expect(seen!.b).toBe(fetchEvent.env)
	})

	test('2-arg handler marked via defineFetchHandler is routed resolve-style under minification', async () => {
		let called = false

		const raw = (event: any, resolve: any) => {
			called = true
			return resolve(event)
		}
		const handler = simulateMinification(defineFetchHandler(raw, { style: 'resolve' }))

		const fetchEvent = createEvent('https://example.com/marked')
		const response = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(handler, fetchEvent, async () => new Response('from-resolve'))
		})

		expect(called).toBe(true)
		expect(await response.text()).toBe('from-resolve')
	})

	test('0-arg and 1-arg unmarked handlers are NOT routed worker-style', async () => {
		const zeroArg = (() => new Response('zero')) as () => Response
		const oneArg = ((event: any) => {
			// Should receive the FetchEvent, NOT Request/env/ctx spread
			expect(event).toBeDefined()
			expect(event.request).toBeInstanceOf(Request)
			return new Response('one')
		}) as (event: any) => Response

		const fetchEvent = createEvent('https://example.com/low-arity')

		const zeroResponse = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(zeroArg, fetchEvent)
		})
		const oneResponse = await runWithEventContext(fetchEvent, async () => {
			return invokeFetchHandler(oneArg, fetchEvent)
		})

		expect(await zeroResponse.text()).toBe('zero')
		expect(await oneResponse.text()).toBe('one')
	})
})
