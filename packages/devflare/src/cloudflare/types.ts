// =============================================================================
// Cloudflare API Types
// =============================================================================
// Type definitions for Cloudflare API responses and internal usage
// =============================================================================

// -----------------------------------------------------------------------------
// Account Types
// -----------------------------------------------------------------------------

export interface CloudflareAccount {
	id: string
	name: string
	type: 'standard' | 'enterprise' | string
	settings?: {
		enforce_twofactor?: boolean
		use_account_custom_ns_by_default?: boolean
	}
	created_on?: string
}

export interface AccountInfo {
	id: string
	name: string
	type: string
	createdOn?: Date
}

// -----------------------------------------------------------------------------
// Service Types
// -----------------------------------------------------------------------------

export type CloudflareService =
	| 'workers'
	| 'kv'
	| 'd1'
	| 'r2'
	| 'ai'
	| 'vectorize'
	| 'durable_objects'
	| 'queues'
	| 'hyperdrive'
	| 'browser'

export interface ServiceStatus {
	service: CloudflareService
	available: boolean
	count?: number
	details?: Record<string, unknown>
}

// -----------------------------------------------------------------------------
// Worker Types
// -----------------------------------------------------------------------------

export interface WorkerScript {
	id: string
	name?: string // Some APIs return 'name', others use 'id' as the name
	created_on: string
	modified_on: string
	etag?: string
}

export interface WorkerInfo {
	name: string
	createdOn: Date
	modifiedOn: Date
}

export interface WorkerVersionMetadata {
	authorEmail?: string
	authorId?: string
	createdOn?: Date
	modifiedOn?: Date
	hasPreview: boolean
	source?: string
}

export interface WorkerVersionInfo {
	id: string
	number?: number
	metadata: WorkerVersionMetadata
}

export interface WorkerDeploymentVersion {
	percentage: number
	versionId: string
}

export interface WorkerDeploymentInfo {
	id: string
	createdOn: Date
	source: string
	strategy: string
	versions: WorkerDeploymentVersion[]
	message?: string
	triggeredBy?: string
	authorEmail?: string
}

// -----------------------------------------------------------------------------
// KV Types
// -----------------------------------------------------------------------------

export interface KVNamespace {
	id: string
	title: string
	supports_url_encoding?: boolean
}

export interface KVNamespaceInfo {
	id: string
	name: string
}

// -----------------------------------------------------------------------------
// D1 Types
// -----------------------------------------------------------------------------

export interface D1Database {
	uuid: string
	name: string
	version: string
	num_tables?: number
	file_size?: number
	created_at?: string
}

export interface D1DatabaseInfo {
	id: string
	name: string
	version: string
	tableCount?: number
	sizeBytes?: number
}

// -----------------------------------------------------------------------------
// Queue Types
// -----------------------------------------------------------------------------

export interface Queue {
	queue_id?: string
	queue_name?: string
	created_on?: string
	modified_on?: string
	settings?: {
		delivery_delay?: number
		delivery_paused?: boolean
		message_retention_period?: number
	}
}

export interface QueueInfo {
	id: string
	name: string
	createdOn?: Date
	modifiedOn?: Date
	deliveryDelay?: number
	deliveryPaused?: boolean
	messageRetentionPeriod?: number
}

// -----------------------------------------------------------------------------
// Hyperdrive Types
// -----------------------------------------------------------------------------

export interface HyperdriveConfig {
	id: string
	name: string
	created_on?: string
	modified_on?: string
}

export interface HyperdriveConfigInfo {
	id: string
	name: string
	createdOn?: Date
	modifiedOn?: Date
}

export type D1QueryParameter = string | number | boolean | null

export interface D1QueryMeta {
	changedDb?: boolean
	changes?: number
	duration?: number
	lastRowId?: number
	rowsRead?: number
	rowsWritten?: number
	servedByColo?: string
	servedByPrimary?: boolean
	servedByRegion?: string
	sizeAfter?: number
	timings?: {
		sqlDurationMs?: number
	}
}

export interface D1QueryResult<T = Record<string, unknown>> {
	meta?: D1QueryMeta
	results?: T[]
	success?: boolean
}

export interface D1RawQueryResult {
	meta?: D1QueryMeta
	results?: {
		columns?: string[]
		rows?: Array<Array<string | number | boolean | null | Record<string, unknown>>>
	}
	success?: boolean
}

// -----------------------------------------------------------------------------
// R2 Types
// -----------------------------------------------------------------------------

export interface R2Bucket {
	name: string
	creation_date: string
	location?: string
}

export interface R2BucketInfo {
	name: string
	createdOn: Date
	location?: string
}

// -----------------------------------------------------------------------------
// Vectorize Types
// -----------------------------------------------------------------------------

export interface VectorizeIndex {
	name: string
	description?: string
	config: {
		dimensions: number
		metric: 'cosine' | 'euclidean' | 'dot-product'
	}
	created_on?: string
	modified_on?: string
}

export interface VectorizeIndexInfo {
	name: string
	dimensions: number
	metric: string
	description?: string
}

// -----------------------------------------------------------------------------
// AI Types
// -----------------------------------------------------------------------------

export interface AIModel {
	id: string
	name: string
	description?: string
	task?: {
		id: string
		name: string
		description?: string
	}
	properties?: Array<{
		property_id: string
		value: string
	}>
}

export interface AIModelInfo {
	id: string
	name: string
	task?: string
	description?: string
}

// -----------------------------------------------------------------------------
// Usage & Limits Types
// -----------------------------------------------------------------------------

export interface UsageRecord {
	service: CloudflareService
	/** ISO date string (YYYY-MM-DD) */
	date: string
	/** Usage count (requests, tokens, bytes, etc.) */
	count: number
	/** Last updated timestamp */
	updatedAt: string
}

export interface UsageLimits {
	/** Daily limit for AI tokens (across all models) */
	aiTokensPerDay?: number
	/** Daily limit for AI requests */
	aiRequestsPerDay?: number
	/** Daily limit for Vectorize operations */
	vectorizeOpsPerDay?: number
	/** Whether limits are enabled */
	enabled: boolean
}

export interface UsageSummary {
	service: CloudflareService
	today: number
	limit?: number
	withinLimit: boolean
	percentUsed?: number
}

// -----------------------------------------------------------------------------
// API Response Types
// -----------------------------------------------------------------------------

export interface CloudflareAPIResponse<T> {
	success: boolean
	errors: Array<{ code: number; message: string }>
	messages: Array<{ code: number; message: string }>
	result: T
	result_info?: {
		page: number
		per_page: number
		total_pages: number
		count: number
		total_count: number
	}
}

// -----------------------------------------------------------------------------
// Auth Types
// -----------------------------------------------------------------------------

export interface WranglerAuth {
	/** OAuth token from wrangler config */
	oauthToken?: string
	/** API token (if explicitly set) */
	apiToken?: string
	/** Refresh token for OAuth */
	refreshToken?: string
	/** Token expiry time */
	expiresAt?: Date
}

// -----------------------------------------------------------------------------
// API Token Types
// -----------------------------------------------------------------------------

export interface AccountTokenPermissionGroup {
	id: string
	name: string
	description?: string
	scopes: string[]
}

export interface AccountOwnedAPITokenPermissionGroup {
	id: string
	name?: string
}

export interface AccountOwnedAPITokenPolicy {
	id?: string
	effect?: 'allow' | 'deny'
	permissionGroups?: AccountOwnedAPITokenPermissionGroup[]
}

export interface AccountOwnedAPIToken {
	id: string
	name: string
	status?: string
	value?: string
	issuedOn?: Date
	modifiedOn?: Date
	lastUsedOn?: Date
	policies?: AccountOwnedAPITokenPolicy[]
}

export interface AccountOwnedAPITokenDeleteResult {
	id: string
}
