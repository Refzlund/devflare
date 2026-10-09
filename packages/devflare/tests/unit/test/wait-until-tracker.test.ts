import { describe, expect, test } from 'bun:test'
import {
	drainWaitUntil,
	trackWaitUntil,
	type WaitUntilError,
	type WaitUntilOrigin,
	waitUntilDrainError
} from '../../../src/test/wait-until-tracker'

/*
	The tracker's rules, without a runtime. A rejection the tracker re-raised
	would fail whichever of these tests is running, so a test that waits through
	a rejection and passes also shows nothing was re-raised. The re-raise itself
	is graded from a separate `bun test` run in
	tests/integration/test-context/wait-until-drain.test.ts.
*/

/** An origin naming `path`, as cf.worker.fetch would record it. */
function origin(path: string): WaitUntilOrigin {
	return { helper: 'cf.worker.fetch', method: 'GET', url: `http://localhost${path}` }
}

/** Resolves after `ms`. */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('drainWaitUntil', () => {
	test('waits for work, including work that work registers while it waits', async () => {
		const finished: string[] = []
		trackWaitUntil(
			(async () => {
				await delay(20)
				finished.push('outer')
				trackWaitUntil(
					(async () => {
						await delay(20)
						finished.push('inner')
					})(),
					origin('/inner')
				)
			})(),
			origin('/outer')
		)

		const outcome = await drainWaitUntil(1_000)

		expect(finished).toEqual(['outer', 'inner'])
		expect(outcome).toEqual({ failures: [], abandoned: [] })
	})

	test('hands a rejection that lands while it waits to the drain, attributed, with its cause', async () => {
		const reason = new Error('sweep exploded')
		trackWaitUntil(
			(async () => {
				await delay(10)
				throw reason
			})(),
			origin('/sweep')
		)

		const outcome = await drainWaitUntil(1_000)

		expect(outcome.abandoned).toEqual([])
		expect(outcome.failures).toHaveLength(1)
		const [failure] = outcome.failures
		expect(failure.name).toBe('WaitUntilError')
		expect(failure.message).toBe(
			'waitUntil work started by cf.worker.fetch(GET http://localhost/sweep) rejected: Error: sweep exploded'
		)
		expect(failure.cause).toBe(reason)
		expect(failure.origin).toEqual(origin('/sweep'))

		// Reported once: the next drain does not hand it over again.
		expect(await drainWaitUntil(30)).toEqual({ failures: [], abandoned: [] })
	})

	test('abandons work still pending at the budget, and stays quiet when it rejects later', async () => {
		trackWaitUntil(
			(async () => {
				await delay(80)
				throw new Error('rejected after the teardown')
			})(),
			origin('/slow')
		)

		const started = performance.now()
		const outcome = await drainWaitUntil(30)
		const elapsed = performance.now() - started

		expect(elapsed).toBeLessThan(75)
		expect(outcome.failures).toEqual([])
		expect(outcome.abandoned.map((error) => error.message)).toEqual([
			'waitUntil work started by cf.worker.fetch(GET http://localhost/slow) had not settled when ' +
				'env.dispose() stopped waiting for it after 30ms; the runtime was torn down regardless'
		])

		// The abandoned work rejects inside this test; re-raising it would fail it.
		await delay(80)
		expect(await drainWaitUntil(30)).toEqual({ failures: [], abandoned: [] })
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
