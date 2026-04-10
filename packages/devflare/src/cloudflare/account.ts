// =============================================================================
// Cloudflare Account Module
// =============================================================================
// Provides account information, service status, and resource listing
// =============================================================================

import { apiGet, apiGetAll, apiPatch, type APIClientOptions } from './api'
import { isAuthenticated } from './auth'
import type {
	AccountInfo,
	CloudflareAccount,
	CloudflareService,
	ServiceStatus,
	WorkerScript,
	WorkerInfo,
	WorkerVersionInfo,
	WorkerDeploymentInfo,
	D1QueryParameter,
	D1QueryResult,
	D1RawQueryResult,
	KVNamespace,
	KVNamespaceInfo,
	D1Database,
	D1DatabaseInfo,
	R2Bucket,
	R2BucketInfo,
	VectorizeIndex,
	VectorizeIndexInfo,
	AIModel,
	AIModelInfo
} from './types'

interface WorkersSubdomainResponse {
	subdomain: string
}

interface WorkerVersionsListResult {
	items?: Array<{
		id?: string
		number?: number
		metadata?: {
			author_email?: string
			author_id?: string
			created_on?: string
			modified_on?: string
			hasPreview?: boolean
			source?: string
		}
	}>
}

interface WorkerVersionDetailResult {
	id?: string
	number?: number
	metadata?: {
		author_email?: string
		author_id?: string
		created_on?: string
		modified_on?: string
		hasPreview?: boolean
		source?: string
	}
}

interface WorkerDeploymentsListResult {
	deployments?: Array<{
		id: string
		created_on: string
		source: string
		strategy: string
		versions: Array<{
			percentage: number
			version_id: string
		}>
		annotations?: {
			'workers/message'?: string
			'workers/triggered_by'?: string
		}
		author_email?: string
	}>
}

interface EditWorkerResult {
	id: string
	name: string
}

export interface RenamedWorkerInfo {
	id: string
	name: string
}

// -----------------------------------------------------------------------------
// Account Info
// -----------------------------------------------------------------------------

/**
 * Get list of accounts the user has access to
 */
export async function getAccounts(options?: APIClientOptions): Promise<AccountInfo[]> {
	const accounts = await apiGetAll<CloudflareAccount>('/accounts', options)

	return accounts.map((acc) => ({
		id: acc.id,
		name: acc.name,
		type: acc.type,
		createdOn: acc.created_on ? new Date(acc.created_on) : undefined
	}))
}

/**
 * Get the primary account (first account in the list)
 * Most users have a single account, so this is usually sufficient
 */
export async function getPrimaryAccount(options?: APIClientOptions): Promise<AccountInfo | null> {
	const accounts = await getAccounts(options)
	return accounts[0] ?? null
}

/**
 * Get account by ID
 */
export async function getAccountById(accountId: string, options?: APIClientOptions): Promise<AccountInfo | null> {
	try {
		const account = await apiGet<CloudflareAccount>(`/accounts/${accountId}`, options)
		return {
			id: account.id,
			name: account.name,
			type: account.type,
			createdOn: account.created_on ? new Date(account.created_on) : undefined
		}
	} catch {
		return null
	}
}

// -----------------------------------------------------------------------------
// Workers
// -----------------------------------------------------------------------------

/**
 * List all Workers scripts in an account
 */
export async function listWorkers(
	accountId: string,
	options?: APIClientOptions
): Promise<WorkerInfo[]> {
	const scripts = await apiGetAll<WorkerScript>(
		`/accounts/${accountId}/workers/scripts`,
		options
	)

	return scripts.map((s) => ({
		name: s.name ?? s.id, // Use name if available, otherwise fall back to id
		createdOn: new Date(s.created_on),
		modifiedOn: new Date(s.modified_on)
	}))
}

/**
 * Rename an existing Worker without creating a new Worker identity.
 */
export async function renameWorker(
	accountId: string,
	workerId: string,
	newName: string,
	options?: APIClientOptions
): Promise<RenamedWorkerInfo> {
	const encodedWorkerId = encodeURIComponent(workerId)
	const result = await apiPatch<EditWorkerResult>(
		`/accounts/${accountId}/workers/workers/${encodedWorkerId}`,
		{ name: newName },
		options
	)

	return {
		id: result.id,
		name: result.name
	}
}

function mapWorkerVersionInfo(
	version: NonNullable<WorkerVersionsListResult['items']>[number] | WorkerVersionDetailResult
): WorkerVersionInfo {
	return {
		id: version.id ?? '',
		number: version.number,
		metadata: {
			authorEmail: version.metadata?.author_email,
			authorId: version.metadata?.author_id,
			createdOn: version.metadata?.created_on ? new Date(version.metadata.created_on) : undefined,
			modifiedOn: version.metadata?.modified_on ? new Date(version.metadata.modified_on) : undefined,
			hasPreview: version.metadata?.hasPreview === true,
			source: version.metadata?.source
		}
	}
}

/**
 * List Worker versions for a script.
 */
export async function listWorkerVersions(
	accountId: string,
	scriptName: string,
	options?: APIClientOptions
): Promise<WorkerVersionInfo[]> {
	const versions: WorkerVersionInfo[] = []
	const encodedScriptName = encodeURIComponent(scriptName)

	for (let page = 1; page <= 100; page++) {
		const result = await apiGet<WorkerVersionsListResult>(
			`/accounts/${accountId}/workers/scripts/${encodedScriptName}/versions?page=${page}&per_page=100`,
			options
		)

		const items = result.items ?? []
		versions.push(...items.map((item) => mapWorkerVersionInfo(item)))

		if (items.length < 100) {
			break
		}
	}

	return versions
}

/**
 * Get a single Worker version detail.
 */
export async function getWorkerVersionDetail(
	accountId: string,
	scriptName: string,
	versionId: string,
	options?: APIClientOptions
): Promise<WorkerVersionInfo> {
	const encodedScriptName = encodeURIComponent(scriptName)
	const result = await apiGet<WorkerVersionDetailResult>(
		`/accounts/${accountId}/workers/scripts/${encodedScriptName}/versions/${versionId}`,
		options
	)

	return mapWorkerVersionInfo(result)
}

/**
 * List Worker deployments for a script.
 */
export async function listWorkerDeployments(
	accountId: string,
	scriptName: string,
	options?: APIClientOptions
): Promise<WorkerDeploymentInfo[]> {
	const encodedScriptName = encodeURIComponent(scriptName)
	const result = await apiGet<WorkerDeploymentsListResult>(
		`/accounts/${accountId}/workers/scripts/${encodedScriptName}/deployments`,
		options
	)

	return (result.deployments ?? []).map((deployment) => ({
		id: deployment.id,
		createdOn: new Date(deployment.created_on),
		source: deployment.source,
		strategy: deployment.strategy,
		versions: deployment.versions.map((version) => ({
			percentage: version.percentage,
			versionId: version.version_id
		})),
		message: deployment.annotations?.['workers/message'],
		triggeredBy: deployment.annotations?.['workers/triggered_by'],
		authorEmail: deployment.author_email
	}))
}

/**
 * Get the account's workers.dev subdomain.
 */
export async function getWorkersSubdomain(
	accountId: string,
	options?: APIClientOptions
): Promise<string | null> {
	try {
		const result = await apiGet<WorkersSubdomainResponse>(
			`/accounts/${accountId}/workers/subdomain`,
			options
		)

		return result.subdomain || null
	} catch {
		return null
	}
}

// -----------------------------------------------------------------------------
// KV Namespaces
// -----------------------------------------------------------------------------

/**
 * List all KV namespaces in an account
 */
export async function listKVNamespaces(
	accountId: string,
	options?: APIClientOptions
): Promise<KVNamespaceInfo[]> {
	const namespaces = await apiGetAll<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		options
	)

	return namespaces.map((ns) => ({
		id: ns.id,
		name: ns.title
	}))
}

// -----------------------------------------------------------------------------
// D1 Databases
// -----------------------------------------------------------------------------

/**
 * List all D1 databases in an account
 */
export async function listD1Databases(
	accountId: string,
	options?: APIClientOptions
): Promise<D1DatabaseInfo[]> {
	const databases = await apiGetAll<D1Database>(
		`/accounts/${accountId}/d1/database`,
		options
	)

	return databases.map((db) => ({
		id: db.uuid,
		name: db.name,
		version: db.version,
		tableCount: db.num_tables,
		sizeBytes: db.file_size
	}))
}

/**
 * Create a D1 database.
 */
export async function createD1Database(
	accountId: string,
	name: string,
	options?: APIClientOptions & {
		jurisdiction?: 'eu' | 'fedramp'
		primaryLocationHint?: 'wnam' | 'enam' | 'weur' | 'eeur' | 'apac' | 'oc'
	}
): Promise<D1DatabaseInfo> {
	const created = await (await import('./api')).apiPost<D1Database>(
		`/accounts/${accountId}/d1/database`,
		{
			name,
			...(options?.jurisdiction ? { jurisdiction: options.jurisdiction } : {}),
			...(options?.primaryLocationHint ? { primary_location_hint: options.primaryLocationHint } : {})
		},
		options
	)

	return {
		id: created.uuid,
		name: created.name,
		version: created.version,
		tableCount: created.num_tables,
		sizeBytes: created.file_size
	}
}

/**
 * Execute a D1 query and return row objects.
 */
export async function queryD1Database<T = Record<string, unknown>>(
	accountId: string,
	databaseId: string,
	query: {
		sql: string
		params?: D1QueryParameter[]
	},
	options?: APIClientOptions
): Promise<D1QueryResult<T>[]> {
	const { apiPost } = await import('./api')
	return apiPost<D1QueryResult<T>[]>(
		`/accounts/${accountId}/d1/database/${databaseId}/query`,
		query,
		options
	)
}

/**
 * Execute a D1 raw query and return array rows.
 */
export async function rawD1DatabaseQuery(
	accountId: string,
	databaseId: string,
	query: {
		sql: string
		params?: D1QueryParameter[]
	},
	options?: APIClientOptions
): Promise<D1RawQueryResult[]> {
	const { apiPost } = await import('./api')
	return apiPost<D1RawQueryResult[]>(
		`/accounts/${accountId}/d1/database/${databaseId}/raw`,
		query,
		options
	)
}

// -----------------------------------------------------------------------------
// R2 Buckets
// -----------------------------------------------------------------------------

/**
 * List all R2 buckets in an account
 */
export async function listR2Buckets(
	accountId: string,
	options?: APIClientOptions
): Promise<R2BucketInfo[]> {
	const buckets = await apiGetAll<R2Bucket>(
		`/accounts/${accountId}/r2/buckets`,
		options
	)

	return buckets.map((b) => ({
		name: b.name,
		createdOn: new Date(b.creation_date),
		location: b.location
	}))
}

// -----------------------------------------------------------------------------
// Vectorize Indexes
// -----------------------------------------------------------------------------

/**
 * List all Vectorize indexes in an account
 */
export async function listVectorizeIndexes(
	accountId: string,
	options?: APIClientOptions
): Promise<VectorizeIndexInfo[]> {
	try {
		const indexes = await apiGetAll<VectorizeIndex>(
			`/accounts/${accountId}/vectorize/v2/indexes`,
			options
		)

		return indexes.map((idx) => ({
			name: idx.name,
			dimensions: idx.config.dimensions,
			metric: idx.config.metric,
			description: idx.description
		}))
	} catch {
		// Vectorize might not be available on all accounts
		return []
	}
}

// -----------------------------------------------------------------------------
// AI Models
// -----------------------------------------------------------------------------

/**
 * List available AI models
 */
export async function listAIModels(
	accountId: string,
	options?: APIClientOptions
): Promise<AIModelInfo[]> {
	try {
		const models = await apiGetAll<AIModel>(
			`/accounts/${accountId}/ai/models/search`,
			options
		)

		return models.map((m) => ({
			id: m.id,
			name: m.name,
			task: m.task?.name,
			description: m.description
		}))
	} catch {
		// AI might not be available on all accounts
		return []
	}
}

// -----------------------------------------------------------------------------
// Service Status
// -----------------------------------------------------------------------------

/**
 * Check the status of a specific service
 * Uses a short timeout to avoid hanging
 */
export async function getServiceStatus(
	accountId: string,
	service: CloudflareService
): Promise<ServiceStatus> {
	const timeout = 10000 // 10 second timeout for each service

	try {
		switch (service) {
			case 'workers': {
				const workers = await Promise.race([
					listWorkers(accountId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					)
				])
				return {
					service,
					available: true,
					count: workers.length
				}
			}

			case 'kv': {
				const namespaces = await Promise.race([
					listKVNamespaces(accountId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					)
				])
				return {
					service,
					available: true,
					count: namespaces.length
				}
			}

			case 'd1': {
				const databases = await Promise.race([
					listD1Databases(accountId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					)
				])
				return {
					service,
					available: true,
					count: databases.length
				}
			}

			case 'r2': {
				const buckets = await Promise.race([
					listR2Buckets(accountId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					)
				])
				return {
					service,
					available: true,
					count: buckets.length
				}
			}

			case 'vectorize': {
				const indexes = await Promise.race([
					listVectorizeIndexes(accountId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					)
				])
				return {
					service,
					available: true,
					count: indexes.length
				}
			}

			case 'ai': {
				// AI models list is often huge - just check if AI is accessible
				// rather than fetching all models
				const models = await Promise.race([
					listAIModels(accountId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					)
				])
				return {
					service,
					available: models.length > 0,
					count: models.length
				}
			}

			default:
				return {
					service,
					available: false
				}
		}
	} catch {
		return {
			service,
			available: false
		}
	}
}

/**
 * Get status of all services
 */
export async function getAllServiceStatus(accountId: string): Promise<ServiceStatus[]> {
	const services: CloudflareService[] = [
		'workers',
		'kv',
		'd1',
		'r2',
		'vectorize',
		'ai'
	]

	const statuses = await Promise.all(
		services.map((s) => getServiceStatus(accountId, s))
	)

	return statuses
}

// -----------------------------------------------------------------------------
// Quick Checks
// -----------------------------------------------------------------------------

/**
 * Check if the user is authenticated with Cloudflare
 */
export async function checkAuth(): Promise<boolean> {
	return isAuthenticated()
}

/**
 * Quick check if a service is available for an account
 */
export async function hasService(
	accountId: string,
	service: CloudflareService
): Promise<boolean> {
	const status = await getServiceStatus(accountId, service)
	return status.available
}

/**
 * Get a summary of the account
 */
export interface AccountSummary {
	account: AccountInfo
	services: ServiceStatus[]
}

export async function getAccountSummary(accountId: string): Promise<AccountSummary | null> {
	const account = await getAccountById(accountId)
	if (!account) return null

	const services = await getAllServiceStatus(accountId)

	return {
		account,
		services
	}
}
