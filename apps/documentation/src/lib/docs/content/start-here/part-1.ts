import type { DocPage } from '../../types'
import {
	browserBindingsStructure,
	browserConfigCode,
	browserRouteCode,
	counterObjectCode,
	counterTransportCode,
	counterValueCode,
	docsLink,
	durableObjectBindingsStructure,
	durableObjectConfigCode,
	durableObjectRouteCode,
	firstWorkerConfigCode,
	firstWorkerFetchCode,
	firstWorkerStructure,
	firstWorkerTestCode,
	r2BindingsStructure,
	r2ConfigCode,
	r2RouteCode,
	requestContextHelperCode,
	routedWorkerConfigCode,
	routedWorkerFetchCode,
	routedWorkerIndexRouteCode,
	routedWorkerStructure
} from './shared'
import { cloudflarePlatformSupportCards } from './support-coverage'

export const startHereDocsPart1: DocPage[] = [
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
			'The goal is not to hide Cloudflare. The goal is to keep the files you edit small and obvious, then give you a smoother path from one worker to routing, bindings, frameworks, previews, and automation.',
		highlights: [
			'Start with one config file, one dev command, generated types, and runtime-shaped tests instead of assembling each piece separately.',
			'Keep the code surface split by job: `devflare/config`, `devflare/runtime`, `devflare/test`, and dedicated `vite` or `sveltekit` lanes instead of one giant catch-all entrypoint.',
			'Keep Worker code worker-first: explicit surfaces, small handlers, readable config, and Rolldown-backed worker compilation before framework glue enters the picture.',
			'Scale into Vite and SvelteKit without replacing the worker-first story; in local dev, framework endpoints can still talk to Cloudflare-shaped bindings through the bridge-backed platform surface.',
			'Keep preview, cleanup, and production operations explicit instead of burying them in undocumented shell habits.',
			'Stay close to the real Cloudflare platform contract instead of learning a fantasy abstraction you have to unlearn later.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Teams that want Cloudflare power without accumulating setup glue'
			},
			{
				label: 'Architecture shape',
				value: 'Config, runtime, tests, framework integration, and Cloudflare ops stay separate'
			},
			{
				label: 'Build lane',
				value: 'Rolldown composes worker and Durable Object artifacts; Vite stays optional'
			},
			{
				label: 'Still true',
				value: 'Cloudflare limits and Wrangler-compatible output still matter'
			}
		],
		sourcePages: [
			'README.md',
			'packages/devflare/README.md',
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
			'cli/commands/previews.ts',
			'schema-runtime.ts',
			'packages/devflare/src/test/offline-bindings.ts',
			'packages/devflare/src/test/containers.ts',
			'packages/devflare/src/test/utilities.ts',
			'apps/documentation/src/lib/docs/content/bindings/*'
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
					"`devflare/config` is for authored config, `devflare/runtime` is for worker code, `devflare/test` is for harnesses, and `devflare/vite` or `devflare/sveltekit` only join the picture when the package grows into a real app host. That split is one of the package's quiet strengths.",
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
				title: 'What Devflare supports across Cloudflare platform features',
				description:
					'Every native binding or platform lane in the binding docs is listed here with its current Devflare support level and a direct link to the page with config, examples, tests, and boundary notes. Hover a label to see what that support level means.',
				cards: cloudflarePlatformSupportCards
			},
			{
				id: 'devflare-enhancements',
				title: 'What Devflare adds on top of raw Cloudflare workflows',
				description:
					'These are the pieces you use while building an app, not concepts you need to memorize before the first route works.',
				cards: [
					{
						label: 'Runtime',
						title: 'Runtime context helpers',
						body: 'Helper code can read the active request, env, ctx, event, and `locals` without threading the event through every function call.',
						href: docsLink('runtime-context')
					},
					{
						label: 'Runtime',
						title: '`sequence(...)` middleware',
						body: 'Request-wide middleware gets a named helper instead of forcing every app to reinvent the same fetch wrapper.',
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
			}
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
			{
				label: 'Authoritative authoring layer',
				value: '`apps/documentation/src/lib/docs/content*.ts`'
			},
			{
				label: 'Primary reading surfaces',
				value: 'Task-focused `/docs/*` routes plus `/llm.md` and `/llm.txt` exports'
			},
			{
				label: 'Refresh commands',
				value:
					'`bun run llm:generate` from `apps/documentation`, or the same command from `packages/devflare` when you also want the packaged copy refreshed'
			}
		],
		sourcePages: [
			'packages/devflare/README.md',
			'packages/devflare/src/config/schema.ts',
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/dev-server/server.ts',
			'packages/devflare/src/cli/commands/deploy.ts',
			'packages/devflare/src/test/simple-context.ts',
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
				snippets: [
					{
						title: 'Wire docs generation and drift checks into the repo scripts',
						description:
							'Use package scripts and CI to keep the authored site model, generated site exports, and packaged handbook moving together.',
						activeFile: 'package.json',
						structure: [
							{ path: 'package.json' },
							{ path: '.github', kind: 'folder' },
							{ path: '.github/workflows/docs-quality.yml' },
							{ path: 'apps/documentation', kind: 'folder', muted: true },
							{ path: 'packages/devflare/LLM.md', muted: true }
						],
						files: [
							{
								path: 'package.json',
								language: 'json',
								code: String.raw`{
	"scripts": {
		"docs:generate": "bun run --cwd apps/documentation llm:generate && bun run --cwd packages/devflare llm:generate",
		"docs:check": "bun run devflare:docs-integrity && bun run --cwd apps/documentation check"
	}
}`
							},
							{
								path: '.github/workflows/docs-quality.yml',
								language: 'yaml',
								code: String.raw`name: Documentation quality

on:
  pull_request:
    paths:
      - "apps/documentation/**"
      - "packages/devflare/LLM.md"
      - "packages/devflare/tests/unit/docs/**"

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run docs:generate
      - run: bun run docs:check`
							}
						]
					},
					{
						title: 'Regenerate the handbook from the site model',
						language: 'bash',
						code: String.raw`bun run --cwd apps/documentation llm:generate
bun run --cwd packages/devflare llm:generate
bun run devflare:docs-integrity`
					}
				],
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
		sourcePages: ['README.md', 'packages/devflare/README.md'],
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
						body: 'Choose between KV, D1, R2, and Hyperdrive before you open the binding guide with the config and examples.',
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
	}
]
