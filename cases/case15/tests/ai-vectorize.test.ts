// =============================================================================
// Case 15: AI & Vectorize — Tests
// =============================================================================
// These tests require remote mode because AI and Vectorize
// CANNOT be emulated locally — they need real Cloudflare infrastructure.
//
// To enable remote mode for 30 minutes:
//   devflare remote enable
//
// Then run:
//   bun test cases/case15
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'
import {
	generateEmbedding,
	generateText,
	searchSimilar,
	insertVector
} from '../src/fetch'
import fetchHandler from '../src/fetch'

// -----------------------------------------------------------------------------
// Test Setup — Standard devflare pattern
// -----------------------------------------------------------------------------

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

// Skip conditions resolved in parallel at module load
const [skipAI, skipVectorize] = await Promise.all([
	shouldSkip.ai,
	shouldSkip.vectorize
])

// -----------------------------------------------------------------------------
// Models — Using cheapest options for testing
// -----------------------------------------------------------------------------

// Cheapest embedding model for testing
const CHEAP_EMBEDDING = '@cf/baai/bge-small-en-v1.5'
const VECTOR_DIMS = 384

// Cheapest LLM for testing
const CHEAP_LLM = '@cf/meta/llama-3.2-1b-instruct'

// -----------------------------------------------------------------------------
// AI Tests — Require Remote
// -----------------------------------------------------------------------------

describe.skipIf(skipAI)('AI Integration', () => {
	test('generateEmbedding returns vector', async () => {
		const embedding = await generateEmbedding(env.AI, 'Hello world', CHEAP_EMBEDDING)

		expect(Array.isArray(embedding)).toBe(true)
		expect(embedding.length).toBe(VECTOR_DIMS)
		expect(typeof embedding[0]).toBe('number')
	})

	test('generateText returns string', async () => {
		const response = await generateText(env.AI, 'Say hello', CHEAP_LLM, { maxTokens: 10 })

		expect(typeof response).toBe('string')
		expect(response.length).toBeGreaterThan(0)
	})
})

// -----------------------------------------------------------------------------
// Vectorize Tests — Require Remote + Index Setup
// -----------------------------------------------------------------------------
// NOTE: These tests require a Vectorize index named "embeddings-index" to exist.
// Create it with: wrangler vectorize create embeddings-index --dimensions=384 --metric=cosine
// -----------------------------------------------------------------------------

describe.skipIf(skipVectorize)('Vectorize Integration', () => {
	test('insertVector and searchSimilar work', async () => {
		const testId = `test-${Date.now()}`
		const testVector = Array(VECTOR_DIMS).fill(0.5)

		try {
			// Insert
			await insertVector(env.VECTORIZE, testId, testVector, { text: 'Test doc' })

			// Search
			const matches = await searchSimilar(env.VECTORIZE, testVector, 5)

			expect(Array.isArray(matches)).toBe(true)
			expect(matches.length).toBeGreaterThan(0)
			expect(matches[0]).toHaveProperty('id')
			expect(matches[0]).toHaveProperty('score')
		} catch (error) {
			// If the index doesn't exist, skip with a helpful message
			if (error instanceof Error && error.message.includes('index was not found')) {
				console.log('⏭️  Vectorize test skipped: Index "embeddings-index" not found.')
				console.log('   Create it with: wrangler vectorize create embeddings-index --dimensions=384 --metric=cosine')
				return
			}
			throw error
		}
	})
})

// -----------------------------------------------------------------------------
// Module Smoke Test — Always Runs
// -----------------------------------------------------------------------------

describe('Module Smoke Test', () => {
	test('fetch handler exports are valid', () => {
		expect(typeof fetchHandler).toBe('function')
	})

	test('utility functions are exported', () => {
		expect(typeof generateEmbedding).toBe('function')
		expect(typeof generateText).toBe('function')
		expect(typeof searchSimilar).toBe('function')
		expect(typeof insertVector).toBe('function')
	})
})


