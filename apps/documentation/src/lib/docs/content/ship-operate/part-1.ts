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

export const shipOperateDocsPart1: DocPage[] = [
	{
		slug: 'github-workflows',
		group: 'Ship & operate',
		navTitle: 'GitHub workflows',
		readTime: '7 min read',
		eyebrow: 'CI/CD',
		title: 'Official GitHub Actions patterns for Devflare',
		summary:
			'Devflare ships reusable GitHub Actions for setup, impact checks, deploy execution, and feedback, plus supported workflow strategies for validation, previews, production, and cleanup.',
		description:
			'Treat GitHub workflows as policy and target selection. Treat the reusable Devflare actions as the supported mechanics for workspace setup, impact checks, explicit deploys, and GitHub feedback.',
		highlights: [
			'`devflare-setup-workspace` prepares Bun and dependencies once per job.',
			'`devflare-deploy-impact` gates each deploy target before Cloudflare work begins.',
			'`devflare-deploy` owns explicit production or named preview-scope deploys.',
			'`devflare-github-feedback` publishes PR comments and deployment records independently from deploy execution.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'GitHub Actions with validation, preview, production, and cleanup lanes'
			},
			{ label: 'Supported actions', value: '4 reusable actions' },
			{
				label: 'Package selector',
				value: '`working-directory` picks which Devflare config deploys'
			}
		],
		sourcePages: [
			workflowLink('workspace-ci.yml'),
			workflowLink('preview.yml'),
			workflowLink('documentation-production.yml'),
			workflowActionSourceLink('devflare-deploy-impact'),
			workflowActionSourceLink('devflare-setup-workspace'),
			workflowActionSourceLink('devflare-deploy'),
			workflowActionSourceLink('devflare-github-feedback'),
			workflowScriptLink('verify-testing-preview-deployment.ts')
		],
		sections: [
			{
				id: 'official-support',
				title: 'GitHub Actions are a supported deployment surface',
				paragraphs: [
					'This page is the reference for running Devflare from GitHub Actions. The reusable actions and workflow shapes in this repository are the supported CI/CD patterns, not incidental excerpts copied out of one lucky workflow.',
					'Keep the ownership split sharp: workflows decide when a lane runs, which permissions it gets, which package it targets, and what verification happens afterwards. The reusable Devflare actions own the mechanics that should stay consistent across repositories.'
				],
				table: {
					headers: ['Layer', 'Owns', 'Should not own'],
					rows: [
						[
							'Workflow file',
							'Triggers, permissions, concurrency, package selection, and verification order.',
							'Deploy argument construction, Bun setup, or PR comment formatting.'
						],
						[
							'`devflare-setup-workspace`',
							'Bun installation, cache restore, and one shared workspace install.',
							'Target selection or any deploy step.'
						],
						[
							'`devflare-deploy-impact`',
							'Change detection for one deployment target.',
							'Cloudflare deploys or GitHub reporting.'
						],
						[
							'`devflare-deploy`',
							'One explicit production or named preview-scope deploy.',
							'PR comment policy or multi-package orchestration.'
						],
						[
							'`devflare-github-feedback`',
							'PR comments, deployment records, and inactive cleanup updates.',
							'Cloudflare deploy execution.'
						]
					]
				},
				bullets: [
					'Inside this repository, use local action paths like `./.github/actions/devflare-deploy`.',
					'From another repository, use `Refzlund/devflare/.github/actions/<action>@next`.',
					'Make the target package visible through `working-directory` instead of hiding package selection in a shell wrapper.',
					'Keep validation, preview, production, and cleanup lanes explicit. They have different verification rules for good reasons.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'The goal',
						body: [
							'Reusable mechanics, explicit policy, and CI logs a human can still trust before coffee.'
						]
					}
				]
			},
			{
				id: 'supported-actions',
				title: 'Supported reusable actions',
				paragraphs: [
					'Devflare ships four reusable GitHub Actions for the repeatable parts. Use them directly rather than cloning shell logic into every workflow file.',
					'The action source lives in this repository, but the contract is meant to be reused: workspace setup, impact detection, deploy execution, and GitHub feedback are separate on purpose.'
				],
				cards: [
					{
						href: workflowActionSourceLink('devflare-setup-workspace'),
						label: 'Action',
						meta: 'Setup',
						title: 'devflare-setup-workspace',
						body: 'Install Bun, restore the Bun cache, and run one shared workspace install for the job.'
					},
					{
						href: workflowActionSourceLink('devflare-deploy-impact'),
						label: 'Action',
						meta: 'Impact',
						title: 'devflare-deploy-impact',
						body: 'Decide whether one target package actually needs a deploy before Cloudflare work starts.'
					},
					{
						href: workflowActionSourceLink('devflare-deploy'),
						label: 'Action',
						meta: 'Deploy',
						title: 'devflare-deploy',
						body: 'Run one explicit production or named preview-scope deploy and expose outputs for later verification.'
					},
					{
						href: workflowActionSourceLink('devflare-github-feedback'),
						label: 'Action',
						meta: 'Feedback',
						title: 'devflare-github-feedback',
						body: 'Publish PR comments, GitHub deployments, or both without mixing reporting into deploy execution.'
					}
				]
			},
			{
				id: 'setup-workspace-action',
				title: '`devflare-setup-workspace`',
				paragraphs: [
					'Use `devflare-setup-workspace` once near the start of a job when later steps share the same checkout and dependency install. It installs Bun, restores the Bun cache, and runs the workspace install command from the chosen directory.',
					'This action is intentionally target-agnostic. It prepares the workspace; it never decides what to deploy.'
				],
				bullets: [
					'Best fit: one job that deploys more than one package or deploys and then runs follow-up verification.',
					'In a monorepo, keep `working-directory: .` so package deploy steps can reuse the root install.',
					"Later `devflare-deploy` steps should set `skip-setup: 'true'` and `skip-install: 'true'` after shared setup already ran.",
					'If you only have one simple deploy step, you can let `devflare-deploy` handle setup itself instead.'
				],
				snippets: [
					{
						title: 'Prepare the workspace once',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: setupWorkspaceActionCode
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Use it when the job has shared setup work',
						body: [
							'This action exists so Bun setup and dependency installation stay boring. That is a compliment.'
						]
					}
				]
			},
			{
				id: 'deploy-impact-action',
				title: '`devflare-deploy-impact`',
				paragraphs: [
					'Use `devflare-deploy-impact` before any Cloudflare work. It compares the target package against the relevant git range and tells the workflow whether a deploy is actually needed.',
					'Call it once per deployment target. In multi-package preview families, that means one impact decision per worker or app, not one giant yes-or-no for the whole job.'
				],
				table: {
					headers: ['Key field', 'Why it matters'],
					rows: [
						[
							'`target-package`',
							'Selects the workspace package whose changes should trigger a deploy.'
						],
						[
							'`extra-paths`',
							'Lets shared files outside the package root invalidate that target too.'
						],
						[
							'`should-deploy`',
							'The boolean gate your workflow should use before any deploy step runs.'
						],
						['`reason`', 'Short explanation you can surface in summaries, PR comments, and logs.'],
						['`changed-files`', 'Audit trail for what the comparison actually saw.']
					]
				},
				bullets: [
					'Run it before deploys, not after — skipping a no-op deploy is the whole point.',
					'Pass event metadata from GitHub instead of guessing at comparison refs in shell.',
					'Keep one impact decision per target so the workflow can skip or deploy packages independently.',
					'Promote the `reason` output into human-readable feedback. It makes skipped runs much easier to trust.'
				],
				snippets: [
					{
						title: 'Gate the deploy before Cloudflare work starts',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: deployImpactActionCode
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Use this to skip the boring non-events',
						body: [
							'No-op deploys still cost time, secrets exposure, and reviewer attention. This action exists to spend less of all three.'
						]
					}
				]
			},
			{
				id: 'deploy-action',
				title: '`devflare-deploy`',
				paragraphs: [
					'Use `devflare-deploy` for the actual Devflare deploy step. It can prepare Bun and dependencies for a standalone job, or it can reuse shared setup from an earlier `devflare-setup-workspace` step.',
					"The action requires one explicit target. Use `production: 'true'` for `--prod`, or `preview-scope: <name>` for `--preview <name>`. `working-directory` selects which package-local `devflare.config.ts` and scripts are in play.",
					'Its outputs are the hand-off point for the rest of the workflow: `preview-url`, `version-id`, `verification-note`, `status`, `failure-stage`, `exit-code`, and `log-excerpt` are all meant for later verification and GitHub feedback.'
				],
				table: {
					headers: ['Input or output', 'Role'],
					rows: [
						['`working-directory`', 'Selects the package-local Devflare config and scripts.'],
						['`production`', 'Requests an explicit `--prod` deployment.'],
						[
							'`preview-scope`',
							'Requests an explicit named preview deployment via `--preview <name>`.'
						],
						[
							'`verify-deployment`',
							'Controls whether the action enforces Cloudflare control-plane verification.'
						],
						[
							'`require-fresh-production-deployment`',
							'Tightens production verification when a new live deployment must be visible.'
						],
						[
							'`preview-url`, `version-id`, `verification-note`, `status`',
							'Outputs the rest of the workflow should consume for verification and feedback.'
						]
					]
				},
				snippets: [
					{
						title: 'Named preview deploy',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: previewDeployActionCode
					},
					{
						title: 'Explicit production deploy',
						filename: '.github/workflows/production.yml',
						language: 'yaml',
						code: productionDeployActionCode
					}
				],
				bullets: [
					"Production is the supported lane for strict control-plane verification. Leave `verify-deployment` at its default `true`, and enable `require-fresh-production-deployment: 'true'` when you need a hard failure if Cloudflare keeps the old live deployment.",
					'Preview workflows in this repository use named preview scopes and then perform app-level verification after the deploy step. That is the supported preview posture here.',
					'Use `deploy-command` when the package already wraps Devflare behind `bun run deploy --` or another package-local script.',
					'Use `install-working-directory` to reuse a workspace-root install while still deploying from a package subdirectory.',
					'Pass `deploy-message` and `deploy-tag` when you want workflow runs to map cleanly onto Cloudflare version history.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Choose exactly one target',
						body: [
							'The action intentionally rejects ambiguous callers. If a workflow cannot tell whether it is preview or production, the logs will not be much comfort later either.'
						]
					},
					{
						tone: 'info',
						title: 'Preview verification is different from production verification',
						body: [
							'Preview jobs still need real post-deploy checks for the application they expose. In this repository that means URL and content verification for documentation previews plus deployed-binding verification for the testing preview family.'
						]
					}
				]
			},
			{
				id: 'github-feedback-action',
				title: '`devflare-github-feedback`',
				paragraphs: [
					'Use `devflare-github-feedback` to publish the result after deploy and verification have already been decided. It can update a PR comment, a GitHub deployment record, or both.',
					'Keeping feedback separate from deploy execution matters. You can retry reporting, mark cleanup inactive, or change comment grouping without touching the Cloudflare deploy mechanics.'
				],
				table: {
					headers: ['Field', 'Use it for'],
					rows: [
						['`mode`', 'Choose PR comments, GitHub deployments, or both.'],
						['`operation`', 'Differentiate normal reporting from cleanup or inactive updates.'],
						['`status`', 'Publish `success`, `failure`, `skipped`, `in_progress`, or `inactive`.'],
						[
							'`comment-key` and `comment-section-key`',
							'Keep one durable PR comment and merge multiple preview sections into it.'
						],
						[
							'`environment` and `environment-url`',
							'Populate the GitHub Deployments UI with the right environment identity.'
						],
						[
							'`log-url` and `log-excerpt`',
							'Make failure context readable without digging through raw workflow output.'
						]
					]
				},
				bullets: [
					'Use `mode: deployment` for branch previews and production lanes that should show up in the GitHub Deployments UI.',
					'Use `mode: comment` for PR previews and group multiple sections into one stable comment with `comment-key` plus `comment-section-key`.',
					'Use `operation: cleanup` and `status: inactive` after preview cleanup so GitHub stops pretending old previews are still alive.',
					'Surface `summary`, `details-markdown`, and log links so reviewers do not have to spelunk raw job output.'
				],
				snippets: [
					{
						title: 'Publish grouped PR feedback',
						filename: '.github/workflows/preview.yml',
						language: 'yaml',
						code: githubFeedbackCommentCode
					}
				]
			},
			{
				id: 'supported-strategies',
				title: 'Supported workflow files and deployment strategies',
				paragraphs: [
					'The repository currently demonstrates three workflow files and six supported lane types. You do not need to collapse them into one mega-workflow to be “official”; the official part is the clear contract between the workflow lane and the reusable actions.'
				],
				table: {
					headers: ['Strategy', 'Workflow file', 'Verification style', 'GitHub surface'],
					rows: [
						[
							'Validation only',
							'`workspace-ci.yml`',
							'Workspace build, typecheck, and test validation.',
							'None — this lane does not deploy.'
						],
						[
							'Branch preview',
							'`preview.yml`',
							'Target checks plus app-level verification after deploy.',
							'GitHub deployment record.'
						],
						[
							'Pull request preview',
							'`preview.yml`',
							'Target checks plus app-level verification after deploy.',
							'Grouped PR comment.'
						],
						[
							'Multi-package preview family',
							'`preview.yml`',
							'Per-package deploys plus family-level verification.',
							'GitHub deployment record and grouped PR comment.'
						],
						[
							'Production',
							'`documentation-production.yml`',
							'Deploy action control-plane checks plus live URL verification.',
							'GitHub deployment record.'
						],
						[
							'Cleanup',
							'`preview.yml`',
							'Successful cleanup command plus inactive feedback update.',
							'Inactive deployment or PR comment section.'
						]
					]
				},
				cards: [
					{
						title: 'workspace-ci.yml',
						body: 'Validation-only lane for the monorepo. No Cloudflare target, no deploy side door.',
						href: workflowLink('workspace-ci.yml')
					},
					{
						title: 'preview.yml',
						body: 'Shared preview lifecycle workflow for branch previews, PR previews, multi-package preview families, and cleanup.',
						href: workflowLink('preview.yml')
					},
					{
						title: 'documentation-production.yml',
						body: 'Explicit production lane for the documentation app with live verification after deploy.',
						href: workflowLink('documentation-production.yml')
					}
				]
			},
			{
				id: 'validation-strategy',
				title: 'Validation strategy: `workspace-ci.yml`',
				paragraphs: [
					'`workspace-ci.yml` is the validation lane. It restores Bun and Turborepo caches, installs once, and runs `bun run devflare:ci`.',
					'It intentionally does not choose a Cloudflare target or request Cloudflare secrets. That keeps repo-wide confidence separate from deploy intent.'
				],
				bullets: [
					'Trigger it on repo-wide changes that affect apps, cases, packages, or shared tooling.',
					'Use it to prove the monorepo still builds, types, and tests before package-specific deploy lanes matter.',
					'Treat it as a prerequisite lane, not a back door into deployment.'
				],
				callouts: [
					{
						tone: 'success',
						title: 'Validation stays validation',
						body: [
							'If a workflow validates the workspace, let it do that well. Sneaking deploy behavior into it is how release lanes get mysterious.'
						]
					}
				]
			},
			{
				id: 'branch-preview-strategy',
				title: 'Branch preview strategy',
				paragraphs: [
					'Non-default branch pushes get a stable branch-named preview scope in `preview.yml`. The workflow resolves context once, sets up the workspace once, and then updates only the affected targets for that branch scope.',
					'This is the supported pattern when you want a shareable branch preview that survives multiple pushes and can also coexist with a PR-scoped preview.'
				],
				bullets: [
					'The preview scope is the source branch name.',
					'Run `devflare-deploy-impact` before each deploy target so unchanged packages skip Cloudflare work.',
					'Publish a GitHub deployment record for branch previews so the branch has a first-class environment trail.',
					'Follow the deploy with app-specific verification, not just “the command exited”.'
				],
				cards: [
					{
						title: 'preview.yml',
						body: 'The shared preview workflow resolves context once and then updates branch-scoped targets separately from PR-scoped targets.',
						href: workflowLink('preview.yml')
					}
				]
			},
			{
				id: 'pr-preview-strategy',
				title: 'Pull request preview strategy',
				paragraphs: [
					'Pull requests targeting the default branch get a stable `pr-<number>` preview scope in the same `preview.yml` workflow. The workflow can update the branch preview, the PR preview, or both from the same checkout when that branch already belongs to an open PR.',
					'PR preview reporting is grouped into one comment so documentation and testing results update in place instead of spraying the thread with duplicate status noise.'
				],
				bullets: [
					'Use `opened`, `reopened`, and `ready_for_review` to create or refresh the PR preview.',
					'Use `comment-key: pr-deployment-status` plus section keys to merge multiple preview lanes into one durable comment.',
					'If impact says `skip`, report `skipped` and leave the existing preview in place rather than tearing it down.',
					'Keep branch and PR deploy steps separate even when they share preparation work. They are different targets with different review questions.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Stable PR scopes reduce churn',
						body: [
							'Updating `pr-<number>` in place is much easier to review than minting a brand-new preview identity on every commit.'
						]
					}
				]
			},
			{
				id: 'multi-package-preview-strategy',
				title: 'Multi-package preview family strategy',
				paragraphs: [
					'Some applications are really a family of workers. `apps/testing` is the reference pattern: auth service, search service, and main app deploy separately, but they share one preview scope and one workflow lane.',
					'This is the supported strategy when previews need stronger isolation than same-worker uploads can provide, or when bindings across multiple workers must resolve together.'
				],
				bullets: [
					'Evaluate impact per worker or app package.',
					'Deploy each package with its own `working-directory` and the same `preview-scope`.',
					'Add one family-level verification step after the main deploy to confirm the deployed bindings and URLs line up.',
					'Publish both deployment records and grouped PR feedback from the same verified result.'
				],
				cards: [
					{
						title: 'verify-testing-preview-deployment.ts',
						body: 'The testing preview family finishes with a purpose-built verification script that checks the deployed binding shape, not just deploy command exit codes.',
						href: workflowScriptLink('verify-testing-preview-deployment.ts')
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'This is the right instinct for DO-heavy or service-bound apps',
						body: [
							'When one preview really means several workers plus shared bindings, model that explicitly instead of pretending one same-worker upload tells the full truth.'
						]
					}
				]
			},
			{
				id: 'production-strategy',
				title: 'Production strategy',
				paragraphs: [
					'`documentation-production.yml` is the reference production lane: resolve impact, perform one explicit production deploy, verify the live site, and then publish a GitHub deployment.',
					'This is the supported split for production automation: let the deploy action handle Cloudflare control-plane verification, then add one live check that proves the currently served app really matches the commit you just shipped.'
				],
				bullets: [
					'Run on default-branch pushes or manual dispatch.',
					"Use `production: 'true'` instead of inferring production from branch names inside shell logic.",
					'Keep `verify-deployment` enabled for production.',
					'Use the deploy output URL or the stable production URL for a live content check like `/build.json`.',
					'Publish the final environment URL and version ID back to GitHub.'
				],
				cards: [
					{
						title: 'documentation-production.yml',
						body: 'The reference production workflow for a Devflare app: impact check, explicit production deploy, live verification, then GitHub deployment feedback.',
						href: workflowLink('documentation-production.yml')
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Production gets the strictest verification',
						body: [
							'Production should fail when the control plane or the live URL cannot prove what is serving. Better a loud release lane than a confident fiction.'
						]
					}
				]
			},
			{
				id: 'cleanup-strategy',
				title: 'Cleanup strategy',
				paragraphs: [
					'Cleanup is a supported lifecycle lane, not an afterthought. `preview.yml` handles branch deletion, PR closure, and manual cleanup dispatches from the same policy surface as preview creation.',
					'Each cleanup job checks out the default branch, reinstalls the shared workspace, runs `devflare previews cleanup --scope <name> --apply`, and then marks the matching GitHub deployment or PR comment section inactive.'
				],
				bullets: [
					'Use branch deletion or manual dispatch for branch-scoped cleanup.',
					'Use PR closure for PR-scoped cleanup.',
					'Keep the scope name identical to the deploy lane so cleanup is obvious and deterministic.',
					'Mark feedback inactive after infrastructure cleanup so GitHub reflects reality instead of wishful thinking.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Cleanup is part of the contract',
						body: ['A preview strategy that never documents cleanup is just deferred archaeology.']
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
		title: 'Explicit production deploys with inspectable output',
		summary:
			'Production uses `--prod` or `--production`, preview uses `--preview` or `--preview <name>`. No target means no deploy.',
		description:
			'Devflare resolves config, generates Wrangler artifacts, and deploys against an explicit destination.',
		highlights: [
			'`devflare build` prepares artifacts without deploying.',
			'`devflare deploy` requires an explicit target: `--prod`, `--production`, `--preview`, or `--preview <name>`.',
			'Production deploys clear preview naming overrides so stable worker names stay stable.',
			'`config print` and `doctor` are the easiest preflight tools.'
		],
		facts: [
			{ label: 'Best for', value: 'Production deploys and preflight checks' },
			{
				label: 'Required target',
				value: '`--prod`, `--production`, `--preview`, or `--preview <name>`'
			},
			{ label: 'Best debug habit', value: 'Inspect compiled output before deploying' }
		],
		sourcePages: ['packages/devflare/src/cli/commands/deploy.ts', 'README.md'],
		sections: [
			{
				id: 'command-shape',
				title: 'The production lane',
				paragraphs: [
					'Refresh generated types when bindings or entrypoints changed, build once, inspect when the setup changed, then deploy with an explicit production target.',
					'The CLI page owns the broad command map. This page covers how those commands fit the release lane.'
				],
				steps: [
					'Run `devflare types` when bindings or entrypoints changed and `env.d.ts` needs to catch up.',
					'Run `devflare build --env production` to generate production artifacts.',
					'Use `devflare config print --format wrangler` or `devflare doctor` when the compiled result needs inspection before release.',
					'Run `devflare deploy --prod` or `--production` only when the target is unmistakably production. Add `--dry-run` first if you want to verify the pipeline without pushing.'
				],
				snippets: [
					{
						title: 'Production release workflow with an explicit target',
						description:
							'Keep the same local release lane visible in CI: generate types, build production output, dry-run the deploy, then push only with `--prod`.',
						filename: '.github/workflows/production.yml',
						language: 'yaml',
						code: String.raw`name: Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx --bun devflare types
      - run: bunx --bun devflare build --env production
      - run: bunx --bun devflare deploy --prod --dry-run
      - run: bunx --bun devflare deploy --prod`
					}
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
				title: 'Production deploys are explicit',
				paragraphs: [
					'Deploy requires an explicit target so production and preview stay unmistakable. Production is `--prod` or `--production`; preview is `--preview` or `--preview <name>`.',
					'Production deploys also clear preview-scope overrides like `DEVFLARE_PREVIEW_BRANCH` so stable worker names point at stable infrastructure.'
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
							'Intentional. Keeps production vs. preview intent visible in CI logs and command history.'
						]
					},
					{
						tone: 'info',
						title: 'Stricter verification in automation',
						body: [
							'The reusable deploy action exposes `verify-deployment` and `require-fresh-production-deployment` so CI can fail when Cloudflare cannot confirm the expected version.'
						]
					}
				]
			},
			{
				id: 'preflight',
				title: 'Preflight tools',
				bullets: [
					'`devflare deploy --prod --dry-run` — run the full deploy pipeline without pushing anything to Cloudflare.',
					'`devflare config print --format wrangler` — see the compiled deployment shape.',
					'`devflare doctor` — check config resolution, Vite opt-in, and generated files.',
					'`devflare build` before deploy — when the package just gained new bindings, routes, or framework wiring.'
				]
			}
		]
	}
]
