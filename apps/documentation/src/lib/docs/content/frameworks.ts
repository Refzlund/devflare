import type { DocPage } from '../types'

export const frameworkDocs: DocPage[] = [
	{
		slug: 'svelte-with-rolldown',
		group: 'Devflare',
		navTitle: 'Svelte in workers',
		readTime: '5 min read',
		eyebrow: 'Frameworks',
		title: 'Render Svelte inside worker bundles by putting the compiler in Rolldown, not the app shell',
		summary:
			'When a worker-only fetch surface or Durable Object imports `.svelte`, add the Svelte compiler to `rolldown.options.plugins`. That compilation belongs to Devflare’s worker bundler, not the main Vite plugin chain.',
		description:
			'This is the right path when the worker itself renders or consumes Svelte components. Keep the package in worker-only mode if that is all you need, then extend Devflare’s Rolldown pipeline with the Svelte plugins that make those imports compile cleanly.',
		highlights: [
			'Worker-side `.svelte` imports belong to `rolldown.options.plugins`, not to the main Vite plugin chain.',
			'Use `emitCss: false` so the worker bundle stays single-file instead of expecting a browser asset pipeline.',
			'Use SSR-style compilation because the worker is rendering markup or consuming compiled component output.',
			'The same plugin path applies to main worker bundles and Durable Object bundles when those modules import Svelte components.'
		],
		facts: [
			{ label: 'Best for', value: 'Worker-only fetch surfaces or Durable Objects that import `.svelte`' },
			{ label: 'Key extension point', value: '`rolldown.options.plugins`' },
			{ label: 'Rendering shape', value: 'SSR-style component compilation inside the worker bundle' }
		],
		sourcePages: ['development-workflows.md', 'configuration-reference.md', 'README.md'],
		sections: [
			{
				id: 'choose-this-path',
				title: 'Use this path when the worker imports the component',
				paragraphs: [
					'If your worker entry, route module, queue consumer, scheduled handler, or Durable Object imports a `.svelte` file directly, Devflare treats that as a worker bundling concern. The correct place to teach the build how to compile it is the Rolldown pipeline that Devflare owns for worker bundles.',
					'That means you do not need to promote the whole package into a Vite app just because one worker module wants Svelte-based rendering. Worker-only mode remains the intended default until the package truly needs an outer app host.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Keep the ownership line clean',
						body: [
							'Vite owns the outer app shell when one exists. Rolldown owns the worker code that Devflare bundles itself. Worker-rendered Svelte belongs to the second bucket.'
						]
					}
				]
			},
			{
				id: 'wire-the-plugins',
				title: 'Add Svelte to Rolldown options',
				snippets: [
					{
						title: 'Install the worker-side Svelte toolchain',
						language: 'bash',
						code: String.raw`bun add -d svelte rollup-plugin-svelte @rollup/plugin-node-resolve`
					},
					{
						title: 'Configure Svelte in `rolldown.options.plugins`',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'
import resolve from '@rollup/plugin-node-resolve'
import type { Plugin as RolldownPlugin } from 'rolldown'
import svelte from 'rollup-plugin-svelte'

export default defineConfig({
	name: 'chat-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	rolldown: {
		sourcemap: true,
		options: {
			plugins: [
				svelte({
					emitCss: false,
					compilerOptions: {
						generate: 'ssr'
					}
				}) as unknown as RolldownPlugin,
				resolve({
					browser: true,
					exportConditions: ['svelte'],
					extensions: ['.svelte']
				}) as unknown as RolldownPlugin
			]
		}
	}
})`
					}
				],
				bullets: [
					'`emitCss: false` keeps the worker bundle single-file instead of emitting a CSS asset pipeline the worker cannot naturally serve by itself.',
					'`generate: \`ssr\`` fits worker-side rendering better than a browser DOM target.',
					'`@rollup/plugin-node-resolve` helps `.svelte` files and `exports.svelte` packages resolve cleanly.'
				]
			},
			{
				id: 'render-response',
				title: 'Render from the worker like any other module import',
				snippets: [
					{
						title: '`src/Greeting.svelte`',
						language: 'svelte',
						code: String.raw`<script lang='ts'>
	export let name: string
</script>

<h1>Hello {name} from Svelte</h1>`
					},
					{
						title: '`src/fetch.ts`',
						language: 'ts',
						code: String.raw`import Greeting from './Greeting.svelte'

export async function fetch(): Promise<Response> {
	return new Response(Greeting.render({ name: 'Devflare' }).html, {
		headers: {
			'content-type': 'text/html; charset=utf-8'
		}
	})
}`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not over-generalize the plugin stack',
						body: [
							'If a plugin depends on Rollup-only hooks that Rolldown does not support yet, keep that plugin in the main Vite build instead of the worker bundler.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'vite-standalone',
		group: 'Devflare',
		navTitle: 'Vite standalone',
		readTime: '5 min read',
		eyebrow: 'Frameworks',
		title: 'Use Devflare with a standalone Vite app when Vite is the outer host and Devflare owns Worker config underneath',
		summary:
			'An effective Vite config is what opts the package into Vite-backed flows: a local `vite.config.*`, a non-empty `config.vite`, or both together. Use `devflare/vite` when the package really is a Vite app and you want Devflare to keep Worker config, Durable Objects, and generated Wrangler output aligned underneath it.',
		description:
			'This is the lane for frontend-first packages that already have a real Vite app shell. Vite keeps HMR and the app build. Devflare plugs generated Worker config, Durable Object discovery, bridge behavior, and Worker-aware artifacts into that pipeline.',
		highlights: [
			'A local `vite.config.*` or non-empty `config.vite` is what opts the package into Vite-backed mode.',
			'The same `devflare dev`, `build`, `types`, and explicit `deploy` loop still applies; Vite changes the host, not the command vocabulary.',
			'`devflarePlugin()` generates `.devflare/wrangler.jsonc`, watches config changes, and wires in Worker-specific behavior.',
			'`getDevflareConfigs()` is the high-signal helper when you want explicit `@cloudflare/vite-plugin` wiring.',
			'If the package is really just a worker, stay worker-only instead of adding a Vite host that is not doing app-level work.'
		],
		facts: [
			{ label: 'Best for', value: 'Standalone Vite apps that still ship Worker-aware runtime pieces' },
			{ label: 'Mode switch', value: 'Local `vite.config.*` or non-empty `config.vite`' },
			{ label: 'Primary helper', value: '`devflare/vite`' }
		],
		sourcePages: ['development-workflows.md', 'README.md', 'configuration-reference.md'],
		sections: [
			{
				id: 'opt-into-vite',
				title: 'Know what actually enables Vite-backed mode',
				bullets: [
					'A local `vite.config.*` opts the current package into Vite-backed flows.',
					'A non-empty `config.vite` also opts the package into Vite-backed flows.',
					'Vite dependencies by themselves do not switch the package out of worker-only mode.',
					'Without an effective Vite config, `dev`, `build`, and `deploy` stay worker-only.'
				],
				callouts: [
					{
						tone: 'success',
						title: 'Worker-only is still the default',
						body: [
							'Use Vite because the package has a real Vite host, not because it feels like every modern project should have one glued on top.'
						]
					}
				]
			},
			{
				id: 'minimum-wiring',
				title: 'Choose the lightest wiring that fits the app',
				snippets: [
					{
						title: 'Minimal Devflare-side Vite integration',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'vite'
import { devflarePlugin } from 'devflare/vite'

export default defineConfig({
	plugins: [devflarePlugin()]
})`
					},
					{
						title: 'Explicit Cloudflare plugin wiring',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { devflarePlugin, getDevflareConfigs } from 'devflare/vite'

export default defineConfig(async () => {
	const { cloudflareConfig, auxiliaryWorkers } = await getDevflareConfigs()

	return {
		plugins: [
			devflarePlugin(),
			cloudflare({
				config: cloudflareConfig,
				auxiliaryWorkers: auxiliaryWorkers.length > 0 ? auxiliaryWorkers : undefined
			})
		]
	}
})`
					}
				],
				paragraphs: [
					'Use the minimal plugin shape when this file only needs to add Devflare’s Worker-aware behavior and the rest of the Cloudflare Vite wiring already lives elsewhere. Reach for `getDevflareConfigs()` when this file should own the Cloudflare plugin configuration explicitly too.'
				]
			},
			{
				id: 'plugin-options',
				title: '`devflarePlugin()` options',
				table: {
					headers: ['Option', 'Type', 'Default', 'Description'],
					rows: [
						['`configPath`', '`string`', '`devflare.config.ts`', 'Path to the Devflare config file.'],
						['`environment`', '`string`', '—', 'Named environment from config to resolve.'],
						['`doTransforms`', '`boolean`', '`true`', 'Enable Durable Object code transforms.'],
						['`watchConfig`', '`boolean`', '`true`', 'Watch the config file for changes in dev mode.'],
						['`bridgePort`', '`number`', '`DEVFLARE_BRIDGE_PORT`', 'Miniflare bridge port for WebSocket proxying.'],
						['`wsProxyPatterns`', '`string[]`', '`[]`', 'Additional patterns to proxy WebSocket requests to Miniflare. Patterns from `wsRoutes` in config are included automatically.']
					]
				}
			},
			{
				id: 'what-changes-when-vite-is-active',
				title: 'Know what changes once Vite is actually active',
				paragraphs: [
					'The package still uses the same Devflare command loop. What changes is the outer host: Vite takes over the app shell while Devflare keeps resolving worker config, generated Wrangler output, Durable Object discovery, and composed worker entrypoints underneath it.',
					'That means you should think in terms of host ownership, not a separate CLI mode. Reach for this page when the package genuinely became a Vite app, not when you just need one more bundler-shaped knob.'
				],
				steps: [
					'Devflare loads and validates `devflare.config.*` first.',
					'If a local `vite.config.*` exists, Devflare loads it and overlays `config.vite` on top; otherwise it can synthesize `.devflare/vite.config.mjs` from `config.vite` alone. That merged result is the effective Vite config.',
					'Devflare still compiles worker-aware config into generated Wrangler output and may generate `.devflare/worker-entrypoints/main.ts` when worker surfaces need wrapper glue or composition.',
					'Build and deploy use the current package\'s installed Vite so the outer app build and the inner worker plumbing stay aligned.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Same commands, different host',
						body: [
							'You do not learn a second CLI vocabulary for Vite-backed packages. The config decides who hosts the outer app, while the Devflare commands stay familiar.'
						]
					}
				]
			},
			{
				id: 'config-ownership',
				title: 'Keep ownership lines obvious',
				cards: [
					{
						title: 'Vite owns',
						body: 'The outer app dev server, HMR, and the app build for packages that are truly Vite apps.'
					},
					{
						title: 'Devflare owns',
						body: 'Generated Wrangler config, composed worker entrypoints, Durable Object discovery, bridge behavior, and worker-aware build glue.'
					},
					{
						title: 'Generated output',
						body: 'Treat `.devflare/vite.config.mjs` and `.devflare/wrangler.jsonc` as output, not as the source of truth you maintain by hand.'
					}
				],
				bullets: [
					'If both `vite.config.*` and `config.vite` exist, Devflare merges `vite.config.*` first and then overlays `config.vite`.',
					'`wrangler.passthrough.main` is the explicit opt-out if you want to own the Worker main entry completely.'
				]
			}
		]
	},
	{
		slug: 'sveltekit-with-devflare',
		group: 'Devflare',
		navTitle: 'SvelteKit',
		readTime: '5 min read',
		eyebrow: 'Frameworks',
		title: 'Compose Devflare with SvelteKit by letting SvelteKit host the app and Devflare supply the Worker platform',
		summary:
			'Hand SvelteKit\'s Cloudflare adapter output to Devflare via `wrangler.passthrough.main` (the adapter worker is a build artifact and does not exist until `vite build` runs), keep `sveltekit()` in `vite.config.ts`, and compose `devflare/sveltekit` into `src/hooks.server.ts` so local platform bindings line up with the Worker runtime Devflare manages.',
		description:
			'This is the path for full SvelteKit apps where the framework owns the outer shell and Devflare keeps the Worker-facing platform story coherent. It matches the repository’s real documentation app and the SvelteKit integration example in the public docs.',
		highlights: [
			'Use `wrangler.passthrough.main` (not `files.fetch`) to point at the adapter\'s `_worker.js`. The adapter writes that file during `vite build`, after Devflare has already resolved its handler paths — so `files.fetch` would fail with "Configured fetch handler … was not found" on a clean checkout.',
			'Keep `devflarePlugin()` and `sveltekit()` together in `vite.config.ts` so Vite stays the app host while Devflare wires Worker config underneath it.',
			'`handle` from `devflare/sveltekit` is the simplest hook path, and `createHandle()` is the escape hatch when you need custom hints or enable rules.',
			'When composing with other hooks, put the Devflare handle first so `event.platform` is ready before downstream middleware reads it.'
		],
		facts: [
			{ label: 'Best for', value: 'Full SvelteKit apps that deploy through Devflare' },
			{ label: 'Worker entry', value: 'The adapter worker output your package actually emits, commonly `.svelte-kit/cloudflare/_worker.js` or a repo-specific path such as `.adapter-cloudflare/_worker.js`, wired via `wrangler.passthrough.main`' },
			{ label: 'Hook helper', value: '`devflare/sveltekit`' }
		],
		sourcePages: ['development-workflows.md', 'README.md', 'apps/documentation/README.md'],
		sections: [
			{
				id: 'required-files',
				title: 'Wire the SvelteKit package like a SvelteKit app first',
				snippets: [
					{
						title: '`devflare.config.ts`',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-app',
	files: {
		// fetch is supplied by SvelteKit's adapter output below;
		// keep this false so devflare does not try to compose around an unbuilt artifact.
		fetch: false,
		durableObjects: 'src/do/**/*.ts'
	},
	wrangler: {
		passthrough: {
			// SvelteKit's @sveltejs/adapter-cloudflare writes this file during vite build.
			main: '.svelte-kit/cloudflare/_worker.js'
		}
	}
})`
					},
					{
						title: '`vite.config.ts`',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from 'devflare/vite'

export default defineConfig({
	plugins: [devflarePlugin(), sveltekit()]
})`
					}
				],
				paragraphs: [
					'SvelteKit still owns the app shell, routing, and framework build. Devflare plugs Worker-aware config, generated Wrangler output, and any Durable Object discovery into that Vite-driven flow.',
					'The adapter worker is a **build artifact** — `@sveltejs/adapter-cloudflare` only writes `.svelte-kit/cloudflare/_worker.js` (or your repo\'s equivalent, like `.adapter-cloudflare/_worker.js`) during `vite build`. Devflare resolves handler paths *before* the framework build runs, so pointing `files.fetch` at that path fails on a clean checkout with `Configured fetch handler "…" was not found`. Use `wrangler.passthrough.main` instead: devflare skips composition entirely for the worker entry, and wrangler picks up the adapter output post-build.',
					'If you also have queue handlers, scheduled handlers, durable objects, or routes, keep those in `files.queue` / `files.scheduled` / `files.durableObjects` / `files.routes` as normal source files — composition still applies to those surfaces.'
				]
			},
			{
				id: 'compose-the-handle',
				title: 'Put the Devflare handle at the front of `hooks.server.ts`',
				snippets: [
					{
						title: 'Simple composed handle',
						language: 'ts',
						code: String.raw`import { sequence } from '@sveltejs/kit/hooks'
import { handle as devflareHandle } from 'devflare/sveltekit'

const authHandle = async ({ event, resolve }) => resolve(event)

export const handle = sequence(devflareHandle, authHandle)`
					},
					{
						title: 'Custom handle with explicit binding hints',
						language: 'ts',
						code: String.raw`import { sequence } from '@sveltejs/kit/hooks'
import { createHandle } from 'devflare/sveltekit'

const devflareHandle = createHandle({
	hints: {
		DB: 'd1',
		CACHE: 'kv',
		CHAT_ROOM: 'do'
	}
})

export const handle = sequence(devflareHandle)`
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Why the order matters',
						body: [
							'The Devflare handle is the piece that prepares `event.platform` in local dev. Put it first so later middleware sees the same platform shape the app expects.'
						]
					}
				]
			},
			{
				id: 'when-to-customize',
				title: 'Reach for `createHandle()` only when the simple handle is not enough',
				bullets: [
					'Use the exported `handle` from `devflare/sveltekit` when auto-loaded binding hints from `devflare.config.ts` are enough.',
					'Use `createHandle()` when you need custom binding hints, a custom bridge URL, or a custom `shouldEnable()` rule.',
					'If your repo already points `wrangler.passthrough.main` at the adapter worker, keep that path authoritative instead of duplicating it in `files.fetch`.',
					'Keep the rest of the app in normal SvelteKit patterns; Devflare is there to supply the Worker platform and config alignment, not to replace SvelteKit itself.'
				]
			}
		]
	}
]