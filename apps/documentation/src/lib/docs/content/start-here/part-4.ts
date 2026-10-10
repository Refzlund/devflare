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

export const startHereDocsPart4: DocPage[] = [
	{
		slug: 'config-basics',
		group: 'Devflare',
		navTitle: 'Config basics',
		readTime: '5 min read',
		eyebrow: 'Configuration',
		title: 'Author stable config, keep secrets and generated output in their own lanes',
		summary:
			'Write `devflare.config.ts` for humans first, let Devflare merge environments and resolve names later, and treat generated Wrangler-facing files as outputs rather than authoring surfaces.',
		description:
			'The easiest way to keep Devflare predictable is to keep stable intent in authored config and let build or deploy flows resolve the noisy details. That applies to environment overlays, stable resource names, secrets, and generated output.',
		highlights: [
			'`config.env` is a Devflare merge layer, not just a raw Wrangler environment mirror.',
			'Use stable names for resources when you can, and let id resolution happen later.',
			'`vars` are string config; `secrets` declare runtime expectations, and the schema accepts `{ required: false }` even though generated env typing still treats declared secrets as present today.',
			'Use `wrangler.passthrough` as the escape hatch for unsupported Wrangler keys, and treat it as a deliberate top-level override rather than a second config language.'
		],
		facts: [
			{ label: 'Best for', value: 'Anyone authoring or reviewing `devflare.config.ts`' },
			{ label: 'Source of truth', value: 'Authored config plus source files' },
			{ label: 'Escape hatch', value: '`wrangler.passthrough`' }
		],
		sourcePages: ['packages/devflare/src/config/schema.ts', 'README.md'],
		sections: [
			{
				id: 'flow',
				title: 'A simple config flow',
				steps: [
					'Author stable intent in `devflare.config.ts`.',
					'Optionally merge a named Devflare environment with `--env <name>`.',
					'Resolve account ids or resource ids only in flows that truly need them.',
					'Emit Wrangler-compatible output as generated artifacts.',
					'Build or deploy from generated output without hand-editing it.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'If a generated file feels hand-maintained, move the intent back up',
						body: [
							'That usually means the authored config is missing a real source-of-truth value or needs a passthrough key.'
						]
					}
				]
			},
			{
				id: 'vars-secrets',
				title: 'Keep vars, secrets, and `.env` separate',
				table: {
					headers: ['Layer', 'Use it for'],
					rows: [
						['`vars`', 'String config that compiles into generated Wrangler output.'],
						[
							'`secrets`',
							'Declaring which runtime secret bindings should exist. The schema accepts `{ required: false }`, but generated env typing still treats declared secrets as present either way today.'
						],
						['`.env`', 'Inputs used while evaluating `devflare.config.*` at config time.'],
						['`.env.example`', 'Documenting config-time variables for the team.']
					]
				},
				paragraphs: [
					'Devflare prefers a workspace-root `.env` when it finds a workspace ancestor; otherwise it falls back to the nearest ancestor `.env` before evaluating config. That is useful for config-time values, but it does not make `.dev.vars*` the source of truth for worker-only dev or tests.',
					'Stable infrastructure names belong in authored config. Do not hide them in secrets just because another tool happens to like environment variables.'
				]
			},
			{
				id: 'generated-output',
				title: 'Generated artifacts are outputs, not contracts',
				bullets: [
					'`.devflare/wrangler.jsonc`',
					'`.devflare/build/wrangler.jsonc`',
					'`.devflare/worker-entrypoints/main.ts` and `.js` when Devflare needs wrapper glue around the worker surfaces it discovered',
					'`.devflare/vite.config.mjs`',
					'`.wrangler/deploy/config.json`',
					'`env.d.ts`'
				],
				paragraphs: [
					'`wrangler.passthrough` is a shallow top-level override. Use it when Devflare does not model a Wrangler key yet, not as a place to mirror the whole generated config by habit.',
					'Devflare only generates `.devflare/worker-entrypoints/main.ts` when it needs to wrap or compose the worker surfaces it discovered. If `wrangler.passthrough.main` is set, or the fetch worker already lives at `assets.directory/_worker.js`, Devflare can skip that generated main entry and use the explicit worker instead.'
				],
				snippets: [
					{
						title: 'Use passthrough for unsupported Wrangler keys',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'advanced-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	wrangler: {
		passthrough: {
			placement: {
				mode: 'smart'
			}
		}
	}
})`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Passthrough is an explicit escape hatch',
						body: [
							'It wins on top-level key conflicts, so use it deliberately instead of turning it into a second config language.'
						]
					}
				]
			}
		]
	}
]
