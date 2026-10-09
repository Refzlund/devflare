// =============================================================================
// waitUntil Tracker — background work cf.worker.fetch started and nobody awaits
// =============================================================================
/*
	cf.worker.fetch returns as soon as the handler resolves, because that is when
	workerd hands the response back. The handler's `ctx.waitUntil()` work keeps
	running after that, and in workerd the bindings stay alive until it settles
	(capped at 30s past the response). In the harness the bindings live exactly
	as long as the test context, so the work is registered here and
	`env.dispose()` drains it before tearing the runtime down.

	→ A rejection is reported exactly ONCE, through one of two channels chosen
	  when it happens:
	    - while `env.dispose()` is draining, it is handed to the drain, and
	      dispose throws it after teardown (the `afterAll` that owns the context
	      fails, naming the request);
	    - otherwise it is re-raised as an unhandled rejection carrying the
	      request and the original error as `cause`. That is the runtime's own
	      boundary, so the test running at that moment fails, exactly as it
	      would without devflare's handler, but no longer anonymously.
	  The second channel is also what happens when `env.dispose()` is never
	  called. Waiting for a dispose that may never come would drop the error,
	  and bun's test runner fires neither `exit` nor `beforeExit` (measured on
	  bun 1.4.2), so there is no later moment to report it at.
	→ GOTCHA: the handler is attached when the work is REGISTERED, so the
	  rejection is always handled as far as the runtime is concerned. That is
	  why this module owns the reporting: without the re-raise above, a failing
	  `waitUntil` would vanish.
	→ Work still pending when the drain's budget runs out is ABANDONED: the
	  drain reports it, by request, and its later outcome is not reported again.
	  The teardown that follows is the likely cause of whatever it does next (a
	  binding call after Miniflare is gone fails with ECONNRESET), and raising
	  that would fail some unrelated later test, which is the defect this module
	  exists to remove.
*/

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Where a piece of `waitUntil` work came from, for the errors that name it. */
export interface WaitUntilOrigin {
	/** The helper whose handler called `ctx.waitUntil()`, e.g. `cf.worker.fetch`. */
	helper: string
	/** The request method the handler was serving. */
	method: string
	/** The full request URL the handler was serving. */
	url: string
}

/** What a drain found, for `env.dispose()` to report after it has torn down. */
export interface WaitUntilDrainOutcome {
	/** Attributed errors for work that rejected while the drain was waiting. */
	failures: WaitUntilError[]
	/** Errors naming the work still pending when the drain's budget ran out. */
	abandoned: WaitUntilError[]
}

/** One registered piece of work. */
interface TrackedWork {
	/** Where it came from. */
	origin: WaitUntilOrigin
	/** Resolves once the work settles either way; never rejects. */
	settled: Promise<void>
	/** Set when a drain gave up on it, so its later outcome is not reported twice. */
	abandoned: boolean
}

/** Collects the failures that settle while a drain is waiting. */
interface DrainCollector {
	/** Failures handed to this drain rather than re-raised. */
	failures: WaitUntilError[]
}

/**
 * An error about `waitUntil` work a test helper started: it rejected, or it was
 * still pending when `env.dispose()` stopped waiting. The message names the
 * helper and the request; a rejection keeps the original error as `cause`.
 */
export class WaitUntilError extends Error {
	/** Where the work came from. */
	readonly origin: WaitUntilOrigin

	/**
	 * @param origin - the helper and request that started the work
	 * @param message - the full message, already naming the origin
	 * @param options - `cause` carries the original rejection, when there is one
	 */
	constructor(origin: WaitUntilOrigin, message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'WaitUntilError'
		this.origin = origin
	}
}

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

/**
 * Every piece of work registered and not yet settled. Process-wide, as the
 * `cf.worker` helper it serves is: one test context is live at a time.
 */
const pendingWork = new Set<TrackedWork>()

/** The drain currently waiting, which rejections are handed to instead of re-raised. */
let activeDrain: DrainCollector | null = null

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------

/**
 * @description Names where a piece of work came from, e.g.
 * `cf.worker.fetch(GET http://localhost/api)`.
 * @param origin - the helper and request
 */
function describeOrigin(origin: WaitUntilOrigin): string {
	return `${origin.helper}(${origin.method} ${origin.url})`
}

/**
 * @description A one-line description of a rejection reason, which may be any
 * value a promise was rejected with.
 * @param reason - what the work rejected with
 */
function describeReason(reason: unknown): string {
	if (reason instanceof Error) {
		return `${reason.name}: ${reason.message}`
	}
	return String(reason)
}

/**
 * @description Builds the attributed error for work that rejected.
 * @param origin - the helper and request that started it
 * @param reason - what it rejected with, kept as `cause`
 */
function rejectionError(origin: WaitUntilOrigin, reason: unknown): WaitUntilError {
	return new WaitUntilError(
		origin,
		`waitUntil work started by ${describeOrigin(origin)} rejected: ${describeReason(reason)}`,
		{ cause: reason }
	)
}

/**
 * @description Builds the error for work still pending when a drain gave up.
 * @param origin - the helper and request that started it
 * @param budgetMs - how long the drain waited
 */
function abandonedError(origin: WaitUntilOrigin, budgetMs: number): WaitUntilError {
	return new WaitUntilError(
		origin,
		`waitUntil work started by ${describeOrigin(origin)} had not settled when env.dispose() ` +
			`stopped waiting for it after ${budgetMs}ms; the runtime was torn down regardless`
	)
}

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

/**
 * @description Registers a value passed to `ctx.waitUntil()` so `env.dispose()`
 * can drain it, and takes over reporting its rejection (see the file header).
 * @param work - what the handler passed; a non-promise settles immediately, as
 *   `Promise.resolve` would make it
 * @param origin - the helper and request that started it, named in any error
 * @sideeffect adds to the process-wide pending set until the work settles; a
 *   rejection outside a drain is re-raised as an unhandled rejection
 */
export function trackWaitUntil(work: unknown, origin: WaitUntilOrigin): void {
	const tracked: TrackedWork = {
		origin,
		abandoned: false,
		settled: Promise.resolve(work).then(
			() => {
				pendingWork.delete(tracked)
			},
			(reason: unknown) => {
				pendingWork.delete(tracked)
				reportRejection(tracked, reason)
			}
		)
	}
	pendingWork.add(tracked)
}

/**
 * @description Routes one rejection to exactly one reporter: the drain that is
 * waiting, or else the runtime's unhandled-rejection boundary.
 * @param tracked - the work that rejected
 * @param reason - what it rejected with
 */
function reportRejection(tracked: TrackedWork, reason: unknown): void {
	if (tracked.abandoned) {
		// Already reported by the drain that gave up on it; see the file header.
		return
	}

	const failure = rejectionError(tracked.origin, reason)
	if (activeDrain) {
		activeDrain.failures.push(failure)
		return
	}

	// Deliberately left unhandled: nothing is collecting, and the runtime's own
	// unhandled-rejection report is the boundary that fails the running test.
	void Promise.reject(failure)
}

// -----------------------------------------------------------------------------
// Draining
// -----------------------------------------------------------------------------

/**
 * @description Resolves after `ms`, or as soon as `settled` does, whichever is
 * first, and says which.
 * @param settled - the work being waited for
 * @param ms - the most to wait
 * @returns `true` when the time ran out first
 */
async function timedOut(settled: Promise<unknown>, ms: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const expiry = new Promise<true>((resolve) => {
		timer = setTimeout(() => resolve(true), ms)
	})
	try {
		return await Promise.race([settled.then(() => false), expiry])
	} finally {
		clearTimeout(timer)
	}
}

/**
 * @description Waits for every registered piece of work to settle, including
 * work registered while waiting, for at most `budgetMs` in total. Whatever is
 * still pending then is abandoned and forgotten.
 * @param budgetMs - the most to wait, in milliseconds, across every round
 * @returns the rejections that arrived while waiting and the abandoned work,
 *   each as an attributed error; rejections from BEFORE the drain started were
 *   already re-raised when they happened and are not repeated
 * @sideeffect empties the process-wide pending set
 */
export async function drainWaitUntil(budgetMs: number): Promise<WaitUntilDrainOutcome> {
	const collector: DrainCollector = { failures: [] }
	activeDrain = collector
	const deadline = Date.now() + budgetMs

	try {
		// A round at a time, because work can register more work: a handler's
		// background task may itself call `ctx.waitUntil()`.
		while (pendingWork.size > 0) {
			const remaining = deadline - Date.now()
			const round = Promise.all([...pendingWork].map((work) => work.settled))
			if (remaining <= 0 || (await timedOut(round, remaining))) {
				break
			}
		}

		const abandoned = [...pendingWork]
		pendingWork.clear()
		for (const work of abandoned) {
			work.abandoned = true
		}

		return {
			failures: collector.failures,
			abandoned: abandoned.map((work) => abandonedError(work.origin, budgetMs))
		}
	} finally {
		if (activeDrain === collector) {
			activeDrain = null
		}
	}
}

/**
 * @description Folds a drain's outcome into the one error `env.dispose()` throws.
 * @param outcome - what the drain found
 * @returns `null` when everything settled cleanly; the error itself when there
 *   is one; otherwise an `AggregateError` whose message lists every entry,
 *   because bun prints an aggregate's message and not its `errors`
 */
export function waitUntilDrainError(outcome: WaitUntilDrainOutcome): Error | null {
	const problems = [...outcome.failures, ...outcome.abandoned]
	if (problems.length === 0) {
		return null
	}
	if (problems.length === 1) {
		return problems[0]
	}
	return new AggregateError(
		problems,
		`${problems.length} pieces of waitUntil work did not finish cleanly before env.dispose():\n` +
			problems.map((problem) => `  - ${problem.message}`).join('\n')
	)
}
