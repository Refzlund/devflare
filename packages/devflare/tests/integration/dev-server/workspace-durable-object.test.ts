// =============================================================================
// Workspace dev — an app with a Durable Object boots in the merged instance
// =============================================================================
// REGRESSION: the coordinator namespaces every worker as `${appName}<sep>${name}`
// so two apps' `gateway`/main/DO workers stay distinct in one instance. The
// separator was originally `/`, which workerd TOLERATES for plain service
// names but ABORTS on for a Durable Object's host-worker (script) name —
// `*** std::terminate() called with no exception`, an uncatchable native crash
// at `miniflare.ready`. So ANY app with a DO (e.g. ui-dreamer's `apps/api`
// DocRoom) failed to boot in a workspace. This test co-hosts a DO app and
// proves it boots and the DO answers through the app's direct socket.
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
 * Scaffold a worker-only devflare app that owns a Durable Object `Counter`
 * (RPC method `ping`) and a `GET /ping` route that calls it through the binding.
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
	// compatibilityDate stays within what the repo's pinned miniflare/workerd
	// supports; the bug is about the DO worker NAME, independent of the date.
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

describe('workspace dev boots an app that owns a Durable Object', () => {
	let workspaceDir = ''
	let devServer: WorkspaceDevServer | null = null
	let port = 0

	beforeAll(async () => {
		workspaceDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-do-'))
		tempDirs.push(workspaceDir)
		port = await getAvailablePort()

		await createDurableObjectApp(join(workspaceDir, 'apps', 'do-app'), 'do-app')

		devServer = createWorkspaceDevServer({
			manifest: {
				apps: [{ config: './apps/do-app/devflare.config.ts', name: 'do-app', port }]
			},
			manifestDir: workspaceDir,
			persist: false
		})

		// The crash was here: `start()` never resolved (Miniflare aborted) with the
		// old `/` separator. With `-` it boots.
		await devServer.start()
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
	}, HOOK_TIMEOUT_MS)

	test('the co-hosted DO answers through the app’s direct socket', async () => {
		const value = await waitForResponseText(`http://127.0.0.1:${port}/ping`, 'DO_PONG')
		expect(value).toBe('DO_PONG')
	})

	test('the app is exposed on its own browser origin', () => {
		const origins = devServer?.getAppOrigins() ?? []
		expect(origins).toHaveLength(1)
		expect(origins[0].url).toContain(String(port))
	})
})
