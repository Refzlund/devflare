import { createD1Database, getWorkersSubdomain, listD1Databases, listWorkerDeployments, listWorkerVersions } from './account'
import type { APIClientOptions } from './api'
import { cachePreviewRegistryContext, clearCachedPreviewRegistryContext, getCachedPreviewRegistryContext, getRegistryDatabaseName } from './preview-registry-cache'
import {
	buildPreviewAliasRecord,
	buildPreviewDeploymentRecord,
	buildPreviewRecord,
	buildProductionDeploymentRecord,
	getExplicitPreviewSyncOverrides,
	getPreviewDeploymentId,
	getVersionInfoById,
	hasRetireSelector,
	markDeploymentRecordDeleted,
	markPreviewAliasRecordDeleted,
	markPreviewRecordDeleted,
	matchesPreviewAliasRetireTarget,
	matchesPreviewDeploymentRetireTarget,
	matchesPreviewRetireTarget
} from './preview-registry-records'
import {
	clearPreviewRegistrySchemaCache,
	ensurePreviewRegistrySchema,
	isMissingRegistrySchemaError,
	isUnavailableRegistryContextError,
	readDeploymentRows,
	readPreviewAliasRows,
	readPreviewRows,
	upsertDeploymentRecord,
	upsertPreviewAliasRecord,
	upsertPreviewRecord
} from './preview-registry-store'
import type {
	CleanupPreviewRegistryOptions,
	CleanupPreviewRegistryResult,
	ListTrackedRecordsOptions,
	ListTrackedRegistryStateOptions,
	PreviewRegistryContext,
	ReconcilePreviewRegistryOptions,
	ReconcilePreviewRegistryResult,
	RetirePreviewRegistryOptions,
	RetirePreviewRegistryResult
} from './preview-registry-types'

export { DEVFLARE_PREVIEW_REGISTRY_DATABASE } from './preview-registry-types'
export type {
	CleanupPreviewRegistryOptions,
	CleanupPreviewRegistryResult,
	ListTrackedRecordsOptions,
	ListTrackedRegistryStateOptions,
	PreviewRegistryContext,
	ReconcilePreviewRegistryOptions,
	ReconcilePreviewRegistryResult,
	RetirePreviewRegistryOptions,
	RetirePreviewRegistryResult
} from './preview-registry-types'

async function withRegistryReadRecovery<T>(
	registry: PreviewRegistryContext,
	apiOptions: APIClientOptions | undefined,
	operation: (activeRegistry: PreviewRegistryContext) => Promise<T>
): Promise<{ registry: PreviewRegistryContext; result: T }> {
	try {
		return {
			registry,
			result: await operation(registry)
		}
	} catch (error) {
		if (isMissingRegistrySchemaError(error)) {
			clearPreviewRegistrySchemaCache(registry.databaseId)
			await ensurePreviewRegistrySchema(registry, apiOptions)
			return {
				registry,
				result: await operation(registry)
			}
		}

		if (!isUnavailableRegistryContextError(error)) {
			throw error
		}

		clearCachedPreviewRegistryContext(registry.accountId, registry.databaseName)
		const refreshedRegistry = await ensurePreviewRegistry({
			accountId: registry.accountId,
			databaseName: registry.databaseName,
			apiOptions,
			skipContextCache: true
		})

		return {
			registry: refreshedRegistry,
			result: await operation(refreshedRegistry)
		}
	}
}

async function loadTrackedRegistryRows(
	registry: PreviewRegistryContext,
	workerName: string | undefined,
	apiOptions?: APIClientOptions
): Promise<{
	previews: Awaited<ReturnType<typeof readPreviewRows>>
	aliases: Awaited<ReturnType<typeof readPreviewAliasRows>>
	deployments: Awaited<ReturnType<typeof readDeploymentRows>>
}> {
	const [previews, aliases, deployments] = await Promise.all([
		readPreviewRows(registry, workerName, apiOptions),
		readPreviewAliasRows(registry, workerName, apiOptions),
		readDeploymentRows(registry, workerName, apiOptions)
	])

	return {
		previews,
		aliases,
		deployments
	}
}

async function applyDeletedRecords(
	registry: PreviewRegistryContext,
	options: {
		previews: Awaited<ReturnType<typeof readPreviewRows>>
		aliases: Awaited<ReturnType<typeof readPreviewAliasRows>>
		deployments: Awaited<ReturnType<typeof readDeploymentRows>>
		now: Date
		apiOptions?: APIClientOptions
	}
): Promise<void> {
	for (const preview of options.previews) {
		await upsertPreviewRecord(registry, markPreviewRecordDeleted(preview, options.now), options.apiOptions)
	}

	for (const alias of options.aliases) {
		await upsertPreviewAliasRecord(registry, markPreviewAliasRecordDeleted(alias, options.now), options.apiOptions)
	}

	for (const deployment of options.deployments) {
		await upsertDeploymentRecord(registry, markDeploymentRecordDeleted(deployment, options.now), options.apiOptions)
	}
}

export async function getPreviewRegistryContext(options: {
	accountId: string
	databaseName?: string
	apiOptions?: APIClientOptions
	skipContextCache?: boolean
}): Promise<PreviewRegistryContext | null> {
	const databaseName = getRegistryDatabaseName(options.databaseName)
	if (options.skipContextCache !== true) {
		const cached = getCachedPreviewRegistryContext(options.accountId, databaseName)
		if (cached) {
			return cached
		}
	}

	const databases = await listD1Databases(options.accountId, options.apiOptions)
	const existing = databases.find((database) => database.name === databaseName)

	if (!existing) {
		return null
	}

	const registry = {
		accountId: options.accountId,
		databaseId: existing.id,
		databaseName,
		created: false
	}
	cachePreviewRegistryContext(registry)
	return registry
}

export async function ensurePreviewRegistry(options: {
	accountId: string
	databaseName?: string
	apiOptions?: APIClientOptions
	logger?: { info?: (message: string) => void }
	skipSchemaIfExisting?: boolean
	skipContextCache?: boolean
}): Promise<PreviewRegistryContext> {
	const existingContext = await getPreviewRegistryContext(options)
	let registry = existingContext

	if (!registry) {
		const created = await createD1Database(
			options.accountId,
			getRegistryDatabaseName(options.databaseName),
			options.apiOptions
		)
		registry = {
			accountId: options.accountId,
			databaseId: created.id,
			databaseName: created.name,
			created: true
		}
		cachePreviewRegistryContext(registry)
		options.logger?.info?.(`Created Devflare preview registry D1 database: ${registry.databaseName}`)
	}

	if (registry.created || options.skipSchemaIfExisting !== true) {
		await ensurePreviewRegistrySchema(registry, options.apiOptions)
	}

	return registry
}

export async function listTrackedRegistryState(
	options: ListTrackedRegistryStateOptions
): Promise<{
	previews: Awaited<ReturnType<typeof readPreviewRows>>
	aliases: Awaited<ReturnType<typeof readPreviewAliasRows>>
	deployments: Awaited<ReturnType<typeof readDeploymentRows>>
}> {
	const { result } = await withRegistryReadRecovery(options.registry, options.apiOptions, async (registry) => {
		return loadTrackedRegistryRows(registry, options.workerName, options.apiOptions)
	})

	return result
}

export async function listTrackedPreviewRecords(
	options: ListTrackedRecordsOptions
): Promise<{ registry: PreviewRegistryContext; records: Awaited<ReturnType<typeof readPreviewRows>> }> {
	const registry = await ensurePreviewRegistry({
		accountId: options.accountId,
		databaseName: options.databaseName,
		apiOptions: options.apiOptions,
		skipSchemaIfExisting: true
	})

	const { registry: resolvedRegistry, result } = await withRegistryReadRecovery(
		registry,
		options.apiOptions,
		(activeRegistry) => readPreviewRows(activeRegistry, options.workerName, options.apiOptions)
	)

	return {
		registry: resolvedRegistry,
		records: result
	}
}

export async function listTrackedPreviewAliasRecords(
	options: ListTrackedRecordsOptions
): Promise<{ registry: PreviewRegistryContext; records: Awaited<ReturnType<typeof readPreviewAliasRows>> }> {
	const registry = await ensurePreviewRegistry({
		accountId: options.accountId,
		databaseName: options.databaseName,
		apiOptions: options.apiOptions,
		skipSchemaIfExisting: true
	})

	const { registry: resolvedRegistry, result } = await withRegistryReadRecovery(
		registry,
		options.apiOptions,
		(activeRegistry) => readPreviewAliasRows(activeRegistry, options.workerName, options.apiOptions)
	)

	return {
		registry: resolvedRegistry,
		records: result
	}
}

export async function listTrackedDeploymentRecords(
	options: ListTrackedRecordsOptions
): Promise<{ registry: PreviewRegistryContext; records: Awaited<ReturnType<typeof readDeploymentRows>> }> {
	const registry = await ensurePreviewRegistry({
		accountId: options.accountId,
		databaseName: options.databaseName,
		apiOptions: options.apiOptions,
		skipSchemaIfExisting: true
	})

	const { registry: resolvedRegistry, result } = await withRegistryReadRecovery(
		registry,
		options.apiOptions,
		(activeRegistry) => readDeploymentRows(activeRegistry, options.workerName, options.apiOptions)
	)

	return {
		registry: resolvedRegistry,
		records: result
	}
}

export async function reconcilePreviewRegistry(
	options: ReconcilePreviewRegistryOptions
): Promise<ReconcilePreviewRegistryResult> {
	const now = options.now ?? new Date()
	const registry = await ensurePreviewRegistry({
		accountId: options.accountId,
		databaseName: options.databaseName,
		apiOptions: options.apiOptions,
		logger: options.logger
	})
	const workersSubdomain = await getWorkersSubdomain(options.accountId, options.apiOptions)
	const liveVersions = await listWorkerVersions(options.accountId, options.workerName, options.apiOptions)
	const liveDeployments = await listWorkerDeployments(options.accountId, options.workerName, options.apiOptions)
	const { previews: previewRecords, aliases: aliasRecords, deployments: deploymentRecords } = await loadTrackedRegistryRows(
		registry,
		options.workerName,
		options.apiOptions
	)
	const previewRecordByVersionId = new Map(previewRecords.map((record) => [record.versionId, record]))
	const previewAliasRecordByAlias = new Map(aliasRecords.map((record) => [record.alias, record]))
	const deploymentRecordById = new Map(deploymentRecords.map((record) => [record.deploymentId, record]))
	const syncedPreviews: typeof previewRecords = []
	const syncedAliases: typeof aliasRecords = []
	const syncedDeployments: typeof deploymentRecords = []
	const versionMetadataMap = new Map(liveVersions.map((version) => [version.id, version]))
	const previewVersions = [...liveVersions.filter((candidate) => candidate.metadata.hasPreview)]

	if (
		options.versionId
		&& (options.previewUrl || options.previewAliasUrl || options.previewAlias)
		&& !previewVersions.some((version) => version.id === options.versionId)
	) {
		const explicitPreviewVersion = await getVersionInfoById(
			options.accountId,
			options.workerName,
			options.versionId,
			versionMetadataMap,
			options.apiOptions
		)

		if (explicitPreviewVersion) {
			previewVersions.unshift({
				...explicitPreviewVersion,
				metadata: {
					...explicitPreviewVersion.metadata,
					hasPreview: true
				}
			})
		}
	}

	for (const version of previewVersions) {
		const previewRecord = buildPreviewRecord({
			accountId: options.accountId,
			workerName: options.workerName,
			version,
			existing: previewRecordByVersionId.get(version.id),
			workersSubdomain,
			...getExplicitPreviewSyncOverrides(options, version.id),
			source: options.source,
			now
		})

		if (!previewRecord) {
			options.logger?.warn?.(`Skipping preview registry sync for ${version.id} because no preview URL could be determined.`)
			continue
		}

		await upsertPreviewRecord(registry, previewRecord, options.apiOptions)
		syncedPreviews.push(previewRecord)

		const aliasRecord = buildPreviewAliasRecord({
			accountId: options.accountId,
			workerName: options.workerName,
			previewRecord,
			existing: previewRecord.alias ? previewAliasRecordByAlias.get(previewRecord.alias) : undefined,
			now
		})

		if (aliasRecord) {
			await upsertPreviewAliasRecord(registry, aliasRecord, options.apiOptions)
			syncedAliases.push(aliasRecord)
		}

		const previewDeploymentRecord = buildPreviewDeploymentRecord({
			accountId: options.accountId,
			workerName: options.workerName,
			previewRecord,
			existing: deploymentRecordById.get(getPreviewDeploymentId(options.workerName, previewRecord.versionId)),
			now
		})
		await upsertDeploymentRecord(registry, previewDeploymentRecord, options.apiOptions)
		syncedDeployments.push(previewDeploymentRecord)
	}

	for (const [index, deployment] of liveDeployments.entries()) {
		const versionId = deployment.versions[0]?.versionId
		const version = versionId
			? await getVersionInfoById(
				options.accountId,
				options.workerName,
				versionId,
				versionMetadataMap,
				options.apiOptions
			)
			: undefined
		const deploymentRecord = buildProductionDeploymentRecord({
			accountId: options.accountId,
			workerName: options.workerName,
			deployment,
			version,
			existing: deploymentRecordById.get(deployment.id),
			workersSubdomain,
			source: options.source,
			commitSha: versionId === options.versionId ? options.commitSha : undefined,
			deploymentMessage: index === 0 ? options.deploymentMessage : undefined,
			status: index === 0 ? 'active' : 'superseded',
			now
		})

		if (!deploymentRecord) {
			continue
		}

		await upsertDeploymentRecord(registry, deploymentRecord, options.apiOptions)
		syncedDeployments.push(deploymentRecord)
	}

	return {
		registry,
		previews: syncedPreviews,
		previewAliases: syncedAliases,
		deployments: syncedDeployments
	}
}

export async function cleanupPreviewRegistry(
	options: CleanupPreviewRegistryOptions
): Promise<CleanupPreviewRegistryResult> {
	const now = options.now ?? new Date()
	const registry = await ensurePreviewRegistry({
		accountId: options.accountId,
		databaseName: options.databaseName,
		apiOptions: options.apiOptions,
		logger: options.logger
	})
	const { previews, aliases, deployments } = await loadTrackedRegistryRows(registry, options.workerName, options.apiOptions)
	const cutoff = new Date(now.getTime() - Math.max(options.days ?? 7, 0) * 24 * 60 * 60 * 1000)
	const previewCandidates = previews.filter((record) => !record.deletedAt && record.createdAt <= cutoff && record.status !== 'active')
	const aliasCandidates = aliases.filter((record) => !record.deletedAt && record.createdAt <= cutoff && record.status !== 'active')
	const deploymentCandidates = deployments.filter((record) => !record.deletedAt && record.createdAt <= cutoff && record.status !== 'active')

	if (options.apply) {
		await applyDeletedRecords(registry, {
			previews: previewCandidates,
			aliases: aliasCandidates,
			deployments: deploymentCandidates,
			now,
			apiOptions: options.apiOptions
		})
	}

	return {
		registry,
		previews,
		aliases,
		deployments,
		candidates: {
			previews: previewCandidates,
			aliases: aliasCandidates,
			deployments: deploymentCandidates
		},
		applied: options.apply === true
	}
}

export async function retirePreviewRegistry(
	options: RetirePreviewRegistryOptions
): Promise<RetirePreviewRegistryResult> {
	if (!hasRetireSelector(options)) {
		throw new Error('Retiring preview registry records requires at least one selector: branchName, previewAlias, versionId, or commitSha.')
	}

	const now = options.now ?? new Date()
	const registry = await ensurePreviewRegistry({
		accountId: options.accountId,
		databaseName: options.databaseName,
		apiOptions: options.apiOptions,
		logger: options.logger
	})
	const { previews, aliases, deployments } = await loadTrackedRegistryRows(registry, options.workerName, options.apiOptions)

	const directlyMatchedPreviews = previews.filter((record) => !record.deletedAt && matchesPreviewRetireTarget(record, options))
	const directlyMatchedAliases = aliases.filter((record) => !record.deletedAt && matchesPreviewAliasRetireTarget(record, options))
	const directlyMatchedDeployments = deployments.filter((record) => !record.deletedAt && matchesPreviewDeploymentRetireTarget(record, options))

	const candidatePreviewIds = new Set<string>([
		...directlyMatchedPreviews.map((record) => record.id),
		...directlyMatchedAliases.flatMap((record) => record.previewId ? [record.previewId] : [])
	])
	const candidateVersionIds = new Set<string>([
		...directlyMatchedPreviews.map((record) => record.versionId),
		...directlyMatchedAliases.map((record) => record.versionId),
		...directlyMatchedDeployments.map((record) => record.versionId),
		...(options.versionId ? [options.versionId] : [])
	])

	const previewCandidates = previews.filter((record) => {
		return !record.deletedAt
			&& (
				matchesPreviewRetireTarget(record, options)
				|| candidatePreviewIds.has(record.id)
				|| candidateVersionIds.has(record.versionId)
			)
	})

	const resolvedPreviewIds = new Set(previewCandidates.map((record) => record.id))
	const resolvedVersionIds = new Set([
		...candidateVersionIds,
		...previewCandidates.map((record) => record.versionId)
	])

	const aliasCandidates = aliases.filter((record) => {
		return !record.deletedAt
			&& (
				matchesPreviewAliasRetireTarget(record, options)
				|| resolvedVersionIds.has(record.versionId)
				|| (record.previewId !== undefined && resolvedPreviewIds.has(record.previewId))
			)
	})

	for (const record of aliasCandidates) {
		resolvedVersionIds.add(record.versionId)
		if (record.previewId) {
			resolvedPreviewIds.add(record.previewId)
		}
	}

	const deploymentCandidates = deployments.filter((record) => {
		return !record.deletedAt
			&& record.channel === 'preview'
			&& (
				matchesPreviewDeploymentRetireTarget(record, options)
				|| resolvedVersionIds.has(record.versionId)
				|| (record.previewId !== undefined && resolvedPreviewIds.has(record.previewId))
			)
	})

	if (options.apply) {
		await applyDeletedRecords(registry, {
			previews: previewCandidates,
			aliases: aliasCandidates,
			deployments: deploymentCandidates,
			now,
			apiOptions: options.apiOptions
		})
	}

	return {
		registry,
		previews,
		aliases,
		deployments,
		candidates: {
			previews: previewCandidates,
			aliases: aliasCandidates,
			deployments: deploymentCandidates
		},
		applied: options.apply === true
	}
}
