// =============================================================================
// Case 8: File-Based Routing - Tests
// =============================================================================

import { describe, test, expect } from 'bun:test'
import { Router } from '../src/lib/router'

describe('Case 8: File-Based Routing', () => {
	describe('Router', () => {
		test('matches static routes', async () => {
			const router = new Router()
			router.get('/', async () => new Response('home'))

			const request = new Request('http://localhost/')
			const response = await router.handle(request)

			expect(response.status).toBe(200)
			expect(await response.text()).toBe('home')
		})

		test('matches dynamic :param routes', async () => {
			const router = new Router()
			router.get('/users/:id', async (req, params) => {
				return Response.json({ id: params.id })
			})

			const request = new Request('http://localhost/users/123')
			const response = await router.handle(request)

			expect(response.status).toBe(200)
			const data = await response.json() as { id: string }
			expect(data.id).toBe('123')
		})

		test('matches catch-all [...path] routes', async () => {
			const router = new Router()
			router.get('/api/[...path]', async (req, params) => {
				return Response.json({ path: params.path })
			})

			const request = new Request('http://localhost/api/users/123/posts')
			const response = await router.handle(request)

			expect(response.status).toBe(200)
			const data = await response.json() as { path: string }
			expect(data.path).toBe('users/123/posts')
		})

		test('returns 404 for unmatched routes', async () => {
			const router = new Router()
			router.get('/', async () => new Response('home'))

			const request = new Request('http://localhost/unknown')
			const response = await router.handle(request)

			expect(response.status).toBe(404)
		})

		test('matches correct HTTP method', async () => {
			const router = new Router()
			router.get('/resource', async () => new Response('GET'))
			router.post('/resource', async () => new Response('POST'))

			const getReq = new Request('http://localhost/resource')
			const getRes = await router.handle(getReq)
			expect(await getRes.text()).toBe('GET')

			const postReq = new Request('http://localhost/resource', {
				method: 'POST'
			})
			const postRes = await router.handle(postReq)
			expect(await postRes.text()).toBe('POST')
		})
	})

	describe('Route handlers', () => {
		test('GET / returns welcome message', async () => {
			const { GET } = await import('../src/routes/index')

			const request = new Request('http://localhost/')
			const response = await GET(request, {})

			expect(response.status).toBe(200)
			const data = await response.json() as { message: string }
			expect(data.message).toBe('Welcome to the home page')
		})

		test('GET /users/:id returns user', async () => {
			const { GET } = await import('../src/routes/users/[id]')

			const request = new Request('http://localhost/users/42')
			const response = await GET(request, { id: '42' })

			expect(response.status).toBe(200)
			const data = await response.json() as { user: { id: string } }
			expect(data.user.id).toBe('42')
		})

		test('GET /api/[...path] returns path segments', async () => {
			const { GET } = await import('../src/routes/api/[...path]')

			const request = new Request('http://localhost/api/a/b/c')
			const response = await GET(request, { path: 'a/b/c' })

			expect(response.status).toBe(200)
			const data = await response.json() as { segments: string[] }
			expect(data.segments).toEqual(['a', 'b', 'c'])
		})
	})
})
