// =============================================================================
// Case 1: Basic Worker - Tests with Real Miniflare
// =============================================================================
// Tests demonstrating devflare's unified env pattern with REAL bindings.
// No mocks — uses actual Miniflare KV via createTestContext.
//
// Pattern:
//   - createTestContext() in beforeAll sets up Miniflare from config
//   - env.dispose() in afterAll cleans up
//   - Access bindings via `import { env } from 'devflare'`
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { env } from 'devflare'
import { createFetchEvent, runWithEventContext, type FetchEvent } from 'devflare/runtime'
import { createTestContext } from 'devflare/test'

// Import fetch handler to test
import fetchHandler from '../src/fetch'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(async () => {
	await createTestContext()
})

afterAll(async () => {
	await env.dispose()
})

// Execution context mock (only what's needed for the handler)
const ctx: ExecutionContext = {
	waitUntil: () => { },
	passThroughOnException: () => { },
	props: {}
}

async function invokeRoute<TParams extends Record<string, string> = Record<string, string>>(
	handler: (event: FetchEvent<DevflareEnv, TParams>) => Promise<Response>,
	request: Request,
	params?: TParams
): Promise<Response> {
	const eventEnv = {
		CACHE: env.CACHE,
		LOG_LEVEL: env.LOG_LEVEL
	} as DevflareEnv

	const event = createFetchEvent(request, eventEnv, ctx, {
		params: (params ?? {}) as TParams
	})

	return runWithEventContext(event, () => handler(event))
}

// -----------------------------------------------------------------------------
// Fetch Handler Tests
// -----------------------------------------------------------------------------

describe('Case 1: Basic Worker with Real KV', () => {
	describe('fetch handler', () => {
		test('GET / returns welcome message', async () => {
			const request = new Request('http://localhost/')
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(200)
			expect(await response.text()).toBe('Hello from Case 1: Basic Worker!')
		})

		test('GET /env returns environment variables', async () => {
			const request = new Request('http://localhost/env')
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(200)
			const data = await response.json() as { LOG_LEVEL: string }
			expect(data.LOG_LEVEL).toBe('info')
		})

		test('PUT /cache/:key stores value in REAL KV', async () => {
			const request = new Request('http://localhost/cache/test-key-1', {
				method: 'PUT',
				body: 'test-value-1'
			})
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(201)

			// Verify directly in real KV
			const stored = await env.CACHE.get('test-key-1')
			expect(stored).toBe('test-value-1')
		})

		test('GET /cache/:key retrieves value from REAL KV', async () => {
			// Pre-populate real KV
			await env.CACHE.put('my-key', 'my-value')

			const request = new Request('http://localhost/cache/my-key')
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(200)
			expect(await response.text()).toBe('my-value')
		})

		test('GET /cache/:key returns 404 for missing key', async () => {
			const request = new Request('http://localhost/cache/definitely-missing')
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(404)
		})

		test('DELETE /cache/:key removes value from REAL KV', async () => {
			// Pre-populate
			await env.CACHE.put('delete-me-key', 'value')

			const request = new Request('http://localhost/cache/delete-me-key', { method: 'DELETE' })
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(200)

			// Verify deleted from real KV
			const stored = await env.CACHE.get('delete-me-key')
			expect(stored).toBeNull()
		})

		test('unknown route returns 404', async () => {
			const request = new Request('http://localhost/unknown-route')
			const response = await fetchHandler(request, env as DevflareEnv, ctx)

			expect(response.status).toBe(404)
		})
	})

	describe('route handlers (file-based)', () => {
		test('GET / route handler', async () => {
			const { GET } = await import('../src/routes/index')

			const request = new Request('http://localhost/')
			const response = await invokeRoute(GET, request)

			expect(response.status).toBe(200)
			expect(await response.text()).toBe('Hello from Case 1: Basic Worker!')
		})

		test('GET /env route handler', async () => {
			const { GET } = await import('../src/routes/env')

			const request = new Request('http://localhost/env')
			const response = await invokeRoute(GET, request)

			expect(response.status).toBe(200)
			const data = await response.json() as { LOG_LEVEL: string }
			expect(data.LOG_LEVEL).toBe('info')
		})

		test('cache route handlers with params using REAL KV', async () => {
			const { GET, PUT, DELETE } = await import('../src/routes/cache/[key]')

			// PUT
			const putReq = new Request('http://localhost/cache/route-test', { method: 'PUT', body: 'route-value' })
			const putRes = await invokeRoute(PUT, putReq, { key: 'route-test' })
			expect(putRes.status).toBe(201)

			// Verify in real KV
			const stored = await env.CACHE.get('route-test')
			expect(stored).toBe('route-value')

			// GET
			const getReq = new Request('http://localhost/cache/route-test')
			const getRes = await invokeRoute(GET, getReq, { key: 'route-test' })
			expect(getRes.status).toBe(200)
			expect(await getRes.text()).toBe('route-value')

			// DELETE
			const delReq = new Request('http://localhost/cache/route-test', { method: 'DELETE' })
			const delRes = await invokeRoute(DELETE, delReq, { key: 'route-test' })
			expect(delRes.status).toBe(200)

			// Verify deleted
			const deleted = await env.CACHE.get('route-test')
			expect(deleted).toBeNull()
		})
	})
})
