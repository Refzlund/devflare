/*
	──────────────────────────────────────────────────────────────────────────────
	      The coordinator lock — one workspace coordinator per persist dir
	──────────────────────────────────────────────────────────────────────────────
	`devflare workspace dev` persists every app's D1/KV/R2/DO state into ONE
	directory. Two coordinators writing that directory at once corrupt it, so the
	coordinator takes an OS-level lock on `<persistDir>.coordinator.lock` before it
	opens anything, and holds it for its whole life.

	The lock is an EXCLUSIVE SQLite lock on a file used for nothing else: opened
	with `busy_timeout=0` and `journal_mode=DELETE`, then `BEGIN EXCLUSIVE`, the
	transaction held open and never committed. That is `LockFileEx` on Windows and
	`fcntl` elsewhere, so the OS releases it when the holder dies, however it dies.
	A holder note, `<persistDir>.coordinator.lock.json`, says who holds it. The note
	is for MESSAGES and for choosing how long to wait; the OS lock is the truth.

	This file takes, holds and releases the lock. Its pure half (the paths, the
	note's bytes, what an error means, the waits and the messages) is
	`coordinator-lock-protocol.ts`.

	Any program may take the same lock to keep a coordinator out while it works on
	the persist dir itself (an offline maintenance tool, say). Such a holder writes
	its own note, with a `deadline` if it means to finish by one, and a starting
	coordinator waits for it rather than refusing at once.

	→ KEY: SQLITE_BUSY is the ONLY answer that means "somebody holds it". Every
	  other error propagates: reading an I/O error as "free" or as "held" would be
	  a guess about whether two processes open one store.
	→ GOTCHA: Bun and Node both CLOSE a SQLite connection when its object is
	  garbage-collected, which ends the transaction and frees the lock (measured:
	  another process took it within half a second). So every held connection is
	  pinned in a module-level set until it is released — a local that goes out of
	  scope, or even a module-level `const` no function reads, is not enough.
	→ GOTCHA: SQLite opens a file it cannot write READ-ONLY without saying so,
	  and on such a connection `BEGIN EXCLUSIVE` still succeeds while excluding
	  nobody (measured). So a lock file that exists must pass a W_OK check first.
	  Neither runtime's API says whether a connection fell back, so a write
	  denied by an ACL the W_OK check cannot see remains a residual.
	→ GOTCHA: a crash frees the lock, but it is NOT a safety property. workerd is
	  spawned non-detached and without a job object, so a hard-killed coordinator
	  can leave a workerd running with the store still open after the lock is free.
*/

import {
	accessSync,
	constants,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { dirname } from 'pathe'
import {
	COORDINATOR_LOCK_ENV,
	COORDINATOR_ROLE,
	type CoordinatorLockNote,
	coordinatorLockNotePath,
	coordinatorLockPath,
	decideHeld,
	describeCoordinatorLockHolder,
	heldLockMessage,
	isLockFileUnavailable,
	isSqliteBusy,
	POLL_INTERVAL_MS,
	parseCoordinatorLockNote,
	serializeCoordinatorLockNote
} from './coordinator-lock-protocol'

/** A coordinator lock this process holds. */
export interface HeldCoordinatorLock {
	/** The lock file. */
	readonly lockPath: string
	/** The note written for it. */
	readonly note: CoordinatorLockNote
	/** Remove the note if it is still this holder's, then release the OS lock. Idempotent. */
	release(): void
}

/** Why {@link acquireCoordinatorLock} did not take the lock. */
export type CoordinatorLockErrorCode =
	/** Another holder has it, and waiting is pointless or has run out. */
	| 'DEVFLARE_COORDINATOR_LOCK_HELD'
	/** The wait was aborted, because the coordinator is stopping. */
	| 'DEVFLARE_COORDINATOR_LOCK_ABORTED'
	/** The lock file cannot be created or opened at all. */
	| 'DEVFLARE_COORDINATOR_LOCK_UNAVAILABLE'
	/** Locking or writing the note failed some other way (an I/O error, broken locking). */
	| 'DEVFLARE_COORDINATOR_LOCK_FAILED'

/** A refusal to start a coordinator because of its lock. The message is meant for a person, whole. */
export class CoordinatorLockError extends Error {
	/** Why the lock was not taken. */
	readonly code: CoordinatorLockErrorCode
	/** The lock file. */
	readonly lockPath: string
	/** The holder's note, when one was readable. */
	readonly holder: CoordinatorLockNote | null

	constructor(
		code: CoordinatorLockErrorCode,
		message: string,
		details: { lockPath: string; holder?: CoordinatorLockNote | null; cause?: unknown }
	) {
		super(message, details.cause === undefined ? undefined : { cause: details.cause })
		this.name = 'CoordinatorLockError'
		this.code = code
		this.lockPath = details.lockPath
		this.holder = details.holder ?? null
	}
}

/*
	──────────────────────────────────────────────
	     Taking, holding and releasing the lock
	──────────────────────────────────────────────
*/

/** The two statements a lock connection needs, over either runtime's SQLite. */
interface LockConnection {
	exec(sql: string): void
	close(): void
}

/** One attempt to take the lock: taken, held by somebody, or impossible on this runtime. */
export type CoordinatorLockAttempt =
	| { kind: 'taken'; held: HeldCoordinatorLock }
	| { kind: 'held'; note: CoordinatorLockNote | null }
	| { kind: 'unsupported'; reason: string }

/**
 * Every held connection, pinned so the garbage collector cannot close it (and
 * free the lock) while its holder still runs. Removed on release.
 */
const pinnedLocks = new Set<HeldCoordinatorLock>()

/**
 * Open a connection to the lock file with whichever SQLite this runtime has.
 * Both imports are DYNAMIC, so loading devflare under Node never reaches for
 * `bun:sqlite`, and a Node without `node:sqlite` still loads devflare.
 *
 * @param lockPath - The lock file; created if absent.
 * @returns The connection, or `unsupported` on a Node with no `node:sqlite` (below 22.13).
 * @throws whatever opening threw, for anything but a missing `node:sqlite`.
 */
async function openLockConnection(
	lockPath: string
): Promise<LockConnection | { unsupported: string }> {
	if (process.versions.bun !== undefined) {
		const { Database } = await import('bun:sqlite')
		const db = new Database(lockPath, { create: true, readwrite: true })
		return { exec: (sql) => db.run(sql), close: () => db.close() }
	}

	let sqlite: typeof import('node:sqlite')
	try {
		sqlite = await import('node:sqlite')
	} catch (error) {
		// RECOVER only "this Node has no node:sqlite"; anything else is not ours to read.
		const code = (error as { code?: unknown } | null)?.code
		if (code === 'ERR_UNKNOWN_BUILTIN_MODULE' || code === 'ERR_UNKNOWN_BUILTIN') {
			return { unsupported: `node:sqlite is not available in Node ${process.versions.node}` }
		}
		throw error
	}
	const db = new sqlite.DatabaseSync(lockPath)
	return { exec: (sql) => db.exec(sql), close: () => db.close() }
}

/** How to run without the lock, for every message that cannot be acted on otherwise. */
const OPT_OUT_HINT =
	`To run without the lock, set ${COORDINATOR_LOCK_ENV}=0, or pass ` +
	'`persistLock: false` to createWorkspaceDevServer.'

/**
 * Where the lock lives, for messages: beside the persist dir, so in its PARENT.
 *
 * @param lockPath - The lock file.
 * @returns A sentence naming the directory the lock file is written into.
 */
function placementNote(lockPath: string): string {
	return (
		`The lock file sits beside the persist directory, so it is written into ${dirname(lockPath)}, ` +
		'which must be writable.'
	)
}

/**
 * The refusal for a lock file that cannot be opened for writing.
 *
 * @param lockPath - The lock file.
 * @param error - What opening or the writability check threw.
 * @returns The `UNAVAILABLE` error, with `error` as its cause.
 */
function unavailableError(lockPath: string, error: unknown): CoordinatorLockError {
	return new CoordinatorLockError(
		'DEVFLARE_COORDINATOR_LOCK_UNAVAILABLE',
		`Cannot open the coordinator lock ${lockPath} for writing: ${(error as Error).message}. ` +
			'devflare locks the persist directory so only one workspace coordinator writes it. ' +
			`${placementNote(lockPath)} ${OPT_OUT_HINT}`,
		{ lockPath, cause: error }
	)
}

/**
 * Prove an existing lock file is writable. SQLite would otherwise open it
 * read-only, silently, and a read-only `BEGIN EXCLUSIVE` locks nothing. An
 * absent file is created read-write by SQLite itself.
 *
 * → GOTCHA: a check by `access`, never by opening the file: on POSIX, closing
 *   ANY descriptor of a file drops every `fcntl` lock this process holds on it,
 *   which would free a lock this process already holds for another server.
 *
 * @param lockPath - The lock file.
 * @throws {CoordinatorLockError} `UNAVAILABLE` when it exists and is not writable.
 */
function assertLockFileWritable(lockPath: string): void {
	if (!existsSync(lockPath)) return
	try {
		accessSync(lockPath, constants.W_OK)
	} catch (error) {
		throw unavailableError(lockPath, error)
	}
}

/**
 * Try ONCE to take the lock, never waiting; on success write the holder note.
 *
 * @param lockPath - The lock file; its directory is created if absent.
 * @param notePath - The holder note's path.
 * @param note - The note to write once the lock is held.
 * @returns taken, held (with whatever note was readable), or unsupported.
 * @throws {CoordinatorLockError} `UNAVAILABLE` when the lock file exists but is
 *   not writable; `FAILED` when the note cannot be written (after the lock is
 *   released, so a holder is never anonymous by accident). Otherwise whatever
 *   SQLite or the file system threw, for anything but SQLITE_BUSY — the
 *   connection is closed first.
 */
export async function tryTakeCoordinatorLock(
	lockPath: string,
	notePath: string,
	note: CoordinatorLockNote
): Promise<CoordinatorLockAttempt> {
	mkdirSync(dirname(lockPath), { recursive: true })
	assertLockFileWritable(lockPath)
	const opened = await openLockConnection(lockPath)
	if ('unsupported' in opened) {
		return { kind: 'unsupported', reason: opened.unsupported }
	}
	const connection = opened

	try {
		// The order is load-bearing: `busy_timeout` first, so neither later step waits for a holder.
		connection.exec('PRAGMA busy_timeout=0')
		connection.exec('PRAGMA journal_mode=DELETE')
		connection.exec('BEGIN EXCLUSIVE')
	} catch (error) {
		connection.close()
		if (isSqliteBusy(error)) {
			return { kind: 'held', note: readCoordinatorLockNote(notePath) }
		}
		throw error
	}

	try {
		writeNoteAtomically(notePath, note)
	} catch (error) {
		connection.close()
		throw new CoordinatorLockError(
			'DEVFLARE_COORDINATOR_LOCK_FAILED',
			`Took the coordinator lock ${lockPath} but could not write its holder note ${notePath}: ` +
				`${(error as Error).message}. The lock was released again. ${OPT_OUT_HINT}`,
			{ lockPath, cause: error }
		)
	}
	return { kind: 'taken', held: pinHeldLock(lockPath, notePath, connection, note) }
}

/**
 * Wrap an open lock connection as the held lock a caller releases, and pin it.
 *
 * @param lockPath - The lock file.
 * @param notePath - The holder note's path.
 * @param connection - The connection holding `BEGIN EXCLUSIVE`.
 * @param note - The note this holder wrote.
 * @returns The held lock; `release` unpins it, removes the note if still this
 *   holder's, and closes the connection — which ends the transaction and frees the lock.
 */
function pinHeldLock(
	lockPath: string,
	notePath: string,
	connection: LockConnection,
	note: CoordinatorLockNote
): HeldCoordinatorLock {
	let released = false
	const held: HeldCoordinatorLock = {
		lockPath,
		note,
		release() {
			if (released) return
			released = true
			pinnedLocks.delete(held)
			// The connection closes even when the note cannot be removed, so release never leaves the lock held.
			try {
				removeNoteIfOwn(notePath, note)
			} finally {
				connection.close()
			}
		}
	}
	pinnedLocks.add(held)
	return held
}

/**
 * Read a holder note.
 *
 * @param notePath - The note's path.
 * @returns The note, or null when absent, momentarily unreadable, or not a note.
 * @throws a file-system error other than "absent" or "unreadable for now".
 */
export function readCoordinatorLockNote(notePath: string): CoordinatorLockNote | null {
	let text: string
	try {
		text = readFileSync(notePath, 'utf8')
	} catch (error) {
		// RECOVER to "no readable note", which every caller treats as an unidentified holder — the cautious reading.
		const code = (error as NodeJS.ErrnoException).code
		if (code === 'ENOENT' || code === 'EISDIR' || isTransientFileError(error)) return null
		throw error
	}
	try {
		return parseCoordinatorLockNote(JSON.parse(text))
	} catch {
		// RECOVER: text that is not JSON is not a note, and "not a note" is what null says.
		return null
	}
}

/**
 * Write a note through a temp file and a rename, so a reader sees the old note or the new one.
 *
 * @param target - The note's path.
 * @param note - The note.
 * @throws the file system's error when the temp file cannot be written or the rename keeps failing.
 */
function writeNoteAtomically(target: string, note: CoordinatorLockNote): void {
	const temp = `${target}.${process.pid}.${Date.now()}.tmp`
	writeFileSync(temp, serializeCoordinatorLockNote(note))

	/*
		→ GOTCHA: on Windows a rename over a file another process has open fails
		  with EPERM/EBUSY for the moment that reader holds it, and waiters read
		  this note every poll. So a few short retries, then the error.
	*/
	for (let attempt = 1; ; attempt++) {
		try {
			renameSync(temp, target)
			return
		} catch (error) {
			if (attempt < 5 && isTransientFileError(error)) {
				sleepSync(20)
				continue
			}
			rmSync(temp, { force: true })
			throw error
		}
	}
}

/**
 * Remove the holder note, but only if it still names this holder.
 *
 * @param notePath - The note's path.
 * @param note - The note this holder wrote.
 */
function removeNoteIfOwn(notePath: string, note: CoordinatorLockNote): void {
	const current = readCoordinatorLockNote(notePath)
	// pid AND since: one process can hold the lock twice in sequence, and only its own note is its own.
	if (current?.pid !== note.pid || current.since !== note.since) return
	rmSync(notePath, { force: true })
}

/**
 * Whether a file-system error is one Windows raises for a moment while another process holds the file.
 *
 * @param error - What the call threw.
 * @returns true for EPERM, EACCES and EBUSY.
 */
function isTransientFileError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code
	return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
}

/**
 * Block the thread briefly, in either runtime.
 *
 * @param ms - How long.
 */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/*
	──────────────────────────────────────────────
	          Acquiring, with the waits
	──────────────────────────────────────────────
*/

/** The effects {@link acquireCoordinatorLock} performs, injectable for tests. */
export interface CoordinatorLockIo {
	/** One attempt at the lock. */
	tryTake(
		lockPath: string,
		notePath: string,
		note: CoordinatorLockNote
	): Promise<CoordinatorLockAttempt>
	/** Whether a pid is a running process. */
	alive(pid: number): boolean
	/** Now, epoch ms. */
	now(): number
	/** Wait, rejecting early when the signal aborts. */
	sleep(ms: number, signal?: AbortSignal): Promise<void>
}

/** Options for {@link acquireCoordinatorLock}. */
export interface AcquireCoordinatorLockOptions {
	/** The persist directory, absolute; the lock and its note sit beside it. */
	persistDir: string
	/** The role to write into the note (default `coordinator`). */
	role?: string
	/** When this holder means to be finished, epoch ms — written into the note so a coordinator waits for it. */
	deadline?: number
	/** Aborts a wait in progress; an abort that lands just after the take releases the lock again. */
	signal?: AbortSignal
	/** Where the wait and the unsupported-runtime warning are reported. */
	logger?: { info(message: string): void; warn(message: string): void }
	/** Replacements for the real effects. */
	io?: Partial<CoordinatorLockIo>
}

/** Whether the unsupported-runtime warning has been shown in this process. */
let warnedUnsupported = false

/** The real effects. */
const defaultIo: CoordinatorLockIo = {
	tryTake: tryTakeCoordinatorLock,
	alive: (pid) => {
		try {
			process.kill(pid, 0)
			return true
		} catch (error) {
			// EPERM: the process exists but belongs to someone else — it is alive.
			return (error as NodeJS.ErrnoException).code === 'EPERM'
		}
	},
	now: () => Date.now(),
	sleep: (ms, signal) =>
		new Promise<void>((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason)
				return
			}
			const onAbort = () => {
				clearTimeout(timer)
				reject(signal?.reason)
			}
			const timer = setTimeout(() => {
				signal?.removeEventListener('abort', onAbort)
				resolve()
			}, ms)
			signal?.addEventListener('abort', onAbort, { once: true })
		})
}

/**
 * One attempt at the lock, with every error turned into a refusal a person can
 * act on: the lock path, where it lives, and the opt-out.
 *
 * @param io - The effects.
 * @param lockPath - The lock file.
 * @param notePath - The holder note's path.
 * @param note - The note to write once taken.
 * @returns The attempt.
 * @throws {CoordinatorLockError} `UNAVAILABLE` for a file that cannot be opened
 *   for writing; `FAILED`, with the original as `cause`, for anything else.
 */
async function attemptOnce(
	io: CoordinatorLockIo,
	lockPath: string,
	notePath: string,
	note: CoordinatorLockNote
): Promise<CoordinatorLockAttempt> {
	try {
		return await io.tryTake(lockPath, notePath, note)
	} catch (error) {
		if (error instanceof CoordinatorLockError) throw error
		if (isLockFileUnavailable(error)) throw unavailableError(lockPath, error)
		// PROPAGATE, enriched: a bare "disk I/O error" would name neither the lock nor the way out.
		throw new CoordinatorLockError(
			'DEVFLARE_COORDINATOR_LOCK_FAILED',
			`Locking ${lockPath} failed: ${(error as Error).message}. ${placementNote(lockPath)} ` +
				'On a filesystem with unreliable locks (WSL2 /mnt/c, SMB/NFS, Docker bind mounts), move ' +
				`the persist directory to a local disk. ${OPT_OUT_HINT}`,
			{ lockPath, cause: error }
		)
	}
}

/**
 * Say, once per process, that this runtime cannot lock and the coordinator runs unlocked.
 *
 * @param reason - Why there is no SQLite to lock with.
 * @param persistDir - The persist directory left unguarded.
 * @param logger - Where to say it; `console.warn` when absent.
 */
function warnUnsupportedOnce(
	reason: string,
	persistDir: string,
	logger: AcquireCoordinatorLockOptions['logger']
): void {
	if (warnedUnsupported) return
	warnedUnsupported = true
	const message =
		`${reason}, so the workspace coordinator runs WITHOUT its lock on ${persistDir}; ` +
		'nothing stops a second coordinator from opening the same store. Use Node 22.13+ or Bun.'
	if (logger) logger.warn(message)
	else console.warn(message)
}

/**
 * The refusal for a wait that a stop aborted.
 *
 * @param lockPath - The lock file.
 * @returns The `ABORTED` error.
 */
function abortedError(lockPath: string): CoordinatorLockError {
	return new CoordinatorLockError(
		'DEVFLARE_COORDINATOR_LOCK_ABORTED',
		`Stopped while waiting for the coordinator lock ${lockPath}.`,
		{ lockPath }
	)
}

/**
 * Judge a held lock: how much longer to wait, or the refusal.
 *
 * @param note - The holder note read at the failed attempt.
 * @param io - The effects (`alive`, `now`).
 * @param start - When acquisition began, epoch ms.
 * @param lockPath - The lock file, for the message.
 * @param persistDir - The persist dir, for the message.
 * @returns How long the wait may still run, in ms.
 * @throws {CoordinatorLockError} `HELD`, naming the holder, when {@link decideHeld} refuses.
 */
function waitOrRefuse(
	note: CoordinatorLockNote | null,
	io: CoordinatorLockIo,
	start: number,
	lockPath: string,
	persistDir: string
): { remainingMs: number } {
	const holderAlive = note !== null && io.alive(note.pid)
	const now = io.now()
	const verdict = decideHeld({ note, holderAlive, start, now })
	if (verdict.action === 'wait') return { remainingMs: verdict.until - now }

	throw new CoordinatorLockError(
		'DEVFLARE_COORDINATOR_LOCK_HELD',
		heldLockMessage({
			reason: verdict.reason,
			note,
			holderAlive,
			lockPath,
			persistDir,
			waitedMs: now - start
		}),
		{ lockPath, holder: note }
	)
}

/**
 * Sleep between attempts, turning an abort into the `ABORTED` refusal.
 *
 * @param io - The effects (`sleep`).
 * @param ms - How long.
 * @param signal - The stop signal.
 * @param lockPath - The lock file, for the message.
 * @throws {CoordinatorLockError} `ABORTED` when the signal fires; anything else the sleep threw.
 */
async function sleepUnlessAborted(
	io: CoordinatorLockIo,
	ms: number,
	signal: AbortSignal | undefined,
	lockPath: string
): Promise<void> {
	try {
		await io.sleep(ms, signal)
	} catch (error) {
		if (signal?.aborted) throw abortedError(lockPath)
		throw error
	}
}

/**
 * The note a holder writes once it has the lock.
 *
 * @param options - The role and deadline asked for.
 * @param since - When the attempt is made, epoch ms.
 * @returns The note, for this process.
 */
function noteToWrite(options: AcquireCoordinatorLockOptions, since: number): CoordinatorLockNote {
	return {
		pid: process.pid,
		role: options.role ?? COORDINATOR_ROLE,
		since,
		...(options.deadline === undefined ? {} : { deadline: options.deadline }),
		store: options.persistDir
	}
}

/**
 * The line a coordinator prints once when it starts waiting.
 *
 * @param lockPath - The lock file.
 * @param note - The holder's note, or null.
 * @param remainingMs - How long the wait may run.
 * @returns The line.
 */
function waitAnnouncement(
	lockPath: string,
	note: CoordinatorLockNote | null,
	remainingMs: number
): string {
	const who = note ? describeCoordinatorLockHolder(note) : 'an unidentified holder'
	return `Coordinator lock ${lockPath} is held by ${who}; waiting up to ${Math.ceil(remainingMs / 1000)}s…`
}

/**
 * Take the coordinator lock of a persist directory, waiting as {@link decideHeld} rules.
 *
 * @param options - The persist dir, the role and deadline to write, an abort signal, a logger, and test effects.
 * @returns The held lock, or null when this runtime has no SQLite to lock with (a
 *   Node below 22.13) — warned once per process, and the coordinator runs unlocked.
 * @throws {CoordinatorLockError} `HELD` when another coordinator serves the dir or
 *   the wait ran out; `ABORTED` when the signal aborted; `UNAVAILABLE` when the
 *   lock file cannot be created or opened for writing; `FAILED`, carrying the
 *   original as `cause`, for any other error while locking.
 */
export async function acquireCoordinatorLock(
	options: AcquireCoordinatorLockOptions
): Promise<HeldCoordinatorLock | null> {
	const io = { ...defaultIo, ...options.io }
	const { persistDir, signal, logger } = options
	const lockPath = coordinatorLockPath(persistDir)
	const notePath = coordinatorLockNotePath(persistDir)
	const start = io.now()
	let announcedWait = false

	for (;;) {
		if (signal?.aborted) throw abortedError(lockPath)

		const attempt = await attemptOnce(io, lockPath, notePath, noteToWrite(options, io.now()))
		if (attempt.kind === 'unsupported') {
			warnUnsupportedOnce(attempt.reason, persistDir, logger)
			return null
		}
		if (attempt.kind === 'taken') {
			// A stop that landed during the attempt wins: never hand back a lock nobody will release.
			if (!signal?.aborted) return attempt.held
			attempt.held.release()
			throw abortedError(lockPath)
		}

		const wait = waitOrRefuse(attempt.note, io, start, lockPath, persistDir)
		if (!announcedWait) {
			announcedWait = true
			logger?.info(waitAnnouncement(lockPath, attempt.note, wait.remainingMs))
		}
		await sleepUnlessAborted(io, Math.min(POLL_INTERVAL_MS, wait.remainingMs), signal, lockPath)
	}
}
