// =============================================================================
// Case 11: Cross-Package DO - Session Store
// =============================================================================
// Shared Durable Object that can be referenced by other workers.
// Follows devflare patterns:
//   - Extends DurableObject from cloudflare:workers
//   - Uses RPC methods (not fetch) for direct method invocation
//   - File named do.*.ts for auto-discovery
// =============================================================================

import { DurableObject } from 'cloudflare:workers'

/**
 * JSON-serializable primitive types for RPC compatibility.
 */
export type JsonPrimitive = string | number | boolean | null

/**
 * JSON-serializable value (limited depth for RPC compatibility).
 * Deep nesting is not supported due to Rpc.Serializable constraints.
 * For simple key-value storage, see case3's flat SessionValue pattern.
 */
export type JsonValue = JsonPrimitive | JsonPrimitive[] | { [key: string]: JsonPrimitive }

/**
 * Session data structure.
 * Uses JsonValue for data to ensure RPC serialization compatibility.
 * Supports one level of nesting (e.g., `{ role: 'admin', tags: ['a', 'b'] }`).
 */
export interface SessionData {
	id: string
	data: { [key: string]: JsonValue }
	createdAt: number
	expiresAt?: number
}

/**
 * Shared Session Store Durable Object
 * Can be referenced by any worker via ref() pattern.
 *
 * Extends DurableObject from cloudflare:workers for Miniflare RPC compatibility.
 */
export class SessionStore extends DurableObject<DevflareEnv> {
	private sessions: Map<string, SessionData> = new Map()

	// -------------------------------------------------------------------------
	// RPC Methods — Direct method calls via env.SESSION_STORE.get(id).method()
	// -------------------------------------------------------------------------

	/**
	 * RPC method: Get session by ID
	 */
	async getSession(sessionId: string): Promise<SessionData | null> {
		// Try memory cache first
		let session = this.sessions.get(sessionId)

		// Fall back to storage
		if (!session) {
			session = await this.ctx.storage.get<SessionData>(`session:${sessionId}`)
			if (session) {
				this.sessions.set(sessionId, session)
			}
		}

		if (!session) {
			return null
		}

		// Check expiry
		if (session.expiresAt && session.expiresAt < Date.now()) {
			await this.deleteSession(sessionId)
			return null
		}

		return session
	}

	/**
	 * RPC method: Create or update session
	 */
	async setSession(sessionId: string, data: { [key: string]: JsonValue }, expiresAt?: number): Promise<SessionData> {
		const session: SessionData = {
			id: sessionId,
			data,
			createdAt: Date.now(),
			expiresAt: expiresAt ?? Date.now() + 24 * 60 * 60 * 1000 // 24h default
		}

		this.sessions.set(sessionId, session)
		await this.ctx.storage.put(`session:${sessionId}`, session)

		return session
	}

	/**
	 * RPC method: Delete session
	 */
	async deleteSession(sessionId: string): Promise<boolean> {
		const existed = this.sessions.has(sessionId) ||
			(await this.ctx.storage.get(`session:${sessionId}`)) !== undefined

		this.sessions.delete(sessionId)
		await this.ctx.storage.delete(`session:${sessionId}`)

		return existed
	}

	/**
	 * RPC method: Check if session exists and is valid
	 */
	async hasSession(sessionId: string): Promise<boolean> {
		const session = await this.getSession(sessionId)
		return session !== null
	}

	/**
	 * RPC method: Extend session expiry
	 */
	async extendSession(sessionId: string, additionalMs: number): Promise<SessionData | null> {
		const session = await this.getSession(sessionId)
		if (!session) return null

		session.expiresAt = (session.expiresAt ?? Date.now()) + additionalMs
		this.sessions.set(sessionId, session)
		await this.ctx.storage.put(`session:${sessionId}`, session)

		return session
	}
}
