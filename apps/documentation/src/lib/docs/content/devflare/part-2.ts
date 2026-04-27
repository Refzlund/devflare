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

export const devflareDocsPart2: DocPage[] = [
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
			{
				label: 'Best for',
				value:
					'Everyday dev, config inspection, explicit deploys, and the Cloudflare control-plane work around those deploys'
			},
			{ label: 'Fastest orientation', value: '`bunx --bun devflare --help`' },
			{ label: 'Help depth', value: '`devflare help <command> [subcommand]`' },
			{
				label: 'Safest habit',
				value: 'Run commands from the package that owns the `devflare.config.*` you mean to resolve'
			}
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
bunx --bun devflare previews cleanup --help
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
						[
							'`dev`',
							'Start local development.',
							'Worker-only defaults, Vite auto-detection, logging, and persistence.'
						],
						[
							'`build`',
							'Compile deploy-ready artifacts.',
							'Environment resolution and Wrangler-facing output.'
						],
						[
							'`deploy`',
							'Ship explicitly to production or preview.',
							'Target selection, dry runs, preview naming, messages, and tags.'
						],
						[
							'`types`',
							'Generate `env.d.ts` and typed bindings.',
							'Custom output paths plus entrypoint and Durable Object discovery.'
						],
						[
							'`doctor`',
							'Check local project health.',
							'Config, package, TypeScript, Vite, and generated artifact diagnostics.'
						],
						[
							'`config`',
							'Print resolved config.',
							'`print`, raw Devflare JSON, or compiled Wrangler JSON.'
						],
						[
							'`account`',
							'Inspect Cloudflare account inventories and limits.',
							'Resource lists, usage limits, and interactive global/workspace selection.'
						],
						[
							'`login`',
							'Authenticate with Cloudflare via Wrangler.',
							'`--force` behavior and reuse of existing sessions.'
						],
						[
							'`previews`',
							'Operate on preview lifecycle state.',
							'`list`, `bindings`, and `cleanup`.'
						],
						[
							'`productions`',
							'Inspect and mutate live production state.',
							'`versions`, `rollback`, and `delete`.'
						],
						[
							'`worker`',
							'Run Worker control-plane operations.',
							'Currently `rename`, plus config-sync expectations.'
						],
						[
							'`tokens`',
							'Manage Devflare-managed account-owned API tokens.',
							'List, create, roll, and delete managed tokens.'
						],
						[
							'`ai`',
							'Print the bundled Workers AI pricing snapshot.',
							'Read-only pricing surface; verify current rates in Cloudflare docs when it matters.'
						],
						[
							'`remote`',
							'Toggle remote test mode for paid features.',
							'`status`, `enable`, and `disable`.'
						],
						[
							'`help`',
							'Render root or command-specific help.',
							'Nested help resolution for command families and subcommands.'
						],
						[
							'`version`',
							'Print the installed version.',
							'Same information as the global `--version` flag.'
						]
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
						[
							'`--config <path>`',
							'Pick the exact `devflare.config.*` file to resolve.',
							'`build`, `deploy`, `types`, `doctor`, `config`, `previews`, `productions`, and `worker rename`.'
						],
						[
							'`--env <name>`',
							'Resolve `config.env[name]` before the command runs.',
							'`build`, `config`, preview-aware inspection, and production discovery flows.'
						],
						[
							'`--debug`',
							'Print stack traces and extra debug output.',
							'Build, deploy, type generation, and other failure-heavy paths.'
						],
						[
							'`--no-color`',
							'Disable ANSI color output.',
							'CI logs, copied transcripts, or plain-text debugging.'
						],
						[
							'`-h, --help`',
							'Show the detailed help page for the current command path.',
							'Every root command and nested subcommand surface.'
						],
						[
							'`-v, --version`',
							'Print the installed version and exit.',
							'Root invocation when you need to verify the installed package quickly.'
						]
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
						body: 'Open this page when the question is preview registry inspection or resource cleanup.'
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
							'`previews cleanup`, `productions rollback`, and `productions delete` all carry behavior and safety notes that are too specific for the root CLI map. Read their help and the dedicated docs page before treating them as copy-paste habits.'
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
						title: 'Map the everyday CLI loop into package scripts',
						description:
							'Keep scripts thin and explicit so local developers and CI both call the same Devflare command surface.',
						filename: 'package.json',
						language: 'json',
						code: String.raw`{
	"scripts": {
		"dev": "devflare dev",
		"types": "devflare types",
		"build": "devflare build --env staging",
		"deploy:preview": "devflare deploy --preview next",
		"deploy:prod": "devflare deploy --prod",
		"doctor": "devflare doctor"
	}
}`
					},
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
						body: 'Best when the question is no longer “can I deploy?” but “what exists right now, and what should I clean up, roll back, or inspect?”'
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Keep commands package-local',
						body: [
							'Run Devflare from the package that owns the config you actually mean to resolve. In monorepos, Turbo can decide what changed, but package-local `devflare` commands still decide what gets built, deployed, inspected, or cleaned up.'
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
		title:
			'Compose request-wide middleware with `sequence(...)` instead of burying flow control inside one big fetch file',
		summary:
			'Use `sequence(...)` from `devflare/runtime` when broad HTTP concerns must wrap route resolution or another fetch handler in a clear top-to-bottom order.',
		description:
			'`sequence(...)` composes `(event, resolve)` middleware for workers so broad concerns stay readable without burying them in one monolithic fetch file.',
		highlights: [
			'Import `sequence` from `devflare/runtime` for worker fetch middleware.',
			'Keep global concerns like CORS, auth, request ids, and response shaping in the sequence chain, not in route leaves.',
			'`resolve(event)` continues into the next middleware or the matched route handler, and it can receive a replacement `FetchEvent` when middleware intentionally forwards a modified request.',
			'Export exactly one primary fetch entry per module: `fetch` or `handle`, not both.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Request-wide concerns that should wrap routes or another fetch handler cleanly'
			},
			{ label: 'Primary signature', value: '`(event, resolve) => Response`' },
			{ label: 'Good pairing', value: '`src/fetch.ts` plus `src/routes/**` leaf handlers' }
		],
		sourcePages: [
			'packages/devflare/README.md',
			'packages/devflare/src/dev-server/server.ts',
			'README.md',
			'src/runtime/middleware.ts'
		],
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
				id: 'method-handlers',
				title: 'Route files can export per-method handlers',
				paragraphs: [
					'Route modules can export named functions for specific HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `ALL`. The runtime resolves the matching export based on the request method.',
					'`HEAD` requests fall back to `GET` when no `HEAD` export exists, and the response body is stripped automatically. `ALL` is the catch-all when no method-specific export matches.'
				],
				table: {
					headers: ['Export', 'Matches', 'Fallback behavior'],
					rows: [
						['`GET`', '`GET` requests', '—'],
						['`POST`', '`POST` requests', '—'],
						['`PUT`', '`PUT` requests', '—'],
						['`PATCH`', '`PATCH` requests', '—'],
						['`DELETE`', '`DELETE` requests', '—'],
						['`HEAD`', '`HEAD` requests', 'Falls back to `GET` with body stripped'],
						['`ALL`', 'Any method not matched by a specific export', '—']
					]
				},
				bullets: [
					'A handler with two parameters receives `(event, params)` as a convenience shorthand.',
					'A handler with an `(event, resolve)` signature is called in resolve-style, consistent with `sequence(...)` middleware.',
					'Method handlers resolve after the `sequence(...)` middleware chain.',
					'`default` exports are also supported: `export default { GET, POST }` or `export default function handle(event) { ... }`.'
				]
			},
			{
				id: 'resolve-contract',
				title: 'Understand what `resolve(event)` actually means',
				paragraphs: [
					'Calling `resolve(event)` continues into the next middleware in the chain, or into the matched route/module-level handler once no more middleware remains. That makes the order of the chain explicit instead of hidden inside nested helper calls.',
					'`resolve(event)` may also receive a replacement `FetchEvent`. That is the supported way for middleware to forward a modified request, preserved params, or updated locals into the next stage deliberately.'
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
	}
]
