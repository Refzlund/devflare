// =============================================================================
// Test Skip Helper — Ergonomic API for skipping tests
// =============================================================================
// Usage:
//   import { shouldSkip } from 'devflare/test'
//   const skipAI = await shouldSkip.ai
//   describe.skipIf(skipAI)('AI tests', () => { ... })
// =============================================================================

import { isAuthenticated } from '../cloudflare/auth'
import { getPrimaryAccount } from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'
import { canProceedWithTest } from '../cloudflare/usage'
import { isRemoteModeActive, getRemoteModeStatus } from '../cloudflare/remote-config'
import type { CloudflareService } from '../cloudflare/types'

// -----------------------------------------------------------------------------
// Services That ALWAYS Require Remote Bindings
// -----------------------------------------------------------------------------

/**
 * These services cannot be emulated locally — they ALWAYS require
 * a real connection to Cloudflare's infrastructure.
 */
const REMOTE_ONLY_SERVICES: Set<CloudflareService> = new Set([
	'ai',
	'vectorize'
])

// -----------------------------------------------------------------------------
// Skip Check Implementation
// -----------------------------------------------------------------------------

/**
 * Cached skip results — computed once at module load
 * Each service gets a Promise<boolean> that resolves to true if should SKIP
 */
const skipResults = new Map<CloudflareService, Promise<boolean>>()

/**
 * Known operational error patterns that should cause skipping rather than failing.
 * These are expected errors from network issues, API problems, auth failures, etc.
 */
const EXPECTED_ERROR_PATTERNS = [
	'ECONNREFUSED',
	'ETIMEDOUT',
	'ENOTFOUND',
	'fetch failed',
	'network',
	'401',
	'403',
	'429',
	'500',
	'502',
	'503',
	'504',
	'rate limit',
	'unauthorized',
	'forbidden',
	'timeout'
]

/**
 * Check if an error is an expected operational error that should cause skipping.
 */
function isExpectedError(error: unknown): boolean {
	if (!(error instanceof Error)) return false
	const msg = error.message.toLowerCase()
	return EXPECTED_ERROR_PATTERNS.some((pattern) => msg.includes(pattern.toLowerCase()))
}

/**
 * Compute whether to skip tests for a given service.
 * Returns true if tests should be SKIPPED.
 * Logs the reason to console.
 * 
 * Rethrows unexpected errors (programming bugs) to fail tests loudly.
 */
async function computeSkip(service: CloudflareService): Promise<boolean> {
	try {
		// 0. Remote-only services require explicit opt-in via DEVFLARE_REMOTE=1 or `devflare remote enable`
		if (REMOTE_ONLY_SERVICES.has(service) && !isRemoteModeActive()) {
			const status = getRemoteModeStatus()
			console.log(
				`⏭️  ${service.toUpperCase()} tests skipped: Remote-only service.\n` +
				`   Enable with: ${status.isEnabled ? '' : 'devflare remote enable'}\n` +
				`   Or set: DEVFLARE_REMOTE=1\n` +
				`   See: https://github.com/ArthurvdVenne/devflare#remote-testing`
			)
			return true
		}

		// 1. Check authentication
		const isAuth = await isAuthenticated()
		if (!isAuth) {
			console.log(
				`⏭️  ${service.toUpperCase()} tests skipped: Not authenticated. Run: bunx wrangler login\n` +
				`   See: https://github.com/ArthurvdVenne/devflare#authentication`
			)
			return true
		}

		// 2. Get effective account ID
		const primary = await getPrimaryAccount()
		if (!primary) {
			console.log(
				`⏭️  ${service.toUpperCase()} tests skipped: No Cloudflare account found\n` +
				`   See: https://github.com/ArthurvdVenne/devflare#authentication`
			)
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
		// Only skip on expected operational errors (network, API, auth issues)
		// Rethrow unexpected errors to fail tests loudly
		if (isExpectedError(error)) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			console.log(`⏭️  ${service.toUpperCase()} tests skipped: ${message}`)
			return true
		}

		// Unexpected error — rethrow to fail tests
		throw error
	}
}

/**
 * Get or compute the skip result for a service
 */
function getSkipResult(service: CloudflareService): Promise<boolean> {
	let result = skipResults.get(service)
	if (!result) {
		result = computeSkip(service)
		skipResults.set(service, result)
	}
	return result
}

// -----------------------------------------------------------------------------
// Public API — Property-based access
// -----------------------------------------------------------------------------

/**
 * Skip helper with property-based access for each service.
 * Each property returns a Promise<boolean> where true = SKIP the tests.
 * 
 * Usage:
 * ```ts
 * import { shouldSkip } from 'devflare/test'
 * 
 * describe.skipIf(shouldSkip.ai)('AI tests', () => {
 *   // These tests only run when authenticated and within limits
 * })
 * ```
 */
export const shouldSkip = {
	/** Skip AI tests if not authenticated or over limits */
	get ai(): Promise<boolean> {
		return getSkipResult('ai')
	},

	/** Skip Vectorize tests if not authenticated or over limits */
	get vectorize(): Promise<boolean> {
		return getSkipResult('vectorize')
	},

	/** Skip Workers tests if not authenticated or over limits */
	get workers(): Promise<boolean> {
		return getSkipResult('workers')
	},

	/** Skip KV tests if not authenticated or over limits */
	get kv(): Promise<boolean> {
		return getSkipResult('kv')
	},

	/** Skip D1 tests if not authenticated or over limits */
	get d1(): Promise<boolean> {
		return getSkipResult('d1')
	},

	/** Skip R2 tests if not authenticated or over limits */
	get r2(): Promise<boolean> {
		return getSkipResult('r2')
	},

	/** Skip Queues tests if not authenticated or over limits */
	get queues(): Promise<boolean> {
		return getSkipResult('queues')
	},

	/** Skip Durable Objects tests if not authenticated or over limits */
	get durableObjects(): Promise<boolean> {
		return getSkipResult('durable_objects')
	}
} as const
