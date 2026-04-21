import type { DocPage } from '../types'

const docsLink = (slug: string): string => `/docs/${slug}`

const projectShapeConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		durableObjects: 'src/do/**/*.ts',
		transport: null
	},
	assets: {
		directory: 'public'
	}
})`

const fullConfigExampleCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'docs-platform',
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	compatibilityDate: '2026-03-17',
	compatibilityFlags: ['urlpattern_polyfill'],
	previews: {
		includeCrons: false
	},
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts',
		entrypoints: 'src/ep/**/*.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		workflows: 'src/workflows/**/*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		kv: {
			CACHE: 'docs-cache'
		},
		d1: {
			PRIMARY_DB: 'docs-db'
		},
		r2: {
			UPLOADS: 'docs-uploads'
		},
		durableObjects: {
			CHAT_ROOMS: 'ChatRoom'
		},
		queues: {
			producers: {
				EMAILS: 'docs-emails'
			},
			consumers: [
				{
					queue: 'docs-emails',
					deadLetterQueue: 'docs-emails-dlq',
					maxBatchSize: 50,
					maxBatchTimeout: 10,
					maxRetries: 5,
					maxConcurrency: 2,
					retryDelay: 30
				}
			]
		},
		services: {
			AUTH: {
				service: 'auth-worker'
			}
		},
		ai: {
			binding: 'AI'
		},
		vectorize: {
			SEARCH_INDEX: {
				indexName: 'docs-search'
			}
		},
		hyperdrive: {
			APP_DB: 'docs-primary-db'
		},
		browser: {
			BROWSER: 'browser'
		},
		analyticsEngine: {
			REQUESTS: {
				dataset: 'docs_requests'
			}
		},
		sendEmail: {
			MAILER: {
				destinationAddress: 'team@example.com'
			}
		}
	},
	triggers: {
		crons: ['0 */6 * * *']
	},
	vars: {
		APP_ENV: 'development'
	},
	secrets: {
		API_TOKEN: {
			required: true
		}
	},
	routes: [
		{
			pattern: 'docs.example.com/*',
			custom_domain: true
		}
	],
	wsRoutes: [
		{
			pattern: '/ws/:id',
			doNamespace: 'CHAT_ROOMS',
			idParam: 'id',
			forwardPath: '/websocket'
		}
	],
	assets: {
		directory: 'static',
		binding: 'ASSETS'
	},
	limits: {
		cpu_ms: 50
	},
	observability: {
		enabled: true,
		head_sampling_rate: 1
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatRoom']
		}
	],
	rolldown: {
		target: 'es2022',
		minify: true,
		sourcemap: true,
		options: {}
	},
	vite: {
		plugins: []
	},
	env: {
		preview: {
			vars: {
				APP_ENV: 'preview'
			},
			previews: {
				includeCrons: false
			},
			observability: {
				enabled: true,
				head_sampling_rate: 1
			}
		},
		production: {
			vars: {
				APP_ENV: 'production'
			}
		}
	},
	wrangler: {
		passthrough: {
			logpush: true
		}
	}
})`

const environmentOverlayCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			CACHE: 'notes-cache'
		}
	},
	vars: {
		APP_ENV: 'local'
	},
	env: {
		preview: {
			bindings: {
				kv: {
					CACHE: 'notes-preview-cache'
				}
			},
			vars: {
				APP_ENV: 'preview'
			},
			previews: {
				includeCrons: false
			}
		},
		production: {
			vars: {
				APP_ENV: 'production'
			},
			observability: {
				enabled: true,
				head_sampling_rate: 1
			}
		}
	}
})`

const previewBindingsConfigCode = String.raw`import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	name: 'notes-api',
	bindings: {
		kv: {
			CACHE: pv('notes-cache-kv')
		},
		d1: {
			PRIMARY_DB: pv('notes-db')
		},
		r2: {
			UPLOADS: pv('notes-uploads-bucket')
		},
		queues: {
			producers: {
				EMAILS: pv('notes-emails-queue')
			},
			consumers: [
				{
					queue: pv('notes-emails-queue'),
					deadLetterQueue: pv('notes-emails-dlq')
				}
			]
		}
	},
	env: {
		preview: {
			vars: {
				APP_ENV: 'preview'
			}
		},
		production: {
			bindings: {
				kv: {
					CACHE: 'notes-cache-kv-production'
				},
				d1: {
					PRIMARY_DB: 'notes-db-production'
				}
			},
			vars: {
				APP_ENV: 'production'
			}
		}
	}
})`

const previewBindingsLifecycleCode = String.raw`bunx --bun devflare deploy --preview next
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews cleanup --scope next --apply`

const workerSurfacesConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'jobs-worker',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		routes: false
	},
	triggers: {
		crons: ['0 */6 * * *']
	},
	previews: {
		includeCrons: false
	}
})`

const runtimeDeploySettingsCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'docs-site',
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	compatibilityDate: '2026-03-17',
	assets: {
		directory: 'static',
		binding: 'ASSETS'
	},
	routes: [
		{ pattern: 'docs.example.com/*', custom_domain: true }
	],
	wsRoutes: [
		{
			pattern: '/ws/:id',
			doNamespace: 'CHAT_ROOMS'
		}
	],
	limits: {
		cpu_ms: 50
	},
	observability: {
		enabled: true,
		head_sampling_rate: 1
	},
	previews: {
		includeCrons: false
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatRoom']
		}
	]
})`

const generatedTypesOutputCode = String.raw`// Generated by devflare - DO NOT EDIT
// Run devflare types to regenerate

import type { MathServiceInterface } from './src/math-service.types'
import type { AdminEntrypointInterface } from './src/math-service.types'

declare global {
	interface DevflareEnv {
		MATH_SERVICE: MathServiceInterface
		ADMIN: AdminEntrypointInterface
	}
}

/**
 * Named entrypoints discovered from ep.*.ts files.
 * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.
 */
export type Entrypoints = 'AdminEntrypoint'`

export const configurationDocs: DocPage[] = [
	{
		slug: 'full-config',
		group: 'Devflare',
		navTitle: 'Full config',
		readTime: '6 min read',
		eyebrow: 'Configuration',
		title: 'Scan one full `devflare.config.ts` example with the main current config lanes in one place',
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
			{ label: 'Best for', value: 'Seeing the whole current config shape before you zoom into one subsection' },
			{ label: 'Reading pattern', value: 'Scan the example first, then hover properties, then open the specialist page you actually need' },
			{ label: 'Important boundary', value: 'This example is canonical, but not every binding family variant is shown inline' }
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
						['`name`, `accountId`, `compatibility*`', 'Worker identity and runtime posture.', '`config-basics` and `runtime-deploy-settings`'],
						['`previews`, `files`, `bindings`, `triggers`', 'The authored Worker shape: surfaces, bindings, and scheduled intent.', '`project-shape`, `worker-surfaces`, and `config-previews`'],
						['`vars`, `secrets`, `env`', 'Runtime strings, secret declarations, and environment overlays.', '`config-environments`'],
						['`routes`, `wsRoutes`, `assets`', 'Deployment routing, dev WebSocket proxy rules, and static asset delivery.', '`runtime-deploy-settings`'],
						['`limits`, `observability`, `migrations`', 'Operational posture and release-time controls.', '`runtime-deploy-settings`'],
						['`rolldown`, `vite`, `wrangler`', 'Bundler coordination, host integration, and unsupported Wrangler passthrough.', '`config-basics`, `vite-standalone`, and `svelte-with-rolldown`']
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
		title: 'Configure the project shape around explicit file surfaces before the package gets noisy',
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
			{ label: 'Best for', value: 'Teams deciding how many runtime surfaces one package actually needs' },
			{ label: 'Primary shape keys', value: '`files.*`, `assets`, `routes`, and `wsRoutes`' },
			{ label: 'Safest habit', value: 'Add one surface only when the current project shape truly asks for it' }
		],
		sourcePages: ['configuration-reference.md', 'README.md', 'schema-runtime.ts', 'config-autodiscovery.test.ts'],
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
						['`files.fetch`', 'One main Worker surface should own request-wide behavior.', 'Points Devflare at the fetch entry you author directly.'],
						['`files.routes`', 'The project needs route modules or a mounted route prefix.', 'Lets a route tree sit beside or replace the main fetch file.'],
						['`files.queue`, `files.scheduled`, `files.email`', 'The package consumes background or platform-triggered events.', 'Adds separate handler files for those runtime surfaces.'],
						['`files.durableObjects`, `files.entrypoints`, `files.workflows`', 'The project needs stateful classes, named entrypoints, or workflow definitions.', 'Turns globs into additional Worker-owned code surfaces Devflare can discover and bundle.'],
						['`files.transport`', 'Custom value transport is needed for richer Worker or Durable Object contracts.', 'Lets you point at one explicit transport file, or disable autodiscovery with `null`.'],
						['`assets`, `routes`, `wsRoutes`', 'Static files, deployment routing, or dev WebSocket proxy behavior need their own config.', 'Keeps non-handler project concerns out of the file-surface lane.']
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
		title: 'Use `config.env` overlays to change only what differs between local, preview, and production',
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
			{ label: 'Best for', value: 'Projects that need different bindings or runtime behavior in preview and production' },
			{ label: 'Merge model', value: 'Base config first, then `config.env[name]`, then preview materialization when relevant' },
			{ label: 'Main habit', value: 'Repeat only the keys that actually differ by environment' }
		],
		sourcePages: ['configuration-overview.md', 'configuration-reference.md', 'schema-env.ts', 'resolve.ts'],
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
						['`name`, compatibility settings', 'The environment truly needs a different runtime identity or compatibility posture.'],
						['`files`, `bindings`, `triggers`', 'Preview or production uses different surfaces, resources, or schedules.'],
						['`vars`, `secrets`', 'Runtime strings or secret-binding declarations differ by environment.'],
						['`routes`, `assets`, `limits`, `observability`', 'Deployment routing, static assets, CPU limits, or observability should differ by lane.'],
						['`rolldown`, `vite`, `wrangler`', 'The build host or the passthrough escape hatch needs environment-specific behavior.']
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
						['`routes` (array)', 'Replace', 'Base `routes: [{ pattern: "app.example.com/*", zone_name: "example.com" }]` + overlay `routes: [{ pattern: "preview.example.com/*", zone_name: "example.com" }]` resolves to **only** the preview entry.'],
						['`migrations` (array)', 'Replace', 'Base `migrations: [{ tag: "v1", new_classes: ["Room"] }]` + overlay `migrations: [{ tag: "v2", new_classes: ["Room", "User"] }]` resolves to **only** the v2 entry. To preserve history, restate the prior migrations in the overlay.'],
						['`triggers.crons` (array under nested object)', 'Replace at the array level (the parent `triggers` object is still deep-merged)', 'Base `triggers: { crons: ["*/5 * * * *"] }` + overlay `triggers: { crons: ["0 * * * *"] }` resolves to `triggers.crons = ["0 * * * *"]`. Other keys on `triggers` deep-merge as usual.'],
						['`bindings` (object)', 'Deep-merge', 'Adding `bindings.kv.NEW_NS` in an overlay extends the base `bindings.kv` map; existing namespaces survive unless the overlay names the same key.'],
						['`name`, `compatibility_date` (primitive)', 'Replace', 'The overlay value wins when present; otherwise the base value stays.']
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
				title: 'Choose the environment where it matters, and let explicit deploy targets do the rest',
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
	},
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
			{ label: 'Typical result', value: '`notes-cache-kv` → `notes-cache-kv-next` for a `next` preview scope' },
			{ label: 'Main lifecycle command', value: '`bunx --bun devflare previews cleanup --scope <name> --apply`' },
			{ label: 'Best for', value: 'Previews that need their own disposable state instead of borrowing production infrastructure' }
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
				title: 'Mark preview-owned bindings in config instead of mutating production names at deploy time',
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
					headers: ['Authored binding target', 'When it resolves', 'Resolved name', 'What that means'],
					rows: [
						['`pv(\'notes-cache-kv\')`', 'Local work or non-preview resolution', '`notes-cache-kv`', 'The base config stays readable and does not invent preview names unless a preview identifier is actually in play.'],
						['`pv(\'notes-cache-kv\')`', 'Plain `--preview` or generic preview environment', '`notes-cache-kv-preview`', 'The synthetic `preview` identifier keeps same-worker preview uploads separate from the base resource name.'],
						['`pv(\'notes-cache-kv\')`', 'Named preview like `--preview next` or `--scope next`', '`notes-cache-kv-next`', 'A named preview scope gets its own clearly-associated resource names and cleanup target.'],
						['`pv(\'notes-cache-kv\')`', '`DEVFLARE_PREVIEW_BRANCH=Feature/TeSt-Branch`', '`notes-cache-kv-feature-test-branch`', 'Branch-derived identifiers are sanitized into safe resource-name fragments.'],
						['`preview.scope({ separator: \'--\' })`', 'Custom separator plus preview identifier', '`notes-cache-kv--next`', 'You can change the separator when the resource naming convention needs it.']
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
						['KV, D1, and R2', 'Author the resource name with `preview.scope()`.', 'Preview deploys can create or reuse the scoped resource, and cleanup can delete it later by the same scope.'],
						['Queues and DLQs', 'Producer, consumer, and dead-letter queue names can all be scoped.', 'Preview deploys can provision the queue resources and cleanup can remove them together.'],
						['Vectorize', 'Index names can be preview-scoped too.', 'Devflare can provision the preview index shape from the base index metadata and delete it during cleanup later.'],
						['Hyperdrive', 'Names can be materialized for preview scopes.', 'Devflare does not auto-clone stored credentials, so it warns and can fall back to the base Hyperdrive binding when the preview config does not already exist.'],
						['Analytics Engine and Browser Rendering', 'Dataset or binding names can be materialized.', 'Devflare reports warnings instead of provisioning or deleting account resources because those families do not follow the same managed lifecycle.'],
						['Service bindings, Durable Objects, and routes on dedicated preview workers', 'Isolation follows preview worker names and ownership more than account resource naming.', 'Deleting dedicated preview worker scripts also removes preview-only service bindings, Durable Object bindings, and routes attached only to those workers.']
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
		title: 'Treat fetch, queue, scheduled, and email handlers as separate Worker surfaces with their own files',
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
			{ label: 'Default files', value: '`src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts`' },
			{ label: 'Generated output', value: '`.devflare/worker-entrypoints/main.ts` when Devflare needs to wrap or compose the worker surfaces it discovered' },
			{ label: 'Test helpers', value: '`cf.worker`, `cf.queue`, `cf.scheduled`, and `cf.email`' }
		],
		sourcePages: [
			'src/worker-entry/surface-paths.ts',
			'src/worker-entry/composed-worker.ts',
			'src/dev-server/worker-surface-paths.ts',
			'src/dev-server/worker-source-watcher.ts',
			'src/cli/help-pages/pages/core.ts',
			'verification-testing-and-caveats.md'
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
						['Fetch', '`src/fetch.ts` or `src/routes/**`', 'HTTP requests belong to one main handler or route tree.', '`cf.worker.get()` / `cf.worker.fetch()`'],
						['Queue consumer', '`src/queue.ts`', 'The package owns deferred, batched, or retryable queue work.', '`cf.queue.trigger()`'],
						['Scheduled handler', '`src/scheduled.ts` plus `triggers.crons`', 'Time-based jobs should run from config-owned schedules.', '`cf.scheduled.trigger()`'],
						['Email handler', '`src/email.ts`', 'The Worker handles inbound email or local email-handler flows.', '`cf.email.send()`']
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
						['`files.durableObjects`', 'Durable Object class files or globs', 'These classes are discovered and wrapped; they are not a standalone top-level event surface like fetch or queue.'],
						['`files.entrypoints`', 'Named entrypoint files or globs', 'These support typed cross-worker references and discovery, not a separate Cloudflare event hook.'],
						['`files.workflows`', 'Workflow definition files or globs', 'These are additional discovered modules, not a direct replacement for fetch, queue, scheduled, or email handlers.'],
						['`files.transport`', 'One custom transport file', 'This is a serialization hook for bridge-backed calls, not an event handler that Cloudflare dispatches directly.']
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
		title: 'Use `devflare types` to keep `env.d.ts` and `Entrypoints` aligned with the project you actually authored',
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
			{ label: 'Best for', value: 'Packages that use bindings, Durable Objects, service bindings, or named worker entrypoints' },
			{ label: 'Main command', value: '`bunx --bun devflare types`' },
			{ label: 'Default output', value: '`env.d.ts` relative to the directory you run the command from unless you override it' },
			{ label: 'Best pairing', value: '`defineConfig<import(\'./env\').Entrypoints>()` on the referenced worker config' }
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
						['`bindings`, `vars`, and `secrets`', 'The resolved top-level `devflare.config.*` from the current working directory or explicit `--config` path.', 'Members on global `DevflareEnv`.'],
						['Local Durable Object classes', '`files.durableObjects` or the default `**/do.*.{ts,js}` discovery pattern.', '`DurableObjectNamespace<...>` when the class can be located accurately.'],
						['Named worker entrypoints', '`files.entrypoints` or the default `**/ep.*.{ts,js}` discovery pattern plus exported classes extending `WorkerEntrypoint`.', 'An exported `Entrypoints` union for `defineConfig<Entrypoints>()`.'],
						['`ref()` references', 'Imported Devflare configs in other packages or subfolders.', 'Typed service bindings and cross-worker Durable Object namespaces when Devflare can resolve them.'],
						['Unknown or unresolvable service surface', 'A target worker or entrypoint that cannot be turned into a stable interface.', '`Fetcher` fallback instead of fake precision.']
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
					'The `Entrypoints` union matters most on the worker being referenced. Import that generated type into the worker\'s own config and pass it to `defineConfig<Entrypoints>()`, then callers that use `ref(() => import(...))` can ask for named entrypoints without turning those names into loose string conventions.',
					'That keeps the typing relationship honest: the worker that owns `ep.*.ts` files declares which entrypoints exist, and the worker that consumes them gets autocomplete and checking through `ref().worker(\'...\')` later.'
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
	},
	{
		slug: 'runtime-deploy-settings',
		group: 'Devflare',
		navTitle: 'Runtime & deploy settings',
		readTime: '7 min read',
		eyebrow: 'Configuration',
		title: 'Keep runtime posture and deployment shape in authored config instead of scattered deploy conventions',
		summary:
			'Use config for account context, compatibility posture, assets, deployment routes, WebSocket proxy rules, migrations, observability, limits, and preview cron behavior instead of rediscovering those settings in scripts later.',
		description:
			'Devflare exposes several config lanes that are not about file discovery at all. These keys shape runtime identity, Cloudflare compatibility, deployment routing, assets, release behavior, and operational posture, so they belong in authored config where the team can review them accurately.',
		highlights: [
			'`accountId` matters when remote bindings, name-based resource resolution, or account-aware operations should target one Cloudflare account explicitly.',
			'`compatibilityDate` defaults to the current date, and Devflare always includes `nodejs_compat` plus `nodejs_als` in compatibility flags.',
			'`assets`, `routes`, and `wsRoutes` shape delivery and dev behavior; they are not the same thing as app routing under `files.routes`.',
			'`limits`, `observability`, `migrations`, and `previews.includeCrons` are source-controlled runtime and release knobs; in practice `previews.includeCrons` decides whether branch-scoped preview deploys keep cron triggers.'
		],
		facts: [
			{ label: 'Best for', value: 'Projects that need explicit runtime posture and delivery shape beyond the basic file surfaces' },
			{ label: 'Forced compatibility flags', value: '`nodejs_compat` and `nodejs_als`' },
			{ label: 'Routing split', value: '`files.routes` is app routing, while top-level `routes` is Cloudflare deployment routing' },
			{ label: 'Preview cron default', value: '`previews.includeCrons` defaults to `false`' }
		],
		sourcePages: [
			'src/config/schema.ts',
			'src/config/schema-runtime.ts',
			'src/config/schema-env.ts',
			'src/dev-server/server.ts',
			'src/vite/plugin.ts'
		],
		sections: [
			{
				id: 'identity-and-compat',
				title: 'Set runtime identity and compatibility posture explicitly',
				paragraphs: [
					'Not every package needs the full advanced runtime section on day one, but once remote bindings, compatibility drift, or account-aware operations matter, these settings should move into config instead of living in loose scripts and remembered defaults.',
					'The important habit is that runtime posture should be reviewable in source control. If a package relies on a specific compatibility date or a specific Cloudflare account, that fact should be obvious before the deploy step runs.'
				],
				table: {
					headers: ['Key', 'Use it when', 'Important behavior'],
					rows: [
						['`accountId`', 'Remote bindings, name-based resource lookup, or account-aware commands should target one Cloudflare account explicitly.', 'Remote AI and Vectorize flows need a clear account, and config-level `accountId` becomes one resolution lane for account-aware operations and config-driven resource resolution.'],
						['`compatibilityDate`', 'The package should pin runtime behavior instead of inheriting date drift.', 'Devflare defaults it to the current date when you omit it, so explicit pinning is the safer choice once the package is real.'],
						['`compatibilityFlags`', 'You need extra Workers compatibility flags beyond the default posture.', 'Devflare always includes `nodejs_compat` and `nodejs_als`, so custom flags should be deliberate additions instead of copy-by-habit repetition.']
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'Do not restate the forced flags unless you are making a point',
						body: [
							'Devflare already includes `nodejs_compat` and `nodejs_als`. Keep `compatibilityFlags` focused on the extra posture your package actually needs.'
						]
					}
				]
			},
			{
				id: 'deploy-shape',
				title: 'Keep deployment shape in config, not in app routing or shell scripts',
				paragraphs: [
					'Several config keys answer deployment questions rather than application-routing questions. Keeping those lanes separate is what stops app URLs, Cloudflare routes, and dev-only WebSocket proxy behavior from collapsing into one blurry story.',
					'If the package serves static assets, mounts a custom domain, or proxies Durable Object WebSockets in development, that shape should live in config beside the rest of the deployment contract.'
				],
				table: {
					headers: ['Key', 'What it controls', 'Common use'],
					rows: [
						['`assets`', 'Static asset directory plus optional binding name', 'Point Devflare at one static directory and keep asset delivery visible in source.'],
						['`routes`', 'Cloudflare deployment route patterns', 'Attach the Worker to host or zone patterns at deploy time.'],
						['`wsRoutes`', 'Dev-mode Durable Object WebSocket proxy patterns', 'Forward development WebSocket paths into Durable Object namespaces explicitly.']
					]
				},
				snippets: [
					{
						title: 'One place for runtime posture and deployment-facing settings',
						language: 'ts',
						code: runtimeDeploySettingsCode
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Top-level `routes` is not the same thing as `files.routes`',
						body: [
							'`files.routes` controls your app route tree. Top-level `routes` controls Cloudflare deployment routing. Keep those ideas separate so the package stays reviewable.'
						]
					}
				]
			},
			{
				id: 'release-controls',
				title: 'Put release and operational controls in source control too',
				table: {
					headers: ['Key', 'Why it exists'],
					rows: [
						['`previews.includeCrons`', 'Choose whether branch-scoped preview deploys keep cron triggers instead of omitting them to avoid shared-schedule conflicts.'],
						['`limits.cpu_ms`', 'Declare CPU expectations in config rather than treating them as after-the-fact deploy tuning.'],
						['`observability.enabled` / `head_sampling_rate`', 'Keep tracing or sampling posture explicit for the environments that need it.'],
						['`migrations`', 'Track Durable Object class lifecycle in the same source-controlled package that owns those classes.']
					]
				},
				paragraphs: [
					'Once a package has Durable Object history, production traffic expectations, or explicit preview behavior, the runtime contract is no longer just “what files exist?” It also includes how that package should be migrated, sampled, and limited at runtime.',
					'These settings belong in the same config as the Worker surfaces. They are part of the deployable contract, not just garnish around it.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Durable Object migrations still deserve explicit release thinking',
						body: [
							'Keep migrations authored in config and remember that plain preview uploads do not apply Durable Object migrations. If the preview must exercise real Durable Object lifecycle changes, use the preview strategy that matches that reality.'
						]
					}
				]
			},
			{
				id: 'related-pages',
				title: 'Open the neighboring page when the setting changes the larger deployment story',
				cards: [
					{
						label: 'Configuration',
						title: 'Need environment overlays?',
						body: 'Use the environments page when these settings differ by preview, production, or another named lane.',
						href: docsLink('config-environments')
					},
					{
						label: 'Configuration',
						title: 'Need preview-scoped bindings?',
						body: 'Open the previews config page when preview deployments should own separate databases, buckets, or queues that can be cleaned up by scope later.',
						href: docsLink('config-previews')
					},
					{
						label: 'Ship & operate',
						title: 'Need the production story?',
						body: 'The production deploy page covers explicit deploy targets and the inspection tools that belong beside them.',
						href: docsLink('production-deploys')
					},
					{
						label: 'Ship & operate',
						title: 'Need preview behavior?',
						body: 'Preview strategy docs cover named preview scopes, same-worker uploads, and the Durable Object caveats around them.',
						href: docsLink('preview-strategies')
					},
					{
						label: 'Routing',
						title: 'Need app-route shape?',
						body: 'Open the routing page when the question is your route tree or request middleware, not Cloudflare deployment routes.',
						href: docsLink('http-routing')
					}
				]
			}
		]
	}
]