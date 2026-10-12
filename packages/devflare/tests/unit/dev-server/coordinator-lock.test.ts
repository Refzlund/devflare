/*
	The coordinator lock's pure parts, and acquireCoordinatorLock's waits on an
	injected clock. Every refusal against a holder in ANOTHER process lives in
	`tests/integration/dev-server/coordinator-lock.test.ts`; the one real lock
	here is taken and refused inside this process, which is all a unit can show.
*/
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	acquireCoordinatorLock,
	type CoordinatorLockAttempt,
	type CoordinatorLockError,
	type CoordinatorLockIo
} from '../../../src/dev-server/workspace/coordinator-lock'
import {
	type CoordinatorLockNote,
	coordinatorLockEnabled,
	coordinatorLockNotePath,
	coordinatorLockPath,
	decideHeld,
	type HeldLockVerdict,
	heldLockMessage,
	isLockFileUnavailable,
	isSqliteBusy,
	parseCoordinatorLockNote,
	serializeCoordinatorLockNote
} from '../../../src/dev-server/workspace/coordinator-lock-protocol'

const SINCE = Date.UTC(2026, 9, 12, 9, 0, 0)
const STORE = 'C:/work/app/.devflare/workspace-data'

const tempDirs: string[] = []
afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A note with the given overrides. */
function note(overrides: Partial<CoordinatorLockNote> = {}): CoordinatorLockNote {
	return { pid: 4242, role: 'coordinator', since: SINCE, store: STORE, ...overrides }
}

describe('paths and the switch', () => {
	test('the lock and its note sit BESIDE the persist dir, never inside it', () => {
		expect(coordinatorLockPath(STORE)).toBe(`${STORE}.coordinator.lock`)
		expect(coordinatorLockNotePath(STORE)).toBe(`${STORE}.coordinator.lock.json`)
	})

	test('on by default; DEVFLARE_PERSIST_LOCK=0 or false turns it off; a programmatic choice wins', () => {
		expect(coordinatorLockEnabled({})).toBe(true)
		expect(coordinatorLockEnabled({ DEVFLARE_PERSIST_LOCK: '1' })).toBe(true)
		expect(coordinatorLockEnabled({ DEVFLARE_PERSIST_LOCK: '0' })).toBe(false)
		expect(coordinatorLockEnabled({ DEVFLARE_PERSIST_LOCK: ' False ' })).toBe(false)
		expect(coordinatorLockEnabled({}, false)).toBe(false)
		expect(coordinatorLockEnabled({ DEVFLARE_PERSIST_LOCK: '0' }, true)).toBe(true)
	})
})

describe('the holder note', () => {
	test('serialises to exact bytes, in uidini store-lock field order, with a trailing newline', () => {
		expect(serializeCoordinatorLockNote(note())).toBe(
			`{"pid":4242,"role":"coordinator","since":${SINCE},"store":"${STORE}"}\n`
		)
		const host = note({ role: 'ops-store-host', deadline: SINCE + 60_000, task: 'lane-x' })
		// Fields given out of order still serialise in the protocol's order.
		const shuffled = {
			store: host.store,
			task: host.task,
			deadline: host.deadline,
			since: SINCE,
			role: host.role,
			pid: 4242
		}
		expect(serializeCoordinatorLockNote(shuffled)).toBe(
			`{"pid":4242,"role":"ops-store-host","since":${SINCE},"deadline":${SINCE + 60_000},"task":"lane-x","store":"${STORE}"}\n`
		)
	})

	test('parses any role, so a note from another program names its holder', () => {
		for (const role of ['coordinator', 'ops-store-host', 'dev', 'lane-dev', 'something-else']) {
			expect(parseCoordinatorLockNote({ ...note(), role })).toEqual(note({ role }))
		}
		expect(
			parseCoordinatorLockNote(JSON.parse(serializeCoordinatorLockNote(note({ deadline: 5 }))))
		).toEqual(note({ deadline: 5 }))
	})

	test('rejects a malformed note field by field', () => {
		const bad: unknown[] = [
			null,
			[],
			'note',
			{ ...note(), pid: 0 },
			{ ...note(), pid: 1.5 },
			{ ...note(), pid: '42' },
			{ ...note(), role: '' },
			{ ...note(), role: 7 },
			{ ...note(), since: -1 },
			{ ...note(), since: Number.NaN },
			{ ...note(), deadline: 'soon' },
			{ ...note(), task: '' },
			{ ...note(), store: '' },
			{ pid: 1, role: 'coordinator', since: 1 }
		]
		for (const raw of bad) expect(parseCoordinatorLockNote(raw)).toBeNull()
	})
})

describe('reading what SQLite threw', () => {
	test('BUSY in Bun shape, Node shape, extended codes, and by message where Node carries no errcode', () => {
		expect(isSqliteBusy({ code: 'SQLITE_BUSY', errno: 5, message: 'database is locked' })).toBe(
			true
		)
		expect(isSqliteBusy({ code: 'SQLITE_BUSY_RECOVERY', errno: 261 })).toBe(true)
		expect(
			isSqliteBusy({ code: 'ERR_SQLITE_ERROR', errcode: 5, errstr: 'database is locked' })
		).toBe(true)
		expect(isSqliteBusy({ code: 'ERR_SQLITE_ERROR', errcode: 261 })).toBe(true)
		expect(isSqliteBusy({ code: 'ERR_SQLITE_ERROR', message: 'database is locked' })).toBe(true)
	})

	test('nothing else is BUSY — an open failure least of all', () => {
		expect(isSqliteBusy({ code: 'SQLITE_CANTOPEN', errno: 14 })).toBe(false)
		expect(
			isSqliteBusy({
				code: 'ERR_SQLITE_ERROR',
				errcode: 14,
				message: 'unable to open database file'
			})
		).toBe(false)
		// A Node file-system error's errno is not SQLite's.
		expect(isSqliteBusy({ code: 'EACCES', errno: -4091, message: 'permission denied' })).toBe(false)
		// No code at all (a Node whose sqlite error carries none): the message decides.
		expect(isSqliteBusy(new Error('database is locked'))).toBe(true)
		// A code that is not SQLite's is never read by its message.
		expect(isSqliteBusy({ code: 'EBUSY', message: 'database is locked' })).toBe(false)
		expect(isSqliteBusy(undefined)).toBe(false)
	})

	test('an unopenable lock file is told apart from a held one', () => {
		expect(isLockFileUnavailable({ code: 'SQLITE_CANTOPEN', errno: 14 })).toBe(true)
		expect(isLockFileUnavailable({ code: 'ERR_SQLITE_ERROR', errcode: 14 })).toBe(true)
		expect(isLockFileUnavailable({ code: 'SQLITE_READONLY', errno: 8 })).toBe(true)
		expect(isLockFileUnavailable({ code: 'ERR_SQLITE_ERROR', errcode: 8 })).toBe(true)
		for (const code of ['EACCES', 'EROFS', 'EPERM'])
			expect(isLockFileUnavailable({ code })).toBe(true)
		expect(isLockFileUnavailable({ code: 'SQLITE_BUSY', errno: 5 })).toBe(false)
		expect(isLockFileUnavailable({ code: 'ENOSPC' })).toBe(false)
	})
})

describe('decideHeld', () => {
	const start = 1_000_000

	test('a live coordinator is refused at once', () => {
		expect(decideHeld({ note: note(), holderAlive: true, start, now: start })).toEqual({
			action: 'refuse',
			reason: 'coordinator'
		})
	})

	test('a live holder with a deadline is waited for until deadline + 10 s', () => {
		const verdict = decideHeld({
			note: note({ role: 'ops-store-host', deadline: start + 30_000 }),
			holderAlive: true,
			start,
			now: start
		})
		expect(verdict).toEqual({ action: 'wait', reason: 'deadline', until: start + 40_000 })
	})

	test('…but never past start + 120 s, whatever the deadline says', () => {
		const verdict = decideHeld({
			note: note({ role: 'ops-store-host', deadline: start + 3_600_000 }),
			holderAlive: true,
			start,
			now: start
		})
		expect(verdict).toEqual({ action: 'wait', reason: 'deadline', until: start + 120_000 })
	})

	test("no note, a dead pid (even a coordinator's), or a live holder without a deadline: 10 s", () => {
		const tenSeconds: HeldLockVerdict = {
			action: 'wait',
			reason: 'unidentified',
			until: start + 10_000
		}
		expect(decideHeld({ note: null, holderAlive: false, start, now: start })).toEqual(tenSeconds)
		expect(decideHeld({ note: note(), holderAlive: false, start, now: start })).toEqual(tenSeconds)
		expect(
			decideHeld({
				note: note({ role: 'ops-store-host', deadline: start + 30_000 }),
				holderAlive: false,
				start,
				now: start
			})
		).toEqual(tenSeconds)
		expect(
			decideHeld({ note: note({ role: 'dev' }), holderAlive: true, start, now: start })
		).toEqual(tenSeconds)
	})

	test('the wait ends exactly at `until`', () => {
		expect(decideHeld({ note: null, holderAlive: false, start, now: start + 9_999 }).action).toBe(
			'wait'
		)
		expect(decideHeld({ note: null, holderAlive: false, start, now: start + 10_000 })).toEqual({
			action: 'refuse',
			reason: 'timed-out'
		})
	})

	test('re-judged per poll: a holder that becomes a coordinator mid-wait is refused then', () => {
		expect(decideHeld({ note: note(), holderAlive: true, start, now: start + 5_000 }).action).toBe(
			'refuse'
		)
	})
})

describe('refusal messages', () => {
	const lockPath = coordinatorLockPath(STORE)

	test('name the pid, role, since, deadline and the lock path', () => {
		const host = note({ role: 'ops-store-host', deadline: SINCE + 60_000 })
		const message = heldLockMessage({
			reason: 'timed-out',
			note: host,
			holderAlive: true,
			lockPath,
			persistDir: STORE,
			waitedMs: 70_000
		})
		for (const fragment of [
			'pid 4242',
			'role "ops-store-host"',
			`since ${new Date(SINCE).toISOString()}`,
			`deadline ${new Date(SINCE + 60_000).toISOString()}`,
			lockPath
		]) {
			expect(message).toContain(fragment)
		}

		const coordinator = heldLockMessage({
			reason: 'coordinator',
			note: note(),
			holderAlive: true,
			lockPath,
			persistDir: STORE,
			waitedMs: 0
		})
		expect(coordinator).toContain('Another devflare workspace coordinator')
		expect(coordinator).toContain('pid 4242 (role "coordinator"')
		expect(coordinator).toContain(lockPath)
	})

	test('with no usable note, it names the filesystem as a possible cause and the opt-out', () => {
		for (const n of [null, note()]) {
			const message = heldLockMessage({
				reason: 'timed-out',
				note: n,
				holderAlive: false,
				lockPath,
				persistDir: STORE,
				waitedMs: 10_000
			})
			expect(message).toContain('unidentified holder')
			expect(message).toContain('WSL2 /mnt/c')
			expect(message).toContain('SMB/NFS')
			expect(message).toContain('Docker')
			expect(message).toContain('DEVFLARE_PERSIST_LOCK=0')
			expect(message).toContain(lockPath)
		}
	})
})

/*
	──────────────────────────────────────────────
	   acquireCoordinatorLock on an injected clock
	──────────────────────────────────────────────
*/

/** Effects whose clock advances only when the code sleeps; attempts come from a script. */
function scriptedIo(
	attempts: Array<CoordinatorLockAttempt | (() => CoordinatorLockAttempt)>,
	alive = true
) {
	let clock = 1_000_000
	const sleeps: number[] = []
	let tries = 0
	const io: CoordinatorLockIo = {
		tryTake: async () => {
			const next = attempts[Math.min(tries, attempts.length - 1)]
			tries++
			return typeof next === 'function' ? next() : next
		},
		alive: () => alive,
		now: () => clock,
		sleep: async (ms, signal) => {
			if (signal?.aborted) throw signal.reason
			sleeps.push(ms)
			clock += ms
		}
	}
	return { io, sleeps, tries: () => tries, now: () => clock }
}

/** A held lock that records its release. */
function fakeHeld() {
	const state = { released: false }
	return {
		state,
		attempt: {
			kind: 'taken' as const,
			held: { lockPath: 'x.lock', note: note(), release: () => (state.released = true) }
		}
	}
}

describe('acquireCoordinatorLock', () => {
	test('takes a free lock on the first attempt, without sleeping', async () => {
		const { attempt } = fakeHeld()
		const { io, sleeps } = scriptedIo([attempt])
		const held = await acquireCoordinatorLock({ persistDir: STORE, io })
		expect(held).toBe(attempt.held)
		expect(sleeps).toEqual([])
	})

	test('refuses a live coordinator at once, naming it', async () => {
		const { io, sleeps } = scriptedIo([{ kind: 'held', note: note() }])
		const error = (await acquireCoordinatorLock({ persistDir: STORE, io }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.holder).toEqual(note())
		expect(error.message).toContain('pid 4242')
		expect(sleeps).toEqual([])
	})

	test('waits for a store host, polling every 250 ms or less, and takes the lock when it goes', async () => {
		const { attempt } = fakeHeld()
		const host: CoordinatorLockAttempt = {
			kind: 'held',
			note: note({ role: 'ops-store-host', deadline: 1_000_000 + 60_000 })
		}
		const { io, sleeps, now } = scriptedIo([host, host, host, host, attempt])
		const held = await acquireCoordinatorLock({ persistDir: STORE, io })
		expect(held).toBe(attempt.held)
		expect(sleeps).toEqual([250, 250, 250, 250])
		expect(now()).toBe(1_001_000)
	})

	test('refuses a store host that outlives deadline + 10 s', async () => {
		const host: CoordinatorLockAttempt = {
			kind: 'held',
			note: note({ role: 'ops-store-host', deadline: 1_000_000 + 2_000 })
		}
		const { io, now, sleeps } = scriptedIo([host])
		const error = (await acquireCoordinatorLock({ persistDir: STORE, io }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(now()).toBe(1_012_000)
		expect(Math.max(...sleeps)).toBeLessThanOrEqual(250)
		expect(error.message).toContain('role "ops-store-host"')
	})

	test('caps any wait at 120 s', async () => {
		const host: CoordinatorLockAttempt = {
			kind: 'held',
			note: note({ role: 'ops-store-host', deadline: 1_000_000 + 3_600_000 })
		}
		const { io, now } = scriptedIo([host])
		await acquireCoordinatorLock({ persistDir: STORE, io }).catch(() => undefined)
		expect(now()).toBe(1_120_000)
	})

	test('refuses an unidentified holder after 10 s, naming the filesystem', async () => {
		const { io, now } = scriptedIo([{ kind: 'held', note: null }])
		const error = (await acquireCoordinatorLock({ persistDir: STORE, io }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(now()).toBe(1_010_000)
		expect(error.message).toContain('unidentified holder')
		expect(error.message).toContain('WSL2')
	})

	test('a dead coordinator is waited for, not refused at once (its lock may be freed late)', async () => {
		const { attempt } = fakeHeld()
		const { io, sleeps } = scriptedIo([{ kind: 'held', note: note() }, attempt], false)
		expect(await acquireCoordinatorLock({ persistDir: STORE, io })).toBe(attempt.held)
		expect(sleeps).toEqual([250])
	})

	test('an abort during the wait ends it with ABORTED', async () => {
		const controller = new AbortController()
		const { io } = scriptedIo([
			() => {
				controller.abort()
				return { kind: 'held', note: null }
			}
		])
		const error = (await acquireCoordinatorLock({
			persistDir: STORE,
			io,
			signal: controller.signal
		}).catch((e) => e)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_ABORTED')
	})

	test('an abort that lands during a successful attempt releases the lock again', async () => {
		const controller = new AbortController()
		const { state, attempt } = fakeHeld()
		const { io } = scriptedIo([
			() => {
				controller.abort()
				return attempt
			}
		])
		const error = (await acquireCoordinatorLock({
			persistDir: STORE,
			io,
			signal: controller.signal
		}).catch((e) => e)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_ABORTED')
		expect(state.released).toBe(true)
	})

	test('an unopenable lock file fails loudly, naming the path and both opt-outs', async () => {
		const { io } = scriptedIo([])
		io.tryTake = async () => {
			throw Object.assign(new Error('unable to open database file'), {
				code: 'SQLITE_CANTOPEN',
				errno: 14
			})
		}
		const error = (await acquireCoordinatorLock({ persistDir: STORE, io }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_UNAVAILABLE')
		expect(error.message).toContain(coordinatorLockPath(STORE))
		expect(error.message).toContain('DEVFLARE_PERSIST_LOCK=0')
		expect(error.message).toContain('persistLock: false')
		expect((error as Error & { cause?: { code?: string } }).cause?.code).toBe('SQLITE_CANTOPEN')
	})

	test('any other error is wrapped with the lock path, its placement and the opt-out, keeping the cause', async () => {
		const { io } = scriptedIo([])
		const boom = Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR', errno: 10 })
		io.tryTake = async () => {
			throw boom
		}
		const error = (await acquireCoordinatorLock({ persistDir: STORE, io }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_FAILED')
		expect(error.message).toContain(coordinatorLockPath(STORE))
		expect(error.message).toContain('disk I/O error')
		expect(error.message).toContain('written into C:/work/app/.devflare')
		expect(error.message).toContain('DEVFLARE_PERSIST_LOCK=0')
		expect((error as Error & { cause?: unknown }).cause).toBe(boom)
	})

	test('a runtime with no SQLite warns once per process and runs unlocked', async () => {
		const warnings: string[] = []
		const logger = { info: () => undefined, warn: (message: string) => warnings.push(message) }
		const { io } = scriptedIo([
			{ kind: 'unsupported', reason: 'node:sqlite is not available in Node 22.12.0' }
		])
		expect(await acquireCoordinatorLock({ persistDir: STORE, io, logger })).toBeNull()
		expect(await acquireCoordinatorLock({ persistDir: STORE, io, logger })).toBeNull()
		expect(warnings).toHaveLength(1)
		expect(warnings[0]).toContain('WITHOUT its lock')
	})
})

describe('a real lock, inside this process', () => {
	test('writes the note, refuses a second taker naming it, and frees both on release', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'devflare-coordlock-unit-'))
		tempDirs.push(dir)
		const persistDir = join(dir, 'workspace-data')

		const held = await acquireCoordinatorLock({ persistDir })
		expect(held).not.toBeNull()
		const onDisk = readFileSync(coordinatorLockNotePath(persistDir), 'utf8')
		expect(onDisk).toBe(serializeCoordinatorLockNote(held!.note))
		expect(held!.note).toMatchObject({ pid: process.pid, role: 'coordinator', store: persistDir })
		expect(existsSync(persistDir)).toBe(false)

		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.message).toContain(`pid ${process.pid}`)

		held!.release()
		held!.release()
		expect(existsSync(coordinatorLockNotePath(persistDir))).toBe(false)
		const again = await acquireCoordinatorLock({ persistDir })
		expect(again).not.toBeNull()
		again!.release()
	})

	test('release removes only its OWN note: one naming another pid or since survives', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'devflare-coordlock-unit-'))
		tempDirs.push(dir)
		const persistDir = join(dir, 'workspace-data')
		const notePath = coordinatorLockNotePath(persistDir)

		for (const other of [{ since: 1 }, { pid: process.pid + 1 }]) {
			const held = await acquireCoordinatorLock({ persistDir })
			const replaced = serializeCoordinatorLockNote({ ...held!.note, ...other })
			writeFileSync(notePath, replaced)
			held!.release()
			expect(readFileSync(notePath, 'utf8')).toBe(replaced)
			rmSync(notePath)
		}
	})
})
