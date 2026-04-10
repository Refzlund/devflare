import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	getPreviewRegistryContext,
	reconcilePreviewRegistry,
	retirePreviewRegistry
} from '../../../src/cloudflare/preview-registry'

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

function createD1Result(results: unknown[] = []): Response {
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
				rows_read: results.length,
				rows_written: 0
			},
			results
		}
	])
}

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const originalCacheDir = process.env.DEVFLARE_CACHE_DIR
const temporaryCacheDirectories = new Set<string>()

function createTemporaryCacheDir(): string {
	const directory = mkdtempSync(join(tmpdir(), 'devflare-preview-registry-'))
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

describe('preview registry', () => {
	test('caches registry discovery locally to avoid repeated D1 listing', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.DEVFLARE_CACHE_DIR = createTemporaryCacheDir()
		let databaseListRequests = 0
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				databaseListRequests += 1
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 4096
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const first = await getPreviewRegistryContext({
			accountId: 'acc_123'
		})
		const second = await getPreviewRegistryContext({
			accountId: 'acc_123'
		})

		expect(first?.databaseId).toBe('db_123')
		expect(second?.databaseId).toBe('db_123')
		expect(databaseListRequests).toBe(1)
	})

	test('reconciles live preview and deployment records into the registry', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedSql: string[] = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 4096
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({
					subdomain: 'example-subdomain'
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts/demo-worker/versions?page=1&per_page=100')) {
				return jsonResponse({
					items: [
						{
							id: '5dba9570-33c4-4375-b784-e1b34ad01569',
							number: 7,
							metadata: {
								author_id: 'user_123',
								created_on: '2025-01-01T00:00:00.000Z',
								modified_on: '2025-01-01T00:00:00.000Z',
								hasPreview: true,
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
							id: 'deployment_123',
							created_on: '2025-01-02T00:00:00.000Z',
							source: 'wrangler',
							strategy: 'percentage',
							versions: [
								{
									percentage: 100,
									version_id: '5dba9570-33c4-4375-b784-e1b34ad01569'
								}
							],
							annotations: {
								'workers/message': 'Deploy preview branch',
								'workers/triggered_by': 'upload'
							},
							author_email: 'dev@example.com'
						}
					]
				})
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
				const sql = String(body.sql ?? '')
				recordedSql.push(sql)

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
					return createD1Result()
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_alias_records')) {
					return createD1Result()
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return createD1Result()
				}

				return createD1Result()
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await reconcilePreviewRegistry({
			accountId: 'acc_123',
			workerName: 'demo-worker',
			versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
			previewAlias: 'feature-branch',
			previewUrl: 'https://5dba9570-demo-worker.example-subdomain.workers.dev',
			previewAliasUrl: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
			branchName: 'feature/branch',
			commitSha: 'abcdef1234567',
			source: 'cli'
		})

		expect(result.registry.databaseName).toBe('devflare-registry')
		expect(result.previews).toHaveLength(1)
		expect(result.previewAliases).toHaveLength(1)
		expect(result.deployments).toHaveLength(2)
		expect(result.previews[0].alias).toBe('feature-branch')
		expect(result.previewAliases[0].aliasPreviewUrl).toBe('https://feature-branch-demo-worker.example-subdomain.workers.dev')
		expect(result.deployments.some((record) => record.channel === 'preview')).toBe(true)
		expect(result.deployments.some((record) => record.channel === 'production')).toBe(true)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_records'))).toBe(true)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_alias_records'))).toBe(true)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_deployment_records'))).toBe(true)
	})

	test('records the freshly uploaded preview even when listWorkerVersions does not surface it yet', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedSql: string[] = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 4096
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({
					subdomain: 'example-subdomain'
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts/demo-worker/versions?page=1&per_page=100')) {
				return jsonResponse({ items: [] })
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/versions/5dba9570-33c4-4375-b784-e1b34ad01569')) {
				return jsonResponse({
					id: '5dba9570-33c4-4375-b784-e1b34ad01569',
					number: 7,
					metadata: {
						author_id: 'user_123',
						created_on: '2025-01-01T00:00:00.000Z',
						modified_on: '2025-01-01T00:00:00.000Z',
						hasPreview: false,
						source: 'wrangler'
					}
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({ deployments: [] })
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
				const sql = String(body.sql ?? '')
				recordedSql.push(sql)

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
					return createD1Result()
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_alias_records')) {
					return createD1Result()
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return createD1Result()
				}

				return createD1Result()
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await reconcilePreviewRegistry({
			accountId: 'acc_123',
			workerName: 'demo-worker',
			versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
			previewAlias: 'feature-branch',
			previewUrl: 'https://5dba9570-demo-worker.example-subdomain.workers.dev',
			previewAliasUrl: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
			branchName: 'feature/branch',
			commitSha: 'abcdef1234567',
			source: 'cli'
		})

		expect(result.previews).toHaveLength(1)
		expect(result.previewAliases).toHaveLength(1)
		expect(result.deployments).toHaveLength(1)
		expect(result.previews[0].versionId).toBe('5dba9570-33c4-4375-b784-e1b34ad01569')
		expect(result.previews[0].previewUrl).toBe('https://5dba9570-demo-worker.example-subdomain.workers.dev')
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_records'))).toBe(true)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_alias_records'))).toBe(true)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_deployment_records'))).toBe(true)
	})

	test('preserves locally tracked previews when Cloudflare cannot enumerate them during reconcile', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedSql: string[] = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([
					{
						uuid: 'db_123',
						name: 'devflare-registry',
						version: 'alpha',
						num_tables: 3,
						file_size: 4096
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({
					subdomain: 'example-subdomain'
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts/demo-worker/versions?page=1&per_page=100')) {
				return jsonResponse({ items: [] })
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({ deployments: [] })
			}

			if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
				const sql = String(body.sql ?? '')
				recordedSql.push(sql)

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
					return createD1Result([
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
								source: 'cli',
								status: 'active'
							})
						}
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_alias_records')) {
					return createD1Result([
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
								source: 'cli',
								status: 'active'
							})
						}
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return createD1Result([
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
								environment: 'preview',
								url: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
								source: 'cli'
							})
						}
					])
				}

				return createD1Result()
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await reconcilePreviewRegistry({
			accountId: 'acc_123',
			workerName: 'demo-worker'
		})

		expect(result.previews).toHaveLength(0)
		expect(result.previewAliases).toHaveLength(0)
		expect(result.deployments).toHaveLength(0)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_records'))).toBe(false)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_alias_records'))).toBe(false)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_deployment_records'))).toBe(false)
	})

	test('retires a targeted preview, alias, and preview deployment without touching production records', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
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
						file_size: 4096
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
					return createD1Result([
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
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_preview_alias_records')) {
					return createD1Result([
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
					])
				}

				if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
					return createD1Result([
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
								environment: 'preview',
								url: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
								source: 'cli'
							})
						},
						{
							payload_json: JSON.stringify({
								id: 'deployment:demo-worker:deployment_123',
								kind: 'deployment',
								ver: 1,
								createdAt: '2025-01-03T00:00:00.000Z',
								updatedAt: '2025-01-03T00:00:00.000Z',
								createdBy: 'user_123',
								accountId: 'acc_123',
								workerName: 'demo-worker',
								deploymentId: 'deployment_123',
								channel: 'production',
								status: 'active',
								versionId: '7dba9570-33c4-4375-b784-e1b34ad01569',
								environment: 'production',
								url: 'https://demo-worker.example-subdomain.workers.dev',
								source: 'cli'
							})
						}
					])
				}

				return createD1Result()
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await retirePreviewRegistry({
			accountId: 'acc_123',
			workerName: 'demo-worker',
			branchName: 'feature/branch',
			apply: true
		})

		expect(result.candidates.previews).toHaveLength(1)
		expect(result.candidates.aliases).toHaveLength(1)
		expect(result.candidates.deployments).toHaveLength(1)
		expect(result.candidates.deployments[0].channel).toBe('preview')
		expect(
			recordedStatements.some((statement) => {
				return statement.sql.startsWith('INSERT INTO devflare_deployment_records')
					&& statement.params.includes('preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569')
			})
		).toBe(true)
		expect(
			recordedStatements.some((statement) => {
				return statement.sql.startsWith('INSERT INTO devflare_deployment_records')
					&& statement.params.includes('deployment_123')
			})
		).toBe(false)
	})
})
