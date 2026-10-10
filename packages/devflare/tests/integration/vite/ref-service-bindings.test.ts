// =============================================================================
// Vite plugin — a REAL ref() service binding, through every Vite entry point
// =============================================================================
// The fixture's binding is built by `ref()` itself, never hand-written: a hand-built
// `{ service, __ref }` carries `__ref` as an own key, survives every copy, and hides the
// defect this file exists for. The referenced worker carries a `.dev.vars` secret, which no
// path that can reach a build may hand `@cloudflare/vite-plugin`, and a `.dev()` fallback,
// which follows the mode its gateway's own vars resolve in.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { EnvVarResolutionError } from '../../../src/config/env-vars'
import { devflarePlugin, getPluginContext } from '../../../src/vite/plugin'
import { getCloudflareConfig, getDevflareConfigs } from '../../../src/vite/plugin-programmatic'

const REF_MODULE = pathToFileURL(join(import.meta.dirname, '../../../src/config/ref.ts')).href
const ENV_MODULE = pathToFileURL(join(import.meta.dirname, '../../../src/config/env-vars.ts')).href

/**
 * The variables the two workers' `TOKEN` reads, one each, behind the same `.dev()` fallback. They
 * are separate so a build-mode failure can be made to come from the referenced worker alone.
 */
const TOKEN_ENV = 'DEVFLARE_VITE_REF_FIXTURE_TOKEN'
const GATEWAY_TOKEN_ENV = 'DEVFLARE_VITE_REF_FIXTURE_GATEWAY_TOKEN'
const TOKEN_ENVS = [TOKEN_ENV, GATEWAY_TOKEN_ENV] as const
const DEV_VARS_SECRET = 'secret-from-the-dev-vars-file'
const DEV_FALLBACK = 'token-from-the-dev-fallback'

/**
 * Write a gateway whose `API` binding is `ref(...).worker` on a sibling `api/` config. The
 * referenced worker hosts a Durable Object, so it brings a helper worker of its own.
 *
 * @param projectDir - the gateway's root; the referenced worker lives in `api/`
 */
async function writeFixture(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true })
	await mkdir(join(projectDir, 'api', 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'vite-real-ref-test', private: true, type: 'module' })
	)
	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`export async function fetch(): Promise<Response> { return new Response('ok') }`
	)
	await writeFile(
		join(projectDir, 'api', 'src', 'worker.ts'),
		// The conventional `worker.ts` shape: plain functions, which devflare turns into the
		// worker's default `WorkerEntrypoint`.
		`
export async function ping(): Promise<string> {
	return 'PONG'
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'api', 'src', 'do.counter.ts'),
		`
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {}
`.trim()
	)
	await writeFile(join(projectDir, 'api', '.dev.vars'), `SECRET=${DEV_VARS_SECRET}\n`)
	await writeFile(
		join(projectDir, 'api', 'devflare.config.ts'),
		`
import { env } from '${ENV_MODULE}'

export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-28',
	files: { fetch: false, durableObjects: 'src/do.*.ts' },
	vars: {
		PUBLIC_FLAG: 'on',
		TOKEN: env.${TOKEN_ENV}.dev('${DEV_FALLBACK}')
	},
	bindings: { durableObjects: { COUNTER: 'Counter' } }
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
import { ref } from '${REF_MODULE}'
import { env } from '${ENV_MODULE}'

export default {
	name: 'gateway-worker',
	compatibilityDate: '2026-04-28',
	// The default pattern would also find the referenced worker's DO under api/.
	files: { fetch: 'src/fetch.ts', durableObjects: false },
	vars: { TOKEN: env.${GATEWAY_TOKEN_ENV}.dev('${DEV_FALLBACK}') },
	bindings: {
		services: { API: ref(() => import('./api/devflare.config.ts')).worker }
	}
}
`.trim()
	)
}

describe('vite plugin with a real ref() service binding', () => {
	let projectDir: string
	let originalTokens: Record<string, string | undefined> = {}
	let originalFetch: typeof fetch

	beforeEach(async () => {
		originalTokens = Object.fromEntries(TOKEN_ENVS.map((name) => [name, process.env[name]]))
		for (const name of TOKEN_ENVS) {
			delete process.env[name]
		}
		// The `'remote'` strategy may only reach Cloudflare to resolve resources, and this fixture
		// declares none; a request here is a defect, not a flake.
		originalFetch = globalThis.fetch
		globalThis.fetch = (async (input: unknown) => {
			throw new Error(`The fixture made a network request: ${String(input)}`)
		}) as unknown as typeof fetch
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-real-ref-'))
		await writeFixture(projectDir)
	})

	afterEach(async () => {
		globalThis.fetch = originalFetch
		for (const [name, value] of Object.entries(originalTokens)) {
			if (value === undefined) {
				delete process.env[name]
			} else {
				process.env[name] = value
			}
		}
		await rm(projectDir, { recursive: true, force: true })
	})

	test('a build binds the referenced worker by its real name, and neither bundles nor carries it', async () => {
		// A build resolves the gateway's own vars in build mode, which ignores its `.dev()` fallback.
		process.env[GATEWAY_TOKEN_ENV] = 'gateway-token-from-the-environment'
		const plugin = devflarePlugin()
		await (plugin.configResolved as (config: unknown) => Promise<void>)({
			root: projectDir,
			command: 'build'
		})

		const wranglerConfig = await readFile(join(projectDir, '.devflare', 'wrangler.jsonc'), 'utf8')
		const emitted = JSON.parse(wranglerConfig.replace(/^\/\/.*$/gm, '')) as {
			services?: unknown
		}
		expect(emitted.services).toEqual([{ binding: 'API', service: 'api-worker' }])

		const context = getPluginContext()
		expect(context.cloudflareConfig.services).toEqual([{ binding: 'API', service: 'api-worker' }])
		expect(context.auxiliaryWorkerConfigs).toEqual([])
		expect(context.serviceWorkerVirtualModules.size).toBe(0)
		const everythingTheBuildSees = JSON.stringify([wranglerConfig, context])
		expect(everythingTheBuildSees).not.toContain(DEV_VARS_SECRET)
		expect(everythingTheBuildSees).not.toContain('PUBLIC_FLAG')
	})

	test('serve builds the referenced worker as a dev-only auxiliary worker with its local env', async () => {
		const plugin = devflarePlugin()
		await (plugin.configResolved as (config: unknown) => Promise<void>)({
			root: projectDir,
			command: 'serve'
		})

		const context = getPluginContext()
		expect(context.cloudflareConfig.services).toEqual([{ binding: 'API', service: 'api-worker' }])
		expect(
			context.auxiliaryWorkerConfigs.map((worker) => [worker.config.name, worker.devOnly])
		).toEqual([
			['api-worker-durable-objects', true],
			['api-worker', true]
		])
		const apiWorker = context.auxiliaryWorkerConfigs.find(
			(worker) => worker.config.name === 'api-worker'
		)
		// Serve is the local runtime, so the referenced worker gets what `devflare dev` gives it.
		expect(apiWorker?.config.vars).toEqual({
			PUBLIC_FLAG: 'on',
			TOKEN: DEV_FALLBACK,
			SECRET: DEV_VARS_SECRET
		})
	})

	test("getDevflareConfigs() resolves the referenced worker in its gateway's dev mode, without .dev.vars", async () => {
		const result = await getDevflareConfigs({ cwd: projectDir })

		expect(result.cloudflareConfig.services).toEqual([{ binding: 'API', service: 'api-worker' }])
		// Every worker here is the referenced one or its helper, and none may be built into `dist`.
		expect(result.auxiliaryWorkers.map((worker) => [worker.config.name, worker.devOnly])).toEqual([
			['api-worker-durable-objects', true],
			['api-worker', true]
		])
		const apiWorker = result.auxiliaryWorkers.find((worker) => worker.config.name === 'api-worker')
		// The same `.dev()` declaration resolves the same way in the gateway and in the worker.
		expect(result.cloudflareConfig.vars).toEqual({ TOKEN: DEV_FALLBACK })
		expect(apiWorker?.config.vars).toEqual({ PUBLIC_FLAG: 'on', TOKEN: DEV_FALLBACK })
		expect(JSON.stringify(result)).not.toContain(DEV_VARS_SECRET)
	})

	test("getDevflareConfigs({ resolve: 'remote' }) resolves the referenced worker in build mode, without .dev.vars", async () => {
		process.env[GATEWAY_TOKEN_ENV] = 'gateway-token-from-the-environment'
		process.env[TOKEN_ENV] = 'token-from-the-environment'

		const result = await getDevflareConfigs({ cwd: projectDir, resolve: 'remote' })

		const apiWorker = result.auxiliaryWorkers.find((worker) => worker.config.name === 'api-worker')
		expect(apiWorker?.devOnly).toBe(true)
		expect(apiWorker?.config.vars).toEqual({
			PUBLIC_FLAG: 'on',
			TOKEN: 'token-from-the-environment'
		})
		expect(JSON.stringify(result)).not.toContain(DEV_VARS_SECRET)
	})

	test("getDevflareConfigs({ resolve: 'remote' }) does not fall back to a referenced worker's .dev() value", async () => {
		// Only the gateway's variable is set, so the gateway's own build-mode vars resolve and a
		// failure can only come from the referenced worker.
		process.env[GATEWAY_TOKEN_ENV] = 'gateway-token-from-the-environment'

		const failure = await getDevflareConfigs({ cwd: projectDir, resolve: 'remote' }).then(
			() => null,
			(error: unknown) => error
		)

		expect(failure).toBeInstanceOf(EnvVarResolutionError)
		expect((failure as EnvVarResolutionError).mode).toBe('build')
		expect((failure as Error).message).toContain('Service-bound worker "api-worker"')
		expect((failure as Error).message).toContain(TOKEN_ENV)
	})

	test('getCloudflareConfig() binds the referenced worker by its real name', async () => {
		const cloudflareConfig = await getCloudflareConfig({ cwd: projectDir })

		expect(cloudflareConfig.services).toEqual([{ binding: 'API', service: 'api-worker' }])
		expect(JSON.stringify(cloudflareConfig)).not.toContain(DEV_VARS_SECRET)
	})
})

/** The secret only the SECOND-level worker's `.dev.vars` holds. */
const NESTED_DEV_VARS_SECRET = 'secret-from-the-nested-workers-dev-vars'

/**
 * Write gateway → api → auth, each binding the next with a real `ref()`. Only `auth/` has a
 * `.dev.vars`, so its secret can reach an output through the nested resolution alone.
 *
 * @param projectDir - the gateway's root; the workers live in `api/` and `auth/`
 */
async function writeNestedFixture(projectDir: string): Promise<void> {
	for (const worker of ['api', 'auth']) {
		await mkdir(join(projectDir, worker, 'src'), { recursive: true })
		await writeFile(
			join(projectDir, worker, 'src', 'worker.ts'),
			`export async function ping(): Promise<string> {\n\treturn '${worker}'\n}\n`
		)
	}
	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'vite-nested-ref-test', private: true, type: 'module' })
	)
	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`export async function fetch(): Promise<Response> { return new Response('ok') }`
	)
	await writeFile(join(projectDir, 'auth', '.dev.vars'), `AUTH_SECRET=${NESTED_DEV_VARS_SECRET}\n`)
	await writeFile(
		join(projectDir, 'auth', 'devflare.config.ts'),
		`export default { name: 'auth-worker', compatibilityDate: '2026-04-28', files: { fetch: false } }`
	)
	await writeFile(
		join(projectDir, 'api', 'devflare.config.ts'),
		`
import { ref } from '${REF_MODULE}'

export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-28',
	files: { fetch: false },
	bindings: { services: { AUTH: ref(() => import('../auth/devflare.config.ts')).worker } }
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
import { ref } from '${REF_MODULE}'

export default {
	name: 'gateway-worker',
	compatibilityDate: '2026-04-28',
	files: { fetch: 'src/fetch.ts', durableObjects: false },
	bindings: { services: { API: ref(() => import('./api/devflare.config.ts')).worker } }
}
`.trim()
	)
}

describe('vite plugin with a ref() inside a referenced config', () => {
	let projectDir: string

	beforeEach(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-nested-ref-'))
		await writeNestedFixture(projectDir)
	})

	afterEach(async () => {
		await rm(projectDir, { recursive: true, force: true })
	})

	test('serve gives the second-level worker its .dev.vars, so the secret is reachable', async () => {
		const plugin = devflarePlugin()
		await (plugin.configResolved as (config: unknown) => Promise<void>)({
			root: projectDir,
			command: 'serve'
		})

		// The premise of the next test: a nested resolution that lays `.dev.vars` over the worker
		// puts this secret into its vars.
		const authWorker = getPluginContext().auxiliaryWorkerConfigs.find(
			(worker) => worker.config.name === 'auth-worker'
		)
		expect(authWorker?.config.vars).toEqual({ AUTH_SECRET: NESTED_DEV_VARS_SECRET })
	})

	test("getDevflareConfigs() keeps a second-level worker's .dev.vars out of every output", async () => {
		const result = await getDevflareConfigs({ cwd: projectDir })

		expect(result.auxiliaryWorkers.map((worker) => [worker.config.name, worker.devOnly])).toEqual([
			['auth-worker', true],
			['api-worker', true]
		])
		const apiWorker = result.auxiliaryWorkers.find((worker) => worker.config.name === 'api-worker')
		expect(apiWorker?.config.services).toEqual([{ binding: 'AUTH', service: 'auth-worker' }])
		expect(JSON.stringify(result)).not.toContain(NESTED_DEV_VARS_SECRET)
	})
})
