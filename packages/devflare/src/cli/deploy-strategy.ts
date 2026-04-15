import type { DevflareConfig } from '../config'

export type DeploymentStrategy = 'default' | 'preview-scope'

export interface ApplyDeploymentStrategyOptions {
	environment?: string
	preview?: boolean
	branchName?: string
	previewBranch?: string
}

export interface AppliedDeploymentStrategy {
	config: DevflareConfig
	strategy: DeploymentStrategy
	branchScope?: string
	omittedResources: Array<'queue-consumers' | 'cron-triggers'>
}

function normalizeBranchScope(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	return trimmed ? trimmed : undefined
}

function shouldIncludePreviewCrons(config: DevflareConfig): boolean {
	return config.previews?.includeCrons === true
}

function omitQueueConsumers(config: DevflareConfig): DevflareConfig {
	if (!config.bindings?.queues?.consumers?.length) {
		return config
	}

	const nextBindings = {
		...config.bindings
	}
	const nextQueues = {
		...nextBindings.queues
	}

	delete nextQueues.consumers

	if (!nextQueues.producers || Object.keys(nextQueues.producers).length === 0) {
		delete nextBindings.queues
	} else {
		nextBindings.queues = nextQueues
	}

	return {
		...config,
		bindings: nextBindings
	}
}

function omitCronTriggers(config: DevflareConfig): DevflareConfig {
	if (!config.triggers?.crons?.length) {
		return config
	}

	const nextTriggers = {
		...config.triggers
	}

	delete nextTriggers.crons

	if (Object.keys(nextTriggers).length === 0) {
		const { triggers: _triggers, ...rest } = config
		return rest
	}

	return {
		...config,
		triggers: nextTriggers
	}
}

export function applyDeploymentStrategy(
	config: DevflareConfig,
	options: ApplyDeploymentStrategyOptions = {}
): AppliedDeploymentStrategy {
	const branchScope = normalizeBranchScope(options.previewBranch) ?? normalizeBranchScope(options.branchName)
	const isBranchScopedPreviewDeploy = !options.preview && options.environment === 'preview' && Boolean(branchScope)

	if (!isBranchScopedPreviewDeploy) {
		return {
			config,
			strategy: 'default',
			omittedResources: []
		}
	}

	const omittedResources: AppliedDeploymentStrategy['omittedResources'] = []
	let nextConfig = config

	if (nextConfig.bindings?.queues?.consumers?.length) {
		nextConfig = omitQueueConsumers(nextConfig)
		omittedResources.push('queue-consumers')
	}

	if (!shouldIncludePreviewCrons(nextConfig) && nextConfig.triggers?.crons?.length) {
		nextConfig = omitCronTriggers(nextConfig)
		omittedResources.push('cron-triggers')
	}

	return {
		config: nextConfig,
		strategy: 'preview-scope',
		branchScope,
		omittedResources
	}
}

export function describeDeploymentStrategy(result: AppliedDeploymentStrategy): string | undefined {
	if (result.strategy !== 'preview-scope' || result.omittedResources.length === 0) {
		return undefined
	}

	const labels = result.omittedResources.map((resource) => {
		return resource === 'queue-consumers' ? 'queue consumers' : 'cron triggers'
	})
	const formattedLabels = labels.length === 2
		? `${labels[0]} and ${labels[1]}`
		: labels[0]
	const scopeSuffix = result.branchScope ? ` (${result.branchScope})` : ''

	return `Named preview-scope deploy detected${scopeSuffix}; omitting shared ${formattedLabels} from the deployed Wrangler config to avoid singleton Cloudflare resource conflicts.`
}