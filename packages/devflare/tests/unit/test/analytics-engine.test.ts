import { describe, expect, test } from 'bun:test'
import { createMockAnalyticsEngine, createMockEnv } from '../../../src/test'

describe('createMockAnalyticsEngine', () => {
	test('records data points passed to writeDataPoint', () => {
		const dataset = createMockAnalyticsEngine()

		dataset.writeDataPoint({ indexes: ['user-1'], doubles: [1], blobs: ['signup'] })
		dataset.writeDataPoint({ blobs: ['login'] })

		expect(dataset.writtenDataPoints).toEqual([
			{ indexes: ['user-1'], doubles: [1], blobs: ['signup'] },
			{ blobs: ['login'] }
		])
		// `points` is an alias of `writtenDataPoints`.
		expect(dataset.points).toBe(dataset.writtenDataPoints)
	})

	test('records an empty object when writeDataPoint is called with no event', () => {
		const dataset = createMockAnalyticsEngine()
		dataset.writeDataPoint()
		expect(dataset.writtenDataPoints).toEqual([{}])
	})

	test('snapshots the event so later caller mutation does not rewrite history', () => {
		const dataset = createMockAnalyticsEngine()
		const event = { blobs: ['a'] }
		dataset.writeDataPoint(event)
		event.blobs.push('mutated')
		expect(dataset.writtenDataPoints).toEqual([{ blobs: ['a'] }])
	})

	test('clear() empties the recorded data points', () => {
		const dataset = createMockAnalyticsEngine()
		dataset.writeDataPoint({ blobs: ['x'] })
		dataset.clear()
		expect(dataset.writtenDataPoints).toEqual([])
	})

	test('createMockEnv wires analyticsEngine bindings', () => {
		const env = createMockEnv({ analyticsEngine: ['EVENTS'] }) as {
			EVENTS: ReturnType<typeof createMockAnalyticsEngine>
		}
		env.EVENTS.writeDataPoint({ blobs: ['hit'] })
		expect(env.EVENTS.writtenDataPoints).toEqual([{ blobs: ['hit'] }])
	})
})
