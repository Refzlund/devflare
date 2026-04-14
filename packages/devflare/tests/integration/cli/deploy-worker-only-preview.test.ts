import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import {
	TEST_ACCOUNT_ID,
	captureDeployEnvironmentSnapshot,
	cloudflareApiResponse,
	createCliDependencies,
	createLogger,
	createProcessRunner,
	createWorkerVersionDetail,
	disableCloudflareAccountResolution,
	enableStrictDeployVerification,
	isViteBuildExecution,
	restoreDeployEnvironmentSnapshot,
	successResult,
	writeAccountProjectFiles,
	writeProjectFiles,
	type ExecInvocation
} from './build-deploy-worker-only.test-utils'

const originalEnvironment = captureDeployEnvironmentSnapshot()

describe('build/deploy worker-only behavior', () => {
	let projectDir = ''

	beforeEach(async () => {
		clearDependencies()
		disableCloudflareAccountResolution()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-worker-preview-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		restoreDeployEnvironmentSnapshot(originalEnvironment)
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('deploy skips vite for worker-only projects and still runs wrangler deploy', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (isViteBuildExecution(command, args)) {
					throw new Error('vite build should not run for worker-only deploy')
				}

				return successResult()
			}, executions)
		))

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

	test('deploy prefers the local wrangler package over bunx when it is installed in the project', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })
		await mkdir(join(projectDir, 'node_modules', 'wrangler', 'bin'), { recursive: true })
		await writeFile(join(projectDir, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({
			name: 'wrangler',
			version: '3.114.17',
			type: 'module',
			bin: {
				wrangler: './bin/wrangler.js'
			}
		}, null, '\t'))
		await writeFile(join(projectDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), `
#!/usr/bin/env node
console.log('stub wrangler binary')
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (isViteBuildExecution(command, args)) {
					throw new Error('vite build should not run for worker-only deploy')
				}

				return successResult()
			}, executions)
		))

		const result = await runDeployCommand(
			{ command: 'deploy', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const deployExecution = executions.find(({ args }) => args.at(-1) === 'deploy')
		expect(deployExecution?.command).toBe('bun')
		expect(deployExecution?.args[0]?.replace(/\\/g, '/')).toBe(`${projectDir.replace(/\\/g, '/')}/node_modules/wrangler/bin/wrangler.js`)
		expect(deployExecution?.args.slice(1)).toEqual(['deploy'])
	})

	test('deploy prefers a local wrangler package installed in an ancestor workspace directory', async () => {
		const workspaceDir = join(projectDir, 'workspace')
		const workerDir = join(workspaceDir, 'workers', 'auth-service')
		await mkdir(workerDir, { recursive: true })
		await writeProjectFiles(workerDir, { withViteConfig: false, withViteDeps: false })
		await mkdir(join(workspaceDir, 'node_modules', 'wrangler', 'bin'), { recursive: true })
		await writeFile(join(workspaceDir, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({
			name: 'wrangler',
			version: '4.81.1',
			type: 'module',
			bin: {
				wrangler: './bin/wrangler.js'
			}
		}, null, '\t'))
		await writeFile(join(workspaceDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), `
#!/usr/bin/env node
console.log('stub wrangler binary')
`.trim())

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (isViteBuildExecution(command, args)) {
					throw new Error('vite build should not run for worker-only deploy')
				}

				return successResult()
			}, executions)
		))

		const result = await runDeployCommand(
			{ command: 'deploy', args: [], options: {} },
			logger as any,
			{ cwd: workerDir }
		)

		expect(result.exitCode).toBe(0)
		const deployExecution = executions.find(({ args }) => args.at(-1) === 'deploy')
		expect(deployExecution?.command).toBe('bun')
		expect(deployExecution?.args[0]?.replace(/\\/g, '/')).toBe(`${workspaceDir.replace(/\\/g, '/')}/node_modules/wrangler/bin/wrangler.js`)
		expect(deployExecution?.args.slice(1)).toEqual(['deploy'])
	})

	test('deploy forwards Wrangler version metadata flags when message and tag are provided', async () => {
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult(), executions)))

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
		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Version ID: version-123\nPreview URL: https://preview.example.workers.dev\nPreview Alias URL: https://worker-build-test-feature-branch.example.workers.dev')
				}

				return successResult()
			}, executions)
		))

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
		await writeAccountProjectFiles(projectDir)

		const executions: ExecInvocation[] = []
		const logger = createLogger()

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-123')) {
				return cloudflareApiResponse(createWorkerVersionDetail('version-123', { hasPreview: true }))
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		enableStrictDeployVerification()

		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Version ID: version-123\nPreview URL: https://preview.example.workers.dev')
				}

				return successResult()
			}, executions)
		))

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
	})

	test('deploy derives preview alias urls from the workers.dev subdomain when wrangler omits them', async () => {
		await writeAccountProjectFiles(projectDir, {
			accountId: TEST_ACCOUNT_ID,
			workerName: 'worker-build-test'
		})

		const executions: ExecInvocation[] = []
		const logger = createLogger()

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

		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Worker Version ID: version-123')
				}

				return successResult()
			}, executions)
		))

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
	})

	test('deploy derives branch-scoped preview urls from the workers.dev subdomain when wrangler omits them', async () => {
		await writeAccountProjectFiles(projectDir, {
			accountId: TEST_ACCOUNT_ID,
			workerName: 'worker-build-test-next'
		})

		const executions: ExecInvocation[] = []
		const logger = createLogger()

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

		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy') {
					return successResult('Version ID: version-456')
				}

				return successResult()
			}, executions)
		))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					preview: 'next'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Preview URL: https://worker-build-test-next.example-subdomain.workers.dev'))).toBe(true)
	})

	test('deploy accepts branch-scoped preview deploys when Cloudflare does not expose a Worker version id', async () => {
		await writeAccountProjectFiles(projectDir, {
			accountId: TEST_ACCOUNT_ID,
			workerName: 'worker-build-test-next'
		})

		const executions: ExecInvocation[] = []
		const logger = createLogger()
		const requestedUrls: string[] = []

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			requestedUrls.push(url)

			if (url.endsWith(`/accounts/${TEST_ACCOUNT_ID}/workers/subdomain`)) {
				return cloudflareApiResponse({ subdomain: 'example-subdomain' })
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		enableStrictDeployVerification({ accountId: TEST_ACCOUNT_ID })

		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy') {
					return successResult('Deployed successfully')
				}

				return successResult()
			}, executions)
		))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					preview: 'next'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Preview URL: https://worker-build-test-next.example-subdomain.workers.dev'))).toBe(true)
		expect(logger.messages.some((message) => {
			const line = message.args.join(' ')
			return line.includes('Deployment verification note:')
				&& line.includes('branch-scoped preview deploy as successful')
		})).toBe(true)
		expect(requestedUrls).toContain(
			`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/workers/subdomain`
		)
		expect(requestedUrls.some((url) => url.includes('/workers/scripts/worker-build-test-next/versions'))).toBe(false)
		expect(requestedUrls.some((url) => url.endsWith('/workers/scripts/worker-build-test-next/deployments'))).toBe(false)
	})
})
