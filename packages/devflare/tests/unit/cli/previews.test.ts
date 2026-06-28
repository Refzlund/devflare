import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runPreviewsCommand } from '../../../src/cli/commands/previews'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'
import {
	capturePreviewTestEnvironmentSnapshot,
	createLogger,
	jsonResponse,
	renderMessages,
	restorePreviewTestEnvironmentSnapshot
} from './previews.test-utils'

const originalEnvironment = capturePreviewTestEnvironmentSnapshot()
const temporaryCacheDirectories = createTrackedTempDirectories()

function writePreviewProject(projectDir: string, projectName: string, accountId = 'acc_123'): void {
	const previewScopedValue = `__DEVFLARE_PREVIEW_SCOPE__:${JSON.stringify({ baseName: 'cache-kv', separator: '-' })}`
	writeFileSync(
		join(projectDir, 'package.json'),
		JSON.stringify(
			{
				name: projectName,
				type: 'module'
			},
			null,
			'\t'
		),
		'utf-8'
	)
	writeFileSync(
		join(projectDir, 'devflare.config.ts'),
		`
		export default {
			name: ${JSON.stringify(projectName)},
			accountId: ${JSON.stringify(accountId)},
			compatibilityDate: '2026-04-08',
			bindings: {
				kv: {
					CACHE: ${JSON.stringify(previewScopedValue)}
				}
			}
		}
	`,
		'utf-8'
	)
}

afterEach(() => {
	restorePreviewTestEnvironmentSnapshot(originalEnvironment)
	temporaryCacheDirectories.cleanup()
})

describe('previews command', () => {
	test('rejects unknown subcommands', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['demo-worker'],
				options: {
					account: 'acc_123'
				}
			},
			logger as any,
			{}
		)

		expect(result.exitCode).toBe(1)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('Unknown previews subcommand: demo-worker')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('Available previews subcommands: list, bindings, cleanup')
			)
		).toBe(true)
	})

	test('cleanup performs a dry run by default', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const projectDir = temporaryCacheDirectories.create('devflare-previews-cleanup-')
		writePreviewProject(projectDir, 'demo-preview-cleanup')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/storage/kv/namespaces?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['cleanup'],
				options: {
					account: 'acc_123'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(
			renderedMessages.some((message) => message.includes('Preview cleanup dry run complete'))
		).toBe(true)
	})

	test('lists every configured worker family when run from a monorepo root', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const workspaceDir = temporaryCacheDirectories.create('devflare-previews-workspace-')
		writeFileSync(
			join(workspaceDir, 'package.json'),
			JSON.stringify(
				{
					name: 'preview-workspace',
					private: true,
					type: 'module',
					workspaces: ['apps/*']
				},
				null,
				'\t'
			),
			'utf-8'
		)

		const docsDir = join(workspaceDir, 'apps', 'docs')
		const testingDir = join(workspaceDir, 'apps', 'testing')
		mkdirSync(docsDir, { recursive: true })
		mkdirSync(testingDir, { recursive: true })
		writePreviewProject(docsDir, 'docs-worker')
		writePreviewProject(testingDir, 'testing-worker')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse(
					[
						{
							id: 'docs-worker',
							created_on: '2026-04-12T10:00:00.000Z',
							modified_on: '2026-04-12T10:05:00.000Z'
						},
						{
							id: 'docs-worker-pr-42',
							created_on: '2026-04-12T10:01:00.000Z',
							modified_on: '2026-04-12T10:06:00.000Z'
						},
						{
							id: 'testing-worker',
							created_on: '2026-04-12T10:02:00.000Z',
							modified_on: '2026-04-12T10:07:00.000Z'
						},
						{
							id: 'testing-worker-next',
							created_on: '2026-04-12T10:03:00.000Z',
							modified_on: '2026-04-12T10:08:00.000Z'
						}
					],
					{
						page: 1,
						per_page: 50,
						total_pages: 1,
						count: 4,
						total_count: 4
					}
				)
			}

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({
					subdomain: 'demo-subdomain'
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: [],
				options: {}
			},
			logger as any,
			{ cwd: workspaceDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(
			renderedMessages.some((message) => message.includes('configured worker families 2'))
		).toBe(true)
		expect(renderedMessages.some((message) => message.includes('worker family docs-worker'))).toBe(
			true
		)
		expect(
			renderedMessages.some((message) => message.includes('worker family testing-worker'))
		).toBe(true)
		expect(
			renderedMessages.some((message) => message.includes('docs-worker.demo-subdomain.workers.dev'))
		).toBe(true)
		expect(
			renderedMessages.some((message) =>
				message.includes('testing-worker-next.demo-subdomain.workers.dev')
			)
		).toBe(true)
	})

	test('requires --account when a monorepo root discovers multiple Cloudflare accounts', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const workspaceDir = temporaryCacheDirectories.create('devflare-previews-workspace-accounts-')
		writeFileSync(
			join(workspaceDir, 'package.json'),
			JSON.stringify(
				{
					name: 'preview-workspace-accounts',
					private: true,
					type: 'module',
					workspaces: ['apps/*']
				},
				null,
				'\t'
			),
			'utf-8'
		)

		const docsDir = join(workspaceDir, 'apps', 'docs')
		const testingDir = join(workspaceDir, 'apps', 'testing')
		mkdirSync(docsDir, { recursive: true })
		mkdirSync(testingDir, { recursive: true })
		writePreviewProject(docsDir, 'docs-worker', 'acc_123')
		writePreviewProject(testingDir, 'testing-worker', 'acc_456')

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: [],
				options: {}
			},
			logger as any,
			{ cwd: workspaceDir }
		)

		expect(result.exitCode).toBe(1)
		expect(
			logger.messages.some((message) => {
				return message.args
					.join(' ')
					.includes('Multiple Cloudflare account ids were discovered across local Devflare configs')
			})
		).toBe(true)
	})
})
