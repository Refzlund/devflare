// =============================================================================
// Case 3: Durable Objects - Mixed Local and Cross-Worker Pattern
// =============================================================================
// Demonstrates devflare's patterns for Durable Objects:
//
// LOCAL DOs (this worker):
//   - SESSION: SessionStore for user session data
//   - TRACKER: RequestTracker for analytics
//
// CROSS-WORKER DOs (hosted by do-service):
//   - COUNTER: Counter for counting
//   - RATE_LIMITER: RateLimiter for rate limiting
//
// Pattern:
//   const doService = ref(() => import('./do-service/devflare.config'))
//   bindings: {
//     durableObjects: {
//       SESSION: 'SessionStore',           // Local DO
//       TRACKER: 'RequestTracker',         // Local DO
//       COUNTER: doService.COUNTER,        // Cross-worker DO
//       RATE_LIMITER: doService.RATE_LIMITER  // Cross-worker DO
//     }
//   }
// =============================================================================

import { env } from 'devflare'

/**
 * Main fetch handler
 */
export default async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return new Response('Case 3: Cross-Worker Durable Objects Demo', {
			headers: { 'Content-Type': 'text/plain' }
		})
	}

	// -------------------------------------------------------------------------
	// LOCAL DO ROUTES: Session management
	// -------------------------------------------------------------------------
	if (url.pathname.startsWith('/session/')) {
		const parts = url.pathname.split('/')
		const sessionId = parts[2]
		const action = parts[3] || 'info'

		const id = env.SESSION.idFromName(sessionId)
		const session = env.SESSION.get(id)

		if (action === 'get') {
			const key = parts[4]
			const value = await session.getValue(key)
			return Response.json({ value })
		}

		if (action === 'set') {
			const key = parts[4]
			const value = url.searchParams.get('value')
			await session.setValue(key, value)
			return Response.json({ ok: true })
		}

		if (action === 'clear') {
			await session.clearAll()
			return Response.json({ ok: true })
		}

		if (action === 'info') {
			const metadata = await session.getMetadata()
			return Response.json(metadata)
		}

		return new Response('Unknown action', { status: 400 })
	}

	// -------------------------------------------------------------------------
	// LOCAL DO ROUTES: Request tracking
	// -------------------------------------------------------------------------
	if (url.pathname.startsWith('/track/')) {
		const trackerId = url.pathname.slice(7)

		const id = env.TRACKER.idFromName('global')
		const tracker = env.TRACKER.get(id)

		const result = await tracker.trackRequest(trackerId)
		return Response.json(result)
	}

	if (url.pathname === '/stats') {
		const id = env.TRACKER.idFromName('global')
		const tracker = env.TRACKER.get(id)

		const stats = await tracker.getAllPathStats()
		return Response.json(stats)
	}

	// -------------------------------------------------------------------------
	// CROSS-WORKER DO ROUTES: Counter (hosted by do-service)
	// -------------------------------------------------------------------------
	if (url.pathname.startsWith('/counter/')) {
		const parts = url.pathname.split('/')
		const name = parts[2]
		const action = parts[3] || 'value'

		const id = env.COUNTER.idFromName(name)
		const counter = env.COUNTER.get(id)

		if (action === 'value') {
			const value = await counter.getValue()
			return Response.json({ value })
		}

		if (action === 'increment') {
			const value = await counter.increment()
			return Response.json({ value })
		}

		if (action === 'decrement') {
			const value = await counter.decrement()
			return Response.json({ value })
		}

		if (action === 'reset') {
			await counter.reset()
			return Response.json({ value: 0 })
		}

		return new Response('Unknown action', { status: 400 })
	}

	// -------------------------------------------------------------------------
	// CROSS-WORKER DO ROUTES: Rate Limiter (hosted by do-service)
	// -------------------------------------------------------------------------
	if (url.pathname.startsWith('/ratelimit/')) {
		const key = url.pathname.slice(11)

		const id = env.RATE_LIMITER.idFromName(key)
		const limiter = env.RATE_LIMITER.get(id)

		const limited = await limiter.checkLimit(10, 60000)

		if (limited) {
			return new Response('Rate limited', {
				status: 429,
				headers: {
					'X-RateLimit-Remaining': '0',
					'Retry-After': '60'
				}
			})
		}

		const remaining = await limiter.getRemaining(10)
		return Response.json(
			{ ok: true, remaining },
			{
				headers: {
					'X-RateLimit-Remaining': remaining.toString()
				}
			}
		)
	}

	return new Response('Not found', { status: 404 })
}
