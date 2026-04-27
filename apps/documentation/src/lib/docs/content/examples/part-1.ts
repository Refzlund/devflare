import type { DocPage } from '../../types'
import {
	caseLink,
	docsLink,
	durableObjectRecipeFiles,
	featureRows,
	offlineRecipeFiles,
	previewRecipeFiles,
	queueRecipeFiles,
	recipeRows,
	serviceBindingRecipeFiles,
	storageRecipeFiles,
	svelteKitRecipeFiles,
	workerOnlyRecipeFiles
} from './shared'

export const examplesDocsPart1: DocPage[] = [
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
				snippets: [
					{
						title: 'A route-tree path you can copy after the first worker runs',
						description:
							'This is the smallest practical next step: one config, one request-wide handler, one route leaf, and one test that exercises the route through the worker.',
						activeFile: 'src/routes/notes/[id].ts',
						files: workerOnlyRecipeFiles
					}
				],
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
				snippets: [
					{
						title: 'Turn the choice into one concrete config',
						filename: 'devflare.config.ts',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'orders-api',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts'
	},
	bindings: {
		d1: {
			DB: 'orders-db'
		},
		kv: {
			CACHE: 'orders-cache'
		},
		queues: {
			producers: {
				FULFILLMENT: 'orders-fulfillment'
			}
		}
	}
})`
					}
				],
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
				snippets: [
					{
						title: 'Use the matrix to pick a local proof lane',
						filename: 'tests/cache.test.ts',
						language: 'ts',
						code: String.raw`import { describe, expect, test } from 'bun:test'
import { createOfflineEnv } from 'devflare/test'

describe('feature support matrix choice', () => {
	test('KV can be proven with an offline binding fixture', async () => {
		const env = createOfflineEnv({
			kv: ['CACHE']
		})

		await env.CACHE.put('feature:homepage', 'enabled')

		expect(await env.CACHE.get('feature:homepage')).toBe('enabled')
	})
})`
					}
				],
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
				snippets: [
					{
						title: 'Pin the case catalog into runnable workspace scripts',
						description:
							'Turn the cases you recommend to teammates into package scripts so the examples stay easy to run and review.',
						filename: 'package.json',
						language: 'json',
						code: String.raw`{
	"scripts": {
		"case:basic-worker": "bun --cwd cases/case1 test",
		"case:queues": "bun --cwd cases/case6 test",
		"case:sveltekit": "bun --cwd cases/case18 test",
		"case:transport": "bun --cwd cases/case19 test"
	}
}`
					},
					{
						title: 'Run a focused example case before reading its internals',
						language: 'bash',
						code: String.raw`cd cases/case6
bun test

# Open the config, handler, and tests together while the output is fresh.
code devflare.config.ts src tests`
					}
				],
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
				snippets: [
					{
						title: 'Read a real runtime-shaped test as an advanced example',
						filename: 'tests/worker-routing.test.ts',
						language: 'ts',
						code: String.raw`import { describe, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'

describe('route dispatch', () => {
	test('the worker serves a named route through the real harness', async () => {
		const ctx = await createTestContext()

		try {
			const response = await ctx.cf.worker.get('/notes/123')

			expect(response.status).toBe(200)
			expect(await response.text()).toContain('123')
		} finally {
			await ctx.dispose()
		}
	})
})`
					}
				],
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
	}
]
