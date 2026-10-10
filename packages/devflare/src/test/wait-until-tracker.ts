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

	→ KEY: registering attaches NOTHING to a promise. Whether a rejection is
	  unhandled is the runtime's call, and attaching a handler would decide it
	  for the consumer: a handler that also awaits the promise and recovers
	  (`ctx.waitUntil(audit); try { await audit } catch { … }`) would start to
	  fail. So work that settles before dispose is the runtime's: bun reports a
	  rejection nothing handled (unattributed), and nobody reports one the
	  handler recovered from.
	→ A thenable that is not a Promise (a lazy query builder, say) is resolved
	  once, when it is registered, as workerd's waitUntil resolves it when it is
	  called; the native promise that produces is what is tracked, and nothing
	  here calls `then` on the thenable again. That promise is waitUntil's own,
	  so no handler in the consumer's code can be attached to it.
	→ The drain takes responsibility only for work still PENDING when it
	  starts. Under bun it reads each promise's state with `Bun.peek.status`,
	  which attaches nothing (measured on bun 1.4.2, Promise subclasses
	  included). Settled promises are left untouched; pending ones get a
	  handler at once, synchronously, so they cannot reject unseen. Attaching
	  first and classifying afterwards does NOT work under bun: it checks for
	  unhandled rejections once per event-loop pass, so a rejection that landed
	  earlier in the same pass is hidden by any handler attached after it.
	→ Without `Bun.peek` (Node, say) the drain yields one macrotask, after
	  which the runtime has reported every rejection so far (Node checks after
	  each macrotask; measured on Node 25.9). It then attaches to every promise
	  and tells settled from pending by microtask order: a promise that has
	  settled queues its reaction at once, ahead of a marker queued right
	  after, and a pending one only when it settles, after the marker.
	  → GOTCHA: a Promise subclass reaches its reaction a few ticks late there,
	    so one that had already settled is treated as pending: dispose reports a
	    rejection that happened before it started, even one the handler
	    recovered from. bun has no such gap.
	→ A rejection the drain takes responsibility for is thrown by
	  `env.dispose()`, attributed, once.
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

/** A promise's state as `Bun.peek.status` reports it, read without attaching to it. */
export type PromiseStatus = 'pending' | 'fulfilled' | 'rejected'

/** Reads a promise's state without attaching anything to it. */
export type PromiseStatusReader = (promise: Promise<unknown>) => PromiseStatus

/** One registered piece of work: the native promise tracked, and where it came from. */
interface Registration {
	/** The promise itself, or the native promise a thenable was resolved into. */
	promise: Promise<unknown>
	/** The helper and request that started it. */
	origin: WaitUntilOrigin
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
	 * Only without `Bun.peek`: true until the classification marker runs. A
	 * reaction that runs while it is true belongs to a promise that had settled
	 * before the drain began. Always false under bun, which classifies first.
	 */
	classifying: boolean
	/** Rejections of work that was pending when the drain began. */
	failures: WaitUntilError[]
	/** Every promise watched, keyed by what was registered, so a repeat is watched once. */
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

/**
 * `Bun.peek.status` when running under bun, else `null`. Read through
 * `globalThis` because devflare/test also loads outside bun.
 */
const runtimePromiseStatus: PromiseStatusReader | null = (() => {
	const bun = (globalThis as { Bun?: { peek?: { status?: unknown } } }).Bun
	const status = bun?.peek?.status
	return typeof status === 'function' ? (status as PromiseStatusReader) : null
})()

/** Resolves on the next macrotask, after a per-macrotask runtime's unhandled-rejection pass. */
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
 * reactions that report it (see the file header).
 * @param drain - the drain in progress
 * @param key - what was registered, for de-duplication
 * @param promise - the native promise to watch
 * @param origin - where it came from
 * @sideeffect marks the promise handled
 */
function watch(
	drain: Drain,
	key: PromiseLike<unknown>,
	promise: Promise<unknown>,
	origin: WaitUntilOrigin
): void {
	const entry: Watch = { origin, state: 'pending', settled: Promise.resolve() }
	entry.settled = Promise.resolve(promise).then(
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
	drain.watches.set(key, entry)
}

/** Below this many registrations a scope does not bother pruning settled ones. */
const PRUNE_FLOOR = 64

/**
 * The `waitUntil` work one test context's `cf.worker.fetch` calls registered,
 * drained once by that context's `env.dispose()`.
 */
export class WaitUntilScope {
	/** Registered and not yet drained, keyed by what was registered so a repeat counts once. */
	readonly #registered = new Map<PromiseLike<unknown>, Registration>()
	/** How the drain tells settled from pending; `null` means by microtask order. */
	readonly #readStatus: PromiseStatusReader | null
	/** The drain in progress, which new registrations join directly. */
	#drain: Drain | null = null
	/** Set when the drain finishes; the scope takes nothing after that. */
	#closed = false
	/** The registration count at which settled ones are next pruned. */
	#pruneAt = PRUNE_FLOOR

	/**
	 * @param readStatus - reads a promise's state without attaching to it;
	 *   defaults to `Bun.peek.status` under bun. `null` selects the fallback for
	 *   runtimes without one (see the file header); tests pass it to drive that
	 *   path under bun.
	 */
	constructor(readStatus: PromiseStatusReader | null = runtimePromiseStatus) {
		this.#readStatus = readStatus
	}

	/** Whether the scope has been drained, i.e. its context disposed. */
	get closed(): boolean {
		return this.#closed
	}

	/** How many registrations the scope holds now, settled ones not yet pruned included. */
	get registeredCount(): number {
		return this.#registered.size
	}

	/**
	 * Where the undrained work came from: only what is still pending when the
	 * state can be read without attaching, otherwise everything registered.
	 */
	get undrainedOrigins(): WaitUntilOrigin[] {
		const readStatus = this.#readStatus
		return [...this.#registered.values()]
			.filter(({ promise }) => !readStatus || readStatus(promise) === 'pending')
			.map(({ origin }) => origin)
	}

	/**
	 * @description Registers a value passed to `ctx.waitUntil()`, attaching
	 * nothing to it. A thenable that is not a Promise is resolved now, once,
	 * and the promise that produces is tracked instead (see the file header).
	 * @param work - what the handler passed; a value that is not a thenable has
	 *   nothing to drain and is ignored, and so is a repeat
	 * @param origin - the helper and request that started it
	 * @sideeffect holds a reference to the promise until the scope is drained,
	 *   or until it is found settled when the scope prunes. After the scope is
	 *   closed it is ignored: its context is gone, so any rejection stays the
	 *   runtime's to report.
	 */
	track(work: unknown, origin: WaitUntilOrigin): void {
		if (this.#closed || !isThenable(work)) {
			return
		}
		if (this.#registered.has(work) || this.#drain?.watches.has(work)) {
			return
		}

		const promise = work instanceof Promise ? work : Promise.resolve(work)
		if (this.#drain) {
			watch(this.#drain, work, promise, origin)
			return
		}
		this.#registered.set(work, { promise, origin })
		this.#pruneSettled()
	}

	/**
	 * @description Drops registrations already settled, once the scope has
	 * grown to twice what the last prune left, so a context that runs many
	 * requests does not hold every settled promise and its value until dispose.
	 * The drain ignores settled work anyway, so this changes nothing it reports.
	 * Only possible where a promise's state can be read without attaching.
	 */
	#pruneSettled(): void {
		const readStatus = this.#readStatus
		if (!readStatus || this.#registered.size < this.#pruneAt) {
			return
		}
		for (const [key, { promise }] of this.#registered) {
			if (readStatus(promise) !== 'pending') {
				this.#registered.delete(key)
			}
		}
		this.#pruneAt = Math.max(PRUNE_FLOOR, this.#registered.size * 2)
	}

	/**
	 * @description Waits for the work that is still pending, including work
	 * registered while waiting, for at most `budgetMs` in total, then closes
	 * the scope. Work that had settled before the drain began is ignored.
	 * @param budgetMs - the most to wait, in milliseconds, across every round
	 * @returns the rejections that arrived while waiting and the work abandoned
	 *   at the budget, each as an attributed error
	 * @sideeffect marks every pending promise handled, closes the scope and
	 *   releases its references
	 */
	async drain(budgetMs: number): Promise<WaitUntilDrainOutcome> {
		const deadline = Date.now() + budgetMs
		const drain: Drain = { classifying: false, failures: [], watches: new Map() }
		try {
			if (this.#readStatus) {
				this.#watchPending(drain, this.#readStatus)
			} else {
				await this.#watchPendingByMicrotaskOrder(drain)
			}

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

	/**
	 * @description Starts the drain where a promise's state can be read without
	 * attaching: synchronously, settled work is left untouched for the runtime
	 * and pending work is watched before it can reject.
	 * @param drain - the drain starting
	 * @param readStatus - reads a promise's state without attaching to it
	 */
	#watchPending(drain: Drain, readStatus: PromiseStatusReader): void {
		this.#drain = drain
		for (const [key, { promise, origin }] of this.#registered) {
			if (readStatus(promise) === 'pending') {
				watch(drain, key, promise, origin)
			}
		}
		this.#registered.clear()
	}

	/**
	 * @description Starts the drain where nothing can read a promise's state
	 * without attaching: lets the runtime report what already rejected, then
	 * watches everything and tells settled from pending by microtask order.
	 * @param drain - the drain starting
	 */
	async #watchPendingByMicrotaskOrder(drain: Drain): Promise<void> {
		await nextMacrotask()
		drain.classifying = true
		this.#drain = drain
		for (const [key, { promise, origin }] of this.#registered) {
			watch(drain, key, promise, origin)
		}
		this.#registered.clear()
		await new Promise<void>((resolve) => {
			queueMicrotask(() => {
				drain.classifying = false
				resolve()
			})
		})
	}
}

/** The scope opened last, checked for a missing dispose when the next one opens. */
let latestScope: WaitUntilScope | null = null

/**
 * @description Opens the scope for a new test context. If the previous
 * context was never disposed and left work undrained, that work stays
 * undrained, and this says so on stderr rather than letting the new context
 * drain or blame it.
 * @returns the new context's scope
 */
export function openWaitUntilScope(): WaitUntilScope {
	const previous = latestScope
	if (previous && !previous.closed) {
		const origins = previous.undrainedOrigins
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
