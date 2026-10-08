import { describe, expect, test } from 'bun:test'
import {
	type BrowserSessionRegistry,
	createSessionRegistry,
	type LaunchedBrowser,
	type SessionBrowser,
	SessionLimitError
} from '../../../src/browser-shim/sessions'

// The shim server cannot start without downloading Chrome, so until the
// lifecycle moved into its own module none of this was reachable from a unit
// test — and a reaper that killed every live session survived in the tree for
// as long as that was true. These drive the registry with stub browsers and
// keep_alive budgets measured in milliseconds.

/** A stub standing in for puppeteer's `Browser`, recording what was done to it. */
interface FakeBrowser extends SessionBrowser {
	closeCount: number
	/** Fire `disconnected`, as Chrome crashing or being killed would. */
	emitDisconnected(): void
	/** Make the next close() reject, as a wedged Chrome would. */
	failNextClose(message: string): void
}

/**
 * → KEY: `close()` fires `disconnected`, because a real one does — Chrome
 *   exiting is what puppeteer's Browser reports. A stub that closes silently
 *   makes the registry's own re-entrancy untestable: closing a session closes
 *   the browser, which lands back in close(), and only a stub that reproduces
 *   that can tell whether the second pass is a no-op. It disconnects at most
 *   once, like the real thing, so a registry that does recurse terminates and
 *   is caught by its doubled close count rather than hanging the run.
 */
function createFakeBrowser(): FakeBrowser {
	const handlers: (() => void)[] = []
	let closeError: string | null = null
	let disconnected = false

	const browser: FakeBrowser = {
		closeCount: 0,
		async close() {
			browser.closeCount += 1
			if (closeError) {
				const message = closeError
				closeError = null
				throw new Error(message)
			}

			browser.emitDisconnected()
		},
		on(_event, handler) {
			handlers.push(handler)
			return browser
		},
		emitDisconnected() {
			if (disconnected) return
			disconnected = true
			for (const handler of [...handlers]) handler()
		},
		failNextClose(message) {
			closeError = message
		}
	}

	return browser
}

interface Harness {
	registry: BrowserSessionRegistry
	/** Every browser handed out, in launch order. */
	browsers: FakeBrowser[]
	/** How many times the launcher ran. */
	launches: number
}

function createHarness(
	options: { keepAlive?: number; maxConcurrentSessions?: number; launchDelayMs?: number } = {}
): Harness {
	const browsers: FakeBrowser[] = []
	const harness = {
		browsers,
		launches: 0
	} as Harness

	harness.registry = createSessionRegistry({
		keepAlive: options.keepAlive,
		maxConcurrentSessions: options.maxConcurrentSessions,
		async launch(): Promise<LaunchedBrowser> {
			harness.launches += 1
			if (options.launchDelayMs) {
				await sleep(options.launchDelayMs)
			}

			const browser = createFakeBrowser()
			browsers.push(browser)
			return { browser, wsEndpoint: `ws://127.0.0.1:9222/devtools/browser/${browsers.length}` }
		}
	})

	return harness
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('browser shim session reaping', () => {
	// The defect this file exists for. The live dev path never opens a socket
	// the shim can see: the binding worker connects straight to Chrome and
	// reports the connection over HTTP instead. Every session was therefore
	// still "unconnected" when its keep_alive elapsed, and the shim killed
	// Chrome underneath a client mid-render, 60 seconds after acquire.
	//
	// → MUTANT: drop `clearIdleTimer(session)` from `attach()` in
	//   src/browser-shim/sessions.ts. That is the pre-fix behaviour exactly —
	//   nothing on the live path cancelled the reaper — and this test fails.
	test('a session with a client attached is not reaped when keep_alive elapses', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 25 })
		const { sessionId } = await registry.acquire()

		expect(registry.attach(sessionId)).toBeDefined()
		await sleep(80)

		expect(registry.get(sessionId)).toBeDefined()
		expect(browsers[0].closeCount).toBe(0)
		expect(registry.history()).toEqual([])
	})

	// The other half: reaping must still happen, or the fix trades a guillotine
	// for a Chrome process per abandoned session.
	//
	// → MUTANT: drop `armIdleTimer(session)` from `release()`. A released
	//   session then lives until Chrome exits on its own, and this test fails.
	test('a released session is reaped once keep_alive elapses', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 25 })
		const { sessionId } = await registry.acquire()

		registry.attach(sessionId)
		expect(registry.release(sessionId)).toBe(true)
		await sleep(80)

		expect(registry.get(sessionId)).toBeUndefined()
		expect(browsers[0].closeCount).toBe(1)
		expect(registry.history()[0]).toMatchObject({ sessionId, closeReasonText: 'BrowserIdle' })
	})

	test('a session nobody ever connects to is reaped', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 25 })
		const { sessionId } = await registry.acquire()

		await sleep(80)

		expect(registry.get(sessionId)).toBeUndefined()
		expect(browsers[0].closeCount).toBe(1)
	})

	test("a client's own keep_alive overrides the shim default", async () => {
		const { registry } = createHarness({ keepAlive: 10000 })
		const { sessionId } = await registry.acquire({ keep_alive: 25 })

		await sleep(80)

		expect(registry.get(sessionId)).toBeUndefined()
	})

	test('keep_alive 0 disables reaping entirely', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 0 })
		const { sessionId } = await registry.acquire()

		await sleep(60)

		expect(registry.get(sessionId)).toBeDefined()
		expect(browsers[0].closeCount).toBe(0)
	})

	test('re-attaching after a release cancels the countdown again', async () => {
		const { registry } = createHarness({ keepAlive: 40 })
		const { sessionId } = await registry.acquire()

		registry.attach(sessionId)
		registry.release(sessionId)
		await sleep(20)
		registry.attach(sessionId)
		await sleep(60)

		expect(registry.get(sessionId)).toBeDefined()
	})

	// A relay closes both of its ends, so the worker can report twice. The
	// second report must not detach a client that has since connected.
	test('a release naming a superseded connection is ignored', async () => {
		const { registry } = createHarness({ keepAlive: 10000 })
		const { sessionId } = await registry.acquire()

		const first = registry.attach(sessionId)
		const second = registry.attach(sessionId)

		expect(registry.release(sessionId, first?.connectionId)).toBe(false)
		expect(registry.get(sessionId)?.connectionId).toBe(second?.connectionId)
		expect(registry.release(sessionId, second?.connectionId)).toBe(true)
	})

	test('releasing a session nothing is attached to reports false', async () => {
		const { registry } = createHarness({ keepAlive: 10000 })
		const { sessionId } = await registry.acquire()

		expect(registry.release(sessionId)).toBe(false)
		expect(registry.release('no-such-session')).toBe(false)
	})

	test('attaching to a session that does not exist answers undefined', () => {
		const { registry } = createHarness()

		expect(registry.attach('no-such-session')).toBeUndefined()
	})
})

describe('browser shim session closing', () => {
	// Chrome exiting is the shim's one free disconnect signal on the live path:
	// `browser.close()` from the client reaches Chrome directly, so this is how
	// the session stops being tracked at all.
	//
	// → MUTANT: delete the `browser.on('disconnected', …)` subscription in
	//   `acquire()`. The session then outlives its browser and this test fails.
	test('a session whose Chrome exits is closed even while attached', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 10000 })
		const { sessionId } = await registry.acquire()
		registry.attach(sessionId)

		browsers[0].emitDisconnected()
		await sleep(10)

		expect(registry.get(sessionId)).toBeUndefined()
		expect(registry.history()[0]).toMatchObject({
			sessionId,
			closeReasonText: 'ChromeDisconnected'
		})
	})

	// close() closes the browser, which fires `disconnected`, which lands back
	// in close(). Without the map delete happening first that recurses into a
	// second browser close and a duplicate history entry.
	//
	// → MUTANT: move `sessions.delete(sessionId)` in `close()` below the
	//   `await session.browser.close()`, as it used to be. closeCount becomes 2
	//   and history holds the session twice.
	test('closing is idempotent under the disconnect it causes', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 10000 })
		const { sessionId } = await registry.acquire()

		await registry.close(sessionId)
		await sleep(10)

		expect(browsers[0].closeCount).toBe(1)
		expect(registry.history().filter((entry) => entry.sessionId === sessionId)).toHaveLength(1)
	})

	test('closing an unknown session is a no-op', async () => {
		const { registry } = createHarness()

		await registry.close('no-such-session')

		expect(registry.history()).toEqual([])
	})

	// A Chrome that will not close is a process the developer may have to reap
	// by hand — it must not pass silently, and it must not abort the sweep.
	test('a browser that refuses to close still leaves the registry consistent', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 10000 })
		const first = await registry.acquire()
		const second = await registry.acquire()

		browsers[0].failNextClose('chrome is wedged')
		await registry.closeAll()

		expect(registry.size).toBe(0)
		expect(registry.get(first.sessionId)).toBeUndefined()
		expect(registry.get(second.sessionId)).toBeUndefined()
		expect(browsers[1].closeCount).toBe(1)
	})

	test('closeAll records why every session ended', async () => {
		const { registry } = createHarness({ keepAlive: 10000 })
		await registry.acquire()
		await registry.acquire()

		await registry.closeAll()

		expect(registry.history()).toHaveLength(2)
		expect(registry.history().map((entry) => entry.closeReasonText)).toEqual([
			'ServerShutdown',
			'ServerShutdown'
		])
	})

	test('a reaped session cancels its own timer rather than firing twice', async () => {
		const { registry, browsers } = createHarness({ keepAlive: 20 })
		const { sessionId } = await registry.acquire()

		await registry.close(sessionId)
		await sleep(60)

		expect(browsers[0].closeCount).toBe(1)
		expect(registry.historySize).toBe(1)
	})
})

describe('browser shim session limits', () => {
	// /v1/limits has always advertised 10 concurrent sessions as a literal the
	// shim did not enforce, so an app in a launch loop spawned Chrome processes
	// without bound while being told the ceiling was ten.
	//
	// → MUTANT: delete the `SessionLimitError` throw at the top of `acquire()`.
	//   An eleventh session launches and this test fails.
	test('acquiring past the ceiling is refused rather than launching', async () => {
		const harness = createHarness({ keepAlive: 10000, maxConcurrentSessions: 2 })

		await harness.registry.acquire()
		await harness.registry.acquire()

		await expect(harness.registry.acquire()).rejects.toBeInstanceOf(SessionLimitError)
		expect(harness.launches).toBe(2)
		expect(harness.registry.size).toBe(2)
	})

	// The check reads a map that only grows once launch() has resolved, so
	// without a reservation N simultaneous acquires all pass a check only one
	// of them should.
	//
	// → MUTANT: remove `pendingLaunches` from the ceiling test in `acquire()`.
	//   All six launch, and this test fails at 6 browsers for a limit of 2.
	test('concurrent acquires cannot exceed the ceiling between check and insert', async () => {
		const harness = createHarness({
			keepAlive: 10000,
			maxConcurrentSessions: 2,
			launchDelayMs: 20
		})

		const results = await Promise.allSettled(
			Array.from({ length: 6 }, () => harness.registry.acquire())
		)

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)
		expect(harness.launches).toBe(2)
		expect(harness.browsers).toHaveLength(2)
	})

	test('closing a session frees its slot', async () => {
		const harness = createHarness({ keepAlive: 10000, maxConcurrentSessions: 1 })
		const { sessionId } = await harness.registry.acquire()

		await expect(harness.registry.acquire()).rejects.toBeInstanceOf(SessionLimitError)
		await harness.registry.close(sessionId)

		await expect(harness.registry.acquire()).resolves.toMatchObject({
			sessionId: expect.any(String)
		})
	})

	// The advertised figure and the enforced one are now the same value, rather
	// than a literal beside a ceiling nobody applied.
	test('limits() reports the enforced ceiling and the remaining headroom', async () => {
		const harness = createHarness({ keepAlive: 10000, maxConcurrentSessions: 3 })
		await harness.registry.acquire()

		const limits = harness.registry.limits()

		expect(limits.maxConcurrentSessions).toBe(3)
		expect(limits.allowedBrowserAcquisitions).toBe(2)
		expect(limits.activeSessions).toHaveLength(1)
	})

	test('a failed launch does not hold its slot', async () => {
		let attempts = 0
		const registry = createSessionRegistry({
			maxConcurrentSessions: 1,
			keepAlive: 10000,
			async launch() {
				attempts += 1
				if (attempts === 1) throw new Error('chrome would not start')
				return {
					browser: createFakeBrowser(),
					wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/x'
				}
			}
		})

		await expect(registry.acquire()).rejects.toThrow('chrome would not start')
		await expect(registry.acquire()).resolves.toMatchObject({ sessionId: expect.any(String) })
	})
})

describe('browser shim session reporting', () => {
	test('a session reports the endpoint and the connection it is serving', async () => {
		const { registry } = createHarness({ keepAlive: 10000 })
		const { sessionId } = await registry.acquire()

		expect(registry.get(sessionId)).toMatchObject({
			sessionId,
			wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/1',
			connectionId: undefined
		})

		const attached = registry.attach(sessionId)
		expect(registry.get(sessionId)?.connectionId).toBe(attached?.connectionId)
		expect(registry.list()[0]?.connectionStartTime).toEqual(expect.any(Number))
	})

	test('history is newest first and capped', async () => {
		const { registry } = createHarness({ keepAlive: 10000 })

		for (let index = 0; index < 3; index += 1) {
			const { sessionId } = await registry.acquire()
			await registry.close(sessionId, 1, `Closure${index}`)
		}

		expect(registry.history().map((entry) => entry.closeReasonText)).toEqual([
			'Closure2',
			'Closure1',
			'Closure0'
		])
		expect(registry.history(1)).toHaveLength(1)
	})
})
