// =============================================================================
// Usage Tracking & Limits Module
// =============================================================================
// Tracks API usage and enforces limits to prevent unexpected costs
// Storage: Devflare-managed KV namespace in user's Cloudflare account
// =============================================================================

import { kvGet, kvPut } from './api'
import { DEVFLARE_KV_NAMESPACE_TITLE, getOrCreateNamedKVNamespace } from './kv-namespace'
import type { CloudflareService, UsageLimits, UsageRecord, UsageSummary } from './types'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const USAGE_KEY_PREFIX = 'usage:'
const LIMITS_KEY = 'limits'

// Default limits (can be overridden by user)
const DEFAULT_LIMITS: UsageLimits = {
	aiTokensPerDay: 10000, // 10k tokens per day for testing
	aiRequestsPerDay: 100, // 100 AI requests per day
	vectorizeOpsPerDay: 1000, // 1000 vectorize ops per day
	enabled: true
}

// -----------------------------------------------------------------------------
// KV Namespace Management
// -----------------------------------------------------------------------------

/**
 * Find or create the devflare-managed KV namespace
 */
async function getOrCreateUsageNamespace(accountId: string): Promise<string> {
	return getOrCreateNamedKVNamespace(accountId, DEVFLARE_KV_NAMESPACE_TITLE)
}

// -----------------------------------------------------------------------------
// Usage Tracking
// -----------------------------------------------------------------------------

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 */
function getTodayDate(): string {
	return new Date().toISOString().split('T')[0]
}

/**
 * Build the usage key for a service and date
 */
function buildUsageKey(service: CloudflareService, date: string): string {
	return `${USAGE_KEY_PREFIX}${service}:${date}`
}

/**
 * Get usage for a specific service on a specific date
 */
export async function getUsage(
	accountId: string,
	service: CloudflareService,
	date?: string
): Promise<UsageRecord | null> {
	const targetDate = date ?? getTodayDate()
	const namespaceId = await getOrCreateUsageNamespace(accountId)
	const key = buildUsageKey(service, targetDate)

	const value = await kvGet(accountId, namespaceId, key)

	if (value === null) {
		return null
	}

	try {
		return JSON.parse(value) as UsageRecord
	} catch {
		// If parsing fails, the stored value is corrupt; treat as not found
		return null
	}
}

/**
 * Optional injection points for {@link recordUsage}.
 *
 * Cloudflare's KV REST API does not expose an atomic compare-and-swap
 * primitive, so recording usage is implemented as an optimistic read-modify-
 * write loop with post-write verification. These dependencies are exposed
 * primarily for testing the retry path.
 */
export interface RecordUsageDeps {
	kvGet?: typeof kvGet
	kvPut?: typeof kvPut
	getNamespaceId?: (accountId: string) => Promise<string>
	sleep?: (ms: number) => Promise<void>
	now?: () => Date
	maxAttempts?: number
	warn?: (message: string) => void
}

const MAX_RECORD_USAGE_ATTEMPTS = 5

/**
 * Record usage for a service.
 *
 * Usage counts are recorded via an optimistic read-modify-write loop against
 * a Devflare-managed KV namespace. After each write the value is re-read and
 * compared against the update we just issued; if another writer clobbered it
 * we back off and retry, capped at {@link MAX_RECORD_USAGE_ATTEMPTS} attempts.
 *
 * Because Cloudflare KV is eventually consistent and lacks conditional writes,
 * the counters are inherently best-effort — under heavy concurrency some
 * increments can still be lost. When the retry budget is exhausted we emit a
 * warning instead of silently dropping the update.
 */
export async function recordUsage(
	accountId: string,
	service: CloudflareService,
	count = 1,
	deps: RecordUsageDeps = {}
): Promise<UsageRecord> {
	const kvGetFn = deps.kvGet ?? kvGet
	const kvPutFn = deps.kvPut ?? kvPut
	const getNamespaceId = deps.getNamespaceId ?? getOrCreateUsageNamespace
	const sleep =
		deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	const now = deps.now ?? (() => new Date())
	const maxAttempts = deps.maxAttempts ?? MAX_RECORD_USAGE_ATTEMPTS
	const warn = deps.warn ?? ((message: string) => console.warn(message))

	const today = now().toISOString().split('T')[0]
	const namespaceId = await getNamespaceId(accountId)
	const key = buildUsageKey(service, today)

	let lastWritten: UsageRecord | null = null
	let lastObserved: UsageRecord | null = null

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const existingRaw = await kvGetFn(accountId, namespaceId, key)
		let existing: UsageRecord | null = null
		if (existingRaw !== null) {
			try {
				existing = JSON.parse(existingRaw) as UsageRecord
			} catch {
				existing = null
			}
		}
		lastObserved = existing

		const record: UsageRecord = {
			service,
			date: today,
			count: (existing?.count ?? 0) + count,
			updatedAt: now().toISOString()
		}

		await kvPutFn(accountId, namespaceId, key, JSON.stringify(record))
		lastWritten = record

		// Verify: read-after-write. If our update is intact, we're done.
		// Note: KV is eventually consistent so this verification is best-effort.
		const verifyRaw = await kvGetFn(accountId, namespaceId, key)
		if (verifyRaw !== null) {
			try {
				const verify = JSON.parse(verifyRaw) as UsageRecord
				if (verify.updatedAt === record.updatedAt && verify.count === record.count) {
					return record
				}
			} catch {
				// fall through to retry
			}
		}

		// A concurrent writer clobbered our update (or the read is stale).
		// Back off and retry by re-reading and re-applying our delta on top.
		if (attempt < maxAttempts - 1) {
			const backoffMs = Math.min(25 * 2 ** attempt, 400)
			await sleep(backoffMs)
		}
	}

	warn(
		`[devflare] recordUsage: could not confirm usage write for ${service} after ${maxAttempts} attempts ` +
			'due to concurrent writes; usage counts are best-effort under concurrency.'
	)

	return (
		lastWritten ?? {
			service,
			date: today,
			count: (lastObserved?.count ?? 0) + count,
			updatedAt: now().toISOString()
		}
	)
}

/**
 * Reset usage for a service (typically called when limits are adjusted)
 */
export async function resetUsage(accountId: string, service: CloudflareService): Promise<void> {
	const today = getTodayDate()
	const namespaceId = await getOrCreateUsageNamespace(accountId)
	const key = buildUsageKey(service, today)

	const record: UsageRecord = {
		service,
		date: today,
		count: 0,
		updatedAt: new Date().toISOString()
	}

	await kvPut(accountId, namespaceId, key, JSON.stringify(record))
}

// -----------------------------------------------------------------------------
// Limits Management
// -----------------------------------------------------------------------------

/**
 * Get the current usage limits
 */
export async function getLimits(accountId: string): Promise<UsageLimits> {
	const namespaceId = await getOrCreateUsageNamespace(accountId)
	const value = await kvGet(accountId, namespaceId, LIMITS_KEY)

	if (value === null) {
		return DEFAULT_LIMITS
	}

	try {
		return { ...DEFAULT_LIMITS, ...JSON.parse(value) }
	} catch {
		return DEFAULT_LIMITS
	}
}

/**
 * Update usage limits
 */
export async function setLimits(
	accountId: string,
	limits: Partial<UsageLimits>
): Promise<UsageLimits> {
	const namespaceId = await getOrCreateUsageNamespace(accountId)
	const current = await getLimits(accountId)

	const updated: UsageLimits = {
		...current,
		...limits
	}

	await kvPut(accountId, namespaceId, LIMITS_KEY, JSON.stringify(updated))

	return updated
}

/**
 * Enable or disable limits enforcement
 */
export async function setLimitsEnabled(accountId: string, enabled: boolean): Promise<UsageLimits> {
	return setLimits(accountId, { enabled })
}

// -----------------------------------------------------------------------------
// Usage Checks
// -----------------------------------------------------------------------------

/**
 * Check if usage is within limits for a service
 */
export async function isWithinLimits(
	accountId: string,
	service: CloudflareService
): Promise<boolean> {
	const limits = await getLimits(accountId)

	// If limits are disabled, always within limits
	if (!limits.enabled) {
		return true
	}

	const usage = await getUsage(accountId, service)
	const currentCount = usage?.count ?? 0

	switch (service) {
		case 'ai':
			// Check request limits (token tracking would require more complex integration)
			if (limits.aiRequestsPerDay && currentCount >= limits.aiRequestsPerDay) {
				return false
			}
			return true

		case 'vectorize':
			if (limits.vectorizeOpsPerDay && currentCount >= limits.vectorizeOpsPerDay) {
				return false
			}
			return true

		default:
			// No limits defined for other services
			return true
	}
}

/**
 * Get usage summary for a service
 */
export async function getUsageSummary(
	accountId: string,
	service: CloudflareService
): Promise<UsageSummary> {
	const limits = await getLimits(accountId)
	const usage = await getUsage(accountId, service)
	const currentCount = usage?.count ?? 0

	let limit: number | undefined
	switch (service) {
		case 'ai':
			limit = limits.aiRequestsPerDay
			break
		case 'vectorize':
			limit = limits.vectorizeOpsPerDay
			break
	}

	const withinLimit = limit === undefined || currentCount < limit
	const percentUsed = limit ? (currentCount / limit) * 100 : undefined

	return {
		service,
		today: currentCount,
		limit,
		withinLimit,
		percentUsed
	}
}

/**
 * Get usage summary for all tracked services
 */
export async function getAllUsageSummaries(accountId: string): Promise<UsageSummary[]> {
	const trackedServices: CloudflareService[] = ['ai', 'vectorize']

	return Promise.all(trackedServices.map((s) => getUsageSummary(accountId, s)))
}

// -----------------------------------------------------------------------------
// Pre-test Check
// -----------------------------------------------------------------------------

/**
 * Check if we can proceed with testing for a specific service
 * Returns true if within limits, false if limits exceeded
 *
 * Use this before running tests that use remote bindings
 */
export async function canProceedWithTest(
	accountId: string,
	service: CloudflareService
): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getLimits(accountId)

	if (!limits.enabled) {
		return { allowed: true }
	}

	const withinLimits = await isWithinLimits(accountId, service)

	if (!withinLimits) {
		const summary = await getUsageSummary(accountId, service)
		return {
			allowed: false,
			reason: `Daily limit exceeded for ${service}: ${summary.today}/${summary.limit} (${summary.percentUsed?.toFixed(1)}%)`
		}
	}

	return { allowed: true }
}

/**
 * Record that a test used a remote service
 * Call this after successful test execution
 */
export async function recordTestUsage(
	accountId: string,
	service: CloudflareService,
	count = 1
): Promise<void> {
	await recordUsage(accountId, service, count)
}

// -----------------------------------------------------------------------------
// Simplified Skip Check for Tests
// -----------------------------------------------------------------------------

import { getPrimaryAccount } from './account'
// Import auth and account functions for skip check
import { isAuthenticated } from './auth'
import { getEffectiveAccountId } from './preferences'

/**
 * Check if tests for a service should be skipped
 *
 * Returns `true` if tests should be SKIPPED (service not available)
 * Returns `false` if tests can proceed
 *
 * Automatically logs the skip reason to console.
 *
 * NOTE: This function is read-only and catches all errors gracefully.
 * If Cloudflare is unreachable, auth fails, or limits can't be checked,
 * it will return true (skip) with an appropriate message.
 *
 * Usage:
 * ```ts
 * import { account } from 'devflare/cloudflare'
 *
 * const skipAI = await account.shouldSkip('ai')
 *
 * describe.skipIf(skipAI)('AI tests', () => {
 *   // ...
 * })
 * ```
 */
export async function shouldSkip(service: CloudflareService): Promise<boolean> {
	try {
		// 1. Check authentication
		const isAuth = await isAuthenticated()
		if (!isAuth) {
			console.log(
				`⏭️  ${service.toUpperCase()} tests skipped: Not authenticated. Run: bunx wrangler login`
			)
			return true
		}

		// 2. Get effective account ID
		const primary = await getPrimaryAccount()
		if (!primary) {
			console.log(`⏭️  ${service.toUpperCase()} tests skipped: No Cloudflare account found`)
			return true
		}

		const { accountId } = await getEffectiveAccountId(primary.id)

		// 3. Check usage limits (read-only: skip if namespace doesn't exist or check fails)
		try {
			const { allowed, reason } = await canProceedWithTest(accountId, service)
			if (!allowed) {
				console.log(`⏭️  ${service.toUpperCase()} tests skipped: ${reason}`)
				return true
			}
		} catch {
			// If limits can't be checked (e.g., KV not set up), allow the test to run
			// The user hasn't configured limits, so we assume they want to run tests
		}

		// All checks passed - don't skip
		return false
	} catch (error) {
		// Gracefully skip on any error (network issues, API errors, etc.)
		const message = error instanceof Error ? error.message : 'Unknown error'
		console.log(`⏭️  ${service.toUpperCase()} tests skipped: ${message}`)
		return true
	}
}
