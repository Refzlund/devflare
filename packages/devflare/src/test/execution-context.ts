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
	  unchanged under the test helpers.
*/

/** A span that records nothing, as workerd's are when the request is not traced. */
class UntracedSpan {
	/** Always `false`: nothing is being recorded. */
	get isTraced(): boolean {
		return false
	}

	/** Discarded, as on an untraced span. */
	setAttribute(_key: string, _value?: boolean | number | string): void {}

	/** Nothing to close. */
	end(): void {}
}

/**
 * @description Runs a span callback with an untraced span, returning its result.
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
	return callback(new UntracedSpan(), ...args)
}

/** The `ctx.tracing` of an untraced request. */
const untracedTracing = {
	enterSpan: runUntraced,
	startActiveSpan: runUntraced,
	Span: UntracedSpan
}

/**
 * @description Builds the ExecutionContext a directly invoked handler receives.
 * @param waitUntilPromises - collects every promise passed to `ctx.waitUntil()`,
 *   so the helper can await them before reporting the handler finished
 * @returns a context with empty `props` and untraced `tracing`
 */
export function createTestExecutionContext(
	waitUntilPromises: Promise<unknown>[]
): ExecutionContext {
	return {
		waitUntil(promise: Promise<unknown>) {
			waitUntilPromises.push(promise)
		},
		passThroughOnException() {},
		props: {},
		tracing: untracedTracing
	}
}
