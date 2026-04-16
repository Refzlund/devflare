import type { DocCodeTreeEntry, DocPage } from '../types'

const docsLink = (slug: string): string => `/docs/${slug}`

const supportCoverageTooltips = {
	Full:
		'Full — Devflare has a first-class config, local runtime, testing, docs, and workflow story for this surface.',
	Partial:
		'Partial — the surface is supported, but important behavior still depends on remote Cloudflare infrastructure or platform caveats.',
	Limited:
		'Limited — there is a real supported lane, but the contract is intentionally narrower today.',
	None:
		'None — Devflare does not model that surface yet, so reach for raw Cloudflare tooling or Wrangler passthrough instead.'
} as const

const firstWorkerConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})`

const firstWorkerFetchCode = String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(url.pathname === '/' ? 'Hello from Devflare' : url.pathname)
}`

const firstWorkerTestCode = String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('hello-worker', () => {
	test('GET / returns text', async () => {
		const response = await cf.worker.get('/')
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('Hello from Devflare')
	})
})`

const firstWorkerStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts' },
	{ path: 'env.d.ts', muted: true }
]

const routedWorkerConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	}
})`

const routedWorkerFetchCode = String.raw`import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'
import { rememberRequest } from './lib/request-context'

async function requestContext(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	rememberRequest()
	return resolve(event)
}

export const handle = sequence(requestContext)`

const requestContextHelperCode = String.raw`import { getFetchEvent, locals } from 'devflare/runtime'

export function rememberRequest(): void {
	locals.requestId = crypto.randomUUID()
}

export function activeRequestPath(): string {
	return getFetchEvent().url.pathname
}

export function activeRequestId(): string {
	return String(locals.requestId)
}

export function activeRouteParam(name: string): string {
	return getFetchEvent().params[name]
}

export async function activeRequestText(): Promise<string> {
	return getFetchEvent().request.text()
}`

const routedWorkerIndexRouteCode = String.raw`import { activeRequestId, activeRequestPath } from '../lib/request-context'

export async function GET(): Promise<Response> {
	return Response.json({
		message: 'Hello from Devflare',
		path: activeRequestPath(),
		requestId: activeRequestId()
	})
}`

const routedWorkerStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts' },
	{ path: 'src/lib', kind: 'folder' },
	{ path: 'src/lib/request-context.ts' },
	{ path: 'src/routes', kind: 'folder' },
	{ path: 'src/routes/index.ts' },
	{ path: 'tests', kind: 'folder', muted: true },
	{ path: 'tests/fetch.test.ts', muted: true },
	{ path: 'env.d.ts', muted: true }
]

const durableObjectConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		},
		transport: 'src/transport.ts',
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: 'Counter'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['Counter']
		}
	]
})`

const durableObjectRouteCode = String.raw`import { env } from 'devflare'
import { activeRequestId, activeRequestPath } from '../lib/request-context'

export async function GET(): Promise<Response> {
	const id = env.COUNTER.idFromName('global')
	const counter = env.COUNTER.get(id)
	const count = await counter.increment()

	return Response.json({
		count: count.value,
		double: count.double,
		path: activeRequestPath(),
		requestId: activeRequestId()
	})
}`

const counterObjectCode = [
	"import { DurableObject } from 'cloudflare:workers'",
	"import { CounterValue } from '../lib/counter-value'",
	'',
	'export class Counter extends ' + 'DurableObject<DevflareEnv> {',
	'\tasync increment(amount: number = 1): Promise<CounterValue> {',
	"\t\tconst count = Number((await this.ctx.storage.get('count')) ?? 0) + amount",
	"\t\tawait this.ctx.storage.put('count', count)",
	'\t\treturn new CounterValue(count)',
	'\t}',
	'}'
].join('\n')

const counterValueCode = String.raw`export class CounterValue {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double(): number {
		return this.value * 2
	}
}`

const counterTransportCode = String.raw`import { CounterValue } from './lib/counter-value'

export const transport = {
	CounterValue: {
		encode: (value: unknown) =>
			value instanceof CounterValue ? value.value : false,
		decode: (value: number) => new CounterValue(value)
	}
}`

const durableObjectBindingsStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts', muted: true },
	{ path: 'src/lib', kind: 'folder' },
	{ path: 'src/lib/counter-value.ts' },
	{ path: 'src/lib/request-context.ts', muted: true },
	{ path: 'src/transport.ts' },
	{ path: 'src/routes', kind: 'folder' },
	{ path: 'src/routes/index.ts', muted: true },
	{ path: 'src/routes/counter.ts' },
	{ path: 'src/do', kind: 'folder' },
	{ path: 'src/do/counter.ts' },
	{ path: 'tests', kind: 'folder', muted: true },
	{ path: 'tests/fetch.test.ts', muted: true },
	{ path: 'env.d.ts', muted: true }
]

const r2ConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	},
	bindings: {
		r2: {
			FILES: 'quickstart-files'
		}
	}
})`

const r2RouteCode = String.raw`import { env } from 'devflare'
import {
	activeRequestPath,
	activeRequestText,
	activeRouteParam
} from '../../lib/request-context'

export async function PUT(): Promise<Response> {
	const key = activeRouteParam('name')
	await env.FILES.put(key, await activeRequestText())

	return Response.json({
		stored: key,
		path: activeRequestPath()
	}, {
		status: 201
	})
}

export async function GET(): Promise<Response> {
	const key = activeRouteParam('name')
	const object = await env.FILES.get(key)
	if (!object) {
		return new Response('Not found', { status: 404 })
	}

	const response = new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'text/plain; charset=utf-8'
		}
	})
	response.headers.set('x-devflare-path', activeRequestPath())
	return response
}`

const r2BindingsStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts', muted: true },
	{ path: 'src/lib', kind: 'folder' },
	{ path: 'src/lib/request-context.ts', muted: true },
	{ path: 'src/routes', kind: 'folder' },
	{ path: 'src/routes/index.ts', muted: true },
	{ path: 'src/routes/files', kind: 'folder' },
	{ path: 'src/routes/files/[name].ts' },
	{ path: 'tests', kind: 'folder', muted: true },
	{ path: 'tests/fetch.test.ts', muted: true },
	{ path: 'env.d.ts', muted: true }
]

const browserConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	},
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})`

const browserRouteCode = String.raw`import puppeteer from '@cloudflare/puppeteer'
import { env } from 'devflare'
import { activeRequestId } from '../lib/request-context'

export async function GET(): Promise<Response> {
	const browser = await puppeteer.launch(env.BROWSER as Parameters<typeof puppeteer.launch>[0])

	try {
		const page = await browser.newPage()
		await page.goto('https://example.com/', { waitUntil: 'load' })
		return Response.json({
			title: await page.title(),
			requestId: activeRequestId()
		})
	} finally {
		await browser.close()
	}
}`

const browserBindingsStructure: DocCodeTreeEntry[] = [
	{ path: 'package.json', muted: true },
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts', muted: true },
	{ path: 'src/lib', kind: 'folder' },
	{ path: 'src/lib/request-context.ts', muted: true },
	{ path: 'src/routes', kind: 'folder' },
	{ path: 'src/routes/index.ts', muted: true },
	{ path: 'src/routes/page-title.ts' },
	{ path: 'tests', kind: 'folder', muted: true },
	{ path: 'tests/fetch.test.ts', muted: true },
	{ path: 'env.d.ts', muted: true }
]

export const startHereDocs: DocPage[] = [
	{
		slug: 'what-devflare-is',
		group: 'Quickstart',
		navTitle: 'Why Devflare',
		readTime: '7 min read',
		eyebrow: 'Why it helps',
		title: 'Why Devflare feels better than stitching Cloudflare Worker workflows together by hand',
		summary:
			'Devflare gives you one clearer story for config, worker compilation, local development, runtime helpers, testing, and deploy flows so a Worker app can stay small at the start and still stay coherent as it grows.',
		description:
			'The goal is not to hide Cloudflare. The goal is to keep authored code split by responsibility, let generated output and Rolldown-backed worker compilation stay in their own lane, and give you a smoother path from one worker to routing, bindings, frameworks, previews, and automation.',
		highlights: [
			'Start with one config file, one dev command, generated types, and runtime-shaped tests instead of assembling each piece separately.',
			'Keep the code surface split by job: `devflare/config`, `devflare/runtime`, `devflare/test`, and dedicated `vite` or `sveltekit` lanes instead of one giant catch-all entrypoint.',
			'Keep Worker code worker-first: explicit surfaces, small handlers, readable config, and Rolldown-backed worker compilation before framework glue enters the picture.',
			'Scale into Vite and SvelteKit without replacing the worker-first story; in local dev, framework endpoints can still talk to Cloudflare-shaped bindings through the bridge-backed platform surface.',
			'Keep preview, cleanup, and production operations explicit instead of burying them in undocumented shell habits.',
			'Stay close to the real Cloudflare platform contract instead of learning a fantasy abstraction you have to unlearn later.'
		],
		facts: [
			{ label: 'Best for', value: 'Teams that want Cloudflare power without accumulating setup glue' },
			{ label: 'Architecture shape', value: 'Config, runtime, tests, framework integration, and Cloudflare ops are separate by design' },
			{ label: 'Build lane', value: 'Rolldown composes worker and Durable Object artifacts; Vite stays optional' },
			{ label: 'Still true', value: 'Cloudflare limits and Wrangler-compatible output still matter' }
		],
		sourcePages: [
			'README.md',
			'foundation.md',
			'package.json',
			'config-entry.ts',
			'context.ts',
			'browser.ts',
			'worker-entry/composed-worker.ts',
			'worker-entry/routes.ts',
			'bundler/rolldown-shared.ts',
			'schema-bindings.ts',
			'ref.ts',
			'bridge/proxy.ts',
			'bridge/server.ts',
			'dev-server/server.ts',
			'src/runtime/middleware.ts',
			'remote-ai.ts',
			'remote-vectorize.ts',
			'preview-resources.ts',
			'vite/plugin.ts',
			'sveltekit/platform.ts',
			'cli/commands/deploy.ts',
			'cli/commands/previews.ts'
		],
		sections: [
			{
				id: 'why-teams-reach',
				title: 'Why teams reach for Devflare in the first place',
				description:
					'Most people do not adopt Devflare because they want more abstraction. They adopt it because raw Worker projects can accumulate too many small decisions in too many places.',
				paragraphs: [
					'Without some structure, config lives in one file, generated artifacts in another, tests invent their own fake runtime, and preview or deploy behavior becomes whichever shell snippet the team last copied forward.',
					'Devflare gives those pieces one authored story: readable config, worker-shaped runtime helpers, generated worker composition, a bridge-backed local loop, and deploy or preview flows that stay explicit instead of magical.'
				],
				cards: [
					{
						title: 'Less glue code',
						body: 'Keep stable intent in authored config instead of scattering worker names, resource ids, and generated file edits across the repo.'
					},
					{
						title: 'Split by responsibility',
						body: 'Config authoring, runtime helpers, tests, framework hooks, and Cloudflare operations live in separate lanes instead of one catch-all surface.'
					},
					{
						title: 'Worker-aware compilation',
						body: 'Author routes, surfaces, and Durable Objects as app code, then let Devflare and Rolldown compose the runtime-facing artifacts.'
					},
					{
						title: 'Cleaner local and framework loop',
						body: 'Use one worker-aware development story that can stay worker-only or plug into Vite and SvelteKit when the package actually needs them.'
					},
					{
						title: 'Tests that resemble production',
						body: 'Reach for the built-in runtime-shaped test harness before custom mocks drift away from how the Worker actually behaves.'
					}
				]
			},
			{
				id: 'why-the-codebase-stays-coherent',
				title: 'Why the codebase stays coherent as the app grows',
				description:
					'The implementation splits by environment and lifecycle so the worker story can grow without collapsing into one giant tool blob.',
				paragraphs: [
					'`devflare/config` is for authored config, `devflare/runtime` is for worker code, `devflare/test` is for harnesses, and `devflare/vite` or `devflare/sveltekit` only join the picture when the package grows into a real app host. That split is one of the package\'s quiet strengths.',
					'The build and local-dev story stays honest too. Rolldown is the worker builder, generated entrypoints keep worker surfaces explicit, and Vite or SvelteKit can sit outside the worker runtime instead of swallowing it.'
				],
				cards: [
					{
						title: 'Split package surfaces',
						body: 'Different public entrypoints exist because config authoring, runtime code, tests, framework hosting, and Cloudflare operations are different jobs.'
					},
					{
						title: 'Rolldown owns worker artifacts',
						body: 'Worker and Durable Object bundles are composed and validated for Cloudflare compatibility instead of being treated as generic JavaScript output.'
					},
					{
						title: 'Bridge-backed framework dev',
						body: 'When a package uses Vite or SvelteKit, Devflare keeps Miniflare or workerd on one side, the app host on the other, and bridges bindings back into the framework dev server.'
					},
					{
						title: 'Framework endpoints can still reach worker bindings',
						body: 'In local dev, the framework lane can read Cloudflare-shaped bindings through the bridge-backed platform surface instead of needing a second fake environment.'
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Vite is additive here',
						body: [
							'Vite and SvelteKit are optional outer hosts. The worker runtime, routes, bindings, and generated artifacts remain the core story.'
						],
						cta: {
							description: 'Want support for your framework of choice?',
							label: 'Open an issue',
							href: 'https://github.com/Refzlund/devflare/issues'
						}
					}
				]
			},
			{
				id: 'support-coverage',
				title: 'What Devflare already supports across a real application',
				description:
					'Hover a label to see what it means for config, local runtime, tests, previews, and operational guidance.',
				cards: [
					{
						label: 'Full',
						labelTooltip: supportCoverageTooltips.Full,
						meta: 'HTTP app core',
						title: 'Fetch, routes, and middleware',
						body: 'Worker fetch entrypoints, file routing, and `sequence(...)` middleware are first-class Devflare surfaces with strong local runtime support and clean request-scoped helpers.',
						href: docsLink('http-routing')
					},
					{
						label: 'Full',
						labelTooltip: supportCoverageTooltips.Full,
						meta: 'Storage',
						title: 'KV, D1, and R2',
						body: 'Devflare gives the main storage bindings a strong local-first story: readable config, generated env typing, local runtime behavior, and realistic tests without losing the Cloudflare shape.',
						href: docsLink('storage-bindings')
					},
					{
						label: 'Full',
						labelTooltip: supportCoverageTooltips.Full,
						meta: 'State and async',
						title: 'Durable Objects and queues',
						body: 'Stateful objects and deferred work are treated as real worker surfaces, with config discovery, local runtime wrappers, and test helpers that match the application boundary.',
						href: docsLink('durable-objects-and-queues')
					},
					{
						label: 'Full',
						labelTooltip: supportCoverageTooltips.Full,
						meta: 'Multi-worker',
						title: 'Service bindings and worker composition',
						body: 'Service bindings and `ref()` let worker-to-worker dependencies stay explicit enough for local multi-worker runtime, generated types, and real tests through the same env surface the app uses.',
						href: docsLink('multi-workers')
					},
					{
						label: 'Partial',
						labelTooltip: supportCoverageTooltips.Partial,
						meta: 'Remote database path',
						title: 'Hyperdrive',
						body: 'Hyperdrive is modeled cleanly in config and generated output, but the local and preview ergonomics are more constrained than KV, D1, or R2 because the real database and credentials stay remote.',
						href: docsLink('bindings/hyperdrive')
					},
					{
						label: 'Partial',
						labelTooltip: supportCoverageTooltips.Partial,
						meta: 'Remote platform service',
						title: 'Workers AI',
						body: 'The AI binding is supported in config, types, and deployment flows, but meaningful tests are remote-oriented because real inference still lives on Cloudflare infrastructure.',
						href: docsLink('bindings/ai')
					},
					{
						label: 'Partial',
						labelTooltip: supportCoverageTooltips.Partial,
						meta: 'Remote platform service',
						title: 'Vectorize',
						body: 'Vectorize is fully modeled in config and preview-aware naming, but real inserts and similarity queries still need remote infrastructure and honest remote-mode tests.',
						href: docsLink('bindings/vectorize')
					},
					{
						label: 'Full',
						labelTooltip: supportCoverageTooltips.Full,
						meta: 'Bridge-backed browser lane',
						title: 'Browser Rendering',
						body: 'Browser Rendering is fully supported through Devflare\'s bridge-backed local dev story, config model, generated typing, and runtime integration. The main platform caveat is still the Cloudflare one: exactly one browser binding.',
						href: docsLink('bindings/browser-rendering')
					}
				]
			},
			{
				id: 'devflare-enhancements',
				title: 'What Devflare adds on top of raw Cloudflare workflows',
				description:
					'These are the parts that feel distinctly like Devflare rather than just a thinner wrapper around Wrangler. They are implemented features in their own right, and each one has deeper docs when you want the full story.',
				cards: [
					{
						label: 'Runtime',
						title: 'AsyncLocalStorage-backed context',
						body: 'Devflare stores the active event, env, ctx, request, and locals so helper code can recover the current Worker context without threading it through every function call.',
						href: docsLink('runtime-context')
					},
					{
						label: 'Runtime',
						title: '`sequence(...)` middleware',
						body: 'Request-wide middleware becomes a first-class pattern instead of something every app reinvents in a slightly different fetch wrapper.',
						href: docsLink('sequence-middleware')
					},
					{
						label: 'Testing',
						title: 'Runtime-shaped unit testing and the smart bridge',
						body: 'The default test harness boots a real worker-shaped environment and uses the bridge so tests can talk to workers, bindings, queues, services, and other surfaces without inventing a second fake runtime.',
						href: docsLink('create-test-context')
					},
					{
						label: 'Runtime',
						title: '`transport.ts`',
						body: 'Custom bridge-backed values can round-trip as real classes instead of collapsing into plain JSON when the worker boundary needs richer types.',
						href: docsLink('transport-file')
					},
					{
						label: 'Composition',
						title: 'Multi-worker config references',
						body: '`ref()` and service bindings let one worker depend on another explicitly so config, generated types, local tests, and compiled output all follow the same relationship.',
						href: docsLink('multi-workers')
					},
					{
						label: 'Configuration',
						title: 'Preview scopes and preview bindings',
						body: 'Preview environments can get their own scoped bindings and disposable infrastructure instead of borrowing production resources and hoping everyone remembers that later.',
						href: docsLink('config-previews')
					},
					{
						label: 'Types',
						title: 'Generated types',
						body: 'Generate `env.d.ts` and typed service contracts from the config so the worker surface, bindings, and entrypoints stay aligned with the app you actually run.',
						href: docsLink('generated-types')
					},
					{
						label: 'Operations',
						title: 'Binding-aware deploys',
						body: 'Build, preview, and production commands compile the same binding-aware config into Wrangler-compatible output instead of making you maintain a second deploy-only definition.',
						href: docsLink('production-deploys')
					},
					{
						label: 'Configuration',
						title: '`.env` config-time variables',
						body: 'Devflare reads `.env` while evaluating `devflare.config.*`, which keeps build-time inputs available without blurring them together with runtime `vars` and `secrets`.',
						href: docsLink('config-basics')
					},
					{
						label: 'Frameworks',
						title: 'Full Vite support',
						body: 'If the package is genuinely a Vite app, Devflare plugs into Vite as the outer host while still keeping worker-aware config, bindings, and generated Cloudflare output aligned underneath it.',
						href: docsLink('vite-standalone')
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'This is the real distinction',
						body: [
							'Cloudflare gives you the platform primitives. Devflare adds the authored config model, runtime helpers, bridge-backed local dev, test harnesses, typed generation, and preview-aware workflows that make those primitives feel like one coherent application story.'
						]
					},
					{
						tone: 'accent',
						title: 'Composable infrastructure is intentional',
						body: [
							'Devflare is designed around small, explicit files and runtime surfaces: `src/fetch.ts`, `src/queue.ts`, `src/do/**/*.ts`, route modules, and runtime APIs that let those pieces compose cleanly instead of collapsing into one monolithic worker file.',
							'That same shape works for a tiny project and for a larger enterprise repo. You can keep responsibilities split by surface, file, and package without losing the thread of one coherent Cloudflare application.'
						],
						cta: {
							description: 'Want to see the package and repo shape Devflare is optimized for?',
							label: 'Open the project architecture guide',
							href: docsLink('project-architecture')
						}
					}
				]
			},
			{
				id: 'what-you-get-day-one',
				title: 'What you get on day one',
				steps: [
					'Author one readable `devflare.config.ts` instead of reverse-engineering a generated deployment shape.',
					'Point `files.fetch` at one small handler and let Devflare manage the worker-oriented plumbing around it.',
					'Generate `env.d.ts` so bindings and helper surfaces stay typed without hand-maintained drift.',
					'Use the built-in test harness so your first tests look like the runtime you will actually ship.',
					'Add routes, bindings, frameworks, or preview flows only when the package truly needs them.'
				],
				snippets: [
					{
						title: 'The smallest Devflare project still looks like a real project',
						description:
							'Two authored files teach the whole loop, while generated pieces stay visible without becoming your source of truth.',
						activeFile: 'devflare.config.ts',
						structure: [
							...firstWorkerStructure,
							{ path: '.devflare', kind: 'folder', muted: true },
							{ path: '.devflare/worker-entrypoints/main.ts', muted: true }
						],
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 7]],
								code: firstWorkerConfigCode
							},
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[3, 5]],
								code: firstWorkerFetchCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'The point is fast confidence, not more ceremony',
						body: [
							'If Devflare is helping, your first win should be a small Worker you can understand, run, and test quickly — not a larger setup burden.'
						]
					}
				]
			},
			{
				id: 'where-it-keeps-helping',
				title: 'Where it keeps paying off later',
				bullets: [
					'The package surface stays split by job as the app grows, so config authoring, runtime code, tests, framework hooks, and Cloudflare operations do not collapse into one file or one import path.',
					'Rolldown keeps owning worker and Durable Object compilation, which is why the app can grow new surfaces without hand-maintaining a giant entrypoint.',
					'If the package later needs Vite or SvelteKit, Devflare layers that in as an outer host and uses the bridge-backed platform surface so framework endpoints can still interact with worker bindings in local dev.',
					'Preview scopes, cleanup flows, production operations, and testing helpers stay connected to the same authored config and CLI instead of branching into separate half-documented workflows.'
				]
			},
		]
	},
	{
		slug: 'documentation-contract',
		group: 'Quickstart',
		navTitle: 'Contract map',
		sidebarHidden: true,
		readTime: '5 min read',
		eyebrow: 'Docs model',
		title: 'See how the site model and published `LLM.md` stay aligned',
		summary:
			'The documentation site now owns the authored docs model, while `packages/devflare/LLM.md` remains the generated one-file export shipped with the package.',
		description:
			'The older split handbook content has been folded into `apps/documentation/src/lib/docs/content*.ts`. The site now carries that material as smaller task-focused routes, and the published `packages/devflare/LLM.md` file is generated from the same model when you want one flattened handbook export.',
		highlights: [
			'The structured docs model in `apps/documentation/src/lib/docs/content*.ts` is now the authoritative authoring layer.',
			'Task-focused site routes and the generated handbook export come from the same underlying model.',
			'The package-level `LLM.md` file is generated from the site model and copied into the package before publish.',
			'Focused package references such as `README.md` and implementation files can still inform a page without leaking into the page header.'
		],
		facts: [
			{ label: 'Authoritative authoring layer', value: '`apps/documentation/src/lib/docs/content*.ts`' },
			{ label: 'Primary reading surfaces', value: 'Task-focused `/docs/*` routes plus `/llm.md` and `/llm.txt` exports' },
			{
				label: 'Refresh commands',
				value: '`bun run llm:generate` from `apps/documentation`, or the same command from `packages/devflare` when you also want the packaged copy refreshed'
			}
		],
		sourcePages: [
			'foundation.md',
			'configuration-overview.md',
			'configuration-reference.md',
			'bindings-and-composition.md',
			'development-workflows.md',
			'deploy-preview-cli.md',
			'verification-testing-and-caveats.md',
			'llm.ts',
			'llm-documents.ts',
			'generate-llm.ts'
		],
		sections: [
			{
				id: 'authoritative-layers',
				title: 'Know which layer is authoritative now',
				paragraphs: [
					'The structured documentation model in `apps/documentation/src/lib/docs/content*.ts` is now the source of truth for the authored Devflare handbook. The older split package docs have been folded into that model so the site and exported handbook stay aligned.',
					'The site breaks that material into smaller task-focused routes, while the generated handbook turns the same model into one-file exports for search, review, and package shipping.',
					'The generated `/llm.md` export is the fuller one-file handbook, while `/llm.txt` is the stricter text-oriented subset from the same model and intentionally omits handbook-only sections such as the documentation contract. The published `packages/devflare/LLM.md` file is copied from `/llm.md` before packaging, and none of those exports are meant to be hand-edited source authoring.'
				],
				cards: [
					{
						title: 'Structured docs model',
						body: '`apps/documentation/src/lib/docs/content*.ts` now holds the authored handbook copy, page structure, examples, and task-first route organization.'
					},
					{
						title: 'Task-focused site routes',
						body: 'The site favors smaller routes aimed at one job to be done instead of mirroring the old handbook structure page for page.'
					},
					{
						title: 'Published handbook export',
						body: 'Use `/llm.md` for the fuller generated handbook, `/llm.txt` for the stricter text-oriented subset, and remember that `packages/devflare/LLM.md` is copied from `/llm.md` before publish time.'
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'The safest drift rule',
						body: [
							'If handbook coverage changes, update the matching site pages first, then regenerate the package handbook. If `packages/devflare/LLM.md` says something the site model does not back up, fix the site model and regenerate instead of patching the handbook by hand.'
						]
					}
				]
			},
			{
				id: 'raw-to-site-map',
				title: 'See where the same docs model shows up',
				description:
					'The site and handbook outputs are different reading surfaces backed by one model, not separate sources of truth.',
				table: {
					headers: ['Surface', 'Best when', 'Backed by'],
					rows: [
						[
							'/docs/* routes',
							'You are reading one topic in the site and want navigation, context, and examples inline.',
							'`apps/documentation/src/lib/docs/content*.ts`'
						],
						[
							'/llm.md and /llm.txt',
							'You want the generated handbook as one file: `/llm.md` for the fuller export, `/llm.txt` for the stricter text-oriented subset that omits handbook-only sections such as the documentation contract.',
							'Generated from the same docs model.'
						],
						[
							'`packages/devflare/LLM.md`',
							'You want the published one-file handbook that ships with the package.',
							'Copied from the generated docs export before packaging.'
						]
					]
				}
			},
			{
				id: 'how-to-use-both',
				title: 'Use the site for tasks and the handbook for one-file reading',
				steps: [
					'Start from the task-focused site page when you need to build, review, or debug one specific part of Devflare.',
					'Use `/llm.md` when you want the fullest one-file handbook, `/llm.txt` when you want the stricter text-oriented subset, or the published `packages/devflare/LLM.md` file when you want the package copy that ships.',
					'Run `bun run llm:generate` from `apps/documentation` when you are editing the site model, or from `packages/devflare` when you need the packaged `LLM.md` copy refreshed too.',
					'Let build and prepare hooks regenerate the handbook outputs instead of hand-editing `LLM.md`.'
				],
				callouts: [
					{
						tone: 'success',
						title: 'The intended reading pattern',
						body: [
							'Read the site by job to be done, and use the package-level `LLM.md` when you want the same material in one file.'
						]
					}
				]
			},
			{
				id: 'drift-checks',
				title: 'A good docs drift check is small and specific',
				bullets: [
					'Update the site pages first, then regenerate the handbook outputs.',
					'If the site and `packages/devflare/LLM.md` disagree, fix `apps/documentation/src/lib/docs/content*.ts` and regenerate instead of patching the export by hand.',
					'If a concept stops fitting the current site structure, add or split a page instead of hiding the change in generated output.',
					'Never hand-edit generated `packages/devflare/LLM.md`; regenerate it from the site model after you update the underlying docs.'
				]
			}
		]
	},
	{
		slug: 'first-worker',
		group: 'Quickstart',
		navTitle: 'Your first worker',
		readTime: '5 min read',
		eyebrow: 'First setup',
		title: 'Build your first Devflare worker with the smallest safe setup',
		summary:
			'Start with one config file, one fetch handler, and generated types before you branch into routes, bindings, frameworks, or a deeper test setup.',
		summaryHidden: true,
		description:
			'This page keeps the first pass tiny: explicit `files.fetch`, one small handler, and just enough commands to install Devflare, generate types, and run the worker locally.',
		descriptionHidden: true,
		articleNavigationHidden: true,
		highlights: [
			'Use `devflare/config` in config files and `devflare/runtime` in worker code.',
			'Start with `src/fetch.ts` instead of a full route tree unless you actually need multiple leaves.',
			'Generate `env.d.ts` early so bindings and helper surfaces stay typed.',
			'Add routing, storage, workers, frameworks, and deeper tests only when the worker actually asks for them.'
		],
		facts: [
			{ label: 'Best for', value: 'New packages and first-time Devflare users' },
			{ label: 'Smallest safe shape', value: 'One config and one fetch handler' },
			{ label: 'First commands', value: '`bun add -d devflare`, then `types`, then `dev`' }
		],
		sourcePages: ['README.md', 'foundation.md'],
		sections: [
			{
				id: 'get-started',
				title: 'Get started',
				steps: [
					'Run `bun add -d devflare`.',
					'Create `devflare.config.ts` with an explicit fetch entry.',
					'Add `src/fetch.ts` with one event-first handler.',
					'Run `devflare types` before guessing env types by hand.',
					'Run `devflare dev` and make sure the smallest worker works before you add anything else.'
				],
				snippets: [
					{
						title: 'Install Devflare and boot the worker',
						language: 'bash',
						code: String.raw`bun add -d devflare
bunx --bun devflare types
bunx --bun devflare dev`
					},
					{
						title: 'Start with two files, not a framework maze',
						description:
							'Open the config first, then the fetch handler. That is enough to run, test, and understand before you add anything bigger.',
						activeFile: 'devflare.config.ts',
						structure: firstWorkerStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 8]],
								code: firstWorkerConfigCode
							},
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[3, 5]],
								code: firstWorkerFetchCode
							}
						]
					}
				]
			},
			{
				id: 'start-building',
				title: 'Start building',
				description: 'Pick the next thing you actually need once the first worker is running.',
				cards: [
					{
						label: 'Testing',
						title: 'Write your first unit test',
						body: 'Use the built-in harness before you invent mocks or wrappers.',
						href: docsLink('first-unit-test')
					},
					{
						label: 'Bindings',
						title: 'Try your first bindings',
						body: 'Make one Durable Object, one R2 bucket, or one browser-backed route work without overcomplicating the package.',
						href: docsLink('first-bindings')
					},
					{
						label: 'HTTP',
						title: 'Need multiple URLs?',
						body: 'Add `src/routes/**` when a route tree is easier to reason about than one large fetch handler.',
						href: docsLink('http-routing')
					},
					{
						label: 'Bindings',
						title: 'Need storage choices?',
						body: 'Choose between KV, D1, R2, and Hyperdrive before you open the binding guide that owns the details.',
						href: docsLink('storage-bindings')
					},
					{
						label: 'Bindings',
						title: 'Need state or background work?',
						body: 'Use the state and async patterns page to decide between Durable Objects, queues, or a mix of both.',
						href: docsLink('durable-objects-and-queues')
					},
					{
						label: 'Composition',
						title: 'Need worker composition?',
						body: 'Use service bindings and `ref()` when another worker boundary is real, not just when one file feels crowded.',
						href: docsLink('multi-workers')
					},
					{
						label: 'Frameworks',
						title: 'Need a framework host?',
						body: 'Only opt into Vite-backed mode when the current package actually has a local Vite or framework app.',
						href: docsLink('vite-standalone')
					}
				]
			}
		]
	},
	{
		slug: 'first-unit-test',
		group: 'Quickstart',
		navTitle: 'Your first unit test',
		readTime: '4 min read',
		eyebrow: 'Testing',
		title: 'Write your first unit test with the built-in Devflare harness',
		summary:
			'Take the same starter worker from the previous page and add one request test through `createTestContext()` so the first check uses the same runtime shape the worker will actually run.',
		description:
			'You do not need a custom mock stack to get confidence. Keep `devflare.config.ts` and `src/fetch.ts` as they were, add one `tests/fetch.test.ts` file, and prove the worker responds once.',
		highlights: [
			'Keep the same `devflare.config.ts` and `src/fetch.ts`; add only one new test file.',
			'Use `createTestContext()` before you invent custom mocks.',
			'Hit the worker through `cf.worker.get()` for the first honest proof.',
			'Call `env.dispose()` when the suite is done so the runtime shuts down cleanly.'
		],
		facts: [
			{ label: 'Best for', value: 'The first runtime-shaped test in a new worker package' },
			{ label: 'Main helper', value: '`createTestContext()` plus `cf.worker.get()`' },
			{ label: 'First proof', value: 'One request, one status check, one response assertion' }
		],
		sourcePages: ['README.md', 'foundation.md', 'simple-context.ts', 'cf.ts'],
		sections: [
			{
				id: 'write-one-test',
				title: 'Write one honest test',
				paragraphs: [
					'The easiest continuation from the first worker page is not a refactor. It is one new test file beside the same config and fetch handler.',
					'`createTestContext()` gives that test the same runtime shape Devflare manages locally. Keep the first assertion narrow: one request, one status check, one response body. That already proves the worker, the harness, and your local setup are all talking to each other correctly.'
				],
				snippets: [
					{
						title: 'Keep the first worker, add one test file',
						description:
							'The config and fetch handler stay exactly the same. The only new authored file is the test.',
						activeFile: 'tests/fetch.test.ts',
						structure: [
							{ path: 'devflare.config.ts' },
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'tests', kind: 'folder' },
							{ path: 'tests/fetch.test.ts' },
							{ path: 'env.d.ts', muted: true }
						],
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								code: firstWorkerConfigCode
							},
							{
								path: 'src/fetch.ts',
								language: 'ts',
								code: firstWorkerFetchCode
							},
							{
								path: 'tests/fetch.test.ts',
								language: 'ts',
								focusLines: [[1, 12]],
								code: firstWorkerTestCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Keep the first test boring',
						body: [
							'If the first test is obvious, failures are obvious too. That is what you want while the worker is still tiny.'
						]
					}
				]
			},
			{
				id: 'what-it-unlocks',
				title: 'What this unlocks next',
				bullets: [
					'You can keep the same harness when the worker grows routes, queue consumers, scheduled handlers, or other runtime surfaces.',
					'One request-level smoke test is still useful even after helpers and abstractions appear around the worker.',
					'When you need the deeper test surface, open `/docs/create-test-context` for the full helper map.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'The next docs page when tests grow up',
						body: [
							'Use `create-test-context` when you need more than one request test and want the full runtime helper surface laid out clearly.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'first-bindings',
		group: 'Quickstart',
		navTitle: 'Your first bindings',
		readTime: '6 min read',
		eyebrow: 'Bindings',
		title: 'Try your first bindings by growing the same worker one route at a time',
		summary:
			'Take the same starter worker, split it into routes and helpers, then add one binding-backed route at a time so `src/fetch.ts` can stay small.',
		description:
			'Keep one worker shape throughout: a tiny `src/fetch.ts`, a `src/routes/**` tree for leaf handlers, and one shared helper module that can read or write the active request context through `devflare/runtime` when that keeps the code cleaner.',
		highlights: [
			'Keep one worker shape throughout instead of treating each binding as a different mini-app.',
			'Use `files.routes` so Devflare route handling becomes explicit as soon as the package grows beyond one fetch file.',
			'Let shared helpers use `getFetchEvent()` and `locals` from `devflare/runtime` inside the active request trail instead of threading request ids, params, and request reads through every function.',
			'Generate `env.d.ts` after binding changes so the runtime surface stays typed.',
			'Add one binding-backed route at a time: first a counter, then a stored file, then one browser title read.'
		],
		facts: [
			{ label: 'Best for', value: 'Growing the first worker without turning `src/fetch.ts` into one crowded file' },
			{ label: 'Base shape', value: 'Tiny `src/fetch.ts` plus `src/routes/**` and shared helpers' },
			{ label: 'Habit to keep', value: '`bunx --bun devflare types` after binding changes' }
		],
		sourcePages: ['README.md', 'schema-bindings.ts', 'case3/*', 'case18/*', 'case19/*'],
		sections: [
			{
				id: 'pick-one-binding',
				title: 'Keep the same worker, but split it into routes and helpers',
				description:
					'The additive move after the first worker is not a different app. It is the same worker with one tiny fetch entry, one route tree, and one shared request helper.',
				paragraphs: [
					'Once the first worker responds and maybe already has one small test, the next step is to keep `src/fetch.ts` tiny. Let it do request-wide setup, then let `src/routes/**` own the individual URLs.',
					'That shape also makes Devflare\'s AsyncLocalStorage-backed runtime helpful in a calm way: helper modules can read the active request path, route params, request body, or request id through `getFetchEvent()` and `locals` without turning every function signature into plumbing.'
				],
				steps: [
					'Keep `src/fetch.ts` for request-wide setup only.',
					'Add `files.routes` so the route tree is explicit in config.',
					'Move URL-specific work into `src/routes/**` files.',
					'Put shared request helpers in `src/lib/**` and let them read active request context from `devflare/runtime` when that keeps route files cleaner.',
					'Add one binding-backed route at a time instead of rebuilding the worker from scratch.'
				],
				snippets: [
					{
						title: 'Keep the same worker, but let routes and helpers do the growing',
						description:
							'The fetch file stays tiny. Routes own URLs, and one helper module reads and writes the active request context through Devflare runtime when you need it.',
						activeFile: 'src/fetch.ts',
						structure: routedWorkerStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 11]],
								code: routedWorkerConfigCode
							},
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[5, 10]],
								code: routedWorkerFetchCode
							},
							{
								path: 'src/lib/request-context.ts',
								language: 'ts',
								focusLines: [[1, 18]],
								code: requestContextHelperCode
							},
							{
								path: 'src/routes/index.ts',
								language: 'ts',
								focusLines: [[1, 8]],
								code: routedWorkerIndexRouteCode
							}
						]
					}
				],
				cards: [
					{
						title: 'Durable Object',
						body: 'Add one counter route that forwards to one object class and keeps state there.'
					},
					{
						title: 'R2 bucket',
						body: 'Add one route that stores and reads one named file without bloating the global fetch file.'
					},
					{
						title: 'Browser Rendering',
						body: 'Add one route that opens a page and returns its title so the browser binding stays obvious.'
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'This is still the same worker',
						body: [
							'You are not swapping architectures here. You are just letting `src/fetch.ts` stay small while routes and helpers take the extra responsibility.'
						]
					}
				]
			},
			{
				id: 'durable-object-counter',
				title: 'Add one Durable Object-backed route',
				description:
					'Keep the same route-based worker and add one counter route, one transport file, and one object class.',
				paragraphs: [
					'Use the same `src/fetch.ts`, the same request helper, and the same route tree. The new work lives in one route file that talks to one Durable Object namespace through a custom `increment()` method.',
					'That keeps the route honest: the HTTP path stays in `src/routes/counter.ts`, the stateful method stays in `src/do/counter.ts`, and `src/transport.ts` restores the returned value object cleanly on the worker side.'
				],
				snippets: [
					{
						title: 'Same worker, now add a counter route, transport, and one Durable Object',
						description:
							'The familiar fetch file and helper stay in place. You add the binding config, one transport file, the counter route, and the object class that exposes a custom `increment()` method.',
						activeFile: 'src/routes/counter.ts',
						structure: durableObjectBindingsStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[6, 23]],
								code: durableObjectConfigCode
							},
							{
								path: 'src/routes/counter.ts',
								language: 'ts',
								focusLines: [[1, 13]],
								code: durableObjectRouteCode
							},
							{
								path: 'src/transport.ts',
								language: 'ts',
								focusLines: [[1, 8]],
								code: counterTransportCode
							},
							{
								path: 'src/lib/counter-value.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: counterValueCode
							},
							{
								path: 'src/do/counter.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: counterObjectCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Why this is a good first Durable Object',
						body: [
							'It proves binding lookup, object identity, route-to-object flow, and persisted state without turning the whole worker into object-specific plumbing.'
						]
					}
				]
			},
			{
				id: 'r2-round-trip',
				title: 'Add one R2-backed route',
				description:
					'Keep the same worker shape and let one route file own the bucket round-trip.',
				paragraphs: [
					'Here the route path becomes the obvious home for the binding: `src/routes/files/[name].ts` owns both the `PUT` and `GET` flow for one named object.',
					'The shared helper still provides request-wide context, route params, and request reads through AsyncLocalStorage, while the route file keeps the bucket contract visible and local to the URL that needs it.'
				],
				snippets: [
					{
						title: 'Same worker, now add one file route and one bucket binding',
						description:
							'The global fetch file stays tiny. The new work lives in one route file under `src/routes/files/[name].ts`, while the helper module still reads the active request through AsyncLocalStorage-backed runtime helpers.',
						activeFile: 'src/routes/files/[name].ts',
						structure: r2BindingsStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[6, 17]],
								code: r2ConfigCode
							},
							{
								path: 'src/routes/files/[name].ts',
								language: 'ts',
								focusLines: [[1, 29]],
								code: r2RouteCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Why this is a good first R2 route',
						body: [
							'It proves route params, the bucket binding, and a clean read/write boundary without teaching a giant upload architecture before the first success.'
						]
					}
				]
			},
			{
				id: 'browser-title-read',
				title: 'Add one browser-backed route',
				description:
					'Keep the same worker shape and let one route prove the browser binding.',
				paragraphs: [
					'Browser Rendering gets simpler when it looks like the other examples: the shared fetch file stays untouched, and one route file owns the browser work.',
					'Install `@cloudflare/puppeteer` before you try this route, and remember that Devflare currently supports exactly one browser binding in config.'
				],
				snippets: [
					{
						title: 'Same worker, now add one browser-backed route',
						description:
							'The route tree grows by one file, and the helper still gives that route access to request-scoped context without bloating `src/fetch.ts`.',
						activeFile: 'src/routes/page-title.ts',
						structure: browserBindingsStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[6, 17]],
								code: browserConfigCode
							},
							{
								path: 'src/routes/page-title.ts',
								language: 'ts',
								focusLines: [[1, 16]],
								code: browserRouteCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Keep the first browser path skinny',
						body: [
							'One title read is enough to prove the binding. Save screenshots, PDFs, and longer browser workflows for the next pass once the launch path is already trustworthy.'
						]
					}
				]
			},
			{
				id: 'go-deeper',
				title: 'Go deeper when the first quick win works',
				description:
					'Once one tiny example works locally, jump to the dedicated binding guides for the bigger caveats, testing patterns, and architecture choices.',
				cards: [
					{
						label: 'Bindings',
						title: 'Durable Objects guide',
						body: 'Read the fuller guidance on stateful objects, migrations, previews, and local testing.',
						href: docsLink('bindings/durable-objects')
					},
					{
						label: 'Bindings',
						title: 'R2 guide',
						body: 'Open the deeper R2 page for delivery boundaries, testing patterns, and storage architecture choices.',
						href: docsLink('bindings/r2')
					},
					{
						label: 'Bindings',
						title: 'Browser Rendering guide',
						body: 'Open the browser guide when you need the single-binding caveat, dev-server details, or heavier browser workflows.',
						href: docsLink('bindings/browser-rendering')
					}
				]
			}
		]
	},
	{
		slug: 'deploy-and-preview',
		group: 'Quickstart',
		navTitle: 'Deploy and Preview',
		readTime: '4 min read',
		eyebrow: 'Ship it',
		title: 'Deploy one preview, then delete it cleanly',
		summary:
			'Take the same starter worker, ship one named preview, then remove that preview scope cleanly.',
		description:
			'The project tree does not need to become more complicated for the first deploy. Use the same small worker, one memorable preview name, and one equally explicit cleanup command.',
		highlights: [
			'Deploys are explicit: preview always uses `--preview <name>`.',
			'Use one memorable scope name like `next` or `pr-123` and reuse it consistently.',
			'Deleting a preview should be just as explicit as creating it.',
			'Once the first preview works, move on to the deeper production and workflow docs.'
		],
		facts: [
			{ label: 'Best for', value: 'The first named preview deploy and cleanup loop' },
			{ label: 'Preview command', value: '`bunx --bun devflare deploy --preview <name>`' },
			{ label: 'Cleanup command', value: '`bunx --bun devflare previews cleanup --scope <name> --apply`' }
		],
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
		sections: [
			{
				id: 'deploy-a-preview',
				title: 'Deploy a named preview',
				description:
					'Named previews are the easiest first deploy shape because the destination is obvious in the command itself and the same name can follow the preview through CI, cleanup, and review.',
				paragraphs: [
					'If the first worker runs locally and your first test already passed, the project is ready for a simple preview loop. You do not need a new framework layer or a bigger repo ritual first.',
					'Pick one preview name such as `next` or `pr-123`. Then deploy with `--preview <name>` so the preview target is visible in your shell history and logs.'
				],
				steps: [
					'Finish the worker or app locally and make sure `bunx --bun devflare dev` already works.',
					'Pick a preview scope name such as `next` or `pr-123`.',
					'Run the explicit preview deploy command.',
					'Open the preview and confirm the smallest important path works before you automate anything bigger.'
				],
				snippets: [
					{
						title: 'Deploy the same starter worker as a named preview',
						description:
							'The active file is just the command transcript. The project tree is still the same small worker from the earlier quickstart pages.',
						filename: 'preview-command.sh',
						language: 'bash',
						structure: [
							{ path: 'devflare.config.ts', muted: true },
							{ path: 'src', kind: 'folder', muted: true },
							{ path: 'src/fetch.ts', muted: true },
							{ path: 'tests', kind: 'folder', muted: true },
							{ path: 'tests/fetch.test.ts', muted: true },
							{ path: 'env.d.ts', muted: true },
							{ path: 'preview-command.sh' }
						],
						code: String.raw`bunx --bun devflare build --env preview
bunx --bun devflare deploy --preview next`
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Explicit is the point',
						body: [
							'If the command says `--preview next`, you already know where it is going. That clarity is the whole reason the CLI insists on explicit deploy targets.'
						]
					}
				]
			},
			{
				id: 'delete-the-preview',
				title: 'Delete the preview when it is done teaching you something',
				description:
					'Preview cleanup should use the same scope name you deployed with. That keeps teardown reviewable and stops preview-only resources from lingering just because nobody remembers the exact branch name later.',
				paragraphs: [
					'If the preview owns preview-only resources, `cleanup` is the quickest way to remove them. Use the exact same scope string you deployed with so the target stays unmistakable.',
					'If you later need richer lifecycle management, the dedicated preview operations docs cover scope inspection, cleanup planning, and broader cleanup runs. For the first loop, resource cleanup is enough to understand the shape.'
				],
				snippets: [
					{
						title: 'Clean up the same named preview',
						description:
							'The cleanup command should feel like the mirror image of the deploy command: same project, same scope name, same explicit target.',
						filename: 'cleanup-preview.sh',
						language: 'bash',
						structure: [
							{ path: 'devflare.config.ts', muted: true },
							{ path: 'src', kind: 'folder', muted: true },
							{ path: 'src/fetch.ts', muted: true },
							{ path: 'tests', kind: 'folder', muted: true },
							{ path: 'tests/fetch.test.ts', muted: true },
							{ path: 'env.d.ts', muted: true },
							{ path: 'cleanup-preview.sh' }
						],
						code: String.raw`bunx --bun devflare previews cleanup --scope next --apply`
					}
				],
				bullets: [
					'Reuse the same preview scope name you deployed with.',
					'Keep cleanup commands explicit so logs clearly show what is being removed.',
					'If the preview becomes a real recurring workflow, move that command into CI instead of relying on team memory.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Delete previews explicitly too',
						body: [
							'Preview environments get messy when deploys are automated but cleanup rules live only in people’s heads. Use the same explicit naming discipline for teardown that you used for deploy.'
						]
					}
				]
			},
			{
				id: 'what-to-read-next',
				title: 'What to read next',
				description:
					'Once the first preview loop works, jump to the deeper docs for production deploy rules and GitHub automation.',
				paragraphs: [
					'When this local preview loop is ready to leave your shell history and become reviewable automation, continue with `github-workflows`. That page maps the exact `.github/workflows/*.yml` files this repo uses for PR comments, branch previews, production deploys, and cleanup.'
				],
				cards: [
					{
						label: 'Ship & operate',
						title: 'Production deploys',
						body: 'Read the deeper guide for explicit production targets, preflight checks, and deploy inspection habits.',
						href: docsLink('production-deploys')
					},
					{
						label: 'Ship & operate',
						title: 'GitHub workflows',
						body: 'Continue with the repo-backed workflow guide when you want this preview loop to become PR comments, branch previews, production deploys, and cleanup jobs under `.github/workflows`.',
						href: docsLink('github-workflows')
					}
				]
			}
		]
	},
	{
		slug: 'runtime-context',
		group: 'Devflare',
		navTitle: 'Runtime context',
		readTime: '8 min read',
		eyebrow: 'Runtime helpers',
		title: 'Think in events first, then let AsyncLocalStorage carry the active context through the handler trail',
		summary:
			'Devflare-managed entrypoints create a rich surface event, store `env`, `ctx`, `request`, `locals`, `type`, and the original event in `AsyncLocalStorage`, then expose that state through helpers such as `getFetchEvent()`, `getQueueEvent()`, `getContext()`, and the `env`, `ctx`, `event`, and `locals` runtime proxies inside the same handler trail.',
		description:
			'The public story is still event-first, but this is also the page for the helper APIs that depend on that model: `getFetchEvent()`, `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, `getTailEvent()`, `getContext()`, and the `env`, `ctx`, `event`, and `locals` exports from `devflare/runtime`. Your handler gets a rich event object, and Devflare stores a matching `RequestContext` in Node `AsyncLocalStorage` so those helpers can recover the active surface without threading the event through every layer.',
		highlights: [
			'If you came here because of `getFetchEvent()`, `getQueueEvent()`, `getContext()`, `env`, `ctx`, `event`, or `locals`, you are in the right place: all of them read the same AsyncLocalStorage-backed context.',
			'Devflare stores a full `RequestContext` in `AsyncLocalStorage`, not just one `Request` reference.',
			'Prefer explicit event parameters at the handler boundary and getters deeper in the same call trail.',
			'`env`, `ctx`, and `event` from `devflare/runtime` are readonly proxies, while `locals` is mutable request-scoped storage.',
			'Per-surface getters such as `getFetchEvent()` and `getQueueEvent()` also expose `.safe()` for nullable access.',
			'`runWithEventContext()` and `runWithContext()` are advanced escape hatches, not the normal app-facing API.'
		],
		facts: [
			{ label: 'Context carrier', value: 'Node `AsyncLocalStorage` under Devflare-managed entrypoints' },
			{ label: 'Main helpers', value: '`getFetchEvent()`, `getQueueEvent()`, `getContext()`, `env`, `ctx`, `event`, and `locals`' },
			{ label: 'Stored shape', value: '`env`, `ctx`, `request`, `locals`, `type`, and the original event object' },
			{ label: 'Mutable lane', value: '`locals` / `event.locals`' },
			{ label: 'Failure mode', value: 'Strict runtime helpers throw outside an active handler trail' }
		],
		sourcePages: [
			'foundation.md',
			'context.ts',
			'context-events.ts',
			'context-types.ts',
			'exports.ts',
			'validation.ts',
			'context.test.ts',
			'exports.test.ts',
			'validation.test.ts',
			'worker-only-multi-surface-events.test.ts',
			'event-accessors.test.ts'
		],
		sections: [
			{
				id: 'helper-map',
				title: 'The AsyncLocalStorage-powered helpers are the whole point of this page',
				paragraphs: [
					'If you landed here because `getFetchEvent()` or `env.DB` worked in one place and exploded in another, this page should say that plainly: those APIs all depend on the same AsyncLocalStorage-backed `RequestContext`.',
					'That includes the per-surface getters, the generic `getContext()` helper, and the runtime exports that feel global in app code but are really reading the active request or job context under the hood.'
				],
				table: {
					headers: ['Helper family', 'Examples', 'What AsyncLocalStorage gives them'],
					rows: [
						['Per-surface getters', '`getFetchEvent()`, `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, `getTailEvent()`', 'Return the current rich event after verifying the active surface type; `.safe()` returns `null` instead of throwing.'],
						['Generic context getter', '`getContext()`', 'Returns the active stored context shape when one exists and throws when code is running outside an active handler trail.'],
						['Readonly runtime proxies', '`env`, `ctx`, `event`', 'Read the active environment bindings, execution context, or original event from the current AsyncLocalStorage store without parameter threading.'],
						['Mutable runtime proxy', '`locals`', 'Reads and writes the per-request or per-job mutable storage object attached to the active context.']
					]
				},
				callouts: [
					{
						tone: 'accent',
						title: 'A practical reading guide',
						body: [
							'If the question in your head is “when can I safely call `getFetchEvent()` or read `env` without passing the event around?”, the rest of this page is answering exactly that.'
						]
					}
				]
			},
			{
				id: 'event-first',
				title: 'Start with event-first handlers and let helpers discover the active event later',
				paragraphs: [
					'Event-first handlers keep runtime state explicit at the boundary and still let deeper helpers recover the current event later when plumbing it through every function call would be pure ceremony. That is the everyday job for helpers like `getFetchEvent()` and `locals`.',
					'In normal application code you should not need to establish AsyncLocalStorage context manually. Devflare already does that for generated worker entrypoints, middleware, route dispatch, Durable Object wrappers, the dev server, and the built-in test helpers.'
				],
				snippets: [
					{
						title: 'Use the explicit event at the boundary and a getter inside the helper',
						description:
							'This keeps the handler honest while still letting helper code read the active request and shared locals later in the same call trail.',
						activeFile: 'src/fetch.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'src/lib', kind: 'folder' },
							{ path: 'src/lib/current-path.ts' }
						],
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[1, 11]],
								code: String.raw`import { locals, type FetchEvent } from 'devflare/runtime'
import { currentPath } from './lib/current-path'

export async function fetch(event: FetchEvent): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()

	return Response.json({
		path: currentPath(),
		method: event.request.method,
		requestId: String(locals.requestId)
	})
}`
							},
							{
								path: 'src/lib/current-path.ts',
								language: 'ts',
								focusLines: [[1, 4]],
								code: String.raw`import { getFetchEvent } from 'devflare/runtime'

export function currentPath(): string {
	return getFetchEvent().url.pathname
}`
							}
						]
					}
				]
			},
			{
				id: 'what-gets-stored',
				title: 'Devflare stores a full `RequestContext`, not just one request reference',
				paragraphs: [
					'Under the hood, Devflare creates `AsyncLocalStorage<RequestContext>()`. The stored value is richer than “the current request”: it keeps the active environment bindings, the current execution context or Durable Object state, an optional request, mutable locals, the runtime surface type, and the original event object.',
					'That design is why the higher-level runtime APIs can stay small. Per-surface getters return the stored event when the active surface matches. The generic proxies read the same store without caring whether the call trail came from fetch, queue, scheduled, email, tail, or Durable Objects.'
				],
				snippets: [
					{
						title: 'Simplified shape of the value Devflare puts into AsyncLocalStorage',
						language: 'ts',
						code: String.raw`type RequestContext = {
	env: TEnv
	ctx: ExecutionContext | DurableObjectState | null
	request: Request | null
	locals: Record<string, unknown>
	type: RuntimeEventType
	event: EventContext<TEnv>
}`
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'The original event object is still preserved',
						body: [
							'Devflare does not discard the richer surface event after extracting a request or context. The original event stays on `context.event`, which is what the per-surface getters read later.'
						]
					}
				]
			},
			{
				id: 'how-devflare-establishes-context',
				title: 'Devflare first creates a rich event, then runs the handler trail inside AsyncLocalStorage',
				paragraphs: [
					'For fetch, queue, scheduled, email, tail, and Durable Object surfaces, Devflare first creates a rich event object using helpers such as `createFetchEvent()`, `createQueueEvent()`, or the Durable Object event builders. It then builds a `RequestContext` from that event and runs the handler trail inside `storage.run(...)`.',
					'The same mechanism is reused by generated worker entrypoints, request-wide middleware, route resolution, Durable Object wrappers, the dev server, and `createTestContext()` helpers such as `cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail`. That shared mechanism is why runtime helpers feel consistent in app code and test code.'
				],
				steps: [
					'Devflare builds the rich event object for the active surface.',
					'It creates a `RequestContext` from `event.env`, `event.ctx`, `event.request ?? null`, `event.locals`, `event.type`, and the original event object.',
					'It runs middleware, route resolution, or the surface handler inside `AsyncLocalStorage` with that context.',
					'Deeper helpers call getters or proxies, which read the current store instead of receiving the event manually.',
					'When the handler trail ends, the strict runtime helpers stop pretending context still exists.'
				],
				snippets: [
					{
						title: 'The important part of `runWithEventContext()` is intentionally small',
						language: 'ts',
						code: String.raw`const context = {
	env: event.env,
	ctx: event.ctx,
	request: event.request ?? null,
	locals: event.locals,
	type: event.type,
	event
}

return storage.run(context, fn)`
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'One store is what keeps runtime behavior consistent',
						body: [
							'If a helper works in the dev server but not in tests, or vice versa, that is a bug. Devflare intentionally drives both through the same AsyncLocalStorage-backed context model.'
						]
					}
				]
			},
			{
				id: 'access-order',
				title: 'Getters and proxies are just different ways of reading the same store',
				table: {
					headers: ['API', 'What it reads', 'Failure behavior', 'Mutation'],
					rows: [
						['Handler parameters', 'The explicit event object Devflare passes to the handler boundary.', 'No lookup needed at the boundary.', '`event.locals` is mutable.'],
						['Per-surface getters like `getFetchEvent()`', 'The stored `context.event` after Devflare verifies the active surface type.', 'Throws `ContextUnavailableError`, while `.safe()` returns `null`.', 'Readonly event view.'],
						['`getContext()`', 'The full active `RequestContext` object from the current AsyncLocalStorage store.', 'Throws `ContextUnavailableError` outside an active handler trail.', 'Use this mostly for debugging or advanced infrastructure helpers.'],
						['`env`, `ctx`, `event` proxies', '`getContextOrNull()` through readonly proxy wrappers.', 'Property access throws `ContextAccessError` outside an active handler trail.', 'Readonly.'],
						['`locals` proxy', '`getContextOrNull()?.locals` through the mutable context proxy.', 'Property access throws `ContextAccessError` outside an active handler trail.', 'Mutable and shared with `event.locals`.']
					]
				},
				paragraphs: [
					'Pass the event explicitly at the top of the stack. Reach for getters or proxies only when you are deeper in the same handler trail and threading that event downward would make the code noisier than the value it adds.',
					'This is also why strict runtime helpers throwing outside context is healthy: it stops top-level module code and random utility calls from pretending they are running inside a request when they are not.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'A simple rule',
						body: [
							'Use explicit handler parameters first, getters second, proxies third, and mutable `locals` only for data that truly belongs to the current request or job.'
						]
					}
				]
			},
			{
				id: 'surface-coverage',
				title: 'The AsyncLocalStorage model covers more than fetch',
				table: {
					headers: ['Surface', 'Event shape', 'Getter'],
					rows: [
						['HTTP worker', '`FetchEvent`', '`getFetchEvent()`'],
						['Queue consumer', '`QueueEvent`', '`getQueueEvent()`'],
						['Scheduled handler', '`ScheduledEvent`', '`getScheduledEvent()`'],
						['Inbound email', '`EmailEvent`', '`getEmailEvent()`'],
						['Tail handler', '`TailEvent`', '`getTailEvent()`'],
						['Durable Object fetch', '`DurableObjectFetchEvent`', '`getDurableObjectFetchEvent()`'],
						['Durable Object alarm', '`DurableObjectAlarmEvent`', '`getDurableObjectAlarmEvent()`'],
						['Durable Object WebSocket message / close / error', 'Dedicated WebSocket event types', '`getDurableObjectWebSocketMessageEvent()`, `getDurableObjectWebSocketCloseEvent()`, `getDurableObjectWebSocketErrorEvent()`'],
						['Any Durable Object surface', '`DurableObjectEvent`', '`getDurableObjectEvent()`']
					]
				},
				paragraphs: [
					'Worker surfaces expose `event.ctx` as the current `ExecutionContext`. Durable Object surfaces expose `event.ctx` as the current `DurableObjectState`, and Devflare also aliases that same value as `event.state` for clarity.',
					'For fetch and Durable Object fetch, Devflare augments the actual `Request` instance. For queue, scheduled, email, tail, and Durable Object WebSocket surfaces, it augments the native carrier object instead of replacing it with a fantasy wrapper.',
					'Three general-purpose utilities round out the API: `hasContext()` checks whether a context is active, `getEventContext()` returns the current event regardless of surface type, and `getEventContextOrNull()` does the same but returns `null` outside a context.'
				]
			},
			{
				id: 'locals-model',
				title: '`locals` is the mutable storage lane, and it is isolated per context',
				paragraphs: [
					'Use `locals` for auth state, derived request data, request ids, or other values that belong to the current request or job and should be shared across middleware or helper layers.',
					'Within one handler trail, `locals` and `event.locals` point at the same underlying object. Across requests and jobs, each context gets a fresh locals object so state does not bleed between invocations.'
				],
				snippets: [
					{
						title: 'Write to `event.locals`, read from `locals` later in the same trail',
						filename: 'src/fetch.ts',
						language: 'ts',
						code: String.raw`import { locals, sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('x-request-id', String(locals.requestId))
	return next
}

export const handle = sequence(requestId)`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Mutate `locals`, not the readonly proxies',
						body: [
							'`env`, `ctx`, and `event` are readonly runtime views. If you need shared mutable state, put it on `locals` instead of trying to assign back into the underlying context objects.'
						]
					}
				]
			},
			{
				id: 'when-context-is-missing',
				title: 'Context is not available everywhere, and that is intentional',
				bullets: [
					'Module top-level code runs at cold start, not inside a request or job, so strict runtime helpers are unavailable there.',
					'Callbacks that run after the handler trail ends should take explicit inputs instead of assuming context is still alive.',
					'Timer callbacks like `setTimeout()` and `setInterval()` are outside the normal Devflare-managed handler trail.',
					'Per-surface getters and `getContext()` throw `ContextUnavailableError`, while proxy property access such as `env.DB` or `locals.userId` throws `ContextAccessError` naming the missing property.',
					'If you are unsure whether the matching surface is active, prefer `.safe()` accessors such as `getFetchEvent.safe()` over catching thrown errors.',
					'If runtime context access fails unexpectedly while bypassing Devflare-generated config or harnesses, verify that the Worker still includes the AsyncLocalStorage compatibility flags Devflare normally adds for you.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'The fix is usually simpler than the error feels',
						body: [
							'Move the context access inside the handler, middleware, or helper that is called from that handler trail. If there is no active trail, take explicit inputs instead of hoping context exists.'
						]
					}
				]
			},
			{
				id: 'advanced-helpers',
				title: '`runWithEventContext()` and `runWithContext()` are advanced helpers, not normal app code',
				paragraphs: [
					'By the time you are considering these helpers, the normal app-facing story should already be working: handlers, middleware, generated entrypoints, and `createTestContext()` establish context for you. These APIs exist for runtime and test infrastructure that must preserve or synthesize that context deliberately.',
					'`runWithEventContext(event, fn)` preserves an existing rich event object. `runWithContext(env, ctx, request, fn, type)` is the lower-level compatibility helper: it creates fresh locals, synthesizes a default event with `createDefaultEvent()`, and then stores that event in AsyncLocalStorage before running your function.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not reach for the escape hatch by habit',
						body: [
							'If you are writing app code instead of runtime or test infrastructure, pass the event into your handler and let Devflare establish the context automatically.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'http-routing',
		group: 'Devflare',
		navTitle: 'Routing',
		readTime: '6 min read',
		eyebrow: 'HTTP layer',
		title: 'Split request-wide middleware from route leaves so HTTP stays easy to read',
		summary:
			'Use `src/fetch.ts` for request-wide behavior, `src/routes/**` for leaf handlers, and `files.routes` when you need a custom root, prefix, or route-only app.',
		description:
			'Devflare gives you a request-wide fetch entry and a built-in file router. The safest mental model is simple: keep broad middleware in `src/fetch.ts`, keep URL-specific behavior in `src/routes/**`, and reach for `files.routes` when the route tree needs custom mounting rules.',
		highlights: [
			'`src/fetch.ts` is for whole-app middleware, not leaf business logic.',
			'`src/routes/**` can be auto-discovered, remapped with `files.routes`, or disabled with `files.routes: false`.',
			'Same-module method handlers in `src/fetch.ts` take precedence before the matched route file runs.',
			'`files.routes` is app routing config, not Cloudflare deployment `routes`.'
		],
		facts: [
			{ label: 'Best for', value: 'HTTP apps that need middleware, route params, or a mounted route tree' },
			{ label: 'Primary order', value: '`src/fetch.ts` → same-module methods → matched route file' },
			{ label: 'Route config', value: '`files.routes`' }
		],
		sourcePages: ['README.md', 'foundation.md', 'configuration-reference.md', 'verification-testing-and-caveats.md'],
		sections: [
			{
				id: 'two-layers',
				title: 'Two HTTP layers by design',
				cards: [
					{
						title: '`src/fetch.ts`',
						body: 'Use it for request-wide behavior that should apply before or after the final leaf handler runs.'
					},
					{
						title: '`src/routes/**`',
						body: 'Use it for specific URL handlers so the file tree mirrors the URLs you serve.'
					}
				],
				paragraphs: [
					'If `src/fetch.ts` exports `fetch` or `handle`, that module becomes the primary HTTP entry. Inside `resolve(event)`, Devflare checks same-module method handlers first and then dispatches to the matched route file when needed.',
					'That ordering is what lets middleware stay global while route files remain the clean leaf-handler story.'
				],
				steps: [
					'Devflare enters through `src/fetch.ts` when that file exports `fetch` or `handle`.',
					'Inside `resolve(event)`, exact same-module HTTP method handlers such as `GET` or `POST` are checked first, `HEAD` falls back to `GET` with an empty body, and `ALL` is the last module-local fallback.',
					'If no same-module method handler answers the request, Devflare falls through to the matched route file.',
					'Devflare computes route params before request-wide middleware continues, so `event.params` is available to both outer middleware and the leaf handler.'
				]
			},
			{
				id: 'middleware-pattern',
				title: 'Use middleware for broad concerns, not leaf business logic',
				snippets: [
					{
						title: 'Keep the middleware file and the leaf route side by side',
						description:
							'The global file owns request-wide behavior. The route file owns one URL. When those stay separate, the whole HTTP layer stays readable.',
						activeFile: 'src/fetch.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'src/routes', kind: 'folder' },
							{ path: 'src/routes/users', kind: 'folder' },
							{ path: 'src/routes/users/[id].ts' }
						],
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[4, 18]],
								code: String.raw`import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function cors(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
			}
		})
	}

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('Access-Control-Allow-Origin', '*')
	return next
}

export const handle = sequence(cors)`
							},
							{
								path: 'src/routes/users/[id].ts',
								language: 'ts',
								focusLines: [[2, 5]],
								code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET(event: FetchEvent): Promise<Response> {
	return Response.json({ id: event.params.id })
}`
							}
						]
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Keep the split clean',
						body: [
							'If a piece of logic only matters for one URL, it probably belongs in a route file, not in global middleware.'
						]
					}
				]
			},
			{
				id: 'route-only-apps',
				title: 'Route-only apps are valid when you do not need global middleware',
				paragraphs: [
					'You do not need `src/fetch.ts` just to use the file router. If every concern is leaf-local, a route tree on its own is a clean supported shape.',
					'That is especially useful for small APIs where a mounted route prefix matters more than request-wide middleware.'
				],
				snippets: [
					{
						title: 'Mount a route tree under `/api` without a `src/fetch.ts` file',
						description:
							'Explicit `files.routes` keeps the route root and prefix obvious in code review while the app stays route-only.',
						activeFile: 'devflare.config.ts',
						structure: [
							{ path: 'devflare.config.ts' },
							{ path: 'src', kind: 'folder' },
							{ path: 'src/routes', kind: 'folder' },
							{ path: 'src/routes/users', kind: 'folder' },
							{ path: 'src/routes/users/[id].ts' }
						],
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 9]],
								code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'users-api',
	files: {
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})`
							},
							{
								path: 'src/routes/users/[id].ts',
								language: 'ts',
								focusLines: [[1, 5]],
								code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET({ params }: FetchEvent): Promise<Response> {
	return Response.json({ id: params.id })
}`
							}
						]
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Start route-only when the app really is route-only',
						body: [
							'Skip `src/fetch.ts` until you genuinely need request-wide auth, logging, CORS, or response shaping. Add the global file later; the route tree stays valid.'
						]
					}
				]
			},
			{
				id: 'route-config',
				title: 'Use `files.routes` to remap, prefix, or disable the route tree',
				table: {
					headers: ['Shape', 'What it does'],
					rows: [
						['Omit `files.routes`', '`src/routes` is auto-discovered when that directory exists.'],
						['`{ dir: \'app-routes\' }`', 'Changes the route root without changing the rest of the routing model.'],
						['`{ dir: \'src/routes\', prefix: \'/api\' }`', 'Mounts discovered routes under a fixed prefix such as `/api`.'],
						['`false`', 'Disables file-route discovery entirely.']
					]
				},
				paragraphs: [
					'`files.routes` is app routing config. It controls how Devflare discovers and mounts route modules inside the Worker package.',
					'It is not the same thing as top-level Cloudflare deployment `routes`, which decide which hostnames and path patterns reach the Worker in the first place.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not blur app routing and deployment routing',
						body: [
							'If you are choosing files inside your Worker, you want `files.routes`. If you are deciding which traffic reaches the Worker at all, you want top-level Cloudflare `routes`.'
						]
					}
				]
			},
			{
				id: 'route-semantics',
				title: 'Specificity and guardrails matter once the tree grows',
				table: {
					headers: ['Filename', 'Meaning'],
					rows: [
						['`src/routes/index.ts`', 'Matches `/`.'],
						['`src/routes/users/[id].ts`', 'Matches `/users/:id` and exposes `event.params.id`.'],
						['`src/routes/blog/[...slug].ts`', 'Matches one-or-more trailing segments and exposes `slug` as joined path text.'],
						['`src/routes/docs/[[...slug]].ts`', 'Matches both the directory root and deeper optional rest paths.']
					]
				},
				bullets: [
					'Static routes beat dynamic routes, dynamic routes beat rest routes, and optional rest routes are checked last.',
					'`src/routes/users/[id].ts` and `src/routes/users/[slug].ts` normalize to the same pattern and are rejected as conflicts.',
					'Files or directories beginning with `_` are ignored so route-local helpers can live beside handlers.',
					'`HEAD` falls back to `GET` if you do not export a dedicated `HEAD` handler.',
					'Route modules can use HTTP method exports, or a primary `fetch` / `handle` export, just like the fetch module.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Conflict errors are a feature, not a nuisance',
						body: [
							'If two files normalize to the same route pattern, Devflare rejects the tree instead of guessing. That makes route review boring in the best possible way.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'config-basics',
		group: 'Devflare',
		navTitle: 'Config basics',
		readTime: '5 min read',
		eyebrow: 'Configuration',
		title: 'Author stable config, keep secrets and generated output in their own lanes',
		summary:
			'Write `devflare.config.ts` for humans first, let Devflare merge environments and resolve names later, and treat generated Wrangler-facing files as outputs rather than authoring surfaces.',
		description:
			'The easiest way to keep Devflare predictable is to keep stable intent in authored config and let build or deploy flows resolve the noisy details. That applies to environment overlays, stable resource names, secrets, and generated output.',
		highlights: [
			'`config.env` is a Devflare merge layer, not just a raw Wrangler environment mirror.',
			'Use stable names for resources when you can, and let id resolution happen later.',
			'`vars` are string config; `secrets` declare runtime expectations, and the schema accepts `{ required: false }` even though generated env typing still treats declared secrets as present today.',
			'Use `wrangler.passthrough` as the escape hatch for unsupported Wrangler keys, and treat it as a deliberate top-level override rather than a second config language.'
		],
		facts: [
			{ label: 'Best for', value: 'Anyone authoring or reviewing `devflare.config.ts`' },
			{ label: 'Source of truth', value: 'Authored config plus source files' },
			{ label: 'Escape hatch', value: '`wrangler.passthrough`' }
		],
		sourcePages: ['configuration-overview.md', 'configuration-reference.md', 'README.md'],
		sections: [
			{
				id: 'flow',
				title: 'A simple config flow',
				steps: [
					'Author stable intent in `devflare.config.ts`.',
					'Optionally merge a named Devflare environment with `--env <name>`.',
					'Resolve account ids or resource ids only in flows that truly need them.',
					'Emit Wrangler-compatible output as generated artifacts.',
					'Build or deploy from generated output without hand-editing it.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'If a generated file feels hand-maintained, move the intent back up',
						body: [
							'That usually means the authored config is missing a real source-of-truth value or needs a passthrough key.'
						]
					}
				]
			},
			{
				id: 'vars-secrets',
				title: 'Keep vars, secrets, and `.env` separate',
				table: {
					headers: ['Layer', 'Use it for'],
					rows: [
						['`vars`', 'String config that compiles into generated Wrangler output.'],
						['`secrets`', 'Declaring which runtime secret bindings should exist. The schema accepts `{ required: false }`, but generated env typing still treats declared secrets as present either way today.'],
						['`.env`', 'Inputs used while evaluating `devflare.config.*` at config time.'],
						['`.env.example`', 'Documenting config-time variables for the team.']
					]
				},
				paragraphs: [
					'Devflare prefers a workspace-root `.env` when it finds a workspace ancestor; otherwise it falls back to the nearest ancestor `.env` before evaluating config. That is useful for config-time values, but it is not a promise of first-class `.dev.vars*` behavior for worker-only dev or tests.',
					'Stable infrastructure names belong in authored config. Do not hide them in secrets just because another tool happens to like environment variables.'
				]
			},
			{
				id: 'generated-output',
				title: 'Generated artifacts are outputs, not contracts',
				bullets: [
					'`.devflare/wrangler.jsonc`',
					'`.devflare/build/wrangler.jsonc`',
					'`.devflare/worker-entrypoints/main.ts` and `.js` when Devflare needs wrapper glue around the worker surfaces it discovered',
					'`.devflare/vite.config.mjs`',
					'`.wrangler/deploy/config.json`',
					'`env.d.ts`'
				],
				paragraphs: [
					'`wrangler.passthrough` is a shallow top-level override. Use it when Devflare does not model a Wrangler key yet, not as a place to mirror the whole generated config by habit.',
					'Devflare only generates `.devflare/worker-entrypoints/main.ts` when it needs to wrap or compose the worker surfaces it discovered. If `wrangler.passthrough.main` is set, or the fetch worker already lives at `assets.directory/_worker.js`, Devflare can skip that generated main entry and use the explicit worker instead.'
				],
				snippets: [
					{
						title: 'Use passthrough for unsupported Wrangler keys',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'advanced-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	wrangler: {
		passthrough: {
			placement: {
				mode: 'smart'
			}
		}
	}
})`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Passthrough is an explicit escape hatch',
						body: [
							'It wins on top-level key conflicts, so use it deliberately instead of turning it into a second config language.'
						]
					}
				]
			}
		]
	}
]



