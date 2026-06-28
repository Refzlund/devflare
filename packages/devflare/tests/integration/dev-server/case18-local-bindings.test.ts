import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { type DevServer, createDevServer } from '../../../src/dev-server'
import {
	deleteLocalSecret,
	readLocalSecret,
	writeLocalSecret
} from '../../../src/secrets/local-secrets'
import { ensurePackageBuilt, getAvailablePort } from '../helpers/built-devflare.helpers'
import { createCapturedLogger } from './worker-only-multi-surface.helpers'

const TEST_TIMEOUT_MS = 60_000
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const caseDir = join(repoRoot, 'cases', 'case18')
const localSecretRef = {
	cwd: caseDir,
	storeId: 'case18-local-store',
	name: 'api-token'
}

interface LocalBindingsPayload {
	secret: string
	hyperdrive: { connectionString: string; database: string }
	workflow: { id: string; status: string }
	images: { width: number; contentType: string; status: number }
	media: { contentType: string; status: number }
	workerLoader: { status: number; text: string }
	email: string
}

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

async function syncSvelteKitCase(): Promise<void> {
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

describe('case18 SvelteKit local binding matrix', () => {
	let devServer: DevServer | null = null
	let vitePort = 0
	let miniflarePort = 0
	let previousSecret: string | undefined

	beforeAll(async () => {
		previousSecret = readLocalSecret(localSecretRef)
		writeLocalSecret({
			...localSecretRef,
			value: 'case18-secret-value'
		})
		await ensurePackageBuilt()
		await syncSvelteKitCase()

		vitePort = await getAvailablePort()
		miniflarePort = await getAvailablePort()
		const logger = createCapturedLogger()

		devServer = createDevServer({
			cwd: caseDir,
			configPath: 'devflare.local-bindings.config.ts',
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

			expect(payload.secret).toBe('case18-secret-value')
			expect(payload.hyperdrive).toEqual({
				connectionString: 'postgres://case18:password@localhost:5432/case18',
				database: 'case18'
			})
			expect(payload.workflow.id).toBe('case18-order-1')
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
				text: 'case18-loader-ok'
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

			expect(response.status).toBe(200)
			expect(response.headers.get('set-cookie')).toContain(
				'case18-service-action=creator%40example.com'
			)
			expect(body).toContain('creator@example.com')
			expect(body).toContain('case18-api')
			expect(body).toContain('service-fetch')
			expect(body).toContain('case18-var-value')
			expect(body).toContain('undefined')
		},
		TEST_TIMEOUT_MS
	)
})
