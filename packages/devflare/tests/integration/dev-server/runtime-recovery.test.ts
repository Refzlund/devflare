// =============================================================================
// The dev server survives losing its runtime
// =============================================================================
// Miniflare runs the worker in a workerd child that can die on its own. Nothing
// used to watch for that: the coordinator and Vite kept running, every request
// failed to reach the bridge, and the app served "<BINDING> ... is missing"
// forever with no log explaining why and no way back short of a restart.
//
// Disposing Miniflare behind the dev server's back reproduces that state
// exactly — the instance is gone and the server was never told.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { type DevServer, createDevServer } from '../../../src/dev-server'
import {
	getAvailablePort,
	installBuiltDevflare,
	waitForResponseText
} from '../helpers/built-devflare.helpers'

const HOOK_TIMEOUT_MS = 30_000
/** Detection is 3 probes at 2s, then a full Miniflare rebuild — with headroom for a loaded machine. */
const RECOVERY_TIMEOUT_MS = 45_000

describe('dev server runtime recovery', () => {
	let projectDir = ''
	let devServer: DevServer | null = null
	let workerUrl = ''

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-runtime-recovery-'))
		const port = await getAvailablePort()
		workerUrl = `http://127.0.0.1:${port}/`
		const localDefineConfigImportPath = join(
			dirname(fileURLToPath(import.meta.url)),
			'../../../src/index.ts'
		).replace(/\\/g, '/')

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await installBuiltDevflare(projectDir)

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'runtime-recovery-test', private: true, type: 'module' }, null, 2)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
import { defineConfig } from '${localDefineConfigImportPath}'

export default defineConfig({
	name: 'runtime-recovery-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})
`
		)

		await writeFile(
			join(projectDir, 'src', 'fetch.ts'),
			`
export default async function fetch() {
	return new Response('alive')
}
`
		)

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		await devServer.start()
		await waitForResponseText(workerUrl, 'alive')
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	}, HOOK_TIMEOUT_MS)

	/** The instance that was killed, kept so the rebuild can be shown to have replaced it. */
	let deadRuntime: ReturnType<NonNullable<typeof devServer>['getMiniflare']> = null

	test(
		'rebuilds the runtime after it goes away without the dev server being told',
		async () => {
			deadRuntime = devServer?.getMiniflare() ?? null
			expect(deadRuntime).toBeTruthy()

			// The runtime dies; nothing in the dev server initiated it.
			await deadRuntime?.dispose()

			await expect(fetch(workerUrl).then((r) => r.text())).rejects.toThrow()

			// The watchdog should notice and rebuild, with no restart and no intervention.
			expect(await waitForResponseText(workerUrl, 'alive', RECOVERY_TIMEOUT_MS)).toBe('alive')
		},
		RECOVERY_TIMEOUT_MS + HOOK_TIMEOUT_MS
	)

	test('the dev server now owns the rebuilt instance, not the dead one', async () => {
		const runtime = devServer?.getMiniflare()
		expect(runtime).toBeTruthy()

		// Serving again is not enough on its own — any listener on the port satisfies a fetch. The
		// dev server must have adopted the NEW instance, or its next reload would reconfigure a corpse.
		expect(runtime).not.toBe(deadRuntime)

		// And the adopted instance is genuinely usable: a disposed Miniflare throws here.
		const direct = await runtime?.dispatchFetch(workerUrl)
		expect(direct?.status).toBe(200)
		expect(await direct?.text()).toBe('alive')
	})
})
