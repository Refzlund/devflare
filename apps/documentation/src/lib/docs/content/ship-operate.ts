import type { DocPage } from '../types'

const workflowRepoBase = 'https://github.com/Refzlund/devflare/blob/next/.github/workflows'
const workflowActionSourceBase = 'https://github.com/Refzlund/devflare/blob/next/.github/actions'
const workflowScriptBase = 'https://github.com/Refzlund/devflare/blob/next/.github/scripts'
const workflowActionRepo = 'Refzlund/devflare/.github/actions'
const workflowActionRef = 'next'

const workflowLink = (file: string): string => `${workflowRepoBase}/${file}`
const workflowActionSourceLink = (action: string): string =>
	`${workflowActionSourceBase}/${action}/action.yml`
const workflowScriptLink = (file: string): string => `${workflowScriptBase}/${file}`
const workflowActionUse = (action: string): string =>
	`${workflowActionRepo}/${action}@${workflowActionRef}`
const docsLink = (slug: string): string => `/docs/${slug}`

const setupWorkspaceActionCode = String.raw`- uses: ${workflowActionUse('devflare-setup-workspace')}
  with:
    working-directory: .`

const deployImpactActionCode = String.raw`- name: Resolve documentation preview impact
  id: impact
  uses: ${workflowActionUse('devflare-deploy-impact')}
  with:
    target-package: documentation
    default-branch: \${{ github.event.repository.default_branch }}
    event-name: \${{ github.event_name }}
    event-action: \${{ github.event.action || '' }}
    push-before: \${{ github.event.before || '' }}
    pull-request-base-sha: \${{ github.event.pull_request.base.sha || '' }}
    pull-request-head-sha: \${{ github.event.pull_request.head.sha || '' }}`

const previewDeployActionCode = String.raw`- id: pr-deploy
  uses: ${workflowActionUse('devflare-deploy')}
  with:
    working-directory: apps/documentation
    install-working-directory: .
    skip-setup: 'true'
    skip-install: 'true'
    deploy-command: bun run deploy --
    preview-scope: \${{ needs.resolve-context.outputs.pr-preview-scope }}
    verify-deployment: 'false'
    deploy-message: Documentation PR preview \${{ github.sha }} (run \${{ github.run_id }})
    deploy-tag: documentation-pr-preview-\${{ github.run_id }}
    cloudflare-api-token: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`

const productionDeployActionCode = String.raw`- id: deploy
  uses: ${workflowActionUse('devflare-deploy')}
  with:
    working-directory: apps/documentation
    install-working-directory: .
    deploy-command: bun run deploy --
    production: 'true'
    deploy-message: Documentation production \${{ github.sha }} (run \${{ github.run_id }})
    deploy-tag: documentation-production-\${{ github.run_id }}
    cloudflare-api-token: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`

const githubFeedbackCommentCode = String.raw`- uses: ${workflowActionUse('devflare-github-feedback')}
  with:
    github-token: \${{ github.token }}
    mode: comment
    operation: report
    status: success
    title: Documentation PR preview
    comment-key: pr-deployment-status
    comment-section-key: documentation-preview
    pr-number: \${{ needs.resolve-context.outputs.pr-number }}
    preview-url: \${{ steps.pr-deploy.outputs.preview-url }}
    version-id: \${{ steps.pr-deploy.outputs.version-id }}
    log-url: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}`

const thinPreviewDeployStepCode = String.raw`- id: deploy
  uses: ${workflowActionUse('devflare-deploy')}
  with:
    working-directory: apps/documentation
    deploy-command: bun run deploy --
    preview-scope: \${{ github.head_ref || github.ref_name }}
    verify-deployment: 'false'
    cloudflare-api-token: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`

export const shipOperateDocs: DocPage[] = [
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
	},
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
