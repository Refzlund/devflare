import type { DocPage } from '../../types'
import {
	docsLink,
	environmentOverlayCode,
	fullConfigExampleCode,
	generatedTypesOutputCode,
	previewBindingsConfigCode,
	previewBindingsLifecycleCode,
	projectShapeConfigCode,
	runtimeDeploySettingsCode,
	workerSurfacesConfigCode
} from './shared'

export const configurationDocsPart2: DocPage[] = [
	{
		slug: 'config-previews',
		group: 'Devflare',
		navTitle: 'Previews',
		readTime: '6 min read',
		eyebrow: 'Configuration',
		title: 'Author preview-scoped bindings so preview deploys can own disposable infrastructure',
		summary:
			'Use `preview.scope()` for bindings that should belong to one preview scope. Devflare materializes names like `notes-db-next`, provisions or reuses the preview-only resources it can manage, and lets you clean them up by the same scope later without touching production resources.',
		description:
			'Preview config in Devflare is not only “set `env.preview` and hope for the best.” The extra step is marking the bindings that should belong to a preview deployment. Devflare then materializes those names with a preview identifier, keeps production names separate, and on preview deploys can create or reuse the matching account resources for the binding types it manages locally.',
		highlights: [
			'`preview.scope()` marks authored names once; non-preview work resolves back to the base name, while preview deploys materialize a scope such as `preview` or `next` into the binding target.',
			'Plain `--preview` uses the synthetic `preview` identifier, while named `--preview next` or `--scope next` resolves the same config to `*-next` resources.',
			'Preview-scoped resources stay associated with one preview deployment, so the same scope can be inspected and later deleted with `devflare previews cleanup --scope <name> --apply`.',
			'KV, D1, R2, queues, and Vectorize are the main lifecycle-managed preview resource families; other bindings have more specific caveats.',
			'Production databases, buckets, and queues stay out of the blast radius because preview deploys resolve different resource names instead of reusing production names by accident.'
		],
		facts: [
			{ label: 'Authoring primitive', value: '`preview.scope()` from `devflare/config`' },
			{
				label: 'Typical result',
				value: '`notes-cache-kv` → `notes-cache-kv-next` for a `next` preview scope'
			},
			{
				label: 'Main lifecycle command',
				value: '`bunx --bun devflare previews cleanup --scope <name> --apply`'
			},
			{
				label: 'Best for',
				value:
					'Previews that need their own disposable state instead of borrowing production infrastructure'
			}
		],
		sourcePages: [
			'README.md',
			'src/config/preview.ts',
			'src/config/preview-resources.ts',
			'src/cli/commands/build-artifacts.ts',
			'src/cli/help-pages/pages/previews.ts',
			'tests/unit/config/preview.test.ts',
			'apps/testing/devflare.config.ts'
		],
		sections: [
			{
				id: 'mark-preview-owned-bindings',
				title:
					'Mark preview-owned bindings in config instead of mutating production names at deploy time',
				paragraphs: [
					'The point of preview-scoped bindings is not to make names look fancy. It is to keep preview infrastructure isolated from production infrastructure while still authoring one readable config.',
					'`preview.scope()` returns an opaque marker around the base resource name. Devflare later materializes that marker into a real name for the active preview identifier, which means the authored config can stay stable while preview deploys resolve to preview-owned databases, buckets, queues, and other resources.'
				],
				snippets: [
					{
						title: 'Author preview-owned bindings once, then let the scope decide the real names',
						language: 'ts',
						code: previewBindingsConfigCode
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'This is safer than repointing previews at production state',
						body: [
							'When the preview owns a distinct database or queue name, it can be created quickly, reviewed in isolation, and deleted cleanly later. That is much safer than hoping reviewers never touch a production binding in a preview session.'
						]
					}
				]
			},
			{
				id: 'materialization-rules',
				title: 'The preview identifier is materialized into the binding target name',
				paragraphs: [
					'In normal local work and non-preview environments, a preview-scoped marker resolves back to the base name. In preview resolution, Devflare inserts the chosen preview identifier using the configured separator, which defaults to `-`.',
					'The identifier order is deliberate: an explicit identifier wins first, then `DEVFLARE_PREVIEW_IDENTIFIER`, then PR or branch-derived env values, and only then the synthetic `preview` fallback for generic preview environments.'
				],
				table: {
					headers: [
						'Authored binding target',
						'When it resolves',
						'Resolved name',
						'What that means'
					],
					rows: [
						[
							"`pv('notes-cache-kv')`",
							'Local work or non-preview resolution',
							'`notes-cache-kv`',
							'The base config stays readable and does not invent preview names unless a preview identifier is actually in play.'
						],
						[
							"`pv('notes-cache-kv')`",
							'Plain `--preview` or generic preview environment',
							'`notes-cache-kv-preview`',
							'The synthetic `preview` identifier keeps same-worker preview uploads separate from the base resource name.'
						],
						[
							"`pv('notes-cache-kv')`",
							'Named preview like `--preview next` or `--scope next`',
							'`notes-cache-kv-next`',
							'A named preview scope gets its own clearly-associated resource names and cleanup target.'
						],
						[
							"`pv('notes-cache-kv')`",
							'`DEVFLARE_PREVIEW_BRANCH=Feature/TeSt-Branch`',
							'`notes-cache-kv-feature-test-branch`',
							'Branch-derived identifiers are sanitized into safe resource-name fragments.'
						],
						[
							"`preview.scope({ separator: '--' })`",
							'Custom separator plus preview identifier',
							'`notes-cache-kv--next`',
							'You can change the separator when the resource naming convention needs it.'
						]
					]
				},
				bullets: [
					'The binding name in `env` stays the same; it is the backing resource target that changes by preview scope.',
					'Production overrides can still point at explicit production resources when production naming should be fully separate from preview naming.',
					'This page is about resource naming and binding targets; preview worker topology is a neighboring decision covered by the preview strategy docs.'
				]
			},
			{
				id: 'managed-resource-families',
				title: 'Some preview-scoped bindings are lifecycle-managed resources, and some are not',
				table: {
					headers: ['Binding lane', 'Preview naming story', 'Lifecycle behavior'],
					rows: [
						[
							'KV, D1, and R2',
							'Author the resource name with `preview.scope()`.',
							'Preview deploys can create or reuse the scoped resource, and cleanup can delete it later by the same scope.'
						],
						[
							'Queues and DLQs',
							'Producer, consumer, and dead-letter queue names can all be scoped.',
							'Preview deploys can provision the queue resources and cleanup can remove them together.'
						],
						[
							'Vectorize',
							'Index names can be preview-scoped too.',
							'Devflare can provision the preview index shape from the base index metadata and delete it during cleanup later.'
						],
						[
							'Hyperdrive',
							'Names can be materialized for preview scopes.',
							'Devflare does not auto-clone stored credentials, so it warns and can fall back to the base Hyperdrive binding when the preview config does not already exist.'
						],
						[
							'Analytics Engine and Browser Rendering',
							'Dataset or binding names can be materialized.',
							'Devflare reports warnings instead of provisioning or deleting account resources because those families do not follow the same managed lifecycle.'
						],
						[
							'Service bindings, Durable Objects, and routes on dedicated preview workers',
							'Isolation follows preview worker names and ownership more than account resource naming.',
							'Deleting dedicated preview worker scripts also removes preview-only service bindings, Durable Object bindings, and routes attached only to those workers.'
						]
					]
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Preview-scoped does not automatically mean Devflare can provision everything',
						body: [
							'Hyperdrive, Analytics Engine, and Browser Rendering each have their own lifecycle caveats. Devflare says that out loud instead of pretending every binding behaves like KV or D1.'
						]
					}
				]
			},
			{
				id: 'deploy-inspect-cleanup',
				title: 'The good preview loop is deploy, inspect, and clean up by the same scope',
				paragraphs: [
					'Preview-scoped bindings work best when the scope stays explicit from deploy through cleanup. The preview deploy resolves the config to preview-owned names, the binding inspection command shows exactly what that scope points at, and cleanup removes the same preview-only resources later.',
					'That is what keeps previews fast to create and safe to tear down. The preview owns its own binding targets, so deleting it does not mean touching production databases or buckets just because the app used the same binding names in code.'
				],
				steps: [
					'Author preview-owned bindings with `preview.scope()` in the main config.',
					'Deploy the preview with an explicit scope such as `--preview next` when the resource names should map to one known preview deployment.',
					'Inspect that scope with `devflare previews bindings --scope next` when you want the resolved targets and worker associations spelled out clearly.',
					'Clean up the same preview later with `devflare previews cleanup --scope next --apply`.'
				],
				snippets: [
					{
						title: 'One scope in, the same scope back out',
						language: 'bash',
						code: previewBindingsLifecycleCode
					}
				],
				cards: [
					{
						label: 'Configuration',
						title: 'Need the overlay story too?',
						body: 'Open the environments page when the question is which config lanes differ by preview or production beyond resource naming.',
						href: docsLink('config-environments')
					},
					{
						label: 'Ship & operate',
						title: 'Need the preview topology decision?',
						body: 'Open the preview strategy page when the real question is same-worker uploads versus branch-scoped worker families.',
						href: docsLink('preview-strategies')
					},
					{
						label: 'Ship & operate',
						title: 'Need lifecycle and cleanup commands?',
						body: 'Open preview operations when the question moves from authoring config to registry inspection or cleanup policy.',
						href: docsLink('preview-operations')
					}
				]
			}
		]
	},
	{
		slug: 'worker-surfaces',
		group: 'Devflare',
		navTitle: 'Worker surfaces',
		readTime: '6 min read',
		eyebrow: 'Configuration',
		title:
			'Treat fetch, queue, scheduled, and email handlers as separate Worker surfaces with their own files',
		summary:
			'Devflare can compose or wrap several Worker surfaces into one generated entrypoint, but the authored source of truth should stay in explicit files such as `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, and `src/email.ts`.',
		description:
			'A single Devflare package can own more than one Cloudflare event surface. Keep each surface in its own file when the package genuinely owns that event type, wire schedules through `triggers.crons`, and let the generated composed entrypoint stay generated instead of hand-maintained.',
		highlights: [
			'The conventional event-surface files are `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, and `src/email.ts`.',
			'Use `false` to disable event-surface autodiscovery explicitly when one of those conventions should stay off.',
			'`triggers.crons` describes scheduled intent, while `previews.includeCrons` decides whether branch-scoped preview deploys keep cron triggers active or omit them to avoid shared-schedule conflicts.',
			'Devflare can compose or wrap worker surfaces into `.devflare/worker-entrypoints/main.ts` when the runtime shape needs it, but that file remains generated output, not authored source.'
		],
		facts: [
			{ label: 'Best for', value: 'Packages that own both HTTP and background event surfaces' },
			{
				label: 'Default files',
				value: '`src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts`'
			},
			{
				label: 'Generated output',
				value:
					'`.devflare/worker-entrypoints/main.ts` when Devflare needs to wrap or compose the worker surfaces it discovered'
			},
			{ label: 'Test helpers', value: '`cf.worker`, `cf.queue`, `cf.scheduled`, and `cf.email`' }
		],
		sourcePages: [
			'src/worker-entry/surface-paths.ts',
			'src/worker-entry/composed-worker.ts',
			'src/dev-server/worker-surface-paths.ts',
			'src/dev-server/worker-source-watcher.ts',
			'src/cli/help-pages/pages/core.ts',
			'packages/devflare/src/test/simple-context.ts'
		],
		sections: [
			{
				id: 'surface-map',
				title: 'Keep each event surface in its own lane',
				paragraphs: [
					'Devflare does not flatten every Cloudflare event into one mystery handler. When one package owns HTTP, queue consumption, cron jobs, or inbound email, the cleanest shape is usually one file per surface so ownership stays obvious in code review.',
					'That separation is especially useful once the package has both request/response code and background work. The HTTP story stays in fetch or routes, while queue, scheduled, and email code can evolve without disappearing into one huge entry file.'
				],
				table: {
					headers: ['Surface', 'Conventional file', 'Use it when', 'Helper'],
					rows: [
						[
							'Fetch',
							'`src/fetch.ts` or `src/routes/**`',
							'HTTP requests belong to one main handler or route tree.',
							'`cf.worker.get()` / `cf.worker.fetch()`'
						],
						[
							'Queue consumer',
							'`src/queue.ts`',
							'The package owns deferred, batched, or retryable queue work.',
							'`cf.queue.trigger()`'
						],
						[
							'Scheduled handler',
							'`src/scheduled.ts` plus `triggers.crons`',
							'Time-based jobs should run from config-owned schedules.',
							'`cf.scheduled.trigger()`'
						],
						[
							'Email handler',
							'`src/email.ts`',
							'The Worker handles inbound email or local email-handler flows.',
							'`cf.email.send()`'
						]
					]
				}
			},
			{
				id: 'scheduled-intent',
				title: 'Put scheduled intent in config instead of scripts or comments',
				paragraphs: [
					'A scheduled handler is only half the story. The code lives in `src/scheduled.ts`, but the timing contract belongs in `triggers.crons` so the package declares when the job should run instead of relying on external shell memory.',
					'Preview behavior belongs in config too. `previews.includeCrons` defaults to `false`, so branch-scoped preview deploys drop cron triggers unless you opt them back in deliberately.'
				],
				snippets: [
					{
						title: 'A package that owns several Worker surfaces explicitly',
						language: 'ts',
						code: workerSurfacesConfigCode
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Preview environments should not inherit cron behavior by accident',
						body: [
							'If previews should run scheduled jobs, say so explicitly. Otherwise keep preview validation focused on the surfaces reviewers actually expect to exercise.'
						]
					}
				]
			},
			{
				id: 'disable-and-compose',
				title: 'Disable unused conventions explicitly and let Devflare compose the rest',
				paragraphs: [
					'Generated composition is not only a build detail. The local dev server also uses the same surface model to decide what to watch, so the directories around configured or conventional fetch, queue, scheduled, email, route, and transport files all become reload roots.',
					'That split is intentional: config-file edits take the config reload path, while worker-source changes under those watched roots take the worker reload path. You do not need a second watch system just because the package grew another surface.'
				],
				bullets: [
					'Set `files.queue: false`, `files.scheduled: false`, or `files.email: false` when one of the default conventions should stay off.',
					'Set `files.routes: false` when the package should stay fetch-only instead of discovering a route tree.',
					'When a fetch entry, route tree, or background surface set needs wrapper glue, Devflare can generate a composed entrypoint under `.devflare/worker-entrypoints/main.ts` to fan them into the Worker runtime correctly.',
					'If `wrangler.passthrough.main` is set, or the fetch worker already lives at `assets.directory/_worker.js`, Devflare skips that generated main entry and uses the explicit worker instead.',
					'Generated entrypoints are supposed to churn as the surface set changes. Keep the authored files and config authoritative, and let the glue stay disposable.',
					'Treat that generated entrypoint as output. The authored source of truth remains the explicit files and config that selected them.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Dev reload follows the same surface roots',
						body: [
							'Worker-source changes under the watched fetch, queue, scheduled, email, route, or transport roots trigger the worker reload path, while edits to the resolved `devflare.config.*` trigger the config reload path instead.'
						]
					},
					{
						tone: 'info',
						title: 'Tail is still a special case',
						body: [
							'Devflare can exercise tail behavior in the test harness when `src/tail.ts` exists, but there is not yet a public `files.tail` config key. Keep the main project-shape story centered on the documented event surfaces, and open the `createTestContext()` page when the question is tail testing.'
						]
					}
				]
			},
			{
				id: 'adjacent-discovery',
				title: 'Some nearby `files.*` keys are discovery globs, not event handlers',
				paragraphs: [
					'Not every `files.*` key means “Cloudflare will call this file as an event surface.” Some keys tell Devflare where to discover related program structure such as Durable Object classes, named entrypoints, workflow definitions, or transport hooks.',
					'That distinction matters because it keeps code review honest. Event surfaces answer “what can invoke this package?”, while discovery globs answer “what else should Devflare scan and bundle for the runtime contract?”'
				],
				table: {
					headers: ['Config key', 'What it points at', 'Why it is different'],
					rows: [
						[
							'`files.durableObjects`',
							'Durable Object class files or globs',
							'These classes are discovered and wrapped; they are not a standalone top-level event surface like fetch or queue.'
						],
						[
							'`files.entrypoints`',
							'Named entrypoint files or globs',
							'These support typed cross-worker references and discovery, not a separate Cloudflare event hook.'
						],
						[
							'`files.workflows`',
							'Workflow definition files or globs',
							'These are additional discovered modules, not a direct replacement for fetch, queue, scheduled, or email handlers.'
						],
						[
							'`files.transport`',
							'One custom transport file',
							'This is a serialization hook for bridge-backed calls, not an event handler that Cloudflare dispatches directly.'
						]
					]
				},
				cards: [
					{
						label: 'Runtime',
						title: 'Need transport behavior?',
						body: 'Open the transport page when a discovered transport file becomes part of the package contract.',
						href: docsLink('transport-file')
					},
					{
						label: 'Configuration',
						title: 'Need the generated type contract?',
						body: 'Open the generated types page when `files.entrypoints`, `ref()`, or discovered Durable Objects need to show up correctly in `env.d.ts`.',
						href: docsLink('generated-types')
					},
					{
						label: 'Configuration',
						title: 'Need the broader config map?',
						body: 'The runtime and deploy settings page covers the non-surface knobs such as account context, compatibility posture, routes, assets, limits, and migrations.',
						href: docsLink('runtime-deploy-settings')
					}
				]
			}
		]
	},
	{
		slug: 'generated-types',
		group: 'Devflare',
		navTitle: 'Generated types',
		readTime: '6 min read',
		eyebrow: 'Configuration',
		title:
			'Use `devflare types` to keep `env.d.ts` and `Entrypoints` aligned with the project you actually authored',
		summary:
			'`devflare types` turns config, discovered Durable Objects, named entrypoints, and cross-worker references into one generated TypeScript contract instead of a pile of hand-maintained env guesswork.',
		description:
			'The generated file is more than editor garnish. It is the typed mirror of your Devflare config and discovery rules: bindings land on global `DevflareEnv`, named entrypoints become an exported `Entrypoints` union, and referenced workers can produce typed service interfaces when Devflare can follow them accurately.',
		highlights: [
			'`devflare types` writes `env.d.ts` relative to the current working directory by default, or another path when you pass `--output`.',
			'Bindings, vars, secrets, Durable Objects, service bindings, and named entrypoints all feed the generated contract.',
			'`Entrypoints` exists so `defineConfig<Entrypoints>()` and later `ref().worker(...)` calls can stay type-safe.',
			'When Devflare cannot derive a concrete service interface, it falls back to `Fetcher` instead of pretending it knows more than it does.'
		],
		facts: [
			{
				label: 'Best for',
				value:
					'Packages that use bindings, Durable Objects, service bindings, or named worker entrypoints'
			},
			{ label: 'Main command', value: '`bunx --bun devflare types`' },
			{
				label: 'Default output',
				value:
					'`env.d.ts` relative to the directory you run the command from unless you override it'
			},
			{
				label: 'Best pairing',
				value: "`defineConfig<import('./env').Entrypoints>()` on the referenced worker config"
			}
		],
		sourcePages: [
			'README.md',
			'src/cli/help-pages/pages/core.ts',
			'src/cli/commands/types.ts',
			'src/cli/commands/type-generation/generator.ts',
			'src/config/define.ts',
			'src/config/ref.ts',
			'src/utils/entrypoint-discovery.ts',
			'cases/case5/devflare.config.ts',
			'cases/case5/math-service/devflare.config.ts'
		],
		sections: [
			{
				id: 'generated-contract',
				title: 'Treat the generated file as the typed contract, not as handwritten glue',
				paragraphs: [
					'`devflare types` reads the resolved config, discovers supporting source files, and writes one generated file that says what the package runtime actually exposes. This is more reliable than hand-maintained `env` declarations because the source of truth stays in config and file discovery, not in a second hand-maintained type file.',
					'The result is usually a global `DevflareEnv` interface plus an exported `Entrypoints` union. That combination is what keeps bindings, cross-worker service calls, and named entrypoints typed without making you manually mirror every config change.'
				],
				snippets: [
					{
						title: 'A generated file should read like output, not a second config file',
						filename: 'env.d.ts',
						language: 'ts',
						code: generatedTypesOutputCode
					},
					{
						title: 'The command loop stays intentionally small',
						language: 'bash',
						code: String.raw`bunx --bun devflare types
bunx --bun devflare types --output env.generated.d.ts`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Generated means generated',
						body: [
							'Do not hand-edit `env.d.ts` and expect the next run to preserve it. Change config or source files, then rerun `devflare types`.'
						]
					}
				]
			},
			{
				id: 'what-devflare-discovers',
				title: 'Know what the command is actually discovering',
				table: {
					headers: ['Input Devflare reads', 'Where it comes from', 'Typed result'],
					rows: [
						[
							'`bindings`, `vars`, and `secrets`',
							'The resolved top-level `devflare.config.*` from the current working directory or explicit `--config` path.',
							'Members on global `DevflareEnv`.'
						],
						[
							'Local Durable Object classes',
							'`files.durableObjects` or the default `**/do.*.{ts,js}` discovery pattern.',
							'`DurableObjectNamespace<...>` when the class can be located accurately.'
						],
						[
							'Named worker entrypoints',
							'`files.entrypoints` or the default `**/ep.*.{ts,js}` discovery pattern plus exported classes extending `WorkerEntrypoint`.',
							'An exported `Entrypoints` union for `defineConfig<Entrypoints>()`.'
						],
						[
							'`ref()` references',
							'Imported Devflare configs in other packages or subfolders.',
							'Typed service bindings and cross-worker Durable Object namespaces when Devflare can resolve them.'
						],
						[
							'Unknown or unresolvable service surface',
							'A target worker or entrypoint that cannot be turned into a stable interface.',
							'`Fetcher` fallback instead of fake precision.'
						]
					]
				},
				bullets: [
					'If no named entrypoints are discovered yet, `Entrypoints` stays `string` — the fallback is intentional.',
					'`devflare types` does not take an `--env` flag today, so the generated contract reflects the resolved base config rather than a named environment overlay.',
					'If you choose a nested `--output` path, create the parent directory first; the command writes the file but does not scaffold missing folders for you.',
					'Discovery follows the configured file patterns first, then falls back to the default Durable Object and entrypoint globs.',
					'The generated types are only as good as the authored config and file naming conventions they can see.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Typed fallback is still honest typing',
						body: [
							'Getting `Fetcher` for a service binding is not a failure of the generator so much as Devflare refusing to invent a stronger interface than it can justify from the available source.'
						]
					}
				]
			},
			{
				id: 'typed-entrypoints',
				title: 'Type the worker that owns the entrypoints, then let `ref()` carry that knowledge',
				paragraphs: [
					"The `Entrypoints` union matters most on the worker being referenced. Import that generated type into the worker's own config and pass it to `defineConfig<Entrypoints>()`, then callers that use `ref(() => import(...))` can ask for named entrypoints without turning those names into loose string conventions.",
					"That keeps the typing relationship honest: the worker that owns `ep.*.ts` files declares which entrypoints exist, and the worker that consumes them gets autocomplete and checking through `ref().worker('...')` later."
				],
				snippets: [
					{
						title: 'One worker declares the entrypoints, another consumes them through `ref()`',
						activeFile: 'devflare.config.ts',
						structure: [
							{ path: 'math-service', kind: 'folder' },
							{ path: 'math-service/ep.admin.ts' },
							{ path: 'math-service/devflare.config.ts' },
							{ path: 'devflare.config.ts' }
						],
						files: [
							{
								path: 'math-service/ep.admin.ts',
								language: 'ts',
								code: String.raw`import { WorkerEntrypoint } from 'cloudflare:workers'

export class AdminEntrypoint extends WorkerEntrypoint {
	async resetStats(): Promise<{ success: boolean }> {
		return { success: true }
	}
}`
							},
							{
								path: 'math-service/devflare.config.ts',
								language: 'ts',
								code: String.raw`import { defineConfig } from 'devflare/config'
import type { Entrypoints } from './env'

export default defineConfig<Entrypoints>({
	name: 'math-worker',
	files: {
		fetch: 'worker.ts'
	}
})`
							},
							{
								path: 'devflare.config.ts',
								language: 'ts',
								code: String.raw`import { defineConfig, ref } from 'devflare/config'

const mathWorker = ref(() => import('./math-service/devflare.config'))

export default defineConfig({
	name: 'case5-gateway',
	bindings: {
		services: {
			MATH_SERVICE: mathWorker.worker,
			ADMIN: mathWorker.worker('AdminEntrypoint')
		}
	}
})`
							}
						]
					}
				],
				bullets: [
					'Put `defineConfig<Entrypoints>()` on the referenced worker config, not on every caller in the repo by reflex.',
					'Keep the named entrypoint files boring and explicit: `ep.*.ts` plus classes extending `WorkerEntrypoint`.',
					'Rerun `devflare types` in the worker that owns those entrypoints whenever you rename a class or add another one.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Types are not a substitute for critical deploy validation',
						body: [
							'Named service entrypoints are modeled at the Devflare layer, but if a particular service path is operationally critical, still inspect the compiled output with `devflare build` or `devflare config print --format wrangler` before trusting muscle memory.'
						]
					}
				]
			},
			{
				id: 'habits',
				title: 'Keep the generated contract boring and rerunnable',
				steps: [
					'Run `devflare types` after adding or renaming bindings, Durable Objects, service references, or named entrypoints.',
					'Keep the default cwd-relative `env.d.ts` location unless a custom `--output` path truly buys something more than folder aesthetics.',
					'Import `Entrypoints` from the generated file only where the owning worker config needs it.',
					'Inspect compiled output when a cross-worker or entrypoint boundary matters operationally, not just ergonomically in the editor.'
				],
				cards: [
					{
						label: 'Bindings',
						title: 'Need the multi-worker architecture story?',
						body: 'Open the multi-worker page when the question is whether another worker boundary is warranted before you worry about typing that boundary.',
						href: docsLink('multi-workers')
					},
					{
						label: 'Configuration',
						title: 'Need the surface-discovery map?',
						body: 'The worker-surfaces page explains which authored files and discovery globs become part of the worker contract in the first place.',
						href: docsLink('worker-surfaces')
					},
					{
						label: 'CLI',
						title: 'Need the broader command map?',
						body: 'The CLI page keeps `types`, `build`, `deploy`, `doctor`, and config-inspection commands in one everyday workflow map.',
						href: docsLink('devflare-cli')
					}
				]
			}
		]
	}
]
