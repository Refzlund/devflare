// =============================================================================
// usage.recordUsage() retry-path tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import type { UsageRecord } from '../../../src/cloudflare/types'
import { type RecordUsageDeps, recordUsage } from '../../../src/cloudflare/usage'

interface KvState {
	value: string | null
	// Simulated concurrent writers: each element is invoked once, per write,
	// and may mutate `state.value` to model a clobbering concurrent update.
	concurrentWrites: Array<(state: KvState) => void>
	writes: string[]
}

function createDeps(state: KvState, overrides: Partial<RecordUsageDeps> = {}): RecordUsageDeps {
	return {
		getNamespaceId: async () => 'ns-1',
		kvGet: async () => state.value,
		kvPut: async (_accountId, _namespaceId, _key, value) => {
			state.value = value
			state.writes.push(value)
			const next = state.concurrentWrites.shift()
			if (next) next(state)
		},
		sleep: async () => {},
		maxAttempts: 5,
		...overrides
	}
}

describe('recordUsage', () => {
	test('retries when a concurrent writer clobbers the update and eventually succeeds', async () => {
		const state: KvState = {
			value: JSON.stringify({
				service: 'ai',
				date: '2026-04-17',
				count: 10,
				updatedAt: '2026-04-17T00:00:00.000Z'
			} satisfies UsageRecord),
			writes: [],
			concurrentWrites: [
				// After our first PUT, a concurrent writer clobbers the value
				// with a different count + updatedAt so our verify fails.
				(s) => {
					s.value = JSON.stringify({
						service: 'ai',
						date: '2026-04-17',
						count: 999,
						updatedAt: '1999-01-01T00:00:00.000Z'
					} satisfies UsageRecord)
				}
			]
		}

		let nowCalls = 0
		const deps = createDeps(state, {
			now: () => {
				nowCalls++
				return new Date(`2026-04-17T00:00:00.${String(nowCalls).padStart(3, '0')}Z`)
			}
		})

		const result = await recordUsage('account-1', 'ai', 1, deps)

		// First attempt reads count=10, writes 11, concurrent writer clobbers to 999.
		// Retry reads count=999, writes 1000, verify succeeds.
		expect(result.count).toBe(1000)
		expect(state.writes.length).toBe(2)
	})

	test('warns and returns last-written record when retry budget is exhausted', async () => {
		const state: KvState = {
			value: null,
			writes: [],
			// Every write is immediately clobbered.
			concurrentWrites: Array.from({ length: 10 }, () => (s: KvState) => {
				s.value = JSON.stringify({
					service: 'vectorize',
					date: '2026-04-17',
					count: 42,
					updatedAt: 'clobbered'
				} satisfies UsageRecord)
			})
		}

		const warnings: string[] = []
		const deps = createDeps(state, {
			maxAttempts: 3,
			warn: (message) => warnings.push(message)
		})

		const result = await recordUsage('account-1', 'vectorize', 5, deps)

		expect(state.writes.length).toBe(3)
		expect(warnings.length).toBe(1)
		expect(warnings[0]).toMatch(/best-effort/)
		expect(result.service).toBe('vectorize')
	})
})
