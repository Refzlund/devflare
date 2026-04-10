import type { ConsolaInstance } from 'consola'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
	createD1Database,
	getWorkerVersionDetail,
	getWorkersSubdomain,
	listD1Databases,
	listWorkerDeployments,
	listWorkerVersions,
	queryD1Database
} from './account'
import type {
	D1QueryParameter,
	WorkerDeploymentInfo,
	WorkerVersionInfo
} from './types'
import { CloudflareAPIError, type APIClientOptions } from './api'
import type {
	DevflareDeploymentRecord,
	DevflarePreviewAliasRecord,
	DevflarePreviewRecord,
	DevflareRecordSource
} from './registry-schema'
import {
	devflareDeploymentRecordSchema,
	devflarePreviewAliasRecordSchema,
	devflarePreviewRecordSchema
} from './registry-schema'
import { formatPreviewAliasUrl, formatVersionPreviewUrl } from '../cli/preview'

export const DEVFLARE_PREVIEW_REGISTRY_DATABASE = 'devflare-registry'

const DEVFLARE_CACHE_DIR = '.devflare'
const PREVIEW_REGISTRY_CACHE_FILE = 'preview-registry.json'

const REGISTRY_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS devflare_preview_records (
		id TEXT PRIMARY KEY,
		ver INTEGER NOT NULL,
		account_id TEXT NOT NULL,
		worker_name TEXT NOT NULL,
		version_id TEXT NOT NULL UNIQUE,
		preview_url TEXT NOT NULL,
		alias TEXT,
		alias_preview_url TEXT,
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
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_records_account_worker ON devflare_preview_records(account_id, worker_name)',
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_records_status ON devflare_preview_records(status)',
	`CREATE TABLE IF NOT EXISTS devflare_preview_alias_records (
		id TEXT PRIMARY KEY,
		ver INTEGER NOT NULL,
		account_id TEXT NOT NULL,
		worker_name TEXT NOT NULL,
		alias TEXT NOT NULL,
		alias_preview_url TEXT NOT NULL,
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
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_alias_records_account_worker ON devflare_preview_alias_records(account_id, worker_name)',
	'CREATE INDEX IF NOT EXISTS idx_devflare_preview_alias_records_alias ON devflare_preview_alias_records(alias)',
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
	)`,
	'CREATE INDEX IF NOT EXISTS idx_devflare_deployment_records_account_worker ON devflare_deployment_records(account_id, worker_name)',
	'CREATE INDEX IF NOT EXISTS idx_devflare_deployment_records_channel_status ON devflare_deployment_records(channel, status)'
] as const

const schemaEnsuredRegistryIds = new Set<string>()

interface StoredRecordRow {
	payload_json: string
}

interface PreviewRegistryCacheEntry {
	accountId: string
	databaseId: string
	databaseName: string
	updatedAt: string
}

interface PreviewRegistryCacheFile {
	registries?: Record<string, PreviewRegistryCacheEntry>
}

export interface PreviewRegistryContext {
	accountId: string
	databaseId: string
	databaseName: string
	created: boolean
}

export interface ListTrackedRecordsOptions {
	accountId: string
	workerName?: string
	databaseName?: string
	apiOptions?: APIClientOptions
}

export interface ListTrackedRegistryStateOptions {
	registry: PreviewRegistryContext
	workerName?: string
	apiOptions?: APIClientOptions
}

export interface ReconcilePreviewRegistryOptions {
	accountId: string
	workerName: string
	databaseName?: string
	apiOptions?: APIClientOptions
	previewAlias?: string
	previewUrl?: string
	previewAliasUrl?: string
	branchName?: string
	commitSha?: string
	versionId?: string
	source?: DevflareRecordSource
	deploymentMessage?: string
	logger?: ConsolaInstance
	now?: Date
}

export interface ReconcilePreviewRegistryResult {
	registry: PreviewRegistryContext
	previews: DevflarePreviewRecord[]
	previewAliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
}

export interface CleanupPreviewRegistryOptions {
	accountId: string
	workerName?: string
	databaseName?: string
	apiOptions?: APIClientOptions
	days?: number
	apply?: boolean
	logger?: ConsolaInstance
	now?: Date
}

export interface CleanupPreviewRegistryResult {
	registry: PreviewRegistryContext
	previews: DevflarePreviewRecord[]
	aliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
	candidates: {
		previews: DevflarePreviewRecord[]
		aliases: DevflarePreviewAliasRecord[]
		deployments: DevflareDeploymentRecord[]
	}
	applied: boolean
}

export interface RetirePreviewRegistryOptions {
	accountId: string
	workerName: string
	databaseName?: string
	apiOptions?: APIClientOptions
	branchName?: string
	previewAlias?: string
	versionId?: string
	commitSha?: string
	apply?: boolean
	logger?: ConsolaInstance
	now?: Date
}

export interface RetirePreviewRegistryResult {
	registry: PreviewRegistryContext
	previews: DevflarePreviewRecord[]
	aliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
	candidates: {
		previews: DevflarePreviewRecord[]
		aliases: DevflarePreviewAliasRecord[]
		deployments: DevflareDeploymentRecord[]
	}
	applied: boolean
}

function getDevflareCacheDir(): string {
	const override = process.env.DEVFLARE_CACHE_DIR?.trim()
	if (override) {
		return override
	}

	return join(homedir(), DEVFLARE_CACHE_DIR)
}

function getPreviewRegistryCachePath(): string {
	return join(getDevflareCacheDir(), PREVIEW_REGISTRY_CACHE_FILE)
}

function getPreviewRegistryCacheKey(accountId: string, databaseName: string): string {
	return `${accountId}:${databaseName}`
}

function readPreviewRegistryCache(): PreviewRegistryCacheFile {
	const cachePath = getPreviewRegistryCachePath()
	if (!existsSync(cachePath)) {
		return {}
	}

	try {
		const content = readFileSync(cachePath, 'utf-8')
		return JSON.parse(content) as PreviewRegistryCacheFile
	} catch {
		return {}
	}
}

function writePreviewRegistryCache(cache: PreviewRegistryCacheFile): void {
	try {
		const cacheDir = getDevflareCacheDir()
		if (!existsSync(cacheDir)) {
			mkdirSync(cacheDir, { recursive: true })
		}

		writeFileSync(getPreviewRegistryCachePath(), JSON.stringify(cache, null, '\t'), 'utf-8')
	} catch {
		// Best-effort local cache only.
	}
}

function getCachedPreviewRegistryContext(
	accountId: string,
	databaseName: string
): PreviewRegistryContext | null {
	const entry = readPreviewRegistryCache().registries?.[getPreviewRegistryCacheKey(accountId, databaseName)]
	if (!entry?.databaseId) {
		return null
	}

	return {
		accountId: entry.accountId,
		databaseId: entry.databaseId,
		databaseName: entry.databaseName,
		created: false
	}
}

function cachePreviewRegistryContext(registry: PreviewRegistryContext): void {
	const cache = readPreviewRegistryCache()
	const registries = cache.registries ?? {}
	registries[getPreviewRegistryCacheKey(registry.accountId, registry.databaseName)] = {
		accountId: registry.accountId,
		databaseId: registry.databaseId,
		databaseName: registry.databaseName,
		updatedAt: new Date().toISOString()
	}
	writePreviewRegistryCache({
		...cache,
		registries
	})
}

function clearCachedPreviewRegistryContext(accountId: string, databaseName: string): void {
	const cache = readPreviewRegistryCache()
	if (!cache.registries) {
		return
	}

	delete cache.registries[getPreviewRegistryCacheKey(accountId, databaseName)]
	writePreviewRegistryCache(cache)
}

function toIsoString(date: Date | undefined): string | null {
	return date ? date.toISOString() : null
}

function inferRecordSource(
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

function getRegistryDatabaseName(databaseName?: string): string {
	return databaseName?.trim() || DEVFLARE_PREVIEW_REGISTRY_DATABASE
}

function getPreviewRecordId(workerName: string, versionId: string): string {
	return `preview:${workerName}:${versionId}`
}

function getPreviewAliasRecordId(workerName: string, alias: string): string {
	return `previewAlias:${workerName}:${alias}`
}

function getPreviewDeploymentId(workerName: string, versionId: string): string {
	return `preview:${workerName}:${versionId}`
}

function getDeploymentRecordId(workerName: string, deploymentId: string): string {
	return `deployment:${workerName}:${deploymentId}`
}

function hasRetireSelector(options: RetirePreviewRegistryOptions): boolean {
	return Boolean(
		options.branchName
		|| options.previewAlias
		|| options.versionId
		|| options.commitSha
	)
}

function matchesPreviewRetireTarget(
	record: DevflarePreviewRecord,
	options: RetirePreviewRegistryOptions
): boolean {
	return (options.branchName !== undefined && record.branchName === options.branchName)
		|| (options.previewAlias !== undefined && record.alias === options.previewAlias)
		|| (options.versionId !== undefined && record.versionId === options.versionId)
		|| (options.commitSha !== undefined && record.commitSha === options.commitSha)
}

function matchesPreviewAliasRetireTarget(
	record: DevflarePreviewAliasRecord,
	options: RetirePreviewRegistryOptions
): boolean {
	return (options.branchName !== undefined && record.branchName === options.branchName)
		|| (options.previewAlias !== undefined && record.alias === options.previewAlias)
		|| (options.versionId !== undefined && record.versionId === options.versionId)
		|| (options.commitSha !== undefined && record.commitSha === options.commitSha)
}

function matchesPreviewDeploymentRetireTarget(
	record: DevflareDeploymentRecord,
	options: RetirePreviewRegistryOptions
): boolean {
	return record.channel === 'preview'
		&& (
			(options.versionId !== undefined && record.versionId === options.versionId)
			|| (options.commitSha !== undefined && record.commitSha === options.commitSha)
		)
}

async function runQuery<T = Record<string, unknown>>(
	registry: PreviewRegistryContext,
	sql: string,
	params: D1QueryParameter[] = [],
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
	params: D1QueryParameter[] = [],
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

async function ensurePreviewRegistrySchema(
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

function isMissingRegistrySchemaError(error: unknown): boolean {
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

function isUnavailableRegistryContextError(error: unknown): boolean {
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
			schemaEnsuredRegistryIds.delete(registry.databaseId)
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

function parseStoredPreviewRecord(row: StoredRecordRow): DevflarePreviewRecord {
	return devflarePreviewRecordSchema.parse(JSON.parse(row.payload_json))
}

function parseStoredPreviewAliasRecord(row: StoredRecordRow): DevflarePreviewAliasRecord {
	return devflarePreviewAliasRecordSchema.parse(JSON.parse(row.payload_json))
}

function parseStoredDeploymentRecord(row: StoredRecordRow): DevflareDeploymentRecord {
	return devflareDeploymentRecordSchema.parse(JSON.parse(row.payload_json))
}

async function readPreviewRows(
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

async function readPreviewAliasRows(
	registry: PreviewRegistryContext,
	workerName: string | undefined,
	apiOptions?: APIClientOptions
): Promise<DevflarePreviewAliasRecord[]> {
	const sql = workerName
		? 'SELECT payload_json FROM devflare_preview_alias_records WHERE account_id = ? AND worker_name = ? ORDER BY created_at DESC'
		: 'SELECT payload_json FROM devflare_preview_alias_records WHERE account_id = ? ORDER BY created_at DESC'
	const params = workerName ? [registry.accountId, workerName] : [registry.accountId]
	const rows = await runQuery<StoredRecordRow>(registry, sql, params, apiOptions)
	return rows.map((row) => parseStoredPreviewAliasRecord(row))
}

async function readDeploymentRows(
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

async function upsertPreviewRecord(
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
			alias,
			alias_preview_url,
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
			alias = excluded.alias,
			alias_preview_url = excluded.alias_preview_url,
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
			normalizedRecord.alias ?? null,
			normalizedRecord.aliasPreviewUrl ?? null,
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

async function upsertPreviewAliasRecord(
	registry: PreviewRegistryContext,
	record: DevflarePreviewAliasRecord,
	apiOptions?: APIClientOptions
): Promise<void> {
	const normalizedRecord = devflarePreviewAliasRecordSchema.parse(record)
	await runStatement(
		registry,
		`INSERT INTO devflare_preview_alias_records (
			id,
			ver,
			account_id,
			worker_name,
			alias,
			alias_preview_url,
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
			alias = excluded.alias,
			alias_preview_url = excluded.alias_preview_url,
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
			normalizedRecord.alias,
			normalizedRecord.aliasPreviewUrl,
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

async function upsertDeploymentRecord(
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
	logger?: ConsolaInstance
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
		options.logger?.info(`Created Devflare preview registry D1 database: ${registry.databaseName}`)
	}

	if (registry.created || options.skipSchemaIfExisting !== true) {
		await ensurePreviewRegistrySchema(registry, options.apiOptions)
	}

	return registry
}

export async function listTrackedRegistryState(
	options: ListTrackedRegistryStateOptions
): Promise<{
	previews: DevflarePreviewRecord[]
	aliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
}> {
	const { result } = await withRegistryReadRecovery(options.registry, options.apiOptions, async (registry) => {
		const [previews, aliases, deployments] = await Promise.all([
			readPreviewRows(registry, options.workerName, options.apiOptions),
			readPreviewAliasRows(registry, options.workerName, options.apiOptions),
			readDeploymentRows(registry, options.workerName, options.apiOptions)
		])

		return {
			previews,
			aliases,
			deployments
		}
	})

	return result
}

export async function listTrackedPreviewRecords(
	options: ListTrackedRecordsOptions
): Promise<{ registry: PreviewRegistryContext; records: DevflarePreviewRecord[] }> {
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
): Promise<{ registry: PreviewRegistryContext; records: DevflarePreviewAliasRecord[] }> {
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
): Promise<{ registry: PreviewRegistryContext; records: DevflareDeploymentRecord[] }> {
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

function getVersionAuthorId(
	version: WorkerVersionInfo | undefined,
	existingCreatedBy: string | undefined
): string {
	return version?.metadata.authorId || existingCreatedBy || 'unknown'
}

function buildPreviewRecord(options: {
	accountId: string
	workerName: string
	version: WorkerVersionInfo
	existing?: DevflarePreviewRecord
	workersSubdomain?: string | null
	previewAlias?: string
	previewUrl?: string
	previewAliasUrl?: string
	branchName?: string
	commitSha?: string
	source?: DevflareRecordSource
	now: Date
}): DevflarePreviewRecord | null {
	const alias = options.previewAlias ?? options.existing?.alias
	const previewUrl = options.previewUrl
		?? options.existing?.previewUrl
		?? (options.workersSubdomain
			? formatVersionPreviewUrl(options.version.id, options.workerName, options.workersSubdomain)
			: undefined)
	const aliasPreviewUrl = options.previewAliasUrl
		?? options.existing?.aliasPreviewUrl
		?? (alias && options.workersSubdomain
			? formatPreviewAliasUrl(alias, options.workerName, options.workersSubdomain)
			: undefined)

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
		alias,
		aliasPreviewUrl,
		branchName: options.branchName ?? options.existing?.branchName,
		commitSha: options.commitSha ?? options.existing?.commitSha,
		deploymentId: options.existing?.deploymentId,
		source: inferRecordSource(options.source, options.version.metadata.source),
		status: 'active'
	})
}

function buildPreviewAliasRecord(options: {
	accountId: string
	workerName: string
	previewRecord: DevflarePreviewRecord
	existing?: DevflarePreviewAliasRecord
	now: Date
}): DevflarePreviewAliasRecord | null {
	if (!options.previewRecord.alias || !options.previewRecord.aliasPreviewUrl) {
		return null
	}

	return devflarePreviewAliasRecordSchema.parse({
		id: getPreviewAliasRecordId(options.workerName, options.previewRecord.alias),
		kind: 'previewAlias',
		ver: 1,
		createdAt: options.existing?.createdAt ?? options.previewRecord.createdAt,
		updatedAt: options.now,
		deletedAt: undefined,
		createdBy: options.previewRecord.createdBy,
		accountId: options.accountId,
		workerName: options.workerName,
		alias: options.previewRecord.alias,
		aliasPreviewUrl: options.previewRecord.aliasPreviewUrl,
		versionId: options.previewRecord.versionId,
		previewId: options.previewRecord.id,
		branchName: options.previewRecord.branchName,
		commitSha: options.previewRecord.commitSha,
		source: options.previewRecord.source,
		status: 'active'
	})
}

function buildPreviewDeploymentRecord(options: {
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
		createdAt: options.existing?.createdAt ?? options.previewRecord.createdAt,
		updatedAt: options.now,
		deletedAt: undefined,
		createdBy: options.previewRecord.createdBy,
		accountId: options.accountId,
		workerName: options.workerName,
		deploymentId,
		channel: 'preview',
		status: 'active',
		versionId: options.previewRecord.versionId,
		previewId: options.previewRecord.id,
		environment: 'preview',
		url: options.previewRecord.aliasPreviewUrl ?? options.previewRecord.previewUrl,
		message: options.existing?.message,
		commitSha: options.previewRecord.commitSha,
		source: options.previewRecord.source
	})
}

function buildProductionDeploymentRecord(options: {
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


async function getVersionInfoById(
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
	const previewRecords = await readPreviewRows(registry, options.workerName, options.apiOptions)
	const aliasRecords = await readPreviewAliasRows(registry, options.workerName, options.apiOptions)
	const deploymentRecords = await readDeploymentRows(registry, options.workerName, options.apiOptions)
	const previewRecordByVersionId = new Map(previewRecords.map((record) => [record.versionId, record]))
	const previewAliasRecordByAlias = new Map(aliasRecords.map((record) => [record.alias, record]))
	const deploymentRecordById = new Map(deploymentRecords.map((record) => [record.deploymentId, record]))
	const activePreviewIds = new Set<string>()
	const syncedPreviews: DevflarePreviewRecord[] = []
	const syncedAliases: DevflarePreviewAliasRecord[] = []
	const syncedDeployments: DevflareDeploymentRecord[] = []
	const versionMetadataMap = new Map<string, WorkerVersionInfo>(
		liveVersions.map((version) => [version.id, version])
	)
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
			previewAlias: version.id === options.versionId ? options.previewAlias : undefined,
			previewUrl: version.id === options.versionId ? options.previewUrl : undefined,
			previewAliasUrl: version.id === options.versionId ? options.previewAliasUrl : undefined,
			branchName: version.id === options.versionId ? options.branchName : undefined,
			commitSha: version.id === options.versionId ? options.commitSha : undefined,
			source: options.source,
			now
		})

		if (!previewRecord) {
			options.logger?.warn(`Skipping preview registry sync for ${version.id} because no preview URL could be determined.`)
			continue
		}

		await upsertPreviewRecord(registry, previewRecord, options.apiOptions)
		syncedPreviews.push(previewRecord)
		activePreviewIds.add(version.id)

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

	// Cloudflare's preview discovery surface is intentionally treated as incomplete.
	// A preview missing from listWorkerVersions() does not mean it is safe to delete
	// or orphan the local control-plane record. Devflare keeps existing preview,
	// alias, and preview-deployment records until a later explicit preview upload,
	// reassignment, or cleanup pass supersedes them.

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
	const previews = await readPreviewRows(registry, options.workerName, options.apiOptions)
	const aliases = await readPreviewAliasRows(registry, options.workerName, options.apiOptions)
	const deployments = await readDeploymentRows(registry, options.workerName, options.apiOptions)
	const cutoff = new Date(now.getTime() - Math.max(options.days ?? 7, 0) * 24 * 60 * 60 * 1000)
	const previewCandidates = previews.filter((record) => {
		return !record.deletedAt && record.createdAt <= cutoff && record.status !== 'active'
	})
	const aliasCandidates = aliases.filter((record) => {
		return !record.deletedAt && record.createdAt <= cutoff && record.status !== 'active'
	})
	const deploymentCandidates = deployments.filter((record) => {
		return !record.deletedAt && record.createdAt <= cutoff && record.status !== 'active'
	})

	if (options.apply) {
		for (const preview of previewCandidates) {
			await upsertPreviewRecord(
				registry,
				devflarePreviewRecordSchema.parse({
					...preview,
					updatedAt: now,
					deletedAt: now,
					status: 'deleted'
				}),
				options.apiOptions
			)
		}

		for (const alias of aliasCandidates) {
			await upsertPreviewAliasRecord(
				registry,
				devflarePreviewAliasRecordSchema.parse({
					...alias,
					updatedAt: now,
					deletedAt: now,
					status: 'deleted'
				}),
				options.apiOptions
			)
		}

		for (const deployment of deploymentCandidates) {
			await upsertDeploymentRecord(
				registry,
				devflareDeploymentRecordSchema.parse({
					...deployment,
					updatedAt: now,
					deletedAt: now,
					status: 'deleted'
				}),
				options.apiOptions
			)
		}
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
	const previews = await readPreviewRows(registry, options.workerName, options.apiOptions)
	const aliases = await readPreviewAliasRows(registry, options.workerName, options.apiOptions)
	const deployments = await readDeploymentRows(registry, options.workerName, options.apiOptions)

	const directlyMatchedPreviews = previews.filter((record) => {
		return !record.deletedAt && matchesPreviewRetireTarget(record, options)
	})
	const directlyMatchedAliases = aliases.filter((record) => {
		return !record.deletedAt && matchesPreviewAliasRetireTarget(record, options)
	})
	const directlyMatchedDeployments = deployments.filter((record) => {
		return !record.deletedAt && matchesPreviewDeploymentRetireTarget(record, options)
	})

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

	const resolvedPreviewIds = new Set<string>(previewCandidates.map((record) => record.id))
	const resolvedVersionIds = new Set<string>([
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
		for (const preview of previewCandidates) {
			await upsertPreviewRecord(
				registry,
				devflarePreviewRecordSchema.parse({
					...preview,
					updatedAt: now,
					deletedAt: now,
					status: 'deleted'
				}),
				options.apiOptions
			)
		}

		for (const alias of aliasCandidates) {
			await upsertPreviewAliasRecord(
				registry,
				devflarePreviewAliasRecordSchema.parse({
					...alias,
					updatedAt: now,
					deletedAt: now,
					status: 'deleted'
				}),
				options.apiOptions
			)
		}

		for (const deployment of deploymentCandidates) {
			await upsertDeploymentRecord(
				registry,
				devflareDeploymentRecordSchema.parse({
					...deployment,
					updatedAt: now,
					deletedAt: now,
					status: 'deleted'
				}),
				options.apiOptions
			)
		}
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
