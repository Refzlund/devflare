/*
	The coordinator lock against holders in OTHER processes — the only
	arrangement it exists for. Each holder is `coordinator-lock.fixture.ts`,
	holding the lock either as uidini's store host does (raw SQLite plus a JSON
	note written through a rename) or through devflare's own module.

	→ NOTE: serial lane (`test:integration:dev-server`): these spawn processes and
	  wait on real locks, and a ten-second wait is compressed with a fast clock
	  rather than slept through.
*/
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'pathe'
import {
	acquireCoordinatorLock,
	type CoordinatorLockError,
	coordinatorLockNotePath,
	coordinatorLockPath,
	isSqliteBusy,
	readCoordinatorLockNote
} from '../../../src/dev-server/workspace/coordinator-lock'

const FIXTURE = resolve(import.meta.dir, 'coordinator-lock.fixture.ts')
const MODULE = resolve(import.meta.dir, '../../../src/dev-server/workspace/coordinator-lock.ts')

/** The one JSON line the fixture reports. */
interface FixtureLine {
	ready?: boolean
	pid?: number
	held?: boolean
	taken?: boolean
	error?: { code?: string; errcode?: number; errno?: number; message?: string }
}

const children: ChildProcess[] = []
const tempDirs: string[] = []

afterEach(() => {
	for (const child of children.splice(0)) {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
	}
})

afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** A fresh persist dir under a temp root; nothing is created at the dir itself. */
function freshPersistDir(): string {
	const root = mkdtempSync(join(tmpdir(), 'devflare-coordlock-'))
	tempDirs.push(root)
	return join(root, 'workspace-data')
}

/**
 * Run the fixture and resolve with its first JSON line.
 *
 * @param runtime - The executable and its leading flags.
 * @param mode - The fixture mode.
 * @param args - Its JSON arguments.
 * @returns The child and the line it reported.
 */
async function runFixture(
	runtime: string[],
	mode: string,
	args: Record<string, unknown>
): Promise<{ child: ChildProcess; line: FixtureLine; stderr: () => string }> {
	const [command, ...flags] = runtime
	const child = spawn(command!, [...flags, FIXTURE, mode, JSON.stringify(args)], {
		stdio: ['ignore', 'pipe', 'pipe']
	})
	children.push(child)
	let stderr = ''
	child.stderr!.on('data', (chunk) => (stderr += String(chunk)))
	const line = await new Promise<FixtureLine>((resolveLine, rejectLine) => {
		let stdout = ''
		const timer = setTimeout(
			() => rejectLine(new Error(`fixture ${mode} reported nothing: ${stderr}`)),
			20_000
		)
		child.stdout!.on('data', (chunk) => {
			stdout += String(chunk)
			const end = stdout.indexOf('\n')
			if (end === -1) return
			clearTimeout(timer)
			resolveLine(JSON.parse(stdout.slice(0, end)))
		})
		child.on('exit', (code) => {
			clearTimeout(timer)
			rejectLine(new Error(`fixture ${mode} exited ${code} before reporting: ${stderr}`))
		})
	})
	return { child, line, stderr: () => stderr }
}

const BUN = [process.execPath]

/** Hold the lock as uidini's store host does: raw SQLite, then the note through a rename. */
function holdRaw(
	persistDir: string,
	note: Record<string, unknown> | null,
	extra: Record<string, unknown> = {}
) {
	return runFixture(BUN, 'raw', {
		lockPath: coordinatorLockPath(persistDir),
		notePath: coordinatorLockNotePath(persistDir),
		note: note && { pid: null, ...note, store: persistDir },
		...extra
	})
}

/** A clock that runs ten times fast from now, so a ten-second wait takes one. */
function fastClock(): () => number {
	const origin = Date.now()
	return () => origin + (Date.now() - origin) * 10
}

/** Wait until a child has exited. */
function exited(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
	return new Promise((done) => child.once('exit', () => done()))
}

describe('a holder in another process', () => {
	test('a live coordinator (uidini-style raw lock + note) is refused at once, named', async () => {
		const persistDir = freshPersistDir()
		const { line } = await holdRaw(persistDir, { role: 'coordinator', since: Date.now() })

		const began = Date.now()
		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(Date.now() - began).toBeLessThan(1_000)
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.message).toContain(`pid ${line.pid} (role "coordinator"`)
		expect(error.message).toContain(coordinatorLockPath(persistDir))
		expect(error.holder?.pid).toBe(line.pid)
	})

	test("a live coordinator holding through devflare's own module is refused at once, named", async () => {
		const persistDir = freshPersistDir()
		const { line } = await runFixture(BUN, 'module', { modulePath: MODULE, persistDir })
		expect(line.held).toBe(true)
		expect(readCoordinatorLockNote(coordinatorLockNotePath(persistDir))).toMatchObject({
			pid: line.pid,
			role: 'coordinator',
			store: persistDir
		})

		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.message).toContain(`pid ${line.pid} (role "coordinator"`)
	})

	test('a store host with a deadline is waited for, and the lock is taken once it exits', async () => {
		const persistDir = freshPersistDir()
		const deadline = Date.now() + 5_000
		const { child } = await holdRaw(
			persistDir,
			{ role: 'ops-store-host', since: Date.now(), deadline, task: 'lane-x' },
			{ exitAfterMs: 1_200 }
		)

		const began = Date.now()
		const held = await acquireCoordinatorLock({ persistDir })
		const waited = Date.now() - began
		expect(held).not.toBeNull()
		expect(waited).toBeGreaterThan(500)
		expect(waited).toBeLessThan(5_000)
		await exited(child)
		expect(readCoordinatorLockNote(coordinatorLockNotePath(persistDir))).toMatchObject({
			pid: process.pid,
			role: 'coordinator'
		})
		held!.release()
	})

	test('a store host past deadline + 10 s is refused, naming pid, role, since and deadline', async () => {
		const persistDir = freshPersistDir()
		const since = Date.now() - 30_000
		// Ten seconds past this deadline is one second from now.
		const deadline = Date.now() - 9_000
		const { line } = await holdRaw(persistDir, { role: 'ops-store-host', since, deadline })

		const began = Date.now()
		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError
		const waited = Date.now() - began
		expect(waited).toBeGreaterThan(600)
		expect(waited).toBeLessThan(3_000)
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		for (const fragment of [
			`pid ${line.pid}`,
			'role "ops-store-host"',
			`since ${new Date(since).toISOString()}`,
			`deadline ${new Date(deadline).toISOString()}`,
			coordinatorLockPath(persistDir)
		]) {
			expect(error.message).toContain(fragment)
		}
	})

	test('a holder with no note is refused after 10 s (clock x10), naming the filesystem', async () => {
		const persistDir = freshPersistDir()
		await holdRaw(persistDir, null)

		const began = Date.now()
		const error = (await acquireCoordinatorLock({ persistDir, io: { now: fastClock() } }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(Date.now() - began).toBeGreaterThan(800)
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.message).toContain('no readable holder note')
		expect(error.message).toContain('WSL2 /mnt/c')
		expect(error.message).toContain(coordinatorLockPath(persistDir))
	})

	test('a note naming a dead pid is waited 10 s (clock x10), then refused as not running', async () => {
		const persistDir = freshPersistDir()
		// The lock is held, but the note names a pid that is not running.
		await holdRaw(persistDir, { pid: 999_999_9, role: 'coordinator', since: Date.now() })

		const error = (await acquireCoordinatorLock({ persistDir, io: { now: fastClock() } }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.message).toContain('pid 9999999')
		expect(error.message).toContain('which is not running')
	})

	test('a stop during the wait aborts it at once', async () => {
		const persistDir = freshPersistDir()
		await holdRaw(persistDir, null)

		const controller = new AbortController()
		setTimeout(() => controller.abort(), 300)
		const began = Date.now()
		const error = (await acquireCoordinatorLock({ persistDir, signal: controller.signal }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_ABORTED')
		expect(Date.now() - began).toBeLessThan(1_500)
	})

	test('the lock survives forced garbage collection in a holder that dropped its handle', async () => {
		const persistDir = freshPersistDir()
		const { line } = await runFixture(BUN, 'module', {
			modulePath: MODULE,
			persistDir,
			dropHandle: true
		})
		expect(line.held).toBe(true)
		// The holder runs Bun.gc(true) every 100 ms; give it a dozen collections.
		await Bun.sleep(1_200)

		const probe = await runFixture(BUN, 'try', { lockPath: coordinatorLockPath(persistDir) })
		expect(probe.line.taken).toBe(false)
		expect(isSqliteBusy(probe.line.error)).toBe(true)
	})

	test('a crash frees the lock (the OS releases it) — not a store-safety claim, see the docs', async () => {
		const persistDir = freshPersistDir()
		const { child } = await runFixture(BUN, 'module', { modulePath: MODULE, persistDir })
		child.kill('SIGKILL')
		await exited(child)

		// Real clock: Windows may free a dead holder's lock a moment late, and the 10 s wait covers it.
		const held = await acquireCoordinatorLock({ persistDir })
		expect(held).not.toBeNull()
		held!.release()
	})
})

describe('release', () => {
	test('frees the lock for another process and removes only its own note', async () => {
		const persistDir = freshPersistDir()
		const held = await acquireCoordinatorLock({ persistDir })
		expect(held).not.toBeNull()

		const busy = await runFixture(BUN, 'try', { lockPath: coordinatorLockPath(persistDir) })
		expect(busy.line.taken).toBe(false)

		held!.release()
		expect(existsSync(coordinatorLockNotePath(persistDir))).toBe(false)
		const free = await runFixture(BUN, 'try', { lockPath: coordinatorLockPath(persistDir) })
		expect(free.line.taken).toBe(true)
	})

	test.skipIf(process.getuid?.() === 0)(
		'a READ-ONLY lock file is refused, never trusted: SQLite would open it read-only and lock nothing',
		async () => {
			const persistDir = freshPersistDir()
			const lockPath = coordinatorLockPath(persistDir)
			mkdirSync(dirname(lockPath), { recursive: true })
			writeFileSync(lockPath, '')
			// On Windows this sets the read-only attribute.
			chmodSync(lockPath, 0o444)
			try {
				const error = (await acquireCoordinatorLock({ persistDir }).catch(
					(e) => e
				)) as CoordinatorLockError
				expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_UNAVAILABLE')
				expect(error.message).toContain(lockPath)
				expect(error.message).toContain(`written into ${dirname(lockPath)}`)
				expect(error.message).toContain('DEVFLARE_PERSIST_LOCK=0')

				// Nor is any other process admitted.
				const other = await runFixture(BUN, 'module', { modulePath: MODULE, persistDir })
				expect(other.line.ready).toBe(false)
				expect(other.line.error?.code).toBe('DEVFLARE_COORDINATOR_LOCK_UNAVAILABLE')
			} finally {
				chmodSync(lockPath, 0o644)
			}
		}
	)

	test('a lock error other than BUSY is never read as "held": it fails at once, naming the lock', async () => {
		const persistDir = freshPersistDir()
		const lockPath = coordinatorLockPath(persistDir)
		mkdirSync(dirname(lockPath), { recursive: true })
		// Not an SQLite database: the lock statements fail with SQLITE_NOTADB, not BUSY.
		writeFileSync(lockPath, 'this is not an sqlite database, '.repeat(64))

		const began = Date.now()
		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError & { cause?: { code?: string } }
		expect(Date.now() - began).toBeLessThan(1_000)
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_FAILED')
		expect(error.message).toContain(lockPath)
		expect(error.message).toContain('DEVFLARE_PERSIST_LOCK=0')
		expect(error.cause?.code).toStartWith('SQLITE_NOTADB')
	})

	test('a lock file that cannot be opened fails loudly, naming the path and the opt-out', async () => {
		const persistDir = freshPersistDir()
		// A directory where the lock file should be: SQLite cannot open it.
		mkdirSync(coordinatorLockPath(persistDir), { recursive: true })
		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_UNAVAILABLE')
		expect(error.message).toContain(coordinatorLockPath(persistDir))
		expect(error.message).toContain('DEVFLARE_PERSIST_LOCK=0')
	})
})

/*
	──────────────────────────────────────────────
	      Across runtimes: Node's node:sqlite
	──────────────────────────────────────────────
	devflare's bin runs under Node too. The module is bundled for Node here
	(Node cannot import the TypeScript source), and the Node fixture holds and
	tries the lock through it. Skipped where no Node 22.13+ is on PATH.
*/

/** The Node on PATH, when it is 22.13 or later. */
function nodeAtFloor(): string | null {
	const node = Bun.which('node')
	if (!node) return null
	const version = spawnSync(node, ['--version'], { encoding: 'utf8' }).stdout.trim()
	const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number)
	return major > 22 || (major === 22 && minor >= 13) ? node : null
}

const NODE = nodeAtFloor()

describe.skipIf(NODE === null)('across runtimes (Node 22.13+)', () => {
	let bundle = ''

	/** Bundle the lock module for Node once. */
	async function nodeModule(): Promise<string> {
		if (bundle) return bundle
		const outdir = mkdtempSync(join(tmpdir(), 'devflare-coordlock-node-'))
		tempDirs.push(outdir)
		const result = await Bun.build({
			entrypoints: [MODULE],
			outdir,
			target: 'node',
			format: 'esm',
			external: ['bun:sqlite']
		})
		if (!result.success)
			throw new AggregateError(result.logs, 'bundling the lock module for Node failed')
		bundle = result.outputs[0]!.path
		return bundle
	}

	const node = () => [NODE!, '--experimental-strip-types', '--expose-gc', '--no-warnings']

	test('a Node coordinator (devflare module on node:sqlite) refuses a Bun one, and the reverse', async () => {
		const persistDir = freshPersistDir()
		const { line } = await runFixture(node(), 'module', {
			modulePath: await nodeModule(),
			persistDir
		})
		expect(line.held).toBe(true)
		const error = (await acquireCoordinatorLock({ persistDir }).catch(
			(e) => e
		)) as CoordinatorLockError
		expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(error.message).toContain(`pid ${line.pid} (role "coordinator"`)

		const other = freshPersistDir()
		const held = await acquireCoordinatorLock({ persistDir: other })
		const reverse = await runFixture(node(), 'module', {
			modulePath: await nodeModule(),
			persistDir: other
		})
		expect(reverse.line.ready).toBe(false)
		expect(reverse.line.error?.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
		expect(reverse.line.error?.message).toContain(`pid ${process.pid}`)
		held!.release()
	})

	test('Node reports BUSY in its own shape, which isSqliteBusy reads', async () => {
		const persistDir = freshPersistDir()
		const held = await acquireCoordinatorLock({ persistDir })
		const probe = await runFixture(node(), 'try', { lockPath: coordinatorLockPath(persistDir) })
		expect(probe.line.taken).toBe(false)
		expect(probe.line.error?.code).toBe('ERR_SQLITE_ERROR')
		expect(isSqliteBusy(probe.line.error)).toBe(true)
		held!.release()
	})

	test('a Node with no node:sqlite warns once and runs unlocked', async () => {
		const persistDir = freshPersistDir()
		const { line, stderr } = await runFixture(
			[NODE!, '--experimental-strip-types', '--no-experimental-sqlite', '--no-warnings'],
			'module',
			{ modulePath: await nodeModule(), persistDir }
		)
		expect(line).toMatchObject({ ready: true, held: false })
		await Bun.sleep(100)
		expect(stderr()).toContain('WITHOUT its lock')
		expect(existsSync(coordinatorLockPath(persistDir))).toBe(false)
	})
})
