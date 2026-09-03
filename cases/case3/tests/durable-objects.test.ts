// =============================================================================
// Case 3: Durable Objects - Mixed Local and Cross-Worker Pattern Tests
// =============================================================================
// Tests for both local DOs (SESSION, TRACKER) and cross-worker DOs (COUNTER, RATE_LIMITER).
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
// - Local DOs are plain classes in src/do.*.ts (SessionStore, RequestTracker)
// - Cross-worker DOs are in do-service/src/do.*.ts (Counter, RateLimiter)
// - The test context sets up multi-worker Miniflare automatically
// - Tests call RPC methods via env.BINDING.get(id).method()
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { env } from 'devflare'
import { createTestContext } from 'devflare/test'

// Import fetch handler for route testing
import fetch from '../src/fetch'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

const TEST_CONTEXT_TIMEOUT_MS = 15_000

beforeAll(async () => {
	await createTestContext()
}, TEST_CONTEXT_TIMEOUT_MS)

afterAll(async () => {
	await env.dispose()
}, TEST_CONTEXT_TIMEOUT_MS)

// -----------------------------------------------------------------------------
// Local DO Tests: SessionStore
// -----------------------------------------------------------------------------

describe('Case 3: Local DOs', () => {
	describe('SessionStore DO (local)', () => {
		test('can get DO stub via SESSION binding', async () => {
			const id = env.SESSION.idFromName('test-session')
			const stub = env.SESSION.get(id)
			expect(stub).toBeDefined()
		})

		test('can set and get session values', async () => {
			const id = env.SESSION.idFromName('session-crud')
			const session = env.SESSION.get(id)

			// Set a value
			await session.setValue('username', 'alice')
			await session.setValue('role', 'admin')

			// Get values
			const username = await session.getValue('username')
			const role = await session.getValue('role')

			expect(username).toBe('alice')
			expect(role).toBe('admin')
		})

		test('can delete session values', async () => {
			const id = env.SESSION.idFromName('session-delete')
			const session = env.SESSION.get(id)

			// Set and delete
			await session.setValue('temp', 'value')
			const deleted = await session.deleteValue('temp')
			expect(deleted).toBe(true)

			// Verify deleted
			const value = await session.getValue('temp')
			expect(value).toBe(null)
		})

		test('can clear all session data', async () => {
			const id = env.SESSION.idFromName('session-clear')
			const session = env.SESSION.get(id)

			// Set multiple values
			await session.setValue('a', 1)
			await session.setValue('b', 2)
			await session.setValue('c', 3)

			// Clear
			await session.clearAll()

			// Verify cleared
			const keys = await session.getAllKeys()
			expect(keys).toEqual([])
		})

		test('can get session metadata', async () => {
			const id = env.SESSION.idFromName('session-meta')
			const session = env.SESSION.get(id)

			await session.clearAll()
			await session.setValue('x', 1)
			await session.setValue('y', 2)

			const meta = await session.getMetadata()
			expect(meta.itemCount).toBe(2)
			expect(typeof meta.createdAt).toBe('number')
		})
	})

	describe('RequestTracker DO (local)', () => {
		test('can get DO stub via TRACKER binding', async () => {
			const id = env.TRACKER.idFromName('test-tracker')
			const stub = env.TRACKER.get(id)
			expect(stub).toBeDefined()
		})

		test('tracks request counts', async () => {
			const id = env.TRACKER.idFromName('tracker-counts')
			const tracker = env.TRACKER.get(id)

			await tracker.resetAll()

			// Track requests
			const r1 = await tracker.trackRequest('/api/users')
			expect(r1.total).toBe(1)
			expect(r1.pathCount).toBe(1)

			const r2 = await tracker.trackRequest('/api/users')
			expect(r2.total).toBe(2)
			expect(r2.pathCount).toBe(2)

			const r3 = await tracker.trackRequest('/api/posts')
			expect(r3.total).toBe(3)
			expect(r3.pathCount).toBe(1)
		})

		test('can get path statistics', async () => {
			const id = env.TRACKER.idFromName('tracker-stats')
			const tracker = env.TRACKER.get(id)

			await tracker.resetAll()

			await tracker.trackRequest('/a')
			await tracker.trackRequest('/a')
			await tracker.trackRequest('/b')

			const stats = await tracker.getAllPathStats()
			expect(stats['/a']).toBe(2)
			expect(stats['/b']).toBe(1)
		})

		test('tracks last request timestamp', async () => {
			const id = env.TRACKER.idFromName('tracker-timestamp')
			const tracker = env.TRACKER.get(id)

			await tracker.resetAll()
			expect(await tracker.getLastRequestAt()).toBeNull()

			await tracker.trackRequest('/test')
			const firstAt = await tracker.getLastRequestAt()

			expect(typeof firstAt).toBe('number')

			await tracker.trackRequest('/test')
			const secondAt = await tracker.getLastRequestAt()
			expect(secondAt).toBeGreaterThanOrEqual(firstAt as number)
		})
	})
})

// -----------------------------------------------------------------------------
// Cross-Worker DO Tests: Counter, RateLimiter
// -----------------------------------------------------------------------------

describe('Case 3: Cross-Worker DOs', () => {
	describe('Counter DO (cross-worker)', () => {
		test('can get DO stub via COUNTER binding', async () => {
			const id = env.COUNTER.idFromName('test-counter')
			const stub = env.COUNTER.get(id)
			expect(stub).toBeDefined()
		})

		test('increment increases value via RPC', async () => {
			const id = env.COUNTER.idFromName('rpc-counter-1')
			const counter = env.COUNTER.get(id)

			// Reset first
			await counter.reset()

			// Increment
			const result = await counter.increment(5)
			expect(result).toBe(5)

			// Check value
			const value = await counter.getValue()
			expect(value).toBe(5)

			// Increment again
			const result2 = await counter.increment(3)
			expect(result2).toBe(8)
		})

		test('decrement decreases value via RPC', async () => {
			const id = env.COUNTER.idFromName('rpc-counter-2')
			const counter = env.COUNTER.get(id)

			// Set initial value
			await counter.reset()
			await counter.increment(10)

			// Decrement
			const result = await counter.decrement(3)
			expect(result).toBe(7)
		})

		test('reset clears value via RPC', async () => {
			const id = env.COUNTER.idFromName('rpc-counter-3')
			const counter = env.COUNTER.get(id)

			// Set value and reset
			await counter.increment(100)
			await counter.reset()

			const value = await counter.getValue()
			expect(value).toBe(0)
		})
	})

	describe('RateLimiter DO (cross-worker)', () => {
		test('can get DO stub via RATE_LIMITER binding', async () => {
			const id = env.RATE_LIMITER.idFromName('test-limiter')
			const stub = env.RATE_LIMITER.get(id)
			expect(stub).toBeDefined()
		})

		test('allows requests under limit via RPC', async () => {
			const id = env.RATE_LIMITER.idFromName('rpc-limiter-1')
			const limiter = env.RATE_LIMITER.get(id)

			// Reset first
			await limiter.reset()

			// First request should be allowed
			const limited1 = await limiter.checkLimit(5, 60000)
			expect(limited1).toBe(false)

			// Second request should be allowed
			const limited2 = await limiter.checkLimit(5, 60000)
			expect(limited2).toBe(false)

			// Check remaining
			const remaining = await limiter.getRemaining(5)
			expect(remaining).toBe(3)
		})

		test('blocks requests over limit via RPC', async () => {
			const id = env.RATE_LIMITER.idFromName('rpc-limiter-2')
			const limiter = env.RATE_LIMITER.get(id)

			// Reset first
			await limiter.reset()

			// Exhaust limit
			for (let i = 0; i < 3; i++) {
				await limiter.checkLimit(3, 60000)
			}

			// Next request should be blocked
			const limited = await limiter.checkLimit(3, 60000)
			expect(limited).toBe(true)

			const remaining = await limiter.getRemaining(3)
			expect(remaining).toBe(0)
		})
	})
})

// -----------------------------------------------------------------------------
// Fetch Handler Integration Tests
// -----------------------------------------------------------------------------

describe('Case 3: Fetch Handler Routes', () => {
	describe('Root route', () => {
		test('GET / returns welcome message', async () => {
			const request = new Request('http://localhost/')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			expect(await response.text()).toBe('Case 3: Cross-Worker Durable Objects Demo')
		})
	})

	describe('Session routes (local DO)', () => {
		test('GET /session/:id/set/:key?value= sets session value', async () => {
			const request = new Request('http://localhost/session/test-user/set/name?value=Bob')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { ok: boolean }
			expect(data.ok).toBe(true)
		})

		test('GET /session/:id/get/:key gets session value', async () => {
			// First set a value
			await fetch(new Request('http://localhost/session/get-user/set/color?value=blue'))

			// Then get it
			const request = new Request('http://localhost/session/get-user/get/color')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { value: unknown }
			expect(data.value).toBe('blue')
		})

		test('GET /session/:id/info returns session metadata', async () => {
			// Set some values
			await fetch(new Request('http://localhost/session/info-user/set/a?value=1'))
			await fetch(new Request('http://localhost/session/info-user/set/b?value=2'))

			const request = new Request('http://localhost/session/info-user/info')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { itemCount: number; createdAt: number }
			expect(data.itemCount).toBe(2)
		})
	})

	describe('Tracker routes (local DO)', () => {
		test('GET /track/:path tracks a request', async () => {
			const request = new Request('http://localhost/track/api-endpoint')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { total: number; pathCount: number }
			expect(data.total).toBeGreaterThanOrEqual(1)
		})

		test('GET /stats returns all path statistics', async () => {
			// Track some requests
			await fetch(new Request('http://localhost/track/route-a'))
			await fetch(new Request('http://localhost/track/route-a'))
			await fetch(new Request('http://localhost/track/route-b'))

			const request = new Request('http://localhost/stats')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as Record<string, number>
			expect(data['route-a']).toBeGreaterThanOrEqual(2)
		})
	})

	describe('Counter routes (cross-worker DO)', () => {
		test('GET /counter/:name/value returns counter value', async () => {
			// First set via direct RPC
			const id = env.COUNTER.idFromName('fetch-value-test')
			const counter = env.COUNTER.get(id)
			await counter.reset()
			await counter.increment(42)

			// Then fetch via route
			const request = new Request('http://localhost/counter/fetch-value-test/value')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { value: number }
			expect(data.value).toBe(42)
		})

		test('GET /counter/:name/increment increments counter', async () => {
			const id = env.COUNTER.idFromName('fetch-increment')
			const counter = env.COUNTER.get(id)
			await counter.reset()

			const request = new Request('http://localhost/counter/fetch-increment/increment')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { value: number }
			expect(data.value).toBe(1)

			// Verify via direct RPC
			const value = await counter.getValue()
			expect(value).toBe(1)
		})
	})

	describe('RateLimiter routes (cross-worker DO)', () => {
		test('GET /ratelimit/:key returns rate limit status', async () => {
			const id = env.RATE_LIMITER.idFromName('fetch-limit')
			const limiter = env.RATE_LIMITER.get(id)
			await limiter.reset()

			const request = new Request('http://localhost/ratelimit/fetch-limit')
			const response = await fetch(request)

			expect(response.status).toBe(200)
			const data = (await response.json()) as { ok: boolean; remaining: number }
			expect(data.ok).toBe(true)
			expect(data.remaining).toBe(9) // 10 - 1 = 9
		})
	})

	describe('Error handling', () => {
		test('unknown route returns 404', async () => {
			const request = new Request('http://localhost/unknown')
			const response = await fetch(request)

			expect(response.status).toBe(404)
		})
	})
})
