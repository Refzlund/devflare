// =============================================================================
// Case 3: DO Service - Rate Limiter DO
// =============================================================================
// Rate Limiter Durable Object hosted in a separate worker.
// This demonstrates cross-worker DO access via service bindings.
// =============================================================================

import { DurableObject } from 'cloudflare:workers'

/**
 * Rate Limiter Durable Object
 * Implements a sliding window rate limiter.
 *
 * Extends DurableObject from cloudflare:workers for Miniflare RPC compatibility.
 */
export class RateLimiter extends DurableObject<DevflareEnv> {
	private requests: number[] = []

	/**
	 * RPC method: Check if rate limit is exceeded
	 * @param maxRequests - Maximum requests allowed in window
	 * @param windowMs - Window size in milliseconds
	 * @returns true if rate limited, false if allowed
	 */
	async checkLimit(maxRequests = 100, windowMs = 60000): Promise<boolean> {
		const now = Date.now()
		const windowStart = now - windowMs

		// Clean old requests outside the window
		this.requests = this.requests.filter((t) => t > windowStart)

		if (this.requests.length >= maxRequests) {
			return true // Rate limited
		}

		// Add current request
		this.requests.push(now)
		await this.ctx.storage.put('requests', this.requests)

		return false // Allowed
	}

	/**
	 * RPC method: Get remaining requests allowed
	 */
	getRemaining(maxRequests = 100): number {
		return Math.max(0, maxRequests - this.requests.length)
	}

	/**
	 * RPC method: Reset rate limit
	 */
	async reset(): Promise<void> {
		this.requests = []
		await this.ctx.storage.delete('requests')
	}

	/**
	 * RPC method: Get current request count
	 */
	getCount(): number {
		return this.requests.length
	}
}
