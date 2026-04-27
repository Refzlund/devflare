import type { DocPage } from '../../types'
import {
	deployImpactActionCode,
	docsLink,
	githubFeedbackCommentCode,
	previewDeployActionCode,
	productionDeployActionCode,
	setupWorkspaceActionCode,
	thinPreviewDeployStepCode,
	workflowActionRef,
	workflowActionRepo,
	workflowActionSourceBase,
	workflowActionSourceLink,
	workflowActionUse,
	workflowLink,
	workflowRepoBase,
	workflowScriptBase,
	workflowScriptLink
} from './shared'

export const shipOperateDocsPart2: DocPage[] = [
	{
		slug: 'monorepo-turborepo',
		group: 'Ship & operate',
		navTitle: 'Monorepos & Turborepo',
		readTime: '6 min read',
		eyebrow: 'Monorepo',
		title: 'Turborepo validates the workspace, Devflare deploys the target package',
		summary:
			'Turbo owns task orchestration and caching. `devflare` still runs from the package that owns the Worker or app.',
		description:
			'Turbo at the root, `devflare.config.ts` local to each deployable package. Turbo decides what to build; deploy commands run in the package that owns the config.',
		highlights: [
			'Each deployable package keeps its own `devflare.config.ts` and package-level scripts.',
			'Turbo handles cached validation and targeted package work from the repo root.',
			'Deploy from the target package directory or set it as the Actions working directory.',
			'Same monorepo can mix same-worker previews and multi-worker preview families.'
		],
		facts: [
			{ label: 'Best for', value: 'Bun + Turborepo monorepos with multiple Devflare packages' },
			{ label: 'Turbo role', value: 'Validation, caching, filters, orchestration' },
			{ label: 'Deploy rule', value: 'Run `devflare` from the package that owns the config' }
		],
		sourcePages: [
			'README.md',
			'packages/devflare/src/cli/commands/deploy.ts',
			'packages/devflare/src/test/simple-context.ts'
		],
		sections: [
			{
				id: 'workspace-shape',
				title: 'Keep the workspace boundary clear',
				paragraphs: [
					'In a monorepo, Turbo and Devflare solve different problems. Turbo owns the workspace graph: cached builds, targeted checks, and “what changed?” filters. Devflare owns package-local Cloudflare behavior: config resolution, generated Wrangler output, preview logic, and production deploys.',
					'That means every deployable package should still keep its own `devflare.config.ts`, package scripts, and package-specific runtime assumptions. Turbo should orchestrate those packages, not erase their boundaries.'
				],
				bullets: [
					'Keep one `devflare.config.ts` per deployable package or worker family member.',
					'Use repo-root Turbo scripts for validation lanes and targeted build/check work.',
					'Use package-local `devflare` commands for actual build or deploy intent.',
					'Use GitHub workflow path filters or Turbo filters to decide whether a deploy job should run at all.'
				]
			},
			{
				id: 'roles',
				title: 'Know which layer owns what',
				table: {
					headers: ['Layer', 'Owns'],
					rows: [
						[
							'Turborepo',
							'Task graph, caching, filters, workspace validation lanes, and targeted build/check/test/type flows.'
						],
						[
							'Devflare',
							'Config resolution, type generation, worker bundling, preview deploys, production deploys, and preview lifecycle commands.'
						],
						[
							'GitHub Actions',
							'Triggers, permissions, branch/PR policy, feedback, and the working directory that selects the target package.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'Good default review question',
						body: [
							'Ask two separate questions: “Which packages should Turbo run?” and “Which package is actually deploying?” Conflating those is how monorepo deploy flows get muddy.'
						]
					}
				]
			},
			{
				id: 'root-lanes',
				title: 'Repo-root Turbo scripts for contributors and CI',
				paragraphs: [
					'The repo exposes root scripts for the core Devflare workflow so contributors and CI can validate without guessing at filters.',
					'These are validation and orchestration tools, not a replacement for package-local deploy commands.'
				],
				snippets: [
					{
						title: 'Root scripts keep Turbo orchestration separate from package deploys',
						description:
							'Use root scripts for workspace validation and keep each app package responsible for the Devflare command that resolves its own config.',
						activeFile: 'package.json',
						structure: [
							{ path: 'package.json' },
							{ path: 'turbo.json' },
							{ path: 'apps/documentation/package.json' }
						],
						files: [
							{
								path: 'package.json',
								language: 'json',
								code: String.raw`{
	"scripts": {
		"devflare:build": "turbo run build --filter=devflare --filter=documentation",
		"devflare:test": "turbo run test --filter=...devflare",
		"devflare:ci": "bun run devflare:build && bun run devflare:test"
	}
}`
							},
							{
								path: 'turbo.json',
								language: 'json',
								code: String.raw`{
	"tasks": {
		"build": {
			"dependsOn": ["^build"],
			"outputs": ["dist/**", ".svelte-kit/**"]
		},
		"test": {
			"dependsOn": ["build"]
		}
	}
}`
							},
							{
								path: 'apps/documentation/package.json',
								language: 'json',
								code: String.raw`{
	"scripts": {
		"deploy": "devflare deploy",
		"deploy:preview": "devflare deploy --preview docs-preview",
		"deploy:prod": "devflare deploy --prod"
	}
}`
							}
						]
					},
					{
						title: 'Repo-root validation lane',
						language: 'bash',
						code: String.raw`bun run devflare:build
bun run devflare:typecheck
bun run devflare:test
bun run devflare:types
bun run devflare:check
bun run devflare:ci`
					},
					{
						title: 'Targeted Turbo work from the repo root',
						language: 'bash',
						code: String.raw`bun run turbo build --filter=documentation
bun run turbo check --filter=documentation`
					}
				]
			},
			{
				id: 'deploy-one-package',
				title: 'Deploy from the package that owns the config',
				steps: [
					'Use Turbo or path-aware workflow logic to decide whether a package is affected.',
					'Optionally run Turbo build/check work for that package from the repo root.',
					'Run `devflare deploy ...` from the package directory that owns the `devflare.config.ts` you actually want to resolve.',
					'Keep preview-vs-production intent explicit in the final package-local deploy command.'
				],
				snippets: [
					{
						title: 'Documentation app from a monorepo',
						language: 'bash',
						code: String.raw`# optional repo-root validation
bun run turbo build --filter=documentation
bun run turbo check --filter=documentation

# actual deploy from the app package
cd apps/documentation
bun run deploy -- --preview feature-search
bun run deploy -- --prod`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Keep package selection explicit',
						body: [
							'If the deploy is for `apps/documentation`, make that obvious in the working directory or script name. The package boundary should be visible in logs and workflow steps.'
						]
					}
				]
			},
			{
				id: 'worker-families',
				title: 'Multi-worker previews deploy per-package',
				paragraphs: [
					'`apps/testing` shows the other half: Turbo orchestrates the workspace, but a branch-scoped preview family still deploys each worker separately with the same preview scope.',
					'The workflows keep `DEVFLARE_PREVIEW_BRANCH` consistent and run separate deploys for `auth-service`, `search-service`, and the main app.'
				],
				snippets: [
					{
						title: 'Branch-scoped worker family deployment',
						language: 'bash',
						code: String.raw`export DEVFLARE_PREVIEW_BRANCH='pr-123'
# PowerShell: $env:DEVFLARE_PREVIEW_BRANCH = 'pr-123'

cd apps/testing/workers/auth-service
bunx --bun devflare deploy --preview pr-123

cd ../search-service
bunx --bun devflare deploy --preview pr-123

cd ../../
bunx --bun devflare deploy --preview pr-123
bunx --bun devflare previews cleanup --scope pr-123 --apply`
					}
				]
			}
		]
	},
	{
		slug: 'preview-strategies',
		group: 'Ship & operate',
		navTitle: 'Preview strategies',
		readTime: '5 min read',
		eyebrow: 'Previews',
		title: 'Pick the preview model that matches the app',
		summary:
			'Same-worker uploads, named preview scopes, and branch-scoped worker families serve different needs.',
		description:
			'Pick the right preview model before writing CI around assumptions the platform will not honor.',
		highlights: [
			'Plain `--preview` keeps the same-worker upload flow.',
			'`--preview <name>` uses an explicit scope for resource naming and cleanup.',
			'Use plain `--preview` for same-worker uploads, `--preview <scope>` when the scope should be visible in logs and cleanup.',
			'Preview URLs are public unless protected, and have Cloudflare caveats.',
			'DO-heavy apps often need branch-scoped worker families.'
		],
		facts: [
			{ label: 'Best for', value: 'Choosing preview strategy before building CI' },
			{ label: 'Same-worker mode', value: 'Plain `--preview`' },
			{ label: 'Named scope mode', value: '`--preview <name>`' }
		],
		sourcePages: ['packages/devflare/src/cli/commands/deploy.ts', 'README.md'],
		sections: [
			{
				id: 'choose-model',
				title: 'More than one preview model',
				table: {
					headers: ['Preview style', 'Use it when'],
					rows: [
						[
							'Plain `--preview`',
							'You want a same-worker preview upload and the synthetic `preview` identifier is enough for any `preview.scope()` resource names.'
						],
						[
							'Named `--preview <name>`',
							'You need an explicit preview identifier for resource names or branch-scoped preview workers.'
						],
						[
							'Branch-scoped worker family',
							'The app is Durable Object-heavy or otherwise needs stronger isolation than same-worker preview uploads can provide.'
						]
					]
				},
				paragraphs: [
					'Both targets resolve `config.env.preview` and can materialize `preview.scope()` names. Bare `--preview` uses the synthetic `preview` identifier; `--preview <name>` swaps it for an explicit scope that pairs with branch-scoped preview workers.',
					'Plain `--preview` can still receive `--branch-name` or CI metadata for logs, but preview-scoped resource names use the synthetic identifier unless you pick an explicit scope.',
					'When you need stronger isolation or cleaner cleanup, prefer named scopes directly.'
				]
			},
			{
				id: 'cloudflare-caveats',
				title: 'Cloudflare caveats still matter',
				bullets: [
					'Preview URLs must be enabled for the worker or the returned links may not be usable.',
					'Preview URLs are public unless you protect them with Cloudflare Access or another layer.',
					'Plain `--preview` cannot be the first-ever upload path for a brand-new worker.',
					'Cloudflare does not currently generate preview URLs for workers that implement Durable Objects.',
					'`wrangler versions upload` does not currently apply Durable Object migrations.',
					'Same-worker preview uploads are also the wrong fit when branch isolation must cover cron or queue topology, not just the request path.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'DO-heavy apps need a different preview instinct',
						body: [
							'If previews must exercise real Durable Object behavior, use branch-scoped worker families and preview-scoped resources.'
						]
					}
				]
			},
			{
				id: 'preview-resources',
				title: 'Preview-scoped resources',
				paragraphs: [
					'Branch-scoped previews sometimes need their own KV, D1, R2, Queue, or Vectorize resources. `preview.scope()` keeps authored config stable while preview environments resolve preview-specific names.',
					'Outside preview, those markers resolve back to the base names. Inside preview, bare `--preview` materializes names like `my-cache-kv-preview`; `--preview next` materializes `my-cache-kv-next`.'
				],
				snippets: [
					{
						title: 'Preview-scoped resource naming',
						language: 'ts',
						code: String.raw`import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	bindings: {
		kv: {
			CACHE: pv('my-cache-kv')
		},
		r2: {
			ASSETS: pv('my-assets-bucket')
		}
	}
})`
					}
				]
			}
		]
	},
	{
		slug: 'preview-operations',
		group: 'Ship & operate',
		navTitle: 'Preview operations',
		readTime: '5 min read',
		eyebrow: 'Preview lifecycle',
		title: 'Inspect and clean up previews',
		summary:
			'The preview registry is D1-backed, giving Devflare durable records of scope and deployment state for reliable cleanup.',
		description:
			'Preview commands are the public surface for understanding what exists and tearing down preview-only resources.',
		highlights: [
			'`previews` gives the family or registry view; `bindings --scope <name>` inspects one resolved scope.',
			'Deploy flows keep preview metadata synchronized automatically.',
			'`cleanup` removes preview-owned resources and dedicated preview workers.',
			'Cleanup of branch-scoped workers can also remove preview-only service, DO, and route ownership.'
		],
		facts: [
			{ label: 'Best for', value: 'Preview lifecycle management' },
			{ label: 'Registry backing', value: 'D1 (`devflare-registry` by default)' },
			{
				label: 'Cleanup warning',
				value: 'Dedicated preview workers may own more than just the script'
			}
		],
		sourcePages: ['packages/devflare/src/cli/commands/deploy.ts', 'README.md'],
		sections: [
			{
				id: 'registry-role',
				title: 'Why the registry exists',
				paragraphs: [
					'Cloudflare discovery alone is not enough for clean preview lifecycle management. The D1-backed registry tracks scope and deployment records for reliable inspection and cleanup.',
					'Devflare creates and updates the registry as preview deploys happen, so `previews` and `cleanup` work from real state.'
				]
			},
			{
				id: 'useful-commands',
				title: 'Core commands',
				snippets: [
					{
						title: 'PR-close cleanup job for a named preview scope',
						description:
							'Turn the same cleanup command into reviewable automation so closed PR previews do not rely on memory.',
						filename: '.github/workflows/preview-cleanup.yml',
						language: 'yaml',
						code: String.raw`name: Preview cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx --bun devflare previews bindings --scope pr-${'${{ github.event.pull_request.number }}'}
      - run: bunx --bun devflare previews cleanup --scope pr-${'${{ github.event.pull_request.number }}'} --apply`
					},
					{
						title: 'Preview lifecycle commands',
						language: 'bash',
						code: String.raw`bunx --bun devflare previews
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews cleanup --scope next --apply
bunx --bun devflare previews cleanup --all --apply`
					}
				],
				bullets: [
					'`previews` — summary view of preview scopes.',
					'`bindings --scope <name>` — which workers reference one named scope.',
					'Prefer explicit scope selectors when you know the target; reserve broad cleanup for when the whole fleet needs attention.',
					'Without `--scope`, `cleanup` respects `DEVFLARE_PREVIEW_IDENTIFIER`, `DEVFLARE_PREVIEW_PR`, or `DEVFLARE_PREVIEW_BRANCH`, then falls back to the synthetic `preview` scope. Use `--all` for every discovered scope.'
				]
			},
			{
				id: 'cleanup-shape',
				title: 'Cleanup should be specific',
				bullets: [
					'Without `--apply`, cleanup runs as a dry run — showing what would be removed without touching anything.',
					'With `--apply`, it deletes preview-only resources and can delete dedicated preview worker scripts.',
					'Stable shared workers are not deleted; same-worker uploads only lose matching preview-scoped resources.',
					'Analytics Engine datasets and Browser Rendering bindings are reported as warnings. Hyperdrive cleanup only removes configs that already exist.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Good cleanup hygiene',
						body: [
							'Use the most specific selector you can. Cleanup is easier to trust when the target is obvious.'
						]
					},
					{
						tone: 'warning',
						title: 'Not every preview-looking thing is deletable',
						body: [
							'Browser Rendering has no account-scoped resource, Analytics Engine datasets are created on first write, and Hyperdrive cleanup can only remove existing preview configs. The command tells you.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'testing-and-automation',
		group: 'Ship & operate',
		navTitle: 'Testing & automation',
		readTime: '5 min read',
		eyebrow: 'Validation',
		title: 'Test the runtime shape you ship, keep automation thin',
		summary:
			'Local harness detail stays on the testing pages. This page covers what gets promoted into CI and how automation stays observable.',
		description:
			'The local harness pages own `createTestContext()` and binding nuance. This page owns which checks move into preview validation and release automation.',
		highlights: [
			'Use `testing-overview`, `create-test-context`, and binding guides as the local-testing references.',
			'Carry only the timing rules that matter in CI: `cf.worker.fetch()` does not drain all `waitUntil()` work; queue, scheduled, and tail helpers do.',
			'Promote a small number of runtime-shaped smoke checks into CI.',
			'Keep deploy execution and feedback separate.'
		],
		facts: [
			{ label: 'Best for', value: 'CI testing policy and preview validation' },
			{ label: 'Local harness owner', value: '`/docs/create-test-context` plus binding guides' },
			{ label: 'Important nuance', value: '`cf.worker.fetch()` is not a full `waitUntil()` drain' },
			{ label: 'Workflow companion', value: '`/docs/github-workflows`' }
		],
		sourcePages: ['packages/devflare/src/test/simple-context.ts', 'README.md'],
		sections: [
			{
				id: 'ownership',
				title: 'Let the local testing pages own local harness detail',
				paragraphs: [
					'This page used to repeat too much of the local harness story. The better split is simpler: keep `createTestContext()` behavior, autodiscovery, and binding-specific harness detail on the dedicated testing pages, then use this page for the question “what should actually run in automation?”',
					'That keeps local test design and CI policy from drifting into two slightly different copies of the same documentation.'
				],
				cards: [
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the map page first when you need to choose between starter tests, the harness page, binding-specific guides, runtime context, or CI-facing validation.'
					},
					{
						href: docsLink('create-test-context'),
						label: 'Testing',
						meta: 'Harness',
						title: 'createTestContext()',
						body: 'This is the canonical page for autodiscovery, helper timing, transport-aware round-trips, and the real `cf.*` helper behavior.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Open these when the binding changes the honest testing posture and the local harness rules are no longer one-size-fits-all.'
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Cleaner split keeps both pages better',
						body: [
							'Harness pages own local helper behavior. This page owns what gets promoted and how automation stays readable.'
						]
					}
				]
			},
			{
				id: 'automation-timing',
				title: 'Timing rules that matter in CI',
				paragraphs: [
					'Automation does not need the full harness manual, but it needs the timing rules that produce flaky checks or false confidence.',
					'Promote the check that matches the behavior you need to trust.'
				],
				table: {
					headers: ['When the check depends on...', 'Prefer', 'Why'],
					rows: [
						[
							'`waitUntil()` side effects from an HTTP handler',
							'Assert the side effect directly or move to a higher-fidelity check.',
							'`cf.worker.fetch()` returns when the handler resolves, not when every background task drains.'
						],
						[
							'Queue, scheduled, or tail background work',
							'`cf.queue.trigger()`, `cf.scheduled.trigger()`, or `cf.tail.trigger()`',
							'Those helpers wait for their background work before they return, so they are a better fit for async side-effect assertions.'
						],
						[
							'Binding-specific or transport-specific behavior',
							'The binding guide or `create-test-context` page first',
							'Different bindings and bridge-backed values have different honest harness rules, and the local testing pages already own those details.'
						]
					]
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Wrong completion contract = flaky CI',
						body: [
							'If a test depends on `waitUntil()` effects being complete, a plain `cf.worker.fetch()` assertion may be too early.'
						]
					}
				]
			},
			{
				id: 'promotion-path',
				title: 'Promote the smallest useful checks',
				steps: [
					'Prove the behavior locally with `createTestContext()` or the binding-specific guide first.',
					'Choose one or two runtime-shaped smoke checks worth rerunning in CI because they protect the deploy boundary.',
					'Use preview validation when routing, preview-owned resources, or branch-scoped behavior is the real risk instead of trying to force every concern through one unit-style check.',
					'Publish one visible summary or feedback artifact so reviewers can tell what passed without spelunking through raw logs.'
				],
				cards: [
					{
						href: docsLink('preview-operations'),
						label: 'Ship & operate',
						meta: 'Preview lifecycle',
						title: 'Preview operations',
						body: 'Use the preview page when a runtime check depends on preview-scoped resources, scope inspection, or cleanup behavior.'
					},
					{
						href: docsLink('production-deploys'),
						label: 'Ship & operate',
						meta: 'Deploy targets',
						title: 'Production deploys',
						body: 'Use the production page when the check is really about the deploy target, compiled output, or preflight inspection before release.'
					},
					{
						href: docsLink('github-workflows'),
						label: 'Ship & operate',
						meta: 'CI/CD',
						title: 'GitHub workflows',
						body: 'Use the workflow page when those promoted checks need to become reviewable Actions jobs with explicit triggers, permissions, and feedback.'
					}
				]
			},
			{
				id: 'automation-shape',
				title: 'Automation stays thin and observable',
				paragraphs: [
					'Deploy logic and GitHub feedback are separate. Cloudflare state changes stay independent from PR comments, deployment records, or other reporting.',
					'Caller workflows own branch naming, permissions, and feedback decisions. Reusable actions focus on one deploy or one reporting job.'
				],
				bullets: [
					'One package, one target, one visible result per workflow lane.',
					'Split deploy from feedback so reporting can fail or retry independently.',
					'Prefer summaries, PR comments, or deployment records over raw logs.'
				],
				snippets: [
					{
						title: 'Thin preview deploy step',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: thinPreviewDeployStepCode
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Thin workflows age better',
						body: [
							'When a release is stressful, a small workflow that says what it deploys and what it reports is easier to trust.'
						]
					}
				],
				cards: [
					{
						href: docsLink('github-workflows'),
						label: 'Ship & operate',
						meta: 'CI/CD',
						title: 'GitHub workflows',
						body: 'The workflow page owns the supported GitHub Actions patterns for impact checks, reusable actions, preview lanes, production lanes, PR feedback, and cleanup.'
					}
				]
			}
		]
	}
]
