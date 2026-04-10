// =============================================================================
// Case 14: Hyperdrive — Tests
// =============================================================================
// Tests using devflare test utilities to verify Hyperdrive binding.
// Hyperdrive provides a connectionString for PostgreSQL access.
//
// Note: Miniflare's Hyperdrive stub provides `connectionString` as a property.
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext, env } from 'devflare/test'
import fetch from '../src/fetch'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

// -----------------------------------------------------------------------------
// Hyperdrive Binding Tests
// -----------------------------------------------------------------------------

describe('Hyperdrive Binding', () => {
	test('should have DB binding available', () => {
		expect(env.DB).toBeDefined()
	})

	test('should have connectionString property', () => {
		// Hyperdrive binding provides connectionString
		// Miniflare may provide it as a getter or property
		expect(env.DB.connectionString).toBeDefined()
	})
})

// -----------------------------------------------------------------------------
// Fetch Handler Tests
// -----------------------------------------------------------------------------

describe('Fetch Handler', () => {
	test('should return health status', async () => {
		const request = new Request('http://localhost/health')
		const response = await fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json() as { status: string; binding: string }
		expect(body.status).toBe('ok')
		expect(body.binding).toBe('hyperdrive')
	})

	test('should return 404 for unknown routes', async () => {
		const request = new Request('http://localhost/unknown')
		const response = await fetch(request)

		expect(response.status).toBe(404)
	})
})
