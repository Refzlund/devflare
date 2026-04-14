import type { DocCodeTreeEntry, DocPage } from '../types'

const workflowRepoBase = 'https://github.com/Refzlund/devflare/blob/next/.github/workflows'

const workflowLink = (file: string): string => `${workflowRepoBase}/${file}`
const docsLink = (slug: string): string => `/docs/${slug}`

const workflowDirectoryStructure: DocCodeTreeEntry[] = [
	{ path: '.github', kind: 'folder' },
	{ path: '.github/workflows', kind: 'folder' },
	{ path: '.github/workflows/workspace-ci.yml' },
	{ path: '.github/workflows/documentation-preview-pr.yml' },
	{ path: '.github/workflows/documentation-preview-branch.yml' },
	{ path: '.github/workflows/documentation-preview-branch-cleanup.yml' },
	{ path: '.github/workflows/documentation-production.yml' },
	{ path: '.github/workflows/testing-preview-pr.yml' },
	{ path: '.github/workflows/testing-preview-branch.yml' },
	{ path: '.github/workflows/testing-preview-branch-cleanup.yml' }
]

const documentationWorkflowStructure: DocCodeTreeEntry[] = [
	{ path: '.github', kind: 'folder' },
	{ path: '.github/workflows', kind: 'folder' },
	{ path: '.github/workflows/documentation-preview-pr.yml' },
	{ path: '.github/workflows/documentation-preview-branch.yml' },
	{ path: '.github/workflows/documentation-preview-branch-cleanup.yml' },
	{ path: '.github/workflows/documentation-production.yml' }
]

const testingWorkflowStructure: DocCodeTreeEntry[] = [
	{ path: '.github', kind: 'folder' },
	{ path: '.github/workflows', kind: 'folder' },
	{ path: '.github/workflows/testing-preview-pr.yml' },
	{ path: '.github/workflows/testing-preview-branch.yml' },
	{ path: '.github/workflows/testing-preview-branch-cleanup.yml' }
]

export const shipOperateDocs: DocPage[] = [
	{
		slug: 'github-workflows',
		group: 'Ship & operate',
		navTitle: 'GitHub workflows',
		readTime: '5 min read',
		eyebrow: 'CI/CD',
		title: 'Use GitHub workflows as thin orchestration around explicit Devflare deploy and validation actions',
		summary:
			'This repository keeps GitHub workflows small on purpose: caller workflows own triggers, permissions, and package selection, while shared Devflare actions handle impact checks, deploy execution, and feedback publishing.',
		description:
			'The CI/CD pattern in this repo is intentionally boring in the best way. One workflow validates the workspace, preview workflows decide whether a package is affected before they deploy, production workflows verify what went live, and shared actions keep the mechanics consistent across packages.',
		highlights: [
			'`workspace-ci.yml` is the cached validation lane for the monorepo, not a hidden deploy path.',
			'Caller workflows decide triggers, permissions, ref selection, and the package working directory.',
			'`devflare-deploy-impact` determines whether a target package should deploy before the workflow spends Cloudflare effort.',
			'`devflare-deploy` and `devflare-github-feedback` keep deploy execution and reporting reusable instead of duplicating command glue in every workflow.'
		],
		facts: [
			{ label: 'Best for', value: 'GitHub Actions workflows that validate packages and run explicit preview or production deploys' },
			{ label: 'Core split', value: 'Caller workflow owns policy; shared actions own mechanics' },
			{ label: 'Package selector', value: '`working-directory` chooses which Devflare config actually deploys' }
		],
		sourcePages: [
			'.github/workflows/workspace-ci.yml',
			'.github/workflows/documentation-preview-pr.yml',
			'.github/workflows/documentation-preview-branch.yml',
			'.github/workflows/documentation-preview-branch-cleanup.yml',
			'.github/workflows/documentation-production.yml',
			'.github/workflows/testing-preview-pr.yml',
			'.github/workflows/testing-preview-branch.yml',
			'.github/workflows/testing-preview-branch-cleanup.yml',
			'.github/actions/devflare-deploy-impact/action.yml',
			'.github/actions/devflare-deploy/action.yml',
			'.github/actions/devflare-github-feedback/action.yml'
		],
		sections: [
			{
				id: 'workflow-shape',
				title: 'Keep GitHub workflows thin and let the actions do the repeatable work',
				paragraphs: [
					'The repo uses GitHub Actions as orchestration, not as a second deploy framework. The workflow file decides when the job runs, which permissions it gets, and which package it is targeting. The reusable actions then handle impact calculation, dependency installation, deploy execution, and GitHub feedback in a consistent way.',
					'That split matters because it keeps policy visible in the workflow while the mechanics stay reusable. A docs preview, a testing preview family, and a production deploy can share the same action vocabulary without pretending they are the same deployment shape.'
				],
				bullets: [
					'Use workflow triggers and path filters to decide whether a lane should even run.',
					'Use `working-directory` to make the target package visible in the workflow itself.',
					'Keep preview versus production intent explicit instead of hiding it inside a generic shell script.',
					'Use workflow summaries and feedback actions so the result is observable without re-reading raw logs every time.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'A good workflow review question',
						body: [
							'Ask three things separately: what triggered this workflow, which package is it acting on, and which explicit deploy target will the action use?'
						]
					}
				]
			},
			{
				id: 'workspace-validation',
				title: 'Use one workspace CI lane for cached validation, not for hidden deploy logic',
				paragraphs: [
					'`workspace-ci.yml` is the repo-wide validation lane. It reacts to workspace-level changes, restores Bun and Turborepo caches, installs dependencies once, and runs the cached `devflare:ci` lane from the repo root.',
					'That workflow proves the workspace still builds, checks, and tests coherently. It does not choose a Cloudflare target or quietly deploy anything on your behalf.'
				],
				cards: [
					{
						title: 'workspace-ci.yml',
						body: 'Repo-wide cached validation for apps, cases, and packages before any package-specific deploy lane runs.',
						href: workflowLink('workspace-ci.yml')
					}
				],
				snippets: [
					{
						title: 'Workspace CI stays in the validation lane',
						description:
							'The active file is the real repo workflow under `.github/workflows/workspace-ci.yml`, and the surrounding tree shows the workflow family this page references.',
						activeFile: '.github/workflows/workspace-ci.yml',
						structure: workflowDirectoryStructure,
						files: [
							{
								path: '.github/workflows/workspace-ci.yml',
								language: 'yaml',
								code: String.raw`name: Workspace CI

on:
	pull_request:
		paths:
			- 'apps/documentation/**'
			- 'cases/**'
			- 'packages/**'
	push:
		branches:
			- main
			- next
	workflow_dispatch:

jobs:
	validate:
		steps:
			- uses: actions/checkout@v5
			- uses: oven-sh/setup-bun@v2
			- shell: bash
			  run: bun run devflare:ci`
							}
						]
					}
				]
			},
			{
				id: 'impact-and-deploy',
				title: 'Preview and production workflows should resolve impact before they deploy',
				paragraphs: [
					'The repository preview and production workflows call `devflare-deploy-impact` before they deploy. That action compares the target package against the relevant git range so the workflow can skip Cloudflare work when the package or its important dependencies did not change, and it also accepts `extra-paths` when shared files outside the package root should still invalidate the deploy.',
					'When a deploy is needed, the workflow hands the package path and explicit target to `devflare-deploy`. That action enforces the deploy target rules, installs dependencies from the right place, runs the deploy command, captures preview aliases or version ids, and publishes a structured summary for the workflow run.',
					'The reusable action metadata in this repo still exposes a `preview-alias` input for same-worker preview uploads, and the live documentation PR workflow below still threads that deprecated input through the deploy action. Treat that as current repo drift rather than a recommended pattern: `devflare deploy` itself no longer accepts `--preview-alias`, so new workflows should prefer `branch-name` for same-worker uploads or `preview-scope` for named preview deploys until the shared action and caller workflows are cleaned up.',
					'The documentation workflow family is the clearest repo-local example to study because PR previews, branch previews, production deploys, and branch cleanup all live as separate `.github/workflows/*.yml` files.'
				],
				cards: [
					{
						title: 'documentation-preview-pr.yml',
						body: 'PR-scoped docs preview with a stable PR comment that gets updated in place.',
						href: workflowLink('documentation-preview-pr.yml')
					},
					{
						title: 'documentation-preview-branch.yml',
						body: 'Branch push preview for the docs app when there is no PR requirement.',
						href: workflowLink('documentation-preview-branch.yml')
					},
					{
						title: 'documentation-production.yml',
						body: 'Explicit docs production deploy lane with live verification after deploy.',
						href: workflowLink('documentation-production.yml')
					}
				],
				snippets: [
					{
						title: 'The documentation PR preview workflow resolves impact, then runs an explicit deploy',
						description:
							'This abridged excerpt intentionally shows the current repo workflow, including the stale `preview-alias` wiring. It omits repeated auth details and the separate closed-PR cleanup job, which still needs the same alias-flag cleanup.',
						activeFile: '.github/workflows/documentation-preview-pr.yml',
						structure: documentationWorkflowStructure,
						files: [
							{
								path: '.github/workflows/documentation-preview-pr.yml',
								language: 'yaml',
								code: String.raw`name: Documentation PR Preview

on:
	pull_request:
		types: [opened, synchronize, reopened, ready_for_review, closed]

jobs:
	deploy-preview:
		steps:
			- name: Resolve documentation PR preview impact
			  id: impact
			  uses: ./.github/actions/devflare-deploy-impact
			  with:
			    target-package: documentation

			- name: Deploy documentation PR preview
			  id: deploy
			  if: \${{ steps.impact.outputs.should-deploy == 'true' }}
			  uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/documentation
			    install-working-directory: .
			    deploy-command: bun run deploy --
			    preview: 'true'
			    preview-alias: \${{ env.DOCUMENTATION_PR_PREVIEW_ALIAS_PREFIX }}-\${{ github.event.pull_request.number }}

			- name: Publish documentation PR preview feedback
			  uses: ./.github/actions/devflare-github-feedback
			  with:
			    mode: comment
			    comment-key: documentation-preview`
							}
						]
					}
				],
				bullets: [
					'Use `production: true`, `preview: true`, or `preview-scope: <name>` exactly once per deploy action call.',
					'Use `extra-paths` on the impact action when shared workspace files outside the package root should still trigger a redeploy.',
					'Use `install-working-directory` when a package-local deploy should reuse one shared root install in a monorepo.',
					'Let the workflow pass branch names, preview scopes, and messages explicitly so deploy intent is visible in logs.',
					'Use package-specific workflows when the preview model differs, like PR-scoped docs previews versus branch-scoped multi-worker preview families.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Current repo example, not the future-safe pattern',
						body: [
							'The live `documentation-preview-pr.yml` file still passes `preview-alias`, and its closed-PR cleanup job still retires metadata with `--preview-alias`. Treat that as repository drift under cleanup, not as the shape to copy into new workflows.'
						]
					}
				]
			},
			{
				id: 'feedback-and-verification',
				title: 'Publish feedback and verify the live result instead of treating the deploy log as the whole story',
				paragraphs: [
					'After deploy, the workflows in this repo publish GitHub feedback on purpose. Preview workflows update a stable PR comment in place, while production workflows can publish a GitHub deployment record and verify that the expected build is actually visible on the live site.',
					'This is where thin workflows pay off: reporting stays separate from deploy mechanics, and a failed live verification can be surfaced cleanly without hiding inside one giant shell step.',
					'Keep the reusable action outputs in mind too: `devflare-deploy-impact` returns `should-deploy`, `reason`, `comparison-base`, `comparison-head`, `changed-workspaces`, and `changed-files`; `devflare-deploy` returns `preview-alias`, `preview-url`, `version-id`, `verification-note`, `status`, `failure-stage`, `exit-code`, and `log-excerpt`; and `devflare-github-feedback` returns `comment-id`, `deployment-id`, and `pr-number` for later jobs that need to update, retire, or cross-link that feedback.'
				],
				table: {
					headers: ['Workflow file', 'When it runs', 'GitHub feedback'],
					rows: [
						['`documentation-preview-pr.yml`', 'Docs pull requests into the default branch', 'Stable PR comment updated in place.'],
						['`documentation-preview-branch.yml`', 'Non-default branch pushes that affect the docs app', 'GitHub deployment updated with the current branch preview URL.'],
						['`documentation-production.yml`', 'Default branch pushes or manual dispatch for docs production', 'Production deployment record plus live URL verification.'],
						['`testing-preview-pr.yml`', 'Testing pull requests into the default branch', 'Stable PR comment for the PR-scoped preview family.'],
						['`testing-preview-branch.yml`', 'Non-default branch pushes that affect the testing app or workers', 'GitHub deployment, plus the PR comment when that branch belongs to an open PR.'],
						['`*-cleanup.yml` and closed-PR cleanup jobs', 'Deleted branches or closed pull requests', 'Marks preview feedback inactive after retirement and cleanup.']
					]
				},
				bullets: [
					'Use `devflare-github-feedback` for PR comments, GitHub deployments, or both.',
					'Keep preview aliases or production URLs visible in workflow output so reviewers do not need to scrape logs.',
					'Fail the workflow explicitly when deploy verification or live verification says the result is not trustworthy.',
					'Use `GITHUB_STEP_SUMMARY` to leave a small readable outcome instead of forcing readers to decode every raw step.'
				],
				callouts: [
					{
						tone: 'success',
						title: 'What the repo pattern optimizes for',
						body: [
							'Clear triggers, explicit targets, reusable actions, and observable feedback make CI/CD easier to trust when a deploy matters.'
						]
					}
				]
			},
			{
				id: 'cleanup-workflows',
				title: 'Cleanup workflows should be visible too, not hidden in one-off scripts',
				paragraphs: [
					'This repo keeps cleanup as first-class automation. Deleted branches have dedicated cleanup workflows, while PR-scoped previews clean themselves up through a `cleanup-preview` job inside the matching PR workflow when the pull request closes.',
					'The current documentation PR cleanup job still retires metadata with `--preview-alias`, which the CLI no longer accepts. Use `--alias` in new automation and treat that repo job as pending cleanup instead of current best practice.',
					'That keeps teardown reviewable: you can see which file retires preview metadata, which one deletes preview-owned Cloudflare resources or Workers, and which one marks GitHub feedback inactive instead of leaving old preview links pretending they still mean something.'
				],
				cards: [
					{
						title: 'documentation-preview-branch-cleanup.yml',
						body: 'Retires documentation branch preview metadata after branch deletion or manual dispatch.',
						href: workflowLink('documentation-preview-branch-cleanup.yml')
					},
					{
						title: 'testing-preview-branch-cleanup.yml',
						body: 'Retires testing branch preview metadata, deletes preview Workers and resources, and marks feedback inactive.',
						href: workflowLink('testing-preview-branch-cleanup.yml')
					},
					{
						title: 'documentation-preview-pr.yml',
						body: 'Also contains the closed-PR cleanup job for the stable documentation preview comment.',
						href: workflowLink('documentation-preview-pr.yml')
					},
					{
						title: 'testing-preview-pr.yml',
						body: 'Also contains the closed-PR cleanup job for the testing preview family.',
						href: workflowLink('testing-preview-pr.yml')
					}
				],
				bullets: [
					'Branch deletion cleanup lives in dedicated `*-branch-cleanup.yml` files so the trigger is obvious from the filename.',
					'PR closure cleanup lives beside the PR preview deploy job so the open-and-close lifecycle stays in one file.',
					'Cleanup retires preview records first, then removes preview-owned infrastructure, then marks GitHub feedback inactive.'
				],
				snippets: [
					{
						title: 'The testing branch cleanup workflow retires metadata, removes preview resources, and closes the feedback loop',
						description:
							'This abridged excerpt is the real branch cleanup lane under `.github/workflows/testing-preview-branch-cleanup.yml`. It omits repeated auth and feedback inputs so the lifecycle steps stay visible.',
						activeFile: '.github/workflows/testing-preview-branch-cleanup.yml',
						structure: testingWorkflowStructure,
						files: [
							{
								path: '.github/workflows/testing-preview-branch-cleanup.yml',
								language: 'yaml',
								code: String.raw`name: Testing Branch Preview Cleanup

on:
	delete:
	workflow_dispatch:
		inputs:
			branch:
				description: Branch name to clean up manually
				required: true
				type: string

jobs:
	cleanup-preview:
		steps:
			- name: Retire tracked testing branch preview metadata
			  shell: bash
			  run: bunx --bun devflare previews retire --worker "$MAIN_WORKER_NAME" --branch "$PREVIEW_BRANCH" --apply

			- name: Delete preview-scoped testing Cloudflare resources
			  shell: bash
			  run: |
			    cd apps/testing
			    bunx --bun devflare previews cleanup-resources --scope "$PREVIEW_BRANCH" --apply

			- name: Mark testing branch preview deployment inactive
			  uses: ./.github/actions/devflare-github-feedback`
							}
						]
					}
				]
			},
			{
				id: 'multi-package-preview-families',
				title: 'Multi-worker preview families still deploy package by package',
				paragraphs: [
					'The testing preview workflows show the multi-worker version of the same rule. They keep one shared preview scope like `DEVFLARE_PREVIEW_BRANCH`, but still deploy each worker package separately with its own `working-directory`.',
					'That is the important CI/CD habit for multi-worker systems: one workflow can coordinate the family, but each package still owns its own resolved Devflare config and deploy step.',
					'`testing-preview-branch.yml` is also the repo example of branch pushes updating both a GitHub deployment and, when the branch already belongs to an open pull request, the stable PR comment through the same workflow run.'
				],
				cards: [
					{
						title: 'testing-preview-pr.yml',
						body: 'PR-scoped testing preview family with one explicit preview scope per pull request.',
						href: workflowLink('testing-preview-pr.yml')
					},
					{
						title: 'testing-preview-branch.yml',
						body: 'Branch-scoped testing preview family that can refresh both deployment feedback and the PR comment.',
						href: workflowLink('testing-preview-branch.yml')
					}
				],
				snippets: [
					{
						title: 'Branch-scoped multi-worker previews stay package-local',
						description:
							'This excerpt comes from `.github/workflows/testing-preview-branch.yml`, which fans one explicit preview scope across the testing worker family.',
						activeFile: '.github/workflows/testing-preview-branch.yml',
						structure: testingWorkflowStructure,
						files: [
							{
								path: '.github/workflows/testing-preview-branch.yml',
								language: 'yaml',
								code: String.raw`name: Testing Branch Preview

env:
	DEVFLARE_PREVIEW_BRANCH: '\${{ github.ref_name }}'

jobs:
	deploy-preview:
		steps:
			- uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/testing/workers/auth-service
			    install-working-directory: .
			    preview-scope: \${{ env.DEVFLARE_PREVIEW_BRANCH }}

			- uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/testing/workers/search-service
			    install-working-directory: .
			    preview-scope: \${{ env.DEVFLARE_PREVIEW_BRANCH }}

			- uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/testing
			    install-working-directory: .
			    preview-scope: \${{ env.DEVFLARE_PREVIEW_BRANCH }}

			- uses: ./.github/actions/devflare-github-feedback
			  with:
			    mode: both
			    resolve-pr-from-ref: 'true'`
							}
						]
					}
				]
			}
		]
	},
	{
		slug: 'production-deploys',
		group: 'Ship & operate',
		navTitle: 'Production deploys',
		readTime: '4 min read',
		eyebrow: 'Production',
		title: 'Build and deploy production on purpose, with explicit targets and inspectable output',
		summary:
			'Devflare keeps build and deploy flows inspectable, but deploys are intentionally explicit: production uses `--prod` or `--production`, while preview is either a same-worker upload with plain `--preview` or a named preview scope with `--preview <name>`.',
		description:
			'The deploy story is simpler when the target is unmistakable. Devflare resolves config, generates Wrangler-facing artifacts, and then deploys against an explicit destination instead of guessing whether you meant production or preview.',
		highlights: [
			'`devflare build` prepares artifacts without deploying anything.',
			'`devflare deploy` now requires an explicit target: `--prod` / `--production`, plain `--preview`, or named `--preview <name>`.',
			'Production deploys clear preview-oriented naming overrides so stable worker names stay stable.',
			'`config print` and `doctor` are the easiest preflight tools when something feels off.'
		],
		facts: [
			{ label: 'Best for', value: 'Production deploys and preflight checks' },
			{ label: 'Required target', value: '`--prod`, `--production`, plain `--preview`, or named `--preview <name>`' },
			{ label: 'Best debug habit', value: 'Inspect compiled output before you deploy when the setup changed' }
		],
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
		sections: [
			{
				id: 'command-shape',
				title: 'Keep the production lane small and reviewable',
				paragraphs: [
					'The CLI page already owns the broad command map. The production-specific habit is simpler: refresh generated types when the contract changed, build once, inspect when the setup changed, and only then deploy with an explicit production target.',
					'That keeps this page focused on release posture instead of re-explaining command families that already have a better home on the CLI page.'
				],
				steps: [
					'Run `devflare types` when bindings or entrypoints changed and `env.d.ts` needs to catch up.',
					'Run `devflare build --env production` to materialize the production shape you actually mean to ship.',
					'Use `devflare config print --format wrangler` or `devflare doctor` when the compiled result needs inspection before release.',
					'Run `devflare deploy --prod` or `--production` only when the target is unmistakably production.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Need the full command map?',
						body: [
							'Open the CLI page when the question is what `types`, `build`, `config`, or `doctor` generally do. This page only covers how those commands fit the production release lane.'
						]
					}
				]
			},
			{
				id: 'explicit-production',
				title: 'Production deploys should be explicit',
				paragraphs: [
					'Deploy requires an explicit target so production and preview destinations stay unmistakable. That means production is `--prod` or `--production`, while preview is either plain `--preview` for a same-worker upload or `--preview <name>` for a named preview scope.',
					'Production deploys also clear preview-scope environment overrides such as `DEVFLARE_PREVIEW_BRANCH`, which helps keep stable production worker names pointed at the stable infrastructure you actually expect.'
				],
				snippets: [
					{
						title: 'Production deploy commands',
						language: 'bash',
						code: String.raw`bunx --bun devflare build --env production
bunx --bun devflare deploy --prod
bunx --bun devflare deploy --production --message "Release 1" --tag release-1`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'No target means no deploy',
						body: [
							'That rejection is intentional. It keeps production and preview intent visible in CI logs, scripts, and local command history.'
						]
					},
					{
						tone: 'info',
						title: 'Automation can make verification stricter than local deploys',
						body: [
							'The reusable deploy action exposes `verify-deployment` and `require-fresh-production-deployment` so CI can fail when Cloudflare cannot confirm the expected version or keeps serving the existing active production deployment.'
						]
					}
				]
			},
			{
				id: 'preflight',
				title: 'Use the inspectable tools before a risky change',
				bullets: [
					'Run `devflare config print --format wrangler` when you want to see the compiled deployment shape.',
					'Run `devflare doctor` when config resolution, Vite opt-in, or generated files feel suspect.',
					'Run `devflare build` before deploys when the package just gained new bindings, routes, or framework wiring.'
				]
			}
		]
	},
	{
		slug: 'monorepo-turborepo',
		group: 'Ship & operate',
		navTitle: 'Monorepos & Turborepo',
		readTime: '6 min read',
		eyebrow: 'Monorepo',
		title: 'Use Turborepo to validate the workspace, then deploy the target package with Devflare',
		summary:
			'In a Bun monorepo, Turborepo should own task orchestration, caching, and impact-aware validation, while `devflare` still runs from the package that owns the Worker or app you are deploying.',
		description:
			'This repository uses Turbo at the root and keeps `devflare.config.ts` local to each deployable package. That split is the important pattern: Turbo decides which packages to build, typecheck, test, or check, but actual deploy commands still run in the package that owns the resolved Devflare config.',
		highlights: [
			'Each deployable package should keep its own `devflare.config.ts` and package-level scripts.',
			'Use Turbo at the repo root for cached validation and targeted package work.',
			'Deploy from the target package directory, or set that package as the GitHub Actions working directory.',
			'The same monorepo can mix same-worker preview uploads and multi-worker preview families.'
		],
		facts: [
			{ label: 'Best for', value: 'Bun + Turborepo monorepos with more than one Devflare package' },
			{ label: 'Turbo role', value: 'Validation, caching, filters, and impacted-package orchestration' },
			{ label: 'Deploy rule', value: 'Run `devflare` from the package that owns the config' }
		],
		sourcePages: ['README.md', 'deploy-preview-cli.md', 'verification-testing-and-caveats.md'],
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
						['Turborepo', 'Task graph, caching, filters, workspace validation lanes, and targeted build/check/test/type flows.'],
						['Devflare', 'Config resolution, type generation, worker bundling, preview deploys, production deploys, and preview lifecycle commands.'],
						['GitHub Actions', 'Triggers, permissions, branch/PR policy, feedback, and the working directory that selects the target package.']
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
				title: 'Use repo-root Turbo scripts for contributor and CI lanes',
				paragraphs: [
					'The repository now exposes explicit root scripts for the core Devflare workflow so contributors and CI can validate the workspace without guessing at filters every time.',
					'Those scripts are validation and orchestration tools; they are not a replacement for the actual package-local deploy commands.'
				],
				snippets: [
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
				title: 'Deploy one package at a time, from the package that owns the config',
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
bun run deploy -- --preview --branch-name feature-search
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
				title: 'Multi-worker preview families still deploy package by package',
				paragraphs: [
					'`apps/testing` is the repository example for the other half of the rule: Turbo can orchestrate the workspace, but a branch-scoped preview family still deploys each worker package separately with the same preview scope and naming inputs.',
					'That is why the workflows keep `DEVFLARE_PREVIEW_BRANCH` consistent and run separate deploys for `auth-service`, `search-service`, and the main app instead of pretending one root deploy magically owns the whole family.'
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
bunx --bun devflare previews cleanup-resources --scope pr-123 --apply`
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
		title: 'Pick the preview model that matches the app instead of forcing one preview story on every worker',
		summary:
			'Devflare supports both same-worker preview uploads and named preview scopes, but Durable Object-heavy apps often need a branch-scoped worker-family strategy instead of relying on preview URLs alone.',
		description:
			'Preview complexity usually comes from choosing the wrong model, not from the commands themselves. This page helps you pick the right one before you start writing CI around assumptions that the platform will not actually honor.',
		highlights: [
			'Plain `--preview` keeps the same-worker preview upload flow.',
			'Both preview targets resolve `config.env.preview`; bare `--preview` uses the synthetic `preview` identifier, while named `--preview next` swaps in an explicit scope and can pair with branch-scoped preview workers when the config is wired for them.',
			'The live reusable action and workflow examples in this repo still carry `preview-alias` drift for same-worker uploads. The CLI target model is plain `--preview` or named `--preview <scope>`, and new automation should prefer `branch-name` or explicit preview scopes.',
			'Preview URLs are public unless protected and have important Cloudflare caveats.',
			'Durable Object-heavy apps often need branch-scoped worker families instead of same-worker preview URLs.'
		],
		facts: [
			{ label: 'Best for', value: 'Choosing preview strategy before building CI around it' },
			{ label: 'Same-worker mode', value: 'Plain `--preview`' },
			{ label: 'Named scope mode', value: '`--preview <name>`' }
		],
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
		sections: [
			{
				id: 'choose-model',
				title: 'There is more than one preview model',
				table: {
					headers: ['Preview style', 'Use it when'],
					rows: [
						['Plain `--preview`', 'You want a same-worker preview upload and the synthetic `preview` identifier is enough for any `preview.scope()` resource names.'],
						['Named `--preview <name>`', 'You need an explicit preview identifier for resource names or branch-scoped preview workers.'],
						['Branch-scoped worker family', 'The app is Durable Object-heavy or otherwise needs stronger isolation than same-worker preview uploads can provide.']
					]
				},
				paragraphs: [
					'Both preview targets resolve `config.env.preview` and can materialize `preview.scope()` names. Bare `--preview` keeps the same-worker preview upload flow and uses the synthetic `preview` identifier, while named `--preview <name>` swaps that identifier for an explicit scope and can pair naturally with branch-scoped preview workers when your config is wired for that pattern.',
					'Plain `--preview` can still derive alias metadata from `--branch-name`, CI metadata, or the current git branch, but that alias is separate from the synthetic `preview` identifier used for preview-scoped resource names.',
					'The action metadata in this repo still carries a `preview-alias` input for same-worker uploads, and some live workflows still use it. Treat that as repo drift rather than a second CLI deploy target model. New automation should lean on `--branch-name`-style alias derivation or just use named preview scopes directly.'
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
						title: 'This is why DO-heavy apps need a different preview instinct',
						body: [
							'If previews must exercise real Durable Object behavior, reach for branch-scoped worker families and preview-scoped resources instead of hoping same-worker preview URLs will be enough.'
						]
					}
				]
			},
			{
				id: 'preview-resources',
				title: 'Use preview-scoped resources only when the preview really owns infrastructure',
				paragraphs: [
					'Branch-scoped previews sometimes need their own KV, D1, R2, Queue, or Vectorize resources. That is where `preview.scope()` is useful: authored config stays stable while preview environments resolve preview-specific names.',
					'Outside preview environments, those same authored markers resolve back to the base names so your config stays readable.',
					'Inside preview deploys, bare `--preview` usually materializes names like `my-cache-kv-preview`, while `--preview next` materializes names like `my-cache-kv-next`.'
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
		title: 'Use the preview registry commands to inspect, reconcile, retire, and clean up previews',
		summary:
			'The preview registry is D1-backed and gives Devflare a durable record of preview, alias, and deployment state so cleanup and reconciliation do not have to depend on fragile one-off scripts.',
		description:
			'Once previews exist, lifecycle management matters as much as deployment. The preview registry commands are the public surface for understanding what exists, bringing state back in sync, and tearing down preview-only resources deliberately.',
		highlights: [
			'`previews provision` creates the registry database when it does not exist yet. The default registry database name is `devflare-registry`.',
			'`previews` gives you the family or registry view, `bindings --scope <name>` inspects one resolved preview scope, and `reconcile` repairs registry drift when deploy-time sync fell behind.',
			'Deploy flows try to keep registry records in sync as previews are created, but registry sync is best-effort and `reconcile` exists for the moments when the recorded state falls behind.',
			'`retire`, `cleanup`, and `cleanup-resources` are for lifecycle management, not just visibility.',
			'Cleanup of branch-scoped preview workers can also remove preview-only service, Durable Object, and route ownership that belongs only to those workers.'
		],
		facts: [
			{ label: 'Best for', value: 'Preview lifecycle management after deploys already exist' },
			{ label: 'Registry backing', value: 'D1 (`devflare-registry` by default)' },
			{ label: 'Cleanup warning', value: 'Dedicated preview workers may own more than just the worker script' }
		],
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
		sections: [
			{
				id: 'registry-role',
				title: 'Why the preview registry exists',
				paragraphs: [
					'Cloudflare discovery alone is not enough for a clean preview lifecycle story. The D1-backed registry lets Devflare track preview, alias, and deployment records in a way that supports reconciliation, retirement, and cleanup commands later.',
					'`previews provision` creates or reuses the default `devflare-registry` database, and later deploy flows try to keep that registry synchronized as preview deploys happen. If that sync warns or falls behind, `reconcile` is the documented recovery path.',
					'That is what lets preview operations stay a documented CLI surface instead of becoming a pile of CI-only command glue.'
				]
			},
			{
				id: 'useful-commands',
				title: 'The core commands to remember',
				snippets: [
					{
						title: 'Preview lifecycle commands',
						language: 'bash',
						code: String.raw`bunx --bun devflare previews
bunx --bun devflare previews provision
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews reconcile --worker documentation
bunx --bun devflare previews retire --worker documentation --branch feature-search --apply
bunx --bun devflare previews cleanup --days 7 --apply
bunx --bun devflare previews cleanup-resources --scope next --apply`
					}
				],
				bullets: [
					'Use `previews` for a summary view of preview scopes.',
					'Use `bindings --scope <name>` when you want to understand which workers currently reference one named preview scope; otherwise the identifier comes from the same preview env vars your automation already set.',
					'Use `reconcile` when registry state needs to be synced against current Cloudflare state.',
					'Prefer explicit scope selectors when you know the target, and reserve broad cleanup runs for the moments when the whole preview fleet genuinely needs attention.',
					'Without `--scope`, `cleanup-resources` first respects `DEVFLARE_PREVIEW_IDENTIFIER`, `DEVFLARE_PREVIEW_PR`, or `DEVFLARE_PREVIEW_BRANCH`, and only then falls back to the synthetic `preview` scope. Use `--all` when you mean every discovered scope for the worker family, not just that resolved default.'
				]
			},
			{
				id: 'cleanup-shape',
				title: 'Cleanup should be specific',
				bullets: [
					'`retire` retires matching registry records by branch, alias, version, or commit selector; it does not delete the underlying Cloudflare resources by itself.',
					'`cleanup` soft-deletes stale registry records after an age threshold instead of immediately pretending the historical metadata never existed.',
					'`cleanup-resources` deletes preview-only resources and can also delete dedicated preview worker scripts for the targeted scope.',
					'Stable shared workers are not deleted by `cleanup-resources`; same-worker preview aliases only lose matching preview-scoped account resources.',
					'Analytics Engine datasets and Browser Rendering bindings are reported as warnings instead of deleted resources, and preview-scoped Hyperdrive cleanup only removes preview configs that already exist.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Good cleanup hygiene',
						body: [
							'Use the most specific selector you can. Cleanup is easier to trust when the target is obvious in the command itself.'
						]
					},
					{
						tone: 'warning',
						title: 'Not every preview-looking thing is a deletable resource',
						body: [
							'Browser Rendering does not own an account-scoped resource, Analytics Engine datasets are created on first write, and Hyperdrive preview cleanup can only remove preview configs that already exist. The command tells you about those cases instead of pretending it deleted them.'
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
		title: 'Test the runtime shape you actually ship, then keep automation thin and observable',
		summary:
			'Keep local harness detail on the dedicated testing pages, then promote only the right runtime-shaped checks into thin, observable automation.',
		description:
			'Devflare’s testing story is intentionally layered. The local harness pages own `createTestContext()` and binding-specific nuance; this page owns the CI-facing question of which checks should move into preview validation, release automation, and workflow feedback.',
		highlights: [
			'Use `testing-overview`, `create-test-context`, and binding testing guides as the canonical local-testing references.',
			'Carry only the automation-facing timing rules into CI: `cf.worker.fetch()` does not drain all `waitUntil()` work, while queue, scheduled, and tail helpers do wait for their background work.',
			'Promote a small number of runtime-shaped smoke checks into CI instead of recreating the whole local suite in workflows.',
			'Keep deploy execution and GitHub feedback separate so automation stays reviewable.'
		],
		facts: [
			{ label: 'Best for', value: 'CI-facing testing policy, preview validation, and thin release automation' },
			{ label: 'Local harness owner', value: '`/docs/create-test-context` plus binding testing guides' },
			{ label: 'Important nuance', value: '`cf.worker.fetch()` is not a full `waitUntil()` drain' },
			{ label: 'Workflow companion', value: '`/docs/github-workflows`' }
		],
		sourcePages: ['verification-testing-and-caveats.md', 'README.md'],
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
						title: 'A cleaner split keeps both pages better',
						body: [
							'The harness pages should own local helper behavior. This page should own what gets promoted into automation and how that automation stays understandable.'
						]
					}
				]
			},
			{
				id: 'automation-timing',
				title: 'Carry only the automation-facing timing rules into CI',
				paragraphs: [
					'Automation does not need the whole local harness manual, but it does need the timing rules that commonly produce flaky checks or false confidence.',
					'The main habit is to promote the check that matches the behavior you actually need to trust instead of assuming every helper has the same completion contract.'
				],
				table: {
					headers: ['When the check depends on...', 'Prefer', 'Why'],
					rows: [
						['`waitUntil()` side effects from an HTTP handler', 'Assert the side effect directly or move to a higher-fidelity check.', '`cf.worker.fetch()` returns when the handler resolves, not when every background task drains.'],
						['Queue, scheduled, or tail background work', '`cf.queue.trigger()`, `cf.scheduled.trigger()`, or `cf.tail.trigger()`', 'Those helpers wait for their background work before they return, so they are a better fit for async side-effect assertions.'],
						['Binding-specific or transport-specific behavior', 'The binding guide or `create-test-context` page first', 'Different bindings and bridge-backed values have different honest harness rules, and the local testing pages already own those details.']
					]
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Do not promote the wrong completion contract into CI',
						body: [
							'If a test depends on `waitUntil()` effects being complete, a plain `cf.worker.fetch()` assertion may be too early. Keep that nuance visible in automation instead of discovering it from flaky builds later.'
						]
					}
				]
			},
			{
				id: 'promotion-path',
				title: 'Promote the smallest useful checks into automation',
				steps: [
					'Prove the behavior locally with `createTestContext()` or the binding-specific guide first.',
					'Choose one or two runtime-shaped smoke checks that are worth rerunning in CI because they protect the deploy boundary, not because they are merely easy to copy.',
					'Use preview validation when routing, preview-owned resources, or branch-scoped behavior is the real risk instead of trying to force every concern through one unit-style check.',
					'Publish one visible summary or feedback artifact so reviewers can tell what passed without spelunking through raw logs.'
				],
				cards: [
					{
						href: docsLink('preview-operations'),
						label: 'Ship & operate',
						meta: 'Preview lifecycle',
						title: 'Preview operations',
						body: 'Use the preview page when a runtime check depends on preview-scoped resources, reconciliation, retirement, or cleanup behavior.'
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
				title: 'Automation should stay thin and observable',
				paragraphs: [
					'The repository workflow pieces are intentionally split between deploy logic and GitHub feedback logic. That keeps Cloudflare state changes separate from PR comments, deployment records, or other reporting behavior.',
					'Caller workflows should own branch naming, permissions, environment selection, and post-deploy feedback decisions, while reusable actions should stay focused on one deploy or one reporting job at a time.'
				],
				bullets: [
					'Keep one package, one explicit target, and one visible verification result in the same workflow lane whenever possible.',
					'Split deploy execution from GitHub feedback so reporting can fail or retry without becoming a second deploy path.',
					'Prefer workflow summaries, PR comments, or deployment records that show the result directly instead of forcing reviewers into raw logs.'
				],
				snippets: [
					{
						title: 'Thin preview deploy step',
						language: 'yaml',
						code: `- id: deploy
  uses: ./.github/actions/devflare-deploy
  with:
    working-directory: apps/documentation
    preview: 'true'
    branch-name: \${{ github.head_ref || github.ref_name }}
    cloudflare-api-token: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Thin workflows age better',
						body: [
							'When a release is stressful, a small workflow that clearly says what it deploys and what it reports is much easier to trust than a giant do-everything pipeline.'
						]
					}
				],
				cards: [
					{
						href: docsLink('github-workflows'),
						label: 'Ship & operate',
						meta: 'CI/CD',
						title: 'GitHub workflows',
						body: 'The workflow page owns the deeper repo examples for impact checks, reusable actions, PR feedback, and cleanup jobs.'
					}
				]
			}
		]
	},
]
