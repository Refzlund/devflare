// =============================================================================
// Case 11: Cross-Package DO - Tests (Monorepo Pattern)
// =============================================================================
// Tests for the cross-package Durable Object pattern using real Miniflare.
// Uses createTestContext() which auto-detects cross-worker DO bindings.
//
// In a monorepo, import types from the package name, not relative paths:
//   import type { SessionData } from '@devflare/case11-do-shared'
// =============================================================================

import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import type { SessionData } from '@devflare/case11-do-shared'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(async () => {
	await createTestContext()
})

afterAll(async () => {
	await env.dispose()
})

// -----------------------------------------------------------------------------
// Session Store DO Tests via RPC
// -----------------------------------------------------------------------------

describe('Case 11: Cross-Package Durable Objects', () => {
	describe('SessionStore DO via RPC', () => {
		test('can get DO stub via SESSION_STORE binding', async () => {
			const id = env.SESSION_STORE.idFromName('test-session')
			const stub = env.SESSION_STORE.get(id)
			expect(stub).toBeDefined()
		})

		test('setSession creates new session', async () => {
			const id = env.SESSION_STORE.idFromName('user-create')
			const stub = env.SESSION_STORE.get(id)

			const session = await stub.setSession('user-create', { role: 'admin' })

			expect(session.id).toBe('user-create')
			expect(session.data).toEqual({ role: 'admin' })
			expect(session.createdAt).toBeTypeOf('number')
			expect(session.expiresAt).toBeGreaterThan(Date.now())
		})

		test('getSession retrieves existing session', async () => {
			const id = env.SESSION_STORE.idFromName('user-get')
			const stub = env.SESSION_STORE.get(id)

			// Create session first
			await stub.setSession('user-get', { foo: 'bar' })

			// Get session
			const session = await stub.getSession('user-get')

			expect(session).not.toBeNull()
			expect(session!.data).toEqual({ foo: 'bar' })
		})

		test('getSession returns null for missing session', async () => {
			const id = env.SESSION_STORE.idFromName('nonexistent')
			const stub = env.SESSION_STORE.get(id)

			const session = await stub.getSession('nonexistent')

			expect(session).toBeNull()
		})

		test('deleteSession removes session', async () => {
			const id = env.SESSION_STORE.idFromName('user-delete')
			const stub = env.SESSION_STORE.get(id)

			// Create session
			await stub.setSession('user-delete', { temp: true })

			// Delete it
			const deleted = await stub.deleteSession('user-delete')
			expect(deleted).toBe(true)

			// Verify deleted
			const session = await stub.getSession('user-delete')
			expect(session).toBeNull()
		})

		test('hasSession returns true for existing session', async () => {
			const id = env.SESSION_STORE.idFromName('user-has')
			const stub = env.SESSION_STORE.get(id)

			await stub.setSession('user-has', {})

			const exists = await stub.hasSession('user-has')
			expect(exists).toBe(true)
		})

		test('hasSession returns false for missing session', async () => {
			const id = env.SESSION_STORE.idFromName('user-missing')
			const stub = env.SESSION_STORE.get(id)

			const exists = await stub.hasSession('user-missing')
			expect(exists).toBe(false)
		})

		test('extendSession extends expiry time', async () => {
			const id = env.SESSION_STORE.idFromName('user-extend')
			const stub = env.SESSION_STORE.get(id)

			// Create session with short expiry
			const original = await stub.setSession('user-extend', {}, Date.now() + 1000)
			const originalExpiry = original.expiresAt!

			// Extend by 1 hour
			const extended = await stub.extendSession('user-extend', 60 * 60 * 1000)

			expect(extended).not.toBeNull()
			expect(extended!.expiresAt).toBeGreaterThan(originalExpiry)
		})

		test('getSession returns null for expired session', async () => {
			const id = env.SESSION_STORE.idFromName('user-expired')
			const stub = env.SESSION_STORE.get(id)

			// Create session that's already expired
			await stub.setSession('user-expired', {}, Date.now() - 1000)

			// Should return null (expired)
			const session = await stub.getSession('user-expired')
			expect(session).toBeNull()
		})
	})
})
