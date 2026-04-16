import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import { createLogger, renderMessages } from '../../helpers/mock-logger'
import {
	createCliDependencies,
	createProcessRunner,
	successResult,
	type ExecInvocation
} from './build-deploy-worker-only.test-utils'

describe('deploy target integration', () => {
	let projectDir: string
	let originalPreviewBranch: string | undefined

	beforeEach(async () => {
		projectDir = mkdtempSync(join(tmpdir(), 'devflare-deploy-targets-'))
		originalPreviewBranch = process.env.DEVFLARE_PREVIEW_BRANCH
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'deploy-target-tests',
			type: 'module'
		}, null, '\t'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(join(projectDir, 'devflare.config.ts'), `
			const branch = process.env.DEVFLARE_PREVIEW_BRANCH?.trim()
			export default {
				name: branch ? \`demo-worker-\${branch}\` : 'demo-worker',
				accountId: 'acc_123',
				compatibilityDate: '2026-04-12',
				files: {
					fetch: 'src/fetch.ts'
				}
			}
		`)
		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
			export async function fetch(): Promise<Response> {
				return new Response('ok')
			}
		`)
	})

	afterEach(async () => {
		if (typeof originalPreviewBranch === 'string') {
			process.env.DEVFLARE_PREVIEW_BRANCH = originalPreviewBranch
		} else {
			delete process.env.DEVFLARE_PREVIEW_BRANCH
		}
		clearDependencies()
		await rm(projectDir, { recursive: true, force: true })
	})

	test('deploy --prod clears preview branch naming overrides before building', async () => {
		process.env.DEVFLARE_PREVIEW_BRANCH = 'next'
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy') {
					return successResult('Version ID: version-123')
				}

				return successResult()
			}, executions)
		))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					prod: true
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(executions.some((execution) => execution.command === 'bunx' && execution.args[0] === 'wrangler' && execution.args[1] === 'deploy')).toBe(true)
		expect(renderedMessages.some((message) => message.includes('demo-worker'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('demo-worker-next'))).toBe(false)
		expect(process.env.DEVFLARE_PREVIEW_BRANCH).toBe('next')
	})

	test('deploy requires named preview scope and branch metadata to agree', async () => {
		const logger = createLogger()

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					preview: 'next',
					'branch-name': 'feature-branch'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(1)
		expect(renderedMessages.some((message) => message.includes('Named preview deploys use the --preview value as the preview scope'))).toBe(true)
	})

	test('deploy --preview <name> deploys a named preview scope with branch-scoped worker naming', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
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
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(executions.some((execution) => execution.command === 'bunx' && execution.args[0] === 'wrangler' && execution.args[1] === 'deploy')).toBe(true)
		expect(executions.some((execution) => execution.command === 'bunx' && execution.args[0] === 'wrangler' && execution.args[1] === 'versions' && execution.args[2] === 'upload')).toBe(false)
		expect(renderedMessages.some((message) => message.includes('demo-worker-next'))).toBe(true)
		expect(process.env.DEVFLARE_PREVIEW_BRANCH).toBe(originalPreviewBranch)
	})

	test('deploy --preview clears stale preview branch naming overrides before same-worker preview uploads', async () => {
		process.env.DEVFLARE_PREVIEW_BRANCH = 'next'
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(
			createProcessRunner((command, args) => {
				if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions' && args[2] === 'upload') {
					return successResult('Version ID: version-789')
				}

				return successResult()
			}, executions)
		))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: {
					preview: true
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(executions.some((execution) => (
			execution.command === 'bunx'
			&& execution.args[0] === 'wrangler'
			&& execution.args[1] === 'versions'
			&& execution.args[2] === 'upload'
		))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('demo-worker'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('demo-worker-next'))).toBe(false)
		expect(process.env.DEVFLARE_PREVIEW_BRANCH).toBe('next')
	})
})
