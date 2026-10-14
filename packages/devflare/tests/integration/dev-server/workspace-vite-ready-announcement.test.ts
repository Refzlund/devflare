// =============================================================================
// Workspace dev — "Workspace ready" waits for every Vite app, through the server
// =============================================================================
// `announceWorkspaceReady` is graded on its own in the unit lane; this grades the
// server's USE of it. A slow Vite app used to be claimed ready about ten seconds
// before it served, because `start()` printed "Workspace ready" unconditionally.
//
// No real Vite is started: the `startViteProcess` seam hands back an idle process
// with a readiness the test decides — `web` serving at once, `admin` still
// starting, then exiting before it ever serves.
// =============================================================================

import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { ConsolaInstance } from 'consola'
import { join } from 'pathe'
import type {
	StartViteProcessOptions,
	ViteProcessHandle
} from '../../../src/dev-server/vite-process'
import type { ViteReadyOutcome } from '../../../src/dev-server/vite-utils'
import {
	createWorkspaceDevServer,
	type WorkspaceDevServer
} from '../../../src/dev-server/workspace/server'
import { cleanupTempDirs, getAvailablePort } from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const HOOK_TIMEOUT_MS = 90_000

let devServer: WorkspaceDevServer | null = null

afterEach(async () => {
	try {
		await devServer?.stop()
	} finally {
		devServer = null
	}
}, HOOK_TIMEOUT_MS)

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

/** Scaffold a Vite app: no worker surface, and a Vite config, so the workspace starts a child. */
async function createViteApp(dir: string, name: string): Promise<void> {
	await mkdir(dir, { recursive: true })
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ name, private: true, type: 'module' }, null, 2)
	)
	await writeFile(
		join(dir, 'devflare.config.ts'),
		`export default { name: '${name}', compatibilityDate: '2026-04-28', files: { fetch: false } }\n`
	)
	await writeFile(join(dir, 'vite.config.ts'), 'export default {}\n')
}

/** A logger recording `level: message` lines for the methods the dev server calls. */
function recordingLogger(): { logger: ConsolaInstance; lines: string[] } {
	const lines: string[] = []
	const at =
		(level: string) =>
		(...args: unknown[]) => {
			lines.push(`${level}: ${args.map(String).join(' ')}`)
		}
	// A plain object rather than a Proxy: a Proxy answering every property would
	// also answer `then`, and turn the logger into a thenable.
	const logger = {
		info: at('info'),
		warn: at('warn'),
		debug: at('debug'),
		success: at('success'),
		error: at('error'),
		log: at('log')
	} as unknown as ConsolaInstance
	return { logger, lines }
}

describe('workspace dev announces ready only once every Vite app serves', () => {
	test(
		'a Vite app still starting is named, and one that exits is never called ready',
		async () => {
			const workspaceDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-vite-ready-'))
			tempDirs.push(workspaceDir)
			await createViteApp(join(workspaceDir, 'apps', 'web'), 'web')
			await createViteApp(join(workspaceDir, 'apps', 'admin'), 'admin')

			const apps = await Promise.all(
				['web', 'admin'].map(async (name) => ({
					config: `./apps/${name}/devflare.config.ts`,
					name,
					vite: true,
					vitePort: await getAvailablePort(),
					bridgePort: await getAvailablePort()
				}))
			)

			const { logger, lines } = recordingLogger()
			const started = new Map<string, StartViteProcessOptions>()
			let failAdmin!: (outcome: ViteReadyOutcome) => void
			let adminOutcome: ViteReadyOutcome | null = null

			devServer = createWorkspaceDevServer(
				{ manifest: { apps }, manifestDir: workspaceDir, persist: false, logger },
				{
					startViteProcess: async (options): Promise<ViteProcessHandle> => {
						started.set(options.appName ?? '?', options)
						// An idle child, so `stop()` has a real process tree to end.
						const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
							stdio: 'ignore'
						}) as ChildProcess
						if (options.appName === 'web') {
							const outcome = { status: 'ready', url: 'http://127.0.0.1:5173/' } as const
							return { child, ready: Promise.resolve(outcome), outcome }
						}
						const ready = new Promise<ViteReadyOutcome>((resolve) => {
							failAdmin = (outcome) => {
								adminOutcome = outcome
								resolve(outcome)
							}
						})
						return {
							child,
							ready,
							get outcome() {
								return adminOutcome
							}
						}
					}
				}
			)
			await devServer.start()

			// Each child is named, and told how to ask whether the workspace is stopping.
			expect([...started.keys()].sort()).toEqual(['admin', 'web'])
			expect(started.get('admin')?.isStopping?.()).toBe(false)

			const workspaceLines = () => lines.filter((line) => line.includes('Workspace '))
			expect(workspaceLines().some((line) => line.includes('Workspace ready'))).toBe(false)
			expect(
				workspaceLines().some(
					(line) =>
						line.startsWith('info: Workspace started — 2 app(s)') &&
						line.endsWith('waiting for Vite: "admin"')
				)
			).toBe(true)

			failAdmin({ status: 'failed', error: new Error('exit code 1') })
			await Bun.sleep(0)

			expect(workspaceLines().some((line) => line.includes('Workspace ready'))).toBe(false)
			expect(workspaceLines().at(-1)).toStartWith('warn: Workspace running — 2 app(s)')
			expect(workspaceLines().at(-1)).toContain('Vite for "admin" exited before it became ready')

			await devServer.stop()
			expect(started.get('admin')?.isStopping?.()).toBe(true)
			devServer = null
		},
		HOOK_TIMEOUT_MS
	)
})
