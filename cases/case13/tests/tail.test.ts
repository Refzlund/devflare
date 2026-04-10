// =============================================================================
// Case 13: Tail Workers — Tests
// =============================================================================
// Tests the tail handler through cf.tail.trigger() while still using
// REAL Miniflare KV bindings via createTestContext.
// No mocks - these tests use actual KV operations.
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext, cf, env } from 'devflare/test'
import type { TraceItem } from '@cloudflare/workers-types'
import type { LogEntry } from '../src/tail'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

// -----------------------------------------------------------------------------
// Test Data Helpers
// -----------------------------------------------------------------------------

function createTraceItem(overrides: Partial<TraceItem> = {}): TraceItem {
	return {
		scriptName: 'test-worker',
		outcome: 'ok',
		eventTimestamp: Date.now(),
		event: {
			request: {
				url: 'https://example.com/api/test',
				method: 'GET'
			}
		},
		logs: [
			{
				level: 'log',
				message: ['Test log message'],
				timestamp: Date.now()
			}
		],
		exceptions: [],
		diagnosticsChannelEvents: [],
		scriptVersion: { id: 'test-version' },
		dispatchNamespace: undefined,
		scriptTags: [],
		...overrides
	} as TraceItem
}

// -----------------------------------------------------------------------------
// Tail Handler Tests
// -----------------------------------------------------------------------------

describe('Tail Handler with Real KV', () => {
	test('processes trace items and stores in KV', async () => {
		const event = createTraceItem({
			scriptName: 'store-test',
			eventTimestamp: 1000001
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)
		expect(result.itemCount).toBe(1)

		// Verify log was stored in real KV
		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)

		expect(stored).not.toBeNull()

		const entry: LogEntry = JSON.parse(stored!)
		expect(entry.scriptName).toBe('store-test')
		expect(entry.outcome).toBe('ok')
		expect(entry.logs).toHaveLength(1)
		expect(entry.logs[0].message).toEqual(['Test log message'])
	})

	test('extracts request info from trace item', async () => {
		const event = createTraceItem({
			scriptName: 'request-test',
			eventTimestamp: 1000002,
			event: {
				request: {
					url: 'https://api.example.com/users',
					method: 'POST'
				}
			}
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)
		const entry: LogEntry = JSON.parse(stored!)

		expect(entry.request).toBeDefined()
		expect(entry.request?.url).toBe('https://api.example.com/users')
		expect(entry.request?.method).toBe('POST')
	})

	test('processes exceptions', async () => {
		const event = createTraceItem({
			scriptName: 'exception-test',
			eventTimestamp: 1000003,
			outcome: 'exception',
			logs: [],
			exceptions: [
				{
					name: 'Error',
					message: 'Something went wrong',
					timestamp: Date.now()
				}
			]
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)
		const entry: LogEntry = JSON.parse(stored!)

		expect(entry.outcome).toBe('exception')
		expect(entry.exceptions).toHaveLength(1)
		expect(entry.exceptions[0].name).toBe('Error')
		expect(entry.exceptions[0].message).toBe('Something went wrong')
	})

	test('processes multiple trace items', async () => {
		const events = [
			createTraceItem({ scriptName: 'worker-a', eventTimestamp: 2000001 }),
			createTraceItem({ scriptName: 'worker-b', eventTimestamp: 2000002 }),
			createTraceItem({ scriptName: 'worker-c', eventTimestamp: 2000003 })
		]

		const result = await cf.tail.trigger(events)
		expect(result.success).toBe(true)
		expect(result.itemCount).toBe(3)

		// Verify all were stored
		for (const event of events) {
			const key = `tail:${event.scriptName}-${event.eventTimestamp}`
			const stored = await env.LOG_STORE.get(key)
			expect(stored).not.toBeNull()
		}
	})
})

// -----------------------------------------------------------------------------
// Log Level Filtering Tests (Pure Logic)
// -----------------------------------------------------------------------------

describe('Log Level Filtering (Pure Logic)', () => {
	// Test the filtering logic directly without needing different env configurations
	// The filterByLevel function is internal, so we test through processable scenarios

	test('default min level (log) filters debug messages', async () => {
		const timestamp = Date.now() + 3000000
		const event = createTraceItem({
			scriptName: 'level-filter-test',
			eventTimestamp: timestamp,
			logs: [
				{ level: 'debug', message: ['Debug message'], timestamp: Date.now() },
				{ level: 'log', message: ['Log message'], timestamp: Date.now() },
				{ level: 'warn', message: ['Warn message'], timestamp: Date.now() },
				{ level: 'error', message: ['Error message'], timestamp: Date.now() }
			]
		})

		// env has default MIN_LOG_LEVEL = 'log' from config
		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)
		const entry: LogEntry = JSON.parse(stored!)

		// Should have log, warn, error but NOT debug
		expect(entry.logs).toHaveLength(3)
		expect(entry.logs.map((l) => l.level)).toEqual(['log', 'warn', 'error'])
	})

	test('stores entries with only exceptions (no logs)', async () => {
		const timestamp = Date.now() + 3000001
		const event = createTraceItem({
			scriptName: 'exception-only-test',
			eventTimestamp: timestamp,
			logs: [],
			exceptions: [
				{ name: 'Error', message: 'Something failed', timestamp: Date.now() }
			]
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)
		const entry: LogEntry = JSON.parse(stored!)

		expect(entry.logs).toHaveLength(0)
		expect(entry.exceptions).toHaveLength(1)
	})

	test('skips entries with no logs after filtering', async () => {
		const timestamp = Date.now() + 3000002
		// Create event with only debug logs (will be filtered by default 'log' level)
		const event = createTraceItem({
			scriptName: 'skip-empty-test',
			eventTimestamp: timestamp,
			logs: [
				{ level: 'debug', message: ['Only debug'], timestamp: Date.now() }
			],
			exceptions: []
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)

		// Should not be stored since no logs pass the filter and no exceptions
		expect(stored).toBeNull()
	})
})

// -----------------------------------------------------------------------------
// Edge Cases
// -----------------------------------------------------------------------------

describe('Edge Cases with Real KV', () => {
	test('handles empty events array', async () => {
		const result = await cf.tail.trigger([])
		expect(result.success).toBe(true)
		expect(result.itemCount).toBe(0)
	})

	test('handles trace item with no logs or exceptions', async () => {
		const timestamp = Date.now() + 200000
		const event = createTraceItem({
			scriptName: 'no-logs-test',
			eventTimestamp: timestamp,
			logs: [],
			exceptions: []
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)

		// Should not be stored
		expect(stored).toBeNull()
	})

	test('handles trace item without event property', async () => {
		const timestamp = Date.now() + 300000
		const event = createTraceItem({
			scriptName: 'no-event-test',
			eventTimestamp: timestamp,
			event: undefined as unknown as TraceItem['event'],
			exceptions: [
				{ name: 'Error', message: 'Test', timestamp: Date.now() }
			]
		})

		const result = await cf.tail.trigger([event])
		expect(result.success).toBe(true)

		const key = `tail:${event.scriptName}-${event.eventTimestamp}`
		const stored = await env.LOG_STORE.get(key)
		const entry: LogEntry = JSON.parse(stored!)

		expect(entry.request).toBeUndefined()
		expect(entry.exceptions).toHaveLength(1)
	})
})
