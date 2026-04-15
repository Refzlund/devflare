import { getWorkerVersionDetail } from './account-workers'
import type { APIClientOptions } from './api'
import type {
	WorkerDeploymentInfo,
	WorkerVersionInfo
} from './types'
import {
	devflareDeploymentRecordSchema,
	devflarePreviewScopeRecordSchema,
	devflarePreviewRecordSchema,
	type DevflareDeploymentRecord,
	type DevflarePreviewScopeRecord,
	type DevflarePreviewRecord,
	type DevflareRecordSource
} from './registry-schema'
import type {
	ReconcilePreviewRegistryOptions,
	RetirePreviewRegistryOptions
} from './preview-registry-types'
import { formatVersionPreviewUrl } from '../cli/preview'

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

interface RegistryRecordParser<TRecord> {
	parse(value: unknown): TRecord
}

function markRecordDeleted<TRecord extends {
	updatedAt?: Date
	deletedAt?: Date
	status: string
}>(
	record: TRecord,
	now: Date,
	parser: RegistryRecordParser<TRecord>
): TRecord {
	return parser.parse({
		...record,
		updatedAt: now,
		deletedAt: now,
		status: 'deleted'
	})
}

function getVersionAuthorId(
	version: WorkerVersionInfo | undefined,
	existingCreatedBy: string | undefined
): string {
	return version?.metadata.authorId || existingCreatedBy || 'unknown'
}

function createPreviewLinkedRecordBase(options: {
	accountId: string
	workerName: string
	previewRecord: DevflarePreviewRecord
	existingCreatedAt?: Date
	now: Date
}): {
	createdAt: Date
	updatedAt: Date
	deletedAt: undefined
	createdBy: string
	accountId: string
	workerName: string
	versionId: string
	previewId: string
	commitSha?: string
	source: DevflareRecordSource
	status: 'active'
} {
	return {
		createdAt: options.existingCreatedAt ?? options.previewRecord.createdAt,
		updatedAt: options.now,
		deletedAt: undefined,
		createdBy: options.previewRecord.createdBy,
		accountId: options.accountId,
		workerName: options.workerName,
		versionId: options.previewRecord.versionId,
		previewId: options.previewRecord.id,
		commitSha: options.previewRecord.commitSha,
		source: options.previewRecord.source,
		status: 'active'
	}
}

export function buildPreviewRecord(options: {
	accountId: string
	workerName: string
	version: WorkerVersionInfo
	existing?: DevflarePreviewRecord
	workersSubdomain?: string | null
	previewScope?: string
	previewUrl?: string
	previewScopeUrl?: string
	branchName?: string
	commitSha?: string
	source?: DevflareRecordSource
	now: Date
}): DevflarePreviewRecord | null {
	const scope = options.previewScope ?? options.existing?.scope
	const previewUrl = options.previewUrl
		?? options.existing?.previewUrl
		?? (options.workersSubdomain
			? formatVersionPreviewUrl(options.version.id, options.workerName, options.workersSubdomain)
			: undefined)
	const scopeChanged = options.previewScope !== undefined && options.previewScope !== options.existing?.scope
	const scopeUrl = options.previewScopeUrl
		?? (options.previewScope !== undefined ? options.previewUrl : undefined)
		?? (!scopeChanged ? options.existing?.scopeUrl : undefined)

	if (!previewUrl) {
		return null
	}

	return devflarePreviewRecordSchema.parse({
		id: getPreviewRecordId(options.workerName, options.version.id),
		kind: 'preview',
		ver: 1,
		createdAt: options.existing?.createdAt ?? options.version.metadata.createdOn ?? options.now,
		updatedAt: options.now,
		deletedAt: undefined,
		createdBy: getVersionAuthorId(options.version, options.existing?.createdBy),
		accountId: options.accountId,
		workerName: options.workerName,
		versionId: options.version.id,
		previewUrl,
		scope,
		scopeUrl,
		branchName: options.branchName ?? options.existing?.branchName,
		commitSha: options.commitSha ?? options.existing?.commitSha,
		deploymentId: options.existing?.deploymentId,
		source: inferRecordSource(options.source, options.version.metadata.source),
		status: 'active'
	})
}

export function buildPreviewScopeRecord(options: {
	accountId: string
	workerName: string
	previewRecord: DevflarePreviewRecord
	existing?: DevflarePreviewScopeRecord
	now: Date
}): DevflarePreviewScopeRecord | null {
	if (!options.previewRecord.scope || !options.previewRecord.scopeUrl) {
		return null
	}

	return devflarePreviewScopeRecordSchema.parse({
		id: getPreviewScopeRecordId(options.workerName, options.previewRecord.scope),
		kind: 'previewScope',
		ver: 1,
		...createPreviewLinkedRecordBase({
			accountId: options.accountId,
			workerName: options.workerName,
			previewRecord: options.previewRecord,
			existingCreatedAt: options.existing?.createdAt,
			now: options.now
		}),
		scope: options.previewRecord.scope,
		scopeUrl: options.previewRecord.scopeUrl,
		branchName: options.previewRecord.branchName,
	})
}

export function buildPreviewDeploymentRecord(options: {
	accountId: string
	workerName: string
	previewRecord: DevflarePreviewRecord
	existing?: DevflareDeploymentRecord
	now: Date
}): DevflareDeploymentRecord {
	const deploymentId = getPreviewDeploymentId(options.workerName, options.previewRecord.versionId)
	return devflareDeploymentRecordSchema.parse({
		id: getDeploymentRecordId(options.workerName, deploymentId),
		kind: 'deployment',
		ver: 1,
		...createPreviewLinkedRecordBase({
			accountId: options.accountId,
			workerName: options.workerName,
			previewRecord: options.previewRecord,
			existingCreatedAt: options.existing?.createdAt,
			now: options.now
		}),
		deploymentId,
		channel: 'preview',
		environment: 'preview',
		url: options.previewRecord.scopeUrl ?? options.previewRecord.previewUrl,
		message: options.existing?.message,
	})
}

export function buildProductionDeploymentRecord(options: {
	accountId: string
	workerName: string
	deployment: WorkerDeploymentInfo
	version: WorkerVersionInfo | undefined
	existing?: DevflareDeploymentRecord
	workersSubdomain?: string | null
	source?: DevflareRecordSource
	commitSha?: string
	deploymentMessage?: string
	status: 'active' | 'superseded'
	now: Date
}): DevflareDeploymentRecord | null {
	const versionId = options.deployment.versions[0]?.versionId
	if (!versionId) {
		return null
	}

	const productionUrl = options.workersSubdomain
		? `https://${options.workerName}.${options.workersSubdomain}.workers.dev`
		: options.existing?.url

	return devflareDeploymentRecordSchema.parse({
		id: getDeploymentRecordId(options.workerName, options.deployment.id),
		kind: 'deployment',
		ver: 1,
		createdAt: options.existing?.createdAt ?? options.deployment.createdOn,
		updatedAt: options.now,
		deletedAt: undefined,
		createdBy: getVersionAuthorId(options.version, options.existing?.createdBy),
		accountId: options.accountId,
		workerName: options.workerName,
		deploymentId: options.deployment.id,
		channel: 'production',
		status: options.status,
		versionId,
		environment: 'production',
		url: productionUrl,
		message: options.deploymentMessage ?? options.deployment.message ?? options.existing?.message,
		commitSha: options.commitSha ?? options.existing?.commitSha,
		source: inferRecordSource(options.source, options.version?.metadata.source ?? options.deployment.source)
	})
}

export async function getVersionInfoById(
	accountId: string,
	workerName: string,
	versionId: string,
	versionMap: Map<string, WorkerVersionInfo>,
	apiOptions?: APIClientOptions
): Promise<WorkerVersionInfo | undefined> {
	const existing = versionMap.get(versionId)
	if (existing) {
		return existing
	}

	try {
		const version = await getWorkerVersionDetail(accountId, workerName, versionId, apiOptions)
		versionMap.set(versionId, version)
		return version
	} catch {
		return undefined
	}
}

export function markPreviewRecordDeleted(record: DevflarePreviewRecord, now: Date): DevflarePreviewRecord {
	return markRecordDeleted(record, now, devflarePreviewRecordSchema)
}

export function markPreviewScopeRecordDeleted(record: DevflarePreviewScopeRecord, now: Date): DevflarePreviewScopeRecord {
	return markRecordDeleted(record, now, devflarePreviewScopeRecordSchema)
}

export function markDeploymentRecordDeleted(record: DevflareDeploymentRecord, now: Date): DevflareDeploymentRecord {
	return markRecordDeleted(record, now, devflareDeploymentRecordSchema)
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
