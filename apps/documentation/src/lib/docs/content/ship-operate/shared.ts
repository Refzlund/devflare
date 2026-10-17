import type { DocPage } from '../../types'

export const workflowRepoBase = 'https://github.com/Refzlund/devflare/blob/next/.github/workflows'

export const workflowActionSourceBase =
	'https://github.com/Refzlund/devflare/blob/next/.github/actions'

export const workflowScriptBase = 'https://github.com/Refzlund/devflare/blob/next/.github/scripts'

export const workflowActionRepo = 'Refzlund/devflare/.github/actions'

export const workflowActionRef = 'next'

export const workflowLink = (file: string): string => `${workflowRepoBase}/${file}`

export const workflowActionSourceLink = (action: string): string =>
	`${workflowActionSourceBase}/${action}/action.yml`

export const workflowScriptLink = (file: string): string => `${workflowScriptBase}/${file}`

export const workflowActionUse = (action: string): string =>
	`${workflowActionRepo}/${action}@${workflowActionRef}`

export const docsLink = (slug: string): string => `/docs/${slug}`

export const setupWorkspaceActionCode = String.raw`- uses: ${workflowActionUse('devflare-setup-workspace')}
  with:
    working-directory: .`

export const deployImpactActionCode = String.raw`- name: Resolve documentation preview impact
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

export const previewDeployActionCode = String.raw`- id: pr-deploy
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

export const productionDeployActionCode = String.raw`- id: deploy
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

export const githubFeedbackCommentCode = String.raw`- uses: ${workflowActionUse('devflare-github-feedback')}
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

export const thinPreviewDeployStepCode = String.raw`- id: deploy
  uses: ${workflowActionUse('devflare-deploy')}
  with:
    working-directory: apps/documentation
    deploy-command: bun run deploy --
    preview-scope: \${{ github.head_ref || github.ref_name }}
    verify-deployment: 'false'
    cloudflare-api-token: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`
