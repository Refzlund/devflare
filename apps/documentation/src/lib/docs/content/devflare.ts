import { bindingTestingGuides } from './bindings'
import type { DocCodeTreeEntry, DocPage } from '../types'

const docsLink = (slug: string): string => `/docs/${slug}`

const bindingTestingGuideCards = bindingTestingGuides.map((guide) => ({
	href: docsLink(guide.testingSlug),
	label: 'Binding guide',
	meta: guide.defaultHarness,
	title: `Testing ${guide.label}`,
	body: `${guide.summary} Open the ${guide.label} overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly.`
}))

const bindingTestingGuideRows = bindingTestingGuides.map((guide) => [
	guide.label,
	guide.localStory,
	guide.defaultHarness
])

const testingFeelsNativeConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

const testingFeelsNativeValueCode = String.raw`export class DoubleableNumber {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double(): number {
		return this.value * 2
	}
}`

const testingFeelsNativeTransportCode = String.raw`import { DoubleableNumber } from './DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) =>
			value instanceof DoubleableNumber ? value.value : false,
		decode: (value: number) => new DoubleableNumber(value)
	}
}`

const testingFeelsNativeDurableObjectCode = String.raw`import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}`

const testingFeelsNativeTestCode = String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import { DoubleableNumber } from '../src/DoubleableNumber'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('Durable Object methods feel native in tests', async () => {
	const result = await env.COUNTER.getByName('main').increment(2)

	expect(result).toBeInstanceOf(DoubleableNumber)
	expect(result.value).toBe(2)
	expect(result.double).toBe(4)
})`

const testingFeelsNativeStructure: DocCodeTreeEntry[] = [
	{ path: 'devflare.config.ts' },
	{ path: 'src', kind: 'folder' },
	{ path: 'src/DoubleableNumber.ts' },
	{ path: 'src/transport.ts' },
	{ path: 'src/do.counter.ts' },
	{ path: 'tests', kind: 'folder' },
	{ path: 'tests/counter.test.ts' },
	{ path: 'env.d.ts', muted: true }
]

const projectArchitectureStarterStructure: DocCodeTreeEntry[] = [
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

const projectArchitectureStarterPackageCode = String.raw`{
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

const projectArchitectureStarterConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

const projectArchitectureStarterFetchCode = String.raw`import { sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()
	return resolve(event)
}

export const handle = sequence(requestId)`

const projectArchitectureStarterRouteCode = String.raw`export async function GET(): Promise<Response> {
	return Response.json({ ok: true })
}`

const projectArchitectureFullSurfaceStructure: DocCodeTreeEntry[] = [
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

const projectArchitectureFullSurfaceConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

const projectArchitectureFullSurfaceQueueCode = String.raw`import type { QueueEvent } from 'devflare/runtime'

export async function queue({ messages }: QueueEvent): Promise<void> {
	for (const message of messages) {
		console.log('processing job', message.id)
	}
}`

const projectArchitectureFullSurfaceDurableObjectCode = String.raw`import { DurableObject } from 'cloudflare:workers'

${'export'} ${'class'} ${'SessionRoom'} extends DurableObject<DevflareEnv> {
	async fetch(request: Request): Promise<Response> {
		return new Response('room:' + new URL(request.url).pathname)
	}
}`

const projectArchitectureHostedAppStructure: DocCodeTreeEntry[] = [
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

const projectArchitectureHostedAppPackageCode = String.raw`{
	"name": "documentation",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "bun run llm:generate && bunx --bun devflare dev",
		"build": "bun run llm:generate && bunx --bun devflare build",
		"deploy": "bun run llm:generate && bunx devflare deploy",
		"types": "bunx --bun devflare types"
	},
	"devDependencies": {
		"devflare": "workspace:*",
		"vite": "^8",
		"@sveltejs/kit": "^2"
	}
}`

const projectArchitectureHostedAppConfigCode = String.raw`import { defineConfig } from '../../packages/devflare/src/config-entry'

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

const projectArchitectureHostedAppViteCode = String.raw`import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from '../../packages/devflare/src/vite/index'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		devflarePlugin(),
		sveltekit()
	]
})`

const projectArchitectureSveltekitCase18ConfigCode = String.raw`import { defineConfig } from 'devflare/config'

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

const projectArchitectureMonorepoStructure: DocCodeTreeEntry[] = [
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

const projectArchitectureMonorepoRootPackageCode = String.raw`{
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

const projectArchitectureMonorepoTurboCode = String.raw`{
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

const projectArchitectureMonorepoCommandsCode = String.raw`# repo-root orchestration
bun run turbo build --filter=documentation
bun run devflare:check

# package-local deploy
cd apps/documentation
bun run deploy -- --preview next

# sidecar worker family
cd ../testing/workers/auth-service
bunx --bun devflare deploy --preview pr-123`

export const devflareDocs: DocPage[] = [
	{
		slug: 'project-architecture',
		group: 'Devflare',
		navTitle: 'Project Architecture',
		readTime: '9 min read',
		eyebrow: 'Project setup',
		title: 'Structure Devflare projects around one authored config, explicit runtime files, and package-local deploy ownership',
		summary:
			'This is the practical answer to “what does a real Devflare project look like on disk?” — from a small worker package, to a multi-surface app, to a hosted SvelteKit package, to a Bun monorepo with several deployable workers.',
		description:
			'Devflare projects stay readable when the package boundary is obvious, the authored files stay separate from generated output, and each runtime surface owns its own file. This page maps the common file types, then shows a few real project shapes from this repository so you can set up your package on purpose instead of accumulating conventions by accident.',
		highlights: [
			'Every deployable package still starts with one authored `devflare.config.ts` file.',
			'Worker surfaces like `fetch`, routes, queue, scheduled, email, Durable Objects, entrypoints, workflows, and transport should each live in explicit files when the package actually owns them.',
			'Hosted Vite or SvelteKit apps add package-local host files like `vite.config.ts` and `svelte.config.js`, but they still keep Devflare config as the Cloudflare-facing source of truth.',
			'Generated files like `env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**` are outputs, not the authored architecture.',
			'In a monorepo, Turbo can orchestrate validation across the workspace, but package-local `devflare` commands still decide what actually builds or deploys.'
		],
		facts: [
			{ label: 'Best for', value: 'Teams deciding how to lay out a new Devflare package or a multi-package workspace before file structure gets noisy' },
			{ label: 'Primary authored file', value: '`devflare.config.ts` in each deployable package' },
			{ label: 'Generated files', value: '`env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**`' },
			{ label: 'Monorepo rule', value: 'Validate from the root, but deploy from the package that owns the config' }
		],
		sourcePages: [
			'README.md',
			'package.json',
			'turbo.json',
			'apps/documentation/README.md',
			'apps/documentation/package.json',
			'apps/documentation/devflare.config.ts',
			'apps/documentation/vite.config.ts',
			'apps/documentation/svelte.config.js',
			'apps/testing/README.md',
			'apps/testing/devflare.config.ts',
			'apps/testing/workers/auth-service/devflare.config.ts',
			'cases/case5/devflare.config.ts',
			'cases/case5/math-service/devflare.config.ts',
			'cases/case18/devflare.config.ts'
		],
		sections: [
			{
				id: 'file-map',
				title: 'Start with authored files, and treat generated files as output',
				paragraphs: [
					'The first architecture decision is not “which framework?” It is usually “which files in this package are actually authored source of truth?” In Devflare, the stable answer is that `devflare.config.ts`, `package.json`, and your runtime files are authored; generated Wrangler-facing files and generated types are downstream outputs.',
					'That split is what keeps the project reviewable. If a file describes package intent or runtime behavior, author it directly. If a file is emitted by Devflare, a framework adapter, or Wrangler preparation, treat it as disposable output and regenerate it when the source changes.'
				],
				table: {
					headers: ['Path or pattern', 'Own it when', 'What it means'],
					rows: [
						['`devflare.config.ts`', 'Every deployable package', 'The authored Devflare source of truth for files, bindings, env overlays, previews, and deployment posture.'],
						['`package.json`', 'Every package', 'Package-local scripts, dependencies, and the command loop that should run from that package.'],
						['`src/fetch.ts`', 'The package owns request-wide HTTP behavior', 'The main worker entry for broad middleware or request handling.'],
						['`src/routes/**`', 'The package uses file-based HTTP leaves', 'URL-specific route handlers that sit beside, or replace, one large fetch file.'],
						['`src/queue.ts`, `src/scheduled.ts`, `src/email.ts`', 'The package consumes those platform events', 'Separate event surfaces instead of burying background logic inside fetch code.'],
						['`src/do/**/*.ts`', 'The package owns Durable Object classes', 'Stateful classes discovered and bundled through config.'],
						['`src/ep/**/*.ts`', 'The package exposes named worker entrypoints', 'Classes discovered for typed `ref().worker(...)` service boundaries.'],
						['`src/workflows/**/*.ts`', 'The package owns workflow definitions', 'Additional discovered runtime modules that stay explicit in config review.'],
						['`src/transport.ts`', 'Local RPC-style bridge calls must preserve custom values', 'Custom encode/decode rules for local bridge-backed calls, most often in tests or Durable Object method round-trips.'],
						['`env.d.ts`', 'You run `devflare types`', 'Generated binding and entrypoint types. Do not hand-edit it.'],
						['`vite.config.ts`, `svelte.config.js`, `src/routes/+page.svelte`', 'The package is a hosted Vite or SvelteKit app', 'Host-app files that sit around the Devflare worker story instead of replacing it.'],
						['`.devflare/**`, `.wrangler/deploy/**`', 'Devflare has built, checked, or prepared deploy output', 'Generated build and deploy artifacts. Useful to inspect, not the authored architecture.']
					]
				},
				callouts: [
					{
						tone: 'success',
						title: 'A good architecture rule',
						body: [
							'If the file describes package intent, author it. If the file exists because Devflare or a host tool generated it, inspect it when needed but keep the authored source elsewhere.'
						]
					}
				]
			},
			{
				id: 'starter-package',
				title: 'A worker-first package can stay small for a long time',
				paragraphs: [
					'A healthy Devflare package can start with one config file, one `src/fetch.ts`, one route tree, and one small test. That already gives you package-local scripts, generated types, generated deploy output, and room to grow without forcing a framework or a monorepo strategy on day one.',
					'The point of this shape is not minimalism for its own sake. It is that the package boundary stays obvious: the package owns its config, owns its worker files, and can be built or deployed without pretending the whole repo is one worker.'
				],
				snippets: [
					{
						title: 'Small worker package with one config, one fetch file, one route tree, and generated output kept in its lane',
						activeFile: 'devflare.config.ts',
						structure: projectArchitectureStarterStructure,
						files: [
							{
								path: 'package.json',
								language: 'json',
								code: projectArchitectureStarterPackageCode
							},
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 10]],
								code: projectArchitectureStarterConfigCode
							},
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[3, 8]],
								code: projectArchitectureStarterFetchCode
							},
							{
								path: 'src/routes/health.ts',
								language: 'ts',
								code: projectArchitectureStarterRouteCode
							}
						]
					}
				],
				bullets: [
					'Keep the package-local command loop in `package.json` so `types`, `dev`, `build`, and `deploy` always resolve the right config.',
					'Keep `src/fetch.ts` request-wide and let `src/routes/**` own the URL-specific work once there is more than one leaf.',
					'Expect `env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**` to appear as generated outputs after the normal command loop runs.'
				]
			},
			{
				id: 'multi-surface-package',
				title: 'One package can own many runtime files without becoming a monolith',
				paragraphs: [
					'This is where Devflare architecture becomes more interesting than “one fetch file.” A single package can still own HTTP, route modules, queue work, scheduled jobs, email handlers, Durable Objects, named entrypoints, workflows, and transport rules — as long as each surface keeps its own file and the config names those surfaces honestly.',
					'That is also why the `files.*` lane matters so much. It is not busywork. It is the map of which runtime surfaces the package actually owns.'
				],
				snippets: [
					{
						title: 'A single package with all the main worker-owned file types visible on disk',
						activeFile: 'devflare.config.ts',
						structure: projectArchitectureFullSurfaceStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[4, 32]],
								code: projectArchitectureFullSurfaceConfigCode
							},
							{
								path: 'src/queue.ts',
								language: 'ts',
								code: projectArchitectureFullSurfaceQueueCode
							},
							{
								path: 'src/do/session-room.ts',
								language: 'ts',
								code: projectArchitectureFullSurfaceDurableObjectCode
							}
						]
					}
				],
				table: {
					headers: ['File lane', 'Why it exists'],
					rows: [
						['`src/fetch.ts`', 'Request-wide middleware and the outer HTTP trail.'],
						['`src/routes/**`', 'Leaf handlers that mirror URLs instead of bloating the global fetch file.'],
						['`src/queue.ts`, `src/scheduled.ts`, `src/email.ts`', 'Background and platform-triggered event surfaces with their own runtime contracts.'],
						['`src/do/**/*.ts`', 'Stateful Durable Object classes discovered and bundled through config.'],
						['`src/ep/**/*.ts`', 'Named worker entrypoints for typed cross-worker boundaries.'],
						['`src/workflows/**/*.ts`', 'Workflow definitions discovered as part of the package runtime shape.'],
						['`src/transport.ts`', 'Local bridge serialization only when custom values need to survive a bridge-backed call.']
					]
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Not every package should own every file type',
						body: [
							'The point is explicit ownership, not maximal surface area. Add each runtime file only when the package really owns that event or discovery lane.'
						]
					}
				]
			},
			{
				id: 'hosted-apps',
				title: 'Hosted apps add Vite or SvelteKit around the worker, not instead of it',
				paragraphs: [
					'The docs app in this repo is the simplest real example of a hosted package: it has `package.json`, `devflare.config.ts`, `vite.config.ts`, `svelte.config.js`, Svelte route files, and static assets. Devflare still owns the Cloudflare-facing config and generated Wrangler output, while Vite and SvelteKit own the host-app shell.',
					'The repo also includes a fuller SvelteKit case that points `files.fetch` at the generated Cloudflare worker output while still discovering Durable Objects and transport hooks from source. That is the important hosted-app lesson: the framework shell and the worker surfaces can coexist in one package when the file ownership stays explicit.'
				],
				snippets: [
					{
						title: 'Real hosted app package from `apps/documentation`',
						activeFile: 'apps/documentation/devflare.config.ts',
						structure: projectArchitectureHostedAppStructure,
						files: [
							{
								path: 'apps/documentation/package.json',
								language: 'json',
								code: projectArchitectureHostedAppPackageCode
							},
							{
								path: 'apps/documentation/devflare.config.ts',
								language: 'ts',
								focusLines: [[5, 21]],
								code: projectArchitectureHostedAppConfigCode
							},
							{
								path: 'apps/documentation/vite.config.ts',
								language: 'ts',
								focusLines: [[5, 11]],
								code: projectArchitectureHostedAppViteCode
							}
						]
					},
					{
						title: 'Hosted SvelteKit package that still owns extra worker surfaces',
						language: 'ts',
						code: projectArchitectureSveltekitCase18ConfigCode
					}
				],
				bullets: [
					'Package-local host files like `vite.config.ts` and `svelte.config.js` belong beside the Devflare config, not in a separate orchestration package.',
					'Hosted apps can point at generated framework worker output, or they can mix that output with extra Devflare-owned surfaces like Durable Objects and transport hooks.',
					'The generated worker file still belongs on the generated side of the boundary; the authored source remains the config plus the source files that feed it.'
				]
			},
			{
				id: 'monorepo-example',
				title: 'In a monorepo, Turbo orchestrates the workspace but packages still deploy themselves',
				paragraphs: [
					'This repository is the monorepo example. The root owns workspace scripts, workspaces, and Turbo task orchestration. But deployable packages still keep their own `devflare.config.ts` files and package-local commands. That is true for `apps/documentation`, `apps/testing`, sidecar workers under `apps/testing/workers/*`, and the smaller cases under `cases/*`.',
					'That split is what keeps the monorepo honest. Root scripts decide what to validate or cache. Package-local Devflare commands decide what actually resolves, builds, deploys, or cleans up.'
				],
				snippets: [
					{
						title: 'The repo root orchestrates, but the packages still own deployment',
						activeFile: 'package.json',
						structure: projectArchitectureMonorepoStructure,
						files: [
							{
								path: 'package.json',
								language: 'json',
								code: projectArchitectureMonorepoRootPackageCode
							},
							{
								path: 'turbo.json',
								language: 'json',
								code: projectArchitectureMonorepoTurboCode
							},
							{
								path: 'apps/testing/workers/auth-service/devflare.config.ts',
								language: 'ts',
								code: String.raw`import { defineConfig } from '../../../../packages/devflare/src/config-entry'

export default defineConfig({
	name: 'devflare-testing-auth-service',
	files: {
		fetch: 'src/worker.ts'
	}
})`
							}
						]
					},
					{
						title: 'Good monorepo command split',
						language: 'bash',
						code: projectArchitectureMonorepoCommandsCode
					}
				],
				steps: [
					'Use the repo root for Turbo build, test, check, and impacted-package orchestration.',
					'Run `devflare` from the package that owns the config you actually mean to resolve.',
					'Keep sidecar workers or service-bound packages as separate workspace packages with their own configs and scripts.',
					'Reuse one preview scope across a worker family only after you have made the package boundaries explicit.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Turbo is not the deploy target',
						body: [
							'Turbo decides which packages need work. The package working directory still decides which `devflare.config.ts` gets built or deployed.'
						]
					}
				]
			},
			{
				id: 'next-reads',
				title: 'Open the deeper page for the part of the architecture you are deciding next',
				cards: [
					{
						label: 'Configuration',
						title: 'Need the file-surface rules?',
						body: 'Open project shape when the next question is how many surfaces the package should actually own and which conventions should stay explicit.',
						href: docsLink('project-shape')
					},
					{
						label: 'Configuration',
						title: 'Need the event-surface map?',
						body: 'Open worker surfaces when the real question is fetch versus queue versus scheduled versus email, or when the package has started owning more than one event family.',
						href: docsLink('worker-surfaces')
					},
					{
						label: 'Routing',
						title: 'Need route layout next?',
						body: 'Open the routing page when the package boundary is clear and the next decision is how `src/fetch.ts` and `src/routes/**` should split responsibility.',
						href: docsLink('http-routing')
					},
					{
						label: 'Configuration',
						title: 'Need generated types and entrypoints?',
						body: 'Open generated types when the architecture includes bindings, named entrypoints, service refs, or Durable Objects that should land in `env.d.ts` honestly.',
						href: docsLink('generated-types')
					},
					{
						label: 'Ship & operate',
						title: 'Need the fuller monorepo workflow?',
						body: 'Open the monorepo page when the next question is Turbo filters, CI workflow boundaries, or package-local deploy discipline across the workspace.',
						href: docsLink('monorepo-turborepo')
					}
				]
			}
		]
	},
	{
		slug: 'devflare-cli',
		group: 'Devflare',
		navTitle: 'CLI',
		readTime: '9 min read',
		eyebrow: 'Command surface',
		title: 'Treat `devflare` as one documented CLI, not a bag of one-off shell snippets',
		summary:
			'Start at `devflare --help`: the root page already maps local dev, inspection, deploy intent, account inventory, preview lifecycle, production control, token management, AI pricing, and remote-mode operations in one place.',
		description:
			'Devflare’s CLI is the public control surface for the same authored config model the docs site describes. Most packages live in the boring `types → dev → build → deploy` loop, but the CLI also owns the surrounding control plane. Learn the root commands once, then drill into `devflare help <command>` or nested `--help` pages when one family goes deeper.',
		highlights: [
			'The root `devflare --help` page is the fastest map of the whole command surface.',
			'`devflare help <command>` and `devflare <command> --help` resolve to the same detailed guide.',
			'Nested control-plane families such as `account`, `previews`, `productions`, `tokens`, and `remote` have their own subcommand surfaces and their own deeper docs pages.',
			'Keep commands package-local so the resolved `devflare.config.*` is the package you actually mean to act on.'
		],
		facts: [
			{ label: 'Best for', value: 'Everyday dev, config inspection, explicit deploys, and the Cloudflare control-plane work around those deploys' },
			{ label: 'Fastest orientation', value: '`bunx --bun devflare --help`' },
			{ label: 'Help depth', value: '`devflare help <command> [subcommand]`' },
			{ label: 'Safest habit', value: 'Run commands from the package that owns the `devflare.config.*` you mean to resolve' }
		],
		sourcePages: [
			'README.md',
			'src/cli/help.ts',
			'src/cli/help-pages/pages/core.ts',
			'src/cli/help-pages/pages/account.ts',
			'src/cli/help-pages/pages/previews.ts',
			'src/cli/help-pages/pages/productions.ts',
			'src/cli/help-pages/pages/misc.ts',
			'src/cli/help-pages/shared.ts'
		],
		sections: [
			{
				id: 'start-with-help',
				title: 'Start with the root help page, then drill down',
				paragraphs: [
					'The root help page is not just a banner and a couple of examples. It is the best quick map of the whole CLI: core dev commands, deploy intent, inspection tools, and the deeper control-plane families all show up there first.',
					'From there, the CLI keeps the same shape all the way down. `devflare help deploy` and `devflare deploy --help` resolve to the same detailed guide, and nested families such as `previews` or `productions` keep going with their own subcommand help instead of forcing you to remember a maze of ad-hoc commands.'
				],
				snippets: [
					{
						title: 'Use the built-in help tree as the CLI map',
						language: 'bash',
						code: String.raw`bunx --bun devflare --help
bunx --bun devflare help deploy
bunx --bun devflare previews --help
bunx --bun devflare previews cleanup-resources --help
bunx --bun devflare productions rollback --help`
					}
				],
				bullets: [
					'Use the root help first when you are not sure which command family owns the job.',
					'Use command-specific help when the job is already obvious but the option vocabulary is not.',
					'Use nested help for the control-plane families that have real subcommand trees instead of pretending one page can explain them all.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'The docs page should mirror the help tree',
						body: [
							'If the built-in help already describes the command surface cleanly, the docs page should explain that structure instead of flattening everything back into four example commands.'
						]
					}
				]
			},
			{
				id: 'root-command-map',
				title: 'Know what each root command family owns',
				table: {
					headers: ['Command', 'Primary job', 'What the deeper help covers'],
					rows: [
						['`init`', 'Scaffold a new package.', 'Template choice and generated starter scripts.'],
						['`dev`', 'Start local development.', 'Worker-only defaults, Vite auto-detection, logging, and persistence.'],
						['`build`', 'Compile deploy-ready artifacts.', 'Environment resolution and Wrangler-facing output.'],
						['`deploy`', 'Ship explicitly to production or preview.', 'Target selection, dry runs, preview naming, messages, and tags.'],
						['`types`', 'Generate `env.d.ts` and typed bindings.', 'Custom output paths plus entrypoint and Durable Object discovery.'],
						['`doctor`', 'Check local project health.', 'Config, package, TypeScript, Vite, and generated artifact diagnostics.'],
						['`config`', 'Print resolved config.', '`print`, raw Devflare JSON, or compiled Wrangler JSON.'],
						['`account`', 'Inspect Cloudflare account inventories and limits.', 'Resource lists, usage limits, and interactive global/workspace selection.'],
						['`login`', 'Authenticate with Cloudflare via Wrangler.', '`--force` behavior and reuse of existing sessions.'],
						['`previews`', 'Operate on preview lifecycle state.', '`bindings`, `provision`, `reconcile`, `cleanup`, `retire`, and `cleanup-resources`.'],
						['`productions`', 'Inspect and mutate live production state.', '`versions`, `rollback`, and `delete`.'],
						['`worker`', 'Run Worker control-plane operations.', 'Currently `rename`, plus config-sync expectations.'],
						['`tokens`', 'Manage Devflare-managed account-owned API tokens.', 'List, create, roll, delete, and the legacy `token` alias.'],
						['`ai`', 'Print the bundled Workers AI pricing snapshot.', 'Read-only pricing surface; verify current rates in Cloudflare docs when it matters.'],
						['`remote`', 'Toggle remote test mode for paid features.', '`status`, `enable`, and `disable`.'],
						['`help`', 'Render root or command-specific help.', 'Nested help resolution for command families and subcommands.'],
						['`version`', 'Print the installed version.', 'Same information as the global `--version` flag.']
					]
				}
			},
			{
				id: 'common-options',
				title: 'Learn the shared option vocabulary once',
				paragraphs: [
					'The root help page also teaches the common option vocabulary. That matters because not every command supports every option, but the meaning stays consistent when the option exists.',
					'If you already know what `--config`, `--env`, `--debug`, and `--help` mean, the command-specific help pages get much easier to scan.'
				],
				table: {
					headers: ['Option', 'What it means', 'Where it matters most'],
					rows: [
						['`--config <path>`', 'Pick the exact `devflare.config.*` file to resolve.', '`build`, `deploy`, `types`, `doctor`, `config`, `previews`, `productions`, and `worker rename`.'],
						['`--env <name>`', 'Resolve `config.env[name]` before the command runs.', '`build`, `config`, preview-aware inspection, and production discovery flows.'],
						['`--debug`', 'Print stack traces and extra debug output.', 'Build, deploy, type generation, and other failure-heavy paths.'],
						['`--no-color`', 'Disable ANSI color output.', 'CI logs, copied transcripts, or plain-text debugging.'],
						['`-h, --help`', 'Show the detailed help page for the current command path.', 'Every root command and nested subcommand surface.'],
						['`-v, --version`', 'Print the installed version and exit.', 'Root invocation when you need to verify the installed package quickly.']
					]
				},
				bullets: [
					'`--env` is meaningful only on commands that actually resolve config environments.',
					'`--help` is not a fallback after confusion; it is the intended first stop for a new command family.',
					'When in doubt about which config file is being resolved, make `--config` explicit instead of trusting directory luck.'
				]
			},
			{
				id: 'nested-control-plane',
				title: 'Use the root page as the map, then let deeper pages own the sharp edges',
				paragraphs: [
					'The root CLI page should tell you which family exists and what it is broadly for. Once a command starts operating on preview lifecycle, live production, account context, tokens, or paid-test gates, the sharper behavior belongs on the dedicated operations pages instead of being re-explained here in parallel.',
					'Use the built-in help for exact flags, then use the docs pages below for the operational safety rules and workflow context around those command families.'
				],
				cards: [
					{
						href: docsLink('control-plane-operations'),
						label: 'Ship & operate',
						meta: 'Operations',
						title: 'Control-plane operations',
						body: 'Open this page for account selection, live production inspection, rollback or delete posture, worker rename, token bootstrap, and remote-mode gates.'
					},
					{
						href: docsLink('cloudflare-api'),
						label: 'Ship & operate',
						meta: 'Library API',
						title: 'devflare/cloudflare',
						body: 'Open this page when a script or tool should use the same account, registry, usage, and token helpers the CLI builds on.'
					},
					{
						href: docsLink('preview-operations'),
						label: 'Ship & operate',
						meta: 'Preview lifecycle',
						title: 'Preview operations',
						body: 'Open this page when the question is preview registry inspection, reconciliation, retirement, or resource cleanup.'
					},
					{
						href: docsLink('production-deploys'),
						label: 'Ship & operate',
						meta: 'Deploy targets',
						title: 'Production deploys',
						body: 'Open this page when the question is the deploy target and preflight inspection rather than later control-plane changes.'
					}
				],
				bullets: [
					'Use `account`, `productions`, `worker`, `tokens`, and `remote` when you are operating real Cloudflare state instead of just building locally.',
					'Use `previews` when the job is preview lifecycle rather than day-to-day package development.',
					'Treat nested `--apply` flows as command families that deserve both built-in help and the dedicated docs page before you run them.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'The sharp edges live one level deeper',
						body: [
							'`previews cleanup-resources`, `previews retire`, `productions rollback`, and `productions delete` all carry behavior and safety notes that are too specific for the root CLI map. Read their help and the dedicated docs page before treating them as copy-paste habits.'
						]
					}
				]
			},
			{
				id: 'daily-loop',
				title: 'Most packages still live in one boring, reliable command loop',
				paragraphs: [
					'The most useful Devflare loop is intentionally repetitive: refresh generated types when bindings move, run local dev, inspect build output when the shape changes, and deploy with an explicit preview or production target.',
					'That loop stays the same whether the package is worker-only or Vite-backed. The config decides the host; the command vocabulary stays familiar.',
					'When the job changes from building to operating, switch command families instead of inventing ad-hoc command snippets: `config` and `doctor` for inspection, `previews` for preview lifecycle, `productions` for live production state, and `account` for inventory questions.'
				],
				snippets: [
					{
						title: 'A good everyday command loop',
						language: 'bash',
						code: String.raw`bunx --bun devflare types
bunx --bun devflare dev
bunx --bun devflare build --env staging
bunx --bun devflare deploy --preview next
bunx --bun devflare deploy --prod`
					},
					{
						title: 'When the setup feels suspicious, inspect before you improvise',
						language: 'bash',
						code: String.raw`bunx --bun devflare config print --format wrangler
bunx --bun devflare doctor
bunx --bun devflare previews bindings --scope next
bunx --bun devflare productions versions`
					}
				],
				bullets: [
					'Run `types` after binding or entrypoint changes so `env.d.ts` stays honest.',
					'Run `build` or `config print --format wrangler` when the compiled shape matters more than the dev server feeling healthy.',
					'Keep preview and production intent explicit in the final deploy command instead of hiding it in a generic script name.',
					'Use the nested help pages when a lifecycle command reaches `--apply`, account selection, rollback, or cleanup territory.'
				]
			},
			{
				id: 'inspection-recovery',
				title: 'Use the inspection and lifecycle commands before you improvise command snippets',
				cards: [
					{
						title: '`config print`',
						body: 'Best when you need to see the resolved Devflare config or compiled Wrangler-facing shape before trusting a build or deploy.'
					},
					{
						title: '`doctor`',
						body: 'Best when config resolution, generated artifacts, or local Vite detection feel hard to trace and need a sharper diagnostic pass.'
					},
					{
						title: '`previews` / `productions`',
						body: 'Best when the question is no longer “can I deploy?” but “what exists right now, and what should I retire, roll back, or inspect?”'
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Keep commands package-local',
						body: [
							'Run Devflare from the package that owns the config you actually mean to resolve. In monorepos, Turbo can decide what changed, but package-local `devflare` commands still decide what gets built, deployed, reconciled, or cleaned up.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'sequence-middleware',
		group: 'Devflare',
		navTitle: 'sequence(...)',
		readTime: '5 min read',
		eyebrow: 'Runtime helper',
		title: 'Compose request-wide middleware with `sequence(...)` instead of burying flow control inside one big fetch file',
		summary:
			'Use `sequence(...)` from `devflare/runtime` when broad HTTP concerns must wrap route resolution or another fetch handler in a clear top-to-bottom order.',
		description:
			'Devflare treats request-wide middleware as a first-class runtime primitive. `sequence(...)` composes `(event, resolve)` middleware for workers, keeps broad concerns readable, and still preserves compatibility with the older handler-composition form.',
		highlights: [
			'Import `sequence` from `devflare/runtime` for worker fetch middleware.',
			'Keep global concerns like CORS, auth, request ids, and response shaping in the sequence chain, not in route leaves.',
			'`resolve(event)` continues into the next middleware or the matched route handler, and it can receive a replacement `FetchEvent` when middleware intentionally forwards a modified request.',
			'Export exactly one primary fetch entry per module: `fetch` or `handle`, not both.'
		],
		facts: [
			{ label: 'Best for', value: 'Request-wide concerns that should wrap routes or another fetch handler cleanly' },
			{ label: 'Primary signature', value: '`(event, resolve) => Response`' },
			{ label: 'Good pairing', value: '`src/fetch.ts` plus `src/routes/**` leaf handlers' }
		],
		sourcePages: ['foundation.md', 'development-workflows.md', 'README.md', 'src/runtime/middleware.ts'],
		sections: [
			{
				id: 'main-shape',
				title: 'Use `sequence(...)` for the broad concerns that should wrap the whole HTTP flow',
				paragraphs: [
					'The cleanest use of `sequence(...)` is broad request-wide behavior: CORS, auth guards, request ids, logging, response shaping, or any other concern that should wrap route resolution instead of being reimplemented in each leaf handler.',
					'That keeps `src/fetch.ts` focused on the global HTTP contract while route files stay small and URL-specific.'
				],
				snippets: [
					{
						title: 'A small global middleware chain',
						activeFile: 'src/fetch.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'src/routes', kind: 'folder' },
							{ path: 'src/routes/users/[id].ts' }
						],
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								code: String.raw`import { sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

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
								code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET({ params }: FetchEvent): Promise<Response> {
	return Response.json({ id: params.id })
}`
							}
						]
					}
				]
			},
			{
				id: 'what-belongs-in-chain',
				title: 'Use the chain for broad concerns, not leaf business logic',
				cards: [
					{
						title: 'Good fit',
						body: 'CORS, auth checks, request ids, logging, response headers, or other concerns that should apply before or after the final leaf handler.'
					},
					{
						title: 'Usually the wrong fit',
						body: 'Business logic that only matters for one URL. If it is leaf-specific, keep it in the matched route file instead of global middleware.'
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'The split should stay boring',
						body: [
							'Global middleware should read like app policy. Route files should read like one URL at a time. If those blur together, the HTTP layer gets harder to review than it needs to be.'
						]
					}
				]
			},
			{
				id: 'resolve-contract',
				title: 'Understand what `resolve(event)` actually means',
				paragraphs: [
					'Calling `resolve(event)` continues into the next middleware in the chain, or into the matched route/module-level handler once no more middleware remains. That makes the order of the chain explicit instead of hidden inside nested helper calls.',
					'`resolve(event)` may also receive a replacement `FetchEvent`. That is the supported way for middleware to forward a modified request, preserved params, or updated locals into the next stage deliberately.',
					'If you need to keep compatibility with older Devflare code, `sequence(...)` still supports the legacy handler-composition form, but the `(event, resolve)` shape is the modern one to prefer for worker HTTP flows.'
				],
				bullets: [
					'`fetch` and `handle` are aliases for the primary fetch entry, so export one or the other, not both.',
					'Same-module method handlers and route resolution happen after the sequence chain passes control onward.',
					'If you are composing SvelteKit hooks, that uses SvelteKit’s own `sequence` helper; it is a separate abstraction from `devflare/runtime` middleware composition.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'One primary fetch entry per module',
						body: [
							'Devflare rejects ambiguous primary fetch modules. Export either `fetch` or `handle` (or one default equivalent), not several competing entrypoints.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'why-testing-feels-native',
		group: 'Devflare',
		navTitle: 'Why tests feel native',
		readTime: '7 min read',
		eyebrow: 'Testing advantage',
		title: 'Why Devflare tests feel like using the worker instead of mocking around it',
		summary:
			'Devflare’s standout testing trick is that the same config, bindings, env surface, runtime helpers, and even direct Durable Object method calls can stay available in Bun tests without a hand-built fake layer in the middle.',
		description:
			'The experience feels better because Devflare does more than boot Miniflare. `createTestContext()` loads the nearest config, wires the real worker surfaces, installs runtime-shaped helper entrypoints, and bridges Node or Bun test code back into the worker world so `env`, `cf.*`, and bridge-backed Durable Object calls keep the same mental model.',
		highlights: [
			'The same authored config drives the app and the tests; there is no separate test-only binding schema to babysit.',
			'The unified `env` proxy works inside request handlers, inside `createTestContext()` tests, and through the bridge when code needs to cross back into the worker world.',
			'`cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail` run user code inside the same AsyncLocalStorage-backed event context the runtime helpers expect.',
			'Durable Object methods can be called directly through `env.MY_DO.getByName(...).myMethod()` instead of forcing every stateful test through HTTP glue.',
			'When a bridge-backed call returns a custom class, `src/transport.ts` can rebuild that class on the caller side instead of flattening it into plain JSON.'
		],
		facts: [
			{ label: 'Big selling point', value: 'Tests can stay worker-shaped instead of mock-shaped' },
			{ label: 'Core trick', value: '`createTestContext()` plus a unified `env` proxy and bridge-backed bindings' },
			{ label: 'Durable Object experience', value: 'Direct `env.COUNTER.getByName(...).increment()` calls in tests' },
			{ label: 'Optional extra', value: '`src/transport.ts` when bridge-backed calls must round-trip custom classes' }
		],
		sourcePages: [
			'src/test/simple-context.ts',
			'src/test/simple-context-durable-objects.ts',
			'src/test/simple-context-gateway-script.ts',
			'src/test/cf.ts',
			'src/test/worker.ts',
			'src/test/queue.ts',
			'src/test/resolve-service-bindings.ts',
			'src/bridge/proxy.ts',
			'src/bridge/client.ts',
			'src/env.ts',
			'tests/integration/test-context/config-autodiscovery.test.ts'
		],
		sections: [
			{
				id: 'why-it-feels-better',
				title: 'The experience feels better because Devflare removes a whole fake layer',
				paragraphs: [
					'A lot of Worker testing feels split-brain. One layer of code is written against real bindings and Worker surfaces, then the tests either fake those APIs by hand or retreat to heavier integration paths for everything.',
					'Devflare tries to keep one authored story instead. The same config that boots the app can boot the test harness, the same `env` import can keep working, and bridge-backed bindings can cross from Bun back into the worker world without forcing every test to speak raw HTTP or a custom mock vocabulary.'
				],
				cards: [
					{
						title: 'One config',
						body: '`createTestContext()` loads the same `devflare.config.*` model the app uses instead of a second test-only binding map.'
					},
					{
						title: 'One env surface',
						body: 'The unified `env` proxy uses request context in handlers, test context in tests, and the bridge when code needs to reach Miniflare-backed bindings.'
					},
					{
						title: 'One set of helper surfaces',
						body: '`cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail` trigger the same handler families your package actually owns.'
					},
					{
						title: 'One honest Durable Object story',
						body: 'Direct `env.MY_DO.getByName(...).method()` calls work in tests, so stateful code does not need a fake facade just to become testable.'
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'This is a real selling point',
						body: [
							'Devflare is at its best when a test can read like app code instead of a ceremony for building a fake Cloudflare universe first.'
						]
					}
				]
			},
			{
				id: 'bridge-layers',
				title: 'The bridge is the difference, but it is not the only layer doing useful work',
				paragraphs: [
					'The seamless part comes from several layers cooperating: config autodiscovery, the unified `env` proxy, runtime-shaped helper entrypoints, AsyncLocalStorage-backed event context, and bridge proxies that forward binding calls into the local worker world.',
					'That is also why Devflare testing scales beyond one fetch route. The same system can cover direct binding calls, queue and scheduled helpers, Tail events, and bridge-backed Durable Object or service interactions without making you rewire the whole harness every time the package grows a new surface.'
				],
				table: {
					headers: ['Layer', 'What Devflare wires', 'Why it feels smoother'],
					rows: [
						['`createTestContext()`', 'Finds the nearest config, boots Miniflare, discovers worker surfaces, and prepares bindings from the same authored project shape.', 'The harness starts where the app starts instead of from a separate test-only setup story.'],
						['Unified `env` proxy', 'Prefers request-scoped env, then test-context env, then bridge-backed env access.', 'One `import { env } from \'devflare\'` can stay valid across app code, tests, and local bridge-backed flows.'],
						['`cf.*` helpers', 'Create runtime-shaped fetch, queue, scheduled, email, and tail events/controllers and install them into AsyncLocalStorage before user code runs.', 'Helpers such as `getFetchEvent()` and `locals` keep working in tests instead of only in real requests.'],
						['Bridge proxies', 'Route KV, D1, R2, Durable Object, queue, service, and send-email calls into the local worker world.', 'Bindings can be exercised through their real shapes instead of custom in-memory fakes.'],
						['Transport hooks', 'Optionally encode and decode custom values for local RPC-style bridge calls.', 'A Durable Object method can return a real class again on the caller side when that behavior matters.']
					]
				},
				bullets: [
					'Service binding refs and cross-worker Durable Object refs can trigger extra worker resolution automatically, so multi-worker tests still begin from the same config model.',
					'For single-worker tests, the bridge-backed env proxy is the normal path. For multi-worker refs, `createTestContext()` can boot the extra workers directly through Miniflare worker configuration.',
					'The bridge is there to remove translation pain, not to make the test vocabulary magical or mysterious.'
				]
			},
			{
				id: 'durable-object-round-trip',
				title: 'This is the part that usually sells people: a Durable Object method can feel native in a test',
				paragraphs: [
					'One of Devflare\'s nicest testing moves is that a Durable Object method can be called straight from the test through `env.COUNTER.getByName(\'main\').increment(2)` instead of forcing you through a fake stub or an HTTP wrapper route.',
					'When the return value is more than plain JSON, `src/transport.ts` can keep the bridge honest by rebuilding the real class on the caller side. That is how a local test can still receive a `DoubleableNumber` with working instance behavior instead of a flattened object.'
				],
				snippets: [
					{
						title: 'The test reads like app code, not like bridge setup',
						description:
							'This mirrors the integration behavior Devflare proves itself: config autodiscovery, a direct Durable Object method call, and a custom class round-trip through `transport.ts`.',
						activeFile: 'tests/counter.test.ts',
						structure: testingFeelsNativeStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 11]],
								code: testingFeelsNativeConfigCode
							},
							{
								path: 'src/DoubleableNumber.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: testingFeelsNativeValueCode
							},
							{
								path: 'src/transport.ts',
								language: 'ts',
								focusLines: [[1, 8]],
								code: testingFeelsNativeTransportCode
							},
							{
								path: 'src/do.counter.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: testingFeelsNativeDurableObjectCode
							},
							{
								path: 'tests/counter.test.ts',
								language: 'ts',
								focusLines: [[1, 13]],
								code: testingFeelsNativeTestCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'The bridge disappears when it is working well',
						body: [
							'That is the real win. You still benefit from the bridge, but the test itself mostly reads like “boot the worker, call the thing, assert the domain value.”'
						]
					}
				]
			},
			{
				id: 'not-just-http',
				title: 'The same smooth story extends beyond plain HTTP',
				table: {
					headers: ['Surface', 'What the test calls', 'What Devflare keeps aligned'],
					rows: [
						['Routes and fetch middleware', '`cf.worker.get()` or `cf.worker.fetch()`', 'Request shape, route params, and AsyncLocalStorage-backed fetch context.'],
						['Queue consumers', '`cf.queue.trigger()`', 'Batch shape, retry or ack behavior, and queued `waitUntil()` work.'],
						['Scheduled jobs', '`cf.scheduled.trigger()`', 'Cron controller shape, scheduled context, and background work timing.'],
						['Email and tail handlers', '`cf.email.send()` and `cf.tail.trigger()`', 'Handler-style invocation with the right local helper semantics instead of custom throwaway scaffolding.'],
						['Bindings and Durable Object methods', '`env.DB`, `env.CACHE`, `env.FILES`, or `env.COUNTER.getByName(...).increment()`', 'The same binding contract app code uses, optionally with transport-backed custom value round-trips.']
					]
				},
				paragraphs: [
					'That range is why the testing story feels bigger than one fetch helper. Devflare is not only helping you send requests; it is helping your tests talk to the same worker-owned surfaces your app logic actually depends on.',
					'When the package grows queues, schedules, email handlers, or Tail processing, the harness grows with the same worker-shaped mindset instead of forcing a whole new testing abstraction for each runtime surface.'
				],
				cards: [
					{
						href: docsLink('create-test-context'),
						label: 'Testing',
						meta: 'Harness details',
						title: 'createTestContext()',
						body: 'Open this when the next question is the exact helper behavior, autodiscovery rules, or background-work timing.'
					},
					{
						href: docsLink('transport-file'),
						label: 'Runtime',
						meta: 'Bridge transport',
						title: 'transport.ts',
						body: 'Open this when the next question is how to preserve real class instances across a local bridge-backed RPC call.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding-specific',
						title: 'Binding testing guides',
						body: 'Jump here when the binding is already chosen and the only remaining question is the most honest test posture for that binding.'
					}
				]
			},
			{
				id: 'keep-it-honest',
				title: 'The pitch gets stronger when the caveats stay visible too',
				bullets: [
					'`cf.worker.fetch()` returns when the handler resolves, so some `waitUntil()` side effects may still be running afterward.',
					'`transport.ts` is for bridge-backed RPC-style calls, not a replacement for normal HTTP request or response serialization.',
					'Remote-heavy bindings such as AI and Vectorize still need higher-fidelity or remote checks sooner than KV, D1, R2, or many Durable Object flows do.',
					'Preview and CI validation still matter for Cloudflare ingress, routing, and deployment lifecycle questions that local tests do not pretend to answer completely.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Smooth local tests are the default, not the whole verification plan',
						body: [
							'Devflare makes honest local tests much easier, but it does not claim that every Cloudflare behavior is now a unit test. The strong story is “less mocking, more truthful local coverage, then higher-fidelity checks when the question changes.”'
						]
					}
				]
			}
		]
	},
	{
		slug: 'testing-overview',
		group: 'Devflare',
		navTitle: 'Testing overview',
		readTime: '7 min read',
		eyebrow: 'Testing map',
		title: 'Use one testing map so you know which Devflare page answers which testing question',
		summary:
			'Devflare’s testing story is layered on purpose: start with one real unit test, use `createTestContext()` and `cf.*` for the runtime-shaped harness, then jump to binding-specific guides or CI-focused pages only when the question changes.',
		description:
			'The docs already explain starter tests, harness behavior, runtime-context caveats, transport round-trips, binding-specific testing, and automation. This page gathers those lanes into one map so you can open the right testing page first instead of re-deriving the docs structure from memory.',
		highlights: [
			'Start with `your first unit test` when the goal is simply “prove the worker boots and answers one request.”',
			'Open `Why tests feel native` when the question is what makes Devflare’s bridge-backed harness feel smoother than the usual Worker testing setup.',
			'Use `createTestContext()` when you need the real worker surface, helper timing rules, and autodiscovery behavior.',
			'Every binding overview page already links its own testing guide at the bottom in the “Go deeper” section.',
			'Use `Testing & automation` when the question shifts from local harness behavior to CI, preview validation, and workflow observability.'
		],
		facts: [
			{ label: 'Best for', value: 'Finding the right testing doc before you disappear into the wrong rabbit hole' },
			{ label: 'Default harness', value: '`createTestContext()` plus `cf.*` helpers' },
			{ label: 'Binding-specific docs', value: 'At the bottom of each binding overview page and in the binding testing index' },
			{ label: 'Automation lane', value: '`/docs/testing-and-automation` for CI, preview checks, and workflow feedback' }
		],
		sourcePages: ['verification-testing-and-caveats.md', 'README.md', 'simple-context.ts', 'cf.ts', 'apps/testing/*'],
		sections: [
			{
				id: 'start-with-one-proof',
				title: 'Start with one honest proof before you optimize the testing story',
				paragraphs: [
					'The safest Devflare testing habit is boring: prove one worker path with one real request first, then only add more harness machinery when a binding, background surface, or preview concern genuinely needs it.',
					'That is why the docs split testing into layers. A starter request test, a runtime-shaped harness page, binding-specific testing guides, and a CI/automation page each answer different questions. Trying to make one page carry all of that usually makes the guidance worse.'
				],
				snippets: [
					{
						title: 'The boring first loop is still the right default',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET /health proves the worker boots', async () => {
	const response = await cf.worker.get('/health')
	expect(response.status).toBe(200)
})`
					}
				],
				bullets: [
					'If the worker cannot answer one truthful request, the next testing abstraction is probably not the rescue mission you need.',
					'Start route-level when the app behavior is the point, and binding-level when the binding itself is the point.',
					'Keep one small proof test around even after the suite grows so the runtime contract stays visible.'
				]
			},
			{
				id: 'open-the-right-page',
				title: 'Open the page that matches the question you actually have',
				cards: [
					{
						href: docsLink('why-testing-feels-native'),
						label: 'Testing',
						meta: 'Why it feels better',
						title: 'Why tests feel native',
						body: 'Open this when the question is less “how do I use the harness?” and more “why does Devflare testing feel so much smoother than the usual Worker setup?”'
					},
					{
						href: docsLink('first-unit-test'),
						label: 'Quickstart',
						meta: 'Starter proof',
						title: 'Your first unit test',
						body: 'Use this when the goal is simply to prove a worker boots, answers one request, and can be exercised through the real Devflare test harness.'
					},
					{
						href: docsLink('create-test-context'),
						label: 'Testing',
						meta: 'Harness',
						title: 'createTestContext()',
						body: 'Use this when you need the real worker-shaped harness, autodiscovered surfaces, helper timing rules, and the `cf.*` testing helpers.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Use this when the binding already exists and the open question is how to test KV, D1, R2, Queues, Durable Objects, AI, Vectorize, or another binding honestly.'
					},
					{
						href: docsLink('runtime-context'),
						label: 'Runtime',
						meta: 'AsyncLocalStorage',
						title: 'Runtime context',
						body: 'Open this when missing-context errors, getters, or runtime proxies are making tests feel harder to trace than they should. It explains the AsyncLocalStorage-backed context model the helpers depend on.'
					},
					{
						href: docsLink('transport-file'),
						label: 'Runtime',
						meta: 'Bridge transport',
						title: 'transport.ts',
						body: 'Open this when a test needs a bridge-backed RPC call to return a real class instance instead of collapsing into plain JSON.'
					},
					{
						href: docsLink('testing-and-automation'),
						label: 'Ship & operate',
						meta: 'CI and release lanes',
						title: 'Testing & automation',
						body: 'Use this page when the question changes from local test harness behavior to CI workflows, preview checks, and observable automation.'
					}
				]
			},
			{
				id: 'choose-the-layer',
				title: 'The right testing layer depends on what changed',
				table: {
					headers: ['If the question is...', 'Open this page first', 'Why'],
					rows: [
						['Can I prove the worker answers one real request?', '`Your first unit test`', 'It keeps the first check small and prevents the harness from becoming accidental ceremony.'],
						['Why does Devflare testing feel smoother than the usual Worker setup?', '`Why tests feel native`', 'It explains the unified env, bridge-backed bindings, AsyncLocalStorage-backed helper surfaces, and direct Durable Object story.'],
						['How does the default runtime-shaped harness behave?', '`createTestContext()`', 'It documents autodiscovery, `cf.*`, helper timing, and when the harness waits for background work.'],
						['How should I test this specific binding?', '`Binding testing guides`', 'Each binding has its own testing page with the right default harness and escalation path.'],
						['Why are getters or proxies failing in a test?', '`Runtime context`', 'The runtime-context page explains the AsyncLocalStorage-backed model underneath the helper APIs.'],
						['Why is a custom class not round-tripping in a test?', '`transport.ts`', 'Transport docs explain the extra serialization hook for bridge-backed calls.'],
						['How should this fit into CI or preview validation?', '`Testing & automation`', 'Automation guidance belongs on the CI-facing page, not in the local harness docs.']
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'One page per question is a feature',
						body: [
							'Devflare’s testing docs are intentionally split so starter tests, binding nuance, runtime context, and automation do not blur into one giant advice blob.'
						]
					}
				]
			},
			{
				id: 'where-binding-guides-live',
				title: 'Binding-specific testing pages already exist — they were just easy to miss',
				paragraphs: [
					'Each binding overview page already ends with a “Go deeper” section that links its hidden internals, testing, and example pages. That means the binding-specific testing content is already in the library, but it was discoverable mostly if you were already reading the right binding page.',
					'Use the binding testing index when you know which binding changed and want the testing guide directly. Use the binding overview page first when you still need the authoring shape, runtime contract, or preview story before the tests make sense.'
				],
				cards: [
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Jump straight to the testing page for KV, D1, R2, Durable Objects, Queues, AI, Vectorize, Hyperdrive, Browser Rendering, Analytics Engine, or Send Email.'
					}
				],
				bullets: [
					'Open the binding overview page when you need config or runtime context first.',
					'Open the binding testing page when the binding already exists and the question is purely about the right harness or escalation path.',
					'Remote-oriented bindings like AI and Vectorize deliberately have a different testing posture from KV or D1, and the testing guides say that out loud.'
				]
			}
		]
	},
	{
		slug: 'binding-testing-guides',
		group: 'Devflare',
		navTitle: 'Binding testing',
		readTime: '8 min read',
		eyebrow: 'Testing index',
		title: 'Open the right binding testing guide instead of reconstructing the test story from scratch',
		summary:
			'Every binding overview page already links a hidden testing guide. This page collects those guides in one place so you can jump straight to the right harness, caveats, and escalation path for the binding that changed.',
		description:
			'Binding testing is not one-size-fits-all. KV, D1, R2, Durable Objects, Queues, and several other bindings are strong local-first stories, while AI, Vectorize, and a few infrastructure-heavy bindings need more remote or higher-fidelity checks sooner. Use this page when you know the binding but do not want to hunt through the whole binding library first.',
		highlights: [
			'Every binding overview page ends with a “Go deeper” section that links its testing guide.',
			'Most bindings still start with `createTestContext()` plus the real binding or helper surface, not a hand-built fake.',
			'Remote-oriented guides say so explicitly instead of pretending every binding has the same local story.',
			'Open the binding overview page first when you need config or runtime shape; open the testing guide first when the binding already exists and the only question left is test design.'
		],
		facts: [
			{ label: 'Best for', value: 'Jumping straight to the right binding-specific testing guide' },
			{ label: 'Where the links also live', value: 'At the bottom of each binding overview page in the “Go deeper” section' },
			{ label: 'Default pattern', value: 'Usually `createTestContext()` plus the real binding or helper surface' },
			{ label: 'Notable exceptions', value: 'AI and Vectorize are remote-oriented, and some other bindings need higher-fidelity checks sooner' }
		],
		sourcePages: ['verification-testing-and-caveats.md', 'README.md', 'simple-context.ts', 'cf.ts', 'apps/testing/*'],
		sections: [
			{
				id: 'how-to-use-this-index',
				title: 'Use this page as the index, but remember where the links already live',
				paragraphs: [
					'The binding library intentionally keeps only the main binding overview pages visible in the sidebar. The testing pages are still real docs pages, but they stay linked from the bottom of each binding overview so the sidebar does not turn into a twelve-level nesting doll.',
					'That is great once you already opened the right binding page. This index is for the opposite moment: you know the binding that changed and you want the testing guide immediately.'
				],
				bullets: [
					'Open the binding overview page first when you need authoring, runtime, or preview context before the tests make sense.',
					'Open the testing guide first when the binding already exists and the only remaining question is how to test it honestly.',
					'Use `Testing overview` when you need the bigger map across starter tests, harness behavior, binding guides, runtime helpers, and automation.'
				],
				cards: [
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the broader testing map when you are not yet sure whether the next question belongs to starter tests, binding guides, runtime context, or automation.'
					}
				]
			},
			{
				id: 'open-the-guide',
				title: 'Open the testing guide for the binding that actually changed',
				cards: bindingTestingGuideCards
			},
			{
				id: 'testing-posture',
				title: 'The testing posture is not identical for every binding',
				table: {
					headers: ['Binding', 'Testing posture', 'Default harness'],
					rows: bindingTestingGuideRows
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Different defaults are a good thing',
						body: [
							'KV, D1, R2, and Queues should not be documented like remote AI inference, and remote AI inference should not be documented like local KV. The different testing guides are there to keep those truths visible.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'create-test-context',
		group: 'Devflare',
		navTitle: 'createTestContext()',
		readTime: '6 min read',
		eyebrow: 'Test harness',
		title: 'Use `createTestContext()` and `cf.*` as the default runtime-shaped test harness',
		summary:
			'Start tests with `createTestContext()` so the same config, bindings, routes, and handler surfaces the app uses in real runtime flows are available in Bun tests.',
		description:
			'Devflare’s recommended test story is not a pile of hand-built mocks. `createTestContext()` loads the nearest supported config, wires the local runtime surface, and gives you `cf.*` helpers that feel like the Worker entrypoints the app actually uses.',
		highlights: [
			'`createTestContext()` autodiscovers the nearest supported config when you omit the path.',
			'It also autodiscovers conventional worker surfaces such as fetch, routes, queue, scheduled, email, and tail handlers.',
			'The helpers are runtime-shaped and context-accurate for handler logic, but they do not try to replay every internal Cloudflare dispatch detail byte for byte.',
			'`cf.worker.fetch()` does not eagerly wait for all `waitUntil()` work, while queue, scheduled, and tail helpers do wait for their background work.',
			'`src/transport.ts` stays optional and only matters when a local RPC-style bridge call under test—most commonly a Durable Object method round-trip—must preserve custom classes.'
		],
		facts: [
			{ label: 'Best for', value: 'Runtime-shaped tests that should stay close to the real worker surface' },
			{ label: 'Default harness', value: '`createTestContext()` plus `cf.*` helpers' },
			{ label: 'Optional extra', value: '`src/transport.ts` for custom class round-trips across local RPC-style bridge calls, especially Durable Object methods' }
		],
		sourcePages: ['src/test/simple-context.ts', 'src/test/simple-context-durable-objects.ts', 'src/test/simple-context-paths.ts', 'src/test/cf.ts', 'src/test/tail.ts', 'src/runtime/context.ts', 'tests/integration/test-context/config-autodiscovery.test.ts'],
		sections: [
			{
				id: 'autodiscovery',
				title: 'Let the harness discover the normal worker shape first',
				paragraphs: [
					'When you omit the config path, `createTestContext()` walks upward from the calling test file and finds the nearest supported config filename. It then autodetects the conventional worker surfaces that belong to that package instead of making you wire each one by hand.',
					'That is the main reason the built-in harness scales: the same config and file conventions keep working as the package gains routes, queues, scheduled handlers, inbound email, or tail handlers.'
				],
				bullets: [
					'Config path autodiscovery starts from the calling test file when you omit the argument.',
					'Conventional files such as `src/fetch.ts`, `src/routes/**`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts`, and `src/tail.ts` are discovered automatically when present.',
					'Service bindings and other config-driven runtime surfaces are discovered from the same authored config instead of a separate test-only schema.',
					'If a local RPC-style bridge call under test later needs custom class round-trips, the harness can also discover `src/transport.{ts,js,mts,mjs}` automatically.'
				]
			},
			{
				id: 'helper-behavior',
				title: 'Know which helpers wait for background work and which do not',
				table: {
					headers: ['Helper', 'Current behavior'],
					rows: [
						['`cf.worker.fetch()`', 'Returns when the handler resolves and does not eagerly wait for all `waitUntil()` work.'],
						['`cf.queue.trigger()`', 'Waits for queued background work before it returns.'],
						['`cf.scheduled.trigger()`', 'Waits for scheduled background work before it returns.'],
						['`cf.email.send()`', 'In `createTestContext()` tests, directly invokes the configured local email handler and waits for its queued `waitUntil()` work; otherwise it falls back to the local email endpoint.'],
						['`cf.tail.trigger()`', 'Works when `src/tail.ts` exists, supports a default or named `tail` export, and waits for the handler plus its `waitUntil()` work before it returns.']
					]
				},
				paragraphs: [
					'These helpers are runtime-shaped and context-accurate for handler logic, but they do not try to recreate every internal Cloudflare dispatch step byte for byte. That is why their timing rules are documented explicitly instead of being left to guesswork.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not assert the wrong timing contract',
						body: [
							'If a test depends on `waitUntil()` side effects being complete, a plain `cf.worker.fetch()` assertion may be too early. Either assert the side effect directly or move that check into a higher-fidelity path.'
						]
					}
				]
			},
			{
				id: 'tail-support',
				title: 'Tail handlers are testable even before they become a public config lane',
				paragraphs: [
					'Tail support is already a real helper surface in the harness even though it still sits outside the public `files.*` config keys. When `createTestContext()` finds `src/tail.ts`, it wires `cf.tail.trigger()` automatically and runs the handler inside the same AsyncLocalStorage-backed event context as the other helpers.',
					'The handler can export a default function or a named `tail` function. The helper accepts either full trace items or smaller option objects through `cf.tail.create(...)`, then waits for the handler and any queued `waitUntil()` work before it returns.'
				],
				snippets: [
					{
						title: 'A tiny tail handler plus one honest harness test',
						activeFile: 'tests/tail.test.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/tail-state.ts' },
							{ path: 'src/tail.ts' },
							{ path: 'tests', kind: 'folder' },
							{ path: 'tests/tail.test.ts' }
						],
						files: [
							{
								path: 'src/tail-state.ts',
								language: 'ts',
								code: String.raw`export const seenScripts: string[] = []`
							},
							{
								path: 'src/tail.ts',
								language: 'ts',
								code: String.raw`import type { TailEvent } from 'devflare/runtime'
import { seenScripts } from './tail-state'

export async function tail({ events }: TailEvent): Promise<void> {
	for (const item of events) {
		seenScripts.push(item.scriptName)
	}
}`
							},
							{
								path: 'tests/tail.test.ts',
								language: 'ts',
								code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'
import { seenScripts } from '../src/tail-state'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('tail handler sees trace items', async () => {
	seenScripts.length = 0

	const result = await cf.tail.trigger([
		cf.tail.create({
			scriptName: 'jobs-worker',
			logs: [{ level: 'error', message: ['queue failed'], timestamp: Date.now() }]
		})
	])

	expect(result.success).toBe(true)
	expect(seenScripts).toEqual(['jobs-worker'])
})`
							}
						]
					}
				],
				bullets: [
					'Keep `src/tail.ts` as a conventional file for now; there is still no public `files.tail` config key.',
					'Use `cf.tail.create()` when the test only needs a few trace fields, and pass full trace items when the payload details are the point of the assertion.',
					'Reach for a higher-fidelity integration path when the question is Cloudflare ingress behavior rather than your own log or trace handling logic.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Supported helper, still a special-case surface',
						body: [
							'Tail support is real in the harness and runtime context model, but it is intentionally not documented like fetch, queue, scheduled, or email config yet because there is still no public `files.tail` key.'
						]
					}
				]
			},
			{
				id: 'small-proof',
				title: 'Start with one small proof test before layering helpers on top',
				snippets: [
					{
						title: 'A minimal runtime-shaped test',
						filename: 'tests/worker.test.ts',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('worker runtime', () => {
	test('routes through the built-in router', async () => {
		const response = await cf.worker.get('/users/123')
		expect(response.status).toBe(200)
	})
})`
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Keep the first test boring',
						body: [
							'If the harness is working, you should be able to prove one route or handler path quickly before you hide it behind bigger factory helpers or shared test setup.'
						]
					}
				]
			},
			{
				id: 'when-to-add-transport',
				title: 'Add `transport.ts` only when local RPC-style bridge calls in tests must preserve custom classes',
				paragraphs: [
					'Most `createTestContext()` tests do not need a transport file because strings, numbers, arrays, and plain JSON objects already cross the bridge naturally.',
					'Reach for `src/transport.ts` when a local RPC-style bridge call returns a real class instance and the caller needs that class again instead of a plain object. In practice that is most often a Durable Object method round-trip inside `createTestContext()`, not an ordinary HTTP response.'
				],
				bullets: [
					'Keep the encoded payload plain and JSON-friendly.',
					'Use one small transport entry per value type so decode rules stay reviewable.',
					'Set `files.transport: null` when you want to disable the convention explicitly for one package.'
				]
			},
			{
				id: 'where-to-go-next',
				title: 'Know where to go when the harness is only part of the question',
				cards: [
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the overview page when you are not sure whether the next question belongs to starter tests, binding-specific guides, runtime helpers, or CI.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Jump straight to the binding-specific testing page when KV, D1, R2, Durable Objects, Queues, AI, or another binding needs a more specific test story.'
					},
					{
						href: docsLink('runtime-context'),
						label: 'Runtime',
						meta: 'AsyncLocalStorage',
						title: 'Runtime context',
						body: 'Read this when getter failures, missing context, or proxy behavior are making the test harness harder to trace than it should be.'
					},
					{
						href: docsLink('testing-and-automation'),
						label: 'Ship & operate',
						meta: 'Automation',
						title: 'Testing & automation',
						body: 'Use the CI-facing page when the question becomes preview validation, workflow structure, or what should happen in automation instead of local tests.'
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'The harness is the center, not the whole map',
						body: [
							'`createTestContext()` is the default test loop, but binding-specific caveats, runtime-context rules, and automation concerns still belong on their own pages.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'transport-file',
		group: 'Devflare',
		navTitle: 'transport.ts',
		readTime: '4 min read',
		eyebrow: 'Runtime transport',
		title: 'Use `src/transport.ts` when local RPC-style bridge calls must round-trip custom classes cleanly',
		summary:
			'Most workers do not need a transport file. Add one when Devflare’s local RPC-style bridge must encode and decode custom values, especially across Durable Object method calls in tests.',
		description:
			'`src/transport.ts` is Devflare’s custom serialization hook for local RPC-style bridge calls, especially the Durable Object round-trips Devflare manages in tests. It customizes the serialization layer for that bridge; it is not a replacement for ordinary fetch request or response handling. Its job is to let values that would otherwise collapse into plain JSON be rebuilt as real class instances on the caller side.',
		highlights: [
			'Use the conventional `src/transport.{ts,js,mts,mjs}` file or point `files.transport` at a custom path.',
			'The file must export a named `transport` object.',
			'Each transport entry needs an `encode` and `decode` pair.',
			'Set `files.transport: null` to disable autodiscovery explicitly.'
		],
		facts: [
			{ label: 'Best for', value: 'Bridge-backed Durable Object results that return custom classes' },
			{ label: 'Usually unnecessary', value: 'Strings, numbers, arrays, and plain JSON objects' },
			{ label: 'Disable rule', value: '`files.transport: null`' }
		],
		sourcePages: ['src/test/simple-context.ts', 'src/test/simple-context-durable-objects.ts', 'src/test/simple-context-paths.ts', 'src/dev-server/worker-surface-paths.ts', 'src/config/schema-runtime.ts', 'tests/integration/test-context/config-autodiscovery.test.ts'],
		sections: [
			{
				id: 'when-you-need-it',
				title: 'Reach for it only when local RPC-style bridge calls must preserve real classes',
				paragraphs: [
					'Most workers do not need a transport file because plain data already crosses the bridge naturally.',
					'Add `src/transport.ts` when a local RPC-style bridge call returns a custom class instance and you want the caller to receive that class again instead of a plain object.'
				],
				cards: [
					{
						title: 'Good fit',
						body: 'A Durable Object method or another Devflare-managed RPC boundary returns a small domain value like `Money`, `DoubleableNumber`, or another class with behavior you want to keep intact.'
					},
					{
						title: 'Usually unnecessary',
						body: 'The handler or RPC call returns plain strings, numbers, arrays, or JSON objects that do not need custom decode logic.'
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Think “bridge-backed RPC”, not “normal JSON responses”',
						body: [
							'This file matters when Devflare is proxying values across its local RPC bridge. It is not a replacement for ordinary Worker request or response serialization.'
						]
					}
				]
			},
			{
				id: 'transport-shape',
				title: 'Export one named `transport` object with small encode and decode pairs',
				description:
					'Keep each entry boring and explicit: detect one value shape, encode it into plain data, and decode that data back into the class on the caller side.',
				snippets: [
					{
						title: 'Keep the transport file next to the class it knows how to round-trip',
						description:
							'The transport file teaches Devflare how to turn a custom class into plain data for the bridge, then rebuild that class for the caller.',
						activeFile: 'src/transport.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/DoubleableNumber.ts' },
							{ path: 'src/transport.ts' },
							{ path: 'src/do.counter.ts' }
						],
						files: [
							{
								path: 'src/DoubleableNumber.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: String.raw`export class DoubleableNumber {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double() {
		return this.value * 2
	}
}`
							},
							{
								path: 'src/transport.ts',
								language: 'ts',
								focusLines: [[3, 8]],
								code: String.raw`import { DoubleableNumber } from './DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) =>
			value instanceof DoubleableNumber ? value.value : false,
		decode: (value: number) => new DoubleableNumber(value)
	}
}`
							},
							{
								path: 'src/do.counter.ts',
								language: 'ts',
								focusLines: [[5, 8]],
								code: String.raw`import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}`
							}
						]
					}
				],
				bullets: [
					'Return `false` or `undefined` from `encode` when the value is not a match.',
					'Keep the encoded payload plain and JSON-friendly.',
					'Use one transport key per value type so decoding stays obvious in code review.'
				]
			},
			{
				id: 'prove-it',
				title: 'A tiny test is still the easiest proof of the round-trip',
				snippets: [
					{
						title: 'Test the round-trip, not just the numeric value',
						filename: 'tests/counter.test.ts',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import { DoubleableNumber } from '../src/DoubleableNumber'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('custom transport restores the class instance', async () => {
	const result = await env.COUNTER.getByName('main').increment(2)

	expect(result).toBeInstanceOf(DoubleableNumber)
	expect(result.value).toBe(2)
	expect(result.double).toBe(4)
})`
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Keep the first proof small',
						body: [
							'If the transport works, you should be able to prove it with one class, one method call, and one `instanceof` assertion before you hide it inside bigger helpers.'
						]
					}
				]
			},
			{
				id: 'autodiscovery-rules',
				title: 'Know the autodiscovery and disable rules',
				bullets: [
					'Use the conventional `src/transport.{ts,js,mts,mjs}` path when you want the default location.',
					'Use `files.transport` when the transport file lives somewhere else.',
					'Set `files.transport: null` when you want to disable the convention explicitly for a package.',
					'If the file exists but does not export a named `transport` object, Devflare warns and continues without custom transport decoding.'
				],
				snippets: [
					{
						title: 'Point at a custom transport path when the convention is not enough',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'transport-example',
	files: {
		fetch: 'src/fetch.ts',
		transport: 'src/transport.ts'
	}
})`
					},
					{
						title: 'Disable transport autodiscovery explicitly',
						language: 'ts',
						code: String.raw`files: {
	transport: null
}`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not treat the warning as success',
						body: [
							'If Devflare warns that the file does not export a named `transport` object, custom decode is off. The test may still run, but your class round-trip will not.'
						]
					}
				]
			}
		]
	}
]
