// =============================================================================
// Case 5: Multi-Worker & Service Bindings (RPC) - Gateway
// =============================================================================
// Demonstrates devflare's patterns for multi-worker setups with RPC:
// - Service bindings for worker-to-worker RPC calls
// - Type-safe method invocation via WorkerEntrypoint pattern
// 
// See: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
// =============================================================================

/**
 * Gateway worker that routes requests and calls RPC methods on other workers
 */
export default async function fetch(
	request: Request,
	env: DevflareEnv,
	ctx: ExecutionContext
): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json({
			name: 'Case 5: RPC Gateway',
			description: 'Demonstrates Worker RPC via WorkerEntrypoint',
			routes: [
				'GET /add?a=1&b=2',
				'GET /multiply?a=3&b=4',
				'GET /fibonacci?n=10',
				'GET /stats?numbers=1,2,3,4,5'
			]
		})
	}

	// Route: GET /add?a=X&b=Y
	// Calls MATH_SERVICE.add(a, b) via RPC
	if (url.pathname === '/add') {
		const a = parseFloat(url.searchParams.get('a') ?? '0')
		const b = parseFloat(url.searchParams.get('b') ?? '0')

		const result = await env.MATH_SERVICE.add(a, b)
		return Response.json({ operation: 'add', a, b, result })
	}

	// Route: GET /multiply?a=X&b=Y
	// Calls MATH_SERVICE.multiply(a, b) via RPC
	if (url.pathname === '/multiply') {
		const a = parseFloat(url.searchParams.get('a') ?? '0')
		const b = parseFloat(url.searchParams.get('b') ?? '0')

		const result = await env.MATH_SERVICE.multiply(a, b)
		return Response.json({ operation: 'multiply', a, b, result })
	}

	// Route: GET /fibonacci?n=X
	// Calls MATH_SERVICE.fibonacci(n) via RPC
	if (url.pathname === '/fibonacci') {
		const n = parseInt(url.searchParams.get('n') ?? '10', 10)

		const result = await env.MATH_SERVICE.fibonacci(n)
		return Response.json({ operation: 'fibonacci', n, result })
	}

	// Route: GET /stats?numbers=1,2,3,4,5
	// Calls MATH_SERVICE.calculateStats(numbers) via RPC
	if (url.pathname === '/stats') {
		const numbersParam = url.searchParams.get('numbers') ?? ''
		const numbers = numbersParam.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n))

		const stats = await env.MATH_SERVICE.calculateStats(numbers)
		return Response.json({ operation: 'stats', numbers, ...stats })
	}

	return new Response('Not found', { status: 404 })
}
