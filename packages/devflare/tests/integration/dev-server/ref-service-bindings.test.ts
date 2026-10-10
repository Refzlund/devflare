import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'
import { getAvailablePort } from '../helpers/built-devflare.helpers'
import { createCapturedLogger } from './worker-only-multi-surface.helpers'

const TEST_TIMEOUT_MS = 60_000

/** The config-time `env` proxy, which the fixture's configs import from source. */
const ENV_VARS_MODULE = pathToFileURL(
	join(import.meta.dirname, '../../../src/config/env-vars.ts')
).href

/**
 * The variable the referenced worker's `ORIGIN` var reads. Its value lives only in the `.env`
 * beside the referenced config, which no ancestor of the gateway's config can see.
 */
const REF_ORIGIN_ENV = 'DEVFLARE_REF_SERVICE_INTEGRATION_ORIGIN'

async function waitForJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
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

		await Bun.sleep(250)
	}

	throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`)
}

async function writeFixture(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true })
	await mkdir(join(projectDir, 'api', 'src'), { recursive: true })

	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`
export default async function fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
	const result = await env.API.ping()
	return Response.json({ result })
}
`.trim()
	)

	await writeFile(
		join(projectDir, 'api', 'src', 'ep.api.ts'),
		`
import { WorkerEntrypoint } from 'cloudflare:workers'

export class ApiEntrypoint extends WorkerEntrypoint {
	async ping(): Promise<string> {
		const env = this.env as any
		const row = await env.DB.prepare('select ?1 as value').bind('PONG').first()
		await env.CACHE.put('last', row.value)
		const id = env.COUNTER.idFromName('main')
		const counter = env.COUNTER.get(id)
		return [row.value, await env.CACHE.get('last'), await counter.ping(), env.FEATURE_FLAG, env.ORIGIN].join(':')
	}
}
`.trim()
	)

	await writeFile(
		join(projectDir, 'api', 'src', 'do.counter.ts'),
		`
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	async ping(): Promise<string> {
		return 'DO_PONG'
	}
}
`.trim()
	)

	await writeFile(join(projectDir, 'api', '.env'), `${REF_ORIGIN_ENV}=from-the-api-env\n`)

	await writeFile(
		join(projectDir, 'api', 'devflare.config.ts'),
		`
import { env } from '${ENV_VARS_MODULE}'

export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-28',
	files: {
		fetch: false,
		entrypoints: 'src/ep.*.ts',
		durableObjects: 'src/do.*.ts'
	},
	vars: {
		FEATURE_FLAG: 'enabled',
		ORIGIN: env.${REF_ORIGIN_ENV}
	},
	bindings: {
		kv: {
			CACHE: { name: 'api-cache' }
		},
		d1: {
			DB: { name: 'api-db' }
		},
		durableObjects: {
			COUNTER: 'Counter'
		}
	}
}
`.trim()
	)

	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
import { env } from '${ENV_VARS_MODULE}'

const apiConfig = {
	name: 'api-worker',
	compatibilityDate: '2026-04-28',
	files: {
		fetch: false,
		entrypoints: 'src/ep.*.ts',
		durableObjects: 'src/do.*.ts'
	},
	vars: {
		FEATURE_FLAG: 'enabled',
		ORIGIN: env.${REF_ORIGIN_ENV}
	},
	bindings: {
		kv: {
			CACHE: { name: 'api-cache' }
		},
		d1: {
			DB: { name: 'api-db' }
		},
		durableObjects: {
			COUNTER: 'Counter'
		}
	}
}

const resolved = {
	name: apiConfig.name,
	config: apiConfig,
	configPath: './api/devflare.config.ts'
}

const apiRef = {
	get name() {
		return resolved.name
	},
	get config() {
		return resolved.config
	},
	get configPath() {
		return resolved.configPath
	},
	__import: async () => ({ default: apiConfig }),
	resolve: async () => resolved
}

export default {
	name: 'gateway-worker',
	compatibilityDate: '2026-04-28',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		services: {
			API: {
				service: 'api-worker',
				entrypoint: 'ApiEntrypoint',
				__ref: apiRef
			}
		}
	}
}
`.trim()
	)
}

describe('dev server referenced service bindings', () => {
	let projectDir: string
	let devServer: DevServer | null = null
	let miniflarePort = 0

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-dev-ref-service-'))
		await writeFixture(projectDir)
		miniflarePort = await getAvailablePort()

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort,
			enableVite: false,
			persist: false,
			logger: createCapturedLogger() as never
		})

		await devServer.start()
	}, TEST_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	}, TEST_TIMEOUT_MS)

	test(
		'serves RPC from a referenced worker with its own local bindings and resolved env.NAME vars',
		async () => {
			const payload = await waitForJson<{ result: string }>(`http://127.0.0.1:${miniflarePort}/`)

			expect(payload).toEqual({ result: 'PONG:PONG:DO_PONG:enabled:from-the-api-env' })
		},
		TEST_TIMEOUT_MS
	)
})
