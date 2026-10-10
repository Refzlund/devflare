import { describe, expect, test } from 'bun:test'
import { createTestExecutionContext } from '../../../src/test/execution-context'

/** A span as workers-types 5.x describes it, the members these tests call. */
interface SpanV5 {
	readonly isTraced: boolean
	setAttribute(key: string, value: boolean | number | string): SpanV5
	setAttributes(attributes: Record<string, boolean | number | string | undefined>): SpanV5
	updateName(name: string): SpanV5
	setStatus(status: { code: 'unset' | 'ok' | 'error'; message?: string }): SpanV5
	end(): void
}

/**
 * The context members workers-types 5.x adds. The tests are type-checked against the
 * repo root's 4.x, which lacks them, so each test states the 5.x surface it calls.
 */
interface ExecutionContextV5 {
	readonly exports: Record<string, unknown>
	abort(reason?: unknown): void
	tracing: {
		enterSpan<T>(name: string, callback: (span: SpanV5) => T): T
		startActiveSpan<T>(name: string, callback: (span: SpanV5) => T): T
		startSpan(name: string): SpanV5
		getActiveSpan(): SpanV5 | undefined
	}
}

/** The context the helpers build, seen through its 5.x members. */
function createContextV5(): ExecutionContextV5 {
	return createTestExecutionContext([]) as unknown as ExecutionContextV5
}

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

	test('keeps a span active for its callback, across awaits, and answers the invocation span outside one', async () => {
		const { tracing } = createContextV5()
		const invocationSpan = tracing.getActiveSpan()

		const seen = await Promise.all(
			['first', 'second'].map((name) =>
				tracing.enterSpan(name, async (span) => {
					await new Promise((resolve) => setTimeout(resolve, 5))
					return tracing.getActiveSpan() === span
				})
			)
		)

		expect(invocationSpan?.isTraced).toBe(false)
		expect(tracing.getActiveSpan()).toBe(invocationSpan)
		expect(seen).toEqual([true, true])
	})

	test('starts a span without making it active', () => {
		const { tracing } = createContextV5()
		const invocationSpan = tracing.getActiveSpan()

		const span = tracing.startSpan('background')

		expect(span.isTraced).toBe(false)
		expect(span).not.toBe(invocationSpan)
		expect(tracing.getActiveSpan()).toBe(invocationSpan)
	})

	test('lets span calls chain, as on a recording span', () => {
		const span = createContextV5().tracing.startSpan('chain')

		const chained = span
			.setAttribute('rows', 2)
			.setAttributes({ table: 'users', cached: undefined })
			.updateName('renamed')
			.setStatus({ code: 'ok' })

		expect(chained).toBe(span)
	})

	test('refuses to read an export, naming it, and stays safe to await and serialise', async () => {
		const ctx = createContextV5()

		expect(() => ctx.exports.MyEntrypoint).toThrow(
			/ctx\.exports\.MyEntrypoint is not supported: .*in-process rather than in workerd/
		)
		expect(await ctx.exports).toBe(ctx.exports)
		expect(JSON.stringify(ctx.exports)).toBe('{}')
	})

	test('refuses abort(), there being no workerd invocation to end', () => {
		const ctx = createContextV5()

		expect(() => ctx.abort('stop')).toThrow(/ctx\.abort\(\) is not supported/)
	})
})
