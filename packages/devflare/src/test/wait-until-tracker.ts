// =============================================================================
// waitUntil Tracker — the background work cf.worker.fetch left running at dispose
// =============================================================================
/*
	cf.worker.fetch returns as soon as the handler resolves, as workerd does,
	and the handler's `ctx.waitUntil()` work keeps running. In workerd the
	bindings outlive that work (up to 30s past the response); in the harness
	they live exactly as long as the test context. So each context opens a
	scope, cf.worker.fetch registers every waitUntil promise into it, and
	`env.dispose()` drains the scope before tearing the runtime down.

	→ KEY: registering attaches NOTHING to the promise. Whether a rejection is
	  unhandled is the runtime's call, and attaching a handler would decide it
	  for the consumer: a handler that also awaits the promise and recovers
	  (`ctx.waitUntil(audit); try { await audit } catch { … }`) would start to
	  fail. So everything that settles before dispose behaves exactly as it did
	  before this tracker existed: the runtime reports an unhandled rejection
	  (unattributed), and a handled one is reported by nobody.
	→ The drain takes responsibility only for work still PENDING when it
	  starts. It first yields one macrotask so the runtime reports anything that
	  already rejected; attaching in the same tick hides such a rejection from
	  bun (measured on bun 1.4.2). It then attaches to every promise and tells
	  settled from pending by microtask order: a promise that has settled queues
	  its reaction immediately, ahead of a marker queued right after; a pending
	  one can only queue its reaction when it settles, after the marker. Settled
	  work is ignored. A rejection after the marker is the drain's to report,
	  and `env.dispose()` throws it, attributed, once.
	→ Work still pending when the budget runs out is abandoned, and dispose
	  names it. If it rejects later, that is logged with console.error and
	  never thrown: it would fail whichever unrelated test is running by then,
	  and the teardown that followed is the likely cause.
	→ Scopes belong to one context each. Work from an earlier context that was
	  never disposed is not drained by, or blamed on, the next one; opening the
	  next scope logs which work that was.
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
	/** Attributed errors for work that was pending when the drain began and then rejected. */
	failures: WaitUntilError[]
	/** Errors naming the work still pending when the drain's budget ran out. */
	abandoned: WaitUntilError[]
}

/**
 * An error about `waitUntil` work `cf.worker.fetch()` started and `env.dispose()`
 * waited for: the work rejected while dispose waited, or it was still pending
 * when dispose stopped waiting. The message names the request; a rejection
 * keeps the original error as `cause`.
 */
export class WaitUntilError extends Error {
	/** The helper and request that started the work. */
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

/** One promise a drain is watching. */
interface Watch {
	/** Where it came from. */
	origin: WaitUntilOrigin
	/** `abandoned` once the drain gave up on it, so a late rejection is logged, not thrown. */
	state: 'pending' | 'settled' | 'abandoned'
	/** Resolves once the promise settles either way; never rejects. */
	settled: Promise<void>
}

/** A drain in progress. */
interface Drain {
	/**
	 * True until the classification marker runs. A reaction that runs while it
	 * is true belongs to a promise that had settled before the drain began.
	 */
	classifying: boolean
	/** Rejections of work that was pending when the drain began. */
	failures: WaitUntilError[]
	/** Every promise watched, keyed by the promise so one registered twice is watched once. */
	watches: Map<PromiseLike<unknown>, Watch>
}

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
 * @description Builds the attributed error for work that rejected while a drain waited.
 * @param origin - the helper and request that started it
 * @param reason - what it rejected with, kept as `cause`
 */
function rejectionError(origin: WaitUntilOrigin, reason: unknown): WaitUntilError {
	return new WaitUntilError(
		origin,
		`waitUntil work started by ${describeOrigin(origin)} rejected while env.dispose() ` +
			`was waiting for it: ${describeReason(reason)}`,
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
		`waitUntil work started by ${describeOrigin(origin)} had not settled after ${budgetMs}ms, ` +
			'so env.dispose() stopped waiting and tears the runtime down without it. To wait longer, ' +
			'pass env.dispose({ waitUntilTimeoutMs }) and raise the hook timeout to match, e.g. ' +
			'afterAll(() => env.dispose({ waitUntilTimeoutMs: 10_000 }), 15_000).'
	)
}

/** How many origins the never-disposed warning lists before it summarises the rest. */
const LISTED_ORIGINS = 5

/**
 * @description The warning for a scope whose context was never disposed.
 * @param origins - where its undrained promises came from
 */
function neverDisposedMessage(origins: WaitUntilOrigin[]): string {
	const distinct = [...new Set(origins.map(describeOrigin))]
	const listed = distinct.slice(0, LISTED_ORIGINS).join(', ')
	const more =
		distinct.length > LISTED_ORIGINS ? `, and ${distinct.length - LISTED_ORIGINS} more` : ''
	return (
		'devflare: a test context created earlier was never disposed, so the ' +
		`${origins.length} waitUntil promise(s) cf.worker.fetch registered under it were not drained, ` +
		`and the new context's env.dispose() will neither wait for them nor report them: ${listed}${more}. ` +
		'Call env.dispose() (usually in afterAll) for every createTestContext().'
	)
}

// -----------------------------------------------------------------------------
// Scope
// -----------------------------------------------------------------------------

/**
 * @description Whether a value passed to `ctx.waitUntil()` can still settle
 * later. Anything else is settled already and has nothing to drain.
 * @param work - the value the handler passed
 */
function isThenable(work: unknown): work is PromiseLike<unknown> {
	const candidate = work as { then?: unknown } | null
	return (
		(typeof work === 'object' || typeof work === 'function') &&
		candidate !== null &&
		typeof candidate.then === 'function'
	)
}

/** Resolves on the next macrotask, after the runtime's unhandled-rejection pass. */
function nextMacrotask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

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
 * @description Starts watching one promise for a drain, attaching the
 * reactions that classify and report it (see the file header).
 * @param drain - the drain in progress
 * @param work - the promise
 * @param origin - where it came from
 * @sideeffect marks the promise handled; nothing is attached twice
 */
function watch(drain: Drain, work: PromiseLike<unknown>, origin: WaitUntilOrigin): void {
	if (drain.watches.has(work)) {
		return
	}

	const entry: Watch = { origin, state: 'pending', settled: Promise.resolve() }
	entry.settled = Promise.resolve(work).then(
		() => {
			if (entry.state === 'pending') entry.state = 'settled'
		},
		(reason: unknown) => {
			if (drain.classifying) {
				// Settled before the drain began: the runtime has already had its say.
				entry.state = 'settled'
				return
			}
			if (entry.state === 'abandoned') {
				console.error(
					`devflare: waitUntil work started by ${describeOrigin(origin)} rejected after ` +
						'env.dispose() stopped waiting for it:',
					reason
				)
				return
			}
			entry.state = 'settled'
			drain.failures.push(rejectionError(origin, reason))
		}
	)
	drain.watches.set(work, entry)
}

/**
 * The `waitUntil` work one test context's `cf.worker.fetch` calls registered,
 * drained once by that context's `env.dispose()`.
 */
export class WaitUntilScope {
	/** Registered and not yet drained, keyed by the promise so one registered twice counts once. */
	readonly #registered = new Map<PromiseLike<unknown>, WaitUntilOrigin>()
	/** The drain in progress, which new registrations join directly. */
	#drain: Drain | null = null
	/** Set when the drain finishes; the scope takes nothing after that. */
	#closed = false

	/** Whether the scope has been drained, i.e. its context disposed. */
	get closed(): boolean {
		return this.#closed
	}

	/** Where every registered, not-yet-drained promise came from. */
	get registeredOrigins(): WaitUntilOrigin[] {
		return [...this.#registered.values()]
	}

	/**
	 * @description Registers a value passed to `ctx.waitUntil()`, attaching
	 * nothing to it.
	 * @param work - what the handler passed; a value that is not a thenable has
	 *   nothing to drain and is ignored
	 * @param origin - the helper and request that started it
	 * @sideeffect holds a reference to the promise until the scope is drained.
	 *   After the scope is closed it is ignored: its context is gone, so any
	 *   rejection stays the runtime's to report.
	 */
	track(work: unknown, origin: WaitUntilOrigin): void {
		if (!isThenable(work) || this.#closed) {
			return
		}
		if (this.#drain) {
			watch(this.#drain, work, origin)
			return
		}
		if (!this.#registered.has(work)) {
			this.#registered.set(work, origin)
		}
	}

	/**
	 * @description Waits for the work that is still pending, including work
	 * registered while waiting, for at most `budgetMs` in total, then closes
	 * the scope. Work that had settled before the drain began is ignored.
	 * @param budgetMs - the most to wait, in milliseconds, across every round
	 * @returns the rejections that arrived while waiting and the work abandoned
	 *   at the budget, each as an attributed error
	 * @sideeffect marks every registered promise handled, closes the scope and
	 *   releases its references
	 */
	async drain(budgetMs: number): Promise<WaitUntilDrainOutcome> {
		const deadline = Date.now() + budgetMs
		await nextMacrotask()

		const drain: Drain = { classifying: true, failures: [], watches: new Map() }
		this.#drain = drain
		try {
			for (const [work, origin] of this.#registered) {
				watch(drain, work, origin)
			}
			this.#registered.clear()
			await new Promise<void>((resolve) => {
				queueMicrotask(() => {
					drain.classifying = false
					resolve()
				})
			})

			// A round at a time, because work can register more work: a handler's
			// background task may itself call `ctx.waitUntil()`.
			while (true) {
				const pending = [...drain.watches.values()].filter((entry) => entry.state === 'pending')
				const remaining = deadline - Date.now()
				if (pending.length === 0) break
				if (remaining <= 0) break
				if (await timedOut(Promise.all(pending.map((entry) => entry.settled)), remaining)) break
			}

			const abandoned: WaitUntilError[] = []
			for (const entry of drain.watches.values()) {
				if (entry.state === 'pending') {
					entry.state = 'abandoned'
					abandoned.push(abandonedError(entry.origin, budgetMs))
				}
			}
			return { failures: drain.failures, abandoned }
		} finally {
			drain.watches.clear()
			this.#drain = null
			this.#closed = true
		}
	}
}

/** The scope opened last, checked for a missing dispose when the next one opens. */
let latestScope: WaitUntilScope | null = null

/**
 * @description Opens the scope for a new test context. If the previous
 * context was never disposed and registered work, that work stays undrained,
 * and this says so on stderr rather than letting the new context drain or
 * blame it.
 * @returns the new context's scope
 */
export function openWaitUntilScope(): WaitUntilScope {
	const previous = latestScope
	if (previous && !previous.closed) {
		const origins = previous.registeredOrigins
		if (origins.length > 0) {
			console.error(neverDisposedMessage(origins))
		}
	}
	latestScope = new WaitUntilScope()
	return latestScope
}

/**
 * @description Folds a drain's outcome into the one error `env.dispose()` throws.
 * @param outcome - what the drain found
 * @returns `null` when nothing needs reporting; the error itself when there is
 *   one; otherwise an `AggregateError` whose message lists every entry,
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
