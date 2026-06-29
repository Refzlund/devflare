import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProductionsCommand } from '../../../src/cli/commands/productions'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { createLogger, renderMessages } from '../../helpers/mock-logger'
import { createCliDependencies, successResult } from '../../helpers/process-runner'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const temporaryDirectories = new Set<string>()

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
	clearDependencies()
	for (const directory of temporaryDirectories) {
		rmSync(directory, { recursive: true, force: true })
	}
	temporaryDirectories.clear()
})

describe('productions command', () => {
	test('lists active production deployments for a configured worker family', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const projectDir = mkdtempSync(join(tmpdir(), 'devflare-productions-family-'))
		temporaryDirectories.add(projectDir)
		writeFileSync(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'demo-productions-family',
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
				name: 'demo-worker',
				accountId: 'acc_123',
				compatibilityDate: '2026-04-12',
				bindings: {
					services: {
						AUTH_SERVICE: { service: 'demo-auth-service' }
					}
				}
			}
		`,
			'utf-8'
		)

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse(
					[
						{
							id: 'demo-worker',
							created_on: '2026-04-12T10:00:00.000Z',
							modified_on: '2026-04-12T10:05:00.000Z'
						},
						{
							id: 'demo-auth-service',
							created_on: '2026-04-12T10:00:00.000Z',
							modified_on: '2026-04-12T10:04:00.000Z'
						}
					],
					{
						page: 1,
						per_page: 50,
						total_pages: 1,
						count: 2,
						total_count: 2
					}
				)
			}

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({
					subdomain: 'demo-subdomain'
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deployment-main',
							created_on: '2026-04-12T11:00:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: '11111111-1111-4111-8111-111111111111'
								}
							]
						}
					]
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-auth-service/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deployment-auth',
							created_on: '2026-04-12T11:01:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: '22222222-2222-4222-8222-222222222222'
								}
							]
						}
					]
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runProductionsCommand(
			{
				command: 'productions',
				args: [],
				options: {
					account: 'acc_123'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('worker family demo-worker'))).toBe(
			true
		)
		expect(renderedMessages.some((message) => message.includes('related'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Productions (2)'))).toBe(true)
		expect(
			renderedMessages.some((message) => message.includes('demo-worker.demo-subdomain.workers.dev'))
		).toBe(true)
		expect(renderedMessages.some((message) => message.includes('11111111-111'))).toBe(true)
	})

	test('lists recent production versions for a worker', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (
				url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/versions?page=1&per_page=100')
			) {
				return jsonResponse({
					items: [
						{
							id: '11111111-1111-4111-8111-111111111111',
							metadata: {
								hasPreview: false,
								modified_on: '2026-04-12T11:00:00.000Z',
								source: 'wrangler'
							}
						},
						{
							id: '33333333-3333-4333-8333-333333333333',
							metadata: {
								hasPreview: false,
								modified_on: '2026-04-11T11:00:00.000Z',
								source: 'wrangler'
							}
						}
					]
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deployment-main',
							created_on: '2026-04-12T11:05:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: '11111111-1111-4111-8111-111111111111'
								}
							]
						}
					]
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runProductionsCommand(
			{
				command: 'productions',
				args: ['versions'],
				options: {
					account: 'acc_123',
					worker: 'demo-worker'
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('worker demo-worker'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Versions (2)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('active'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('stored'))).toBe(true)
	})

	test('lists the full production deployment history for a worker', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deployment-older',
							created_on: '2026-04-11T09:00:00.000Z',
							source: 'dashboard',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: '33333333-3333-4333-8333-333333333333'
								}
							],
							annotations: {
								'workers/message': 'Initial production rollout',
								'workers/triggered_by': 'alice@example.com'
							},
							author_email: 'alice@example.com'
						},
						{
							id: 'deployment-newer',
							created_on: '2026-04-12T11:05:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 80,
									version_id: '11111111-1111-4111-8111-111111111111'
								},
								{
									percentage: 20,
									version_id: '22222222-2222-4222-8222-222222222222'
								}
							],
							annotations: {
								'workers/message': 'Gradual rollout to 80/20',
								'workers/triggered_by': 'bob@example.com'
							},
							author_email: 'bob@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runProductionsCommand(
			{
				command: 'productions',
				args: ['deployments'],
				options: {
					account: 'acc_123',
					worker: 'demo-worker'
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('worker demo-worker'))).toBe(true)
		// Both deployments rendered in the history table.
		expect(renderedMessages.some((message) => message.includes('Deployments (2)'))).toBe(true)
		// Strategy surfaced.
		expect(renderedMessages.some((message) => message.includes('percentage'))).toBe(true)
		// Per-version traffic split surfaced (80% / 20% of the gradual rollout).
		expect(renderedMessages.some((message) => message.includes('80% →'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('20% →'))).toBe(true)
		// Deployment message surfaced.
		expect(renderedMessages.some((message) => message.includes('Gradual rollout to 80/20'))).toBe(
			true
		)
		// Triggered-by surfaced.
		expect(renderedMessages.some((message) => message.includes('bob@example.com'))).toBe(true)
	})

	test('rolls a worker back with Wrangler when apply is set', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const executions: Array<{ command: string; args: string[] }> = []
		setDependencies(
			createCliDependencies({
				exec: async (command, args = []) => {
					executions.push({ command, args })
					return successResult()
				},
				spawn: mock(() => {
					throw new Error('spawn should not be called in productions rollback test')
				}) as any
			})
		)

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deployment-main',
							created_on: '2026-04-12T11:05:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: '11111111-1111-4111-8111-111111111111'
								}
							]
						}
					]
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runProductionsCommand(
			{
				command: 'productions',
				args: ['rollback'],
				options: {
					account: 'acc_123',
					worker: 'demo-worker',
					apply: true
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(executions).toHaveLength(1)
		expect(executions[0]?.command).toBe('bunx')
		expect(executions[0]?.args).toEqual([
			'wrangler',
			'rollback',
			'--name',
			'demo-worker',
			'--message',
			'Rolled back demo-worker via devflare productions rollback'
		])
		expect(
			renderedMessages.some((message) =>
				message.includes('Rolled back production deployment for demo-worker')
			)
		).toBe(true)
	})

	test('deletes a production worker script when apply is set', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			if (
				url.endsWith('/accounts/acc_123/workers/scripts/demo-worker') &&
				init?.method === 'DELETE'
			) {
				return jsonResponse({})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runProductionsCommand(
			{
				command: 'productions',
				args: ['delete'],
				options: {
					account: 'acc_123',
					worker: 'demo-worker',
					apply: true
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(
			renderedMessages.some((message) =>
				message.includes('Deleted production Worker script demo-worker')
			)
		).toBe(true)
	})
})
