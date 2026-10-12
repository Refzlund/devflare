/*
	`createWorkspaceDevServer` holds the coordinator lock for its whole life:
	taken before anything opens the persist dir, released by `stop()` after
	Miniflare's dispose. A second coordinator on the same dir — started in another
	process, as it would be — is refused, naming the first.
*/
import { afterAll, describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'pathe'
import type { WorkspaceManifest } from '../../../src/config/workspace'
import {
	coordinatorLockNotePath,
	coordinatorLockPath,
	readCoordinatorLockNote
} from '../../../src/dev-server/workspace/coordinator-lock'
import { createWorkspaceDevServer } from '../../../src/dev-server/workspace/server'
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

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

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
})
