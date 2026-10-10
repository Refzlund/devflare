// =============================================================================
// Test Execution Context — the `ctx` devflare's direct handler helpers pass
// =============================================================================
/*
	cf.worker / cf.queue / cf.scheduled / cf.tail / cf.email call a handler
	module directly rather than through workerd, so they build the
	ExecutionContext themselves. What each member does there is described
	with the shared builder, in `utils/in-process-context.ts`.
*/

import { createInProcessExecutionContext } from '../utils/in-process-context'
import type { WaitUntilOrigin, WaitUntilScope } from './wait-until-tracker'

/** Who runs a handler under the test helpers, for the errors `exports` and `abort()` throw. */
const TEST_HELPER_HOST =
	"devflare's test helpers (cf.worker, cf.queue, cf.scheduled, cf.tail, cf.email) call the handler " +
	'in-process rather than in workerd'

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
	return createInProcessExecutionContext({
		waitUntil: (promise) => {
			waitUntilPromises.push(promise)
		},
		host: TEST_HELPER_HOST
	})
}

/**
 * @description Builds the ExecutionContext of a handler whose helper returns
 * before its `waitUntil()` work settles, as `cf.worker.fetch` does. Each promise
 * is registered in the test context's waitUntil scope, untouched, so that
 * `env.dispose()` can drain whatever is still pending, naming `origin`.
 * @param scope - the scope of the test context the request runs in
 * @param origin - the helper and request the handler is serving
 * @returns a context like {@link createTestExecutionContext}'s
 */
export function createTrackedTestExecutionContext(
	scope: WaitUntilScope,
	origin: WaitUntilOrigin
): ExecutionContext {
	return createInProcessExecutionContext({
		waitUntil: (promise) => {
			scope.track(promise, origin)
		},
		host: TEST_HELPER_HOST
	})
}
