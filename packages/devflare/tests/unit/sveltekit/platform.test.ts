import { describe, expect, test } from 'bun:test'
import { drainWaitUntilErrors, type Platform } from '../../../src/sveltekit/platform'

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
