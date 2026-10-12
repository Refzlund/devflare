// =============================================================================
// An ABSOLUTE `DEVFLARE_DIR` outside the app — `workspace dev` and `devflare dev`
// =============================================================================
// REGRESSION, twice over:
//
// 1. Every worker's `modulesRoot` was the app directory, while the bundles devflare
//    runs live in the generated-state directory. An absolute `DEVFLARE_DIR` outside
//    the app moved them out from under the root, and `start()` refused with
//    "Module … lies outside the worker's modules root".
// 2. With that fixed, a workspace's apps all resolved the same absolute directory,
//    so each wrote its bundle to ONE path and every app served the last one's code.
//    Each app now gets `<DEVFLARE_DIR>/<its path below the manifest>`.
//
// The two apps below answer with their own names through a route AND through a
// Durable Object bound under the same name in both, so a shared main bundle or a
// shared `do-bundles/` would each make one app answer with the other's name.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'
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
const previousOverride = process.env[GENERATED_DIR_ENV]

/** Put `DEVFLARE_DIR` back as this file found it. */
function restoreOverride(): void {
	if (previousOverride === undefined) delete process.env[GENERATED_DIR_ENV]
	else process.env[GENERATED_DIR_ENV] = previousOverride
}

/**
 * Scaffold a worker-only app whose `GET /who` answers `<tag>` and whose
 * `GET /do` answers `<tag>_DO` through a Durable Object bound as `COUNTER`.
 */
async function createTaggedApp(dir: string, name: string, tag: string): Promise<void> {
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
		return '${tag}_DO'
	}
}
`.trim()
	)
	await writeFile(
		join(dir, 'src', 'routes', 'who.ts'),
		`
export async function GET() {
	return new Response('${tag}')
}
`.trim()
	)
	await writeFile(
		join(dir, 'src', 'routes', 'do.ts'),
		`
export async function GET(event) {
	const stub = event.env.COUNTER.get(event.env.COUNTER.idFromName('singleton'))
	return new Response(await stub.ping())
}
`.trim()
	)
}

afterAll(async () => {
	restoreOverride()
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

describe('workspace dev with an absolute DEVFLARE_DIR outside its apps', () => {
	let workspaceDir = ''
	let generatedRoot = ''
	let devServer: WorkspaceDevServer | null = null
	let portA = 0
	let portB = 0

	beforeAll(async () => {
		workspaceDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-absdir-'))
		// A SIBLING temp directory, so the generated state shares no directory
		// with the apps below the temp root.
		generatedRoot = await mkdtemp(join(tmpdir(), 'devflare-generated-absdir-'))
		tempDirs.push(workspaceDir, generatedRoot)
		portA = await getAvailablePort()
		portB = await getAvailablePort()

		await createTaggedApp(join(workspaceDir, 'apps', 'a'), 'app-a', 'I_AM_A')
		await createTaggedApp(join(workspaceDir, 'apps', 'b'), 'app-b', 'I_AM_B')

		process.env[GENERATED_DIR_ENV] = generatedRoot
		devServer = createWorkspaceDevServer({
			manifest: {
				apps: [
					{ config: './apps/a/devflare.config.ts', name: 'app-a', port: portA },
					{ config: './apps/b/devflare.config.ts', name: 'app-b', port: portB }
				]
			},
			manifestDir: workspaceDir,
			persist: false
		})

		try {
			await devServer.start()
		} catch (error) {
			restoreOverride()
			throw error
		}
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
		restoreOverride()
	}, HOOK_TIMEOUT_MS)

	test("each app's route answers with its own code", async () => {
		expect(await waitForResponseText(`http://127.0.0.1:${portA}/who`, 'I_AM_A')).toBe('I_AM_A')
		expect(await waitForResponseText(`http://127.0.0.1:${portB}/who`, 'I_AM_B')).toBe('I_AM_B')
	})

	test("each app's Durable Object answers with its own code", async () => {
		expect(await waitForResponseText(`http://127.0.0.1:${portA}/do`, 'I_AM_A_DO')).toBe('I_AM_A_DO')
		expect(await waitForResponseText(`http://127.0.0.1:${portB}/do`, 'I_AM_B_DO')).toBe('I_AM_B_DO')
	})

	test("each app's bundles sit under the override, at its path below the manifest", async () => {
		for (const app of ['a', 'b']) {
			const written = await readdir(join(generatedRoot, 'apps', app))
			expect(written).toEqual(expect.arrayContaining(['worker-entrypoints', 'do-bundles']))
			expect(await readdir(join(workspaceDir, 'apps', app))).not.toContain('.devflare')
		}
	})
})

describe('devflare dev with an absolute DEVFLARE_DIR outside the app', () => {
	let projectDir = ''
	let generatedRoot = ''
	let devServer: DevServer | null = null
	let port = 0

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-dev-absdir-'))
		generatedRoot = await mkdtemp(join(tmpdir(), 'devflare-dev-generated-absdir-'))
		tempDirs.push(projectDir, generatedRoot)
		port = await getAvailablePort()

		await createTaggedApp(projectDir, 'solo', 'I_AM_SOLO')

		process.env[GENERATED_DIR_ENV] = generatedRoot
		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		try {
			await devServer.start()
		} catch (error) {
			restoreOverride()
			throw error
		}
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
		restoreOverride()
	}, HOOK_TIMEOUT_MS)

	test('the route and its Durable Object answer', async () => {
		expect(await waitForResponseText(`http://127.0.0.1:${port}/who`, 'I_AM_SOLO')).toBe('I_AM_SOLO')
		expect(await waitForResponseText(`http://127.0.0.1:${port}/do`, 'I_AM_SOLO_DO')).toBe(
			'I_AM_SOLO_DO'
		)
	})

	test('the bundles sit directly under the override, not inside the app', async () => {
		expect(await readdir(generatedRoot)).toEqual(expect.arrayContaining(['worker-entrypoints']))
		expect(await readdir(projectDir)).not.toContain('.devflare')
	})
})
