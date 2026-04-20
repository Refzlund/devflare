import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { runBuildCommand } from '../../../src/cli/commands/build'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import {
	captureDeployEnvironmentSnapshot,
	cloudflareApiResponse,
	createCliDependencies,
	createDeployHarness,
	createLogger,
	createProcessRunner,
	createWranglerDeployProcessRunner,
	isViteBuildExecution,
	readGeneratedDeployConfig,
	successResult,
	writeNamedD1ProjectFiles,
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
): Promise<void> {
	const result = await runBuildCommand(
		{ command: 'build', args: [], options: {} },
		logger as any,
		{ cwd: projectDir }
	)

	expect(result.exitCode).toBe(0)
}

describe('deploy build artifact provisioning', () => {
	let projectDir = ''
	const originalFetch = globalThis.fetch

	beforeEach(async () => {
		clearDependencies()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-build-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		globalThis.fetch = originalFetch
		delete process.env.CLOUDFLARE_API_TOKEN
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('deploy --build provisions named D1 bindings without rebuilding', async () => {
		await writeNamedD1ProjectFiles(projectDir)
		const buildHarness = createBuildHarness()
		await runSuccessfulBuild(projectDir, buildHarness.logger)

		const envSnapshot = captureDeployEnvironmentSnapshot()
		const createdRequests: string[] = []

		try {
			process.env.CLOUDFLARE_API_TOKEN = 'test-token'
			globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
				const method = init?.method ?? 'GET'
				const url = String(input)

				if (method === 'GET' && url.includes('/accounts/account-123/d1/database')) {
					return cloudflareApiResponse([])
				}

				if (method === 'POST' && url.endsWith('/accounts/account-123/d1/database')) {
					createdRequests.push(String(init?.body ?? ''))
					return cloudflareApiResponse({
						uuid: 'd1-created',
						name: 'app-db',
						version: 'alpha',
						num_tables: 0,
						file_size: 0
					})
				}

				throw new Error(`Unexpected Cloudflare request: ${method} ${url}`)
			}) as unknown as typeof fetch

			const { executions, logger } = createDeployHarness(createWranglerDeployProcessRunner({
				structuredOutput: {
					version_id: 'version-123',
					url: 'https://worker-build-test.example.workers.dev'
				}
			}))
			const result = await runDeployCommand(
				{ command: 'deploy', args: [], options: { build: '.devflare/build' } },
				logger as any,
				{ cwd: projectDir }
			)

			expect(result.exitCode).toBe(0)
			expect(executions.some(({ command, args }) => isViteBuildExecution(command, args))).toBe(false)
			expect(executions.some(({ command, args }) => command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy')).toBe(true)
			expect(createdRequests).toHaveLength(1)
			expect(createdRequests[0]).toContain('"name":"app-db"')

			const deployConfig = await readGeneratedDeployConfig(projectDir)
			expect(deployConfig).toContain('"database_id": "d1-created"')
			expect(deployConfig).not.toContain('"database_name": "app-db"')
		} finally {
			globalThis.fetch = envSnapshot.fetch
			if (typeof envSnapshot.token === 'undefined') {
				delete process.env.CLOUDFLARE_API_TOKEN
			} else {
				process.env.CLOUDFLARE_API_TOKEN = envSnapshot.token
			}
		}
	})
})
