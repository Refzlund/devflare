import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import { setDependencies } from '../../../src/cli/dependencies'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { type TestLogger, createLogger } from '../../helpers/mock-logger'
import {
	type ExecInvocation,
	createCliDependencies,
	createProcessRunner,
	successResult
} from '../../helpers/process-runner'
export {
	createCliDependencies,
	createProcessRunner,
	successResult,
	type ExecInvocation
} from '../../helpers/process-runner'
export { createLogger, type TestLogger }

export const TEST_ACCOUNT_ID = '0123456789abcdef0123456789abcdef'

export interface DeployEnvironmentSnapshot {
	fetch: typeof fetch
	token?: string
	accountId?: string
	verifyDeployment?: string
	verifyDeploymentDelayMs?: string
	requireFreshProductionDeployment?: string
	deployMetadataPath?: string
}

export function cloudflareApiResponse(result: unknown): Response {
	return jsonResponse(result)
}

export function captureDeployEnvironmentSnapshot(): DeployEnvironmentSnapshot {
	return {
		fetch: globalThis.fetch,
		token: process.env.CLOUDFLARE_API_TOKEN,
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
		verifyDeployment: process.env.DEVFLARE_VERIFY_DEPLOYMENT,
		verifyDeploymentDelayMs: process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS,
		requireFreshProductionDeployment: process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT,
		deployMetadataPath: process.env.DEVFLARE_DEPLOY_METADATA_PATH
	}
}

function restoreOptionalEnvironmentVariable(name: string, value: string | undefined): void {
	if (typeof value === 'undefined') {
		delete process.env[name]
		return
	}

	process.env[name] = value
}

export function restoreDeployEnvironmentSnapshot(snapshot: DeployEnvironmentSnapshot): void {
	globalThis.fetch = snapshot.fetch
	restoreOptionalEnvironmentVariable('CLOUDFLARE_API_TOKEN', snapshot.token)
	restoreOptionalEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', snapshot.accountId)
	restoreOptionalEnvironmentVariable('DEVFLARE_VERIFY_DEPLOYMENT', snapshot.verifyDeployment)
	restoreOptionalEnvironmentVariable(
		'DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS',
		snapshot.verifyDeploymentDelayMs
	)
	restoreOptionalEnvironmentVariable(
		'DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT',
		snapshot.requireFreshProductionDeployment
	)
	restoreOptionalEnvironmentVariable('DEVFLARE_DEPLOY_METADATA_PATH', snapshot.deployMetadataPath)
}

export function enableStrictDeployVerification(
	options: {
		token?: string
		accountId?: string
		delayMs?: string
		requireFreshProductionDeployment?: boolean
	} = {}
): void {
	process.env.CLOUDFLARE_API_TOKEN = options.token ?? 'test-token'
	delete process.env.CLOUDFLARE_ACCOUNT_ID
	if (options.accountId) {
		process.env.CLOUDFLARE_ACCOUNT_ID = options.accountId
	}
	process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
	process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = options.delayMs ?? '0'

	if (options.requireFreshProductionDeployment === true) {
		process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT = 'true'
	} else {
		delete process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT
	}
}

export function disableCloudflareAccountResolution(): void {
	delete process.env.CLOUDFLARE_API_TOKEN
	delete process.env.CLOUDFLARE_ACCOUNT_ID
	delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
	delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
	delete process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT
}

export function createDeployHarness(
	processRunner: Parameters<typeof createProcessRunner>[0] = () => successResult()
): {
	executions: ExecInvocation[]
	logger: TestLogger
} {
	const executions: ExecInvocation[] = []
	const logger = createLogger()
	setDependencies(createCliDependencies(createProcessRunner(processRunner, executions)))
	return {
		executions,
		logger
	}
}

export async function runWorkerOnlyDeploy(projectDir: string, logger: TestLogger) {
	return await runDeployCommand({ command: 'deploy', args: [], options: {} }, logger as any, {
		cwd: projectDir
	})
}

export function createWranglerDeployProcessRunner(
	options: {
		stdout?: string
		structuredOutput?: Record<string, unknown>
	} = {}
): Parameters<typeof createProcessRunner>[0] {
	return async (command, args, executionOptions) => {
		if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy') {
			if (options.structuredOutput) {
				const outputFilePath = String(
					(executionOptions?.env as Record<string, unknown> | undefined)
						?.WRANGLER_OUTPUT_FILE_PATH ?? ''
				)
				await writeFile(outputFilePath, JSON.stringify(options.structuredOutput))
			}

			return successResult(
				options.stdout ?? 'Deployed successfully to https://worker-build-test.example.workers.dev'
			)
		}

		return successResult()
	}
}

export function createWorkerVersionDetail(
	id: string,
	options: {
		hasPreview?: boolean
		source?: string
		createdOn?: string
		modifiedOn?: string
		number?: number
		authorId?: string
	} = {}
): Record<string, unknown> {
	return {
		id,
		...(typeof options.number === 'number' ? { number: options.number } : {}),
		metadata: {
			...(options.authorId ? { author_id: options.authorId } : {}),
			...(options.createdOn ? { created_on: options.createdOn } : {}),
			...(options.modifiedOn ? { modified_on: options.modifiedOn } : {}),
			has_preview: options.hasPreview === true,
			source: options.source ?? 'wrangler'
		}
	}
}

export function createWorkerVersionsList(items: Array<Record<string, unknown>>): Response {
	return cloudflareApiResponse({ items })
}

export function createWorkerDeployment(
	id: string,
	versionId: string,
	options: {
		createdOn?: string
		source?: string
		strategy?: string
		authorEmail?: string
		annotations?: Record<string, string>
		percentage?: number
	} = {}
): Record<string, unknown> {
	return {
		id,
		created_on: options.createdOn ?? new Date().toISOString(),
		source: options.source ?? 'wrangler',
		strategy: options.strategy ?? 'percentage',
		versions: [
			{
				percentage: options.percentage ?? 100,
				version_id: versionId
			}
		],
		...(options.annotations ? { annotations: options.annotations } : {}),
		...(options.authorEmail ? { author_email: options.authorEmail } : {})
	}
}

export function createWorkerDeploymentsList(deployments: Array<Record<string, unknown>>): Response {
	return cloudflareApiResponse({ deployments })
}

export async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFile(path, JSON.stringify(value, null, 2))
}

const DEFAULT_DEV_DEPENDENCIES = {
	devflare: '^1.0.0'
} as const

const DEFAULT_FETCH_HANDLER_SOURCE = `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim()

async function writeProjectFixture(
	projectDir: string,
	options: {
		packageName: string
		configSource: string
		files: Record<string, string>
		devDependencies?: Record<string, string>
	}
): Promise<void> {
	await writeJson(join(projectDir, 'package.json'), {
		name: options.packageName,
		private: true,
		type: 'module',
		devDependencies: options.devDependencies ?? DEFAULT_DEV_DEPENDENCIES
	})

	for (const [relativePath, content] of Object.entries({
		'devflare.config.ts': options.configSource,
		...options.files
	})) {
		const absolutePath = join(projectDir, relativePath)
		await mkdir(dirname(absolutePath), { recursive: true })
		await writeFile(absolutePath, content.trim())
	}
}

async function writeLocalViteInstall(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'node_modules', 'vite', 'bin'), { recursive: true })
	await writeJson(join(projectDir, 'node_modules', 'vite', 'package.json'), {
		name: 'vite',
		version: '8.0.7',
		type: 'module',
		bin: {
			vite: 'bin/vite.js'
		}
	})
	await writeFile(
		join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js'),
		`
#!/usr/bin/env node
console.log('stub vite binary')
`.trim()
	)
}

export async function writeProjectFiles(
	projectDir: string,
	options: {
		withViteConfig?: boolean
		withViteDeps?: boolean
		withInlineViteConfig?: boolean
		passthroughMain?: string
	} = {}
): Promise<void> {
	const inlineViteConfig = options.withInlineViteConfig
		? `,
	vite: {
		define: {
			__INLINE_VITE__: ${JSON.stringify(JSON.stringify('true'))}
		}
	}`
		: ''

	await writeProjectFixture(projectDir, {
		packageName: 'worker-build-test',
		devDependencies: {
			...DEFAULT_DEV_DEPENDENCIES,
			...(options.withViteDeps
				? {
						vite: '^6.0.0',
						'@cloudflare/vite-plugin': '^1.0.0'
					}
				: {})
		},
		configSource: `
export default {
	name: 'worker-build-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}${inlineViteConfig}${
		options.passthroughMain
			? `,
	wrangler: {
		passthrough: {
			main: '${options.passthroughMain}'
		}
	}`
			: ''
	}
}
`.trim(),
		files: {
			'src/fetch.ts': DEFAULT_FETCH_HANDLER_SOURCE,
			...(options.withViteConfig
				? {
						'vite.config.ts': `
import { defineConfig } from 'vite'

export default defineConfig({})
`.trim()
					}
				: {})
		}
	})

	if (options.withViteDeps) {
		await writeLocalViteInstall(projectDir)
	}
}

export async function writeAccountProjectFiles(
	projectDir: string,
	options: {
		workerName?: string
		accountId?: string
	} = {}
): Promise<void> {
	const workerName = options.workerName ?? 'worker-build-test'
	const accountId = options.accountId ?? TEST_ACCOUNT_ID

	await writeProjectFixture(projectDir, {
		packageName: workerName,
		configSource: `
export default {
	name: ${JSON.stringify(workerName)},
	accountId: ${JSON.stringify(accountId)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim(),
		files: {
			'src/fetch.ts': DEFAULT_FETCH_HANDLER_SOURCE
		}
	})
}

export async function writeNamedD1ProjectFiles(
	projectDir: string,
	options: {
		workerName?: string
		accountId?: string
		databaseName?: string
	} = {}
): Promise<void> {
	const workerName = options.workerName ?? 'worker-build-test'
	const accountId = options.accountId ?? 'account-123'
	const databaseName = options.databaseName ?? 'app-db'

	await writeProjectFixture(projectDir, {
		packageName: workerName,
		configSource: `
export default {
	name: ${JSON.stringify(workerName)},
	accountId: ${JSON.stringify(accountId)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		d1: {
			DB: ${JSON.stringify(databaseName)}
		}
	}
}
`.trim(),
		files: {
			'src/fetch.ts': DEFAULT_FETCH_HANDLER_SOURCE
		}
	})
}

export async function writeRequestWideHandleProjectFiles(projectDir: string): Promise<void> {
	await writeProjectFixture(projectDir, {
		packageName: 'worker-build-test',
		configSource: `
export default {
	name: 'worker-build-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim(),
		files: {
			'src/fetch.ts': `
import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function authHandle(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	return resolve(event)
}

export const handle = sequence(authHandle)

export async function GET(): Promise<Response> {
	return new Response('ok')
}
`.trim()
		}
	})
}

export async function writeRolldownWorkerProjectFiles(projectDir: string): Promise<void> {
	await writeProjectFixture(projectDir, {
		packageName: 'worker-build-test',
		configSource: `
export default {
	name: 'worker-build-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	rolldown: {
		options: {
			plugins: [{
				name: 'inline-svelte-heading',
				transform(code, id) {
					if (!id.endsWith('Greeting.svelte')) {
						return null
					}

					const heading = code.match(/<h1>(.*?)<\\/h1>/)?.[1] ?? 'Hello from Svelte'
					return {
						code: 'export default function renderGreeting() { return ' + JSON.stringify(heading) + ' }',
						map: null
					}
				}
			}]
		}
	}
}
`.trim(),
		files: {
			'src/Greeting.svelte': `
<h1>Hello from Svelte</h1>
`.trim(),
			'src/fetch.ts': `
import renderGreeting from './Greeting.svelte'

export async function fetch(): Promise<Response> {
	return new Response(renderGreeting())
}
`.trim()
		}
	})
}

export async function writeMultiSurfaceProjectFiles(
	projectDir: string,
	options: {
		passthroughMain?: string
	} = {}
): Promise<void> {
	await writeProjectFixture(projectDir, {
		packageName: 'worker-build-test',
		configSource: `
export default {
	name: 'worker-build-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts'
	},
	bindings: {
		queues: {
			producers: {
				TASK_QUEUE: 'task-queue'
			},
			consumers: [
				{
					queue: 'task-queue'
				}
			]
		}
	},
	triggers: {
		crons: ['0 * * * *']
	}${
		options.passthroughMain
			? `,
	wrangler: {
		passthrough: {
			main: '${options.passthroughMain}'
		}
	}`
			: ''
	}
}
	`.trim(),
		files: {
			'src/fetch.ts': DEFAULT_FETCH_HANDLER_SOURCE,
			'src/queue.ts': `
export async function queue() {
	return undefined
}
	`.trim(),
			'src/scheduled.ts': `
export async function scheduled() {
	return undefined
}
	`.trim(),
			'src/email.ts': `
export async function email() {
	return undefined
}
	`.trim(),
			...(options.passthroughMain
				? {
						[options.passthroughMain]: `
export async function fetch(): Promise<Response> {
	return new Response('custom')
}
	`.trim()
					}
				: {})
		}
	})
}

export async function writeServiceBindingProjectFiles(projectDir: string): Promise<void> {
	await writeProjectFixture(projectDir, {
		packageName: 'worker-build-test',
		configSource: `
export default {
	name: 'gateway-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		services: {
			AUTH: {
				service: 'auth-worker',
				entrypoint: 'AdminEntrypoint'
			}
		}
	}
}
`.trim(),
		files: {
			'src/fetch.ts': DEFAULT_FETCH_HANDLER_SOURCE
		}
	})
}

export async function writeRouteProjectFiles(projectDir: string): Promise<void> {
	await writeProjectFixture(projectDir, {
		packageName: 'worker-build-route-test',
		configSource: `
export default {
	name: 'worker-build-route-test',
	compatibilityDate: '2026-03-17',
	files: {
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
}
`.trim(),
		files: {
			'src/routes/index.ts': `
export async function GET(): Promise<Response> {
	return new Response('root')
}
`.trim(),
			'src/routes/users/[id].ts': `
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id))
}
`.trim()
		}
	})
}

export async function readGeneratedDevConfig(projectDir: string): Promise<string> {
	return readFile(join(projectDir, '.devflare', 'wrangler.jsonc'), 'utf8')
}

export async function readGeneratedDeployConfig(projectDir: string): Promise<string> {
	// R2: deploy now writes the resolved (ID-substituted) wrangler config to
	// `.devflare/deploy/wrangler.jsonc` instead of overwriting the build
	// artefact. Fall back to the legacy build path for tests/cases that
	// only exercise the build artefact (no deploy step run yet).
	const deployPath = join(projectDir, '.devflare', 'deploy', 'wrangler.jsonc')
	try {
		return await readFile(deployPath, 'utf8')
	} catch {
		return readFile(join(projectDir, '.devflare', 'build', 'wrangler.jsonc'), 'utf8')
	}
}

export function isViteBuildExecution(command: string, args: string[]): boolean {
	const normalizedCommand = command.replace(/\\/g, '/')

	if (normalizedCommand.endsWith('/node_modules/vite/bin/vite.js')) {
		return args[0] === 'build'
	}

	// `bun --bun <vite.js> build …` (devflare's preferred Bun-runtime spawn)
	if (command === 'bun') {
		const bunFlagIndex = args.indexOf('--bun')
		const viteIndex = args.findIndex((arg) =>
			arg.replace(/\\/g, '/').endsWith('/node_modules/vite/bin/vite.js')
		)
		if (bunFlagIndex >= 0 && viteIndex >= 0 && args[viteIndex + 1] === 'build') {
			return true
		}
	}

	if (command === 'bunx') {
		const viteIndex = args.indexOf('vite')
		return viteIndex >= 0 && args[viteIndex + 1] === 'build'
	}

	return false
}

/**
 * Extract the actual Vite entry script path from a captured execution,
 * regardless of whether it was spawned directly or through `bun --bun`.
 * Used by tests that assert workspace-local resolution.
 */
export function extractViteEntryPath(execution: { command: string; args: string[] }): string {
	if (execution.command === 'bun') {
		const viteIndex = execution.args.findIndex((arg) =>
			arg.replace(/\\/g, '/').endsWith('/node_modules/vite/bin/vite.js')
		)
		if (viteIndex >= 0) {
			return execution.args[viteIndex] ?? ''
		}
	}
	return execution.command
}
