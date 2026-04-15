import { CloudflareAPIError, type APIClientOptions } from './api'
import { queryD1Database } from './account-resources'
import {
	devflareDeploymentRecordSchema,
	devflarePreviewScopeRecordSchema,
	devflarePreviewRecordSchema,
	type DevflareDeploymentRecord,
	type DevflarePreviewScopeRecord,
	type DevflarePreviewRecord
} from './registry-schema'
import { toIsoString } from './preview-registry-records'
import type {
	PreviewRegistryContext,
	StoredRecordRow
} from './preview-registry-types'

const REGISTRY_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS devflare_preview_records (
		id TEXT PRIMARY KEY,
		ver INTEGER NOT NULL,
		account_id TEXT NOT NULL,
		worker_name TEXT NOT NULL,
		version_id TEXT NOT NULL UNIQUE,
		preview_url TEXT NOT NULL,
		scope TEXT,
		scope_url TEXT,
		branch_name TEXT,
		commit_sha TEXT,
		deployment_id TEXT,
		source TEXT NOT NULL,
		status TEXT NOT NULL,
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT,
		deleted_at TEXT,
		payload_json TEXT NOT NULL
	)` ,
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_records_account_worker ON devflare_preview_records(account_id, worker_name)',
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_records_status ON devflare_preview_records(status)',
	`CREATE TABLE IF NOT EXISTS devflare_preview_scope_records (
		id TEXT PRIMARY KEY,
		ver INTEGER NOT NULL,
		account_id TEXT NOT NULL,
		worker_name TEXT NOT NULL,
		scope TEXT NOT NULL,
		scope_url TEXT NOT NULL,
		version_id TEXT NOT NULL,
		preview_id TEXT,
		branch_name TEXT,
		commit_sha TEXT,
		source TEXT NOT NULL,
		status TEXT NOT NULL,
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT,
		deleted_at TEXT,
		payload_json TEXT NOT NULL
	)` ,
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_scope_records_account_worker ON devflare_preview_scope_records(account_id, worker_name)',
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_scope_records_scope ON devflare_preview_scope_records(scope)',
	`CREATE TABLE IF NOT EXISTS devflare_deployment_records (
		id TEXT PRIMARY KEY,
		ver INTEGER NOT NULL,
		account_id TEXT NOT NULL,
		worker_name TEXT NOT NULL,
		deployment_id TEXT NOT NULL UNIQUE,
		channel TEXT NOT NULL,
		status TEXT NOT NULL,
		version_id TEXT NOT NULL,
		preview_id TEXT,
		environment TEXT,
		url TEXT,
		message TEXT,
		commit_sha TEXT,
		source TEXT NOT NULL,
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT,
		deleted_at TEXT,
		payload_json TEXT NOT NULL
	)` ,
	'CREATE INDEX IF NOT EXISTS idx_devflare_deployment_records_account_worker ON devflare_deployment_records(account_id, worker_name)',
	'CREATE INDEX IF NOT EXISTS idx_devflare_deployment_records_channel_status ON devflare_deployment_records(channel, status)'
] as const

const schemaEnsuredRegistryIds = new Set<string>()

async function runQuery<T = Record<string, unknown>>(
	registry: PreviewRegistryContext,
	sql: string,
	params: Array<string | number | null> = [],
	apiOptions?: APIClientOptions
): Promise<T[]> {
	const results = await queryD1Database<T>(
		registry.accountId,
		registry.databaseId,
		{
			sql,
			params
		},
		apiOptions
	)

	return results[0]?.results ?? []
}

async function runStatement(
	registry: PreviewRegistryContext,
	sql: string,
	params: Array<string | number | null> = [],
	apiOptions?: APIClientOptions
): Promise<void> {
	await queryD1Database(
		registry.accountId,
		registry.databaseId,
		{
			sql,
			params
		},
		apiOptions
	)
}

export async function ensurePreviewRegistrySchema(
	registry: PreviewRegistryContext,
	apiOptions?: APIClientOptions
): Promise<void> {
	if (schemaEnsuredRegistryIds.has(registry.databaseId)) {
		return
	}

	for (const statement of REGISTRY_SCHEMA_STATEMENTS) {
		await runStatement(registry, statement, [], apiOptions)
	}

	schemaEnsuredRegistryIds.add(registry.databaseId)
}

export function clearPreviewRegistrySchemaCache(databaseId: string): void {
	schemaEnsuredRegistryIds.delete(databaseId)
}

export function isMissingRegistrySchemaError(error: unknown): boolean {
	if (error instanceof CloudflareAPIError) {
		const message = error.message.toLowerCase()
		return message.includes('no such table') || message.includes('no such column')
	}

	if (error instanceof Error) {
		const message = error.message.toLowerCase()
		return message.includes('no such table') || message.includes('no such column')
	}

	return false
}

export function isUnavailableRegistryContextError(error: unknown): boolean {
	if (error instanceof CloudflareAPIError) {
		const message = error.message.toLowerCase()
		return error.code === 404
			|| ((message.includes('database') || message.includes('d1'))
				&& (message.includes('not found')
					|| message.includes('does not exist')
					|| message.includes('unknown')))
	}

	if (error instanceof Error) {
		const message = error.message.toLowerCase()
		return (message.includes('database') || message.includes('d1'))
			&& (message.includes('not found') || message.includes('does not exist'))
	}

	return false
}

function parseStoredPreviewRecord(row: StoredRecordRow): DevflarePreviewRecord {
	return devflarePreviewRecordSchema.parse(JSON.parse(row.payload_json))
}

function parseStoredPreviewScopeRecord(row: StoredRecordRow): DevflarePreviewScopeRecord {
	return devflarePreviewScopeRecordSchema.parse(JSON.parse(row.payload_json))
}

function parseStoredDeploymentRecord(row: StoredRecordRow): DevflareDeploymentRecord {
	return devflareDeploymentRecordSchema.parse(JSON.parse(row.payload_json))
}

export async function readPreviewRows(
	registry: PreviewRegistryContext,
	workerName: string | undefined,
	apiOptions?: APIClientOptions
): Promise<DevflarePreviewRecord[]> {
	const sql = workerName
		? 'SELECT payload_json FROM devflare_preview_records WHERE account_id = ? AND worker_name = ? ORDER BY created_at DESC'
		: 'SELECT payload_json FROM devflare_preview_records WHERE account_id = ? ORDER BY created_at DESC'
	const params = workerName ? [registry.accountId, workerName] : [registry.accountId]
	const rows = await runQuery<StoredRecordRow>(registry, sql, params, apiOptions)
	return rows.map((row) => parseStoredPreviewRecord(row))
}

export async function readPreviewScopeRows(
	registry: PreviewRegistryContext,
	workerName: string | undefined,
	apiOptions?: APIClientOptions
): Promise<DevflarePreviewScopeRecord[]> {
	const sql = workerName
		? 'SELECT payload_json FROM devflare_preview_scope_records WHERE account_id = ? AND worker_name = ? ORDER BY created_at DESC'
		: 'SELECT payload_json FROM devflare_preview_scope_records WHERE account_id = ? ORDER BY created_at DESC'
	const params = workerName ? [registry.accountId, workerName] : [registry.accountId]
	const rows = await runQuery<StoredRecordRow>(registry, sql, params, apiOptions)
	return rows.map((row) => parseStoredPreviewScopeRecord(row))
}

export async function readDeploymentRows(
	registry: PreviewRegistryContext,
	workerName: string | undefined,
	apiOptions?: APIClientOptions
): Promise<DevflareDeploymentRecord[]> {
	const sql = workerName
		? 'SELECT payload_json FROM devflare_deployment_records WHERE account_id = ? AND worker_name = ? ORDER BY created_at DESC'
		: 'SELECT payload_json FROM devflare_deployment_records WHERE account_id = ? ORDER BY created_at DESC'
	const params = workerName ? [registry.accountId, workerName] : [registry.accountId]
	const rows = await runQuery<StoredRecordRow>(registry, sql, params, apiOptions)
	return rows.map((row) => parseStoredDeploymentRecord(row))
}

export async function upsertPreviewRecord(
	registry: PreviewRegistryContext,
	record: DevflarePreviewRecord,
	apiOptions?: APIClientOptions
): Promise<void> {
	const normalizedRecord = devflarePreviewRecordSchema.parse(record)
	await runStatement(
		registry,
		`INSERT INTO devflare_preview_records (
			id,
			ver,
			account_id,
			worker_name,
			version_id,
			preview_url,
			scope,
			scope_url,
			branch_name,
			commit_sha,
			deployment_id,
			source,
			status,
			created_by,
			created_at,
			updated_at,
			deleted_at,
			payload_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			ver = excluded.ver,
			account_id = excluded.account_id,
			worker_name = excluded.worker_name,
			version_id = excluded.version_id,
			preview_url = excluded.preview_url,
			scope = excluded.scope,
			scope_url = excluded.scope_url,
			branch_name = excluded.branch_name,
			commit_sha = excluded.commit_sha,
			deployment_id = excluded.deployment_id,
			source = excluded.source,
			status = excluded.status,
			created_by = excluded.created_by,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at,
			deleted_at = excluded.deleted_at,
			payload_json = excluded.payload_json`,
		[
			normalizedRecord.id,
			normalizedRecord.ver,
			normalizedRecord.accountId,
			normalizedRecord.workerName,
			normalizedRecord.versionId,
			normalizedRecord.previewUrl,
			normalizedRecord.scope ?? null,
			normalizedRecord.scopeUrl ?? null,
			normalizedRecord.branchName ?? null,
			normalizedRecord.commitSha ?? null,
			normalizedRecord.deploymentId ?? null,
			normalizedRecord.source,
			normalizedRecord.status,
			normalizedRecord.createdBy,
			normalizedRecord.createdAt.toISOString(),
			toIsoString(normalizedRecord.updatedAt),
			toIsoString(normalizedRecord.deletedAt),
			JSON.stringify(normalizedRecord)
		],
		apiOptions
	)
}

export async function upsertPreviewScopeRecord(
	registry: PreviewRegistryContext,
	record: DevflarePreviewScopeRecord,
	apiOptions?: APIClientOptions
): Promise<void> {
	const normalizedRecord = devflarePreviewScopeRecordSchema.parse(record)
	await runStatement(
		registry,
		`INSERT INTO devflare_preview_scope_records (
			id,
			ver,
			account_id,
			worker_name,
			scope,
			scope_url,
			version_id,
			preview_id,
			branch_name,
			commit_sha,
			source,
			status,
			created_by,
			created_at,
			updated_at,
			deleted_at,
			payload_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			ver = excluded.ver,
			account_id = excluded.account_id,
			worker_name = excluded.worker_name,
			scope = excluded.scope,
			scope_url = excluded.scope_url,
			version_id = excluded.version_id,
			preview_id = excluded.preview_id,
			branch_name = excluded.branch_name,
			commit_sha = excluded.commit_sha,
			source = excluded.source,
			status = excluded.status,
			created_by = excluded.created_by,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at,
			deleted_at = excluded.deleted_at,
			payload_json = excluded.payload_json`,
		[
			normalizedRecord.id,
			normalizedRecord.ver,
			normalizedRecord.accountId,
			normalizedRecord.workerName,
			normalizedRecord.scope,
			normalizedRecord.scopeUrl,
			normalizedRecord.versionId,
			normalizedRecord.previewId ?? null,
			normalizedRecord.branchName ?? null,
			normalizedRecord.commitSha ?? null,
			normalizedRecord.source,
			normalizedRecord.status,
			normalizedRecord.createdBy,
			normalizedRecord.createdAt.toISOString(),
			toIsoString(normalizedRecord.updatedAt),
			toIsoString(normalizedRecord.deletedAt),
			JSON.stringify(normalizedRecord)
		],
		apiOptions
	)
}

export async function upsertDeploymentRecord(
	registry: PreviewRegistryContext,
	record: DevflareDeploymentRecord,
	apiOptions?: APIClientOptions
): Promise<void> {
	const normalizedRecord = devflareDeploymentRecordSchema.parse(record)
	await runStatement(
		registry,
		`INSERT INTO devflare_deployment_records (
			id,
			ver,
			account_id,
			worker_name,
			deployment_id,
			channel,
			status,
			version_id,
			preview_id,
			environment,
			url,
			message,
			commit_sha,
			source,
			created_by,
			created_at,
			updated_at,
			deleted_at,
			payload_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			ver = excluded.ver,
			account_id = excluded.account_id,
			worker_name = excluded.worker_name,
			deployment_id = excluded.deployment_id,
			channel = excluded.channel,
			status = excluded.status,
			version_id = excluded.version_id,
			preview_id = excluded.preview_id,
			environment = excluded.environment,
			url = excluded.url,
			message = excluded.message,
			commit_sha = excluded.commit_sha,
			source = excluded.source,
			created_by = excluded.created_by,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at,
			deleted_at = excluded.deleted_at,
			payload_json = excluded.payload_json`,
		[
			normalizedRecord.id,
			normalizedRecord.ver,
			normalizedRecord.accountId,
			normalizedRecord.workerName,
			normalizedRecord.deploymentId,
			normalizedRecord.channel,
			normalizedRecord.status,
			normalizedRecord.versionId,
			normalizedRecord.previewId ?? null,
			normalizedRecord.environment ?? null,
			normalizedRecord.url ?? null,
			normalizedRecord.message ?? null,
			normalizedRecord.commitSha ?? null,
			normalizedRecord.source,
			normalizedRecord.createdBy,
			normalizedRecord.createdAt.toISOString(),
			toIsoString(normalizedRecord.updatedAt),
			toIsoString(normalizedRecord.deletedAt),
			JSON.stringify(normalizedRecord)
		],
		apiOptions
	)
}
