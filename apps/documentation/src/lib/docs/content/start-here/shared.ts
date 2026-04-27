import type { DocCodeTreeEntry, DocPage } from '../../types'

export const docsLink = (slug: string): string => `/docs/${slug}`

export const supportCoverageTooltips = {
	Full: 'Full — Devflare has a first-class config, local runtime, testing, docs, and workflow story for this surface.',
	Partial:
		'Partial — the surface is supported, but important behavior still depends on remote Cloudflare infrastructure or platform caveats.',
	Limited:
		'Limited — there is a real supported lane, but the contract is intentionally narrower today.',
	None: 'None — Devflare does not model that surface yet, so reach for raw Cloudflare tooling or Wrangler passthrough instead.'
} as const

export const firstWorkerConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})`

export const firstWorkerFetchCode = String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(url.pathname === '/' ? 'Hello from Devflare' : url.pathname)
}`

export const firstWorkerTestCode = String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('hello-worker', () => {
	test('GET / returns text', async () => {
		const response = await cf.worker.get('/')
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('Hello from Devflare')
	})
})`

export const firstWorkerStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts' },
	{ path: 'env.d.ts', muted: true }
]

export const routedWorkerConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

export const routedWorkerFetchCode = String.raw`import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'
import { rememberRequest } from '../lib/request-context'

async function requestContext(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	rememberRequest()
	return resolve(event)
}

export const handle = sequence(requestContext)`

export const requestContextHelperCode = String.raw`import { getFetchEvent, locals } from 'devflare/runtime'

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

export const routedWorkerIndexRouteCode = String.raw`import { activeRequestId, activeRequestPath } from '../lib/request-context'

export async function GET(): Promise<Response> {
	return Response.json({
		message: 'Hello from Devflare',
		path: activeRequestPath(),
		requestId: activeRequestId()
	})
}`

export const routedWorkerStructure: DocCodeTreeEntry[] = [
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

export const durableObjectConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

export const durableObjectRouteCode = String.raw`import { env } from 'devflare/runtime'
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

export const counterObjectCode = [
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

export const counterValueCode = String.raw`export class CounterValue {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double(): number {
		return this.value * 2
	}
}`

export const counterTransportCode = String.raw`import { CounterValue } from '../lib/counter-value'

export const transport = {
	CounterValue: {
		encode: (value: unknown) =>
			value instanceof CounterValue ? value.value : false,
		decode: (value: number) => new CounterValue(value)
	}
}`

export const durableObjectBindingsStructure: DocCodeTreeEntry[] = [
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

export const r2ConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

export const r2RouteCode = String.raw`import { env } from 'devflare/runtime'
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

export const r2BindingsStructure: DocCodeTreeEntry[] = [
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

export const browserConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

export const browserRouteCode = String.raw`import puppeteer from '@cloudflare/puppeteer'
import { env } from 'devflare/runtime'
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

export const browserBindingsStructure: DocCodeTreeEntry[] = [
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
