/*
	A process that holds (or tries) a coordinator lock for the integration tests,
	so every refusal is measured against a holder in ANOTHER process — the only
	arrangement the lock exists for. Runs under Bun, or under Node 22.13+ with
	`--experimental-strip-types` (only erasable syntax here, for that reason).

	Usage: `<runtime> coordinator-lock.fixture.ts <mode> <json args>`. It prints
	one JSON line to stdout once it has done its part, then (for the holding
	modes) stays alive until killed or until `exitAfterMs`.

	- `raw`    — hold the lock with raw SQLite and write the note through a temp
	             file and a rename, exactly as uidini's `scripts/lib/store-lock.ts`
	             does; `note: null` writes none.
	- `module` — hold it through devflare's own `acquireCoordinatorLock`, loaded
	             from `modulePath` (the source under Bun, a bundle under Node).
	             `dropHandle` discards the returned handle, to prove the module
	             pins it against garbage collection.
	- `try`    — try the raw lock once and report what SQLite threw.
	- `workspace` — start a workspace dev server from `modulePath` and report how
	             `start()` failed.
*/

import { renameSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const isBun = typeof process.versions.bun === 'string'

/** Collect garbage hard and often, so a lock held only by an unreachable connection is freed. */
function collectGarbageForever(): void {
	setInterval(() => {
		if (isBun) {
			;(globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc(true)
		} else {
			;(globalThis as { gc?: () => void }).gc?.()
		}
	}, 100)
}

/** Report one line of JSON. */
function report(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value)}\n`)
}

/** Exit after a while, when asked — a holder that finishes on its own. */
function exitLater(ms: number | undefined): void {
	if (typeof ms === 'number') setTimeout(() => process.exit(0), ms)
}

/** Open the lock file with this runtime's SQLite and run the three lock statements. */
async function rawLock(lockPath: string): Promise<{ db: unknown; error: unknown }> {
	let exec: (sql: string) => void
	let db: unknown
	if (isBun) {
		const { Database } = await import('bun:sqlite')
		const opened = new Database(lockPath, { create: true, readwrite: true })
		exec = (sql) => opened.run(sql)
		db = opened
	} else {
		const { DatabaseSync } = await import('node:sqlite')
		const opened = new DatabaseSync(lockPath)
		exec = (sql) => opened.exec(sql)
		db = opened
	}
	try {
		exec('PRAGMA busy_timeout=0')
		exec('PRAGMA journal_mode=DELETE')
		exec('BEGIN EXCLUSIVE')
		return { db, error: null }
	} catch (error) {
		return { db: null, error }
	}
}

/** The fields a test reads from a thrown error, in either runtime's shape. */
function errorShape(error: unknown): Record<string, unknown> {
	const { name, code, errno, errcode, message } = error as Record<string, unknown>
	return { name, code, errno, errcode, message }
}

const [mode, argsJson] = process.argv.slice(2)
const args = JSON.parse(argsJson ?? '{}')

if (mode === 'raw') {
	const { db, error } = await rawLock(args.lockPath)
	if (error) throw error
	;(globalThis as { __lock?: unknown }).__lock = db
	if (args.note) {
		const temp = `${args.notePath}.${process.pid}.${Date.now()}.tmp`
		writeFileSync(temp, `${JSON.stringify({ ...args.note, pid: args.note.pid ?? process.pid })}\n`)
		renameSync(temp, args.notePath)
	}
	collectGarbageForever()
	exitLater(args.exitAfterMs)
	report({ ready: true, pid: process.pid })
} else if (mode === 'module') {
	const { acquireCoordinatorLock } = await import(pathToFileURL(args.modulePath).href)
	try {
		const held = await acquireCoordinatorLock({
			persistDir: args.persistDir,
			...(args.role ? { role: args.role } : {}),
			...(args.deadline ? { deadline: args.deadline } : {})
		})
		if (!args.dropHandle) (globalThis as { __lock?: unknown }).__lock = held
		collectGarbageForever()
		exitLater(args.exitAfterMs)
		report({ ready: true, pid: process.pid, held: held !== null })
	} catch (error) {
		report({ ready: false, error: errorShape(error) })
		process.exit(0)
	}
} else if (mode === 'try') {
	const { error } = await rawLock(args.lockPath)
	report(error ? { taken: false, error: errorShape(error) } : { taken: true })
	process.exit(0)
} else if (mode === 'workspace') {
	const { createWorkspaceDevServer } = await import(pathToFileURL(args.modulePath).href)
	const server = createWorkspaceDevServer({
		manifest: args.manifest,
		manifestDir: args.manifestDir,
		persist: true
	})
	try {
		await server.start()
		report({ started: true })
	} catch (error) {
		report({ started: false, error: errorShape(error) })
	}
	await server.stop()
	process.exit(0)
} else {
	throw new Error(`unknown mode ${mode}`)
}
