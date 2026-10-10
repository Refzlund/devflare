import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	openWaitUntilScope,
	type WaitUntilError,
	type WaitUntilOrigin,
	WaitUntilScope,
	waitUntilDrainError
} from '../../../src/test/wait-until-tracker'

/*
	The tracker's rules, without a runtime. bun fails the running test on any
	unhandled rejection, so a test that waits through a rejection and passes
	also shows the tracker raised nothing. What bun itself does with a
	rejection the tracker must leave alone can only be seen from a separate
	`bun test` run, as the last cases here do. Scopes from openWaitUntilScope()
	use Bun.peek; `new WaitUntilScope(null)` drives the fallback for runtimes
	without it.
*/

/** An origin naming `path`, as cf.worker.fetch would record it. */
function origin(path: string): WaitUntilOrigin {
	return { helper: 'cf.worker.fetch', method: 'GET', url: `http://localhost${path}` }
}

/** Resolves after `ms`. */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A Promise subclass, as SDK clients return (e.g. an `APIPromise extends Promise`). */
class SdkPromise<T> extends Promise<T> {}

/** console.error, replaced per test so the tracker's lines can be read and kept quiet. */
let consoleError: ReturnType<typeof spyOn>

beforeEach(() => {
	consoleError = spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	consoleError.mockRestore()
})

describe('WaitUntilScope.drain', () => {
	test('waits for pending work, including work that work registers while it waits', async () => {
		const scope = openWaitUntilScope()
		const finished: string[] = []
		scope.track(
			(async () => {
				await delay(20)
				finished.push('outer')
				scope.track(
					(async () => {
						await delay(20)
						finished.push('inner')
					})(),
					origin('/inner')
				)
			})(),
			origin('/outer')
		)

		const outcome = await scope.drain(1_000)

		expect(finished).toEqual(['outer', 'inner'])
		expect(outcome).toEqual({ failures: [], abandoned: [] })
	})

	test('reports a rejection of work still pending when it began, once, attributed, with its cause', async () => {
		const scope = openWaitUntilScope()
		const reason = new Error('sweep exploded')
		scope.track(
			(async () => {
				await delay(20)
				throw reason
			})(),
			origin('/sweep')
		)

		const outcome = await scope.drain(1_000)

		expect(outcome.abandoned).toEqual([])
		expect(outcome.failures).toHaveLength(1)
		const [failure] = outcome.failures
		expect(failure.name).toBe('WaitUntilError')
		expect(failure.message).toBe(
			'waitUntil work started by cf.worker.fetch(GET http://localhost/sweep) rejected while ' +
				'env.dispose() was waiting for it: Error: sweep exploded'
		)
		expect(failure.cause).toBe(reason)
		expect(failure.origin).toEqual(origin('/sweep'))

		// Once: the drained scope has nothing left to report.
		expect(await scope.drain(30)).toEqual({ failures: [], abandoned: [] })
	})

	test('reports a rejection that lands in the next timer after it starts', async () => {
		const scope = openWaitUntilScope()
		const reason = new Error('rejected in the next timer')
		scope.track(
			new Promise((_, reject) => setTimeout(() => reject(reason), 0)),
			origin('/next-timer')
		)

		const outcome = await scope.drain(100)

		expect(outcome.failures.map((failure) => failure.cause)).toEqual([reason])
		expect(outcome.abandoned).toEqual([])
	})

	test('ignores work that settled before it began, including a rejection the handler recovered from', async () => {
		const scope = openWaitUntilScope()
		const audit = (async () => {
			await delay(5)
			throw new Error('audit service down')
		})()
		// An SDK-style Promise subclass, which a resolve-based classification sees ticks late.
		const sdkCall = new SdkPromise<string>((_, reject) => {
			setTimeout(() => reject(new Error('sdk call failed')), 5)
		})
		scope.track(audit, origin('/handled'))
		scope.track(sdkCall, origin('/sdk'))
		scope.track(Promise.resolve('done'), origin('/done'))
		// What the handler did: it awaited the same promises and recovered.
		expect(await audit.catch(() => 'recovered')).toBe('recovered')
		expect(await sdkCall.catch(() => 'recovered')).toBe('recovered')

		expect(await scope.drain(1_000)).toEqual({ failures: [], abandoned: [] })
	})

	test('resolves a thenable once, when it is registered, and never calls it again', async () => {
		const scope = openWaitUntilScope()
		let thenCalls = 0
		// A lazy, query-builder-shaped thenable: each `then` call runs the query.
		const query = {
			// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test.
			then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
				thenCalls++
				setTimeout(() => reject(new Error('query failed')), 20)
			}
		}

		scope.track(query, origin('/query'))
		await delay(0)
		expect(thenCalls).toBe(1)

		const outcome = await scope.drain(1_000)

		expect(thenCalls).toBe(1)
		expect(outcome.failures.map((failure) => (failure.cause as Error).message)).toEqual([
			'query failed'
		])
	})

	test('prunes settled registrations as it grows, so it does not hold them until dispose', async () => {
		const scope = openWaitUntilScope()
		// Registered first, so the prune pass has to look at it and keep it.
		scope.track(new Promise(() => {}), origin('/still-pending'))
		for (let index = 0; index < 70; index++) {
			scope.track(Promise.resolve(index), origin(`/settled-${index}`))
		}

		expect(scope.registeredCount).toBeLessThan(70)
		expect(scope.undrainedOrigins).toEqual([origin('/still-pending')])
		expect((await scope.drain(0)).abandoned.map((error) => error.origin)).toEqual([
			origin('/still-pending')
		])
	})

	test('counts its budget across rounds, so work that keeps registering more cannot hold it open', async () => {
		const scope = openWaitUntilScope()
		let stopped = false
		// A poll that re-registers itself every 40ms until told to stop.
		function poll(): void {
			scope.track(
				(async () => {
					await delay(40)
					if (!stopped) poll()
				})(),
				origin('/poll')
			)
		}
		poll()

		const started = performance.now()
		const outcome = await scope.drain(200)
		const elapsed = performance.now() - started
		stopped = true

		expect(elapsed).toBeLessThan(400)
		expect(outcome.failures).toEqual([])
		expect(outcome.abandoned).toHaveLength(1)
		expect(outcome.abandoned[0].origin).toEqual(origin('/poll'))
	})

	test('abandons work at the budget, says how to wait longer, and only logs a later rejection', async () => {
		const scope = openWaitUntilScope()
		const late = new Error('rejected after the drain gave up')
		scope.track(
			(async () => {
				await delay(100)
				throw late
			})(),
			origin('/slow')
		)

		const started = performance.now()
		const outcome = await scope.drain(30)
		const elapsed = performance.now() - started

		// Loose on purpose: a loaded runner can be late, never early.
		expect(elapsed).toBeLessThan(1_000)
		expect(outcome.failures).toEqual([])
		expect(outcome.abandoned.map((error) => error.message)).toEqual([
			'waitUntil work started by cf.worker.fetch(GET http://localhost/slow) had not settled after ' +
				'30ms, so env.dispose() stopped waiting and tears the runtime down without it. To wait ' +
				'longer, pass env.dispose({ waitUntilTimeoutMs }) and raise the hook timeout to match, e.g. ' +
				'afterAll(() => env.dispose({ waitUntilTimeoutMs: 10_000 }), 15_000).'
		])
		expect(consoleError).not.toHaveBeenCalled()

		// The abandoned work rejects inside this test: logged, never raised.
		await delay(120)
		expect(consoleError).toHaveBeenCalledTimes(1)
		expect(consoleError.mock.calls[0]).toEqual([
			'devflare: waitUntil work started by cf.worker.fetch(GET http://localhost/slow) rejected ' +
				'after env.dispose() stopped waiting for it:',
			late
		])
	})

	test('watches a promise registered twice once, before the drain and during it', async () => {
		const scope = openWaitUntilScope()
		const before = new Promise(() => {})
		scope.track(before, origin('/before-first'))
		scope.track(before, origin('/before-second'))
		const during = new Promise(() => {})
		scope.track(
			(async () => {
				await delay(5)
				scope.track(during, origin('/during-first'))
				scope.track(during, origin('/during-second'))
			})(),
			origin('/registers-during')
		)

		const outcome = await scope.drain(60)

		expect(outcome.abandoned.map((error) => error.origin)).toEqual([
			origin('/before-first'),
			origin('/during-first')
		])
	})

	test('takes nothing once it has been drained', async () => {
		const scope = openWaitUntilScope()
		await scope.drain(30)

		scope.track(new Promise(() => {}), origin('/after-dispose'))

		expect(scope.closed).toBe(true)
		expect(await scope.drain(30)).toEqual({ failures: [], abandoned: [] })
	})
})

describe('openWaitUntilScope', () => {
	test("leaves an undisposed earlier context's work alone, and names it when the next opens", async () => {
		const earlier = openWaitUntilScope()
		earlier.track(new Promise(() => {}), origin('/leaked'))

		const current = openWaitUntilScope()

		expect(consoleError).toHaveBeenCalledTimes(1)
		expect(String(consoleError.mock.calls[0][0])).toContain(
			'a test context created earlier was never disposed, so the 1 waitUntil promise(s) ' +
				'cf.worker.fetch registered under it were not drained'
		)
		expect(String(consoleError.mock.calls[0][0])).toContain(
			'cf.worker.fetch(GET http://localhost/leaked)'
		)

		// The current context's dispose neither waits for nor blames the leaked work.
		expect(await current.drain(30)).toEqual({ failures: [], abandoned: [] })

		await earlier.drain(0)
	})
})

describe('waitUntilDrainError', () => {
	/** A stand-in failure carrying only the message the fold reads. */
	function failure(message: string): WaitUntilError {
		return Object.assign(new Error(message), { name: 'WaitUntilError' }) as WaitUntilError
	}

	test('is null when everything settled cleanly', () => {
		expect(waitUntilDrainError({ failures: [], abandoned: [] })).toBeNull()
	})

	test('is the error itself when there is one', () => {
		const only = failure('only')
		expect(waitUntilDrainError({ failures: [], abandoned: [only] })).toBe(only)
	})

	test('lists every entry in an aggregate message, because bun prints only the message', () => {
		const rejected = failure('first rejected')
		const abandoned = failure('second never settled')

		const error = waitUntilDrainError({ failures: [rejected], abandoned: [abandoned] })

		expect(error).toBeInstanceOf(AggregateError)
		expect((error as AggregateError).errors).toEqual([rejected, abandoned])
		expect(error?.message).toBe(
			'2 pieces of waitUntil work did not finish cleanly before env.dispose():\n' +
				'  - first rejected\n  - second never settled'
		)
	})
})

describe('WaitUntilScope without Bun.peek (the fallback for other runtimes)', () => {
	test('reports a rejection of work still pending when it began', async () => {
		const scope = new WaitUntilScope(null)
		const reason = new Error('rejected later')
		scope.track(
			(async () => {
				await delay(20)
				throw reason
			})(),
			origin('/later')
		)

		const outcome = await scope.drain(1_000)

		expect(outcome.failures.map((failure) => failure.cause)).toEqual([reason])
	})

	test('reports a rejection that lands in the timer right after it attaches', async () => {
		const scope = new WaitUntilScope(null)
		let reject: (reason: unknown) => void = () => {}
		scope.track(
			new Promise((_, rejectWork) => {
				reject = rejectWork
			}),
			origin('/after-attach')
		)
		const reason = new Error('rejected after the attach')

		// The drain schedules its yield first, so this timer runs after the attach.
		const draining = scope.drain(1_000)
		setTimeout(() => reject(reason), 0)
		const outcome = await draining

		expect(outcome.failures.map((failure) => failure.cause)).toEqual([reason])
	})

	test('ignores native work that settled before it began, including a recovered rejection', async () => {
		const scope = new WaitUntilScope(null)
		const audit = (async () => {
			await delay(5)
			throw new Error('audit service down')
		})()
		scope.track(audit, origin('/handled'))
		scope.track(Promise.resolve('done'), origin('/done'))
		expect(await audit.catch(() => 'recovered')).toBe('recovered')

		expect(await scope.drain(1_000)).toEqual({ failures: [], abandoned: [] })
	})
})

describe('a rejection that happened before the drain began', () => {
	const fixtureDirectory = mkdtempSync(join(tmpdir(), 'devflare-wait-until-before-drain-'))
	const trackerUrl = pathToFileURL(
		join(import.meta.dir, '..', '..', '..', 'src', 'test', 'wait-until-tracker.ts')
	).href

	afterAll(() => {
		rmSync(fixtureDirectory, { recursive: true, force: true })
	})

	/**
	 * @description Runs, in a separate `bun test`, a case that rejects a
	 * registered promise and starts the drain in the same tick, and hands back
	 * the run's exit code and output. bun fails whichever test an unhandled
	 * rejection lands in, so only a separate run can show bun reporting it.
	 * @param name - the fixture file's name, unique per case
	 * @param openScope - the expression that opens the scope under test
	 */
	async function runSameTickFixture(
		name: string,
		openScope: string
	): Promise<{ exitCode: number; output: string }> {
		const fixturePath = join(fixtureDirectory, name)
		writeFileSync(
			fixturePath,
			`
import { test } from 'bun:test'
import { openWaitUntilScope, WaitUntilScope } from '${trackerUrl}'

test('rejects just before the drain', async () => {
	const scope = ${openScope}
	scope.track(Promise.reject(new Error('rejected-just-before-the-drain')), {
		helper: 'cf.worker.fetch',
		method: 'GET',
		url: 'http://localhost/early'
	})
	await scope.drain(100)
	void WaitUntilScope
	void openWaitUntilScope
})
`.trim()
		)

		const run = Bun.spawn(['bun', 'test', fixturePath], {
			cwd: fixtureDirectory,
			stdout: 'pipe',
			stderr: 'pipe'
		})
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(run.stdout).text(),
			new Response(run.stderr).text(),
			run.exited
		])
		return { exitCode, output: `${stdout}\n${stderr}` }
	}

	// Under bun the drain leaves a promise it reads as settled untouched.
	test('is still reported by bun, unattributed, when the drain starts in the same tick', async () => {
		const { exitCode, output } = await runSameTickFixture(
			'same-tick.test.ts',
			'openWaitUntilScope()'
		)

		expect(exitCode).not.toBe(0)
		expect(output).toContain('error: rejected-just-before-the-drain')
		expect(output).toContain('(fail) rejects just before the drain')
		expect(output).not.toContain('WaitUntilError')
	}, 30_000)

	// Without Bun.peek the drain must give the runtime its turn before it attaches.
	test('is still reported by the runtime when the fallback drain starts in the same tick', async () => {
		const { exitCode, output } = await runSameTickFixture(
			'same-tick-fallback.test.ts',
			'new WaitUntilScope(null)'
		)

		expect(exitCode).not.toBe(0)
		expect(output).toContain('error: rejected-just-before-the-drain')
		expect(output).not.toContain('WaitUntilError')
	}, 30_000)
})
