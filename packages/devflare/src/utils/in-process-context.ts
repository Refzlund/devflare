// =============================================================================
// In-Process ExecutionContext — the `ctx` of a handler devflare runs outside workerd
// =============================================================================
/*
	devflare's test helpers call a handler module directly, and its SvelteKit dev
	server runs the app in Vite's Node process. Neither is a workerd invocation,
	so each builds the ExecutionContext itself, here.

	→ `tracing` is the context of a request that is NOT being traced: spans run
	  their callback and record nothing, which is what workerd hands a handler
	  whose request carries no trace. A handler that opens spans therefore runs
	  unchanged. Which span is ACTIVE is still tracked, across awaits, because
	  `getActiveSpan()` answers it in workerd too.
	→ `exports` and `abort()` need the worker to be running in workerd: an
	  export is a loopback binding back into the worker, and aborting ends a
	  workerd invocation. Neither exists here, so both throw rather than hand
	  back something that only looks right.
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
export function createUntracedTracing() {
	const invocationSpan = new UntracedSpan()
	return {
		enterSpan: runUntraced,
		startActiveSpan: runUntraced,
		startSpan: (_name: string) => new UntracedSpan(),
		getActiveSpan: () => activeSpan.getStore() ?? invocationSpan,
		Span: UntracedSpan
	}
}

/**
 * Property reads that probe a value's shape rather than ask for an export:
 * `await` looks for `then`, `JSON.stringify` for `toJSON`. Answering them
 * keeps an exports object safe to await, serialise or log.
 */
const SHAPE_PROBES = new Set(['then', 'toJSON'])

/**
 * @description Builds an `exports` object for code running outside workerd:
 * reading any export throws, naming it.
 * @param host - who runs the code instead of workerd, completing "… is not supported: <host>"
 * @param label - how the object is named in the error, e.g. `ctx.exports`
 * @returns an object with no exports
 * @throws on reading any string-keyed property other than a shape probe
 */
export function createUnsupportedExports(host: string, label: string): object {
	return new Proxy(
		{},
		{
			get(target, key, receiver) {
				if (typeof key === 'symbol' || SHAPE_PROBES.has(key)) {
					return Reflect.get(target, key, receiver)
				}
				throw new Error(
					`${label}.${key} is not supported: ${host}, and an export is a loopback binding into a ` +
						'worker running in workerd.'
				)
			}
		}
	)
}

/** What {@link createInProcessExecutionContext} needs from its host. */
export interface InProcessExecutionContextOptions {
	/** Receives every promise passed to `ctx.waitUntil()`. */
	waitUntil(promise: Promise<unknown>): void
	/**
	 * Who runs the handler instead of workerd, as the end of the sentence "… is not
	 * supported: <host>", e.g. "devflare's SvelteKit dev server runs the app in Node".
	 */
	host: string
}

/**
 * @description Builds the ExecutionContext of a handler devflare runs outside workerd.
 * @param options - where `waitUntil` promises go, and who the host is for error messages
 * @returns a context with empty `props`, untraced `tracing`, and `exports` and `abort()` that throw
 */
export function createInProcessExecutionContext(
	options: InProcessExecutionContextOptions
): ExecutionContext {
	const context = {
		waitUntil(promise: Promise<unknown>) {
			options.waitUntil(promise)
		},
		passThroughOnException() {},
		props: {},
		tracing: createUntracedTracing(),
		exports: createUnsupportedExports(options.host, 'ctx.exports'),
		abort(_reason?: unknown): never {
			throw new Error(
				`ctx.abort() is not supported: ${options.host}, so there is no invocation to abort.`
			)
		}
	}
	return context
}
