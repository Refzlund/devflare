import type { DocPage } from '../types'

const docsLink = (slug: string): string => `/docs/${slug}`
const caseLink = (name: string): string => `/cases/${name}`

const workerOnlyRecipeFiles = [
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

const storageRecipeFiles = [
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

const durableObjectRecipeFiles = [
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

const queueRecipeFiles = [
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

const serviceBindingRecipeFiles = [
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

const offlineRecipeFiles = [
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

test.skipIf(await shouldSkip.containers())('container responds without pulling in CI', async () => {
	const app = await containers.start({
		image: 'devflare-fixture:local',
		pull: false,
		ports: [8080]
	})

	expect(await app.fetch('/health').then((response) => response.status)).toBe(200)
})`
	}
]

const svelteKitRecipeFiles = [
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
		code: String.raw`import type { PageServerLoad } from './$types'

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

const previewRecipeFiles = [
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

const recipeRows = [
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
		'Docker/Podman-gated local test with `pull: false` when offline',
		'container helper tests'
	],
	[
		'Preview lifecycle',
		'`preview.scope()`, inspection, cleanup, and GitHub feedback',
		'preview docs'
	]
]

const featureRows = [
	['Route tree', 'Full', 'N/A', '`cf.worker`', 'N/A', docsLink('first-route-tree')],
	[
		'KV',
		'Full',
		'Wrangler deploy',
		'`createTestContext`, `createOfflineEnv`, `createMockKV`',
		'Managed when scoped',
		docsLink('bindings/kv')
	],
	[
		'D1',
		'Full',
		'Wrangler deploy',
		'`createTestContext`, `createOfflineEnv`, `createMockD1`',
		'Managed when scoped',
		docsLink('bindings/d1')
	],
	[
		'R2',
		'Full for API use',
		'Delivery topology belongs to Cloudflare',
		'`createTestContext`, `createOfflineEnv`, `createMockR2`',
		'Managed when scoped',
		docsLink('bindings/r2')
	],
	[
		'Durable Objects',
		'Full local harness',
		'Migrations and placement are Cloudflare owned',
		'`createTestContext`',
		'Use branch-scoped isolation when needed',
		docsLink('bindings/durable-objects')
	],
	[
		'Queues',
		'Full trigger helpers',
		'Delivery/retry semantics are Cloudflare owned',
		'`cf.queue`, `createMockQueue`',
		'Managed when scoped',
		docsLink('bindings/queues')
	],
	[
		'Scheduled',
		'Full trigger helper',
		'Cron scheduling is Cloudflare owned',
		'`cf.scheduled`',
		'Config-owned',
		docsLink('create-test-context')
	],
	[
		'Email',
		'Outbound and handler helpers',
		'Email Routing ingress remains Cloudflare owned',
		'`cf.email`, send-email binding tests',
		'Address rules compile as authored',
		docsLink('bindings/send-email')
	],
	[
		'Tail Workers',
		'`cf.tail.trigger()`',
		'Live tail routing is Cloudflare owned',
		'`cf.tail`',
		'Handler code only',
		docsLink('create-test-context')
	],
	[
		'Workers AI',
		'Remote-oriented',
		'Requires Cloudflare account',
		'`shouldSkip.ai`',
		'Product-owned',
		docsLink('bindings/ai')
	],
	[
		'Vectorize',
		'Remote-oriented',
		'Requires Cloudflare account',
		'`shouldSkip.vectorize`',
		'Managed when scoped',
		docsLink('bindings/vectorize')
	],
	[
		'Browser Rendering',
		'Puppeteer-shaped local checks',
		'Browser service is Cloudflare owned',
		'`createTestContext` or focused mocks',
		'No account resource cleanup',
		docsLink('bindings/browser-rendering')
	],
	[
		'Containers',
		'Docker/Podman-gated',
		'Cloudflare Containers deployment is remote',
		'`containers`, `shouldSkip.containers`',
		'Product-owned',
		docsLink('bindings/containers')
	]
]

export const examplesDocs: DocPage[] = [
	{
		slug: 'docs-landing-paths',
		group: 'Quickstart',
		navTitle: 'Start paths',
		readTime: '4 min read',
		eyebrow: 'Docs path',
		title: 'Pick the shortest documentation path for the job in front of you',
		summary:
			'Use this page when you want a short route through the docs instead of a full handbook read.',
		description:
			'The docs are organized as recipes first: create a Worker, add a route, add a binding, write a test, deploy, or inspect a Cloudflare boundary. The deeper pages stay available once the first copyable path works.',
		highlights: [
			'Start with one path instead of reading the whole site.',
			'Each path points to a copyable recipe first and a deeper reference second.',
			'Examples assume Wrangler 4, Miniflare 4, workers-types 4, Bun 1.1+, and Node 20+ unless a page says otherwise.',
			'Boundary notes belong after the working example, not before it.'
		],
		facts: [
			{ label: 'Best for', value: 'New readers choosing where to start' },
			{
				label: 'Toolchain assumptions',
				value: 'Wrangler 4, Miniflare 4, workers-types 4, Bun 1.1+, Node 20+'
			},
			{ label: 'Shortest path', value: '`first-worker` -> `first-unit-test` -> one next recipe' }
		],
		sourcePages: [
			'apps/documentation/src/lib/docs/content/examples.ts',
			'packages/devflare/package.json'
		],
		sections: [
			{
				id: 'paths',
				title: 'Choose the path that matches the next 10 minutes',
				table: {
					headers: ['I need to...', 'Open first', 'Then open'],
					rows: [
						['Create a Worker', docsLink('first-worker'), docsLink('first-unit-test')],
						['Add a route tree', docsLink('first-route-tree'), docsLink('http-routing')],
						['Add a binding', docsLink('first-bindings'), docsLink('binding-chooser')],
						['Write tests', docsLink('first-unit-test'), docsLink('test-helper-reference')],
						['Deploy safely', docsLink('deploy-and-preview'), docsLink('deploy-command-recipes')],
						['Understand a boundary', docsLink('feature-index'), docsLink('binding-testing-guides')]
					]
				}
			},
			{
				id: 'copy-next',
				title: 'Copy this next',
				cards: [
					{
						title: 'Route next',
						body: 'Move from one `src/fetch.ts` file into `src/routes/**` without adding bindings yet.',
						href: docsLink('first-route-tree'),
						label: 'Recipe'
					},
					{
						title: 'Binding next',
						body: 'Add one storage binding end to end before mixing in platform-heavy services.',
						href: docsLink('first-bindings'),
						label: 'Recipe'
					},
					{
						title: 'Deploy next',
						body: 'Run `build`, dry-run, named preview, production, and cleanup as separate commands.',
						href: docsLink('deploy-command-recipes'),
						label: 'Recipe'
					}
				]
			}
		]
	},
	{
		slug: 'first-route-tree',
		group: 'Quickstart',
		navTitle: 'Your first route tree',
		readTime: '5 min read',
		eyebrow: 'Routing recipe',
		title: 'Move from one fetch file to `src/routes/**` without adding binding noise',
		summary:
			'The first route-tree step should only change project shape: config, request-wide middleware, one route, and one worker-level test.',
		description:
			'Do this before adding storage or remote services. It teaches the authored file shape and the route dispatch contract while the app is still small enough to debug by sight.',
		highlights: [
			'Add `files.routes.dir` in config.',
			'Keep request-wide middleware in `src/fetch.ts`.',
			'Put URL-specific handlers in `src/routes/**`.',
			'Test through `cf.worker` so route dispatch is part of the proof.'
		],
		facts: [
			{ label: 'Best for', value: 'The first growth step after `first-worker`' },
			{
				label: 'Files',
				value: '`devflare.config.ts`, `src/fetch.ts`, `src/routes/**`, `tests/worker.test.ts`'
			},
			{ label: 'Proof', value: '`cf.worker.get()` exercises route dispatch' }
		],
		sourcePages: [
			'apps/documentation/src/lib/docs/content/examples.ts',
			'cases/case8/*',
			'packages/devflare/src/runtime/router/index.ts'
		],
		sections: [
			{
				id: 'copyable-route-tree',
				title: 'Copy the route tree shape',
				snippets: [
					{
						title: 'Worker-only route tree with one test',
						description:
							'These files are enough to move out of a single fetch handler while keeping the runtime and test story honest.',
						activeFile: 'src/routes/notes/[id].ts',
						files: workerOnlyRecipeFiles
					}
				]
			},
			{
				id: 'common-failure',
				title: 'Common failure messages',
				table: {
					headers: ['Symptom', 'Likely fix'],
					rows: [
						[
							'`404 Not Found` for a route file',
							'Check `files.routes.dir`, the route filename, and any configured prefix.'
						],
						[
							'Ambiguous two-argument handler error',
							'Wrap the handler with `defineFetchHandler(..., { style })` or use an event-first signature.'
						],
						[
							'`env.dispose` is not a function',
							'Import `env` from `devflare/test` in tests, not from `devflare/runtime`.'
						]
					]
				}
			}
		]
	},
	{
		slug: 'binding-chooser',
		group: 'Guides',
		navTitle: 'Binding chooser',
		readTime: '5 min read',
		eyebrow: 'Choose a binding',
		title: 'Choose the Cloudflare binding by the job, then open the recipe page',
		summary:
			'Use one table to choose storage, state, async work, search, email, browser rendering, media, worker composition, or offline tests.',
		description:
			'The chooser is intentionally short. Once the job is clear, the binding page owns config, runtime usage, tests, offline behavior, preview lifecycle, and boundary notes.',
		highlights: [
			'Storage is split by access pattern, not popularity.',
			'Remote-only product behavior is called out before you write misleading local tests.',
			'Offline-first testing has its own lane: pure mocks, `createOfflineEnv`, runtime harness, or remote boundary.',
			'Old product names are searchable: AutoRAG, Browser Run, Browser Rendering, Tail Workers, Workers for Platforms, and Sandbox SDK.'
		],
		facts: [
			{ label: 'Best for', value: 'Choosing the next Cloudflare surface' },
			{ label: 'Open next', value: 'The linked binding page or recipe pack' },
			{
				label: 'Search aliases',
				value:
					'AutoRAG, Browser Run, Browser Rendering, Tail Workers, Workers for Platforms, Sandbox SDK'
			}
		],
		sourcePages: [
			'apps/documentation/src/lib/docs/content/examples.ts',
			'packages/devflare/src/config/schema-bindings.ts'
		],
		sections: [
			{
				id: 'chooser',
				title: 'Choose by job',
				table: {
					headers: ['Job', 'Use first', 'Why', 'Docs'],
					rows: [
						[
							'Keyed cache or small lookup table',
							'KV',
							'Fast key-value reads with strong local and offline test options.',
							docsLink('bindings/kv')
						],
						[
							'Relational app data',
							'D1',
							'Query-shaped data with local SQL-shaped tests.',
							docsLink('bindings/d1')
						],
						[
							'Files, uploads, generated assets',
							'R2',
							'Object storage; route browser delivery intentionally.',
							docsLink('bindings/r2')
						],
						[
							'One identity owns state or coordination',
							'Durable Objects',
							'State and coordination behind a stable object id.',
							docsLink('bindings/durable-objects')
						],
						[
							'Deferred work, retries, batches',
							'Queues',
							'Move work out of the request path and test with `cf.queue`.',
							docsLink('bindings/queues')
						],
						[
							'Existing Postgres path',
							'Hyperdrive',
							'Keep the database remote and document the boundary.',
							docsLink('bindings/hyperdrive')
						],
						[
							'AI inference or vector/search work',
							'AI, Vectorize, AI Search',
							'Use remote-boundary tests when Cloudflare owns the result quality.',
							docsLink('bindings/ai')
						],
						[
							'Email sending or inbound email handler',
							'Send Email plus email handler tests',
							'Keep outbound and inbound contracts separate.',
							docsLink('bindings/send-email')
						],
						[
							'Headless browser work',
							'Browser Rendering',
							'Local checks prove code shape; Cloudflare owns browser service fidelity.',
							docsLink('bindings/browser-rendering')
						],
						[
							'Images or media transformations',
							'Images or Media Transformations',
							'Pure mocks prove call shape; remote checks prove product fidelity.',
							docsLink('bindings/images')
						],
						[
							'Worker-to-worker composition',
							'Services plus `ref()`',
							'Make real worker boundaries visible in config and tests.',
							docsLink('bindings/services')
						],
						[
							'Offline test without Miniflare',
							'`createOfflineEnv()` or `createMockEnv()`',
							'Use pure fixtures when runtime dispatch is not the thing under test.',
							docsLink('test-helper-reference')
						]
					]
				}
			}
		]
	},
	{
		slug: 'feature-index',
		group: 'Guides',
		navTitle: 'Feature index',
		readTime: '6 min read',
		eyebrow: 'Support matrix',
		title: 'Scan local, remote, test, preview, and docs support in one table',
		summary:
			'This page is the compact feature support index that keeps local support, remote support, test helpers, preview lifecycle, and docs links in one place.',
		description:
			'Use the feature index when you already know the feature name and need to decide whether the next proof belongs in pure unit tests, `createTestContext`, a Docker/Podman lane, or a Cloudflare-authenticated remote lane.',
		highlights: [
			'Local support and remote support are separate columns.',
			'Test helpers are named explicitly so examples are easy to copy.',
			'Preview lifecycle says whether Devflare manages resources, reports warnings, or leaves ownership to the product.',
			'The docs integrity suite snapshots this table so support claims cannot drift silently.'
		],
		facts: [
			{ label: 'Best for', value: 'Support stance lookup' },
			{ label: 'Snapshot source', value: '`featureRows` in docs content' },
			{
				label: 'Remote rule',
				value: 'Remote-only behavior gets `shouldSkip.*` or a dedicated deploy smoke test'
			}
		],
		sourcePages: [
			'apps/documentation/src/lib/docs/content/examples.ts',
			'packages/devflare/src/test/offline-bindings.ts',
			'packages/devflare/src/test/should-skip.ts'
		],
		sections: [
			{
				id: 'matrix',
				title: 'Feature support matrix',
				table: {
					headers: [
						'Feature',
						'Local support',
						'Remote support',
						'Test helper',
						'Preview lifecycle',
						'Docs'
					],
					rows: featureRows
				}
			}
		]
	},
	{
		slug: 'recipe-packs',
		group: 'Guides',
		navTitle: 'Recipe packs',
		readTime: '9 min read',
		eyebrow: 'Examples registry',
		title: 'Thread copyable recipe packs together instead of hunting isolated snippets',
		summary:
			'The recipe registry collects the major multi-file examples developers need: worker-only APIs, storage, Durable Objects, queues, service bindings, SvelteKit, offline-first tests, remote-boundary tests, containers, and preview lifecycle.',
		description:
			'Each recipe starts with real filenames and stays small enough to copy. The matching case or test references point to executable examples when the repo already has one.',
		highlights: [
			'Every recipe names the file it belongs to.',
			'Recipes are designed to chain: route tree, then binding, then test, then deploy.',
			'Examples link back to cases or stable tests when they are suitable learning material.',
			'Remote and container lanes are skip-gated instead of pretending every runner has Cloudflare auth or Docker.'
		],
		facts: [
			{ label: 'Best for', value: 'Copying a coherent example pack' },
			{ label: 'Registry shape', value: 'Docs-app examples, not a second Markdown handbook' },
			{ label: 'Proof links', value: 'Cases and stable tests where available' }
		],
		sourcePages: [
			'apps/documentation/src/lib/docs/content/examples.ts',
			'cases/*',
			'packages/devflare/tests/*'
		],
		sections: [
			{
				id: 'packs',
				title: 'Available recipe packs',
				table: {
					headers: ['Pack', 'What it includes', 'Executable reference'],
					rows: recipeRows
				}
			},
			{
				id: 'worker-api',
				title: 'Worker-only API with route tree, middleware, env vars, and tests',
				snippets: [
					{
						title: 'Route tree recipe pack',
						activeFile: 'src/routes/notes/[id].ts',
						files: workerOnlyRecipeFiles
					}
				],
				cards: [
					{
						title: 'Case 1',
						body: 'Minimal Worker shape.',
						href: caseLink('case1'),
						label: 'Case'
					},
					{
						title: 'Case 8',
						body: 'Route module dispatch patterns.',
						href: caseLink('case8'),
						label: 'Case'
					}
				]
			},
			{
				id: 'storage',
				title: 'KV cache plus D1 source-of-truth plus R2 file route',
				snippets: [
					{
						title: 'Storage recipe pack',
						activeFile: 'src/routes/files/[key].ts',
						files: storageRecipeFiles
					}
				]
			},
			{
				id: 'durable-object',
				title: 'Durable Object counter or room-style state with route and test',
				snippets: [
					{
						title: 'Durable Object recipe pack',
						activeFile: 'src/do/counter.ts',
						files: durableObjectRecipeFiles
					}
				],
				cards: [
					{
						title: 'Case 3',
						body: 'Durable Objects and WebSockets.',
						href: caseLink('case3'),
						label: 'Case'
					},
					{
						title: 'Case 19',
						body: 'Transport and DO RPC custom class round trips.',
						href: caseLink('case19'),
						label: 'Case'
					}
				]
			},
			{
				id: 'async-work',
				title: 'Queue producer or consumer plus scheduled maintenance job',
				snippets: [
					{
						title: 'Queue and scheduled recipe pack',
						activeFile: 'tests/queue.test.ts',
						files: queueRecipeFiles
					}
				],
				cards: [
					{
						title: 'Case 6',
						body: 'Queues, scheduled work, and tests.',
						href: caseLink('case6'),
						label: 'Case'
					}
				]
			},
			{
				id: 'services',
				title: 'Service bindings with `ref()` and named entrypoints',
				snippets: [
					{
						title: 'Service binding recipe pack',
						activeFile: 'devflare.config.ts',
						files: serviceBindingRecipeFiles
					}
				],
				cards: [
					{
						title: 'Case 5',
						body: 'Multi-worker service bindings with RPC.',
						href: caseLink('case5'),
						label: 'Case'
					}
				]
			},
			{
				id: 'sveltekit',
				title: 'SvelteKit with Devflare platform glue and deployment commands',
				snippets: [
					{
						title: 'SvelteKit platform recipe pack',
						activeFile: 'src/routes/+page.server.ts',
						files: svelteKitRecipeFiles
					}
				],
				cards: [
					{
						title: 'Case 18',
						body: 'SvelteKit and Durable Object integration.',
						href: caseLink('case18'),
						label: 'Case'
					}
				]
			},
			{
				id: 'offline-remote-containers',
				title: 'Offline-first, remote-boundary, and container test lanes',
				snippets: [
					{
						title: 'Testing boundary recipe pack',
						activeFile: 'tests/offline-env.test.ts',
						files: offlineRecipeFiles
					}
				]
			},
			{
				id: 'preview',
				title:
					'Preview deploy lifecycle with `preview.scope()`, inspection, cleanup, and GitHub feedback',
				snippets: [
					{
						title: 'Preview lifecycle recipe pack',
						activeFile: '.github/workflows/preview.yml',
						files: previewRecipeFiles
					}
				]
			}
		]
	},
	{
		slug: 'case-catalog',
		group: 'Guides',
		navTitle: 'Case catalog',
		readTime: '6 min read',
		eyebrow: 'Executable examples',
		title: 'Use the case apps as a compact example catalog',
		summary:
			'The cases are learning material when they show a public pattern and regression coverage when they prove an internal edge. This page explains which is which.',
		description:
			'Each standalone `cases/case*` package should have a purpose, file map, run command, docs links, what it proves, and support status in `cases/README.md`.',
		highlights: [
			'Case docs should be a catalog, not a second long-form guide.',
			'Public learning cases link back to recipe or binding pages.',
			'Internal regression cases stay documented, but their caveats are explicit.',
			'The docs integrity test compares `cases/*` directories with the case README.'
		],
		facts: [
			{ label: 'Best for', value: 'Choosing a runnable example' },
			{ label: 'Run shape', value: '`cd cases/caseN && bun test`' },
			{ label: 'Freshness gate', value: 'Case directories must appear in `cases/README.md`' }
		],
		sourcePages: ['cases/README.md', 'cases/*'],
		sections: [
			{
				id: 'selected-cases',
				title: 'Selected learning cases',
				cards: [
					{
						title: 'Basic Worker',
						body: 'Smallest worker package and request test.',
						href: caseLink('case1'),
						label: 'case1'
					},
					{
						title: 'Durable Objects',
						body: 'Object state, migrations, and local harness behavior.',
						href: caseLink('case3'),
						label: 'case3'
					},
					{
						title: 'Service bindings',
						body: '`ref()` and multi-worker RPC.',
						href: caseLink('case5'),
						label: 'case5'
					},
					{
						title: 'Queues and crons',
						body: 'Queue consumer and scheduled trigger helpers.',
						href: caseLink('case6'),
						label: 'case6'
					},
					{
						title: 'SvelteKit',
						body: 'Framework platform glue with Devflare config.',
						href: caseLink('case18'),
						label: 'case18'
					},
					{
						title: 'Transport and DO RPC',
						body: 'Custom class transport through object calls.',
						href: caseLink('case19'),
						label: 'case19'
					}
				]
			}
		]
	},
	{
		slug: 'learn-from-real-tests',
		group: 'Guides',
		navTitle: 'Real tests',
		readTime: '5 min read',
		eyebrow: 'Executable reference',
		title: 'Learn from stable tests when the docs recipe is not deep enough',
		summary:
			'Use selected unit and integration tests as advanced examples, with short notes about what each test proves.',
		description:
			'Tests are not beginner docs, but they are excellent advanced reference when a feature depends on startup behavior, config autodiscovery, offline support, or platform boundaries.',
		highlights: [
			'Docs pages should link tests only when those tests are stable enough to learn from.',
			'Tests explain edge behavior better than prose once the beginner recipe already works.',
			'Remote and container tests are useful because they show skip behavior explicitly.'
		],
		facts: [
			{ label: 'Best for', value: 'Advanced examples and edge behavior' },
			{ label: 'Do not start here', value: 'Use recipes before source-level tests' },
			{
				label: 'Stable references',
				value: 'Unit docs tests, offline-bindings tests, test-context integration tests'
			}
		],
		sourcePages: [
			'packages/devflare/tests/unit/test/offline-bindings.test.ts',
			'packages/devflare/tests/integration/test-context/config-autodiscovery.test.ts',
			'packages/devflare/tests/unit/docs/documentation-integrity.test.ts'
		],
		sections: [
			{
				id: 'test-map',
				title: 'Stable tests worth reading',
				table: {
					headers: ['Test file', 'What it teaches', 'Read after'],
					rows: [
						[
							'`packages/devflare/tests/unit/docs/documentation-integrity.test.ts`',
							'Docs drift gates for snippets, API claims, schema keys, CLI docs, cases, and generated handbook.',
							docsLink('docs-release-gates')
						],
						[
							'`packages/devflare/tests/unit/test/offline-bindings.test.ts`',
							'`createOfflineEnv`, fixtures, and the offline support matrix.',
							docsLink('test-helper-reference')
						],
						[
							'`packages/devflare/tests/integration/test-context/config-autodiscovery.test.ts`',
							'How `createTestContext()` finds config and conventional handler files.',
							docsLink('create-test-context')
						],
						[
							'`cases/case19/tests/counter.test.ts`',
							'Transport-backed Durable Object RPC with custom class round trips.',
							docsLink('bindings/durable-objects')
						],
						[
							'`cases/case12/tests/email.test.ts`',
							'Inbound email helper coverage and the Email Routing ingress caveat.',
							docsLink('bindings/send-email')
						]
					]
				}
			}
		]
	},
	{
		slug: 'runtime-handler-styles',
		group: 'Devflare',
		navTitle: 'Handler styles',
		readTime: '6 min read',
		eyebrow: 'Runtime',
		title: 'Use event-first handlers by default and mark ambiguous handler styles explicitly',
		summary:
			'Devflare runtime supports event-first handlers, request-wide `sequence()` middleware, route method handlers, and explicit markers for ambiguous two-argument worker-style or resolve-style functions.',
		description:
			'This page documents `defineFetchHandler`, `sequence`, `markResolveStyle`, `markWorkerStyle`, event-first handlers, and route dispatch with examples that match the actual `devflare/runtime` exports.',
		highlights: [
			'Event-first handlers are the least ambiguous shape.',
			'Use `sequence()` for request-wide middleware.',
			'Use route files for method-specific leaves.',
			'Wrap two-argument handlers with `defineFetchHandler(..., { style })` or a marker.'
		],
		facts: [
			{ label: 'Best for', value: 'Runtime import and dispatch questions' },
			{ label: 'Worker-safe import', value: '`devflare/runtime`' },
			{ label: 'Ambiguous case', value: 'Two-argument fetch handlers' }
		],
		sourcePages: [
			'packages/devflare/src/runtime/middleware.ts',
			'packages/devflare/src/runtime/router/index.ts'
		],
		sections: [
			{
				id: 'copyable-styles',
				title: 'Copy the handler style that matches the job',
				snippets: [
					{
						title: 'Event-first and route-dispatch examples',
						activeFile: 'src/fetch.ts',
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								code: String.raw`import { defineFetchHandler, sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()
	return resolve(event)
}

export const handle = sequence(requestId)

export const fetch = defineFetchHandler(
	(request: Request, env: DevflareEnv) => env.ASSETS.fetch(request),
	{ style: 'worker' }
)`
							},
							{
								path: 'src/routes/health.ts',
								language: 'ts',
								code: String.raw`export function GET(): Response {
	return Response.json({ ok: true })
}

export function POST(): Response {
	return new Response(null, { status: 204 })
}`
							},
							{
								path: 'src/legacy.ts',
								language: 'ts',
								code: String.raw`import { markResolveStyle, markWorkerStyle } from 'devflare/runtime'

export const resolveStyle = markResolveStyle(async (event, resolve) => {
	return resolve(event)
})

export const workerStyle = markWorkerStyle((request, env) => {
	return env.ASSETS.fetch(request)
})`
							}
						]
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'The ambiguous error is intentional',
						body: [
							'If a two-argument handler is not marked, Devflare cannot safely know whether it is `(event, resolve)` or `(request, env)`. Mark it instead of relying on parameter names.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'test-helper-reference',
		group: 'Devflare',
		navTitle: 'Test helper reference',
		readTime: '8 min read',
		eyebrow: 'Testing',
		title: 'Document every public `devflare/test` helper by the smallest useful use',
		summary:
			'Use this reference when you know you need the test package but not which helper surface is the smallest truthful proof.',
		description:
			'The `devflare/test` entrypoint intentionally has multiple lanes: runtime-shaped tests, direct event helpers, pure mocks, offline envs, remote-boundary guards, and Docker/Podman-gated container helpers.',
		highlights: [
			'`createTestContext`, `cf`, and `env.dispose` are the default worker-shaped lane.',
			'Pure mocks are for small units where runtime dispatch is not the question.',
			'Remote and container helpers must be skip-gated.',
			'Internal/advanced helpers are marked as such instead of being hidden in prose.'
		],
		facts: [
			{ label: 'Best for', value: 'Choosing and importing test helpers' },
			{
				label: 'Default import',
				value: '`import { cf, createTestContext, env } from "devflare/test"`'
			},
			{ label: 'Cleanup', value: '`afterAll(() => env.dispose())`' }
		],
		sourcePages: [
			'packages/devflare/src/test/index.ts',
			'packages/devflare/src/test/cf.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts',
			'packages/devflare/src/test/containers.ts'
		],
		sections: [
			{
				id: 'helper-table',
				title: 'Helper map',
				table: {
					headers: ['Export family', 'Smallest use', 'Status'],
					rows: [
						[
							'`createTestContext`, `env`, `cf`',
							'Runtime-shaped Worker tests with cleanup.',
							'Recommended'
						],
						[
							'`cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, `cf.tail`',
							'Trigger the matching Worker surface directly.',
							'Recommended'
						],
						[
							'`worker`, `queue`, `scheduled`, `email`, `tail`',
							'Direct helper modules behind the unified `cf` API.',
							'Advanced'
						],
						[
							'`createOfflineEnv`, `createOfflineBindings`, `describeOfflineSupport`, `getOfflineSupportMatrix`',
							'Pure config-derived binding fixtures without runtime startup.',
							'Recommended for offline-first unit tests'
						],
						[
							'`createMockKV`, `createMockD1`, `createMockR2`, `createMockQueue`, `createMockEnv`',
							'Small pure unit tests without Miniflare.',
							'Recommended when runtime dispatch is irrelevant'
						],
						[
							'`createMockRateLimit`, `createMockVersionMetadata`, `createMockWorkerLoader`, `createMockSecretsStoreSecret`',
							'Pure fixture for one platform-shaped binding.',
							'Recommended'
						],
						[
							'`createMockMTLSCertificate`, `createMockDispatchNamespace`, `createMockWorkflow`, `createMockPipeline`',
							'Call-shape tests for platform-owned products.',
							'Boundary-aware'
						],
						[
							'`createMockImagesBinding`, `createMockMediaBinding`, `createMockArtifacts`, AI Search mocks',
							'Deterministic local tests for product-shaped APIs.',
							'Boundary-aware'
						],
						[
							'`shouldSkip`',
							'Skip remote, paid, or dependency-heavy checks clearly.',
							'Recommended for CI'
						],
						[
							'`containers`, `createContainerManager`, `detectContainerEngine`, `getContainerSkipReason`, `stopActiveContainers`',
							'Docker/Podman-gated local container tests.',
							'Integration lane'
						],
						[
							'`resolveServiceBindings`, `resolveDOBindings`, `clearBundleCache`',
							'Service-binding and cross-worker DO resolution internals.',
							'Advanced/internal'
						]
					]
				}
			},
			{
				id: 'exact-export-index',
				title: 'Exact value export index',
				table: {
					headers: ['Export', 'Use'],
					rows: [
						['`createTestContext`', 'Boot the nearest Devflare config in the test harness.'],
						['`env`', 'Read bindings and call `env.dispose()` in harness tests.'],
						['`cf`', 'Unified Worker, queue, scheduled, email, and tail trigger API.'],
						['`worker`', 'Direct Worker fetch helper behind `cf.worker`.'],
						['`queue`', 'Direct queue helper behind `cf.queue`.'],
						['`scheduled`', 'Direct scheduled helper behind `cf.scheduled`.'],
						['`email`', 'Direct email helper behind `cf.email`.'],
						['`tail`', 'Direct tail helper behind `cf.tail`.'],
						[
							'`shouldSkip`',
							'Skip Cloudflare-auth, paid, remote, or local engine tests explicitly.'
						],
						['`containers`', 'Default Docker/Podman-backed container manager.'],
						['`createContainerManager`', 'Create an isolated container manager for tests.'],
						['`detectContainerEngine`', 'Check whether Docker or Podman can run.'],
						['`getContainerSkipReason`', 'Explain why a container test should skip.'],
						['`stopActiveContainers`', 'Stop containers after tests finish.'],
						['`createOfflineBindings`', 'Build pure binding fixtures from config.'],
						['`createOfflineEnv`', 'Build an env object for offline-first unit tests.'],
						['`describeOfflineSupport`', 'Read one binding family support stance.'],
						['`getOfflineSupportMatrix`', 'Read the full offline support stance map.'],
						['`createMockAISearchInstance`', 'Mock one AI Search instance.'],
						['`createMockAISearchNamespace`', 'Mock an AI Search namespace.'],
						['`createMockTestContext`', 'Pure test context helper for small units.'],
						['`withTestContext`', 'Scope a pure context to one callback.'],
						['`createMockKV`', 'Mock KV for pure units.'],
						['`createMockD1`', 'Mock D1 for pure units.'],
						['`createMockR2`', 'Mock R2 for pure units.'],
						['`createMockQueue`', 'Mock a Queue producer.'],
						['`createMockRateLimit`', 'Mock Rate Limiting.'],
						['`createMockVersionMetadata`', 'Mock Version Metadata.'],
						['`createMockWorkerLoader`', 'Mock Worker Loaders.'],
						['`createMockMTLSCertificate`', 'Mock an mTLS fetcher.'],
						['`createMockDispatchNamespace`', 'Mock a dispatch namespace.'],
						['`createMockWorkflow`', 'Mock a Workflow binding.'],
						['`createMockPipeline`', 'Mock a Pipelines binding.'],
						['`createMockImagesBinding`', 'Mock Images chains.'],
						['`createMockMediaBinding`', 'Mock Media Transformation chains.'],
						['`createMockArtifacts`', 'Mock Artifacts repo APIs.'],
						['`createMockSecretsStoreSecret`', 'Mock a Secrets Store secret.'],
						['`createMockEnv`', 'Create a pure env with selected mock bindings.'],
						['`hasServiceBindings`', 'Advanced/internal service-binding resolution predicate.'],
						['`resolveServiceBindings`', 'Advanced/internal service-binding resolution.'],
						['`hasCrossWorkerDOs`', 'Advanced/internal cross-worker Durable Object predicate.'],
						['`resolveDOBindings`', 'Advanced/internal Durable Object binding resolution.'],
						['`clearBundleCache`', 'Advanced/internal resolver cache reset for tests.']
					]
				}
			},
			{
				id: 'copyable-helper',
				title: 'Copy the default helper shape',
				snippets: [
					{
						title: 'Worker, event, offline, and boundary tests',
						activeFile: 'tests/worker.test.ts',
						files: offlineRecipeFiles
					}
				]
			},
			{
				id: 'failure-messages',
				title: 'Expected failure and skip behavior',
				table: {
					headers: ['Failure or skip', 'Meaning', 'Fix'],
					rows: [
						[
							'`No devflare config found`',
							'`createTestContext()` could not discover a supported config from the test file.',
							'Pass the config path or move the test under the package root.'
						],
						[
							'`env.dispose is not a function`',
							'The test imported the runtime env proxy instead of the test env.',
							'Use `import { env } from "devflare/test"` in tests.'
						],
						[
							'`shouldSkip.ai` is true',
							'Cloudflare auth or remote AI prerequisites are missing.',
							'Keep the test skipped in local/CI, or enable remote mode in a dedicated lane.'
						],
						[
							'`shouldSkip.containers()` is true',
							'Docker/Podman is missing or not usable in this runner.',
							'Install an engine or keep container tests in an optional integration job.'
						]
					]
				}
			}
		]
	},
	{
		slug: 'deploy-command-recipes',
		group: 'Ship & operate',
		navTitle: 'Deploy recipes',
		readTime: '7 min read',
		eyebrow: 'Deploy',
		title: 'Run deploy commands as explicit recipes with expected files and effects',
		summary:
			'Use build, dry-run, production deploy, named preview deploy, same-worker preview upload, cleanup, and GitHub Actions as separate recipes with visible effects.',
		description:
			'Deploy docs should start from commands a developer can copy and the artifacts or remote effects they should expect, then move caveats into boundary notes after the working recipe.',
		highlights: [
			'`build` writes local artifacts and does not deploy.',
			'`deploy --prod` is production; `deploy --preview <name>` is a named preview scope.',
			'Plain `--preview` and named `--preview <name>` are different preview strategies.',
			'GitHub workflows should be minimal first and policy-heavy later.'
		],
		facts: [
			{ label: 'Best for', value: 'Shipping without guessing target or cleanup behavior' },
			{ label: 'Local artifacts', value: '`.devflare/**` and `.wrangler/deploy/**`' },
			{
				label: 'Remote effects',
				value: 'Only deploy commands with explicit targets touch Cloudflare'
			}
		],
		sourcePages: [
			'packages/devflare/src/cli/commands/deploy.ts',
			'.github/workflows/preview.yml',
			'.github/actions/devflare-deploy/action.yml'
		],
		sections: [
			{
				id: 'commands',
				title: 'Command recipes',
				table: {
					headers: ['Task', 'Command', 'Expected result'],
					rows: [
						[
							'Build local artifacts',
							'`bunx --bun devflare build --env production`',
							'Writes deploy-ready generated output; does not touch Cloudflare.'
						],
						[
							'Inspect compiled config',
							'`bunx --bun devflare config print --format wrangler`',
							'Prints Wrangler-facing config for review.'
						],
						[
							'Dry-run production deploy',
							'`bunx --bun devflare deploy --prod --dry-run`',
							'Exercises deploy planning without uploading.'
						],
						[
							'Production deploy',
							'`bunx --bun devflare deploy --prod`',
							'Uploads to the stable production Worker name.'
						],
						[
							'Same-worker preview upload',
							'`bunx --bun devflare deploy --preview`',
							'Uses Cloudflare same-worker preview behavior and synthetic preview scope.'
						],
						[
							'Named preview scope',
							'`bunx --bun devflare deploy --preview pr-123`',
							'Uses explicit preview scope for resource naming, logs, and cleanup.'
						],
						[
							'Inspect preview bindings',
							'`bunx --bun devflare previews bindings --scope pr-123`',
							'Shows resolved preview resources and worker references.'
						],
						[
							'Clean preview resources',
							'`bunx --bun devflare previews cleanup --scope pr-123 --apply`',
							'Deletes preview-owned resources and dedicated preview workers when applicable.'
						]
					]
				}
			},
			{
				id: 'preview-models',
				title: 'Same-worker preview vs named preview scope',
				table: {
					headers: ['Model', 'Use when', 'Tiny example'],
					rows: [
						[
							'Same-worker preview',
							'You want Cloudflare preview upload behavior and do not need a human-named resource scope.',
							'`devflare deploy --preview`'
						],
						[
							'Named preview scope',
							'You want logs, resource names, cleanup, and GitHub feedback tied to a visible name.',
							'`devflare deploy --preview pr-123`'
						],
						[
							'Branch-scoped worker family',
							'Durable Objects, queues, crons, or service topology need stronger isolation.',
							'`preview.scope()` plus dedicated preview worker naming'
						]
					]
				}
			},
			{
				id: 'lifecycle',
				title: 'Preview resource lifecycle by feature',
				table: {
					headers: ['Feature', 'Lifecycle stance'],
					rows: [
						[
							'KV, D1, R2, Queues, Vectorize',
							'Can be preview-scoped and managed when authored with preview-aware names.'
						],
						[
							'Services and Durable Objects',
							'Worker naming and migrations require explicit preview strategy; cleanup can remove preview-only workers.'
						],
						[
							'Analytics Engine and Browser Rendering',
							'Reported as warnings because there is no ordinary account resource to delete.'
						],
						[
							'Hyperdrive',
							'Cleanup can remove existing preview configs, but database ownership stays product-owned.'
						],
						[
							'AI, Images, Media, Containers',
							'Product-owned remote behavior; use smoke tests and usage limits rather than pretending local cleanup owns the product.'
						]
					]
				}
			},
			{
				id: 'github',
				title: 'Minimal GitHub Actions preview workflow',
				snippets: [
					{
						title: 'Preview workflow',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: previewRecipeFiles[1].code
					}
				]
			}
		]
	},
	{
		slug: 'docs-release-gates',
		group: 'Ship & operate',
		navTitle: 'Docs release gates',
		readTime: '6 min read',
		eyebrow: 'Verification',
		title: 'Make documentation changes part of public API changes',
		summary:
			'Public exports, schema keys, compiler output, typegen, CLI commands, test helpers, and support stances should fail CI when the docs do not change with them.',
		description:
			'This is the maintainer checklist for keeping the docs from becoming a prose archive again. The tests cover drift; the manual QA checklist covers developer paths a test cannot fully feel.',
		highlights: [
			'Docs integrity tests parse snippets and check API, schema, CLI, cases, source metadata, feature matrix, and generated `LLM.md` drift.',
			'Package publish should regenerate `packages/devflare/LLM.md` from the docs model.',
			'Manual QA follows five paths: new user, binding, test, deploy, and remote boundary.',
			'The checklist is intentionally short so it is used.'
		],
		facts: [
			{ label: 'Best for', value: 'Release and review checklists' },
			{ label: 'Main command', value: '`bun run devflare:docs-integrity`' },
			{ label: 'Generated file', value: '`packages/devflare/LLM.md` must match the docs model' }
		],
		sourcePages: [
			'packages/devflare/tests/unit/docs/documentation-integrity.test.ts',
			'packages/devflare/scripts/generate-llm.ts',
			'apps/documentation/src/lib/docs/llm.ts'
		],
		sections: [
			{
				id: 'docs-must-change',
				title: 'Docs must change when these public surfaces change',
				table: {
					headers: ['Changed surface', 'Docs or test that must move'],
					rows: [
						['Public exports', 'Package entrypoint table and export drift test.'],
						[
							'Config schema keys or binding compiler output',
							'Binding guide manifest and schema coverage test.'
						],
						['Typegen output', 'Generated types docs and first binding examples.'],
						['CLI commands or help pages', 'CLI docs and command table drift test.'],
						['`devflare/test` helpers', '`test-helper-reference` and helper coverage checks.'],
						[
							'Cloudflare support stance',
							'`feature-index`, binding pages, and support matrix snapshot.'
						],
						[
							'Docs content model',
							'Regenerate `packages/devflare/LLM.md` and pass generated handbook drift check.'
						]
					]
				}
			},
			{
				id: 'manual-qa',
				title: 'Final manual QA checklist',
				bullets: [
					'New user path: `first-worker` -> `first-unit-test` -> `first-route-tree` works as a narrative.',
					'Binding path: `binding-chooser` -> one binding page -> matching recipe or case link.',
					'Test path: `test-helper-reference` names the smallest helper and cleanup pattern.',
					'Deploy path: `deploy-command-recipes` distinguishes build, dry-run, prod, preview, and cleanup.',
					'Remote-boundary path: `feature-index` and binding pages make auth, Docker/Podman, paid services, and skips explicit.'
				]
			}
		]
	},
	{
		slug: 'bridge-architecture-internals',
		group: 'Devflare',
		navTitle: 'Bridge internals',
		sidebarHidden: true,
		readTime: '3 min read',
		eyebrow: 'Internal architecture',
		title: 'Keep bridge architecture documentation behind advanced/internal links',
		summary:
			'The bridge architecture document remains valuable, but it should not be on the first-hour developer path.',
		description:
			'Link the bridge architecture doc only from advanced runtime, transport, or maintainer pages. Beginner docs should show recipes first and link internals after the developer already has a working example.',
		highlights: [
			'The architecture doc stays preserved.',
			'Internal transport details are linked from advanced docs only.',
			'Beginner pages should not require bridge knowledge before the first route, binding, or test works.'
		],
		facts: [
			{ label: 'Canonical file', value: '`packages/devflare/.docs/BRIDGE_ARCHITECTURE.md`' },
			{ label: 'Audience', value: 'Maintainers and advanced runtime debugging' },
			{ label: 'Linked from', value: 'Transport and project architecture docs' }
		],
		sourcePages: ['packages/devflare/.docs/BRIDGE_ARCHITECTURE.md'],
		sections: [
			{
				id: 'when-to-read',
				title: 'Read this after the recipe path works',
				bullets: [
					'You are debugging the bridge transport or local runtime startup.',
					'You are changing how local RPC, Durable Objects, service bindings, or framework platform glue cross the worker boundary.',
					'You need maintainer context, not first-run setup instructions.'
				]
			}
		]
	}
]
