import { describe, expect, test } from 'bun:test'
import type { DevflareConfig } from '../../../src/config'
import { compileConfig } from '../../../src/config/compiler'
import { applyDeploymentStrategy, describeDeploymentStrategy } from '../../../src/cli/deploy-strategy'

function createQueueAndCronConfig(): DevflareConfig {
	return {
		name: 'strategy-preview-test',
		compatibilityDate: '2026-03-17',
		compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
		bindings: {
			queues: {
				producers: {
					TASK_QUEUE: 'task-queue'
				},
				consumers: [
					{
						queue: 'task-queue'
					}
				]
			}
		},
		triggers: {
			crons: ['0 * * * *']
		}
	}
}

function createQueueAndCronConfigWithPreviewCrons(): DevflareConfig {
	return {
		...createQueueAndCronConfig(),
		previews: {
			includeCrons: true
		}
	}
}

describe('deploy strategy integration', () => {
	test('branch-scoped preview deploy strategy omits queue consumers and cron triggers from emitted Wrangler config by default', () => {
		const config = createQueueAndCronConfig()
		const defaultWranglerConfig = compileConfig(config)
		const branchScopedPreview = applyDeploymentStrategy(config, {
			environment: 'preview',
			previewBranch: 'feature/queue-preview'
		})
		const branchPreviewWranglerConfig = compileConfig(branchScopedPreview.config)

		expect(defaultWranglerConfig.queues?.producers).toEqual([
			{ binding: 'TASK_QUEUE', queue: 'task-queue' }
		])
		expect(defaultWranglerConfig.queues?.consumers).toEqual([
			{ queue: 'task-queue' }
		])
		expect(defaultWranglerConfig.triggers?.crons).toEqual(['0 * * * *'])

		expect(branchScopedPreview.strategy).toBe('branch-scoped-preview')
		expect(branchScopedPreview.omittedResources).toEqual(['queue-consumers', 'cron-triggers'])
		expect(branchPreviewWranglerConfig.queues?.producers).toEqual([
			{ binding: 'TASK_QUEUE', queue: 'task-queue' }
		])
		expect(branchPreviewWranglerConfig.queues?.consumers).toBeUndefined()
		expect(branchPreviewWranglerConfig.triggers).toBeUndefined()
		expect(describeDeploymentStrategy(branchScopedPreview)).toContain('Branch-scoped preview deploy detected')
	})

	test('branch-scoped preview deploy strategy keeps cron triggers when previews.includeCrons is enabled', () => {
		const config = createQueueAndCronConfigWithPreviewCrons()
		const branchScopedPreview = applyDeploymentStrategy(config, {
			environment: 'preview',
			previewBranch: 'feature/cron-preview'
		})
		const branchPreviewWranglerConfig = compileConfig(branchScopedPreview.config)

		expect(branchScopedPreview.strategy).toBe('branch-scoped-preview')
		expect(branchScopedPreview.omittedResources).toEqual(['queue-consumers'])
		expect(branchPreviewWranglerConfig.queues?.consumers).toBeUndefined()
		expect(branchPreviewWranglerConfig.triggers?.crons).toEqual(['0 * * * *'])
		expect(describeDeploymentStrategy(branchScopedPreview)).toContain('queue consumers')
		expect(describeDeploymentStrategy(branchScopedPreview)).not.toContain('cron triggers')
	})

	test('deployment strategy keeps same-worker preview uploads unchanged', () => {
		const config = createQueueAndCronConfig()
		const sameWorkerPreview = applyDeploymentStrategy(config, {
			environment: 'preview',
			preview: true,
			branchName: 'feature/docs'
		})

		expect(sameWorkerPreview.strategy).toBe('default')
		expect(sameWorkerPreview.config).toBe(config)
		expect(sameWorkerPreview.omittedResources).toEqual([])
		expect(describeDeploymentStrategy(sameWorkerPreview)).toBeUndefined()
	})
})