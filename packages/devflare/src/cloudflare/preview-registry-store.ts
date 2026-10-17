import { queryD1Database } from './account-resources'
import { type APIClientOptions, CloudflareAPIError } from './api'
import { toIsoString } from './preview-registry-records'
import type { PreviewRegistryContext, StoredRecordRow } from './preview-registry-types'
import {
	type DevflareDeploymentRecord,
	type DevflarePreviewRecord,
	type DevflarePreviewScopeRecord,
	devflareDeploymentRecordSchema,
	devflarePreviewRecordSchema,
	devflarePreviewScopeRecordSchema
} from './registry-schema'

interface RegistryTableSchema {
	name: string
	createStatement: string
	migrationColumns: Record<string, string>
	indexStatements: string[]
}

const REGISTRY_TABLES: RegistryTableSchema[] = [
	{
		name: 'devflare_preview_records',
		createStatement: `CREATE TABLE IF NOT EXISTS devflare_preview_records (
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
		)`,
		migrationColumns: {
			id: 'id TEXT',
			ver: 'ver INTEGER NOT NULL DEFAULT 1',
			account_id: `account_id TEXT NOT NULL DEFAULT ''`,
			worker_name: `worker_name TEXT NOT NULL DEFAULT ''`,
			version_id: `version_id TEXT NOT NULL DEFAULT ''`,
			preview_url: `preview_url TEXT NOT NULL DEFAULT ''`,
			scope: 'scope TEXT',
			scope_url: 'scope_url TEXT',
			branch_name: 'branch_name TEXT',
			commit_sha: 'commit_sha TEXT',
			deployment_id: 'deployment_id TEXT',
			source: `source TEXT NOT NULL DEFAULT ''`,
			status: `status TEXT NOT NULL DEFAULT ''`,
			created_by: `created_by TEXT NOT NULL DEFAULT ''`,
			created_at: `created_at TEXT NOT NULL DEFAULT ''`,
			updated_at: 'updated_at TEXT',
			deleted_at: 'deleted_at TEXT',
			payload_json: `payload_json TEXT NOT NULL DEFAULT '{}'`
		},
		indexStatements: [
			'CREATE INDEX IF NOT EXISTS idx_devflare_preview_records_account_worker ON devflare_preview_records(account_id, worker_name)',
			'CREATE INDEX IF NOT EXISTS idx_devflare_preview_records_status ON devflare_preview_records(status)',
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_devflare_preview_records_version_id ON devflare_preview_records(version_id)'
		]
	},
	{
		name: 'devflare_preview_scope_records',
		createStatement: `CREATE TABLE IF NOT EXISTS devflare_preview_scope_records (
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
		)`,
		migrationColumns: {
			id: 'id TEXT',
			ver: 'ver INTEGER NOT NULL DEFAULT 1',
			account_id: `account_id TEXT NOT NULL DEFAULT ''`,
			worker_name: `worker_name TEXT NOT NULL DEFAULT ''`,
			scope: `scope TEXT NOT NULL DEFAULT ''`,
			scope_url: `scope_url TEXT NOT NULL DEFAULT ''`,
			version_id: `version_id TEXT NOT NULL DEFAULT ''`,
			preview_id: 'preview_id TEXT',
			branch_name: 'branch_name TEXT',
			commit_sha: 'commit_sha TEXT',
			source: `source TEXT NOT NULL DEFAULT ''`,
			status: `status TEXT NOT NULL DEFAULT ''`,
			created_by: `created_by TEXT NOT NULL DEFAULT ''`,
			created_at: `created_at TEXT NOT NULL DEFAULT ''`,
			updated_at: 'updated_at TEXT',
			deleted_at: 'deleted_at TEXT',
			payload_json: `payload_json TEXT NOT NULL DEFAULT '{}'`
		},
		indexStatements: [
			'CREATE INDEX IF NOT EXISTS idx_devflare_preview_scope_records_account_worker ON devflare_preview_scope_records(account_id, worker_name)',
			'CREATE INDEX IF NOT EXISTS idx_devflare_preview_scope_records_scope ON devflare_preview_scope_records(scope)'
		]
	},
	{
		name: 'devflare_deployment_records',
		createStatement: `CREATE TABLE IF NOT EXISTS devflare_deployment_records (
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
		)`,
		migrationColumns: {
			id: 'id TEXT',
			ver: 'ver INTEGER NOT NULL DEFAULT 1',
			account_id: `account_id TEXT NOT NULL DEFAULT ''`,
			worker_name: `worker_name TEXT NOT NULL DEFAULT ''`,
			deployment_id: `deployment_id TEXT NOT NULL DEFAULT ''`,
			channel: `channel TEXT NOT NULL DEFAULT ''`,
			status: `status TEXT NOT NULL DEFAULT ''`,
			version_id: `version_id TEXT NOT NULL DEFAULT ''`,
			preview_id: 'preview_id TEXT',
			environment: 'environment TEXT',
			url: 'url TEXT',
			message: 'message TEXT',
			commit_sha: 'commit_sha TEXT',
			source: `source TEXT NOT NULL DEFAULT ''`,
			created_by: `created_by TEXT NOT NULL DEFAULT ''`,
			created_at: `created_at TEXT NOT NULL DEFAULT ''`,
			updated_at: 'updated_at TEXT',
			deleted_at: 'deleted_at TEXT',
			payload_json: `payload_json TEXT NOT NULL DEFAULT '{}'`
		},
		indexStatements: [
			'CREATE INDEX IF NOT EXISTS idx_devflare_deployment_records_account_worker ON devflare_deployment_records(account_id, worker_name)',
			'CREATE INDEX IF NOT EXISTS idx_devflare_deployment_records_channel_status ON devflare_deployment_records(channel, status)',
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_devflare_deployment_records_deployment_id ON devflare_deployment_records(deployment_id)'
		]
	}
]

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

function quoteSqlIdentifier(value: string): string {
	return `"${value.replaceAll('"', '""')}"`
}

async function readTableColumnNames(
	registry: PreviewRegistryContext,
	tableName: string,
	apiOptions?: APIClientOptions
): Promise<Set<string>> {
	const rows = await runQuery<{ name?: unknown }>(
		registry,
		`PRAGMA table_info(${quoteSqlIdentifier(tableName)})`,
		[],
		apiOptions
	)

	return new Set(
		rows
			.map((row) => (typeof row.name === 'string' ? row.name : undefined))
			.filter((value): value is string => Boolean(value))
	)
}

async function ensureTableColumns(
	registry: PreviewRegistryContext,
	table: RegistryTableSchema,
	apiOptions?: APIClientOptions
): Promise<void> {
	const existingColumnNames = await readTableColumnNames(registry, table.name, apiOptions)

	for (const [columnName, definition] of Object.entries(table.migrationColumns)) {
		if (existingColumnNames.has(columnName)) {
			continue
		}

		await runStatement(
			registry,
			`ALTER TABLE ${quoteSqlIdentifier(table.name)} ADD COLUMN ${definition}`,
			[],
			apiOptions
		)
	}
}

export async function ensurePreviewRegistrySchema(
	registry: PreviewRegistryContext,
	apiOptions?: APIClientOptions
): Promise<void> {
	if (schemaEnsuredRegistryIds.has(registry.databaseId)) {
		return
	}

	for (const table of REGISTRY_TABLES) {
		await runStatement(registry, table.createStatement, [], apiOptions)
		await ensureTableColumns(registry, table, apiOptions)

		for (const statement of table.indexStatements) {
			await runStatement(registry, statement, [], apiOptions)
		}
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
		return (
			error.code === 404 ||
			((message.includes('database') || message.includes('d1')) &&
				(message.includes('not found') ||
					message.includes('does not exist') ||
					message.includes('unknown')))
		)
	}

	if (error instanceof Error) {
		const message = error.message.toLowerCase()
		return (
			(message.includes('database') || message.includes('d1')) &&
			(message.includes('not found') || message.includes('does not exist'))
		)
	}

	return false
}

function normalizeLegacyStoredRecordPayload(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return value
	}

	const { alias, aliasPreviewUrl, ...record } = value as Record<string, unknown>

	if (record.scope === undefined && typeof alias === 'string') {
		record.scope = alias
	}

	if (record.scopeUrl === undefined && typeof aliasPreviewUrl === 'string') {
		record.scopeUrl = aliasPreviewUrl
	}

	return record
}

function parseStoredRecordPayload(row: StoredRecordRow): unknown {
	return normalizeLegacyStoredRecordPayload(JSON.parse(row.payload_json))
}

function parseStoredPreviewRecord(row: StoredRecordRow): DevflarePreviewRecord {
	return devflarePreviewRecordSchema.parse(parseStoredRecordPayload(row))
}

function parseStoredPreviewScopeRecord(row: StoredRecordRow): DevflarePreviewScopeRecord {
	return devflarePreviewScopeRecordSchema.parse(parseStoredRecordPayload(row))
}

function parseStoredDeploymentRecord(row: StoredRecordRow): DevflareDeploymentRecord {
	return devflareDeploymentRecordSchema.parse(parseStoredRecordPayload(row))
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
