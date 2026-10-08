import { describe, expect, test } from 'bun:test'
import { createTestExecutionContext } from '../../../src/test/execution-context'

describe('createTestExecutionContext', () => {
	test('collects every promise passed to waitUntil', () => {
		const waitUntilPromises: Promise<unknown>[] = []
		const ctx = createTestExecutionContext(waitUntilPromises)
		const work = Promise.resolve('done')

		ctx.waitUntil(work)

		expect(waitUntilPromises).toEqual([work])
	})

	test('runs span callbacks as an untraced request does, forwarding arguments and the result', () => {
		const ctx = createTestExecutionContext([])

		const entered = ctx.tracing.enterSpan(
			'load',
			(span, left: number, right: number) => {
				span.setAttribute('rows', 2)
				span.end()
				return { isTraced: span.isTraced, sum: left + right }
			},
			2,
			3
		)
		const started = ctx.tracing.startActiveSpan('save', (span) => span.isTraced)

		expect(entered).toEqual({ isTraced: false, sum: 5 })
		expect(started).toBe(false)
	})
})
