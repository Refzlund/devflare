import { describe, expect, test } from 'bun:test'
import {
	type Platform,
	connectBridgeWithRetry,
	drainWaitUntilErrors
} from '../../../src/sveltekit/platform'

function buildTestPlatform(): Platform {
	const pendingErrors: unknown[] = []
	const context = {
		waitUntil: (promise: Promise<unknown>) => {
			promise.catch((err) => {
				pendingErrors.push(err)
			})
		},
		passThroughOnException: () => {}
	} as ExecutionContext

	return {
		env: {},
		context,
		caches: {} as CacheStorage,
		cf: {},
		pendingErrors
	}
}

describe('sveltekit platform waitUntil error capture', () => {
	test('captures errors thrown inside ctx.waitUntil and returns them from drainWaitUntilErrors', async () => {
		const platform = buildTestPlatform()
		const boom = new Error('waitUntil failure')

		platform.context.waitUntil(Promise.reject(boom))

		// Allow the rejection handler to run
		await new Promise((resolve) => setTimeout(resolve, 0))

		const drained = drainWaitUntilErrors(platform)
		expect(drained).toEqual([boom])

		// Buffer is cleared after drain
		expect(drainWaitUntilErrors(platform)).toEqual([])
	})
})

describe('connectBridgeWithRetry — riding out a transient bridge outage', () => {
	/** A fake clock + sleep so the retry schedule is asserted deterministically, without real time. */
	function fakeTimer() {
		let clock = 0
		const waits: number[] = []
		return {
			now: () => clock,
			sleep: async (ms: number) => {
				waits.push(ms)
				clock += ms
			},
			waits
		}
	}

	test('a first-attempt success connects immediately and never sleeps', async () => {
		const timer = fakeTimer()
		let attempts = 0
		await connectBridgeWithRetry(
			async () => {
				attempts++
			},
			{ now: timer.now, sleep: timer.sleep }
		)
		expect(attempts).toBe(1)
		expect(timer.waits).toEqual([])
	})

	test('retries a failing connect until it succeeds (the HMR-reload window)', async () => {
		const timer = fakeTimer()
		let attempts = 0
		await connectBridgeWithRetry(
			async () => {
				attempts++
				if (attempts < 4) throw new Error('WebSocket connection failed')
			},
			{ maxWaitMs: 3000, retryDelayMs: 150, now: timer.now, sleep: timer.sleep }
		)
		expect(attempts).toBe(4)
		expect(timer.waits).toEqual([150, 150, 150]) // 3 waits between the 4 attempts
	})

	test('gives up with the last error once the wait budget is exhausted (bridge genuinely down)', async () => {
		const timer = fakeTimer()
		let attempts = 0
		await expect(
			connectBridgeWithRetry(
				async () => {
					attempts++
					throw new Error(`down #${attempts}`)
				},
				{ maxWaitMs: 400, retryDelayMs: 150, now: timer.now, sleep: timer.sleep }
			)
		).rejects.toThrow('down #3')
		// Attempts land at t=0,150,300; at t=300 another 150ms delay would reach 450 ≥ 400 → rethrow.
		expect(attempts).toBe(3)
	})
})
