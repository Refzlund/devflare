// =============================================================================
// Case 7: Edge Cases - Tests with Real Miniflare
// =============================================================================
// Tests edge case handlers using REAL Miniflare KV via createTestContext
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(async () => {
	await createTestContext()
})

afterAll(async () => {
	await env.dispose()
})

describe('Case 7: Edge Cases & Advanced Patterns', () => {
	describe('error handling', () => {
		test('/error-handled returns 500 with error info', async () => {
			const response = await cf.worker.get('/error-handled')

			expect(response.status).toBe(500)
			const data = await response.json() as { error: string; message: string }
			expect(data.error).toBe('Something went wrong')
			expect(data.message).toBe('Handled error')
		})
	})

	describe('echo endpoint', () => {
		test('POST /echo returns request body', async () => {
			const response = await cf.worker.post('/echo', 'Hello World', {
				'Content-Type': 'text/plain'
			})

			expect(response.status).toBe(200)
			expect(await response.text()).toBe('Hello World')
		})

		test('POST /echo preserves content type', async () => {
			const response = await cf.worker.post(
				'/echo',
				JSON.stringify({ key: 'value' }),
				{ 'Content-Type': 'application/json' }
			)

			expect(response.headers.get('Content-Type')).toBe('application/json')
		})
	})

	describe('headers endpoint', () => {
		test('GET /headers returns request headers', async () => {
			const response = await cf.worker.get('/headers', {
				'X-Custom-Header': 'test-value',
				'Accept': 'application/json'
			})

			expect(response.status).toBe(200)
			const data = await response.json() as { headers: Record<string, string> }
			expect(data.headers['x-custom-header']).toBe('test-value')
		})
	})

	describe('redirect endpoint', () => {
		test('GET /redirect returns 302', async () => {
			const response = await cf.worker.get('/redirect?to=/target')

			expect(response.status).toBe(302)
			expect(response.headers.get('Location')).toBe('http://localhost/target')
		})
	})

	describe('streaming', () => {
		test('GET /stream returns readable stream', async () => {
			const response = await cf.worker.get('/stream')

			expect(response.status).toBe(200)
			expect(response.body).toBeDefined()

			const text = await response.text()
			expect(text).toContain('chunk 0')
			expect(text).toContain('chunk 4')
		})
	})

	describe('index route', () => {
		test('GET / returns endpoint list', async () => {
			const response = await cf.worker.get('/')

			expect(response.status).toBe(200)
			const data = await response.json() as { name: string; endpoints: string[] }
			expect(data.name).toBe('Case 7: Edge Cases')
			expect(data.endpoints).toContain('/stream')
		})
	})
})
