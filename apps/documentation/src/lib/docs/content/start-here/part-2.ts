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
	routedWorkerStructure,
	supportCoverageTooltips
} from './shared'

export const startHereDocsPart2: DocPage[] = [
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
		sourcePages: ['README.md', 'packages/devflare/README.md', 'simple-context.ts', 'cf.ts'],
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
					'When you need more test helpers, open `/docs/create-test-context` for the full helper map.'
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
			{
				label: 'Best for',
				value: 'Growing the first worker without turning `src/fetch.ts` into one crowded file'
			},
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
					"That shape also lets helper modules read the active request path, route params, request body, or request id through `getFetchEvent()` and `locals` without turning every function signature into plumbing."
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
				description: 'Keep the same worker shape and let one route file own the bucket round-trip.',
				paragraphs: [
					'Here the route path becomes the obvious home for the binding: `src/routes/files/[name].ts` owns both the `PUT` and `GET` flow for one named object.',
					'The shared helper still provides request-wide context, route params, and request reads through runtime helpers, while the route file keeps the bucket usage visible and local to the URL that needs it.'
				],
				snippets: [
					{
						title: 'Same worker, now add one file route and one bucket binding',
						description:
							'The global fetch file stays tiny. The new work lives in one route file under `src/routes/files/[name].ts`, while the helper module still reads the active request through runtime helpers.',
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
				description: 'Keep the same worker shape and let one route prove the browser binding.',
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
				id: 'next-pages',
				title: 'Open the next page when the first quick win works',
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
						body: 'Open the R2 page for delivery boundaries, testing patterns, and storage choices.',
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
			'Once the first preview works, move on to production and workflow docs.'
		],
		facts: [
			{ label: 'Best for', value: 'The first named preview deploy and cleanup loop' },
			{ label: 'Preview command', value: '`bunx --bun devflare deploy --preview <name>`' },
			{
				label: 'Cleanup command',
				value: '`bunx --bun devflare previews cleanup --scope <name> --apply`'
			}
		],
		sourcePages: ['packages/devflare/src/cli/commands/deploy.ts', 'README.md'],
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
						title: 'Preview-ready worker files before you deploy',
						description:
							'Keep the preview example anchored in the same application files a teammate would review, not only the deploy command.',
						activeFile: 'src/fetch.ts',
						structure: [
							{ path: 'devflare.config.ts' },
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'preview-command.sh', muted: true }
						],
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								code: String.raw`import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	name: 'orders-api',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			ORDERS_CACHE: pv('orders-cache')
		}
	}
})`
							},
							{
								path: 'src/fetch.ts',
								language: 'ts',
								code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function fetch(event: FetchEvent): Promise<Response> {
	const url = new URL(event.request.url)
	const orderId = url.pathname.split('/').at(-1) ?? 'latest'
	const cacheKey = 'order:' + orderId
	const cached = await event.env.ORDERS_CACHE.get(cacheKey)

	if (cached) {
		return Response.json(JSON.parse(cached))
	}

	const order = { id: orderId, status: 'ready-for-preview' }
	await event.env.ORDERS_CACHE.put(cacheKey, JSON.stringify(order), { expirationTtl: 300 })

	return Response.json(order)
}`
							}
						]
					},
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
					'Once the first preview loop works, jump to production deploy rules and GitHub automation.',
				paragraphs: [
					'When this local preview loop is ready to leave your shell history and become reviewable automation, continue with `github-workflows`. That page maps the exact `.github/workflows/*.yml` files this repo uses for PR comments, branch previews, production deploys, and cleanup.'
				],
				cards: [
					{
						label: 'Ship & operate',
						title: 'Production deploys',
						body: 'Read the production guide for explicit targets, preflight checks, and deploy inspection habits.',
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
	}
]
