// =============================================================================
// Workspace dev — a Vite app's manifest `env` reaches the Vite child
// =============================================================================
// REGRESSION: `devflare workspace dev` accepted a per-app `env` on a Vite app and
// gave it only to the app's workers in the shared instance. A Vite app is served
// by its Vite child, which evaluates the app's config itself and builds
// `platform.env` in-process, so the manifest's values never arrived: an app whose
// config read `process.env.DOC_API_ORIGIN` answered with the config's default.
//
// case18 (SvelteKit 2, devflare's `handle`) is served through a workspace whose
// manifest sets one value the config reads from `process.env`, and overrides one
// of the config's `vars`. `/api/workspace-env` reports what the child saw.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import {
	createWorkspaceDevServer,
	type WorkspaceDevServer
} from '../../../src/dev-server/workspace/server'
import { ensurePackageBuilt, getAvailablePort } from '../helpers/built-devflare.helpers'

const HOOK_TIMEOUT_MS = 120_000
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const caseDir = join(repoRoot, 'cases', 'case18')

/** The JSON `/api/workspace-env` answers with; see that route for each field. */
interface WorkspaceEnvPayload {
	processEnv: string | null
	inherited: string | null
	configSaw: string | null
	manifestOnly: string | null
	overridden: string | null
}

/** Variables this test sets on its own process, restored afterwards. */
const coordinatorEnv = {
	// The manifest names this too, with a different value; the manifest's must win.
	CASE18_WORKSPACE_ENV: 'from-the-coordinator-shell',
	// Only the coordinator holds this; the child gets it by inheritance alone.
	CASE18_COORDINATOR_ONLY: 'inherited-from-the-coordinator'
}

/**
 * Generate case18's `.svelte-kit` files, which its tsconfig and Vite config extend.
 *
 * @param dir - the SvelteKit project to sync
 * @throws {Error} When `svelte-kit sync` exits non-zero, carrying its output.
 */
async function syncSvelteKit(dir: string): Promise<void> {
	const sync = Bun.spawn(['bun', 'run', 'svelte-kit', 'sync'], {
		cwd: dir,
		stdout: 'pipe',
		stderr: 'pipe'
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(sync.stdout).text(),
		new Response(sync.stderr).text(),
		sync.exited
	])
	if (exitCode !== 0) {
		throw new Error(['svelte-kit sync failed', stdout.trim(), stderr.trim()].join('\n\n'))
	}
}

/**
 * Poll a JSON endpoint until it answers 200, for a Vite child that is still compiling.
 *
 * @param url - the endpoint
 * @param timeoutMs - how long to keep asking
 * @returns the parsed body
 * @throws {Error} The last failure, when the endpoint never answered 200 in time.
 */
async function waitForJson<T>(url: string, timeoutMs = 60_000): Promise<T> {
	const deadline = Date.now() + timeoutMs
	let lastError: unknown = null

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url)
			const text = await response.text()
			if (response.ok) {
				return JSON.parse(text) as T
			}
			lastError = new Error(`HTTP ${response.status}: ${text}`)
		} catch (error) {
			lastError = error
		}
		await Bun.sleep(300)
	}

	throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`)
}

describe("workspace dev hands a Vite app's manifest env to its Vite child", () => {
	let devServer: WorkspaceDevServer | null = null
	let vitePort = 0
	const previousEnv: Record<string, string | undefined> = {}

	beforeAll(async () => {
		await ensurePackageBuilt()
		await syncSvelteKit(caseDir)

		for (const [key, value] of Object.entries(coordinatorEnv)) {
			previousEnv[key] = process.env[key]
			process.env[key] = value
		}

		vitePort = await getAvailablePort()
		const bridgePort = await getAvailablePort()

		devServer = createWorkspaceDevServer({
			manifest: {
				apps: [
					{
						config: './devflare.workspace-env.config.ts',
						name: 'web',
						vite: true,
						vitePort,
						bridgePort,
						env: {
							CASE18_WORKSPACE_ENV: 'from-the-manifest',
							CASE18_STRING_VAR: 'manifest-overrides-config'
						}
					}
				]
			},
			manifestDir: caseDir,
			persist: false
		})

		await devServer.start()
	}, HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
		for (const [key, value] of Object.entries(previousEnv)) {
			if (value === undefined) {
				delete process.env[key]
			} else {
				process.env[key] = value
			}
		}
	}, HOOK_TIMEOUT_MS)

	test(
		'the child sees it in process.env, the config reads it, and platform.env layers it over vars',
		async () => {
			const payload = await waitForJson<WorkspaceEnvPayload>(
				`http://localhost:${vitePort}/api/workspace-env`
			)

			expect(payload).toEqual({
				processEnv: 'from-the-manifest',
				inherited: 'inherited-from-the-coordinator',
				configSaw: 'from-the-manifest',
				manifestOnly: 'from-the-manifest',
				overridden: 'manifest-overrides-config'
			})
		},
		HOOK_TIMEOUT_MS
	)
})
