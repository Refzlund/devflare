// =============================================================================
// Runtime watchdog — turning failed probes into one rebuild signal
// =============================================================================
// The runtime is a workerd child that can die without the dev server touching
// it. Nothing used to watch for that, so the coordinator and Vite kept serving
// against a runtime that was gone. These tests pin the schedule: a brief gap is
// tolerated, a real death is reported exactly once, and a runtime that will not
// come back stops being retried.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	createRuntimeWatchdog,
	dialableHost,
	probeTcpReachable
} from '../../../src/dev-server/runtime-health'

/**
 * Drive the watchdog by hand: every scheduled probe becomes a queued callback the test releases,
 * so the schedule is asserted without real time.
 */
function manualClock() {
	const queue: (() => void)[] = []
	return {
		setTimer: (fn: () => void) => {
			queue.push(fn)
			return queue.length
		},
		clearTimer: () => {
			queue.length = 0
		},
		/** Run the next scheduled probe and let its async work settle. */
		async advance(times = 1) {
			for (let i = 0; i < times; i++) {
				const next = queue.shift()
				if (!next) return
				next()
				// Two turns: one for the probe, one for anything it triggers.
				await Promise.resolve()
				await Promise.resolve()
				await new Promise((resolve) => setTimeout(resolve, 0))
			}
		},
		get pending() {
			return queue.length
		}
	}
}

describe('createRuntimeWatchdog', () => {
	test('a healthy runtime is never reported lost', async () => {
		const clock = manualClock()
		let lost = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => true,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 3,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(6)

		expect(lost).toBe(0)
		watchdog.stop()
	})

	test('a gap shorter than the threshold is tolerated', async () => {
		const clock = manualClock()
		let lost = 0
		const results = [true, false, false, true, true]
		let index = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => results[index++] ?? true,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 3,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(results.length)

		// Two consecutive misses is what a legitimate reload looks like — not a death.
		expect(lost).toBe(0)
		watchdog.stop()
	})

	test('a sustained outage rebuilds once per threshold run, not once per probe', async () => {
		const clock = manualClock()
		let lost = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => false,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 3,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(10)

		// Probes 1-3, 4-6 and 7-9 each earn one rebuild; probe 10 starts a fresh run.
		expect(lost).toBe(3)
		// Still watching. Firing on every failed probe instead would have burned the whole budget by
		// probe 6 and stood the watchdog down, leaving nothing scheduled.
		expect(clock.pending).toBeGreaterThan(0)
		watchdog.stop()
	})

	test('each recovered outage gets a fresh rebuild budget', async () => {
		const clock = manualClock()
		let lost = 0
		// Four full outages, each ending in a recovery — one more than the attempt limit.
		const results = [
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			true
		]
		let index = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => results[index++] ?? true,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 3,
			recoveryAttemptLimit: 3,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(results.length)

		// The limit counts attempts since the runtime was last seen ALIVE. Without that reset the
		// fourth outage would fall outside the budget and go unrebuilt.
		expect(lost).toBe(4)
		watchdog.stop()
	})

	test('a recovered runtime can be reported lost again later', async () => {
		const clock = manualClock()
		let lost = 0
		// down, down, down -> rebuilt -> down, down, down again
		const results = [false, false, false, true, false, false, false]
		let index = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => results[index++] ?? true,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 3,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(results.length)

		expect(lost).toBe(2)
		watchdog.stop()
	})

	test('a runtime that never comes back stops being rebuilt', async () => {
		const clock = manualClock()
		let lost = 0

		createRuntimeWatchdog({
			probe: async () => false,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 1,
			recoveryAttemptLimit: 2,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(20)

		expect(lost).toBe(2)
		// Standing down means no probe is left scheduled.
		expect(clock.pending).toBe(0)
	})

	test('gaveUp separates standing down from being shut down', async () => {
		const clock = manualClock()

		const healthy = createRuntimeWatchdog({
			probe: async () => true,
			onRuntimeLost: async () => {},
			failureThreshold: 1,
			recoveryAttemptLimit: 2,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(3)
		expect(healthy.gaveUp).toBe(false)

		// The server's own teardown is not a give-up: it says nothing about the runtime.
		healthy.stop()
		expect(healthy.gaveUp).toBe(false)

		const doomed = createRuntimeWatchdog({
			probe: async () => false,
			onRuntimeLost: async () => {},
			failureThreshold: 1,
			recoveryAttemptLimit: 2,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(20)

		// This is what the runtime-status channel turns into `failed`, so a waiting request
		// stops waiting for a rebuild that is never coming.
		expect(doomed.gaveUp).toBe(true)
	})

	test('a rebuild that throws does not kill the watch', async () => {
		const clock = manualClock()
		let attempts = 0
		const results = [false, true, false]
		let index = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => results[index++] ?? true,
			onRuntimeLost: async () => {
				attempts++
				throw new Error('rebuild failed')
			},
			failureThreshold: 1,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		await clock.advance(results.length)

		expect(attempts).toBe(2)
		watchdog.stop()
	})

	test('stopping while a probe is in flight does not rebuild on its result', async () => {
		const clock = manualClock()
		let lost = 0
		let releaseProbe: ((reachable: boolean) => void) | null = null

		const watchdog = createRuntimeWatchdog({
			probe: () =>
				new Promise<boolean>((resolve) => {
					releaseProbe = resolve
				}),
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 1,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		const inFlight = clock.advance(1)
		await Promise.resolve()

		// The server shuts down while the probe is still outstanding; its verdict arrives afterwards.
		watchdog.stop()
		releaseProbe?.(false)
		await inFlight

		// A shutdown is not a runtime death — rebuilding here would resurrect what is being torn down.
		expect(lost).toBe(0)
		expect(clock.pending).toBe(0)
	})

	test('stop() is idempotent and cancels the pending probe', async () => {
		const clock = manualClock()
		let lost = 0

		const watchdog = createRuntimeWatchdog({
			probe: async () => false,
			onRuntimeLost: async () => {
				lost++
			},
			failureThreshold: 1,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer
		})

		watchdog.stop()
		watchdog.stop()

		// Asserted BEFORE advancing: advancing shifts the callback off the queue either way, so a
		// `stop()` that forgot to cancel the timer would still look empty afterwards.
		expect(clock.pending).toBe(0)

		await clock.advance(5)
		expect(lost).toBe(0)
	})
})

describe('dialableHost', () => {
	test('maps each wildcard bind to the loopback of its OWN family', () => {
		expect(dialableHost('0.0.0.0')).toBe('127.0.0.1')
		// Not 127.0.0.1: an IPv6 wildcard bind is not reachable over IPv4, so probing there would
		// report a perfectly healthy runtime as dead and have the watchdog rebuild it on a loop.
		expect(dialableHost('::')).toBe('::1')
	})

	test('leaves an explicit host alone', () => {
		expect(dialableHost('127.0.0.1')).toBe('127.0.0.1')
		expect(dialableHost('::1')).toBe('::1')
		expect(dialableHost('localhost')).toBe('localhost')
	})

	test('a host that never answers fails the probe within its timeout', async () => {
		// TEST-NET-1 (RFC 5737) is not routable, so the connect hangs rather than being refused —
		// the case the probe's own timeout exists for. Without it `probe()` never settles, the tick
		// never finishes, and the watch silently ends with nothing logged.
		const started = Date.now()
		expect(await probeTcpReachable({ host: '192.0.2.1', port: 9, timeoutMs: 100 })).toBe(false)
		expect(Date.now() - started).toBeLessThan(3000)
	})

	test('a wildcard-bound listener answers on the host it maps to', async () => {
		const server = Bun.serve({ hostname: '0.0.0.0', port: 0, fetch: () => new Response('ok') })
		try {
			expect(await probeTcpReachable({ host: dialableHost('0.0.0.0'), port: server.port })).toBe(
				true
			)
		} finally {
			server.stop(true)
		}
	})
})

describe('probeTcpReachable', () => {
	test('reports a listening port as reachable and a closed one as not', async () => {
		const server = Bun.serve({ port: 0, fetch: () => new Response('ok') })
		try {
			expect(await probeTcpReachable({ host: '127.0.0.1', port: server.port })).toBe(true)
		} finally {
			server.stop(true)
		}

		// The same port, now that nothing is listening on it.
		expect(await probeTcpReachable({ host: '127.0.0.1', port: server.port, timeoutMs: 500 })).toBe(
			false
		)
	})
})
