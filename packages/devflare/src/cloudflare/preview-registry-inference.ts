import type {
	DevflareDeploymentRecord,
	DevflarePreviewScopeRecord,
	DevflarePreviewRecord,
	DevflareRecordSource
} from './registry-schema'
import type {
	ReconcilePreviewRegistryOptions,
	RetirePreviewRegistryOptions
} from './preview-registry-types'

export function toIsoString(date: Date | undefined): string | null {
	return date ? date.toISOString() : null
}

export function inferRecordSource(
	explicitSource: DevflareRecordSource | undefined,
	fallbackSource: string | undefined
): DevflareRecordSource {
	if (explicitSource) {
		return explicitSource
	}

	if (fallbackSource === 'dashboard') {
		return 'dashboard'
	}

	if (fallbackSource === 'workers-builds') {
		return 'workers-builds'
	}

	if (fallbackSource === 'wrangler') {
		return process.env.GITHUB_ACTIONS === 'true' ? 'github-action' : 'cli'
	}

	return 'unknown'
}

export function getPreviewRecordId(workerName: string, versionId: string): string {
	return `preview:${workerName}:${versionId}`
}

export function getPreviewScopeRecordId(workerName: string, scope: string): string {
	return `previewScope:${workerName}:${scope}`
}

export function getPreviewDeploymentId(workerName: string, versionId: string): string {
	return `preview:${workerName}:${versionId}`
}

export function getDeploymentRecordId(workerName: string, deploymentId: string): string {
	return `deployment:${workerName}:${deploymentId}`
}

export function hasRetireSelector(options: RetirePreviewRegistryOptions): boolean {
	return Boolean(
		options.branchName
		|| options.previewScope
		|| options.versionId
		|| options.commitSha
	)
}

function matchesRetireSelector(
	options: RetirePreviewRegistryOptions,
	candidate: {
		branchName?: string | null
		previewScope?: string | null
		versionId?: string | null
		commitSha?: string | null
	}
): boolean {
	return (options.branchName !== undefined && candidate.branchName === options.branchName)
		|| (options.previewScope !== undefined && candidate.previewScope === options.previewScope)
		|| (options.versionId !== undefined && candidate.versionId === options.versionId)
		|| (options.commitSha !== undefined && candidate.commitSha === options.commitSha)
}

function getPreviewRetireCandidate(record: {
	branchName?: string | null
	scope?: string | null
	versionId?: string | null
	commitSha?: string | null
}): {
	branchName?: string | null
	previewScope?: string | null
	versionId?: string | null
	commitSha?: string | null
} {
	return {
		branchName: record.branchName,
		previewScope: record.scope,
		versionId: record.versionId,
		commitSha: record.commitSha
	}
}

export function matchesPreviewRetireTarget(
	record: DevflarePreviewRecord,
	options: RetirePreviewRegistryOptions
): boolean {
	return matchesRetireSelector(options, getPreviewRetireCandidate(record))
}

export function matchesPreviewScopeRetireTarget(
	record: DevflarePreviewScopeRecord,
	options: RetirePreviewRegistryOptions
): boolean {
	return matchesRetireSelector(options, getPreviewRetireCandidate(record))
}

export function matchesPreviewDeploymentRetireTarget(
	record: DevflareDeploymentRecord,
	options: RetirePreviewRegistryOptions
): boolean {
	return record.channel === 'preview'
		&& matchesRetireSelector(options, {
			versionId: record.versionId,
			commitSha: record.commitSha
		})
}

export function getExplicitPreviewSyncOverrides(
	options: ReconcilePreviewRegistryOptions,
	versionId: string
): Pick<ReconcilePreviewRegistryOptions, 'previewScope' | 'previewUrl' | 'previewScopeUrl' | 'branchName' | 'commitSha'> {
	if (versionId !== options.versionId) {
		return {}
	}

	return {
		previewScope: options.previewScope,
		previewUrl: options.previewUrl,
		previewScopeUrl: options.previewScopeUrl,
		branchName: options.branchName,
		commitSha: options.commitSha
	}
}
