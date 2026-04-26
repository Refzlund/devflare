// =============================================================================
// Test Utilities Tests
// =============================================================================

import { describe, expect, test, mock } from 'bun:test'
import type { Pipeline } from 'cloudflare:pipelines'
import {
	createMockTestContext,
	createMockKV,
	createMockD1,
	createMockR2,
	createMockRateLimit,
	createMockVersionMetadata,
	createMockWorkerLoader,
	createMockMTLSCertificate,
	createMockDispatchNamespace,
	createMockWorkflow,
	createMockPipeline,
	createMockImagesBinding,
	createMockMediaBinding,
	createMockArtifacts,
	createMockSecretsStoreSecret,
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

describe('createMockRateLimit', () => {
	test('allows requests until the configured limit is reached', async () => {
		const limiter = createMockRateLimit({ limit: 2, period: 60 })

		expect(await limiter.limit({ key: 'user-1' })).toEqual({ success: true })
		expect(await limiter.limit({ key: 'user-1' })).toEqual({ success: true })
		expect(await limiter.limit({ key: 'user-1' })).toEqual({ success: false })
		expect(await limiter.limit({ key: 'user-2' })).toEqual({ success: true })
	})
})

describe('createMockVersionMetadata', () => {
	test('creates deterministic local Worker version metadata', () => {
		expect(createMockVersionMetadata()).toEqual({
			id: 'devflare-local-version',
			tag: 'local',
			timestamp: '1970-01-01T00:00:00.000Z'
		})
	})
})

describe('createMockWorkerLoader', () => {
	test('returns the configured WorkerStub from load()', () => {
		const stub = {
			getEntrypoint: () => ({ fetch: async () => new Response('ok') }),
			getDurableObjectClass: () => ({ idFromName: () => ({ toString: () => 'id' }) })
		} as unknown as WorkerStub
		const loader = createMockWorkerLoader({ stub })

		expect(loader.load({
			compatibilityDate: '2026-04-26',
			mainModule: 'index.js',
			modules: {
				'index.js': 'export default {}'
			}
		})).toBe(stub)
	})
})

describe('createMockMTLSCertificate', () => {
	test('creates a Fetcher backed by the configured handler', async () => {
		const fetcher = createMockMTLSCertificate(async (input) => {
			const request = new Request(input)
			return new Response(request.url)
		})

		const response = await fetcher.fetch('https://secure.example/path')

		expect(await response.text()).toBe('https://secure.example/path')
	})
})

describe('createMockDispatchNamespace', () => {
	test('returns a configured Fetcher from get()', async () => {
		const namespace = createMockDispatchNamespace({
			workers: {
				tenant: async () => new Response('tenant response')
			}
		})

		const response = await namespace.get('tenant').fetch('https://tenant.example')

		expect(await response.text()).toBe('tenant response')
	})
})

describe('createMockSecretsStoreSecret', () => {
	test('returns the configured secret value from get()', async () => {
		const secret = createMockSecretsStoreSecret('super-secret')

		expect(await secret.get()).toBe('super-secret')
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

	test('creates env with Rate Limiting bindings', async () => {
		const mockEnv = createMockEnv({
			rateLimits: {
				MY_RATE_LIMITER: { limit: 1, period: 60 }
			}
		}) as { MY_RATE_LIMITER: RateLimit }

		expect(await mockEnv.MY_RATE_LIMITER.limit({ key: 'user-1' })).toEqual({ success: true })
		expect(await mockEnv.MY_RATE_LIMITER.limit({ key: 'user-1' })).toEqual({ success: false })
	})

	test('creates env with Version Metadata binding', () => {
		const mockEnv = createMockEnv({
			versionMetadata: 'CF_VERSION_METADATA'
		}) as { CF_VERSION_METADATA: WorkerVersionMetadata }

		expect(mockEnv.CF_VERSION_METADATA).toEqual(createMockVersionMetadata())
	})

	test('creates env with Worker Loader bindings', () => {
		const mockEnv = createMockEnv({
			workerLoaders: ['LOADER']
		}) as { LOADER: WorkerLoader }

		expect(typeof mockEnv.LOADER.load).toBe('function')
		expect(typeof mockEnv.LOADER.get).toBe('function')
	})

	test('creates env with mTLS Certificate bindings', async () => {
		const mockEnv = createMockEnv({
			mtlsCertificates: {
				API_CERT: async () => new Response('secure')
			}
		}) as { API_CERT: Fetcher }

		const response = await mockEnv.API_CERT.fetch('https://secure.example')

		expect(await response.text()).toBe('secure')
	})

	test('creates env with Dispatch Namespace bindings', async () => {
		const mockEnv = createMockEnv({
			dispatchNamespaces: {
				DISPATCHER: {
					workers: {
						tenant: async () => new Response('tenant')
					}
				}
			}
		}) as { DISPATCHER: DispatchNamespace }

		const response = await mockEnv.DISPATCHER.get('tenant').fetch('https://tenant.example')

		expect(await response.text()).toBe('tenant')
	})

	test('creates Workflow bindings', async () => {
		const workflow = createMockWorkflow()
		const created = await workflow.create({ id: 'order-1', params: { id: 1 } })
		const fetched = await workflow.get('order-1')

		expect(created.id).toBe('order-1')
		expect(fetched).toBe(created)
		expect(await fetched.status()).toEqual({ status: 'queued' })
	})

	test('creates env with Workflow bindings', async () => {
		const mockEnv = createMockEnv({
			workflows: ['ORDER_WORKFLOW']
		}) as { ORDER_WORKFLOW: Workflow }

		const instance = await mockEnv.ORDER_WORKFLOW.create({ id: 'order-2' })

		expect(instance.id).toBe('order-2')
	})

	test('creates Pipeline bindings', async () => {
		const pipeline = createMockPipeline()

		await pipeline.send([{ event: 'signup' }])

		expect(pipeline._getRecords()).toEqual([{ event: 'signup' }])
	})

	test('creates env with Pipeline bindings', async () => {
		const mockEnv = createMockEnv({
			pipelines: ['EVENTS']
		}) as { EVENTS: Pipeline }

		await mockEnv.EVENTS.send([{ event: 'login' }])

		expect((mockEnv.EVENTS as ReturnType<typeof createMockPipeline>)._getRecords()).toEqual([
			{ event: 'login' }
		])
	})

	test('creates Images bindings', async () => {
		const images = createMockImagesBinding({
			info: {
				format: 'image/png',
				fileSize: 12,
				width: 16,
				height: 9
			},
			response: new Response('image', {
				headers: { 'Content-Type': 'image/png' }
			})
		})

		const stream = new ReadableStream<Uint8Array>()
		const info = await images.info(stream)
		const result = await images.input(stream).transform({ width: 16 }).output({ format: 'image/png' })

		expect((info as { width?: number }).width).toBe(16)
		expect(result.contentType()).toBe('image/png')
		expect(await result.response().text()).toBe('image')
	})

	test('creates env with Images bindings', async () => {
		const mockEnv = createMockEnv({
			images: 'IMAGES'
		}) as { IMAGES: ImagesBinding }

		const response = (await mockEnv.IMAGES
			.input(new ReadableStream<Uint8Array>())
			.output({ format: 'image/png' })).response()

		expect(response.headers.get('Content-Type')).toBe('image/png')
	})

	test('creates Media Transformations bindings', async () => {
		const media = createMockMediaBinding({
			response: new Response('media', {
				headers: { 'Content-Type': 'video/mp4' }
			})
		})

		const result = media
			.input(new ReadableStream<Uint8Array>())
			.transform({ width: 480, height: 270 })
			.output({ mode: 'video', duration: '5s' })

		expect(await result.contentType()).toBe('video/mp4')
		expect(await (await result.response()).text()).toBe('media')
	})

	test('creates env with Media Transformations bindings', async () => {
		const mockEnv = createMockEnv({
			media: 'MEDIA'
		}) as { MEDIA: MediaBinding }

		const response = await mockEnv.MEDIA
			.input(new ReadableStream<Uint8Array>())
			.output({ mode: 'audio' })
			.response()

		expect(response.headers.get('Content-Type')).toBe('video/mp4')
	})

	test('creates Artifacts bindings', async () => {
		const artifacts = createMockArtifacts()

		const created = await artifacts.create('starter-repo', {
			description: 'Repository for tests'
		})
		const repo = await artifacts.get('starter-repo')
		const listed = await artifacts.list()

		expect(created.name).toBe('starter-repo')
		expect(repo.name).toBe('starter-repo')
		expect(listed.repos.map((entry) => entry.name)).toEqual(['starter-repo'])
	})

	test('creates env with Artifacts bindings', async () => {
		const mockEnv = createMockEnv({
			artifacts: ['ARTIFACTS']
		}) as { ARTIFACTS: Artifacts }

		await mockEnv.ARTIFACTS.create('starter-repo')

		expect((await mockEnv.ARTIFACTS.list()).total).toBe(1)
	})

	test('creates env with Secrets Store bindings', async () => {
		const mockEnv = createMockEnv({
			secretsStore: {
				API_TOKEN: 'super-secret'
			}
		}) as { API_TOKEN: SecretsStoreSecret }

		expect(await mockEnv.API_TOKEN.get()).toBe('super-secret')
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
