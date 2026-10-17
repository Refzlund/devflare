// =============================================================================
// Case 7: Edge Cases & Advanced Patterns - Fetch Handler
// =============================================================================
// Demonstrates error handling, streaming, and advanced response patterns
// Using devflare's file-based patterns
// =============================================================================

interface Env {
	CACHE: KVNamespace
}

/**
 * Main fetch handler
 * Demonstrates edge cases and advanced patterns
 */
export default async function fetch(
	request: Request,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json({
			name: 'Case 7: Edge Cases',
			endpoints: [
				'/stream',
				'/error',
				'/error-handled',
				'/timeout?ms=1000',
				'POST /echo',
				'/headers',
				'/redirect?to=/',
				'/cache-api'
			]
		})
	}

	// Route: GET /stream - Streaming response
	if (url.pathname === '/stream') {
		const stream = new ReadableStream({
			async start(controller) {
				for (let i = 0; i < 5; i++) {
					controller.enqueue(new TextEncoder().encode(`chunk ${i}\n`))
					await new Promise((r) => setTimeout(r, 100))
				}
				controller.close()
			}
		})

		return new Response(stream, {
			headers: { 'Content-Type': 'text/plain' }
		})
	}

	// Route: GET /error - Intentional error
	if (url.pathname === '/error') {
		throw new Error('Intentional error for testing')
	}

	// Route: GET /error-handled - Handled error
	if (url.pathname === '/error-handled') {
		try {
			throw new Error('Handled error')
		} catch (error) {
			return Response.json(
				{
					error: 'Something went wrong',
					message: error instanceof Error ? error.message : 'Unknown'
				},
				{ status: 500 }
			)
		}
	}

	// Route: GET /timeout - Simulated timeout
	if (url.pathname === '/timeout') {
		const timeout = parseInt(url.searchParams.get('ms') || '5000')
		await new Promise((r) => setTimeout(r, timeout))
		return new Response('Completed after delay')
	}

	// Route: POST /echo - Echo request body
	if (url.pathname === '/echo' && request.method === 'POST') {
		const body = await request.text()
		return new Response(body, {
			headers: {
				'Content-Type': request.headers.get('Content-Type') || 'text/plain'
			}
		})
	}

	// Route: GET /headers - Return all headers
	if (url.pathname === '/headers') {
		const headers: Record<string, string> = {}
		request.headers.forEach((value, key) => {
			headers[key] = value
		})
		return Response.json({ headers })
	}

	// Route: GET /redirect - Redirect example
	if (url.pathname === '/redirect') {
		const target = url.searchParams.get('to') || '/'
		return Response.redirect(new URL(target, request.url).toString(), 302)
	}

	// Route: GET /cache-api - Using Cache API
	if (url.pathname === '/cache-api') {
		const cacheKey = new Request(request.url)
		// caches.default is Cloudflare-specific, cast for type safety
		const cache = (caches as unknown as { default: Cache }).default

		// Try cache first
		let response = await cache.match(cacheKey)
		if (response) {
			return new Response(response.body, {
				headers: {
					...Object.fromEntries(response.headers),
					'X-Cache': 'HIT'
				}
			})
		}

		// Generate response
		response = Response.json({
			generated: Date.now(),
			cached: true
		})

		// Cache for 60 seconds
		response.headers.set('Cache-Control', 'max-age=60')
		ctx.waitUntil(cache.put(cacheKey, response.clone()))

		return new Response(response.body, {
			headers: {
				...Object.fromEntries(response.headers),
				'X-Cache': 'MISS'
			}
		})
	}

	return new Response('Not found', { status: 404 })
}
