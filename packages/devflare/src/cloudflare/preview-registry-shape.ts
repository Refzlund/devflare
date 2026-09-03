import {
	getDeploymentRecordId,
	getPreviewDeploymentId,
	getPreviewRecordId,
	getPreviewScopeRecordId,
	inferRecordSource
} from './preview-registry-inference'
import { formatVersionPreviewUrl } from './preview-urls'
import {
	type DevflareDeploymentRecord,
	type DevflarePreviewRecord,
	type DevflarePreviewScopeRecord,
	type DevflareRecordSource,
	devflareDeploymentRecordSchema,
	devflarePreviewRecordSchema,
	devflarePreviewScopeRecordSchema
} from './registry-schema'
import type { WorkerDeploymentInfo, WorkerVersionInfo } from './types'

interface RegistryRecordParser<TRecord> {
	parse(value: unknown): TRecord
}

function markRecordDeleted<
	TRecord extends {
		updatedAt?: Date
		deletedAt?: Date
		status: string
	}
>(record: TRecord, now: Date, parser: RegistryRecordParser<TRecord>): TRecord {
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
	const previewUrl =
		options.previewUrl ??
		options.existing?.previewUrl ??
		(options.workersSubdomain
			? formatVersionPreviewUrl(options.version.id, options.workerName, options.workersSubdomain)
			: undefined)
	const scopeChanged =
		options.previewScope !== undefined && options.previewScope !== options.existing?.scope
	const scopeUrl =
		options.previewScopeUrl ??
		(options.previewScope !== undefined ? options.previewUrl : undefined) ??
		(!scopeChanged ? options.existing?.scopeUrl : undefined)

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
		branchName: options.previewRecord.branchName
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
		message: options.existing?.message
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
		source: inferRecordSource(
			options.source,
			options.version?.metadata.source ?? options.deployment.source
		)
	})
}

export function markPreviewRecordDeleted(
	record: DevflarePreviewRecord,
	now: Date
): DevflarePreviewRecord {
	return markRecordDeleted(record, now, devflarePreviewRecordSchema)
}

export function markPreviewScopeRecordDeleted(
	record: DevflarePreviewScopeRecord,
	now: Date
): DevflarePreviewScopeRecord {
	return markRecordDeleted(record, now, devflarePreviewScopeRecordSchema)
}

export function markDeploymentRecordDeleted(
	record: DevflareDeploymentRecord,
	now: Date
): DevflareDeploymentRecord {
	return markRecordDeleted(record, now, devflareDeploymentRecordSchema)
}
