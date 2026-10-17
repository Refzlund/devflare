// =============================================================================
// Case 3: Request Tracker Durable Object (unique to case3)
// =============================================================================
// Tracks request statistics in a Durable Object.
// Different from do-service's Counter/RateLimiter — this is for analytics.
// =============================================================================

import { DurableObject } from 'cloudflare:workers'

/**
 * Request Tracker Durable Object
 * Tracks request counts and timing statistics.
 *
 * Note: Extends DurableObject from cloudflare:workers for Miniflare RPC compatibility.
 */
export class RequestTracker extends DurableObject<DevflareEnv> {
	private totalRequests = 0
	private requestsByPath: Map<string, number> = new Map()
	private lastRequestAt: number | null = null

	/**
	 * RPC method: Track a request
	 */
	trackRequest(path: string): { total: number; pathCount: number } {
		this.totalRequests++
		const pathCount = (this.requestsByPath.get(path) ?? 0) + 1
		this.requestsByPath.set(path, pathCount)
		this.lastRequestAt = Date.now()

		return { total: this.totalRequests, pathCount }
	}

	/**
	 * RPC method: Get total request count
	 */
	getTotalRequests(): number {
		return this.totalRequests
	}

	/**
	 * RPC method: Get request count for a specific path
	 */
	getPathRequests(path: string): number {
		return this.requestsByPath.get(path) ?? 0
	}

	/**
	 * RPC method: Get all path statistics
	 */
	getAllPathStats(): Record<string, number> {
		const result: Record<string, number> = {}
		for (const [path, count] of this.requestsByPath) {
			result[path] = count
		}
		return result
	}

	/**
	 * RPC method: Get last request timestamp
	 */
	getLastRequestAt(): number | null {
		return this.lastRequestAt
	}

	/**
	 * RPC method: Reset all tracking data
	 */
	resetAll(): void {
		this.totalRequests = 0
		this.requestsByPath.clear()
		this.lastRequestAt = null
	}
}
