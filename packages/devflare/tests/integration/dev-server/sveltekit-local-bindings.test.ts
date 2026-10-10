// =============================================================================
// SvelteKit local binding matrix — SvelteKit 2 and SvelteKit 3
// =============================================================================
// One matrix of local bindings, served by `devflare dev` to two apps: case18 on
// SvelteKit 2, which reads them from devflare's runtime `env` and
// `event.platform`, and case20 on SvelteKit 3, which reads them from
// `cloudflare:workers`. Each app answers with the same shape, so both are held
// to the same assertions.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'
import {
	deleteLocalSecret,
	readLocalSecret,
	writeLocalSecret
} from '../../../src/secrets/local-secrets'
import { ensurePackageBuilt, getAvailablePort } from '../helpers/built-devflare.helpers'
import { createCapturedLogger } from './worker-only-multi-surface.helpers'

const TEST_TIMEOUT_MS = 60_000
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')

interface LocalBindingsPayload {
	secret: string
	hyperdrive: { connectionString: string; database: string }
	workflow: { id: string; status: string }
	images: { width: number; contentType: string; status: number }
	media: { contentType: string; status: number }
	workerLoader: { status: number; text: string }
	email: string
}

/** One SvelteKit app serving the matrix. Every name it uses is prefixed with `caseName`. */
interface SvelteKitCase {
	/** The case directory under `cases/`, and the prefix of every value it answers with. */
	caseName: string
	/** What the case proves, for the describe block. */
	title: string
	/** The devflare config that declares the matrix. */
	configPath: string
}

const svelteKitCases: SvelteKitCase[] = [
	{
		caseName: 'case18',
		title: 'SvelteKit 2, reading devflare env and event.platform',
		configPath: 'devflare.local-bindings.config.ts'
	},
	{
		caseName: 'case20',
		title: 'SvelteKit 3, reading cloudflare:workers',
		configPath: 'devflare.config.ts'
	}
]

async function waitForJson<T>(url: string, timeoutMs = 30_000): Promise<T> {
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

	throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for JSON from ${url}`)
}

async function syncSvelteKitCase(caseDir: string): Promise<void> {
	const sync = Bun.spawn(['bun', 'run', 'svelte-kit', 'sync'], {
		cwd: caseDir,
		stdout: 'pipe',
		stderr: 'pipe'
	})

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(sync.stdout).text(),
		new Response(sync.stderr).text(),
		sync.exited
	])

	if (exitCode !== 0) {
		throw new Error(
			['SvelteKit sync failed', stdout.trim(), stderr.trim()].filter(Boolean).join('\n\n')
		)
	}
}

for (const { caseName, title, configPath } of svelteKitCases) {
	const caseDir = join(repoRoot, 'cases', caseName)
	const localSecretRef = {
		cwd: caseDir,
		storeId: `${caseName}-local-store`,
		name: 'api-token'
	}

	describe(`${caseName} SvelteKit local binding matrix — ${title}`, () => {
		let devServer: DevServer | null = null
		let vitePort = 0
		let miniflarePort = 0
		let previousSecret: string | undefined

		beforeAll(async () => {
			previousSecret = readLocalSecret(localSecretRef)
			writeLocalSecret({
				...localSecretRef,
				value: `${caseName}-secret-value`
			})
			await ensurePackageBuilt()
			await syncSvelteKitCase(caseDir)

			vitePort = await getAvailablePort()
			miniflarePort = await getAvailablePort()
			const logger = createCapturedLogger()

			devServer = createDevServer({
				cwd: caseDir,
				configPath,
				vitePort,
				miniflarePort,
				enableVite: true,
				persist: false,
				logger: logger as never
			})

			await devServer.start()
		}, TEST_TIMEOUT_MS)

		afterAll(async () => {
			if (devServer) {
				await devServer.stop()
			}

			if (previousSecret === undefined) {
				deleteLocalSecret(localSecretRef)
			} else {
				writeLocalSecret({
					...localSecretRef,
					value: previousSecret
				})
			}
		}, TEST_TIMEOUT_MS)

		test(
			'returns expected results from a SvelteKit API route',
			async () => {
				const payload = await waitForJson<LocalBindingsPayload>(
					`http://localhost:${vitePort}/api/local-bindings`
				)

				expect(payload.secret).toBe(`${caseName}-secret-value`)
				expect(payload.hyperdrive).toEqual({
					connectionString: `postgres://${caseName}:password@localhost:5432/${caseName}`,
					database: caseName
				})
				expect(payload.workflow.id).toBe(`${caseName}-order-1`)
				expect(['queued', 'running', 'complete', 'waiting']).toContain(payload.workflow.status)
				expect(payload.images).toEqual({
					width: 1,
					contentType: 'image/png',
					status: 200
				})
				expect(payload.media).toEqual({
					contentType: 'video/mp4',
					status: 200
				})
				expect(payload.workerLoader).toEqual({
					status: 200,
					text: `${caseName}-loader-ok`
				})
				expect(payload.email).toBe('sent')
			},
			TEST_TIMEOUT_MS
		)

		test(
			'submits a SvelteKit server action that calls a ref service binding fetch',
			async () => {
				const response = await fetch(`http://localhost:${vitePort}/service-action`, {
					method: 'POST',
					headers: {
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({
						email: 'creator@example.com'
					}),
					redirect: 'manual'
				})
				const body = await response.text()

				// Compared decoded: SvelteKit 2's cookie library percent-encodes the `@`, SvelteKit 3's does not.
				const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]

				expect(response.status).toBe(200)
				expect(decodeURIComponent(cookie)).toBe(`${caseName}-service-action=creator@example.com`)
				expect(body).toContain('creator@example.com')
				expect(body).toContain(`${caseName}-api`)
				expect(body).toContain('service-fetch')
				expect(body).toContain(`${caseName}-var-value`)
				expect(body).toContain('undefined')
			},
			TEST_TIMEOUT_MS
		)
	})
}
