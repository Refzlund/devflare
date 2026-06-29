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

export const examplesDocsPart2: DocPage[] = [
	{
		slug: 'runtime-handler-styles',
		group: 'Devflare',
		navTitle: 'Handler styles',
		readTime: '6 min read',
		eyebrow: 'Runtime',
		title: 'Use event-first handlers by default and mark ambiguous handler styles explicitly',
		summary:
			'Devflare runtime supports event-first handlers, request-wide `sequence()` middleware, route method handlers, and explicit markers for ambiguous two-argument worker-style or resolve-style functions.',
		description:
			'This page documents `defineFetchHandler`, `sequence`, `markResolveStyle`, `markWorkerStyle`, event-first handlers, and route dispatch with examples that match the actual `devflare/runtime` exports.',
		highlights: [
			'Event-first handlers are the least ambiguous shape.',
			'Use `sequence()` for request-wide middleware.',
			'Use route files for method-specific leaves.',
			'Wrap two-argument handlers with `defineFetchHandler(..., { style })` or a marker.'
		],
		facts: [
			{ label: 'Best for', value: 'Runtime import and dispatch questions' },
			{ label: 'Worker-safe import', value: '`devflare/runtime`' },
			{ label: 'Ambiguous case', value: 'Two-argument fetch handlers' }
		],
		sourcePages: [
			'packages/devflare/src/runtime/middleware.ts',
			'packages/devflare/src/runtime/router/index.ts'
		],
		sections: [
			{
				id: 'copyable-styles',
				title: 'Copy the handler style that matches the job',
				snippets: [
					{
						title: 'Event-first and route-dispatch examples',
						activeFile: 'src/fetch.ts',
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								code: String.raw`import { defineFetchHandler, sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()
	return resolve(event)
}

export const handle = sequence(requestId)

export const fetch = defineFetchHandler(
	(request: Request, env: DevflareEnv) => env.ASSETS.fetch(request),
	{ style: 'worker' }
)`
							},
							{
								path: 'src/routes/health.ts',
								language: 'ts',
								code: String.raw`export function GET(): Response {
	return Response.json({ ok: true })
}

export function POST(): Response {
	return new Response(null, { status: 204 })
}`
							},
							{
								path: 'src/legacy.ts',
								language: 'ts',
								code: String.raw`import { markResolveStyle, markWorkerStyle } from 'devflare/runtime'

export const resolveStyle = markResolveStyle(async (event, resolve) => {
	return resolve(event)
})

export const workerStyle = markWorkerStyle((request, env) => {
	return env.ASSETS.fetch(request)
})`
							}
						]
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'The ambiguous error is intentional',
						body: [
							'If a two-argument handler is not marked, Devflare cannot safely know whether it is `(event, resolve)` or `(request, env)`. Mark it instead of relying on parameter names.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'test-helper-reference',
		group: 'Devflare',
		navTitle: 'Test helper reference',
		readTime: '8 min read',
		eyebrow: 'Testing',
		title: 'Document every public `devflare/test` helper by the smallest useful use',
		summary:
			'Use this reference when you know you need the test package but not which helper surface is the smallest truthful proof.',
		description:
			'The `devflare/test` entrypoint intentionally has multiple lanes: runtime-shaped tests, direct event helpers, pure mocks, offline envs, remote-boundary guards, and Docker/Podman-gated container helpers.',
		highlights: [
			'`createTestContext`, `cf`, and `env.dispose` are the default worker-shaped lane.',
			'Pure mocks are for small units where runtime dispatch is not the question.',
			'Remote and container helpers must be skip-gated.',
			'Internal/advanced helpers are marked as such instead of being hidden in prose.'
		],
		facts: [
			{ label: 'Best for', value: 'Choosing and importing test helpers' },
			{
				label: 'Default import',
				value: '`import { cf, createTestContext, env } from "devflare/test"`'
			},
			{ label: 'Cleanup', value: '`afterAll(() => env.dispose())`' }
		],
		sourcePages: [
			'packages/devflare/src/test/index.ts',
			'packages/devflare/src/test/cf.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts',
			'packages/devflare/src/test/containers.ts'
		],
		sections: [
			{
				id: 'helper-table',
				title: 'Helper map',
				table: {
					headers: ['Export family', 'Smallest use', 'Status'],
					rows: [
						[
							'`createTestContext`, `env`, `cf`',
							'Runtime-shaped Worker tests with cleanup.',
							'Recommended'
						],
						[
							'`cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, `cf.tail`',
							'Trigger the matching Worker surface directly.',
							'Recommended'
						],
						[
							'`worker`, `queue`, `scheduled`, `email`, `tail`',
							'Direct helper modules behind the unified `cf` API.',
							'Advanced'
						],
						[
							'`createOfflineEnv`, `createOfflineBindings`, `describeOfflineSupport`, `getOfflineSupportMatrix`',
							'Pure config-derived binding fixtures without runtime startup.',
							'Recommended for offline-first unit tests'
						],
						[
							'`createMockKV`, `createMockD1`, `createMockR2`, `createMockQueue`, `createMockEnv`',
							'Small pure unit tests without Miniflare.',
							'Recommended when runtime dispatch is irrelevant'
						],
						[
							'`createMockRateLimit`, `createMockVersionMetadata`, `createMockWorkerLoader`, `createMockSecretsStoreSecret`',
							'Pure fixture for one platform-shaped binding.',
							'Recommended'
						],
						[
							'`createMockMTLSCertificate`, `createMockDispatchNamespace`, `createMockWorkflow`, `createMockPipeline`',
							'Call-shape tests for platform-owned products.',
							'Boundary-aware'
						],
						[
							'`createMockImagesBinding`, `createMockMediaBinding`, `createMockArtifacts`, AI Search mocks',
							'Deterministic local tests for product-shaped APIs.',
							'Boundary-aware'
						],
						[
							'`shouldSkip`',
							'Skip remote, paid, or dependency-heavy checks clearly.',
							'Recommended for CI'
						],
						[
							'`containers`, `createContainerManager`, `detectContainerEngine`, `getContainerSkipReason`, `stopActiveContainers`',
							'Docker/Podman-gated local container tests.',
							'Integration lane'
						],
						[
							'`resolveServiceBindings`, `resolveDOBindings`, `clearBundleCache`',
							'Service-binding and cross-worker DO resolution internals.',
							'Advanced/internal'
						]
					]
				}
			},
			{
				id: 'exact-export-index',
				title: 'Exact value export index',
				table: {
					headers: ['Export', 'Use'],
					rows: [
						['`createTestContext`', 'Boot the nearest Devflare config in the test harness.'],
						['`env`', 'Read bindings and call `env.dispose()` in harness tests.'],
						['`cf`', 'Unified Worker, queue, scheduled, email, and tail trigger API.'],
						['`worker`', 'Direct Worker fetch helper behind `cf.worker`.'],
						['`queue`', 'Direct queue helper behind `cf.queue`.'],
						['`scheduled`', 'Direct scheduled helper behind `cf.scheduled`.'],
						['`email`', 'Direct email helper behind `cf.email`.'],
						['`tail`', 'Direct tail helper behind `cf.tail`.'],
						[
							'`shouldSkip`',
							'Skip Cloudflare-auth, paid, remote, or local engine tests explicitly.'
						],
						['`containers`', 'Default Docker/Podman-backed container manager.'],
						['`createContainerManager`', 'Create an isolated container manager for tests.'],
						['`detectContainerEngine`', 'Check whether Docker or Podman can run.'],
						['`getContainerSkipReason`', 'Explain why a container test should skip.'],
						['`stopActiveContainers`', 'Stop containers after tests finish.'],
						['`createOfflineBindings`', 'Build pure binding fixtures from config.'],
						['`createOfflineEnv`', 'Build an env object for offline-first unit tests.'],
						['`describeOfflineSupport`', 'Read one binding family support stance.'],
						['`getOfflineSupportMatrix`', 'Read the full offline support stance map.'],
						['`createMockAISearchInstance`', 'Mock one AI Search instance.'],
						['`createMockAISearchNamespace`', 'Mock an AI Search namespace.'],
						['`createMockTestContext`', 'Pure test context helper for small units.'],
						['`withTestContext`', 'Scope a pure context to one callback.'],
						['`createMockKV`', 'Mock KV for pure units.'],
						['`createMockD1`', 'Mock D1 for pure units.'],
						['`createMockR2`', 'Mock R2 for pure units.'],
						['`createMockQueue`', 'Mock a Queue producer.'],
						['`createMockRateLimit`', 'Mock Rate Limiting.'],
						['`createMockVersionMetadata`', 'Mock Version Metadata.'],
						['`createMockWorkerLoader`', 'Mock Worker Loaders.'],
						['`createMockMTLSCertificate`', 'Mock an mTLS fetcher.'],
						['`createMockDispatchNamespace`', 'Mock a dispatch namespace.'],
						['`createMockWorkflow`', 'Mock a Workflow binding.'],
						['`createMockPipeline`', 'Mock a Pipelines binding.'],
						['`createMockImagesBinding`', 'Mock Images chains.'],
						['`createMockMediaBinding`', 'Mock Media Transformation chains.'],
						['`createMockStreamBinding`', 'Mock a Stream binding.'],
						['`createMockFlagshipBinding`', 'Mock a Flagship feature-flag binding.'],
						['`createMockArtifacts`', 'Mock Artifacts repo APIs.'],
						['`createMockSecretsStoreSecret`', 'Mock a Secrets Store secret.'],
						['`createMockEnv`', 'Create a pure env with selected mock bindings.'],
						['`hasServiceBindings`', 'Advanced/internal service-binding resolution predicate.'],
						['`resolveServiceBindings`', 'Advanced/internal service-binding resolution.'],
						['`hasCrossWorkerDOs`', 'Advanced/internal cross-worker Durable Object predicate.'],
						['`resolveDOBindings`', 'Advanced/internal Durable Object binding resolution.'],
						['`clearBundleCache`', 'Advanced/internal resolver cache reset for tests.']
					]
				}
			},
			{
				id: 'copyable-helper',
				title: 'Copy the default helper shape',
				snippets: [
					{
						title: 'Worker, event, offline, and boundary tests',
						activeFile: 'tests/worker.test.ts',
						files: offlineRecipeFiles
					}
				]
			},
			{
				id: 'failure-messages',
				title: 'Expected failure and skip behavior',
				table: {
					headers: ['Failure or skip', 'Meaning', 'Fix'],
					rows: [
						[
							'`No devflare config found`',
							'`createTestContext()` could not discover a supported config from the test file.',
							'Pass the config path or move the test under the package root.'
						],
						[
							'`env.dispose is not a function`',
							'The test imported the runtime env proxy instead of the test env.',
							'Use `import { env } from "devflare/test"` in tests.'
						],
						[
							'`shouldSkip.ai` is true',
							'Cloudflare auth or remote AI prerequisites are missing.',
							'Keep the test skipped in local/CI, or enable remote mode in a dedicated lane.'
						],
						[
							'`shouldSkip.containers` is true',
							'Docker/Podman is missing or not usable in this runner.',
							'Install an engine or keep container tests in an optional integration job.'
						]
					]
				}
			}
		]
	},
	{
		slug: 'deploy-command-recipes',
		group: 'Ship & operate',
		navTitle: 'Deploy recipes',
		readTime: '7 min read',
		eyebrow: 'Deploy',
		title: 'Run deploy commands as explicit recipes with expected files and effects',
		summary:
			'Use build, dry-run, production deploy, named preview deploy, same-worker preview upload, cleanup, and GitHub Actions as separate recipes with visible effects.',
		description:
			'Deploy docs should start from commands a developer can copy and the artifacts or remote effects they should expect, then move caveats into boundary notes after the working recipe.',
		highlights: [
			'`build` writes local artifacts and does not deploy.',
			'`deploy --prod` is production; `deploy --preview <name>` is a named preview scope.',
			'Plain `--preview` and named `--preview <name>` are different preview strategies.',
			'GitHub workflows should be minimal first and policy-heavy later.'
		],
		facts: [
			{ label: 'Best for', value: 'Shipping without guessing target or cleanup behavior' },
			{ label: 'Local artifacts', value: '`.devflare/**` and `.wrangler/deploy/**`' },
			{
				label: 'Remote effects',
				value: 'Only deploy commands with explicit targets touch Cloudflare'
			}
		],
		sourcePages: [
			'packages/devflare/src/cli/commands/deploy.ts',
			'.github/workflows/preview.yml',
			'.github/actions/devflare-deploy/action.yml'
		],
		sections: [
			{
				id: 'commands',
				title: 'Command recipes',
				table: {
					headers: ['Task', 'Command', 'Expected result'],
					rows: [
						[
							'Build local artifacts',
							'`bunx --bun devflare build --env production`',
							'Writes deploy-ready generated output; does not touch Cloudflare.'
						],
						[
							'Inspect compiled config',
							'`bunx --bun devflare config print --format wrangler`',
							'Prints Wrangler-facing config for review.'
						],
						[
							'Dry-run production deploy',
							'`bunx --bun devflare deploy --prod --dry-run`',
							'Exercises deploy planning without uploading.'
						],
						[
							'Production deploy',
							'`bunx --bun devflare deploy --prod`',
							'Uploads to the stable production Worker name.'
						],
						[
							'Same-worker preview upload',
							'`bunx --bun devflare deploy --preview`',
							'Uses Cloudflare same-worker preview behavior and synthetic preview scope.'
						],
						[
							'Named preview scope',
							'`bunx --bun devflare deploy --preview pr-123`',
							'Uses explicit preview scope for resource naming, logs, and cleanup.'
						],
						[
							'Inspect preview bindings',
							'`bunx --bun devflare previews bindings --scope pr-123`',
							'Shows resolved preview resources and worker references.'
						],
						[
							'Clean preview resources',
							'`bunx --bun devflare previews cleanup --scope pr-123 --apply`',
							'Deletes preview-owned resources and dedicated preview workers when applicable.'
						]
					]
				}
			},
			{
				id: 'preview-models',
				title: 'Same-worker preview vs named preview scope',
				table: {
					headers: ['Model', 'Use when', 'Tiny example'],
					rows: [
						[
							'Same-worker preview',
							'You want Cloudflare preview upload behavior and do not need a human-named resource scope.',
							'`devflare deploy --preview`'
						],
						[
							'Named preview scope',
							'You want logs, resource names, cleanup, and GitHub feedback tied to a visible name.',
							'`devflare deploy --preview pr-123`'
						],
						[
							'Branch-scoped worker family',
							'Durable Objects, queues, crons, or service topology need stronger isolation.',
							'`preview.scope()` plus dedicated preview worker naming'
						]
					]
				}
			},
			{
				id: 'lifecycle',
				title: 'Preview resource lifecycle by feature',
				table: {
					headers: ['Feature', 'Lifecycle stance'],
					rows: [
						[
							'KV, D1, R2, Queues, Vectorize',
							'Can be preview-scoped and managed when authored with preview-aware names.'
						],
						[
							'Services and Durable Objects',
							'Worker naming and migrations require explicit preview strategy; cleanup can remove preview-only workers.'
						],
						[
							'Analytics Engine and Browser Rendering',
							'Reported as warnings because there is no ordinary account resource to delete.'
						],
						[
							'Hyperdrive',
							'Cleanup can remove existing preview configs, but database ownership stays product-owned.'
						],
						[
							'AI, Images, Media, Containers',
							'Product-owned remote behavior; use smoke tests and usage limits rather than pretending local cleanup owns the product.'
						]
					]
				}
			},
			{
				id: 'github',
				title: 'Minimal GitHub Actions preview workflow',
				snippets: [
					{
						title: 'Preview workflow',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: previewRecipeFiles[1].code
					}
				]
			}
		]
	},
	{
		slug: 'docs-release-gates',
		group: 'Ship & operate',
		navTitle: 'Docs release gates',
		readTime: '6 min read',
		eyebrow: 'Verification',
		title: 'Make documentation changes part of public API changes',
		summary:
			'Public exports, schema keys, compiler output, typegen, CLI commands, test helpers, and support stances should fail CI when the docs do not change with them.',
		description:
			'This is the maintainer checklist for keeping the docs from becoming a prose archive again. The tests cover drift; the manual QA checklist covers developer paths a test cannot fully feel.',
		highlights: [
			'Docs integrity tests parse snippets and check API, schema, CLI, cases, source metadata, feature matrix, and generated `LLM.md` drift.',
			'Package publish should regenerate `packages/devflare/LLM.md` from the docs model.',
			'Manual QA follows five paths: new user, binding, test, deploy, and remote boundary.',
			'The checklist is intentionally short so it is used.'
		],
		facts: [
			{ label: 'Best for', value: 'Release and review checklists' },
			{ label: 'Main command', value: '`bun run devflare:docs-integrity`' },
			{ label: 'Generated file', value: '`packages/devflare/LLM.md` must match the docs model' }
		],
		sourcePages: [
			'packages/devflare/tests/unit/docs/documentation-integrity.test.ts',
			'packages/devflare/scripts/generate-llm.ts',
			'apps/documentation/src/lib/docs/llm.ts'
		],
		sections: [
			{
				id: 'docs-must-change',
				title: 'Docs must change when these public surfaces change',
				table: {
					headers: ['Changed surface', 'Docs or test that must move'],
					rows: [
						['Public exports', 'Package entrypoint table and export drift test.'],
						[
							'Config schema keys or binding compiler output',
							'Binding guide manifest and schema coverage test.'
						],
						['Typegen output', 'Generated types docs and first binding examples.'],
						['CLI commands or help pages', 'CLI docs and command table drift test.'],
						['`devflare/test` helpers', '`test-helper-reference` and helper coverage checks.'],
						[
							'Cloudflare support stance',
							'`feature-index`, binding pages, and support matrix snapshot.'
						],
						[
							'Docs content model',
							'Regenerate `packages/devflare/LLM.md` and pass generated handbook drift check.'
						]
					]
				}
			},
			{
				id: 'manual-qa',
				title: 'Final manual QA checklist',
				snippets: [
					{
						title: 'Wire the docs gate into a CI job',
						filename: '.github/workflows/docs.yml',
						language: 'yaml',
						code: String.raw`name: docs

on:
  pull_request:

jobs:
  verify-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run --cwd apps/documentation check
      - run: bun run devflare:docs-integrity`
					}
				],
				bullets: [
					'New user path: `first-worker` -> `first-unit-test` -> `first-route-tree` works as a narrative.',
					'Binding path: `first-bindings` -> one binding page -> matching testing guide.',
					'Test path: `test-helper-reference` names the smallest helper and cleanup pattern.',
					'Deploy path: `deploy-command-recipes` distinguishes build, dry-run, prod, preview, and cleanup.',
					'Remote-boundary path: `feature-index` and binding pages make auth, Docker/Podman, paid services, and skips explicit.'
				]
			}
		]
	},
	{
		slug: 'bridge-architecture-internals',
		group: 'Devflare',
		navTitle: 'Bridge internals',
		sidebarHidden: true,
		readTime: '3 min read',
		eyebrow: 'Internal architecture',
		title: 'Keep bridge architecture documentation behind advanced/internal links',
		summary:
			'The bridge architecture document remains valuable, but it should not be on the first-hour developer path.',
		description:
			'Link the bridge architecture doc only from advanced runtime, transport, or maintainer pages. Beginner docs should show recipes first and link internals after the developer already has a working example.',
		highlights: [
			'The architecture doc stays preserved.',
			'Internal transport details are linked from advanced docs only.',
			'Beginner pages should not require bridge knowledge before the first route, binding, or test works.'
		],
		facts: [
			{ label: 'Canonical file', value: '`packages/devflare/.docs/BRIDGE_ARCHITECTURE.md`' },
			{ label: 'Audience', value: 'Maintainers and advanced runtime debugging' },
			{ label: 'Linked from', value: 'Transport and project architecture docs' }
		],
		sourcePages: ['packages/devflare/.docs/BRIDGE_ARCHITECTURE.md'],
		sections: [
			{
				id: 'when-to-read',
				title: 'Read this after the recipe path works',
				snippets: [
					{
						title: 'A bridge-backed value that needs a transport file',
						activeFile: 'src/transport.ts',
						files: [
							{
								path: 'src/domain/Money.ts',
								language: 'ts',
								code: String.raw`export class Money {
	constructor(
		readonly amount: number,
		readonly currency: string
	) {}

	format(): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: this.currency
		}).format(this.amount)
	}
}`
							},
							{
								path: 'src/transport.ts',
								language: 'ts',
								code: String.raw`import { Money } from './domain/Money'

export const transport = {
	Money: {
		encode: (value: unknown) =>
			value instanceof Money
				? { amount: value.amount, currency: value.currency }
				: false,
		decode: (value: { amount: number; currency: string }) =>
			new Money(value.amount, value.currency)
	}
}`
							},
							{
								path: 'src/do/invoices.ts',
								language: 'ts',
								code: String.raw`import { Money } from '../domain/Money'

export class Invoices extends DurableObject {
	async total(customerId: string): Promise<Money> {
		const key = 'invoice:' + customerId + ':total'
		const stored = await this.ctx.storage.get<number>(key)
		return new Money(stored ?? 0, 'USD')
	}
}`
							}
						]
					}
				],
				bullets: [
					'You are debugging the bridge transport or local runtime startup.',
					'You are changing how local RPC, Durable Objects, service bindings, or framework platform glue cross the worker boundary.',
					'You need maintainer context, not first-run setup instructions.'
				]
			}
		]
	}
]
