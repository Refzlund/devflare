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

export const configurationDocsPart1: DocPage[] = [
	{
		slug: 'full-config',
		group: 'Devflare',
		navTitle: 'Full config',
		readTime: '6 min read',
		eyebrow: 'Configuration',
		title:
			'Scan one full `devflare.config.ts` example with the main current config lanes in one place',
		summary:
			'See one canonical `devflare.config.ts` that touches the main current config lanes in a single file, with hover coverage on every property shown in the example.',
		description:
			'This page is the quick “show me the whole shape” version of Devflare config. It is intentionally full enough to scan the current top-level lanes in one file without turning into a maximal dump of every possible nested variant.',
		highlights: [
			'Use this page when you want the canonical config shape in one glance before opening the deeper pages for one lane.',
			'Every property shown in the example is a real current config key and is covered by inline hover help on this page.',
			'The example keeps binding values readable, using common shorthand where that says the same thing more clearly than an id-heavy object form.',
			'Deeper pages still own the richer variants, caveats, and operational details for each lane.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Seeing the whole current config shape before you zoom into one subsection'
			},
			{
				label: 'Reading pattern',
				value:
					'Scan the example first, then hover properties, then open the specialist page you actually need'
			},
			{
				label: 'Important boundary',
				value: 'This example is canonical, but not every binding family variant is shown inline'
			}
		],
		sourcePages: [
			'src/config/schema.ts',
			'src/config/schema-runtime.ts',
			'src/config/schema-bindings.ts',
			'src/config/schema-build.ts',
			'src/config/schema-env.ts',
			'src/config/compiler.ts'
		],
		sections: [
			{
				id: 'canonical-example',
				title: 'Use one canonical example when you want the whole shape in view',
				paragraphs: [
					'When you already know Devflare is split into config, runtime, testing, and framework lanes, the next practical question is often just: what does a full current config actually look like?',
					'That is what this page is for. The example below touches the major current top-level config lanes in one place, while still staying readable enough for code review and copy-with-intent adaptation.'
				],
				snippets: [
					{
						title: 'One full config example you can scan top to bottom',
						description:
							'Hover any property in the config to see what that lane means. The example is intentionally broad, but the dedicated pages still own the deeper caveats and richer nested variants.',
						language: 'ts',
						code: fullConfigExampleCode
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Full does not mean maximal',
						body: [
							'Every property shown above is real and current, but some binding families accept richer object variants than this page needs to show. Use this page as the canonical shape, then open the dedicated binding or configuration page when you need a deeper variant.'
						]
					}
				]
			},
			{
				id: 'lane-map',
				title: 'Know what each top-level lane is doing',
				table: {
					headers: ['Lane', 'What it owns', 'Open next when you need more'],
					rows: [
						[
							'`name`, `accountId`, `compatibility*`',
							'Worker identity and runtime posture.',
							'`config-basics` and `runtime-deploy-settings`'
						],
						[
							'`previews`, `files`, `bindings`, `triggers`',
							'The authored Worker shape: surfaces, bindings, and scheduled intent.',
							'`project-shape`, `worker-surfaces`, and `config-previews`'
						],
						[
							'`vars`, `secrets`, `env`',
							'Runtime strings, secret declarations, and environment overlays.',
							'`config-environments`'
						],
						[
							'`routes`, `wsRoutes`, `assets`',
							'Deployment routing, dev WebSocket proxy rules, and static asset delivery.',
							'`runtime-deploy-settings`'
						],
						[
							'`limits`, `observability`, `migrations`',
							'Operational posture and release-time controls.',
							'`runtime-deploy-settings`'
						],
						[
							'`rolldown`, `vite`, `wrangler`',
							'Bundler coordination, host integration, and unsupported Wrangler passthrough.',
							'`config-basics`, `vite-standalone`, and `svelte-with-rolldown`'
						]
					]
				}
			},
			{
				id: 'go-deeper',
				title: 'Open the specialist page once the full picture is clear',
				cards: [
					{
						label: 'Configuration',
						title: 'Need the authoring rules?',
						body: 'Open config basics when the question is what should live in authored config versus generated output or deploy-time resolution.',
						href: docsLink('config-basics')
					},
					{
						label: 'Configuration',
						title: 'Need the project shape story?',
						body: 'Open project shape when the main question is how many Worker surfaces or discovery lanes the package should actually own.',
						href: docsLink('project-shape')
					},
					{
						label: 'Configuration',
						title: 'Need preview or environment overlays?',
						body: 'Use the environments and previews pages when the full config turns into a question about per-lane overrides or preview-scoped resources.',
						href: docsLink('config-environments')
					},
					{
						label: 'Configuration',
						title: 'Need runtime and deploy posture?',
						body: 'Open runtime and deploy settings when the question is routes, assets, WebSocket proxy rules, observability, limits, or migrations.',
						href: docsLink('runtime-deploy-settings')
					}
				]
			}
		]
	},
	{
		slug: 'project-shape',
		group: 'Devflare',
		navTitle: 'Project shape',
		readTime: '5 min read',
		eyebrow: 'Configuration',
		title:
			'Configure the project shape around explicit file surfaces before the package gets noisy',
		summary:
			'Start with one fetch file, then add routes, background handlers, Durable Objects, assets, and transport rules only when the project genuinely needs them.',
		description:
			'The config keys that shape a Devflare project are mostly about which files or globs Devflare should treat as real runtime surfaces. Keep that shape small at first, then expand it deliberately instead of letting autodiscovery and generated output become the accidental architecture.',
		highlights: [
			'Start with `files.fetch` when one Worker surface is enough.',
			'Add `files.routes` only when a route tree makes the package easier to read than one large fetch file.',
			'Queue, scheduled, email, Durable Object, workflow, and entrypoint files are all separate surfaces you can opt into explicitly.',
			'Use explicit disable values such as `files.routes: false` or `files.transport: null` when you want autodiscovery out of the way.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Teams deciding how many runtime surfaces one package actually needs'
			},
			{ label: 'Primary shape keys', value: '`files.*`, `assets`, `routes`, and `wsRoutes`' },
			{
				label: 'Safest habit',
				value: 'Add one surface only when the current project shape truly asks for it'
			}
		],
		sourcePages: [
			'packages/devflare/src/config/schema.ts',
			'README.md',
			'schema-runtime.ts',
			'config-autodiscovery.test.ts'
		],
		sections: [
			{
				id: 'start-small',
				title: 'Start with the smallest honest project shape',
				paragraphs: [
					'Devflare does not ask you to configure every possible Worker surface up front. The clean starting point is one fetch entry, then a route tree, a queue consumer, Durable Objects, or other surfaces only when the package actually needs them.',
					'That keeps the authored config readable in code review and stops the project structure from silently inheriting complexity just because a default glob or generated file happened to exist.'
				],
				steps: [
					'Start with `files.fetch` for the main HTTP Worker surface.',
					'Add `files.routes` when multiple URLs deserve their own modules.',
					'Add background surfaces such as `queue`, `scheduled`, or `email` only when the package truly owns those events.',
					'Add `durableObjects`, `entrypoints`, `workflows`, or `transport` only when the runtime contract calls for them.',
					'Keep static assets, deployment routes, and WebSocket proxy rules in their own config lanes instead of smuggling them into file conventions.'
				],
				callouts: [
					{
						tone: 'success',
						title: 'Project shape is part of architecture',
						body: [
							'If the config says one package owns five runtime surfaces, reviewers should be able to see why. Devflare works best when that shape is explicit instead of accidental.'
						]
					}
				]
			},
			{
				id: 'surface-map',
				title: 'Know which keys actually shape the project',
				table: {
					headers: ['Config lane', 'Use it when', 'Project effect'],
					rows: [
						[
							'`files.fetch`',
							'One main Worker surface should own request-wide behavior.',
							'Points Devflare at the fetch entry you author directly.'
						],
						[
							'`files.routes`',
							'The project needs route modules or a mounted route prefix.',
							'Lets a route tree sit beside or replace the main fetch file.'
						],
						[
							'`files.queue`, `files.scheduled`, `files.email`',
							'The package consumes background or platform-triggered events.',
							'Adds separate handler files for those runtime surfaces.'
						],
						[
							'`files.durableObjects`, `files.entrypoints`, `files.workflows`',
							'The project needs stateful classes, named entrypoints, or workflow definitions.',
							'Turns globs into additional Worker-owned code surfaces Devflare can discover and bundle.'
						],
						[
							'`files.transport`',
							'Custom value transport is needed for richer Worker or Durable Object contracts.',
							'Lets you point at one explicit transport file, or disable autodiscovery with `null`.'
						],
						[
							'`assets`, `routes`, `wsRoutes`',
							'Static files, deployment routing, or dev WebSocket proxy behavior need their own config.',
							'Keeps non-handler project concerns out of the file-surface lane.'
						]
					]
				},
				snippets: [
					{
						title: 'One config can stay readable even when the package grows a few real surfaces',
						language: 'ts',
						code: projectShapeConfigCode
					}
				]
			},
			{
				id: 'autodiscovery-rules',
				title: 'Use autodiscovery deliberately, and disable it explicitly when you mean it',
				bullets: [
					'Omit `files.routes` when the default `src/routes` location is already the right fit.',
					'Use an explicit `files.routes` object when the route root or prefix should be obvious in config review.',
					'Set `files.routes: false` when the package should not use file-route discovery at all.',
					'Set `files.transport: null` when you want transport autodiscovery disabled instead of guessed.',
					'Use explicit file or glob paths when the project layout is non-standard enough that the default convention would hide intent.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Conventions are only helpful when they still describe the project accurately',
						body: [
							'As soon as a default convention stops being obvious, move back to explicit config. That is usually the more maintainable choice.'
						]
					}
				]
			},
			{
				id: 'next-reads',
				title: 'Open the deeper page for the shape you just introduced',
				cards: [
					{
						label: 'Architecture',
						title: 'Need the broader package setup map?',
						body: 'Open project architecture when the question is the full package layout — authored config, runtime files, generated output, hosted app files, or monorepo boundaries.',
						href: docsLink('project-architecture')
					},
					{
						label: 'Routing',
						title: 'Need route modules?',
						body: 'Open the HTTP routing page when `files.routes` becomes part of the project shape.',
						href: docsLink('http-routing')
					},
					{
						label: 'Runtime',
						title: 'Need transport?',
						body: 'Read the transport page when a custom transport file becomes part of the contract between worker code and stateful surfaces.',
						href: docsLink('transport-file')
					},
					{
						label: 'Configuration',
						title: 'Need generated env types?',
						body: 'Open the generated types page when bindings, Durable Objects, or named entrypoints become part of the package contract.',
						href: docsLink('generated-types')
					},
					{
						label: 'Frameworks',
						title: 'Need a host shell?',
						body: 'Open the framework pages only when the package truly becomes a Vite or SvelteKit app instead of a worker-first package.',
						href: docsLink('vite-standalone')
					}
				]
			}
		]
	},
	{
		slug: 'config-environments',
		group: 'Devflare',
		navTitle: 'Environments',
		readTime: '5 min read',
		eyebrow: 'Configuration',
		title:
			'Use `config.env` overlays to change only what differs between local, preview, and production',
		summary:
			'Keep one base config, layer environment-specific overrides with `config.env`, and let Devflare resolve preview or production details only in the commands that actually need them.',
		description:
			'Devflare environments are an overlay system, not a second copy of the whole config file. The base config should hold the stable project story, and `config.env` should only override the parts that genuinely differ by environment.',
		highlights: [
			'`config.env` is merged onto the base config instead of replacing it wholesale.',
			'Environment overlays can change bindings, vars, files, limits, observability, build settings, and Wrangler passthrough without duplicating the whole config.',
			'Explicit preview and production deploy targets already pin their environment, so `--env` is most useful on config-inspection and build-style commands.',
			'When previews need their own disposable infrastructure, pair `config.env.preview` with `preview.scope()` instead of pointing preview traffic at production resource names.',
			'Keep `.env`, `vars`, and `secrets` in separate roles so config-time inputs and runtime bindings do not blur together.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Projects that need different bindings or runtime behavior in preview and production'
			},
			{
				label: 'Merge model',
				value:
					'Base config first, then `config.env[name]`, then preview materialization when relevant'
			},
			{ label: 'Main habit', value: 'Repeat only the keys that actually differ by environment' }
		],
		sourcePages: [
			'packages/devflare/src/config/schema.ts',
			'schema-env.ts',
			'resolve.ts'
		],
		sections: [
			{
				id: 'merge-model',
				title: 'Keep one base config and let the overlay change only the deltas',
				paragraphs: [
					'The main config should describe the stable project: the worker name, the usual file surfaces, and the bindings or defaults that exist regardless of environment. `config.env` is where you change only the parts that diverge for preview, production, or another named lane.',
					'The overlay model feels more predictable than copying whole config files around. The shared story stays in one place, while the environment-specific differences stay small enough to review accurately.'
				],
				snippets: [
					{
						title: 'Use `config.env` for targeted overrides instead of a second full config',
						language: 'ts',
						code: environmentOverlayCode
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'A smaller overlay is usually a better overlay',
						body: [
							'If an environment block starts to repeat most of the base config, that is usually a sign the base config should be refactored instead of duplicated.'
						]
					}
				]
			},
			{
				id: 'what-can-change',
				title: 'Know what environment overlays are actually allowed to change',
				table: {
					headers: ['Override lane', 'Typical reason to change it'],
					rows: [
						[
							'`name`, compatibility settings',
							'The environment truly needs a different runtime identity or compatibility posture.'
						],
						[
							'`files`, `bindings`, `triggers`',
							'Preview or production uses different surfaces, resources, or schedules.'
						],
						[
							'`vars`, `secrets`',
							'Runtime strings or secret-binding declarations differ by environment.'
						],
						[
							'`routes`, `assets`, `limits`, `observability`',
							'Deployment routing, static assets, CPU limits, or observability should differ by lane.'
						],
						[
							'`rolldown`, `vite`, `wrangler`',
							'The build host or the passthrough escape hatch needs environment-specific behavior.'
						]
					]
				},
				paragraphs: [
					'This is why `config.env` is more than a raw Wrangler mirror. It can change the Devflare-owned parts of the project too, as long as those differences are still part of the same package story.'
				]
			},
			{
				id: 'override-merge-rules',
				title: 'Environment overrides: arrays replace, objects deep-merge, primitives replace',
				paragraphs: [
					'Overlays compose onto the base config with three rules: object-shaped values are deep-merged key by key, primitive values (strings, numbers, booleans) are replaced wholesale, and array-shaped values are replaced wholesale (they do not append). Reading an environment block as an override of the base — not as an addition to it — keeps these rules predictable.',
					'The replace-arrays rule is the one most likely to surprise someone arriving from a config system that appended arrays. If a base config sets `routes: […]` and the overlay sets `routes: […]`, the overlay’s array becomes the resolved value; the base array is not concatenated. The same applies to `migrations` and to nested arrays like `triggers.crons`.'
				],
				table: {
					headers: ['Field shape', 'Merge rule', 'Example'],
					rows: [
						[
							'`routes` (array)',
							'Replace',
							'Base `routes: [{ pattern: "app.example.com/*", zone_name: "example.com" }]` + overlay `routes: [{ pattern: "preview.example.com/*", zone_name: "example.com" }]` resolves to **only** the preview entry.'
						],
						[
							'`migrations` (array)',
							'Replace',
							'Base `migrations: [{ tag: "v1", new_classes: ["Room"] }]` + overlay `migrations: [{ tag: "v2", new_classes: ["Room", "User"] }]` resolves to **only** the v2 entry. To preserve history, restate the prior migrations in the overlay.'
						],
						[
							'`triggers.crons` (array under nested object)',
							'Replace at the array level (the parent `triggers` object is still deep-merged)',
							'Base `triggers: { crons: ["*/5 * * * *"] }` + overlay `triggers: { crons: ["0 * * * *"] }` resolves to `triggers.crons = ["0 * * * *"]`. Other keys on `triggers` deep-merge as usual.'
						],
						[
							'`bindings` (object)',
							'Deep-merge',
							'Adding `bindings.kv.NEW_NS` in an overlay extends the base `bindings.kv` map; existing namespaces survive unless the overlay names the same key.'
						],
						[
							'`name`, `compatibility_date` (primitive)',
							'Replace',
							'The overlay value wins when present; otherwise the base value stays.'
						]
					]
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Arrays replace, they do not append',
						body: [
							'If you only want to add one extra route, one extra cron, or one extra migration to the base, the overlay must restate the base entries alongside the new one. An overlay that lists only the new entry will silently drop the base entries from the resolved config.'
						]
					}
				]
			},
			{
				id: 'when-to-pick-env',
				title:
					'Choose the environment where it matters, and let explicit deploy targets do the rest',
				steps: [
					'Use commands like `devflare config --env <name>` or `devflare build --env <name>` when you want to inspect or compile one named environment intentionally.',
					'Let explicit preview deploys target the preview environment instead of also layering on an unrelated `--env` decision.',
					'Let explicit production deploys stay pinned to production so the deployment target is never ambiguous.',
					'Keep preview-only resource naming and preview lifecycle behavior inside the preview lane instead of leaking it into the base config.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Environment choice and deploy target are related, but not identical',
						body: [
							'`--env` chooses a config overlay for commands that resolve config environments. Explicit preview and production deploy flags choose the deployment destination itself.'
						]
					}
				]
			},
			{
				id: 'vars-secrets-env',
				title: 'Keep `.env`, `vars`, and `secrets` in separate jobs',
				bullets: [
					'Use `.env` for inputs that exist while `devflare.config.*` is being evaluated. Devflare prefers a workspace-root `.env` when it finds a workspace ancestor, otherwise it falls back to the nearest ancestor `.env`.',
					'Use `vars` for string values that should compile into generated Worker-facing output.',
					'Use `secrets` to declare runtime secret binding names, not to store those secret values in config. Today that is mostly schema and type metadata: the schema accepts `{ required: false }`, but generated env typing still treats declared secrets as present and Devflare does not currently turn that flag into a separate deploy-time guarantee.',
					'Use `.env.example` to document config-time inputs for the team instead of leaving those values to memory or chat scrollback.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not let every string become an environment variable by reflex',
						body: [
							'Stable infrastructure names and intentional runtime strings usually belong in authored config. Save secrets for the values that are actually secret.'
						]
					}
				]
			}
		]
	}
]
