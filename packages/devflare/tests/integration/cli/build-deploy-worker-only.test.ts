import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import type { CliDependencies, ExecResult, ProcessRunner } from '../../../src/cli/dependencies'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { runBuildCommand } from '../../../src/cli/commands/build'
import { runDeployCommand } from '../../../src/cli/commands/deploy'

interface TestLogger {
	log: ReturnType<typeof mock>
	info: ReturnType<typeof mock>
	warn: ReturnType<typeof mock>
	error: ReturnType<typeof mock>
	success: ReturnType<typeof mock>
	debug: ReturnType<typeof mock>
	messages: Array<{ level: string; args: unknown[] }>
}

interface ExecInvocation {
	command: string
	args: string[]
	options?: Record<string, unknown>
}

const TEST_ACCOUNT_ID = '0123456789abcdef0123456789abcdef'

function createLogger(): TestLogger {
	const messages: Array<{ level: string; args: unknown[] }> = []

	const createMethod = (level: string) => mock((...args: unknown[]) => {
		messages.push({ level, args })
	})

	return {
		log: createMethod('log'),
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		messages
	}
}

function createProcessRunner(
	handler: (command: string, args: string[], options?: Record<string, unknown>) => Promise<ExecResult> | ExecResult,
	executions: ExecInvocation[]
): ProcessRunner {
	return {
		async exec(command, args = [], options = {}) {
			executions.push({ command, args, options: options as Record<string, unknown> })
			return await handler(command, args, options as Record<string, unknown>)
		},
		spawn() {
			throw new Error('spawn() not implemented for this test')
		}
	}
}

function successResult(stdout: string = ''): ExecResult {
	return {
		exitCode: 0,
		stdout,
		stderr: '',
		failed: false,
		killed: false
	}
}

function cloudflareApiResponse(result: unknown): Response {
	return new Response(JSON.stringify({
		success: true,
		result,
		errors: [],
		messages: []
	}), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFile(path, JSON.stringify(value, null, 2))
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
	await writeFile(join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js'), `
#!/usr/bin/env node
console.log('stub vite binary')
`.trim())
}

async function writeProjectFiles(
	projectDir: string,
	options: {
		withViteConfig?: boolean
		withViteDeps?: boolean
		withInlineViteConfig?: boolean
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

	await writeJson(join(projectDir, 'package.json'), {
		name: 'worker-build-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0',
			...(options.withViteDeps
				? {
					vite: '^6.0.0',
					'@cloudflare/vite-plugin': '^1.0.0'
				}
				: {})
		}
	})

	await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}${inlineViteConfig}
}
`.trim())

	await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

	if (options.withViteConfig) {
		await writeFile(join(projectDir, 'vite.config.ts'), `
import { defineConfig } from 'vite'

export default defineConfig({})
`.trim())
	}

	if (options.withViteDeps) {
		await writeLocalViteInstall(projectDir)
	}
}

async function writeRequestWideHandleProjectFiles(projectDir: string): Promise<void> {
	await writeJson(join(projectDir, 'package.json'), {
		name: 'worker-build-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0'
		}
	})

	await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

	await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function authHandle(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	return resolve(event)
}

export const handle = sequence(authHandle)

export async function GET(): Promise<Response> {
	return new Response('ok')
}
`.trim())
}

async function writeRolldownWorkerProjectFiles(projectDir: string): Promise<void> {
	await writeJson(join(projectDir, 'package.json'), {
		name: 'worker-build-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0'
		}
	})

	await writeFile(join(projectDir, 'devflare.config.ts'), `
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
`.trim())

	await writeFile(join(projectDir, 'src', 'Greeting.svelte'), `
<h1>Hello from Svelte</h1>
`.trim())

	await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import renderGreeting from './Greeting.svelte'

export async function fetch(): Promise<Response> {
	return new Response(renderGreeting())
}
`.trim())
}

async function writeMultiSurfaceProjectFiles(
	projectDir: string,
	options: {
		passthroughMain?: string
	} = {}
): Promise<void> {
	await writeJson(join(projectDir, 'package.json'), {
		name: 'worker-build-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0'
		}
	})

	await writeFile(join(projectDir, 'devflare.config.ts'), `
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
	}${options.passthroughMain
			? `,
	wrangler: {
		passthrough: {
			main: '${options.passthroughMain}'
		}
	}`
			: ''
		}
}
`.trim())

	await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())
	await writeFile(join(projectDir, 'src', 'queue.ts'), `
export async function queue() {
	return undefined
}
`.trim())
	await writeFile(join(projectDir, 'src', 'scheduled.ts'), `
export async function scheduled() {
	return undefined
}
`.trim())
	await writeFile(join(projectDir, 'src', 'email.ts'), `
export async function email() {
	return undefined
}
`.trim())

	if (options.passthroughMain) {
		await writeFile(join(projectDir, options.passthroughMain), `
export async function fetch(): Promise<Response> {
	return new Response('custom')
}
`.trim())
	}
}

async function writeServiceBindingProjectFiles(projectDir: string): Promise<void> {
	await writeJson(join(projectDir, 'package.json'), {
		name: 'worker-build-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0'
		}
	})

	await writeFile(join(projectDir, 'devflare.config.ts'), `
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
`.trim())

	await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())
}

async function writeRouteProjectFiles(projectDir: string): Promise<void> {
	await writeJson(join(projectDir, 'package.json'), {
		name: 'worker-build-route-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0'
		}
	})

	await writeFile(join(projectDir, 'devflare.config.ts'), `
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
`.trim())

	await mkdir(join(projectDir, 'src', 'routes', 'users'), { recursive: true })
	await writeFile(join(projectDir, 'src', 'routes', 'index.ts'), `
export async function GET(): Promise<Response> {
	return new Response('root')
}
`.trim())
	await writeFile(join(projectDir, 'src', 'routes', 'users', '[id].ts'), `
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id))
}
`.trim())
}

async function readGeneratedDevConfig(projectDir: string): Promise<string> {
	return readFile(join(projectDir, '.devflare', 'wrangler.jsonc'), 'utf8')
}

async function readGeneratedDeployConfig(projectDir: string): Promise<string> {
	return readFile(join(projectDir, '.devflare', 'build', 'wrangler.jsonc'), 'utf8')
}

function isViteBuildExecution(command: string, args: string[]): boolean {
	const normalizedCommand = command.replace(/\\/g, '/')

	if (normalizedCommand.endsWith('/node_modules/vite/bin/vite.js')) {
		return args[0] === 'build'
	}

	if (command === 'bunx') {
		const viteIndex = args.indexOf('vite')
		return viteIndex >= 0 && args[viteIndex + 1] === 'build'
	}

	return false
}

describe('build/deploy worker-only behavior', () => {
	let projectDir = ''

	beforeEach(async () => {
		clearDependencies()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-build-worker-only-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('build skips vite for worker-only projects with no local vite.config', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (isViteBuildExecution(command, args)) {
					throw new Error('vite build should not run for worker-only build')
				}

				return successResult()
			}, executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)
		expect(executions.some(({ command, args }) => isViteBuildExecution(command, args))).toBe(false)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Skipping Vite build'))).toBe(true)
		await access(join(projectDir, '.devflare', 'wrangler.jsonc'))
		await access(join(projectDir, '.devflare', 'build', 'wrangler.jsonc'))
		await access(join(projectDir, '.wrangler', 'deploy', 'config.json'))
	})

	test('build still runs vite when the current package has a local vite.config', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: true, withViteDeps: true })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => successResult(`${command} ${args.join(' ')}`), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)
		const viteBuildExecution = executions.find(({ command, args }) => isViteBuildExecution(command, args))
		expect(viteBuildExecution).toBeDefined()
		expect(viteBuildExecution?.command.replace(/\\/g, '/')).toContain('/node_modules/vite/bin/vite.js')
		await access(join(projectDir, '.devflare', 'vite.config.mjs'))
	})

	test('build runs vite with a generated config when devflare.config.ts contains inline vite config', async () => {
		await writeProjectFiles(projectDir, {
			withViteConfig: false,
			withViteDeps: true,
			withInlineViteConfig: true
		})

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => successResult(`${command} ${args.join(' ')}`), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)
		const viteBuildExecution = executions.find(({ command, args }) => isViteBuildExecution(command, args))
		expect(viteBuildExecution).toBeDefined()
		expect(viteBuildExecution?.command.replace(/\\/g, '/')).toContain('/node_modules/vite/bin/vite.js')
		expect(viteBuildExecution?.args).toContain('--config')
		await access(join(projectDir, '.devflare', 'vite.config.mjs'))
	})

	test('build preserves named service binding entrypoints in generated wrangler output', async () => {
		await writeServiceBindingProjectFiles(projectDir)

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"service": "auth-worker"')
		expect(wranglerConfig).toContain('"entrypoint": "AdminEntrypoint"')
	})

	test('build generates a composed worker entry for fetch-only request-wide handle middleware', async () => {
		await writeRequestWideHandleProjectFiles(projectDir)

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"main": "worker-entrypoints/main.js"')

		const composedEntry = await readFile(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'), 'utf8')
		expect(composedEntry).toContain('src/fetch.ts')
		expect(composedEntry).toContain('invokeFetchModule')
	})

	test('build generates a composed worker entry when queue, scheduled, or email files are configured', async () => {
		await writeMultiSurfaceProjectFiles(projectDir)

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"main": "worker-entrypoints/main.js"')

		const composedEntry = await readFile(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'), 'utf8')
		expect(composedEntry).toContain('src/fetch.ts')
		expect(composedEntry).toContain('src/queue.ts')
		expect(composedEntry).toContain('src/scheduled.ts')
		expect(composedEntry).toContain('src/email.ts')

		const deployConfig = await readGeneratedDeployConfig(projectDir)
		expect(deployConfig).toContain('"main": "./worker.js"')
	})

	test('build generates a composed worker entry for configured file routes without src/fetch.ts', async () => {
		await writeRouteProjectFiles(projectDir)

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"main": "worker-entrypoints/main.js"')

		const composedEntry = await readFile(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'), 'utf8')
		expect(composedEntry).toContain('src/routes/index.ts')
		expect(composedEntry).toContain('src/routes/users/[id].ts')
		expect(composedEntry).toContain('createRouteResolve')
		expect(composedEntry).toContain('matchFetchRoute')
	})

	test('build preserves an explicit wrangler passthrough main when split worker surfaces exist', async () => {
		await writeMultiSurfaceProjectFiles(projectDir, {
			passthroughMain: 'src/custom-main.ts'
		})

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		if (result.exitCode !== 0) {
			throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
		}

		expect(result.exitCode).toBe(0)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"main": "../src/custom-main.ts"')
		await expect(access(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'))).rejects.toThrow()
	})

	test('build applies rolldown plugins to the bundled worker artifact', async () => {
		await writeRolldownWorkerProjectFiles(projectDir)

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runBuildCommand(
			{ command: 'build', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const bundledWorker = await readFile(join(projectDir, '.devflare', 'build', 'worker.js'), 'utf8')
		expect(bundledWorker).toContain('Hello from Svelte')
	})

	test('deploy skips vite for worker-only projects and still runs wrangler deploy', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (isViteBuildExecution(command, args)) {
					throw new Error('vite build should not run for worker-only deploy')
				}

				return successResult()
			}, executions)
		})

		const result = await runDeployCommand(
			{ command: 'deploy', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		expect(executions.some(({ command, args }) => isViteBuildExecution(command, args))).toBe(false)
		expect(executions.some(({ command, args }) => command === 'bunx' && args.join(' ') === 'wrangler deploy')).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Skipping Vite build'))).toBe(true)
		await access(join(projectDir, '.wrangler', 'deploy', 'config.json'))
	})

	test('deploy forwards Wrangler version metadata flags when message and tag are provided', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(() => successResult(), executions)
		})

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					message: 'Documentation production run',
					tag: 'documentation-production-123'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const deployExecution = executions.find(({ command, args }) => command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy')
		expect(deployExecution?.args).toContain('--message')
		expect(deployExecution?.args).toContain('Documentation production run')
		expect(deployExecution?.args).toContain('--tag')
		expect(deployExecution?.args).toContain('documentation-production-123')
	})

	test('deploy uses branch metadata to derive preview aliases and surfaces preview metadata', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Version ID: version-123\nPreview URL: https://preview.example.workers.dev\nPreview Alias URL: https://worker-build-test-feature-branch.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					preview: true,
					'branch-name': 'feature/branch'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const previewExecution = executions.find(({ command, args }) => command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload')
		expect(previewExecution?.args).toContain('--preview-alias')
		expect(previewExecution?.args).toContain('feature-branch')
		expect(logger.messages.some((message) => {
			const line = message.args.join(' ').toLowerCase()
			return line.includes('preview alias') && line.includes('feature-branch')
		})).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-123'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Preview URL: https://preview.example.workers.dev'))).toBe(true)
	})

	test('deploy verifies preview uploads in Cloudflare control plane when strict verification is enabled', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-123')) {
				return cloudflareApiResponse({
					id: 'version-123',
					metadata: {
						hasPreview: true,
						source: 'wrangler'
					}
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Version ID: version-123\nPreview URL: https://preview.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{
					command: 'deploy',
					args: [],
					options: {
						preview: true,
						'branch-name': 'feature/branch'
					}
				},
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Verified preview upload in Cloudflare control plane for version version-123'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
		}
	})

	test('deploy verifies production deployments reference the uploaded version when strict verification is enabled', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-123')) {
				return cloudflareApiResponse({
					id: 'version-123',
					metadata: {
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return cloudflareApiResponse({
					deployments: [
						{
							id: 'deployment-123',
							created_on: '2026-04-09T00:00:00Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: 'version-123'
								}
							],
							author_email: 'test@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args.join(' ') === 'wrangler deploy') {
					return successResult('Version ID: version-123')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: {} },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-123 for version version-123'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
		}
	})

	test('deploy verifies production deployments when Wrangler only reports the version id through structured output', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-structured')) {
				return cloudflareApiResponse({
					id: 'version-structured',
					metadata: {
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return cloudflareApiResponse({
					deployments: [
						{
							id: 'deployment-structured',
							created_on: '2026-04-09T00:00:00Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: 'version-structured'
								}
							],
							author_email: 'test@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner(async (command, args, options) => {
				if (command === 'bunx' && args.join(' ') === 'wrangler deploy') {
					const outputFilePath = String((options?.env as Record<string, unknown> | undefined)?.WRANGLER_OUTPUT_FILE_PATH ?? '')
					await writeFile(outputFilePath, JSON.stringify({
						type: 'deploy',
						version_id: 'version-structured',
						targets: ['https://worker-build-test.example.workers.dev']
					}))
					return successResult('Deployed successfully to https://worker-build-test.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: {} },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-structured'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-structured for version version-structured'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
		}
	})

	test('deploy falls back to the latest Cloudflare version when Wrangler omits the production version id', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions?page=1&per_page=100')) {
				return cloudflareApiResponse({
					items: [
						{
							id: 'version-from-list',
							metadata: {
								created_on: new Date().toISOString(),
								modified_on: new Date().toISOString(),
								hasPreview: false,
								source: 'wrangler'
							}
						}
					]
				})
			}

			if (url.includes('/workers/scripts/worker-build-test/versions/version-from-list')) {
				return cloudflareApiResponse({
					id: 'version-from-list',
					metadata: {
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return cloudflareApiResponse({
					deployments: [
						{
							id: 'deployment-from-list',
							created_on: new Date().toISOString(),
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: 'version-from-list'
								}
							],
							author_email: 'test@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args.join(' ') === 'wrangler deploy') {
					return successResult('Deployed successfully to https://worker-build-test.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: {} },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-from-list'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Resolved version id from Cloudflare version metadata'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-from-list for version version-from-list'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
		}
	})

	test('deploy falls back to the latest Cloudflare deployment when Wrangler omits the production version id entirely', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-from-deployment')) {
				return cloudflareApiResponse({
					id: 'version-from-deployment',
					metadata: {
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return cloudflareApiResponse({
					deployments: [
						{
							id: 'deployment-fallback',
							created_on: new Date().toISOString(),
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: 'version-from-deployment'
								}
							],
							author_email: 'test@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args.join(' ') === 'wrangler deploy') {
					return successResult('Deployed successfully to https://worker-build-test.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: {} },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-from-deployment'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-fallback for version version-from-deployment'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
		}
	})

	test('deploy accepts the current active production deployment when Cloudflare only exposes older live state', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions?page=1&per_page=100')) {
				return cloudflareApiResponse({
					items: [
						{
							id: 'version-existing',
							metadata: {
								created_on: '2020-01-01T00:00:00.000Z',
								modified_on: '2020-01-01T00:00:00.000Z',
								hasPreview: false,
								source: 'wrangler'
							}
						}
					]
				})
			}

			if (url.includes('/workers/scripts/worker-build-test/versions/version-existing')) {
				return cloudflareApiResponse({
					id: 'version-existing',
					metadata: {
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return cloudflareApiResponse({
					deployments: [
						{
							id: 'deployment-existing',
							created_on: '2020-01-01T00:00:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: 'version-existing'
								}
							],
							author_email: 'test@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args.join(' ') === 'wrangler deploy') {
					return successResult('Deployed successfully to https://worker-build-test.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: {} },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-existing'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Deployment verification note:'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Cloudflare kept the existing live version'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-existing for version version-existing'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
		}
	})

	test('deploy fails when a fresh production deployment is required but Cloudflare only exposes the current live deployment', async () => {
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN
		const originalVerify = process.env.DEVFLARE_VERIFY_DEPLOYMENT
		const originalDelay = process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
		const originalRequireFresh = process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions?page=1&per_page=100')) {
				return cloudflareApiResponse({
					items: [
						{
							id: 'version-existing',
							metadata: {
								created_on: '2020-01-01T00:00:00.000Z',
								modified_on: '2020-01-01T00:00:00.000Z',
								hasPreview: false,
								source: 'wrangler'
							}
						}
					]
				})
			}

			if (url.includes('/workers/scripts/worker-build-test/versions/version-existing')) {
				return cloudflareApiResponse({
					id: 'version-existing',
					metadata: {
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return cloudflareApiResponse({
					deployments: [
						{
							id: 'deployment-existing',
							created_on: '2020-01-01T00:00:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: 'version-existing'
								}
							],
							author_email: 'test@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT = 'true'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'
		process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT = 'true'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args.join(' ') === 'wrangler deploy') {
					return successResult('Deployed successfully to https://worker-build-test.example.workers.dev')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: {} },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(1)
			expect(logger.messages.some((message) => message.args.join(' ').includes('requires a fresh production deployment'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('reused live version as a failure'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
			if (typeof originalVerify === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT = originalVerify
			}
			if (typeof originalDelay === 'undefined') {
				delete process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS
			} else {
				process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = originalDelay
			}
			if (typeof originalRequireFresh === 'undefined') {
				delete process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT
			} else {
				process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT = originalRequireFresh
			}
		}
	})

	test('deploy derives preview alias urls from the workers.dev subdomain when wrangler omits them', async () => {
		await writeJson(join(projectDir, 'package.json'), {
			name: 'worker-build-test',
			private: true,
			type: 'module',
			devDependencies: {
				devflare: '^1.0.0'
			}
		})

		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-build-test',
	accountId: ${JSON.stringify(TEST_ACCOUNT_ID)},
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const originalFetch = globalThis.fetch
		const originalToken = process.env.CLOUDFLARE_API_TOKEN

		globalThis.fetch = mock(async () => new Response(JSON.stringify({
			success: true,
			result: { subdomain: 'example-subdomain' },
			errors: [],
			messages: []
		}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})) as unknown as typeof fetch
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'

		setDependencies({
			fs: await import('node:fs/promises') as CliDependencies['fs'],
			exec: createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Worker Version ID: version-123')
				}

				return successResult()
			}, executions)
		})

		try {
			const result = await runDeployCommand(
				{
					command: 'deploy',
					args: [],
					options: {
						preview: true,
						'branch-name': 'feature/branch'
					}
				},
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-123'))).toBe(true)
			expect(logger.messages.some((message) => message.args.join(' ').includes('Preview Alias URL: https://feature-branch-worker-build-test.example-subdomain.workers.dev'))).toBe(true)
		} finally {
			globalThis.fetch = originalFetch
			if (typeof originalToken === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = originalToken
			}
		}
	})
})
