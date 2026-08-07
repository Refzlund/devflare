// =============================================================================
// Devflare Cloudflare Module
// =============================================================================
// Main entry point for `import { account } from 'devflare/cloudflare'`
// Provides account info, service status, usage tracking, and limit enforcement
// =============================================================================

import {
	checkAuth,
	createD1Database,
	deleteWorker,
	getAccountById,
	getAccountSummary,
	getAccounts,
	getAllServiceStatus,
	getPrimaryAccount,
	getServiceStatus,
	getWorkerVersionDetail,
	getWorkersSubdomain,
	hasService,
	listAIModels,
	listD1Databases,
	listKVNamespaces,
	listR2Buckets,
	listVectorizeIndexes,
	listWorkerDeployments,
	listWorkerVersions,
	listWorkers,
	queryD1Database,
	rawD1DatabaseQuery,
	renameWorker
} from './account'

import {
	canProceedWithTest,
	getAllUsageSummaries,
	getLimits,
	getUsage,
	getUsageSummary,
	isWithinLimits,
	recordTestUsage,
	recordUsage,
	resetUsage,
	setLimits,
	setLimitsEnabled,
	shouldSkip
} from './usage'

import {
	clearGlobalDefaultAccountId,
	getEffectiveAccountId,
	getGlobalDefaultAccountId,
	getWorkspaceAccountId,
	setGlobalDefaultAccountId,
	setWorkspaceAccountId
} from './preferences'

import { type APIClientOptions, AuthenticationError, CloudflareAPIError } from './api'
import {
	getApiToken,
	getWranglerAuth,
	hasWranglerConfig,
	invalidateToken,
	isAuthenticated
} from './auth'
import {
	DEVFLARE_PREVIEW_REGISTRY_DATABASE,
	cleanupPreviewRegistry,
	ensurePreviewRegistry,
	getPreviewRegistryContext,
	listTrackedDeploymentRecords,
	listTrackedPreviewRecords,
	listTrackedPreviewScopeRecords,
	listTrackedRegistryState,
	reconcilePreviewRegistry,
	retirePreviewRegistry
} from './preview-registry'
import {
	createAccountOwnedAPIToken,
	deleteAccountOwnedAPIToken,
	listAccountOwnedAPITokens,
	listAccountTokenPermissionGroups,
	normalizeDevflareTokenName
} from './tokens'

export {
	devflareAccountRecordSchema,
	createDevflareAccountRecordSchema,
	devflareRecordSourceSchema,
	devflarePreviewStatusSchema,
	devflarePreviewScopeStatusSchema,
	devflareDeploymentChannelSchema,
	devflareDeploymentStatusSchema,
	devflarePreviewRecordSchema,
	devflarePreviewScopeRecordSchema,
	devflareDeploymentRecordSchema,
	devflareAccountLayerRecordSchema
} from './registry-schema'

// -----------------------------------------------------------------------------
// Account API
// -----------------------------------------------------------------------------

/**
 * Main account API object
 *
 * Usage:
 * ```ts
 * import { account } from 'devflare/cloudflare'
 *
 * // Check authentication
 * const isLoggedIn = await account.isAuthenticated()
 *
 * // Get primary account
 * const primary = await account.getPrimaryAccount()
 *
 * // List resources (requires accountId)
 * const workers = await account.workers(accountId)
 *
 * // Check usage limits before testing
 * const { allowed } = await account.canProceedWithTest(accountId, 'ai')
 * ```
 */
export const account = {
	// -------------------------------------------------------------------------
	// Authentication
	// -------------------------------------------------------------------------

	/** Check if user is authenticated with Cloudflare */
	isAuthenticated,

	/** Check if wrangler config file exists */
	hasWranglerConfig,

	/** Get the API token (from env or wrangler config) */
	getApiToken,

	/** Get full wrangler auth info */
	getWranglerAuth,

	// -------------------------------------------------------------------------
	// Account Info
	// -------------------------------------------------------------------------

	/** Get all accounts the user has access to */
	getAccounts,

	/** Get the primary (first) account */
	getPrimaryAccount,

	/** Get account by ID */
	getAccountById,

	/** Get comprehensive account summary with all services */
	getAccountSummary,

	// -------------------------------------------------------------------------
	// Resource Listing
	// -------------------------------------------------------------------------

	/** List all Workers scripts */
	workers: listWorkers,

	/** Rename an existing Worker */
	renameWorker,

	/** Delete a Worker script */
	deleteWorker,

	/** List all Worker versions for a script */
	workerVersions: listWorkerVersions,

	/** Get a single Worker version detail */
	workerVersion: getWorkerVersionDetail,

	/** List all Worker deployments for a script */
	workerDeployments: listWorkerDeployments,

	/** Get the account workers.dev subdomain */
	workersSubdomain: getWorkersSubdomain,

	/** List all KV namespaces */
	kv: listKVNamespaces,

	/** List all D1 databases */
	d1: listD1Databases,

	/** Create a D1 database */
	createD1Database,

	/** Execute a D1 query */
	queryD1Database,

	/** Execute a D1 raw query */
	rawD1DatabaseQuery,

	/** List all R2 buckets */
	r2: listR2Buckets,

	/** List all Vectorize indexes */
	vectorize: listVectorizeIndexes,

	/** List available AI models */
	ai: listAIModels,

	// -------------------------------------------------------------------------
	// Service Status
	// -------------------------------------------------------------------------

	/** Get status of a specific service */
	getServiceStatus,

	/** Get status of all services */
	getAllServiceStatus,

	/** Check if a service is available */
	hasService,

	// -------------------------------------------------------------------------
	// Usage Tracking
	// -------------------------------------------------------------------------

	/** Get usage for a service on a date */
	getUsage,

	/** Record usage for a service */
	recordUsage,

	/** Reset usage counter for a service */
	resetUsage,

	/** Get all usage summaries */
	getAllUsageSummaries,

	/** Get usage summary for a service */
	getUsageSummary,

	// -------------------------------------------------------------------------
	// Limits
	// -------------------------------------------------------------------------

	/** Get current usage limits */
	getLimits,

	/** Update usage limits */
	setLimits,

	/** Enable or disable limit enforcement */
	setLimitsEnabled,

	/** Check if within limits for a service */
	isWithinLimits,

	// -------------------------------------------------------------------------
	// Test Helpers
	// -------------------------------------------------------------------------

	/** Check if a test can proceed (within limits) */
	canProceedWithTest,

	/** Record test usage after successful test */
	recordTestUsage,

	/**
	 * Check if tests for a service should be skipped
	 * Returns true if tests should be SKIPPED (not authenticated, no account, or limits exceeded)
	 * Automatically logs the skip reason to console.
	 *
	 * Usage: `const skipAI = await account.shouldSkip('ai')`
	 */
	shouldSkip,

	// -------------------------------------------------------------------------
	// Preferences
	// -------------------------------------------------------------------------

	/** Get the global default account ID */
	getGlobalDefaultAccountId,

	/** Set the global default account ID */
	setGlobalDefaultAccountId,

	/** Get the workspace account ID from package.json */
	getWorkspaceAccountId,

	/** Set the workspace account ID in package.json */
	setWorkspaceAccountId,

	/** Get the effective account ID (workspace > global > primary) */
	getEffectiveAccountId,

	/** Clear the global default account ID */
	clearGlobalDefaultAccountId,

	/** List permission groups available for account-owned API tokens */
	listAccountTokenPermissionGroups,

	/** List account-owned API tokens */
	listAccountOwnedAPITokens,

	/** Create a new account-owned API token */
	createAccountOwnedAPIToken,

	/** Delete an account-owned API token */
	deleteAccountOwnedAPIToken,

	/** Normalize a token name to the managed devflare- prefix */
	normalizeDevflareTokenName,

	/** Default D1 database name used by the Devflare preview registry */
	previewRegistryDatabase: DEVFLARE_PREVIEW_REGISTRY_DATABASE,

	/** Ensure the Devflare preview registry D1 database exists */
	ensurePreviewRegistry,

	/** Get the current preview registry context */
	getPreviewRegistryContext,

	/** List tracked preview records from the Devflare registry */
	listTrackedPreviewRecords,

	/** List tracked preview, scope, and deployment records from the Devflare registry */
	listTrackedRegistryState,

	/** List tracked preview-scope records from the Devflare registry */
	listTrackedPreviewScopeRecords,

	/** List tracked deployment records from the Devflare registry */
	listTrackedDeploymentRecords,

	/** Reconcile the Devflare preview registry with live Cloudflare state */
	reconcilePreviewRegistry,

	/** Clean up stale Devflare preview registry records */
	cleanupPreviewRegistry,

	/** Retire a tracked preview, scope, and preview deployment immediately */
	retirePreviewRegistry
} as const

// -----------------------------------------------------------------------------
// Type Exports
// -----------------------------------------------------------------------------

export type {
	AccountInfo,
	CloudflareAccount,
	CloudflareService,
	ServiceStatus,
	WorkerInfo,
	WorkerVersionInfo,
	WorkerDeploymentInfo,
	KVNamespaceInfo,
	D1DatabaseInfo,
	D1QueryParameter,
	D1QueryResult,
	D1RawQueryResult,
	R2BucketInfo,
	VectorizeIndexInfo,
	AIModelInfo,
	UsageRecord,
	UsageLimits,
	UsageSummary,
	WranglerAuth,
	AccountTokenPermissionGroup,
	AccountOwnedAPIToken,
	AccountOwnedAPITokenDeleteResult,
	AccountOwnedAPITokenPermissionGroup,
	AccountOwnedAPITokenPolicy
} from './types'

export type { RenamedWorkerInfo } from './account'

export type {
	CloudflareUserId,
	DevflareAccountRecord,
	DevflareRecordSource,
	DevflarePreviewStatus,
	DevflarePreviewScopeStatus,
	DevflareDeploymentChannel,
	DevflareDeploymentStatus,
	DevflarePreviewRecord,
	DevflarePreviewScopeRecord,
	DevflareDeploymentRecord,
	DevflareAccountLayerRecord
} from './registry-schema'

export type {
	PreviewRegistryContext,
	ReconcilePreviewRegistryResult,
	CleanupPreviewRegistryResult,
	RetirePreviewRegistryResult
} from './preview-registry'

export {
	ensurePreviewRegistry,
	getPreviewRegistryContext,
	listTrackedRegistryState,
	listTrackedPreviewRecords,
	listTrackedPreviewScopeRecords,
	listTrackedDeploymentRecords,
	reconcilePreviewRegistry,
	cleanupPreviewRegistry,
	retirePreviewRegistry,
	DEVFLARE_PREVIEW_REGISTRY_DATABASE
} from './preview-registry'

// -----------------------------------------------------------------------------
// Zone-scoped Exports
// -----------------------------------------------------------------------------
// Everything above is account-scoped. These reach a ZONE, which is a different
// identifier, a different lookup, and a different token scope.

export {
	resolveZone,
	getEmailRoutingSettings,
	enableEmailRouting,
	listEmailRoutingRules,
	createEmailRoutingRule,
	getEmailRoutingCatchAll,
	setEmailRoutingCatchAll,
	listDnsRecords,
	createDnsRecord,
	updateDnsRecord,
	listSendingDomains,
	createSendingDomain,
	getSendingDomainDnsStatus
} from './zone-resources'
export type {
	ZoneInfo,
	ResolvedZone,
	EmailRoutingMatcher,
	EmailRoutingAction,
	EmailRoutingRule,
	EmailRoutingSettings,
	DnsRecord,
	SendingDomain,
	SendingDomainDnsStatus
} from './zone-resources'

export { listEventSubscriptions, createEventSubscription } from './event-subscriptions'
export type {
	EventSubscription,
	EventSubscriptionSource,
	EventSubscriptionDestination
} from './event-subscriptions'

// -----------------------------------------------------------------------------
// Error Exports
// -----------------------------------------------------------------------------

export { CloudflareAPIError, AuthenticationError }
export type { APIClientOptions }
