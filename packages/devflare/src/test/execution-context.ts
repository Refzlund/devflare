// =============================================================================
// Test Execution Context — the `ctx` devflare's direct handler helpers pass
// =============================================================================
/*
	cf.worker / cf.queue / cf.scheduled / cf.tail / cf.email call a handler
	module directly rather than through workerd, so they build the
	ExecutionContext themselves.

	→ `tracing` is the context of a request that is NOT being traced: spans run
	  their callback and record nothing, which is what workerd hands a handler
	  whose request carries no trace. A handler that opens spans therefore runs
	  unchanged under the test helpers. Which span is ACTIVE is still tracked,
	  across awaits, because `getActiveSpan()` answers it in workerd too.
	→ `exports` and `abort()` need the worker to be running in workerd: an
	  export is a loopback binding back into the worker, and aborting ends a
	  workerd invocation. Neither exists when a handler is called in-process,
	  so both throw rather than hand back something that only looks right.
	→ The context carries the members of both `@cloudflare/workers-types`
	  majors; it is built as a variable rather than returned as a literal so
	  the members 4.x lacks (`exports`, `abort`) are not refused there.
*/

import { AsyncLocalStorage } from 'node:async_hooks'

/** A span that records nothing, as workerd's are when the request is not traced. */
class UntracedSpan {
	/** Always `false`: nothing is being recorded. */
	get isTraced(): boolean {
		return false
	}

	/** Discarded, as on an untraced span. */
	setAttribute(_key: string, _value?: boolean | number | string): this {
		return this
	}

	/** Discarded, as on an untraced span. */
	setAttributes(_attributes: Record<string, boolean | number | string | undefined>): this {
		return this
	}

	/** Discarded, as on an untraced span. */
	recordException(_exception: unknown): void {}

	/** Discarded, as on an untraced span. */
	updateName(_name: string): this {
		return this
	}

	/** Discarded, as on an untraced span. */
	setStatus(_status: { code: 'unset' | 'ok' | 'error'; message?: string }): this {
		return this
	}

	/** Nothing to close. */
	end(): void {}
}

/**
 * The span `enterSpan()` or `startActiveSpan()` made active for its callback.
 * Async-context storage, as in workerd, so the span stays active across the
 * callback's awaits and concurrent callbacks each see their own.
 */
const activeSpan = new AsyncLocalStorage<UntracedSpan>()

/**
 * @description Runs a span callback with a fresh untraced span, active for the
 * callback's duration, returning its result.
 * @param _name - the span name, unused when nothing is recorded
 * @param callback - the code the span would wrap
 * @param args - extra arguments forwarded to `callback`
 * @returns whatever `callback` returns
 */
function runUntraced<T, A extends unknown[]>(
	_name: string,
	callback: (span: UntracedSpan, ...args: A) => T,
	...args: A
): T {
	const span = new UntracedSpan()
	return activeSpan.run(span, callback, span, ...args)
}

/**
 * @description Builds the `ctx.tracing` of one untraced invocation.
 * @returns the tracing API; outside any span, `getActiveSpan()` answers with
 *   the invocation's own span, the same object on every call, as workerd does
 */
function createUntracedTracing() {
	const invocationSpan = new UntracedSpan()
	return {
		enterSpan: runUntraced,
		startActiveSpan: runUntraced,
		startSpan: (_name: string) => new UntracedSpan(),
		getActiveSpan: () => activeSpan.getStore() ?? invocationSpan,
		Span: UntracedSpan
	}
}

/** Why `exports` and `abort()` are refused, shared by both errors. */
const IN_PROCESS_REASON =
	"devflare's test helpers (cf.worker, cf.queue, cf.scheduled, cf.tail, cf.email) call the handler " +
	'in-process rather than in workerd'

/**
 * Property reads that probe a value's shape rather than ask for an export:
 * `await` looks for `then`, `JSON.stringify` for `toJSON`. Answering them
 * keeps `ctx.exports` safe to await, serialise or log.
 */
const SHAPE_PROBES = new Set(['then', 'toJSON'])

/**
 * @description Builds the `ctx.exports` of an in-process invocation: reading
 * any export throws, naming it.
 * @returns an object with no exports
 * @throws on reading any string-keyed property other than a shape probe
 */
function createUnsupportedExports(): object {
	return new Proxy(
		{},
		{
			get(target, key, receiver) {
				if (typeof key === 'symbol' || SHAPE_PROBES.has(key)) {
					return Reflect.get(target, key, receiver)
				}
				throw new Error(
					`ctx.exports.${key} is not supported: ${IN_PROCESS_REASON}, and an export is a loopback ` +
						'binding into a running worker. Test it with `devflare dev` or on Cloudflare.'
				)
			}
		}
	)
}

/**
 * @description Builds the ExecutionContext a directly invoked handler receives.
 * @param waitUntilPromises - collects every promise passed to `ctx.waitUntil()`,
 *   so the helper can await them before reporting the handler finished
 * @returns a context with empty `props`, untraced `tracing`, and `exports` and
 *   `abort()` that throw
 */
export function createTestExecutionContext(
	waitUntilPromises: Promise<unknown>[]
): ExecutionContext {
	const context = {
		waitUntil(promise: Promise<unknown>) {
			waitUntilPromises.push(promise)
		},
		passThroughOnException() {},
		props: {},
		tracing: createUntracedTracing(),
		exports: createUnsupportedExports(),
		abort(_reason?: unknown): never {
			throw new Error(
				`ctx.abort() is not supported: ${IN_PROCESS_REASON}, so there is no invocation to abort.`
			)
		}
	}
	return context
}
