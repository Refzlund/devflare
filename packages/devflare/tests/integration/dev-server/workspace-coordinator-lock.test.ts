/*
	`createWorkspaceDevServer` holds the coordinator lock for its whole life:
	taken before anything opens the persist dir, released by `stop()` after
	Miniflare's dispose. A second coordinator on the same dir — started in another
	process, as it would be — is refused, naming the first.

	The ORDER is graded through the server's `deps` seam: the Miniflare class and
	the lock are wrapped to record when the instance is constructed and disposed
	and when the lock is taken and released, so a refactor that moves the take
	below Miniflare's start, or the release above its dispose, fails by name.
*/
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'pathe'
import type { WorkspaceManifest } from '../../../src/config/workspace'
import {
	acquireCoordinatorLock,
	type CoordinatorLockError,
	coordinatorLockNotePath,
	coordinatorLockPath,
	readCoordinatorLockNote
} from '../../../src/dev-server/workspace/coordinator-lock'
import {
	createWorkspaceDevServer,
	type WorkspaceDevServerDeps
} from '../../../src/dev-server/workspace/server'
import {
	cleanupTempDirs,
	getAvailablePort,
	installBuiltDevflare,
	waitForResponseText
} from '../helpers/built-devflare.helpers'

const FIXTURE = resolve(import.meta.dir, 'coordinator-lock.fixture.ts')
const SERVER_MODULE = resolve(import.meta.dir, '../../../src/dev-server/workspace/server.ts')
const HOOK_TIMEOUT_MS = 90_000
const tempDirs: string[] = []

const holders: ChildProcess[] = []

afterEach(() => {
	for (const holder of holders.splice(0)) {
		if (holder.exitCode === null && holder.signalCode === null) holder.kill('SIGKILL')
	}
})

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

/**
 * Hold a persist dir's coordinator lock from another process, as uidini's store
 * host does: raw SQLite, then the note through a rename.
 *
 * @param persistDir - The persist dir whose lock to hold.
 * @param note - The note to write (pid and store are filled in).
 * @returns The holder process, once it reports that it holds the lock.
 */
async function holdFromAnotherProcess(
	persistDir: string,
	note: Record<string, unknown>
): Promise<ChildProcess> {
	const holder = spawn(
		process.execPath,
		[
			FIXTURE,
			'raw',
			JSON.stringify({
				lockPath: coordinatorLockPath(persistDir),
				notePath: coordinatorLockNotePath(persistDir),
				note: { pid: null, ...note, store: persistDir }
			})
		],
		{ stdio: ['ignore', 'pipe', 'inherit'] }
	)
	holders.push(holder)
	await new Promise<void>((ready, failed) => {
		holder.stdout!.once('data', () => ready())
		holder.once('exit', (code) => failed(new Error(`holder exited ${code}`)))
	})
	return holder
}

/** Probe the lock from another process WITHOUT yielding — usable inside a wrapped `dispose()`. */
function lockFreeNow(persistDir: string): boolean {
	const probe = spawnSync(
		process.execPath,
		[FIXTURE, 'try', JSON.stringify({ lockPath: coordinatorLockPath(persistDir) })],
		{ encoding: 'utf8' }
	)
	return JSON.parse(probe.stdout.trim()).taken === true
}

/**
 * Deps that record the lock's and the Miniflare instance's life into `trace`.
 *
 * @param trace - Receives `lock:taken`, `miniflare:new`, `miniflare:dispose:start`,
 *   `miniflare:dispose:end` and `lock:released`, in the order they happen.
 * @param hooks - `onDispose` runs as dispose begins; `onLoadMiniflare` as the module
 *   loads, and the load waits for it — a slow startup step.
 * @returns The deps to pass to `createWorkspaceDevServer`.
 */
function tracingDeps(
	trace: string[],
	hooks: { onDispose?: () => void; onLoadMiniflare?: () => Promise<void> | void } = {}
): WorkspaceDevServerDeps {
	return {
		loadMiniflare: async () => {
			await hooks.onLoadMiniflare?.()
			const miniflare = await import('miniflare')
			class TracedMiniflare extends miniflare.Miniflare {
				constructor(...args: ConstructorParameters<typeof miniflare.Miniflare>) {
					trace.push('miniflare:new')
					super(...args)
				}
				override async dispose(): Promise<void> {
					trace.push('miniflare:dispose:start')
					hooks.onDispose?.()
					await super.dispose()
					trace.push('miniflare:dispose:end')
				}
			}
			return { ...miniflare, Miniflare: TracedMiniflare } as typeof miniflare
		},
		acquireCoordinatorLock: async (options) => {
			const held = await acquireCoordinatorLock(options)
			if (!held) return null
			trace.push('lock:taken')
			return {
				lockPath: held.lockPath,
				note: held.note,
				release() {
					trace.push('lock:released')
					held.release()
				}
			}
		}
	}
}

/** A workspace with one worker-only app that answers `GET /` with `ok`. */
async function createWorkspace(): Promise<{
	dir: string
	manifest: WorkspaceManifest
	port: number
}> {
	const dir = await mkdtemp(join(tmpdir(), 'devflare-ws-coordlock-'))
	tempDirs.push(dir)
	const appDir = join(dir, 'apps', 'a')
	await mkdir(join(appDir, 'src', 'routes'), { recursive: true })
	await installBuiltDevflare(appDir)
	await writeFile(
		join(appDir, 'package.json'),
		JSON.stringify({ name: 'ws-lock-a', private: true, type: 'module' })
	)
	await writeFile(
		join(appDir, 'devflare.config.ts'),
		`export default { name: 'ws-lock-a', compatibilityDate: '2026-03-17', files: { routes: { dir: 'src/routes' } } }`
	)
	await writeFile(
		join(appDir, 'src', 'routes', 'index.ts'),
		`export function GET() { return new Response('ok') }`
	)

	const port = await getAvailablePort()
	return {
		dir,
		port,
		manifest: {
			apps: [{ config: './apps/a/devflare.config.ts', name: 'a', port }],
			persist: './data'
		}
	}
}

/** Start a second coordinator on the same manifest in another process; resolve with how its start() ended. */
async function startInAnotherProcess(
	manifest: WorkspaceManifest,
	manifestDir: string
): Promise<{ started: boolean; error?: { code?: string; message?: string } }> {
	const child = spawn(
		process.execPath,
		[FIXTURE, 'workspace', JSON.stringify({ modulePath: SERVER_MODULE, manifest, manifestDir })],
		{ stdio: ['ignore', 'pipe', 'inherit'] }
	)
	let stdout = ''
	child.stdout!.on('data', (chunk) => (stdout += String(chunk)))
	await new Promise<void>((done) => child.once('exit', () => done()))
	return JSON.parse(stdout.trim().split('\n').at(-1)!)
}

/** Ask, from another process, whether the lock can be taken right now. */
async function lockFreeFromAnotherProcess(persistDir: string): Promise<boolean> {
	const child = spawn(
		process.execPath,
		[FIXTURE, 'try', JSON.stringify({ lockPath: coordinatorLockPath(persistDir) })],
		{ stdio: ['ignore', 'pipe', 'inherit'] }
	)
	let stdout = ''
	child.stdout!.on('data', (chunk) => (stdout += String(chunk)))
	await new Promise<void>((done) => child.once('exit', () => done()))
	return JSON.parse(stdout.trim()).taken === true
}

describe('the workspace coordinator holds its lock', () => {
	test(
		'held with a coordinator note while running; a second coordinator is refused naming it; stop frees it',
		async () => {
			const { dir, manifest, port } = await createWorkspace()
			const persistDir = resolve(dir, 'data')
			const server = createWorkspaceDevServer({ manifest, manifestDir: dir, persist: true })
			try {
				await server.start()
				await waitForResponseText(`http://127.0.0.1:${port}/`, 'ok')

				const note = readCoordinatorLockNote(coordinatorLockNotePath(persistDir))
				expect(note).toMatchObject({ pid: process.pid, role: 'coordinator', store: persistDir })
				expect(note?.deadline).toBeUndefined()
				expect(await lockFreeFromAnotherProcess(persistDir)).toBe(false)

				const second = await startInAnotherProcess(manifest, dir)
				expect(second.started).toBe(false)
				expect(second.error?.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
				expect(second.error?.message).toContain(`pid ${process.pid} (role "coordinator"`)
				expect(second.error?.message).toContain(coordinatorLockPath(persistDir))
				// The refused coordinator touched nothing: the first still serves.
				expect(await waitForResponseText(`http://127.0.0.1:${port}/`, 'ok')).toBe('ok')
			} finally {
				await server.stop()
			}

			expect(existsSync(coordinatorLockNotePath(persistDir))).toBe(false)
			expect(await lockFreeFromAnotherProcess(persistDir)).toBe(true)
		},
		HOOK_TIMEOUT_MS
	)

	test(
		'persistLock: false, DEVFLARE_PERSIST_LOCK=0 and a non-persisting server leave no lock file',
		async () => {
			const cases: Array<{ name: string; persist: boolean; persistLock?: boolean; env?: string }> =
				[
					{ name: 'persistLock: false', persist: true, persistLock: false },
					{ name: 'DEVFLARE_PERSIST_LOCK=0', persist: true, env: '0' },
					{ name: 'persist: false', persist: false }
				]
			for (const entry of cases) {
				const { dir, manifest, port } = await createWorkspace()
				const persistDir = resolve(dir, 'data')
				const previous = process.env.DEVFLARE_PERSIST_LOCK
				if (entry.env !== undefined) process.env.DEVFLARE_PERSIST_LOCK = entry.env
				const server = createWorkspaceDevServer({
					manifest,
					manifestDir: dir,
					persist: entry.persist,
					...(entry.persistLock === undefined ? {} : { persistLock: entry.persistLock })
				})
				if (previous === undefined) delete process.env.DEVFLARE_PERSIST_LOCK
				else process.env.DEVFLARE_PERSIST_LOCK = previous
				try {
					await server.start()
					await waitForResponseText(`http://127.0.0.1:${port}/`, 'ok')
					expect({ case: entry.name, lock: existsSync(coordinatorLockPath(persistDir)) }).toEqual({
						case: entry.name,
						lock: false
					})
					expect(existsSync(coordinatorLockNotePath(persistDir))).toBe(false)
				} finally {
					await server.stop()
				}
			}
		},
		HOOK_TIMEOUT_MS * 2
	)

	test(
		'the lock is taken before Miniflare exists and released only after its dispose has finished',
		async () => {
			const { dir, manifest, port } = await createWorkspace()
			const persistDir = resolve(dir, 'data')
			const trace: string[] = []
			let heldDuringDispose = null as boolean | null
			const server = createWorkspaceDevServer(
				{ manifest, manifestDir: dir, persist: true },
				tracingDeps(trace, {
					onDispose: () => {
						heldDuringDispose = !lockFreeNow(persistDir)
					}
				})
			)
			try {
				await server.start()
				await waitForResponseText(`http://127.0.0.1:${port}/`, 'ok')
			} finally {
				await server.stop()
			}

			expect(trace).toEqual([
				'lock:taken',
				'miniflare:new',
				'miniflare:dispose:start',
				'miniflare:dispose:end',
				'lock:released'
			])
			expect(heldDuringDispose).toBe(true)
			expect(lockFreeNow(persistDir)).toBe(true)
		},
		HOOK_TIMEOUT_MS
	)

	test(
		'a coordinator refused by a live coordinator never constructs Miniflare',
		async () => {
			const { dir, manifest } = await createWorkspace()
			const persistDir = resolve(dir, 'data')
			const holder = await holdFromAnotherProcess(persistDir, {
				role: 'coordinator',
				since: Date.now()
			})
			const trace: string[] = []
			const server = createWorkspaceDevServer(
				{ manifest, manifestDir: dir, persist: true },
				tracingDeps(trace)
			)
			const error = (await server.start().catch((e) => e)) as CoordinatorLockError
			await server.stop()

			expect(error.code).toBe('DEVFLARE_COORDINATOR_LOCK_HELD')
			expect(error.message).toContain(`pid ${holder.pid} (role "coordinator"`)
			expect(trace).toEqual([])
			expect(server.getMiniflare()).toBeNull()
		},
		HOOK_TIMEOUT_MS
	)

	test(
		'stop() during the lock wait aborts it at once, opens nothing, and leaves the lock to its holder',
		async () => {
			const { dir, manifest } = await createWorkspace()
			const persistDir = resolve(dir, 'data')
			const holder = await holdFromAnotherProcess(persistDir, {
				role: 'ops-store-host',
				since: Date.now(),
				deadline: Date.now() + 60_000
			})
			const trace: string[] = []
			const server = createWorkspaceDevServer(
				{ manifest, manifestDir: dir, persist: true },
				tracingDeps(trace)
			)
			const started = server.start().then(
				() => null,
				(error: CoordinatorLockError) => error
			)
			await Bun.sleep(700)
			expect(server.getMiniflare()).toBeNull()
			expect(trace).toEqual([])

			const stopAt = Date.now()
			await server.stop()
			const error = await started
			expect(Date.now() - stopAt).toBeLessThan(1_500)
			expect(error?.code).toBe('DEVFLARE_COORDINATOR_LOCK_ABORTED')
			expect(trace).toEqual([])
			expect(lockFreeNow(persistDir)).toBe(false)

			holder.kill('SIGKILL')
			await new Promise<void>((done) => holder.once('exit', () => done()))
			// The aborted coordinator kept nothing: once its holder is gone, the lock is free.
			const deadline = Date.now() + 10_000
			while (!lockFreeNow(persistDir) && Date.now() < deadline) await Bun.sleep(100)
			expect(lockFreeNow(persistDir)).toBe(true)
		},
		HOOK_TIMEOUT_MS
	)

	test(
		'stop() during startup waits for start() to give up before it releases the lock',
		async () => {
			const { dir, manifest } = await createWorkspace()
			const persistDir = resolve(dir, 'data')
			const trace: string[] = []
			let stopping: Promise<void> | null = null
			const server = createWorkspaceDevServer(
				{ manifest, manifestDir: dir, persist: true },
				tracingDeps(trace, {
					onLoadMiniflare: async () => {
						// Ctrl+C lands while the instance is being created…
						stopping = server.stop().then(() => {
							trace.push('stop:resolved')
						})
						// …and this startup step takes a while: a stop that did not wait would
						// finish its teardown, and release the lock, before start() noticed.
						await Bun.sleep(1_000)
					}
				})
			)
			const error = (await server.start().catch((e) => e)) as Error
			trace.push('start:settled')
			await stopping

			expect(error.message).toContain('stopped while it was starting')
			expect(trace).toEqual(['lock:taken', 'start:settled', 'lock:released', 'stop:resolved'])
			expect(server.getMiniflare()).toBeNull()
			expect(lockFreeNow(persistDir)).toBe(true)
		},
		HOOK_TIMEOUT_MS
	)
})
