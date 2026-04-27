import type { DocCodeTreeEntry, DocPage } from '../../types'

import { bindingTestingGuides } from '../bindings'

export const docsLink = (slug: string): string => `/docs/${slug}`

export const bindingTestingGuideCards = bindingTestingGuides.map((guide) => ({
	href: docsLink(guide.testingSlug),
	label: 'Binding guide',
	meta: guide.defaultHarness,
	title: `Testing ${guide.label}`,
	body: `${guide.summary} Open the ${guide.label} overview first when you need the full binding story, or jump straight here when the only open question is how to test it.`
}))

export const bindingTestingGuideRows = bindingTestingGuides.map((guide) => [
	guide.label,
	guide.localStory,
	guide.defaultHarness
])

export const testingFeelsNativeConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'counter-worker',
	compatibilityDate: '2026-03-17',
	files: {
		durableObjects: 'src/do.counter.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter', scriptName: 'do.counter.ts' }
		}
	}
})`

export const testingFeelsNativeValueCode = String.raw`export class DoubleableNumber {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double(): number {
		return this.value * 2
	}
}`

export const testingFeelsNativeTransportCode = String.raw`import { DoubleableNumber } from '../DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) =>
			value instanceof DoubleableNumber ? value.value : false,
		decode: (value: number) => new DoubleableNumber(value)
	}
}`

export const testingFeelsNativeDurableObjectCode = String.raw`import { DoubleableNumber } from '../DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}`

export const testingFeelsNativeTestCode = String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'
import { DoubleableNumber } from '../src/DoubleableNumber'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('Durable Object methods feel native in tests', async () => {
	const result = await env.COUNTER.getByName('main').increment(2)

	expect(result).toBeInstanceOf(DoubleableNumber)
	expect(result.value).toBe(2)
	expect(result.double).toBe(4)
})`

export const testingFeelsNativeStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/DoubleableNumber.ts' },
	{ path: 'src/transport.ts' },
	{ path: 'src/do.counter.ts' },
	{ path: 'tests', kind: 'folder' },
	{ path: 'tests/counter.test.ts' },
	{ path: 'env.d.ts', muted: true }
]

export const projectArchitectureStarterStructure: DocCodeTreeEntry[] = [
	{ path: 'package.json' },
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts' },
	{ path: 'src/routes', kind: 'folder' },
	{ path: 'src/routes/health.ts' },
	{ path: 'tests', kind: 'folder' },
	{ path: 'tests/fetch.test.ts' },
	{ path: 'env.d.ts', muted: true },
	{ path: '.devflare/wrangler.jsonc', muted: true },
	{ path: '.wrangler/deploy/config.json', muted: true }
]

export const projectArchitectureStarterPackageCode = String.raw`{
	"name": "notes-api",
	"private": true,
	"type": "module",
	"scripts": {
		"types": "bunx --bun devflare types",
		"dev": "bunx --bun devflare dev",
		"build": "bunx --bun devflare build",
		"deploy": "bunx --bun devflare deploy"
	},
	"devDependencies": {
		"devflare": "workspace:*"
	}
}`

export const projectArchitectureStarterConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})`

export const projectArchitectureStarterFetchCode = String.raw`import { sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()
	return resolve(event)
}

export const handle = sequence(requestId)`

export const projectArchitectureStarterRouteCode = String.raw`export async function GET(): Promise<Response> {
	return Response.json({ ok: true })
}`

export const projectArchitectureFullSurfaceStructure: DocCodeTreeEntry[] = [
	{ path: 'package.json' },
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/fetch.ts' },
	{ path: 'src/routes', kind: 'folder' },
	{ path: 'src/routes/index.ts' },
	{ path: 'src/routes/uploads', kind: 'folder' },
	{ path: 'src/routes/uploads/[name].ts' },
	{ path: 'src/queue.ts' },
	{ path: 'src/scheduled.ts' },
	{ path: 'src/email.ts' },
	{ path: 'src/do', kind: 'folder' },
	{ path: 'src/do/session-room.ts' },
	{ path: 'src/ep', kind: 'folder' },
	{ path: 'src/ep/admin.ts' },
	{ path: 'src/workflows', kind: 'folder' },
	{ path: 'src/workflows/rebuild-search.ts' },
	{ path: 'src/transport.ts' },
	{ path: 'tests', kind: 'folder' },
	{ path: 'tests/worker.test.ts' },
	{ path: 'env.d.ts', muted: true }
]

export const projectArchitectureFullSurfaceConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'workspace-app',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts',
		entrypoints: 'src/ep/**/*.ts',
		workflows: 'src/workflows/**/*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		durableObjects: {
			SESSION_ROOM: 'SessionRoom'
		},
		queues: {
			producers: {
				EMAILS: 'workspace-emails'
			},
			consumers: [
				{
					queue: 'workspace-emails'
				}
			]
		}
	},
	triggers: {
		crons: ['0 */6 * * *']
	}
})`

export const projectArchitectureFullSurfaceQueueCode = String.raw`import type { QueueEvent } from 'devflare/runtime'

export async function queue({ messages }: QueueEvent): Promise<void> {
	for (const message of messages) {
		console.log('processing job', message.id)
	}
}`

export const projectArchitectureFullSurfaceDurableObjectCode = String.raw`import { DurableObject } from 'cloudflare:workers'

${'export'} ${'class'} ${'SessionRoom'} extends DurableObject<DevflareEnv> {
	async fetch(request: Request): Promise<Response> {
		return new Response('room:' + new URL(request.url).pathname)
	}
}`

export const projectArchitectureHostedAppStructure: DocCodeTreeEntry[] = [
	{ path: 'apps/documentation', kind: 'folder' },
	{ path: 'apps/documentation/package.json' },
	{ path: 'apps/documentation/devflare.config.ts' },
	{ path: 'apps/documentation/vite.config.ts' },
	{ path: 'apps/documentation/svelte.config.js' },
	{ path: 'apps/documentation/src', kind: 'folder' },
	{ path: 'apps/documentation/src/routes', kind: 'folder' },
	{ path: 'apps/documentation/src/routes/+layout.svelte' },
	{ path: 'apps/documentation/static', kind: 'folder' },
	{ path: 'apps/documentation/static/devflare.png' },
	{ path: 'apps/documentation/.adapter-cloudflare/_worker.js', muted: true },
	{ path: 'apps/documentation/.devflare/wrangler.jsonc', muted: true }
]

export const projectArchitectureHostedAppPackageCode = String.raw`{
	"name": "documentation",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "bun run llm:generate && bunx --bun devflare dev",
		"build": "bun run llm:generate && bunx --bun devflare build",
		"deploy": "bun run llm:generate && bunx --bun devflare deploy",
		"types": "bunx --bun devflare types"
	},
	"devDependencies": {
		"devflare": "workspace:*",
		"vite": "^8",
		"@sveltejs/kit": "^2"
	}
}`

export const projectArchitectureHostedAppConfigCode = String.raw`import { defineConfig } from '../../packages/devflare/src/config-entry'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

export default defineConfig({
	name: 'devflare-docs',
	compatibilityDate: '2026-04-08',
	files: {
		fetch: false
	},
	previews: {
		includeCrons: false
	},
	accountId,
	assets: {
		binding: 'ASSETS',
		directory: '.adapter-cloudflare'
	},
	wrangler: {
		passthrough: {
			main: '.adapter-cloudflare/_worker.js'
		}
	}
})`

export const projectArchitectureHostedAppViteCode = String.raw`import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from '../../packages/devflare/src/vite/index'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		devflarePlugin(),
		sveltekit()
	]
})`

export const projectArchitectureSveltekitCase18ConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case18-sveltekit-full',
	files: {
		fetch: '.svelte-kit/cloudflare/_worker.js',
		durableObjects: 'src/do.*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		r2: {
			IMAGES: 'images-bucket'
		},
		d1: {
			DB: 'main-db'
		},
		durableObjects: {
			CHAT_ROOM: {
				className: 'ChatRoom'
			}
		}
	}
})`

export const projectArchitectureMonorepoStructure: DocCodeTreeEntry[] = [
	{ path: 'package.json' },
	{ path: 'turbo.json' },
	{ path: 'apps', kind: 'folder' },
	{ path: 'apps/documentation', kind: 'folder' },
	{ path: 'apps/documentation/devflare.config.ts' },
	{ path: 'apps/testing', kind: 'folder' },
	{ path: 'apps/testing/devflare.config.ts' },
	{ path: 'apps/testing/workers', kind: 'folder' },
	{ path: 'apps/testing/workers/auth-service', kind: 'folder' },
	{ path: 'apps/testing/workers/auth-service/devflare.config.ts' },
	{ path: 'packages', kind: 'folder' },
	{ path: 'packages/devflare', kind: 'folder' },
	{ path: 'cases', kind: 'folder' },
	{ path: 'cases/case5', kind: 'folder' },
	{ path: 'cases/case5/devflare.config.ts' },
	{ path: 'cases/case5/math-service', kind: 'folder' },
	{ path: 'cases/case5/math-service/devflare.config.ts' }
]

export const projectArchitectureMonorepoRootPackageCode = String.raw`{
	"name": "devflare-monorepo",
	"private": true,
	"workspaces": [
		"apps/*",
		"apps/testing/workers/*",
		"packages/*",
		"cases/*"
	],
	"scripts": {
		"devflare:build": "turbo run build --filter=devflare --filter=documentation",
		"devflare:test": "turbo run test --filter=...devflare",
		"devflare:check": "turbo run check --filter=documentation",
		"devflare:ci": "bun run devflare:build && bun run devflare:test && bun run devflare:check"
	}
}`

export const projectArchitectureMonorepoTurboCode = String.raw`{
	"tasks": {
		"build": {
			"dependsOn": ["^build"],
			"outputs": ["dist/**", ".devflare/**", ".wrangler/deploy/**", "env.d.ts"]
		},
		"test": {
			"dependsOn": ["^build", "transit"]
		},
		"check": {
			"dependsOn": ["^build", "transit"]
		}
	}
}`

export const projectArchitectureMonorepoCommandsCode = String.raw`# repo-root orchestration
bun run turbo build --filter=documentation
bun run devflare:check

# package-local deploy
cd apps/documentation
bun run deploy -- --preview next

# sidecar worker family
cd ../testing/workers/auth-service
bunx --bun devflare deploy --preview pr-123`
