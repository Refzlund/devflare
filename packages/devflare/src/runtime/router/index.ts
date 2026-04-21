// =============================================================================
// Runtime File Router
// =============================================================================

import type { RouteMatchResult, RouteModuleDefinition, RouteSegment } from './types'
import { createFetchEvent, runWithEventContext, type FetchEvent } from '../context'
import { invokeFetchModule, type ResolveFetch } from '../middleware'

function normalizePathname(pathname: string): string {
	if (!pathname || pathname === '/') {
		return '/'
	}

	const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
	const trimmed = normalized.replace(/\/+$|\/+$/g, '')
	return trimmed === '' ? '/' : trimmed
}

function decodePathSegment(segment: string): string {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

function getPathSegments(pathname: string): string[] {
	const normalizedPathname = normalizePathname(pathname)
	if (normalizedPathname === '/') {
		return []
	}

	return normalizedPathname
		.slice(1)
		.split('/')
		.filter(Boolean)
		.map(decodePathSegment)
}

function getMatchPathname(input: Request | URL | string): string {
	if (input instanceof Request) {
		return new URL(input.url).pathname
	}

	if (input instanceof URL) {
		return input.pathname
	}

	if (input.includes('://')) {
		return new URL(input).pathname
	}

	return input
}

function matchRouteSegments(
	routeSegments: readonly RouteSegment[],
	pathnameSegments: readonly string[]
): Record<string, string> | null {
	if (routeSegments.length === 0) {
		return pathnameSegments.length === 0 ? {} : null
	}

	const params: Record<string, string> = {}
	let routeIndex = 0
	let pathIndex = 0

	while (routeIndex < routeSegments.length) {
		const routeSegment = routeSegments[routeIndex]

		if (routeSegment.type === 'optional-rest') {
			params[routeSegment.name] = pathnameSegments.slice(pathIndex).join('/')
			pathIndex = pathnameSegments.length
			routeIndex += 1
			continue
		}

		if (routeSegment.type === 'rest') {
			if (pathIndex >= pathnameSegments.length) {
				return null
			}

			params[routeSegment.name] = pathnameSegments.slice(pathIndex).join('/')
			pathIndex = pathnameSegments.length
			routeIndex += 1
			continue
		}

		const pathnameSegment = pathnameSegments[pathIndex]
		if (pathnameSegment === undefined) {
			return null
		}

		if (routeSegment.type === 'static') {
			if (pathnameSegment !== routeSegment.value) {
				return null
			}
		} else {
			params[routeSegment.name] = pathnameSegment
		}

		pathIndex += 1
		routeIndex += 1
	}

	if (pathIndex !== pathnameSegments.length) {
		return null
	}

	return params
}

export function matchFetchRoute(
	routes: readonly RouteModuleDefinition[],
	input: Request | URL | string
): RouteMatchResult | null {
	const pathnameSegments = getPathSegments(getMatchPathname(input))

	for (const route of routes) {
		const params = matchRouteSegments(route.segments, pathnameSegments)
		if (params) {
			return {
				route,
				params
			}
		}
	}

	return null
}

export async function invokeRouteModules<TEvent extends FetchEvent>(
	routes: readonly RouteModuleDefinition[],
	event: TEvent
): Promise<Response> {
	const match = matchFetchRoute(routes, event.request)
	if (!match) {
		return new Response('Not Found', { status: 404 })
	}

	const routeEvent = createFetchEvent(event.request, event.env, event.ctx, {
		params: match.params,
		locals: event.locals
	}) as TEvent

	return runWithEventContext(routeEvent, () => invokeFetchModule(match.route.module, routeEvent))
}

export function createRouteResolve<TEvent extends FetchEvent>(
	routes: readonly RouteModuleDefinition[],
	initialEvent: TEvent
): ResolveFetch<TEvent> {
	return async (nextEvent = initialEvent): Promise<Response> => {
		return invokeRouteModules(routes, nextEvent)
	}
}
