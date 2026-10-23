// =============================================================================
// Case 3: DO Service - Counter DO
// =============================================================================
// Counter Durable Object hosted in a separate worker.
// This demonstrates cross-worker DO access via service bindings.
// =============================================================================

import { DurableObject } from 'cloudflare:workers'

/**
 * Counter Durable Object
 * Provides increment, decrement, and getValue RPC methods.
 *
 * Extends DurableObject from cloudflare:workers for Miniflare RPC compatibility.
 */
export class Counter extends DurableObject<DevflareEnv> {
	private value = 0

	/**
	 * RPC method: Get current value
	 */
	getValue(): number {
		return this.value
	}

	/**
	 * RPC method: Increment and return new value
	 */
	async increment(amount = 1): Promise<number> {
		this.value += amount
		await this.ctx.storage.put('value', this.value)
		return this.value
	}

	/**
	 * RPC method: Decrement and return new value
	 */
	async decrement(amount = 1): Promise<number> {
		this.value -= amount
		await this.ctx.storage.put('value', this.value)
		return this.value
	}

	/**
	 * RPC method: Reset counter to zero
	 */
	async reset(): Promise<void> {
		this.value = 0
		await this.ctx.storage.delete('value')
	}
}
