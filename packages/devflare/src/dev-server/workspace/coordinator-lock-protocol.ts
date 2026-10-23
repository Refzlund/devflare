/*
	──────────────────────────────────────────────────────────────────────────────
	     The coordinator lock's protocol — what every holder must agree on
	──────────────────────────────────────────────────────────────────────────────
	The pure half of the coordinator lock (`coordinator-lock.ts` is the half that
	takes, holds and releases it): where the lock and its note live, the note's
	exact bytes, what an SQLite error means, how long to wait for a holder, and
	what a refusal says. Another program sharing the lock (uidini's store host)
	must match the paths and the note. Nothing here touches the file system.
*/

/** The environment variable that turns the lock off when set to `0` (or `false`). */
export const COORDINATOR_LOCK_ENV = 'DEVFLARE_PERSIST_LOCK'

/** The role a workspace coordinator writes into its holder note. */
export const COORDINATOR_ROLE = 'coordinator'

/** How long a starting coordinator waits for a holder it cannot identify, or whose process is gone. */
export const UNIDENTIFIED_HOLDER_WAIT_MS = 10_000

/** How long past a holder's own `deadline` a starting coordinator keeps waiting for it. */
export const DEADLINE_GRACE_MS = 10_000

/** The longest a starting coordinator ever waits, whatever a holder's `deadline` says. */
export const MAX_WAIT_MS = 120_000

/** How often a waiting coordinator tries the lock again. */
export const POLL_INTERVAL_MS = 250

/** The holder note — what the lock's holder says about itself. Read only to name it and to choose a wait. */
export interface CoordinatorLockNote {
	/** The holder's process id. */
	pid: number
	/** What the holder is: `coordinator` for devflare, any other name for another program. */
	role: string
	/** When it took the lock, epoch ms. */
	since: number
	/** When the holder means to be finished, epoch ms; a starting coordinator waits for it. */
	deadline?: number
	/** A free-form label the holder may add (another program's own task name). */
	task?: string
	/** The persist directory the lock guards, absolute and forward-slashed. */
	store: string
}

/*
	──────────────────────────────────────────────
	          Paths, the note, the switch
	──────────────────────────────────────────────
*/

/**
 * The lock file of a persist directory.
 *
 * @param persistDir - The persist directory, absolute.
 * @returns `<persistDir>.coordinator.lock` — a sibling, never inside the store.
 */
export function coordinatorLockPath(persistDir: string): string {
	return `${persistDir}.coordinator.lock`
}

/**
 * The holder note of a persist directory.
 *
 * @param persistDir - The persist directory, absolute.
 * @returns `<persistDir>.coordinator.lock.json`.
 */
export function coordinatorLockNotePath(persistDir: string): string {
	return `${persistDir}.coordinator.lock.json`
}

/**
 * Whether the coordinator takes its lock. A programmatic choice wins; otherwise
 * `DEVFLARE_PERSIST_LOCK=0` (or `false`) turns it off, and anything else leaves
 * it on. The caller decides separately that a non-persisting workspace takes none.
 *
 * @param env - The environment to read.
 * @param override - `persistLock` from the programmatic options, when given.
 * @returns true when the lock is to be taken.
 */
export function coordinatorLockEnabled(
	env: Readonly<Record<string, string | undefined>>,
	override?: boolean
): boolean {
	if (override !== undefined) {
		return override
	}
	const value = env[COORDINATOR_LOCK_ENV]?.trim().toLowerCase()
	return value !== '0' && value !== 'false'
}

/**
 * The exact bytes of a holder note: JSON in the field order `pid, role, since,
 * deadline?, task?, store`, and a trailing newline.
 *
 * @param note - The note.
 * @returns Its serialised form.
 */
export function serializeCoordinatorLockNote(note: CoordinatorLockNote): string {
	const ordered: CoordinatorLockNote = {
		pid: note.pid,
		role: note.role,
		since: note.since,
		...(note.deadline === undefined ? {} : { deadline: note.deadline }),
		...(note.task === undefined ? {} : { task: note.task }),
		store: note.store
	}
	return `${JSON.stringify(ordered)}\n`
}

/**
 * Validate a parsed holder note field by field. Any role is accepted: the lock
 * is shared with programs devflare knows nothing about.
 *
 * @param raw - The parsed JSON.
 * @returns A note holding exactly the known fields, or null when any field is
 *   missing or of the wrong shape.
 */
export function parseCoordinatorLockNote(raw: unknown): CoordinatorLockNote | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return null
	}
	const { pid, role, since, deadline, task, store } = raw as Record<string, unknown>

	const valid =
		typeof pid === 'number' &&
		Number.isSafeInteger(pid) &&
		pid > 0 &&
		isNonEmptyString(role) &&
		isEpochMs(since) &&
		(deadline === undefined || isEpochMs(deadline)) &&
		(task === undefined || isNonEmptyString(task)) &&
		isNonEmptyString(store)
	if (!valid) return null

	return {
		pid,
		role,
		since,
		...(deadline === undefined ? {} : { deadline }),
		...(task === undefined ? {} : { task }),
		store
	}
}

/**
 * Whether a value is a string with something in it.
 *
 * @param value - The value.
 * @returns true for a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value !== ''
}

/**
 * Whether a value is a usable epoch-milliseconds timestamp.
 *
 * @param value - The value.
 * @returns true for a finite, non-negative number.
 */
function isEpochMs(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/*
	──────────────────────────────────────────────
	        Reading what SQLite threw
	──────────────────────────────────────────────
	Bun throws `{ code: 'SQLITE_BUSY', errno: 5 }`; Node 22.13+ throws
	`{ code: 'ERR_SQLITE_ERROR', errcode: 5 }`. The message is the fallback, for a
	Node that carries no `errcode`.
*/

/**
 * The primary SQLite result code an error carries, from either runtime's shape.
 *
 * @param error - What a statement threw.
 * @returns The primary code (the low byte of an extended one), or undefined.
 */
function sqlitePrimaryCode(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined
	}
	const { code, errno, errcode } = error as { code?: unknown; errno?: unknown; errcode?: unknown }
	if (typeof errcode === 'number') {
		return errcode & 0xff
	}
	// Bun's `errno` is SQLite's; a Node file-system error's `errno` is negative and has a string `code`.
	if (typeof code === 'string' && code.startsWith('SQLITE_') && typeof errno === 'number') {
		return errno & 0xff
	}
	return undefined
}

/**
 * Whether an error is SQLite's "the database is locked" — another holder has the lock.
 *
 * @param error - What a statement threw.
 * @returns true for SQLITE_BUSY and its extended codes, in Bun's or Node's shape.
 */
export function isSqliteBusy(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false
	}
	const { code, message } = error as { code?: unknown; message?: unknown }
	if (typeof code === 'string' && code.startsWith('SQLITE_BUSY')) {
		return true
	}
	const primary = sqlitePrimaryCode(error)
	if (primary !== undefined) {
		return primary === 5
	}
	// No code at all, or Node's generic one without `errcode`: read the message.
	return (
		(code === undefined || code === 'ERR_SQLITE_ERROR') &&
		typeof message === 'string' &&
		/database is locked/i.test(message)
	)
}

/**
 * Whether an error means the lock file cannot be created or opened at all — as
 * opposed to being held.
 *
 * @param error - What opening or locking threw.
 * @returns true for SQLITE_CANTOPEN / SQLITE_READONLY and EACCES / EROFS / EPERM.
 */
export function isLockFileUnavailable(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false
	}
	const { code } = error as { code?: unknown }
	if (typeof code === 'string') {
		if (code.startsWith('SQLITE_CANTOPEN') || code.startsWith('SQLITE_READONLY')) return true
		if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return true
	}
	const primary = sqlitePrimaryCode(error)
	return primary === 14 || primary === 8
}

/*
	──────────────────────────────────────────────
	    What to do when somebody holds the lock
	──────────────────────────────────────────────
*/

/** The facts {@link decideHeld} decides from. */
export interface HeldLockFacts {
	/** The holder's note, or null when absent or unreadable. */
	note: CoordinatorLockNote | null
	/** Whether the note's pid is a running process (false when there is no note). */
	holderAlive: boolean
	/** When this coordinator began trying, epoch ms. */
	start: number
	/** Now, epoch ms. */
	now: number
}

/** What to do about a held lock: give up now, or try again until `until`. */
export type HeldLockVerdict =
	| {
			action: 'refuse'
			/** `coordinator` — another coordinator serves this dir; `timed-out` — the wait ran out. */
			reason: 'coordinator' | 'timed-out'
	  }
	| {
			action: 'wait'
			/** `deadline` — a live holder that said when it will finish; `unidentified` — anything else. */
			reason: 'deadline' | 'unidentified'
			/** Keep trying until this instant, epoch ms. */
			until: number
	  }

/**
 * Decide what a starting coordinator does about a lock somebody else holds.
 *
 * - a live `coordinator` → refuse at once: two coordinators must never share a store;
 * - a live holder with a `deadline` → wait until `min(deadline + 10 s, start + 120 s)`;
 * - anything else (no note, a dead pid, a live holder without a deadline) → wait 10 s.
 *
 * Re-evaluated on every poll, so a holder that changes mid-wait is judged afresh.
 *
 * @param facts - The note, whether its pid lives, and the clock.
 * @returns The verdict; `refuse` with `timed-out` once `now` reaches the wait's end.
 */
export function decideHeld(facts: HeldLockFacts): HeldLockVerdict {
	const { note, holderAlive, start, now } = facts

	if (note !== null && holderAlive && note.role === COORDINATOR_ROLE) {
		return { action: 'refuse', reason: 'coordinator' }
	}

	const deadline = note !== null && holderAlive ? note.deadline : undefined
	const wait: HeldLockVerdict =
		deadline === undefined
			? { action: 'wait', reason: 'unidentified', until: start + UNIDENTIFIED_HOLDER_WAIT_MS }
			: {
					action: 'wait',
					reason: 'deadline',
					until: Math.min(deadline + DEADLINE_GRACE_MS, start + MAX_WAIT_MS)
				}

	return now >= wait.until ? { action: 'refuse', reason: 'timed-out' } : wait
}

/**
 * A holder note as a person reads it.
 *
 * @param note - The note.
 * @returns e.g. `pid 4242 (role "ops-store-host", since 2026-10-12T09:00:00.000Z, deadline …)`.
 */
export function describeCoordinatorLockHolder(note: CoordinatorLockNote): string {
	const parts = [`role "${note.role}"`, `since ${new Date(note.since).toISOString()}`]
	if (note.deadline !== undefined) parts.push(`deadline ${new Date(note.deadline).toISOString()}`)
	if (note.task !== undefined) parts.push(`task ${note.task}`)
	return `pid ${note.pid} (${parts.join(', ')})`
}

/**
 * The message of a refusal because somebody holds the lock.
 *
 * @param input - The verdict's reason, the note, whether its pid lives, the paths, and how long was waited.
 * @returns A message that names the holder (or says none could be named) and the lock path.
 */
export function heldLockMessage(input: {
	reason: 'coordinator' | 'timed-out'
	note: CoordinatorLockNote | null
	holderAlive: boolean
	lockPath: string
	persistDir: string
	waitedMs: number
}): string {
	const { reason, note, holderAlive, lockPath, persistDir, waitedMs } = input
	const waited = `${Math.round(waitedMs / 100) / 10}s`

	if (reason === 'coordinator' && note) {
		return (
			`Another devflare workspace coordinator already serves ${persistDir}: ` +
			`${describeCoordinatorLockHolder(note)}. Lock: ${lockPath}. ` +
			'Only one coordinator may use a persist directory at a time; stop that one first.'
		)
	}

	if (note && holderAlive) {
		return (
			`The coordinator lock for ${persistDir} is still held after waiting ${waited}, by ` +
			`${describeCoordinatorLockHolder(note)}. Lock: ${lockPath}. ` +
			'Stop that process, or let it finish, then start again.'
		)
	}

	const who = note
		? `its holder note names ${describeCoordinatorLockHolder(note)}, which is not running`
		: 'there is no readable holder note'
	return (
		`The coordinator lock for ${persistDir} is held by an unidentified holder after waiting ` +
		`${waited} (${who}). Lock: ${lockPath}. Some process holds an SQLite lock on that file; stop it ` +
		'and start again. If none does, the filesystem may not support the byte-range locks devflare ' +
		'relies on (broken fcntl: WSL2 /mnt/c, SMB/NFS shares, Docker bind mounts) — move the persist ' +
		`directory to a local disk, or set ${COORDINATOR_LOCK_ENV}=0 to run without the lock.`
	)
}
