import type { DocPage } from '../types'

const workflowRepoBase = 'https://github.com/Refzlund/devflare/blob/next/.github/workflows'
const workflowActionSourceBase = 'https://github.com/Refzlund/devflare/blob/next/.github/actions'
const workflowActionRepo = 'Refzlund/devflare/.github/actions'
const workflowActionRef = 'next'

const workflowLink = (file: string): string => `${workflowRepoBase}/${file}`
const workflowActionSourceLink = (action: string): string => `${workflowActionSourceBase}/${action}/action.yml`
const workflowActionUse = (action: string): string => `${workflowActionRepo}/${action}@${workflowActionRef}`
const docsLink = (slug: string): string => `/docs/${slug}`

const documentationPreviewWorkflowCode = String.raw`name: Preview

on:
	push:
	pull_request:
		types: [opened, reopened, ready_for_review, closed]
	delete:
	workflow_dispatch:

jobs:
	documentation-preview:
		steps:
			- uses: actions/checkout@v5

			- uses: ${workflowActionUse('devflare-setup-workspace')}

			- name: Resolve documentation preview impact
			  id: impact
			  uses: ${workflowActionUse('devflare-deploy-impact')}
			  with:
			    target-package: documentation

			- name: Deploy documentation branch preview
			  id: branch-deploy
			  if: \${{ needs.resolve-context.outputs.branch-preview-enabled == 'true' && steps.impact.outputs.should-deploy == 'true' }}
			  uses: ${workflowActionUse('devflare-deploy')}
			  with:
			    working-directory: apps/documentation
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    deploy-command: bun run deploy --
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- name: Deploy documentation PR preview
			  id: pr-deploy
			  if: \${{ needs.resolve-context.outputs.pr-preview-enabled == 'true' && steps.impact.outputs.should-deploy == 'true' }}
			  uses: ${workflowActionUse('devflare-deploy')}
			  with:
			    working-directory: apps/documentation
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    deploy-command: bun run deploy --
			    preview-scope: \${{ needs.resolve-context.outputs.pr-preview-scope }}

			- name: Publish documentation PR preview feedback
			  uses: ${workflowActionUse('devflare-github-feedback')}
			  with:
			    mode: comment
			    comment-key: pr-deployment-status`

const previewCleanupWorkflowCode = String.raw`name: Preview

on:
	delete:
	workflow_dispatch:

jobs:
	documentation-cleanup:
		steps:
			- name: Clean up documentation branch preview scope
			  shell: bash
			  run: |
			    cd apps/documentation
			    bunx --bun devflare previews cleanup --scope "$PREVIEW_SCOPE" --apply

			- name: Mark documentation branch preview deployment inactive
			  uses: ${workflowActionUse('devflare-github-feedback')}

	testing-cleanup:
		steps:
			- name: Clean up testing PR preview scope
			  shell: bash
			  run: |
			    cd apps/testing
			    bunx --bun devflare previews cleanup --scope "$PREVIEW_SCOPE" --apply

			- name: Publish testing PR preview cleanup feedback
			  uses: ${workflowActionUse('devflare-github-feedback')}`

const testingPreviewWorkflowCode = String.raw`name: Preview

jobs:
	testing-preview:
		steps:
			- uses: ${workflowActionUse('devflare-setup-workspace')}

			- uses: ${workflowActionUse('devflare-deploy')}
			  with:
			    working-directory: apps/testing/workers/auth-service
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- uses: ${workflowActionUse('devflare-deploy')}
			  with:
			    working-directory: apps/testing/workers/search-service
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- uses: ${workflowActionUse('devflare-deploy')}
			  with:
			    working-directory: apps/testing
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- uses: ${workflowActionUse('devflare-github-feedback')}
			  with:
			    mode: deployment

			- uses: ${workflowActionUse('devflare-github-feedback')}
			  with:
			    mode: comment
			    comment-key: pr-deployment-status`

const thinPreviewDeployStepCode = String.raw`- id: deploy
  uses: ${workflowActionUse('devflare-deploy')}
  with:
    working-directory: apps/documentation
    preview: 'true'
    branch-name: \${{ github.head_ref || github.ref_name }}
    cloudflare-api-token: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`

export const shipOperateDocs: DocPage[] = [
	{
		slug: 'github-workflows',
		group: 'Ship & operate',
		navTitle: 'GitHub workflows',
		readTime: '5 min read',
		eyebrow: 'CI/CD',
		title: 'Keep workflows thin — let reusable actions own the deploy mechanics',
		summary:
			'One validation workflow, one shared preview workflow, explicit production lanes, and four reusable actions for the repeatable parts.',
		description:
			'Workflows own triggers, permissions, and target selection. Reusable actions own setup, impact checks, deploy execution, and feedback.',
		highlights: [
			'`workspace-ci.yml` validates the monorepo — it never deploys.',
			'`preview.yml` resolves context once, then updates branch and PR targets separately.',
			'`devflare-deploy-impact` skips no-op deploys before touching Cloudflare.',
			'`devflare-setup-workspace`, `devflare-deploy`, and `devflare-github-feedback` keep the repeatable parts reusable.'
		],
		facts: [
			{ label: 'Best for', value: 'GitHub Actions with preview and production deploys' },
			{ label: 'Core split', value: 'Workflow owns policy, actions own mechanics' },
			{ label: 'Package selector', value: '`working-directory` picks which Devflare config deploys' }
		],
		sourcePages: [
			'.github/workflows/workspace-ci.yml',
			'.github/workflows/preview.yml',
			'.github/workflows/documentation-production.yml',
			workflowActionSourceLink('devflare-deploy-impact'),
			workflowActionSourceLink('devflare-setup-workspace'),
			workflowActionSourceLink('devflare-deploy'),
			workflowActionSourceLink('devflare-github-feedback'),
			'.github/scripts/verify-testing-preview-deployment.ts'
		],
		sections: [
			{
				id: 'workflow-shape',
				title: 'Workflows own policy, actions own mechanics',
				paragraphs: [
					'Workflow files decide when jobs run, which permissions they get, and which package they target. Reusable actions handle impact checks, installs, deploys, and feedback.',
					'Docs previews, testing preview families, and production deploys share the same actions without pretending they are the same deployment shape.'
				],
				bullets: [
					'Use triggers and path filters to gate whether a lane runs.',
					'Use `working-directory` to make the target package visible.',
					'Keep preview vs. production intent explicit.',
					'Outside this repo, reference `Refzlund/devflare/.github/actions/<action>@next`.',
					'Use feedback actions and summaries so the result is readable without raw logs.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Good review question',
						body: [
							'What triggered this workflow, which package is it acting on, and which deploy target will the action use?'
						]
					}
				]
			},
			{
				id: 'workspace-validation',
				title: 'Workspace CI validates — nothing else',
				paragraphs: [
					'`workspace-ci.yml` reacts to workspace-level changes, restores caches, installs once, and runs the `devflare:ci` lane.',
					'It proves the workspace builds and tests. It never picks a Cloudflare target or deploys anything.'
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
						title: 'Workspace CI keeps the validation lane in view',
						description:
							'This excerpt comes from the real repo workflow under `.github/workflows/workspace-ci.yml`, and the highlighted lines keep the validation job in focus so it reads like cached verification rather than a hidden deploy path.',
						files: [
							{
								label: 'workspace-ci.yml',
								language: 'yaml',
								focusLines: [[15, 21]],
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
				title: 'Check impact before deploying',
				paragraphs: [
					'`devflare-deploy-impact` compares the target package against the git range so the workflow can skip Cloudflare work when nothing relevant changed. It accepts `extra-paths` for shared files outside the package root.',
					'`preview.yml` resolves branch and PR context first, sets up the workspace once with `devflare-setup-workspace`, then makes target-specific `devflare-deploy` calls. Later deploy steps set `skip-setup` and `skip-install` to avoid repeating Bun setup.',
					'The documentation preview job is the clearest example — one prepared job refreshes both the branch preview and the PR preview.'
				],
				cards: [
					{
						title: 'preview.yml',
						body: 'Shared preview workflow for documentation and testing branch previews, PR previews, and cleanup flows.',
						href: workflowLink('preview.yml')
					},
					{
						title: 'documentation-production.yml',
						body: 'Explicit docs production deploy lane with live verification after deploy.',
						href: workflowLink('documentation-production.yml')
					}
				],
				snippets: [
					{
						title: 'Prepare the documentation preview job',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Action references use the public `Refzlund/devflare/...@next` form.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[13, 15]],
								code: documentationPreviewWorkflowCode
							}
						]
					},
					{
						title: 'Impact check before Cloudflare work',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Skips the deploy when the package did not change.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[17, 21]],
								code: documentationPreviewWorkflowCode
							}
						]
					},
					{
						title: 'Branch and PR deploy targets',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Two separate `devflare-deploy` calls keep branch and PR scopes reviewable.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[23, 33], [35, 45]],
								code: documentationPreviewWorkflowCode
							}
						]
					},
					{
						title: 'PR feedback',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Feedback runs after the deploy decisions are made.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[47, 51]],
								code: documentationPreviewWorkflowCode
							}
						]
					}
				],
				bullets: [
					'Set `production: true`, `preview: true`, or `preview-scope: <name>` exactly once per deploy call.',
					'Use `devflare-setup-workspace` when one job deploys multiple targets from the same checkout.',
					'Set `skip-setup` and `skip-install` on later deploy calls after a shared setup.',
					'Keep branch and PR deploys separate — the target is part of the policy.',
					'Use `extra-paths` on the impact action for shared files outside the package root.',
					'Use `install-working-directory` to reuse a shared root install in a monorepo.',
					'Pass branch names, preview scopes, and messages explicitly so intent is visible in logs.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Build once, deploy twice',
						body: [
							'The shared work is the checkout and install. Target selection stays in each deploy step so branch and PR targets remain reviewable.'
						]
					}
				]
			},
			{
				id: 'feedback-and-verification',
				title: 'Feedback and verification',
				paragraphs: [
					'Preview workflows publish branch deployment feedback and grouped PR comments. Production stays in its own deploy-and-verify lane.',
					'Reporting stays separate from deploy mechanics, so a failed verification surfaces cleanly.'
				],
				table: {
					headers: ['Workflow file', 'When it runs', 'GitHub feedback'],
					rows: [
						['`preview.yml`', 'Non-default branch pushes, PR lifecycle events, branch deletion, manual dispatch', 'Branch deployments, grouped PR comments, inactive cleanup updates.'],
						['`documentation-production.yml`', 'Default branch pushes or manual dispatch', 'Production deployment record, live URL verification.'],
						['`workspace-ci.yml`', 'Workspace PRs, selected branch pushes, manual dispatch', 'None — validation only.']
					]
				},
				bullets: [
					'Use `devflare-github-feedback` for PR comments, GitHub deployments, or both.',
					'Keep preview and production URLs visible in workflow output.',
					'Fail the workflow when deploy or live verification says the result is bad.',
					'Use `GITHUB_STEP_SUMMARY` for a readable outcome.'
				],
				callouts: [
					{
						tone: 'success',
						title: 'What this optimizes for',
						body: [
							'Clear triggers, explicit targets, reusable actions, and observable feedback.'
						]
					}
				]
			},
			{
				id: 'cleanup-workflows',
				title: 'Cleanup is first-class',
				paragraphs: [
					'Cleanup lives inside `preview.yml`. Deleted branches and manual dispatches reuse the same cleanup jobs; PR-scoped previews clean up when the pull request closes.',
					'Each cleanup job checks out the default branch, runs `devflare previews cleanup --scope <name> --apply`, and marks matching GitHub feedback inactive.'
				],
				cards: [
					{
						title: 'preview.yml',
						body: 'Preview lifecycle workflow — also owns branch cleanup, PR-close cleanup, and manual dispatches.',
						href: workflowLink('preview.yml')
					}
				],
				bullets: [
					'Branch deletion and manual cleanup dispatches share the same workflow file.',
					'PR closure cleanup sits beside the deploy jobs so the full lifecycle is reviewable in one place.',
					'Cleanup updates records, removes infrastructure, then marks feedback inactive.'
				],
				snippets: [
					{
						title: 'Documentation branch cleanup',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Uses the public feedback action reference.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[10, 17]],
								code: previewCleanupWorkflowCode
							}
						]
					},
					{
						title: 'Testing PR cleanup',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Same pattern, PR-scoped.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[21, 28]],
								code: previewCleanupWorkflowCode
							}
						]
					}
				]
			},
			{
				id: 'multi-package-preview-families',
				title: 'Multi-worker previews deploy per-package',
				paragraphs: [
					'The testing preview job shows the multi-worker version: one shared job prepares the workspace, then deploys each worker separately with its own `working-directory` and preview scope.',
					'One workflow can coordinate the family, but each package still owns its own Devflare config and deploy step.'
				],
				cards: [
					{
						title: 'preview.yml',
						body: 'Testing preview job — coordinates auth-service, search-service, and the main app.',
						href: workflowLink('preview.yml')
					}
				],
				snippets: [
					{
						title: 'Shared workspace setup',
						description:
							'Excerpt from `.github/workflows/preview.yml`. One setup action, then per-package deploys.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [6],
								code: testingPreviewWorkflowCode
							}
						]
					},
					{
						title: 'Per-package deploys with shared scope',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Each package gets its own `devflare-deploy` call and visible `working-directory`.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[8, 14], [16, 22], [24, 30]],
								code: testingPreviewWorkflowCode
							}
						]
					},
					{
						title: 'Separate deployment and PR feedback',
						description:
							'Excerpt from `.github/workflows/preview.yml`. Deployment records and PR comments stay independent.',
						files: [
							{
								label: 'preview.yml',
								language: 'yaml',
								focusLines: [[32, 39]],
								code: testingPreviewWorkflowCode
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
			{ label: 'Required target', value: '`--prod`, `--production`, `--preview`, or `--preview <name>`' },
			{ label: 'Best debug habit', value: 'Inspect compiled output before deploying' }
		],
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
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
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
		sections: [
			{
				id: 'choose-model',
				title: 'More than one preview model',
				table: {
					headers: ['Preview style', 'Use it when'],
					rows: [
						['Plain `--preview`', 'You want a same-worker preview upload and the synthetic `preview` identifier is enough for any `preview.scope()` resource names.'],
						['Named `--preview <name>`', 'You need an explicit preview identifier for resource names or branch-scoped preview workers.'],
						['Branch-scoped worker family', 'The app is Durable Object-heavy or otherwise needs stronger isolation than same-worker preview uploads can provide.']
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
			{ label: 'Cleanup warning', value: 'Dedicated preview workers may own more than just the script' }
		],
		sourcePages: ['deploy-preview-cli.md', 'README.md'],
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
						['`waitUntil()` side effects from an HTTP handler', 'Assert the side effect directly or move to a higher-fidelity check.', '`cf.worker.fetch()` returns when the handler resolves, not when every background task drains.'],
						['Queue, scheduled, or tail background work', '`cf.queue.trigger()`, `cf.scheduled.trigger()`, or `cf.tail.trigger()`', 'Those helpers wait for their background work before they return, so they are a better fit for async side-effect assertions.'],
						['Binding-specific or transport-specific behavior', 'The binding guide or `create-test-context` page first', 'Different bindings and bridge-backed values have different honest harness rules, and the local testing pages already own those details.']
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
						body: 'The workflow page owns the deeper repo examples for impact checks, reusable actions, PR feedback, and cleanup jobs.'
					}
				]
			}
		]
	},
]
