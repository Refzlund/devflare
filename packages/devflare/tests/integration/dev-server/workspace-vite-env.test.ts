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
//
// REGRESSION, the same shape: the child built `platform.env` from the config's
// `vars` without resolving them, so a var declared with `env.NAME` reached the
// app as devflare's descriptor object. `descriptor` is such a var.
//
// REGRESSION: the coordinator copies every app's `.env` into its own
// `process.env` and ranks those copies below the resolving config's own `.env`.
// The child inherited them as plain environment, where they outranked it: a
// name a second app's `.env` also set resolved to THAT app's value in the
// child, and to this app's in its workers. A peer app, listed first so its
// `.env` is copied first, sets the names the `dotenv*` fields read.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import {
	createWorkspaceDevServer,
	type WorkspaceDevServer
} from '../../../src/dev-server/workspace/server'
import {
	cleanupTempDirs,
	ensurePackageBuilt,
	getAvailablePort
} from '../helpers/built-devflare.helpers'

const HOOK_TIMEOUT_MS = 120_000
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const caseDir = join(repoRoot, 'cases', 'case18')

/** The JSON `/api/workspace-env` answers with; see that route for each field. */
interface WorkspaceEnvPayload {
	processEnv: string | null
	inherited: string | null
	processEnvDotenvShared: string | null
	configSaw: string | null
	manifestOnly: string | null
	overridden: string | null
	descriptor: unknown
	dotenvShared: unknown
	dotenvPeerOnly: unknown
	dotenvManifest: unknown
}

/** Variables this test sets on its own process, restored afterwards. */
const coordinatorEnv = {
	// The manifest names this too, with a different value; the manifest's must win.
	CASE18_WORKSPACE_ENV: 'from-the-coordinator-shell',
	// Only the coordinator holds this; the child gets it by inheritance alone. The
	// config's `CASE18_DESCRIPTOR_VAR` is `env.CASE18_COORDINATOR_ONLY`. case18's
	// `.env.dev` sets it too, and loses: the environment outranks every `.env`.
	CASE18_COORDINATOR_ONLY: 'inherited-from-the-coordinator'
}

/**
 * The peer app's `.env`. The coordinator copies it into its own `process.env`
 * (this test's) before it reads case18, so the Vite child inherits every value.
 */
const peerDotenv = {
	CASE18_DOTENV_SHARED: 'from-the-peer-apps-env',
	CASE18_DOTENV_PEER_ONLY: 'only-in-the-peer-apps-env',
	CASE18_DOTENV_MANIFEST: 'from-the-peer-apps-env'
}

/**
 * case18's own `.env.dev`, written for this test alone. `.env.dev` rather than
 * `.env`, because wrangler's `.dev.vars` fallback reads `.env` into the vars of
 * every case18 config, and `.env.dev` is devflare's alone.
 */
const case18Dotenv = {
	CASE18_DOTENV_SHARED: 'from-case18s-own-env',
	CASE18_DOTENV_MANIFEST: 'from-case18s-own-env',
	CASE18_COORDINATOR_ONLY: 'from-case18s-own-env-and-it-loses'
}

/**
 * @description Renders a `.env` file.
 * @param values - the entries, by name
 * @returns the file's text
 */
function renderDotenv(values: Record<string, string>): string {
	return `${Object.entries(values)
		.map(([name, value]) => `${name}=${value}`)
		.join('\n')}\n`
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
	const tempDirs: string[] = []
	const case18DotenvPath = join(caseDir, '.env.dev')
	let wroteCase18Dotenv = false

	beforeAll(async () => {
		await ensurePackageBuilt()
		await syncSvelteKit(caseDir)

		// Every name the coordinator will set on this process, by its own hand or by copying a
		// `.env`, is restored afterwards.
		for (const key of [...Object.keys(coordinatorEnv), ...Object.keys(peerDotenv)]) {
			previousEnv[key] = process.env[key]
		}
		Object.assign(process.env, coordinatorEnv)

		const peerDir = await mkdtemp(join(tmpdir(), 'devflare-workspace-dotenv-peer-'))
		tempDirs.push(peerDir)
		await writeFile(
			join(peerDir, 'devflare.config.ts'),
			"export default { name: 'case18-dotenv-peer', compatibilityDate: '2026-04-27', files: { fetch: false } }\n"
		)
		await writeFile(join(peerDir, '.env'), renderDotenv(peerDotenv))
		// `wx` refuses an existing file in the same call that writes it. A developer's own is
		// never overwritten: it is gitignored, so nothing could restore it.
		try {
			await writeFile(case18DotenvPath, renderDotenv(case18Dotenv), { flag: 'wx' })
		} catch (error) {
			if ((error as { code?: unknown }).code === 'EEXIST') {
				throw new Error(`${case18DotenvPath} exists; this test writes its own. Move it aside.`, {
					cause: error
				})
			}
			throw error
		}
		wroteCase18Dotenv = true

		vitePort = await getAvailablePort()
		const bridgePort = await getAvailablePort()
		const peerPort = await getAvailablePort()

		devServer = createWorkspaceDevServer({
			manifest: {
				apps: [
					// First, so its `.env` is copied before case18's config is read. The test
					// asserts this, through `processEnvDotenvShared`.
					{
						config: join(peerDir, 'devflare.config.ts'),
						name: 'dotenv-peer',
						port: peerPort
					},
					{
						config: './devflare.workspace-env.config.ts',
						name: 'web',
						vite: true,
						vitePort,
						bridgePort,
						env: {
							CASE18_WORKSPACE_ENV: 'from-the-manifest',
							CASE18_STRING_VAR: 'manifest-overrides-config',
							CASE18_DOTENV_MANIFEST: 'from-the-manifest'
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
		try {
			if (devServer) {
				await devServer.stop()
			}
		} finally {
			for (const [key, value] of Object.entries(previousEnv)) {
				if (value === undefined) {
					delete process.env[key]
				} else {
					process.env[key] = value
				}
			}
			if (wroteCase18Dotenv) {
				await rm(case18DotenvPath, { force: true })
			}
			await cleanupTempDirs(tempDirs)
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
				// The premise of the `dotenv*` fields: the peer's `.env` was copied first, so its
				// value is the one the child inherits. The child's process.env still holds it.
				processEnvDotenvShared: 'from-the-peer-apps-env',
				configSaw: 'from-the-manifest',
				manifestOnly: 'from-the-manifest',
				overridden: 'manifest-overrides-config',
				descriptor: 'inherited-from-the-coordinator',
				// This app's own `.env` outranks a value copied from the peer's, as in its workers.
				dotenvShared: 'from-case18s-own-env',
				// A copied value still fills a name this app's own files lack.
				dotenvPeerOnly: 'only-in-the-peer-apps-env',
				// The manifest value is the child's environment, and outranks both files.
				dotenvManifest: 'from-the-manifest'
			})
		},
		HOOK_TIMEOUT_MS
	)

	// Windows only: there the child is a `bunx` shim whose kill() used to leave Vite
	// serving on the port after stop(). Elsewhere stop() signals the child alone,
	// as `devflare dev` does, and whether Vite exits depends on the shim.
	test.if(process.platform === 'win32')(
		'stopping the workspace ends the Vite child, not only its bunx shim',
		async () => {
			// Vite serves its own client module without SSR, so it never waits on the
			// bridge: once Miniflare is gone, an app route would sit out the bridge's
			// retry budget instead of answering, and read like a dead server.
			const url = `http://localhost:${vitePort}/@vite/client`
			// The premise: Vite is serving, so a refusal afterwards is the stop's doing.
			const before = await fetch(url, { signal: AbortSignal.timeout(10_000) })
			await before.text()
			expect(before.status).toBe(200)

			await devServer?.stop()
			devServer = null

			// A refused connection is the expected outcome, so it is a value here; a
			// timeout is not a refusal and must not pass for one.
			const outcome = await fetch(url, { signal: AbortSignal.timeout(5_000) }).then(
				() => 'answered',
				(error: unknown) =>
					error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'refused'
			)
			expect(outcome).toBe('refused')
		},
		HOOK_TIMEOUT_MS
	)
})
