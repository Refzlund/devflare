// =============================================================================
// Workspace dev — each Vite child is started inside its OWN generated root
// =============================================================================
// When `DEVFLARE_DIR` lands outside a workspace's apps, the coordinator prepares
// each app under `<DEVFLARE_DIR>/<its path below the manifest>`. A Vite app's
// child runs devflare too, and writes generated files of its own, so it has to
// be handed that same directory as its `DEVFLARE_DIR`. Without it every child
// inherits the shared override and two Vite apps write one
// `worker-entrypoints/main.ts`, the cross-wiring the per-app root exists to stop.
//
// No real Vite is started: the server's `startViteProcess` seam records what
// each child would be started with, and hands back an idle process for `stop()`
// to end.
// =============================================================================

import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import type { StartViteProcessOptions } from '../../../src/dev-server/vite-process'
import {
	createWorkspaceDevServer,
	type WorkspaceDevServer
} from '../../../src/dev-server/workspace/server'
import { GENERATED_DIR_ENV } from '../../../src/utils/generated-dir'
import { cleanupTempDirs, getAvailablePort } from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const HOOK_TIMEOUT_MS = 90_000
const previousOverride = process.env[GENERATED_DIR_ENV]

/** Put `DEVFLARE_DIR` back as this file found it. */
function restoreOverride(): void {
	if (previousOverride === undefined) delete process.env[GENERATED_DIR_ENV]
	else process.env[GENERATED_DIR_ENV] = previousOverride
}

let devServer: WorkspaceDevServer | null = null

afterEach(async () => {
	try {
		await devServer?.stop()
	} finally {
		devServer = null
		restoreOverride()
	}
}, HOOK_TIMEOUT_MS)

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, HOOK_TIMEOUT_MS)

/**
 * Scaffold a Vite app: a devflare config with no worker surface, and a Vite
 * config file, which is what makes the workspace start a child for it.
 */
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

/**
 * Start a two-Vite-app workspace under `override`, recording each child's options.
 *
 * @param override - the `DEVFLARE_DIR` to start it with
 * @returns the workspace directory and the options each Vite child got, keyed by the app's directory
 */
async function startTwoViteApps(
	override: string
): Promise<{ workspaceDir: string; started: Map<string, StartViteProcessOptions> }> {
	const workspaceDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-vite-root-'))
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

	const started = new Map<string, StartViteProcessOptions>()
	process.env[GENERATED_DIR_ENV] = override
	devServer = createWorkspaceDevServer(
		{ manifest: { apps }, manifestDir: workspaceDir, persist: false },
		{
			startViteProcess: async (options) => {
				started.set(options.cwd, options)
				// An idle child, so `stop()` has a real process tree to end.
				return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
					stdio: 'ignore'
				}) as ChildProcess
			}
		}
	)
	await devServer.start()
	return { workspaceDir, started }
}

describe('workspace dev hands each Vite child its own generated root', () => {
	test(
		'an override outside the apps: each child gets the subdirectory its config was written to',
		async () => {
			const generated = await mkdtemp(join(tmpdir(), 'devflare-generated-vite-root-'))
			tempDirs.push(generated)

			const { workspaceDir, started } = await startTwoViteApps(generated)

			expect(started.size).toBe(2)
			for (const name of ['web', 'admin']) {
				const options = started.get(join(workspaceDir, 'apps', name))
				expect(options?.generatedRoot).toBe(join(generated, 'apps', name))
				// The child must look where the coordinator wrote THIS app's files.
				expect(dirname(options?.generatedViteConfigPath ?? '')).toBe(join(generated, 'apps', name))
			}
		},
		HOOK_TIMEOUT_MS
	)

	test(
		'an override that stays inside each app: no child is given a root of its own',
		async () => {
			const { workspaceDir, started } = await startTwoViteApps('.devflare-e2e')

			expect(started.size).toBe(2)
			for (const name of ['web', 'admin']) {
				const options = started.get(join(workspaceDir, 'apps', name))
				expect(options).toBeDefined()
				expect(options?.generatedRoot).toBeUndefined()
				expect(dirname(options?.generatedViteConfigPath ?? '')).toBe(
					join(workspaceDir, 'apps', name, '.devflare-e2e')
				)
			}
		},
		HOOK_TIMEOUT_MS
	)
})
