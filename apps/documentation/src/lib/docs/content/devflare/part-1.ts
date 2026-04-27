import type { DocPage } from '../../types'
import {
	bindingTestingGuideCards,
	bindingTestingGuideRows,
	docsLink,
	projectArchitectureFullSurfaceConfigCode,
	projectArchitectureFullSurfaceDurableObjectCode,
	projectArchitectureFullSurfaceQueueCode,
	projectArchitectureFullSurfaceStructure,
	projectArchitectureHostedAppConfigCode,
	projectArchitectureHostedAppPackageCode,
	projectArchitectureHostedAppStructure,
	projectArchitectureHostedAppViteCode,
	projectArchitectureMonorepoCommandsCode,
	projectArchitectureMonorepoRootPackageCode,
	projectArchitectureMonorepoStructure,
	projectArchitectureMonorepoTurboCode,
	projectArchitectureStarterConfigCode,
	projectArchitectureStarterFetchCode,
	projectArchitectureStarterPackageCode,
	projectArchitectureStarterRouteCode,
	projectArchitectureStarterStructure,
	projectArchitectureSveltekitCase18ConfigCode,
	testingFeelsNativeConfigCode,
	testingFeelsNativeDurableObjectCode,
	testingFeelsNativeStructure,
	testingFeelsNativeTestCode,
	testingFeelsNativeTransportCode,
	testingFeelsNativeValueCode
} from './shared'

export const devflareDocsPart1: DocPage[] = [
	{
		slug: 'project-architecture',
		group: 'Devflare',
		navTitle: 'Project Architecture',
		readTime: '9 min read',
		eyebrow: 'Project setup',
		title:
			'Structure Devflare projects around one authored config, explicit runtime files, and package-local deploy ownership',
		summary:
			'This is the practical answer to “what does a real Devflare project look like on disk?” — from a small worker package, to a multi-surface app, to a hosted SvelteKit package, to a Bun monorepo with several deployable workers.',
		description:
			'Devflare projects stay readable when the package boundary is obvious, the authored files stay separate from generated output, and each runtime surface owns its own file. This page maps the common file types, then shows a few real project shapes from this repository so you can set up your package deliberately instead of accumulating conventions by accident.',
		highlights: [
			'Every deployable package still starts with one authored `devflare.config.ts` file.',
			'Worker surfaces like `fetch`, routes, queue, scheduled, email, Durable Objects, entrypoints, workflows, and transport should each live in explicit files when the package actually owns them.',
			'Hosted Vite or SvelteKit apps add package-local host files like `vite.config.ts` and `svelte.config.js`, but they still keep Devflare config as the Cloudflare-facing source of truth.',
			'Generated files like `env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**` are outputs, not the authored architecture.',
			'In a monorepo, Turbo can orchestrate validation across the workspace, but package-local `devflare` commands still decide what actually builds or deploys.'
		],
		facts: [
			{
				label: 'Best for',
				value:
					'Teams deciding how to lay out a new Devflare package or a multi-package workspace before file structure gets noisy'
			},
			{ label: 'Primary authored file', value: '`devflare.config.ts` in each deployable package' },
			{ label: 'Generated files', value: '`env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**`' },
			{
				label: 'Monorepo rule',
				value: 'Validate from the root, but deploy from the package that owns the config'
			}
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
						[
							'`devflare.config.ts`',
							'Every deployable package',
							'The authored Devflare source of truth for files, bindings, env overlays, previews, and deployment posture.'
						],
						[
							'`package.json`',
							'Every package',
							'Package-local scripts, dependencies, and the command loop that should run from that package.'
						],
						[
							'`src/fetch.ts`',
							'The package owns request-wide HTTP behavior',
							'The main worker entry for broad middleware or request handling.'
						],
						[
							'`src/routes/**`',
							'The package uses file-based HTTP leaves',
							'URL-specific route handlers that sit beside, or replace, one large fetch file.'
						],
						[
							'`src/queue.ts`, `src/scheduled.ts`, `src/email.ts`',
							'The package consumes those platform events',
							'Separate event surfaces instead of burying background logic inside fetch code.'
						],
						[
							'`src/do/**/*.ts`',
							'The package owns Durable Object classes',
							'Stateful classes discovered and bundled through config.'
						],
						[
							'`src/ep/**/*.ts`',
							'The package exposes named worker entrypoints',
							'Classes discovered for typed `ref().worker(...)` service boundaries.'
						],
						[
							'`src/workflows/**/*.ts`',
							'The package owns workflow definitions',
							'Additional discovered runtime modules that stay explicit in config review.'
						],
						[
							'`src/transport.ts`',
							'Local RPC-style bridge calls must preserve custom values',
							'Custom encode/decode rules for local bridge-backed calls, most often in tests or Durable Object method round-trips.'
						],
						[
							'`env.d.ts`',
							'You run `devflare types`',
							'Generated binding and entrypoint types. Do not hand-edit it.'
						],
						[
							'`vite.config.ts`, `svelte.config.js`, `src/routes/+page.svelte`',
							'The package is a hosted Vite or SvelteKit app',
							'Host-app files that sit around the Devflare worker story instead of replacing it.'
						],
						[
							'`.devflare/**`, `.wrangler/deploy/**`',
							'Devflare has built, checked, or prepared deploy output',
							'Generated build and deploy artifacts. Useful to inspect, not the authored architecture.'
						]
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
						title:
							'Small worker package with one config, one fetch file, one route tree, and generated output kept in its lane',
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
					'This is where Devflare architecture becomes more interesting than “one fetch file.” A single package can still own HTTP, route modules, queue work, scheduled jobs, email handlers, Durable Objects, named entrypoints, workflows, and transport rules — as long as each surface keeps its own file and the config names those surfaces explicitly.',
					'The `files.*` lane matters for this reason. It is the map of which runtime surfaces the package actually owns.'
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
						[
							'`src/routes/**`',
							'Leaf handlers that mirror URLs instead of bloating the global fetch file.'
						],
						[
							'`src/queue.ts`, `src/scheduled.ts`, `src/email.ts`',
							'Background and platform-triggered event surfaces with their own runtime contracts.'
						],
						[
							'`src/do/**/*.ts`',
							'Stateful Durable Object classes discovered and bundled through config.'
						],
						['`src/ep/**/*.ts`', 'Named worker entrypoints for typed cross-worker boundaries.'],
						[
							'`src/workflows/**/*.ts`',
							'Workflow definitions discovered as part of the package runtime shape.'
						],
						[
							'`src/transport.ts`',
							'Local bridge serialization only when custom values need to survive a bridge-backed call.'
						]
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
				title:
					'In a monorepo, Turbo orchestrates the workspace but packages still deploy themselves',
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
						body: 'Open generated types when the architecture includes bindings, named entrypoints, service refs, or Durable Objects that should land in `env.d.ts` accurately.',
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
	}
]
