import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPreviewsCommand } from '../../../src/cli/commands/previews'

interface TestLogger {
	info: ReturnType<typeof mock>
	warn: ReturnType<typeof mock>
	error: ReturnType<typeof mock>
	success: ReturnType<typeof mock>
	debug: ReturnType<typeof mock>
	log: ReturnType<typeof mock>
	messages: Array<{ level: string; args: unknown[] }>
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
}

function createLogger(): TestLogger {
	const messages: Array<{ level: string; args: unknown[] }> = []

	const createMethod = (level: string) => mock((...args: unknown[]) => {
		messages.push({ level, args })
	})

	return {
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		log: createMethod('log'),
		messages
	}
}

function jsonResponse(result: unknown, resultInfo?: Record<string, number>): Response {
	return new Response(JSON.stringify({
		success: true,
		errors: [],
		messages: [],
		result,
		...(resultInfo ? { result_info: resultInfo } : {})
	}), {
		headers: {
			'Content-Type': 'application/json'
		}
	})
}

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const originalCacheDir = process.env.DEVFLARE_CACHE_DIR
const temporaryCacheDirectories = new Set<string>()

function createTemporaryCacheDir(): string {
	const directory = mkdtempSync(join(tmpdir(), 'devflare-previews-cli-'))
	temporaryCacheDirectories.add(directory)
	return directory
}

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
	if (originalCacheDir === undefined) {
		delete process.env.DEVFLARE_CACHE_DIR
	} else {
		process.env.DEVFLARE_CACHE_DIR = originalCacheDir
	}
	for (const directory of temporaryCacheDirectories) {
		rmSync(directory, { recursive: true, force: true })
	}
	temporaryCacheDirectories.clear()
})

describe('previews command', () => {
	test('provisions the preview registry database', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.DEVFLARE_CACHE_DIR = createTemporaryCacheDir()
		const requestBodies: Array<{ url: string; body?: unknown }> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
			requestBodies.push({ url, body })

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.endsWith('/accounts/acc_123/d1/database')) {
				return jsonResponse({
					uuid: 'db_123',
					name: 'devflare-registry',
					version: 'alpha',
					num_tables: 0,
					file_size: 0
				})
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				return jsonResponse([
					{
						success: true,
						meta: {
							served_by: 'test',
							duration: 0,
							changes: 0,
							last_row_id: 0,
							changed_db: false,
							size_after: 0,
							rows_read: 0,
							rows_written: 0
						},
						results: []
					}
				])
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['provision'],
				options: {
					account: 'acc_123'
				}
			},
			logger as any,
			{}
		)

		expect(result.exitCode).toBe(0)
		expect(requestBodies.some((request) => request.url.endsWith('/accounts/acc_123/d1/database'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Provisioned preview registry database'))).toBe(true)
	})

	test('lists tracked preview records for a worker', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.DEVFLARE_CACHE_DIR = createTemporaryCacheDir()
		const recordedSql: string[] = []
		const previewRecord = {
			id: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
			kind: 'preview',
			ver: 1,
			createdAt: '2025-01-01T00:00:00.000Z',
			updatedAt: '2025-01-02T00:00:00.000Z',
			createdBy: 'user_123',
			accountId: 'acc_123',
			workerName: 'demo-worker',
			versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
			previewUrl: 'https://5dba9570-demo-worker.example-subdomain.workers.dev',
			alias: 'feature-branch',
			aliasPreviewUrl: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
			source: 'cli',
			status: 'active'
		}
		const deploymentRecord = {
			id: 'deployment:demo-worker:deploy_123',
			kind: 'deployment',
			ver: 1,
			createdAt: '2025-01-03T04:05:06.000Z',
			updatedAt: '2025-01-03T05:06:07.000Z',
			createdBy: 'user_123',
			accountId: 'acc_123',
			workerName: 'demo-worker',
			deploymentId: 'deploy_123',
			channel: 'preview',
			status: 'active',
			versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
			previewId: previewRecord.id,
			url: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
			source: 'cli'
		}
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 1024
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
				const sql = String(body.sql ?? '')
				recordedSql.push(sql)

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: 1,
								rows_written: 0
							},
							results: [
								{
									payload_json: JSON.stringify(previewRecord)
								}
							]
						}
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: 1,
								rows_written: 0
							},
							results: [
								{
									payload_json: JSON.stringify(deploymentRecord)
								}
							]
						}
					])
				}

				return jsonResponse([
					{
						success: true,
						meta: {
							served_by: 'test',
							duration: 0,
							changes: 0,
							last_row_id: 0,
							changed_db: false,
							size_after: 0,
							rows_read: 0,
							rows_written: 0
						},
						results: []
					}
				])
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

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
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('Preview registry'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('Showing active state only.'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('┌ worker demo-worker'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('│  Previews (1)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('│  Deployments (1)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Alias'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Deployed'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('└  preview'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Aliases ('))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('Total:'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('feature-branch-demo-worker.example-subdomain.workers.dev'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('2025-01-03 04:05:06'))).toBe(true)
		expect(recordedSql.filter((sql) => sql.startsWith('CREATE TABLE'))).toHaveLength(0)
		expect(recordedSql.filter((sql) => sql.startsWith('CREATE INDEX'))).toHaveLength(0)
		expect(recordedSql.filter((sql) => sql.startsWith('SELECT payload_json FROM'))).toHaveLength(3)
	})

	test('groups records by worker when listing the full registry', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.DEVFLARE_CACHE_DIR = createTemporaryCacheDir()
		const previewRecords = [
			{
				id: 'preview:alpha-worker:11111111-1111-4111-8111-111111111111',
				kind: 'preview',
				ver: 1,
				createdAt: '2025-01-03T10:00:00.000Z',
				updatedAt: '2025-01-03T10:30:00.000Z',
				createdBy: 'user_123',
				accountId: 'acc_123',
				workerName: 'alpha-worker',
				versionId: '11111111-1111-4111-8111-111111111111',
				previewUrl: 'https://alpha-main.example.workers.dev',
				alias: 'main',
				aliasPreviewUrl: 'https://main-alpha.example.workers.dev',
				source: 'cli',
				status: 'active'
			},
			{
				id: 'preview:alpha-worker:22222222-2222-4222-8222-222222222222',
				kind: 'preview',
				ver: 1,
				createdAt: '2025-01-03T09:00:00.000Z',
				updatedAt: '2025-01-03T09:30:00.000Z',
				createdBy: 'user_123',
				accountId: 'acc_123',
				workerName: 'alpha-worker',
				versionId: '22222222-2222-4222-8222-222222222222',
				previewUrl: 'https://alpha-feature.example.workers.dev',
				alias: 'feature-a',
				aliasPreviewUrl: 'https://feature-a-alpha.example.workers.dev',
				source: 'cli',
				status: 'active'
			},
			{
				id: 'preview:beta-worker:33333333-3333-4333-8333-333333333333',
				kind: 'preview',
				ver: 1,
				createdAt: '2025-01-02T08:00:00.000Z',
				updatedAt: '2025-01-02T08:30:00.000Z',
				createdBy: 'user_123',
				accountId: 'acc_123',
				workerName: 'beta-worker',
				versionId: '33333333-3333-4333-8333-333333333333',
				previewUrl: 'https://beta-main.example.workers.dev',
				alias: 'main',
				aliasPreviewUrl: 'https://main-beta.example.workers.dev',
				source: 'cli',
				status: 'active'
			}
		]
		const deploymentRecords = [
			{
				id: 'deployment:alpha-worker:deploy_a_preview',
				kind: 'deployment',
				ver: 1,
				createdAt: '2025-01-03T10:31:00.000Z',
				updatedAt: '2025-01-03T10:35:00.000Z',
				createdBy: 'user_123',
				accountId: 'acc_123',
				workerName: 'alpha-worker',
				deploymentId: 'deploy_a_preview',
				channel: 'preview',
				status: 'active',
				versionId: '11111111-1111-4111-8111-111111111111',
				previewId: 'preview:alpha-worker:11111111-1111-4111-8111-111111111111',
				url: 'https://main-alpha.example.workers.dev',
				source: 'cli'
			},
			{
				id: 'deployment:alpha-worker:deploy_a_prod',
				kind: 'deployment',
				ver: 1,
				createdAt: '2025-01-03T10:40:00.000Z',
				updatedAt: '2025-01-03T10:45:00.000Z',
				createdBy: 'user_123',
				accountId: 'acc_123',
				workerName: 'alpha-worker',
				deploymentId: 'deploy_a_prod',
				channel: 'production',
				status: 'active',
				versionId: '44444444-4444-4444-8444-444444444444',
				url: 'https://alpha.example.workers.dev',
				source: 'cli'
			},
			{
				id: 'deployment:beta-worker:deploy_b_preview',
				kind: 'deployment',
				ver: 1,
				createdAt: '2025-01-02T08:31:00.000Z',
				updatedAt: '2025-01-02T08:35:00.000Z',
				createdBy: 'user_123',
				accountId: 'acc_123',
				workerName: 'beta-worker',
				deploymentId: 'deploy_b_preview',
				channel: 'preview',
				status: 'active',
				versionId: '33333333-3333-4333-8333-333333333333',
				previewId: 'preview:beta-worker:33333333-3333-4333-8333-333333333333',
				url: 'https://main-beta.example.workers.dev',
				source: 'cli'
			}
		]

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 1024
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
				const sql = String(body.sql ?? '')

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: previewRecords.length,
								rows_written: 0
							},
							results: previewRecords.map((record) => ({
								payload_json: JSON.stringify(record)
							}))
						}
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: deploymentRecords.length,
								rows_written: 0
							},
							results: deploymentRecords.map((record) => ({
								payload_json: JSON.stringify(record)
							}))
						}
					])
				}

				return jsonResponse([
					{
						success: true,
						meta: {
							served_by: 'test',
							duration: 0,
							changes: 0,
							last_row_id: 0,
							changed_db: false,
							size_after: 0,
							rows_read: 0,
							rows_written: 0
						},
						results: []
					}
				])
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: [],
				options: {
					account: 'acc_123'
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('Preview registry'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('┌ worker alpha-worker'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('┌ worker beta-worker'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('│  Previews (2)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('│  Deployments (2)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('│  Previews (1)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('└  production'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('└  preview'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('2025-01-03 10:31:00'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('2025-01-03 10:40:00'))).toBe(true)
	})

	test('retires tracked preview records for a branch', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.DEVFLARE_CACHE_DIR = createTemporaryCacheDir()
		const recordedStatements: Array<{ sql: string; params: unknown[] }> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 1024
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
				const sql = String(body.sql ?? '')
				recordedStatements.push({
					sql,
					params: Array.isArray(body.params) ? body.params : []
				})

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: 1,
								rows_written: 0
							},
							results: [
								{
									payload_json: JSON.stringify({
										id: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
										kind: 'preview',
										ver: 1,
										createdAt: '2025-01-01T00:00:00.000Z',
										updatedAt: '2025-01-02T00:00:00.000Z',
										createdBy: 'user_123',
										accountId: 'acc_123',
										workerName: 'demo-worker',
										versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
										previewUrl: 'https://5dba9570-demo-worker.example-subdomain.workers.dev',
										alias: 'feature-branch',
										aliasPreviewUrl: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
										branchName: 'feature/branch',
										source: 'cli',
										status: 'active'
									})
								}
							]
						}
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_alias_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: 1,
								rows_written: 0
							},
							results: [
								{
									payload_json: JSON.stringify({
										id: 'previewAlias:demo-worker:feature-branch',
										kind: 'previewAlias',
										ver: 1,
										createdAt: '2025-01-01T00:00:00.000Z',
										updatedAt: '2025-01-02T00:00:00.000Z',
										createdBy: 'user_123',
										accountId: 'acc_123',
										workerName: 'demo-worker',
										alias: 'feature-branch',
										aliasPreviewUrl: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
										versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
										previewId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
										branchName: 'feature/branch',
										source: 'cli',
										status: 'active'
									})
								}
							]
						}
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return jsonResponse([
						{
							success: true,
							meta: {
								served_by: 'test',
								duration: 0,
								changes: 0,
								last_row_id: 0,
								changed_db: false,
								size_after: 0,
								rows_read: 1,
								rows_written: 0
							},
							results: [
								{
									payload_json: JSON.stringify({
										id: 'deployment:demo-worker:preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
										kind: 'deployment',
										ver: 1,
										createdAt: '2025-01-01T00:00:00.000Z',
										updatedAt: '2025-01-02T00:00:00.000Z',
										createdBy: 'user_123',
										accountId: 'acc_123',
										workerName: 'demo-worker',
										deploymentId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
										channel: 'preview',
										status: 'active',
										versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
										previewId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
										url: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
										source: 'cli'
									})
								}
							]
						}
					])
				}

				return jsonResponse([
					{
						success: true,
						meta: {
							served_by: 'test',
							duration: 0,
							changes: 0,
							last_row_id: 0,
							changed_db: false,
							size_after: 0,
							rows_read: 0,
							rows_written: 0
						},
						results: []
					}
				])
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['retire'],
				options: {
					account: 'acc_123',
					worker: 'demo-worker',
					branch: 'feature/branch',
					apply: true
				}
			},
			logger as any,
			{}
		)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Retired preview registry records for demo-worker'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Candidates: 1 preview(s) · 1 alias record(s) · 1 deployment record(s)'))).toBe(true)
		expect(recordedStatements.some((statement) => statement.sql.startsWith('INSERT INTO devflare_preview_records'))).toBe(true)
		expect(recordedStatements.some((statement) => statement.sql.startsWith('INSERT INTO devflare_preview_alias_records'))).toBe(true)
		expect(recordedStatements.some((statement) => statement.sql.startsWith('INSERT INTO devflare_deployment_records'))).toBe(true)
	})
})
