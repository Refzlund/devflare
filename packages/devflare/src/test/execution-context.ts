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
import { trackWaitUntil, type WaitUntilOrigin } from './wait-until-tracker'

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
 * is registered with the waitUntil tracker the moment it is passed, so
 * `env.dispose()` drains it and its rejection is reported, naming `origin`.
 * @param origin - the helper and request the handler is serving
 * @returns a context like {@link createTestExecutionContext}'s
 */
export function createTrackedTestExecutionContext(origin: WaitUntilOrigin): ExecutionContext {
	return createInProcessExecutionContext({
		waitUntil: (promise) => {
			trackWaitUntil(promise, origin)
		},
		host: TEST_HELPER_HOST
	})
}
