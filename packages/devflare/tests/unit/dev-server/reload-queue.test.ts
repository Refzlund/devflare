// =============================================================================
// Reload Queue — single-flight + trailing-coalesce + error-isolation tests
// =============================================================================
// Pins the contract of `createReloadQueue()`: at most one reload runs at a
// time, requests made while a reload is in flight collapse into exactly one
// trailing reload, a throwing reload callback is logged (not rejected), and
// `drain()` settles only once nothing is running or pending.
// =============================================================================

import { describe, expect, mock, test } from 'bun:test'
import type { ConsolaInstance } from 'consola'
import { createReloadQueue } from '../../../src/dev-server/reload-queue'

/** Minimal Consola-shaped stub exposing only the `error` channel the queue uses. */
function createLoggerStub(): ConsolaInstance & { error: ReturnType<typeof mock> } {
	const error = mock((..._args: unknown[]) => {})
	return { error } as unknown as ConsolaInstance & { error: ReturnType<typeof mock> }
}

/** A deferred promise plus its resolver, for driving reload timing in tests. */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => {}
	const promise = new Promise<void>((res) => {
		resolve = res
	})
	return { promise, resolve }
}

describe('createReloadQueue', () => {
	test('runs a single scheduled reload exactly once', async () => {
		const reload = mock(async () => {})
		const queue = createReloadQueue({ reload })

		await queue.schedule()

		expect(reload).toHaveBeenCalledTimes(1)
	})

	test('coalesces requests made during an in-flight reload into one trailing reload', async () => {
		const gate = createDeferred()
		let calls = 0
		const reload = mock(async () => {
			calls++
			// Block the first reload until we have queued several more requests.
			if (calls === 1) {
				await gate.promise
			}
		})

		const queue = createReloadQueue({ reload })

		// Start the first (now-blocked) reload.
		const first = queue.schedule()
		// Three more requests arrive while the first is still running — they must
		// collapse into a single trailing reload, and share the same promise.
		const trailingA = queue.schedule()
		const trailingB = queue.schedule()
		const trailingC = queue.schedule()

		expect(trailingA).toBe(trailingB)
		expect(trailingB).toBe(trailingC)
		expect(reload).toHaveBeenCalledTimes(1)

		// Let the first reload finish; the single trailing reload then runs.
		gate.resolve()
		await Promise.all([first, trailingA, trailingB, trailingC])

		expect(reload).toHaveBeenCalledTimes(2)
	})

	test('starts a fresh reload for a request made after the queue is idle', async () => {
		const reload = mock(async () => {})
		const queue = createReloadQueue({ reload })

		await queue.schedule()
		await queue.schedule()

		expect(reload).toHaveBeenCalledTimes(2)
	})

	test('logs a throwing reload callback without rejecting schedule()', async () => {
		const logger = createLoggerStub()
		const reload = mock(async () => {
			throw new Error('boom')
		})
		const queue = createReloadQueue({ reload, logger })

		// Must resolve (not reject) even though the reload threw.
		await expect(queue.schedule()).resolves.toBeUndefined()
		expect(logger.error).toHaveBeenCalledTimes(1)
		const [message, error] = logger.error.mock.calls[0] as [string, unknown]
		expect(message).toContain('reload failed')
		expect(error).toBeInstanceOf(Error)
	})

	test('does not throw when no logger is supplied and the reload rejects', async () => {
		const reload = mock(async () => {
			throw new Error('boom')
		})
		const queue = createReloadQueue({ reload })

		await expect(queue.schedule()).resolves.toBeUndefined()
	})

	test('drain() resolves only after the running and trailing reloads complete', async () => {
		const gate = createDeferred()
		let calls = 0
		const reload = mock(async () => {
			calls++
			if (calls === 1) {
				await gate.promise
			}
		})
		const queue = createReloadQueue({ reload })

		queue.schedule()
		queue.schedule() // trailing

		let drained = false
		const draining = queue.drain().then(() => {
			drained = true
		})

		// Still blocked on the first reload — drain must not have settled.
		await Promise.resolve()
		expect(drained).toBe(false)

		gate.resolve()
		await draining

		expect(drained).toBe(true)
		expect(reload).toHaveBeenCalledTimes(2)
	})

	test('drain() resolves immediately when nothing is scheduled', async () => {
		const reload = mock(async () => {})
		const queue = createReloadQueue({ reload })

		await expect(queue.drain()).resolves.toBeUndefined()
		expect(reload).not.toHaveBeenCalled()
	})

	test('busy is true for exactly as long as a reload is running', async () => {
		const gate = createDeferred()
		let calls = 0
		const reload = mock(async () => {
			calls++
			if (calls === 1) {
				await gate.promise
			}
		})
		const queue = createReloadQueue({ reload })

		expect(queue.busy).toBe(false)

		// The runtime-status channel reads this to tell a waiting app the outage is owned by
		// something that will end it, rather than one nothing is going to fix.
		const first = queue.schedule()
		expect(queue.busy).toBe(true)

		const trailing = queue.schedule()
		expect(queue.busy).toBe(true)

		gate.resolve()
		await Promise.all([first, trailing])

		expect(queue.busy).toBe(false)
		expect(reload).toHaveBeenCalledTimes(2)
	})

	test('busy clears after a reload that threw', async () => {
		const logger = createLoggerStub()
		const reload = mock(async () => {
			throw new Error('boom')
		})
		const queue = createReloadQueue({ reload, logger })

		await queue.schedule()

		// A failed reload that left `busy` stuck would tell every later request to keep waiting
		// on a reload that already ended.
		expect(queue.busy).toBe(false)
	})
})
