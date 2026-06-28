import { describe, expect, test } from 'bun:test'
import { createFetchEvent, runWithEventContext } from '../../../src/runtime/context'
import { type FetchMiddleware, invokeFetchModule, sequence } from '../../../src/runtime/middleware'
import {
	createRouteResolve,
	invokeRouteModules,
	matchFetchRoute
} from '../../../src/runtime/router'
import type { RouteModuleDefinition } from '../../../src/runtime/router/types'

function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => {},
		passThroughOnException: () => {},
		props: {}
	} as ExecutionContext
}

describe('runtime file router', () => {
	test('matches static, dynamic, and rest routes in order of specificity', () => {
		const routes: RouteModuleDefinition[] = [
			{
				filePath: 'src/routes/users/settings.ts',
				routePath: '/users/settings',
				segments: [
					{ type: 'static', value: 'users' },
					{ type: 'static', value: 'settings' }
				],
				module: {}
			},
			{
				filePath: 'src/routes/users/[id].ts',
				routePath: '/users/[id]',
				segments: [
					{ type: 'static', value: 'users' },
					{ type: 'param', name: 'id' }
				],
				module: {}
			},
			{
				filePath: 'src/routes/users/[...slug].ts',
				routePath: '/users/[...slug]',
				segments: [
					{ type: 'static', value: 'users' },
					{ type: 'rest', name: 'slug' }
				],
				module: {}
			}
		]

		expect(matchFetchRoute(routes, '/users/settings')?.route.routePath).toBe('/users/settings')
		expect(matchFetchRoute(routes, '/users/42')?.params).toEqual({ id: '42' })
		expect(matchFetchRoute(routes, '/users/42/posts')?.params).toEqual({ slug: '42/posts' })
	})

	test('invokes the matched route module with populated params', async () => {
		const route: RouteModuleDefinition = {
			filePath: 'src/routes/users/[id].ts',
			routePath: '/users/[id]',
			segments: [
				{ type: 'static', value: 'users' },
				{ type: 'param', name: 'id' }
			],
			module: {
				async GET(event: { params: { id: string } }) {
					return new Response(`user:${event.params.id}`)
				}
			}
		}

		const event = createFetchEvent(new Request('https://example.com/users/42'), {}, createMockCtx())

		const response = await runWithEventContext(event, () => invokeRouteModules([route], event))
		expect(await response.text()).toBe('user:42')
	})

	test('lets request-wide fetch middleware wrap matched route modules and read params', async () => {
		const route: RouteModuleDefinition = {
			filePath: 'src/routes/users/[id].ts',
			routePath: '/users/[id]',
			segments: [
				{ type: 'static', value: 'users' },
				{ type: 'param', name: 'id' }
			],
			module: {
				async GET(event: { params: { id: string } }) {
					return new Response(event.params.id)
				}
			}
		}

		const request = new Request('https://example.com/users/42')
		const initialMatch = matchFetchRoute([route], request)
		const event = createFetchEvent(request, {}, createMockCtx(), {
			params: initialMatch?.params ?? {}
		})

		const middleware: FetchMiddleware = async (activeEvent, resolve) => {
			expect(activeEvent.params.id).toBe('42')
			const response = await resolve(activeEvent)
			const next = new Response(response.body, response)
			next.headers.set('x-route-id', activeEvent.params.id)
			return next
		}

		const response = await runWithEventContext(event, () =>
			invokeFetchModule(
				{
					handle: sequence(middleware)
				},
				event,
				createRouteResolve([route], event)
			)
		)

		expect(await response.text()).toBe('42')
		expect(response.headers.get('x-route-id')).toBe('42')
	})
})
