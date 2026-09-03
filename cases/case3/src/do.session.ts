// =============================================================================
// Case 3: Session Store Durable Object (unique to case3)
// =============================================================================
// Stores user session data in a Durable Object.
// Different from do-service's Counter/RateLimiter — this is for session management.
// =============================================================================

import { DurableObject } from 'cloudflare:workers'

/**
 * Session value type — serializable primitives.
 * RPC requires Rpc.Serializable types (primitives, arrays, plain objects).
 */
export type SessionValue = string | number | boolean | null

/**
 * Session Store Durable Object
 * Provides session storage with get, set, and clear methods.
 * Data is stored in-memory (for testing) or persisted (in production).
 *
 * Note: Extends DurableObject from cloudflare:workers for Miniflare RPC compatibility.
 * Method names are prefixed to avoid conflicts with base class methods.
 */
export class SessionStore extends DurableObject<DevflareEnv> {
	private data: Map<string, SessionValue> = new Map()
	private createdAt: number = Date.now()

	/**
	 * RPC method: Get a value from the session
	 */
	getValue(key: string): SessionValue {
		return this.data.get(key) ?? null
	}

	/**
	 * RPC method: Set a value in the session
	 */
	setValue(key: string, value: SessionValue): void {
		this.data.set(key, value)
	}

	/**
	 * RPC method: Delete a value from the session
	 */
	deleteValue(key: string): boolean {
		return this.data.delete(key)
	}

	/**
	 * RPC method: Clear all session data
	 */
	clearAll(): void {
		this.data.clear()
	}

	/**
	 * RPC method: Get all keys in the session
	 */
	getAllKeys(): string[] {
		return [...this.data.keys()]
	}

	/**
	 * RPC method: Get session metadata
	 */
	getMetadata(): { itemCount: number; createdAt: number } {
		return {
			itemCount: this.data.size,
			createdAt: this.createdAt
		}
	}
}
