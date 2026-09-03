import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { createLogger, renderMessages } from '../../helpers/mock-logger'
import {
	type ExecInvocation,
	createCliDependencies,
	createProcessRunner,
	successResult
} from './build-deploy-worker-only.test-utils'

const NEW_VERSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('deploy --percentage gradual rollout integration', () => {
	let projectDir: string
	const originalToken = process.env.CLOUDFLARE_API_TOKEN

	beforeEach(async () => {
		// A resolved version id comes from the wrangler upload stdout, so no live
		// Cloudflare account lookup is needed; set a token only to keep auth
		// resolution deterministic if any path reaches for it.
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		projectDir = mkdtempSync(join(tmpdir(), 'devflare-deploy-rollout-'))
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'deploy-rollout-tests', type: 'module' }, null, '\t')
		)
		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
			export default {
				name: 'demo-worker',
				accountId: 'acc_123',
				compatibilityDate: '2026-04-12',
				files: {
					fetch: 'src/fetch.ts'
				}
			}
		`
		)
		await writeFile(
			join(projectDir, 'src', 'fetch.ts'),
			`
			export async function fetch(): Promise<Response> {
				return new Response('ok')
			}
		`
		)
	})

	afterEach(async () => {
		if (originalToken === undefined) {
			delete process.env.CLOUDFLARE_API_TOKEN
		} else {
			process.env.CLOUDFLARE_API_TOKEN = originalToken
		}
		clearDependencies()
		await rm(projectDir, { recursive: true, force: true })
	})

	test('uploads an inactive version then routes the percentage via `wrangler versions deploy`', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(
			createCliDependencies(
				createProcessRunner((command, args) => {
					if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions') {
						if (args[2] === 'upload') {
							return successResult(`Worker Version ID: ${NEW_VERSION_ID}`)
						}
						if (args[2] === 'deploy') {
							return successResult('Deployed demo-worker version splits')
						}
					}

					return successResult()
				}, executions)
			)
		)

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { prod: true, percentage: '10' }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)

		// Production rollout must use `versions upload` (no traffic shift), never
		// a plain `wrangler deploy` (which would go straight to 100%).
		const wranglerCalls = executions.filter(
			(execution) => execution.command === 'bunx' && execution.args[0] === 'wrangler'
		)
		const uploadCall = wranglerCalls.find(
			(call) => call.args[1] === 'versions' && call.args[2] === 'upload'
		)
		const deployCall = wranglerCalls.find(
			(call) => call.args[1] === 'versions' && call.args[2] === 'deploy'
		)
		const plainDeploy = wranglerCalls.find((call) => call.args[1] === 'deploy')

		expect(uploadCall).toBeDefined()
		expect(plainDeploy).toBeUndefined()
		expect(deployCall).toBeDefined()
		expect(deployCall?.args).toContain(`${NEW_VERSION_ID}@10`)
		expect(deployCall?.args).toContain('--name')
		expect(deployCall?.args).toContain('demo-worker')
		expect(deployCall?.args).toContain('--yes')

		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes('Routed 10% of production traffic'))).toBe(
			true
		)
	})

	test('splits the remaining traffic to an explicit previous version with --version', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(
			createCliDependencies(
				createProcessRunner((command, args) => {
					if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions') {
						if (args[2] === 'upload') {
							return successResult(`Worker Version ID: ${NEW_VERSION_ID}`)
						}
						if (args[2] === 'deploy') {
							return successResult('split applied')
						}
					}
					return successResult()
				}, executions)
			)
		)

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { prod: true, percentage: '25', version: 'old-version-id' }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const deployCall = executions.find(
			(execution) =>
				execution.command === 'bunx' &&
				execution.args[1] === 'versions' &&
				execution.args[2] === 'deploy'
		)
		expect(deployCall?.args).toContain(`${NEW_VERSION_ID}@25`)
		expect(deployCall?.args).toContain('old-version-id@75')
	})

	test('fails loudly when `wrangler versions deploy` exits non-zero (no silent success)', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(
			createCliDependencies(
				createProcessRunner((command, args) => {
					if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions') {
						if (args[2] === 'upload') {
							return successResult(`Worker Version ID: ${NEW_VERSION_ID}`)
						}
						if (args[2] === 'deploy') {
							return {
								exitCode: 1,
								stdout: '',
								stderr: 'rollout rejected',
								failed: true,
								killed: false
							}
						}
					}
					return successResult()
				}, executions)
			)
		)

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { prod: true, percentage: '10' }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(1)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes('failed to route 10%'))).toBe(true)
	})

	test('rejects --percentage on a named preview target (never shifts production traffic)', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult(), executions)))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { preview: 'next', percentage: '10' }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(1)
		// No wrangler invocation at all — rejected before any upload/deploy.
		expect(
			executions.some(
				(execution) => execution.command === 'bunx' && execution.args[0] === 'wrangler'
			)
		).toBe(false)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes('production gradual rollout'))).toBe(true)
	})

	test('rejects --percentage with bare --preview', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult(), executions)))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { preview: true, percentage: '10' }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(1)
		// Rejected before any wrangler upload/deploy ran.
		expect(
			executions.some(
				(execution) => execution.command === 'bunx' && execution.args[0] === 'wrangler'
			)
		).toBe(false)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes('production gradual rollout'))).toBe(true)
	})
})
