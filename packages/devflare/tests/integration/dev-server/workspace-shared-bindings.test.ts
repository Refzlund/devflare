// =============================================================================
// Workspace dev — shared live bindings across two apps
// =============================================================================
// Proves the core thesis of `devflare workspace dev`: two separate apps, both
// binding the SAME D1 id, co-hosted in ONE Miniflare instance, each on its own
// browser origin (direct socket). A write via app A's origin is immediately
// visible via app B's origin — live-shared storage, not two isolated stores.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	type WorkspaceDevServer,
	createWorkspaceDevServer
} from '../../../src/dev-server/workspace/server'
import {
	cleanupTempDirs,
	getAvailablePort,
	installBuiltDevflare,
	waitForResponseText
} from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const HOOK_TIMEOUT_MS = 90_000

/**
 * Scaffold a worker-only devflare app whose routes read/write a `kv` table on
 * the D1 binding `PLATFORM_DB` (bound to `d1Id`). `GET /write/:value` upserts a
 * fixed key; `GET /read` returns it.
 */
async function createWorkerApp(dir: string, name: string, d1Id: string): Promise<void> {
	await mkdir(join(dir, 'src', 'routes', 'write'), { recursive: true })
	await installBuiltDevflare(dir)

	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ name, private: true, type: 'module' }, null, 2)
	)
	await writeFile(
		join(dir, 'tsconfig.json'),
		JSON.stringify(
			{ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'Bundler' } },
			null,
			2
		)
	)
	await writeFile(
		join(dir, 'devflare.config.ts'),
		`
export default {
	name: '${name}',
	compatibilityDate: '2026-03-17',
	files: { routes: { dir: 'src/routes' } },
	bindings: { d1: { PLATFORM_DB: '${d1Id}' } }
}
`.trim()
	)
	await writeFile(
		join(dir, 'src', 'routes', 'write', '[value].ts'),
		`
export async function GET(event) {
	await event.env.PLATFORM_DB.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)').run()
	await event.env.PLATFORM_DB
		.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)')
		.bind('shared-key', event.params.value)
		.run()
	return new Response('wrote:' + event.params.value)
}
`.trim()
	)
	await writeFile(
		join(dir, 'src', 'routes', 'read.ts'),
		`
export async function GET(event) {
	await event.env.PLATFORM_DB.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)').run()
	const row = await event.env.PLATFORM_DB.prepare('SELECT v FROM kv WHERE k = ?').bind('shared-key').first()
	return new Response(row ? String(row.v) : '(none)')
}
`.trim()
	)
}

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

describe('workspace dev shares live D1 across two apps', () => {
	let workspaceDir = ''
	let devServer: WorkspaceDevServer | null = null
	let portA = 0
	let portB = 0

	beforeAll(async () => {
		workspaceDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-'))
		tempDirs.push(workspaceDir)
		portA = await getAvailablePort()
		portB = await getAvailablePort()

		// Both apps bind the SAME D1 id — that is the whole point.
		await createWorkerApp(join(workspaceDir, 'apps', 'a'), 'ws-app-a', 'shared-platform')
		await createWorkerApp(join(workspaceDir, 'apps', 'b'), 'ws-app-b', 'shared-platform')

		devServer = createWorkspaceDevServer({
			manifest: {
				apps: [
					{ config: './apps/a/devflare.config.ts', name: 'app-a', port: portA },
					{ config: './apps/b/devflare.config.ts', name: 'app-b', port: portB }
				],
				shared: { d1: ['PLATFORM_DB'] }
			},
			manifestDir: workspaceDir,
			persist: false
		})

		await devServer.start()

		// Wait for both apps' gateways to be reachable on their direct sockets.
		await waitForResponseText(`http://127.0.0.1:${portA}/read`, '(none)')
		await waitForResponseText(`http://127.0.0.1:${portB}/read`, '(none)')
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
	}, HOOK_TIMEOUT_MS)

	test('a write through app A is immediately visible through app B', async () => {
		// Write via app A's browser origin.
		const writeResponse = await fetch(`http://127.0.0.1:${portA}/write/hello-shared`)
		expect(writeResponse.status).toBe(200)
		expect(await writeResponse.text()).toBe('wrote:hello-shared')

		// Read via app B's browser origin — sees app A's write LIVE (one store).
		const readValue = await waitForResponseText(`http://127.0.0.1:${portB}/read`, 'hello-shared')
		expect(readValue).toBe('hello-shared')
	})

	test('reverse direction also shares (B writes, A reads)', async () => {
		const writeResponse = await fetch(`http://127.0.0.1:${portB}/write/from-b`)
		expect(writeResponse.status).toBe(200)

		const readValue = await waitForResponseText(`http://127.0.0.1:${portA}/read`, 'from-b')
		expect(readValue).toBe('from-b')
	})

	test('each app is exposed on its own distinct browser origin', () => {
		const origins = devServer?.getAppOrigins() ?? []
		expect(origins).toHaveLength(2)

		const urls = origins.map((origin) => origin.url)
		expect(new Set(urls).size).toBe(2)
		expect(urls.some((url) => url.includes(String(portA)))).toBe(true)
		expect(urls.some((url) => url.includes(String(portB)))).toBe(true)
	})
})
