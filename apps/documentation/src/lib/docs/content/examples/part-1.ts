import type { DocPage } from '../../types'
import { featureRows, workerOnlyRecipeFiles } from './shared'

export const examplesDocsPart1: DocPage[] = [
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
		slug: 'feature-index',
		group: 'Guides',
		navTitle: 'Feature index',
		readTime: '6 min read',
		eyebrow: 'Support matrix',
		title: 'Scan local, remote, test, preview, and docs support in one table',
		summary:
			'This page is the compact feature support index that keeps support level, Cloudflare boundary, test helper, preview lifecycle, and docs links in one place.',
		description:
			'Use the feature index when you already know the feature name and need to decide whether the next proof belongs in pure unit tests, `createTestContext`, a Docker/Podman lane, or a Cloudflare-authenticated remote lane.',
		highlights: [
			'Support is reduced to `Full` or `Remote` so the boundary is easy to scan.',
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
					layout: 'wide',
					headers: [
						'Feature',
						'Support',
						'Cloudflare boundary',
						'Test helper',
						'Preview lifecycle',
						'Docs'
					],
					rows: featureRows
				}
			}
		]
	}
]
