// =============================================================================
// Worker Test Helper — Trigger fetch handlers in Bun tests
// =============================================================================
// Usage:
//   import { cf } from 'devflare/test'
//
//   // Trigger the fetch handler with a request
//   const response = await cf.worker.fetch(new Request('http://localhost/api'))
//
//   // Shorthand for GET requests
//   const response = await cf.worker.get('/api/users')
//
//   // Shorthand for POST requests
//   const response = await cf.worker.post('/api/users', { name: 'Alice' })
// =============================================================================

import { join } from 'path'
import {
	createFetchEvent,
	createRouteResolve,
	invokeFetchModule,
	matchFetchRoute,
	resolveFetchHandler,
	runWithEventContext
} from '../runtime'
import type { RouteSegment } from '../runtime/router/types'
import { createTrackedTestExecutionContext } from './execution-context'
import type { WaitUntilScope } from './wait-until-tracker'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface WorkerFetchOptions {
	/** Request method (default: GET) */
	method?: string
	/** Request headers */
	headers?: Record<string, string>
	/** Request body (will be JSON-serialized if object) */
	body?: unknown
}

// -----------------------------------------------------------------------------
// Global State (set by createTestContext)
// -----------------------------------------------------------------------------

let fetchHandlerPath: string | null = null
let configDir: string | null = null
let testEnvGetter: (() => Record<string, unknown>) | null = null
/** The live context's waitUntil scope, which each request captures when it starts. */
let waitUntilScope: WaitUntilScope | null = null
let fileRoutes: Array<{
	filePath: string
	routePath: string
	segments: readonly RouteSegment[]
}> = []

// -----------------------------------------------------------------------------
// Configuration (called by createTestContext)
// -----------------------------------------------------------------------------

/**
 * Configure the worker test helper
 * @internal Called by createTestContext to set up handler path and env
 */
export function configureWorker(options: {
	handlerPath: string | null
	routes?: Array<{
		filePath: string
		routePath: string
		segments: readonly RouteSegment[]
	}>
	configDir: string
	getEnv: () => Record<string, unknown>
	/** Where the context collects the waitUntil work its env.dispose() drains. */
	waitUntilScope: WaitUntilScope
}): void {
	fetchHandlerPath = options.handlerPath
	fileRoutes = options.routes ?? []
	configDir = options.configDir
	testEnvGetter = options.getEnv
	waitUntilScope = options.waitUntilScope
}

/**
 * Reset worker helper state
 * @internal Called when test context is disposed
 */
export function resetWorkerState(): void {
	fetchHandlerPath = null
	fileRoutes = []
	configDir = null
	testEnvGetter = null
	waitUntilScope = null
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Trigger the fetch handler with a request.
 * This directly invokes the fetch handler function from your config.
 *
 * @param request - Request object or URL string
 * @param options - Optional fetch options (method, headers, body)
 * @returns Response from the handler
 *
 * @example
 * ```ts
 * // With Request object
 * const response = await cf.worker.fetch(new Request('http://localhost/api'))
 *
 * // With URL string
 * const response = await cf.worker.fetch('http://localhost/api')
 *
 * // With options
 * const response = await cf.worker.fetch('/api/users', {
 *   method: 'POST',
 *   body: { name: 'Alice' }
 * })
 * ```
 */
async function fetch(request: Request | string, options?: WorkerFetchOptions): Promise<Response> {
	if (!fetchHandlerPath && fileRoutes.length === 0) {
		throw new Error(
			'Fetch handler not configured. Make sure your devflare.config.ts has files.fetch set or a routes directory is available, ' +
				'and that the corresponding files exist (defaults: src/fetch.ts and src/routes/**).'
		)
	}

	if (!configDir || !testEnvGetter || !waitUntilScope) {
		throw new Error(
			'Worker helper not initialized. Call createTestContext() before using cf.worker.fetch()'
		)
	}

	const workerConfigDir = configDir
	const getEnv = testEnvGetter
	// Captured now, so work a request registers stays with the context it started in.
	const scope = waitUntilScope

	// Normalize request
	let req: Request
	if (typeof request === 'string') {
		const url = request.startsWith('http')
			? request
			: `http://localhost${request.startsWith('/') ? '' : '/'}${request}`
		const headers = new Headers(options?.headers)

		let body: BodyInit | undefined
		if (options?.body !== undefined) {
			if (typeof options.body === 'string') {
				body = options.body
			} else {
				body = JSON.stringify(options.body)
				if (!headers.has('Content-Type')) {
					headers.set('Content-Type', 'application/json')
				}
			}
		}

		req = new Request(url, {
			method: options?.method ?? 'GET',
			headers,
			body
		})
	} else {
		req = request
	}

	// Import the fetch handler
	const handlerModule = fetchHandlerPath
		? await import(join(workerConfigDir, fetchHandlerPath))
		: {}
	const routeModules = await Promise.all(
		fileRoutes.map(async (route) => {
			return {
				...route,
				module: await import(join(workerConfigDir, route.filePath))
			}
		})
	)

	const methodExports = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'ALL']
	const hasMethodHandler = methodExports.some((method) => {
		return (
			typeof handlerModule[method] === 'function' ||
			typeof handlerModule.default?.[method] === 'function'
		)
	})

	if (!resolveFetchHandler(handlerModule) && !hasMethodHandler && routeModules.length === 0) {
		throw new Error(
			`Fetch handler at "${fetchHandlerPath}" must export one of:\n` +
				`- request-wide "handle" middleware\n` +
				`- named "fetch"\n` +
				'- default fetch handler\n' +
				`- HTTP method exports such as "GET" or "POST"`
		)
	}

	// The response goes back when the handler resolves, so its waitUntil work
	// is registered in the context's scope rather than awaited here:
	// env.dispose() drains what is still pending before tearing down the
	// bindings it may be using.
	const ctx = createTrackedTestExecutionContext(scope, {
		helper: 'cf.worker.fetch',
		method: req.method,
		url: req.url
	})

	// Get the test env
	const env = getEnv()
	const initialRouteMatch = routeModules.length > 0 ? matchFetchRoute(routeModules, req) : null
	const fetchEvent = createFetchEvent(req, env, ctx, {
		params: initialRouteMatch?.params ?? {}
	})

	// Call the handler
	const response = await runWithEventContext(fetchEvent, () =>
		invokeFetchModule(
			handlerModule,
			fetchEvent,
			routeModules.length > 0 ? createRouteResolve(routeModules, fetchEvent) : undefined
		)
	)

	return response
}

/**
 * Shorthand for GET requests
 */
async function get(path: string, headers?: Record<string, string>): Promise<Response> {
	return fetch(path, { method: 'GET', headers })
}

/**
 * Shorthand for POST requests with JSON body
 */
async function post(
	path: string,
	body?: unknown,
	headers?: Record<string, string>
): Promise<Response> {
	return fetch(path, { method: 'POST', body, headers })
}

/**
 * Shorthand for PUT requests with JSON body
 */
async function put(
	path: string,
	body?: unknown,
	headers?: Record<string, string>
): Promise<Response> {
	return fetch(path, { method: 'PUT', body, headers })
}

/**
 * Shorthand for DELETE requests
 */
async function del(path: string, headers?: Record<string, string>): Promise<Response> {
	return fetch(path, { method: 'DELETE', headers })
}

/**
 * Shorthand for PATCH requests with JSON body
 */
async function patch(
	path: string,
	body?: unknown,
	headers?: Record<string, string>
): Promise<Response> {
	return fetch(path, { method: 'PATCH', body, headers })
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const worker = {
	fetch,
	get,
	post,
	put,
	delete: del,
	patch
}
