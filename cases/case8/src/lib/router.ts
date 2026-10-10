// =============================================================================
// Case 8: File-Based Routing - Router Utility
// =============================================================================
// Demonstrates a simple file-based routing pattern
// =============================================================================

export type RouteHandler = (
	request: Request,
	params: Record<string, string>
) => Promise<Response> | Response

interface Route {
	pattern: RegExp
	handler: RouteHandler
	method: string
}

/**
 * Simple router class for file-based routing demonstration
 */
export class Router {
	private routes: Route[] = []

	/**
	 * Add a GET route
	 */
	get(path: string, handler: RouteHandler): this {
		return this.addRoute('GET', path, handler)
	}

	/**
	 * Add a POST route
	 */
	post(path: string, handler: RouteHandler): this {
		return this.addRoute('POST', path, handler)
	}

	/**
	 * Add a PUT route
	 */
	put(path: string, handler: RouteHandler): this {
		return this.addRoute('PUT', path, handler)
	}

	/**
	 * Add a DELETE route
	 */
	delete(path: string, handler: RouteHandler): this {
		return this.addRoute('DELETE', path, handler)
	}

	/**
	 * Add a route with any method
	 */
	addRoute(method: string, path: string, handler: RouteHandler): this {
		const pattern = this.pathToRegex(path)
		this.routes.push({ pattern, handler, method })
		return this
	}

	/**
	 * Handle an incoming request
	 */
	async handle(request: Request): Promise<Response> {
		const url = new URL(request.url)

		for (const route of this.routes) {
			if (route.method !== request.method) continue

			const match = url.pathname.match(route.pattern)
			if (match) {
				const params = match.groups || {}
				return route.handler(request, params)
			}
		}

		return new Response('Not found', { status: 404 })
	}

	/**
	 * Convert path pattern to regex
	 * Supports :param and [...rest] patterns
	 */
	private pathToRegex(path: string): RegExp {
		const pattern = path
			// Named params: :id -> (?<id>[^/]+)
			.replace(/:(\w+)/g, '(?<$1>[^/]+)')
			// Catch-all: [...rest] -> (?<rest>.*)
			.replace(/\[\.\.\.(.*?)\]/g, '(?<$1>.*)')
			// Static segments
			.replace(/\//g, '\\/')

		return new RegExp(`^${pattern}$`)
	}
}
