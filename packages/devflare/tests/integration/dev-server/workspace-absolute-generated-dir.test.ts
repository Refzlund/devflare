// =============================================================================
// Workspace dev — an ABSOLUTE `DEVFLARE_DIR` outside the app still serves
// =============================================================================
// REGRESSION: every worker's `modulesRoot` was the app directory (or its
// `baseDir`), while the bundles devflare runs live in the generated-state
// directory. An absolute `DEVFLARE_DIR` outside the app moved those bundles out
// from under the root, and `start()` refused with "Module … lies outside the
// worker's modules root". `generatedDirName` documents an absolute override as
// supported, so this boots an app with a route AND a Durable Object (two
// bundles in two generated subdirectories) and asks both to answer.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	createWorkspaceDevServer,
	type WorkspaceDevServer
} from '../../../src/dev-server/workspace/server'
import { GENERATED_DIR_ENV } from '../../../src/utils/generated-dir'
import {
	cleanupTempDirs,
	getAvailablePort,
	installBuiltDevflare,
	waitForResponseText
} from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const HOOK_TIMEOUT_MS = 90_000

/**
 * Scaffold a worker-only app with a `GET /ping` route that answers through a
 * Durable Object, so both the main bundle and a DO bundle must load.
 */
async function createDurableObjectApp(dir: string, name: string): Promise<void> {
	await mkdir(join(dir, 'src', 'routes'), { recursive: true })
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
	compatibilityDate: '2026-04-28',
	files: { routes: { dir: 'src/routes' }, durableObjects: 'src/do.*.ts' },
	bindings: { durableObjects: { COUNTER: 'Counter' } }
}
`.trim()
	)
	await writeFile(
		join(dir, 'src', 'do.counter.ts'),
		`
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	async ping(): Promise<string> {
		return 'DO_PONG'
	}
}
`.trim()
	)
	await writeFile(
		join(dir, 'src', 'routes', 'ping.ts'),
		`
export async function GET(event) {
	const id = event.env.COUNTER.idFromName('singleton')
	const stub = event.env.COUNTER.get(id)
	return new Response(await stub.ping())
}
`.trim()
	)
}

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

describe('workspace dev with an absolute DEVFLARE_DIR outside the app', () => {
	let workspaceDir = ''
	let generatedRoot = ''
	let devServer: WorkspaceDevServer | null = null
	let port = 0
	const previousOverride = process.env[GENERATED_DIR_ENV]

	beforeAll(async () => {
		workspaceDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-absdir-'))
		// A SIBLING temp directory, so the generated state shares no directory
		// with the app below the temp root.
		generatedRoot = await mkdtemp(join(tmpdir(), 'devflare-generated-absdir-'))
		tempDirs.push(workspaceDir, generatedRoot)
		port = await getAvailablePort()

		await createDurableObjectApp(join(workspaceDir, 'apps', 'do-app'), 'do-app')

		process.env[GENERATED_DIR_ENV] = generatedRoot
		devServer = createWorkspaceDevServer({
			manifest: {
				apps: [{ config: './apps/do-app/devflare.config.ts', name: 'do-app', port }]
			},
			manifestDir: workspaceDir,
			persist: false
		})

		await devServer.start()
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
		if (previousOverride === undefined) delete process.env[GENERATED_DIR_ENV]
		else process.env[GENERATED_DIR_ENV] = previousOverride
	}, HOOK_TIMEOUT_MS)

	test('the route and its Durable Object answer', async () => {
		const value = await waitForResponseText(`http://127.0.0.1:${port}/ping`, 'DO_PONG')
		expect(value).toBe('DO_PONG')
	})

	test('the bundles were written under the override, not inside the app', async () => {
		const written = await readdir(generatedRoot)
		expect(written).toEqual(expect.arrayContaining(['worker-entrypoints', 'do-bundles']))
		const appEntries = await readdir(join(workspaceDir, 'apps', 'do-app'))
		expect(appEntries).not.toContain('.devflare')
	})
})
