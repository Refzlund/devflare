import { test, expect, beforeAll, afterAll, describe } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import { DoubleableNumber } from '../src/DoubleableNumber'

// =============================================================================
// Durable Object Test with Transport Types
// =============================================================================
// NOTE: This test times out when running in parallel with other DO tests
// due to Miniflare port conflicts (all instances try to use port 9799).
// 
// This test is skipped in the full test suite to avoid hangs.
// Run standalone with: DEVFLARE_RUN_DO_TESTS=1 bun test cases/case19
//
// TODO: Fix simple-context.ts to use a random port for each Miniflare instance
// =============================================================================

// Skip unless explicitly enabled via DEVFLARE_RUN_DO_TESTS=1
const runDOTests = process.env.DEVFLARE_RUN_DO_TESTS === '1'

describe.skipIf(!runDOTests)('Counter DO', () => {
	beforeAll(async () => {
		await createTestContext()
	})

	afterAll(() => env.dispose())

	test('getValue returns DoubleableNumber', async () => {
		const counter = env.COUNTER.getByName('main')
		const result = await counter.getValue()
		expect(result.double).toBe(0)
		expect(result).toBeInstanceOf(DoubleableNumber)
	}, { timeout: 30000 })
})
