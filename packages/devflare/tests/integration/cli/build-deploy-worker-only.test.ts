import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { runBuildCommand } from '../../../src/cli/commands/build'
import {
	createCliDependencies,
	createLogger,
	createProcessRunner,
	isViteBuildExecution,
	readGeneratedDeployConfig,
	readGeneratedDevConfig,
	successResult,
	writeMultiSurfaceProjectFiles,
	writeProjectFiles,
	writeRequestWideHandleProjectFiles,
	writeRolldownWorkerProjectFiles,
	writeRouteProjectFiles,
	writeServiceBindingProjectFiles,
	type ExecInvocation
} from './build-deploy-worker-only.test-utils'

function createBuildHarness(
	processRunner: Parameters<typeof createProcessRunner>[0] = () => successResult()
): {
	executions: ExecInvocation[]
	logger: ReturnType<typeof createLogger>
} {
	const executions: ExecInvocation[] = []
	const logger = createLogger()
	setDependencies(createCliDependencies(createProcessRunner(processRunner, executions)))
	return {
		executions,
		logger
	}
}

async function runSuccessfulBuild(
	projectDir: string,
	logger: ReturnType<typeof createLogger>
) {
	const result = await runBuildCommand(
		{ command: 'build', args: [], options: {} },
		logger as any,
		{ cwd: projectDir }
	)

	if (result.exitCode !== 0) {
		throw new Error(logger.messages.map((message) => `[${message.level}] ${message.args.join(' ')}`).join('\n'))
	}

	expect(result.exitCode).toBe(0)
	return result
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

		const { executions, logger } = createBuildHarness(
			(command, args) => {
				if (isViteBuildExecution(command, args)) {
					throw new Error('vite build should not run for worker-only build')
				}

				return successResult()
			}
		)

		await runSuccessfulBuild(projectDir, logger)
		expect(executions.some(({ command, args }) => isViteBuildExecution(command, args))).toBe(false)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Skipping Vite build'))).toBe(true)
		await access(join(projectDir, '.devflare', 'wrangler.jsonc'))
		await access(join(projectDir, '.devflare', 'build', 'wrangler.jsonc'))
		await access(join(projectDir, '.wrangler', 'deploy', 'config.json'))
	})

	test('build still runs vite when the current package has a local vite.config', async () => {
		await writeProjectFiles(projectDir, {
			withViteConfig: true,
			withViteDeps: true,
			passthroughMain: 'src/fetch.ts'
		})

		const { executions, logger } = createBuildHarness(
			(command, args) => successResult(`${command} ${args.join(' ')}`)
		)

		await runSuccessfulBuild(projectDir, logger)
		const viteBuildExecution = executions.find(({ command, args }) => isViteBuildExecution(command, args))
		expect(viteBuildExecution).toBeDefined()
		expect(viteBuildExecution?.command.replace(/\\/g, '/')).toContain('/node_modules/vite/bin/vite.js')
		await access(join(projectDir, '.devflare', 'vite.config.mjs'))
	})

	test('build runs vite with a generated config when devflare.config.ts contains inline vite config', async () => {
		await writeProjectFiles(projectDir, {
			withViteConfig: false,
			withViteDeps: true,
			withInlineViteConfig: true,
			passthroughMain: 'src/fetch.ts'
		})

		const { executions, logger } = createBuildHarness(
			(command, args) => successResult(`${command} ${args.join(' ')}`)
		)

		await runSuccessfulBuild(projectDir, logger)
		const viteBuildExecution = executions.find(({ command, args }) => isViteBuildExecution(command, args))
		expect(viteBuildExecution).toBeDefined()
		expect(viteBuildExecution?.command.replace(/\\/g, '/')).toContain('/node_modules/vite/bin/vite.js')
		expect(viteBuildExecution?.args).toContain('--config')
		await access(join(projectDir, '.devflare', 'vite.config.mjs'))
	})

	test('build preserves named service binding entrypoints in generated wrangler output', async () => {
		await writeServiceBindingProjectFiles(projectDir)

		const { logger } = createBuildHarness()
		await runSuccessfulBuild(projectDir, logger)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"service": "auth-worker"')
		expect(wranglerConfig).toContain('"entrypoint": "AdminEntrypoint"')
	})

	test('build generates a composed worker entry for fetch-only request-wide handle middleware', async () => {
		await writeRequestWideHandleProjectFiles(projectDir)

		const { logger } = createBuildHarness()
		await runSuccessfulBuild(projectDir, logger)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"main": "worker-entrypoints/main.js"')

		const composedEntry = await readFile(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'), 'utf8')
		expect(composedEntry).toContain('src/fetch.ts')
		expect(composedEntry).toContain('invokeFetchModule')
	})

	test('build generates a composed worker entry when queue, scheduled, or email files are configured', async () => {
		await writeMultiSurfaceProjectFiles(projectDir)

		const { logger } = createBuildHarness()
		await runSuccessfulBuild(projectDir, logger)

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

		const { logger } = createBuildHarness()
		await runSuccessfulBuild(projectDir, logger)

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

		const { logger } = createBuildHarness()
		await runSuccessfulBuild(projectDir, logger)

		const wranglerConfig = await readGeneratedDevConfig(projectDir)
		expect(wranglerConfig).toContain('"main": "../src/custom-main.ts"')
		await expect(access(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'))).rejects.toThrow()
	})

	test('build applies rolldown plugins to the bundled worker artifact', async () => {
		await writeRolldownWorkerProjectFiles(projectDir)

		const { logger } = createBuildHarness()
		await runSuccessfulBuild(projectDir, logger)
		const bundledWorker = await readFile(join(projectDir, '.devflare', 'build', 'worker.js'), 'utf8')
		expect(bundledWorker).toContain('Hello from Svelte')
	})
})
