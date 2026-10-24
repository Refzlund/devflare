import type { DocPage } from '../../types'

export const docsLink = (slug: string): string => `/docs/${slug}`

export const docsTextLink = (label: string, slug: string): string => `[${label}](${docsLink(slug)})`

export const caseLink = (name: string): string => `/cases/${name}`

export const workerOnlyRecipeFiles = [
	{
		path: 'devflare.config.ts',
		language: 'ts',
		code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})`
	},
	{
		path: 'src/fetch.ts',
		language: 'ts',
		code: String.raw`import { locals, sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	locals.requestId = crypto.randomUUID()
	return resolve(event)
}

export const handle = sequence(requestId)`
	},
	{
		path: 'src/routes/notes/[id].ts',
		language: 'ts',
		code: String.raw`import { getFetchEvent, locals } from 'devflare/runtime'

export async function GET(): Promise<Response> {
	const event = getFetchEvent()
	const id = event.params.id

	return Response.json({
		id,
		requestId: locals.requestId
	})
}`
	},
	{
		path: 'tests/worker.test.ts',
		language: 'ts',
		code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('route tree responds through the worker', async () => {
	const response = await cf.worker.get('/api/notes/first')

	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ id: 'first' })
})`
	}
]

export const storageRecipeFiles = [
	{
		path: 'devflare.config.ts',
		language: 'ts',
		code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'storage-api',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	},
	bindings: {
		kv: {
			CACHE: 'notes-cache'
		},
		d1: {
			DB: 'notes-db'
		},
		r2: {
			FILES: 'notes-files'
		}
	}
})`
	},
	{
		path: 'src/routes/files/[key].ts',
		language: 'ts',
		code: String.raw`import { env, getFetchEvent } from 'devflare/runtime'

export async function PUT(): Promise<Response> {
	const event = getFetchEvent()
	const key = event.params.key
	const body = await event.request.text()

	await env.FILES.put(key, body)
	await env.CACHE.put('file:' + key, 'present')

	return new Response(null, { status: 204 })
}

export async function GET(): Promise<Response> {
	const key = getFetchEvent().params.key
	const object = await env.FILES.get(key)

	return object ? new Response(await object.text()) : new Response('missing', { status: 404 })
}`
	},
	{
		path: 'tests/storage.test.ts',
		language: 'ts',
		code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('file route writes R2 and cache metadata', async () => {
	await cf.worker.fetch('/files/readme.txt', { method: 'PUT', body: 'hello' })

	expect(await env.CACHE.get('file:readme.txt')).toBe('present')
	expect(await (await cf.worker.get('/files/readme.txt')).text()).toBe('hello')
})`
	}
]

export const durableObjectRecipeFiles = [
	{
		path: 'src/do/counter.ts',
		language: 'ts',
		code: String.raw`import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject<DevflareEnv> {
	async increment(): Promise<number> {
		const next = Number((await this.ctx.storage.get('count')) ?? 0) + 1
		await this.ctx.storage.put('count', next)
		return next
	}
}`
	},
	{
		path: 'src/routes/counter.ts',
		language: 'ts',
		code: String.raw`import { env } from 'devflare/runtime'

export async function POST(): Promise<Response> {
	const counter = env.COUNTER.getByName('global')
	return Response.json({ count: await counter.increment() })
}`
	},
	{
		path: 'tests/counter.test.ts',
		language: 'ts',
		code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('counter route uses the real object binding', async () => {
	const response = await cf.worker.fetch('/counter', { method: 'POST' })

	expect(await response.json()).toEqual({ count: 1 })
})`
	}
]

export const queueRecipeFiles = [
	{
		path: 'src/queue.ts',
		language: 'ts',
		code: String.raw`import type { QueueEvent } from 'devflare/runtime'

export async function queue(event: QueueEvent): Promise<void> {
	for (const message of event.messages) {
		await event.env.PROCESSED.put(message.id, JSON.stringify(message.body))
	}
}`
	},
	{
		path: 'src/scheduled.ts',
		language: 'ts',
		code: String.raw`import type { ScheduledEvent } from 'devflare/runtime'

export async function scheduled(event: ScheduledEvent): Promise<void> {
	await event.env.JOBS.send({ id: 'maintenance-' + event.scheduledTime })
}`
	},
	{
		path: 'tests/queue.test.ts',
		language: 'ts',
		code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('queue consumer and scheduled producer are triggerable', async () => {
	await cf.queue.trigger([{ id: 'job-1', body: { ok: true } }])
	await cf.scheduled.trigger({ scheduledTime: 1_700_000_000_000 })

	expect(await env.PROCESSED.get('job-1')).toContain('"ok":true')
})`
	}
]

export const serviceBindingRecipeFiles = [
	{
		path: 'devflare.config.ts',
		language: 'ts',
		code: String.raw`import { defineConfig, ref } from 'devflare/config'

const math = ref(() => import('./math-service/devflare.config'))

export default defineConfig({
	name: 'gateway-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		services: {
			MATH_SERVICE: math.worker
		}
	}
})`
	},
	{
		path: 'src/fetch.ts',
		language: 'ts',
		code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const result = await env.MATH_SERVICE.add(2, 3)
	return Response.json({ result })
}`
	},
	{
		path: 'math-service/worker.ts',
		language: 'ts',
		code: String.raw`export function add(a: number, b: number): number {
	return a + b
}`
	}
]

export const offlineRecipeFiles = [
	{
		path: 'tests/offline-env.test.ts',
		language: 'ts',
		code: String.raw`import { expect, test } from 'bun:test'
import { createOfflineEnv, describeOfflineSupport } from 'devflare/test'
import config from '../devflare.config'

test('offline env is enough for pure binding logic', async () => {
	const support = describeOfflineSupport('kv')
	const env = createOfflineEnv(config, {
		kv: {
			CACHE: 'CACHE'
		}
	})

	await env.CACHE.put('hello', 'offline')

	expect(support.tier).not.toBe('remote-only')
	expect(await env.CACHE.get('hello')).toBe('offline')
})`
	},
	{
		path: 'tests/remote-boundary.test.ts',
		language: 'ts',
		code: String.raw`import { expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

test.skipIf(await shouldSkip.ai)('AI uses the real remote boundary', async () => {
	await createTestContext()
	try {
		const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
			messages: [{ role: 'user', content: 'Reply OK' }]
		})

		expect(result).toBeDefined()
	} finally {
		await env.dispose()
	}
})`
	},
	{
		path: 'tests/container.test.ts',
		language: 'ts',
		code: String.raw`import { afterAll, expect, test } from 'bun:test'
import { containers, shouldSkip, stopActiveContainers } from 'devflare/test'

afterAll(() => stopActiveContainers())

const skipContainers = await shouldSkip.containers

test.skipIf(skipContainers)('container responds without pulling in CI', async () => {
	const app = await containers.start('ApiContainer', {
		image: 'devflare-fixture:local',
		port: 8080,
		offline: true
	})

	expect(await app.fetch('/health').then((response) => response.status)).toBe(200)
})`
	}
]

export const svelteKitRecipeFiles = [
	{
		path: 'devflare.config.ts',
		language: 'ts',
		code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kit-worker',
	compatibilityDate: '2026-03-17',
	framework: {
		type: 'sveltekit'
	},
	bindings: {
		kv: {
			CACHE: 'kit-cache'
		}
	}
})`
	},
	{
		path: 'src/routes/+page.server.ts',
		language: 'ts',
		code: String.raw`import type { PageServerLoad } from '../$types'

export const load: PageServerLoad = async ({ platform }) => {
	const message = await platform?.env.CACHE.get('home-message')
	return { message: message ?? 'Hello from SvelteKit' }
}`
	},
	{
		path: 'tests/page.test.ts',
		language: 'ts',
		code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('SvelteKit worker receives the Devflare platform env', async () => {
	await env.CACHE.put('home-message', 'from-kv')
	const response = await cf.worker.get('/')

	expect(response.status).toBe(200)
})`
	}
]

export const previewRecipeFiles = [
	{
		path: 'devflare.config.ts',
		language: 'ts',
		code: String.raw`import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	name: 'previewable-worker',
	bindings: {
		kv: {
			CACHE: pv('previewable-cache')
		}
	}
})`
	},
	{
		path: '.github/workflows/preview.yml',
		language: 'yaml',
		code: String.raw`name: Preview

on:
  pull_request:

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/devflare-setup-workspace
      - uses: ./.github/actions/devflare-deploy
        with:
          working-directory: packages/app
          target: preview
          preview-scope: pr-${'${{ github.event.pull_request.number }}'}
      - uses: ./.github/actions/devflare-github-feedback
        with:
          preview-scope: pr-${'${{ github.event.pull_request.number }}'}`
	}
]

export const recipeRows = [
	[
		'Worker-only API',
		'Route tree, middleware, env vars, and request tests',
		'`first-route-tree`, `http-routing`, case1, case8'
	],
	[
		'KV + D1 + R2',
		'Cache, query data, and file delivery through one Worker boundary',
		'`bindings/kv`, `bindings/d1`, `bindings/r2`'
	],
	[
		'Durable Object state',
		'Counter or room-style identity state with route and test',
		'case3, case19'
	],
	['Queue + scheduled job', 'Producer, consumer, retry or maintenance job', 'case6'],
	['Service bindings', '`ref()` plus default and named worker entrypoints', 'case5'],
	['SvelteKit', 'Devflare platform glue and deployment commands', 'case18'],
	['Offline-first tests', '`createOfflineEnv()` and pure mocks', 'offline support matrix'],
	['Remote-boundary tests', '`shouldSkip.*` plus explicit Cloudflare auth lanes', 'case15'],
	[
		'Containers',
		'Docker/Podman-gated local test with `offline: true` when offline',
		'container helper tests'
	],
	[
		'Preview lifecycle',
		'`preview.scope()`, inspection, cleanup, and GitHub feedback',
		'preview docs'
	]
]

export const featureRows = [
	[
		'Route tree',
		'Full',
		'No Cloudflare product boundary',
		'`cf.worker`',
		'N/A',
		docsLink('first-route-tree')
	],
	[
		'KV',
		'Full',
		'Account limits and deployed namespace state',
		'`createTestContext`, `createOfflineEnv`, `createMockKV`',
		'Managed when scoped',
		docsLink('bindings/kv')
	],
	[
		'D1',
		'Full',
		'Account limits and deployed database state',
		'`createTestContext`, `createOfflineEnv`, `createMockD1`',
		'Managed when scoped',
		docsLink('bindings/d1')
	],
	[
		'R2',
		'Full',
		'Public delivery topology is Cloudflare-owned',
		'`createTestContext`, `createOfflineEnv`, `createMockR2`',
		'Managed when scoped',
		docsLink('bindings/r2')
	],
	[
		'Durable Objects',
		'Full',
		'Migrations and placement are Cloudflare-owned',
		'`createTestContext`',
		'Branch-scoped isolation when needed',
		docsLink('bindings/durable-objects')
	],
	[
		'Queues',
		'Full',
		'Delivery and retry semantics are Cloudflare-owned',
		'`cf.queue`, `createMockQueue`',
		'Managed when scoped',
		docsLink('bindings/queues')
	],
	[
		'Scheduled',
		'Full',
		'Cron scheduling is Cloudflare-owned',
		'`cf.scheduled`',
		'Config-owned',
		docsLink('create-test-context')
	],
	[
		'Email',
		'Full',
		'Email Routing ingress remains Cloudflare-owned',
		'`cf.email`, send-email binding tests',
		'Address rules compile as authored',
		docsLink('bindings/send-email')
	],
	[
		'Tail Workers',
		'Full',
		'Live tail routing is Cloudflare-owned',
		'`cf.tail`',
		'Handler code only',
		docsLink('create-test-context')
	],
	[
		'Workers AI',
		'Remote',
		'Requires Cloudflare account',
		'`shouldSkip.ai`',
		'Product-owned',
		docsLink('bindings/ai')
	],
	[
		'Vectorize',
		'Remote',
		'Requires Cloudflare account',
		'`shouldSkip.vectorize`',
		'Managed when scoped',
		docsLink('bindings/vectorize')
	],
	[
		'Hyperdrive',
		'Full',
		'Hosted pooling, placement, credentials, and production routing are Cloudflare-owned',
		'`createTestContext`, `createOfflineEnv`',
		'Reuse or resolve when scoped',
		docsLink('bindings/hyperdrive')
	],
	[
		'Browser Rendering',
		'Full',
		'Hosted browser service fidelity is Cloudflare-owned',
		'`createTestContext` or focused mocks',
		'No account resource cleanup',
		docsLink('bindings/browser-rendering')
	],
	[
		'Worker Loaders',
		'Full',
		'Dynamic Worker upload and hosted lifecycle are Cloudflare-owned',
		'`createTestContext`, `createMockWorkerLoader`',
		'Config-owned',
		docsLink('bindings/worker-loaders')
	],
	[
		'Secrets Store',
		'Full',
		'Account secret provisioning and sync are Cloudflare-owned',
		'`createOfflineEnv`, `createMockSecretsStoreSecret`',
		'Product-owned',
		docsLink('bindings/secrets-store')
	],
	[
		'Workflows',
		'Full',
		'Deployed durability, retries, scheduling, and instance history are Cloudflare-owned',
		'`createTestContext`, `createMockWorkflow`',
		'Product-owned',
		docsLink('bindings/workflows')
	],
	[
		'Images',
		'Full',
		'Hosted storage, variants, delivery rules, billing, and final transform fidelity are Cloudflare-owned',
		'`createTestContext`, `createMockImagesBinding`',
		'Product-owned',
		docsLink('bindings/images')
	],
	[
		'Media Transformations',
		'Full',
		'Real codecs, output fidelity, cache behavior, and billing are Cloudflare-owned',
		'`createTestContext`, `createMockMediaBinding`',
		'Product-owned',
		docsLink('bindings/media-transformations')
	],
	[
		'Containers',
		'Full',
		'Cloudflare Containers deployment is remote',
		'`containers`, `shouldSkip.containers`',
		'Product-owned',
		docsLink('bindings/containers')
	]
]
