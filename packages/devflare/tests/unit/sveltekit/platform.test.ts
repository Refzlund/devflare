import { describe, expect, test } from 'bun:test'
import type { DevRuntimeReading } from '../../../src/dev-server/runtime-status'
import {
	BridgeUnavailableError,
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

describe('connectBridgeWithRetry — a reload the coordinator owns vs a dev server that is gone', () => {
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

	/** A coordinator that reports each reading in turn, then repeats the last one forever. */
	function scriptedCoordinator(script: DevRuntimeReading[]) {
		let index = 0
		const asked: DevRuntimeReading[] = []
		return {
			read: async (): Promise<DevRuntimeReading> => {
				const reading = script[Math.min(index, script.length - 1)] as DevRuntimeReading
				index++
				asked.push(reading)
				return reading
			},
			asked
		}
	}

	/** Run a doomed connect and hand back the error it ended on. */
	async function captureFailure(
		connect: () => Promise<void>,
		options: Parameters<typeof connectBridgeWithRetry>[1]
	): Promise<BridgeUnavailableError> {
		try {
			await connectBridgeWithRetry(connect, options)
		} catch (error) {
			if (error instanceof BridgeUnavailableError) return error
			throw error
		}
		throw new Error('expected the connect to fail')
	}

	const alwaysRefused = (attempts: { count: number }) => async () => {
		attempts.count++
		throw new Error('WebSocket connection failed')
	}

	test('fails on the first refusal when nothing answers the status channel (devflare dev is not running)', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['unreachable'])
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			maxWaitMs: 3000,
			retryDelayMs: 150,
			readRuntimeState: coordinator.read,
			bridgeUrl: 'ws://localhost:8787',
			now: timer.now,
			sleep: timer.sleep
		})

		// The case the old flat budget punished hardest: 3s of pointless waiting per request.
		expect(attempts.count).toBe(1)
		expect(timer.waits).toEqual([])
		expect(error.reason).toBe('coordinator-unreachable')
		expect(error.message).toContain('is `devflare dev` still running?')
		// The transport failure is kept, both inline and as the cause.
		expect(error.message).toContain('WebSocket connection failed')
		expect(error.cause).toBeInstanceOf(Error)
	})

	test('fails at once when the coordinator gave up rebuilding its runtime', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['failed'])
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			readRuntimeState: coordinator.read,
			now: timer.now,
			sleep: timer.sleep
		})

		expect(attempts.count).toBe(1)
		expect(error.reason).toBe('runtime-failed')
	})

	test('fails at once while the coordinator is shutting down', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['stopping'])
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			readRuntimeState: coordinator.read,
			now: timer.now,
			sleep: timer.sleep
		})

		expect(attempts.count).toBe(1)
		expect(error.reason).toBe('coordinator-stopping')
	})

	test('rides a reload out well past the plain budget while the coordinator says it is coming back', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['reloading'])
		let attempts = 0

		await connectBridgeWithRetry(
			async () => {
				attempts++
				// 40 refusals = 6s, twice the plain budget and past the ~6s the watchdog needs to
				// declare a death at all — the window that used to reach the app as a lost binding.
				if (attempts <= 40) throw new Error('WebSocket connection failed')
			},
			{
				maxWaitMs: 3000,
				reloadMaxWaitMs: 30_000,
				retryDelayMs: 150,
				readRuntimeState: coordinator.read,
				now: timer.now,
				sleep: timer.sleep
			}
		)

		expect(attempts).toBe(41)
		expect(timer.now()).toBe(6000)
	})

	test('a `starting` coordinator is waited on the same way as a reloading one', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['starting'])
		let attempts = 0

		await connectBridgeWithRetry(
			async () => {
				attempts++
				if (attempts <= 30) throw new Error('WebSocket connection failed')
			},
			{
				maxWaitMs: 3000,
				reloadMaxWaitMs: 30_000,
				retryDelayMs: 150,
				readRuntimeState: coordinator.read,
				now: timer.now,
				sleep: timer.sleep
			}
		)

		expect(attempts).toBe(31)
	})

	test('holds the plain budget while the coordinator says the runtime is up', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['ready'])
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			maxWaitMs: 400,
			reloadMaxWaitMs: 30_000,
			retryDelayMs: 150,
			readRuntimeState: coordinator.read,
			now: timer.now,
			sleep: timer.sleep
		})

		// A runtime that IS up and still refuses is a real fault, not something to sit out.
		expect(attempts.count).toBe(3)
		expect(error.reason).toBe('connect-timeout')
	})

	test('stops riding the reload out the moment the coordinator reports the runtime back', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['reloading', 'reloading', 'ready'])
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			maxWaitMs: 400,
			reloadMaxWaitMs: 30_000,
			retryDelayMs: 150,
			readRuntimeState: coordinator.read,
			now: timer.now,
			sleep: timer.sleep
		})

		// Two rounds on the generous budget, then the third reading collapses it back to 400ms —
		// which t=300 has already spent. A coordinator stuck on `reloading` would still be going.
		expect(attempts.count).toBe(3)
		expect(coordinator.asked).toEqual(['reloading', 'reloading', 'ready'])
		expect(error.reason).toBe('connect-timeout')
	})

	test('names the reload when the generous budget itself runs out', async () => {
		const timer = fakeTimer()
		const coordinator = scriptedCoordinator(['reloading'])
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			maxWaitMs: 400,
			reloadMaxWaitMs: 900,
			retryDelayMs: 150,
			readRuntimeState: coordinator.read,
			now: timer.now,
			sleep: timer.sleep
		})

		expect(error.reason).toBe('reload-timeout')
		expect(error.message).toContain('still reloading')
	})

	test('keeps its old modest budget when no coordinator published a status channel', async () => {
		const timer = fakeTimer()
		const attempts = { count: 0 }

		const error = await captureFailure(alwaysRefused(attempts), {
			maxWaitMs: 400,
			retryDelayMs: 150,
			now: timer.now,
			sleep: timer.sleep
		})

		// The hand-started `vite dev` path: nothing to ask, so nothing changes.
		expect(attempts.count).toBe(3)
		expect(error.reason).toBe('connect-timeout')
	})
})
