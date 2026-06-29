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

const HINT_NEEDLE = 'wrangler secret put'
const VERSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('deploy remote-secrets hint', () => {
	let projectDir: string
	const originalToken = process.env.CLOUDFLARE_API_TOKEN

	beforeEach(async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		projectDir = mkdtempSync(join(tmpdir(), 'devflare-deploy-secrets-hint-'))
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'deploy-secrets-hint-tests', type: 'module' }, null, '\t')
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

	test('prints the runtime-secrets hint after a successful production deploy', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(
			createCliDependencies(
				createProcessRunner((command, args) => {
					if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy') {
						// Return a version id so deploy does not reach for a live
						// Cloudflare version lookup (which would hit the network).
						return successResult(`Worker Version ID: ${VERSION_ID}`)
					}
					return successResult()
				}, executions)
			)
		)

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { prod: true }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes(HINT_NEEDLE))).toBe(true)
	})

	test('does not print the hint on a preview deploy', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(
			createCliDependencies(
				createProcessRunner((command, args) => {
					if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'versions') {
						return successResult(`Worker Version ID: ${VERSION_ID}`)
					}
					return successResult()
				}, executions)
			)
		)

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { preview: true }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes(HINT_NEEDLE))).toBe(false)
	})

	test('does not print the hint on a named/branch-scoped preview deploy', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(
			createCliDependencies(
				createProcessRunner((command, args) => {
					// A branch-scoped preview uses a plain `wrangler deploy`; return a
					// version id so deploy resolves offline (no live version lookup).
					if (command === 'bunx' && args[0] === 'wrangler' && args[1] === 'deploy') {
						return successResult(`Version ID: ${VERSION_ID}`)
					}
					return successResult()
				}, executions)
			)
		)

		// A named preview (`--preview <name>`) resolves to mode 'preview-scope'
		// where `preview === false`, so it must be gated by the branch-scoped flag
		// too — the hint is about PRODUCTION secrets and must not fire here.
		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { preview: 'my-feature-branch' }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes(HINT_NEEDLE))).toBe(false)
	})

	test('does not print the hint on a dry run', async () => {
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult(), executions)))

		const result = await runDeployCommand(
			{
				command: 'deploy',
				args: [],
				options: { prod: true, 'dry-run': true }
			},
			logger as never,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)
		const messages = renderMessages(logger)
		expect(messages.some((message) => message.includes(HINT_NEEDLE))).toBe(false)
	})
})
