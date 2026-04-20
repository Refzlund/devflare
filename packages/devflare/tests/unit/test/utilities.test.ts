// =============================================================================
// Test Utilities Tests
// =============================================================================

import { describe, expect, test, mock } from 'bun:test'
import {
	createMockTestContext,
	createMockKV,
	createMockD1,
	createMockR2,
	createMockEnv,
	withTestContext,
	type TestContextOptions
} from '../../../src/test/utilities'
import { getContext, hasContext } from '../../../src/runtime/context'
import { env, locals } from '../../../src/runtime/exports'

describe('createMockTestContext', () => {
	test('creates context with default env', () => {
		const ctx = createMockTestContext()

		expect(ctx.env).toBeDefined()
		expect(ctx.ctx).toBeDefined()
		expect(ctx.request).toBeNull()
	})

	test('accepts custom env', () => {
		const customEnv = { MY_VAR: 'test-value', DB: {} }
		const ctx = createMockTestContext({ env: customEnv })

		expect(ctx.env.MY_VAR).toBe('test-value')
	})

	test('accepts custom request', () => {
		const request = new Request('https://test.com/api')
		const ctx = createMockTestContext({ request })

		expect(ctx.request).toBe(request)
	})

	test('provides mock ExecutionContext', () => {
		const ctx = createMockTestContext()

		expect(typeof ctx.ctx.waitUntil).toBe('function')
		expect(typeof ctx.ctx.passThroughOnException).toBe('function')
	})

	test('waitUntil collects promises', () => {
		const ctx = createMockTestContext()

		ctx.ctx.waitUntil(Promise.resolve('task1'))
		ctx.ctx.waitUntil(Promise.resolve('task2'))

		expect(ctx.waitUntilPromises).toHaveLength(2)
	})
})

describe('withTestContext', () => {
	test('runs function within context', async () => {
		let hadContext = false

		await withTestContext({}, async () => {
			hadContext = hasContext()
		})

		expect(hadContext).toBe(true)
	})

	test('provides access to env proxy', async () => {
		const mockEnv = { API_KEY: 'secret123' }

		await withTestContext({ env: mockEnv }, async () => {
			expect((env as Record<string, unknown>).API_KEY).toBe('secret123')
		})
	})

	test('provides access to locals', async () => {
		await withTestContext({}, async () => {
			; (locals as Record<string, unknown>).userId = 'user-123'
			expect(locals.userId).toBe('user-123')
		})
	})

	test('returns handler result', async () => {
		const result = await withTestContext({}, async () => {
			return new Response('Test Response')
		})

		expect(await result.text()).toBe('Test Response')
	})

	test('context is unavailable after handler', async () => {
		await withTestContext({}, async () => {
			expect(hasContext()).toBe(true)
		})

		expect(hasContext()).toBe(false)
	})
})

describe('createMockKV', () => {
	test('creates mock KV with get/put/delete', async () => {
		const kv = createMockKV()

		await kv.put('key1', 'value1')
		expect(await kv.get('key1')).toBe('value1')

		await kv.delete('key1')
		expect(await kv.get('key1')).toBeNull()
	})

	test('supports json type', async () => {
		const kv = createMockKV()

		await kv.put('data', JSON.stringify({ foo: 'bar' }))
		const result = await kv.get('data', { type: 'json' })

		expect(result).toEqual({ foo: 'bar' })
	})

	test('supports list operation', async () => {
		const kv = createMockKV()

		await kv.put('prefix:a', '1')
		await kv.put('prefix:b', '2')
		await kv.put('other', '3')

		const result = await kv.list({ prefix: 'prefix:' })

		expect(result.keys).toHaveLength(2)
		expect(result.list_complete).toBe(true)
	})

	test('pre-populates with initial data', async () => {
		const kv = createMockKV({
			'key1': 'value1',
			'key2': JSON.stringify({ nested: true })
		})

		expect(await kv.get('key1')).toBe('value1')
	})
})

describe('createMockD1', () => {
	test('creates mock D1 with exec', async () => {
		const d1 = createMockD1()

		const result = await d1.exec('CREATE TABLE test (id INTEGER)')

		expect(result).toBeDefined()
	})

	test('supports prepare().all()', async () => {
		const d1 = createMockD1([
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' }
		])

		const stmt = d1.prepare('SELECT * FROM users')
		const result = await stmt.all()

		expect(result.results).toHaveLength(2)
		expect(result.results[0].name).toBe('Alice')
	})

	test('supports prepare().first()', async () => {
		const d1 = createMockD1([
			{ id: 1, name: 'Alice' }
		])

		const stmt = d1.prepare('SELECT * FROM users WHERE id = ?')
		const result = await stmt.bind(1).first()

		expect(result?.name).toBe('Alice')
	})

	test('supports prepare().run()', async () => {
		const d1 = createMockD1()

		const stmt = d1.prepare('INSERT INTO users (name) VALUES (?)')
		const result = await stmt.bind('Charlie').run()

		expect(result.success).toBe(true)
	})

	test('returns per-table fixtures on SELECT FROM <table>', async () => {
		const d1 = createMockD1({
			fixtures: {
				users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
				posts: [{ id: 10, title: 'Hello' }]
			}
		})

		const users = await d1.prepare('SELECT * FROM users').all()
		expect(users.results).toHaveLength(2)
		expect((users.results[0] as { name: string }).name).toBe('Alice')

		const posts = await d1.prepare('SELECT id, title FROM posts WHERE id = ?').bind(10).all()
		expect(posts.results).toHaveLength(1)
		expect((posts.results[0] as { title: string }).title).toBe('Hello')
	})

	test('different queries against different tables return distinct fixtures', async () => {
		const d1 = createMockD1({
			fixtures: {
				users: [{ id: 1, name: 'Alice' }],
				posts: [{ id: 10, title: 'Hello' }, { id: 11, title: 'World' }]
			}
		})

		const firstUser = await d1.prepare('SELECT * FROM users').first<{ name: string }>()
		const firstPost = await d1.prepare('SELECT * FROM posts').first<{ title: string }>()

		expect(firstUser?.name).toBe('Alice')
		expect(firstPost?.title).toBe('Hello')
	})

	test('INSERT INTO <table> appends to fixture table and reflects in SELECT', async () => {
		const d1 = createMockD1({ fixtures: { users: [{ id: 1, name: 'Alice' }] } })

		const before = await d1.prepare('SELECT * FROM users').all()
		expect(before.results).toHaveLength(1)

		const insert = await d1
			.prepare('INSERT INTO users (name) VALUES (?)')
			.bind('Bob')
			.run()
		expect(insert.success).toBe(true)
		expect(insert.meta.changes).toBe(1)

		const after = await d1.prepare('SELECT * FROM users').all()
		expect(after.results).toHaveLength(2)
	})
})

describe('createMockR2', () => {
	test('creates mock R2 with put/get/delete', async () => {
		const r2 = createMockR2()

		await r2.put('file.txt', 'content')
		const obj = await r2.get('file.txt')

		expect(obj).not.toBeNull()
		expect(await obj!.text()).toBe('content')
	})

	test('returns null for missing objects', async () => {
		const r2 = createMockR2()

		const obj = await r2.get('nonexistent')
		expect(obj).toBeNull()
	})

	test('supports head operation', async () => {
		const r2 = createMockR2()

		await r2.put('file.txt', 'content')
		const head = await r2.head('file.txt')

		expect(head).not.toBeNull()
		expect(head!.key).toBe('file.txt')
	})

	test('supports list operation', async () => {
		const r2 = createMockR2()

		await r2.put('a.txt', 'a')
		await r2.put('b.txt', 'b')

		const result = await r2.list()

		expect(result.objects).toHaveLength(2)
	})
})

describe('createMockEnv', () => {
	test('creates env with KV bindings', () => {
		const mockEnv = createMockEnv({
			kv: ['CACHE', 'SESSIONS']
		}) as { CACHE: KVNamespace; SESSIONS: KVNamespace }

		expect(mockEnv.CACHE).toBeDefined()
		expect(typeof mockEnv.CACHE.get).toBe('function')
		expect(mockEnv.SESSIONS).toBeDefined()
	})

	test('creates env with D1 bindings', () => {
		const mockEnv = createMockEnv({
			d1: ['DB']
		}) as { DB: D1Database }

		expect(mockEnv.DB).toBeDefined()
		expect(typeof mockEnv.DB.prepare).toBe('function')
	})

	test('creates env with R2 bindings', () => {
		const mockEnv = createMockEnv({
			r2: ['BUCKET']
		}) as { BUCKET: R2Bucket }

		expect(mockEnv.BUCKET).toBeDefined()
		expect(typeof mockEnv.BUCKET.put).toBe('function')
	})

	test('creates env with vars', () => {
		const mockEnv = createMockEnv({
			vars: {
				API_URL: 'https://api.example.com',
				DEBUG: 'true'
			}
		})

		expect(mockEnv.API_URL).toBe('https://api.example.com')
		expect(mockEnv.DEBUG).toBe('true')
	})

	test('creates env with custom bindings', () => {
		const customService = { fetch: async () => new Response() }

		const mockEnv = createMockEnv({
			custom: {
				MY_SERVICE: customService
			}
		})

		expect(mockEnv.MY_SERVICE).toBe(customService)
	})
})
