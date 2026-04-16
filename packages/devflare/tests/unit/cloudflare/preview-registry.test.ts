import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
	getPreviewRegistryContext,
	reconcilePreviewRegistry,
	retirePreviewRegistry
} from '../../../src/cloudflare/preview-registry'
import { clearPreviewRegistrySchemaCache } from '../../../src/cloudflare/preview-registry-store'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'
import {
	capturePreviewTestEnvironmentSnapshot,
	createD1ResultsResponse,
	createDeploymentRecordFixture,
	createPreviewScopeRecordFixture,
	createPreviewRecordFixture,
	createRegistryDatabaseListResponse,
	createRegistryDatabaseRecord,
	createSerializedRegistryRecord,
	jsonResponse,
	restorePreviewTestEnvironmentSnapshot
} from '../cli/previews.test-utils'

const originalEnvironment = capturePreviewTestEnvironmentSnapshot()
const temporaryCacheDirectories = createTrackedTempDirectories()
const defaultReconcileRequest = {
	accountId: 'acc_123',
	workerName: 'demo-worker',
	versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
	previewScope: 'feature-branch',
	previewUrl: 'https://5dba9570-demo-worker.example-subdomain.workers.dev',
	previewScopeUrl: 'https://feature-branch-demo-worker.example-subdomain.workers.dev',
	branchName: 'feature/branch',
	commitSha: 'abcdef1234567',
	source: 'cli' as const
}

function createPreviewRegistryFetch(options: {
	recordedSql?: string[]
	versionsItems?: Array<Record<string, unknown>>
	versionDetail?: Record<string, unknown>
	deployments?: Array<Record<string, unknown>>
	previewRecords?: Array<Record<string, unknown>>
	previewScopeRecords?: Array<Record<string, unknown>>
	deploymentRecords?: Array<Record<string, unknown>>
	recordedStatements?: Array<{ sql: string; params: unknown[] }>
	tableColumnsByTable?: Record<string, string[]>
} = {}): typeof fetch {
	return mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)

		if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
			return createRegistryDatabaseListResponse([
				createRegistryDatabaseRecord({ fileSize: 4096 })
			])
		}

		if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
			return jsonResponse({
				subdomain: 'example-subdomain'
			})
		}

		if (url.includes('/accounts/acc_123/workers/scripts/demo-worker/versions?page=1&per_page=100')) {
			return jsonResponse({
				items: options.versionsItems ?? []
			})
		}

		if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/versions/5dba9570-33c4-4375-b784-e1b34ad01569')) {
			if (options.versionDetail) {
				return jsonResponse(options.versionDetail)
			}
		}

		if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
			return jsonResponse({
				deployments: options.deployments ?? []
			})
		}

		if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
			const sql = String(body.sql ?? '')
			options.recordedSql?.push(sql)
			if (options.recordedStatements) {
				options.recordedStatements.push({
					sql,
					params: Array.isArray(body.params) ? body.params : []
				})
			}

			const pragmaMatch = sql.match(/^PRAGMA table_info\("([^"]+)"\)$/)
			if (pragmaMatch) {
				const tableName = pragmaMatch[1]
				const columns = options.tableColumnsByTable?.[tableName]
				if (columns) {
					return createD1ResultsResponse(columns.map((name) => ({ name })))
				}
			}

			if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
				return createD1ResultsResponse((options.previewRecords ?? []).map(createSerializedRegistryRecord))
			}

			if (sql.startsWith('SELECT payload_json FROM devflare_preview_scope_records')) {
				return createD1ResultsResponse((options.previewScopeRecords ?? []).map(createSerializedRegistryRecord))
			}

			if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
				return createD1ResultsResponse((options.deploymentRecords ?? []).map(createSerializedRegistryRecord))
			}

			return createD1ResultsResponse()
		}

		throw new Error(`Unexpected fetch URL: ${url}`)
	}) as unknown as typeof fetch
}

function expectRegistryInsertStatements(recordedSql: string[]): void {
	expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_records'))).toBe(true)
	expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_scope_records'))).toBe(true)
	expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_deployment_records'))).toBe(true)
}

afterEach(() => {
	clearPreviewRegistrySchemaCache('db_123')
	restorePreviewTestEnvironmentSnapshot(originalEnvironment)
	temporaryCacheDirectories.cleanup()
})

describe('preview registry', () => {
	test('caches registry discovery locally to avoid repeated D1 listing', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.DEVFLARE_CACHE_DIR = temporaryCacheDirectories.create('devflare-preview-registry-')
		let databaseListRequests = 0
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				databaseListRequests += 1
				return createRegistryDatabaseListResponse([
					createRegistryDatabaseRecord({ fileSize: 4096 })
				])
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
		globalThis.fetch = createPreviewRegistryFetch({
			recordedSql,
			versionsItems: [
				{
					id: defaultReconcileRequest.versionId,
					number: 7,
					metadata: {
						author_id: 'user_123',
						created_on: '2025-01-01T00:00:00.000Z',
						modified_on: '2025-01-01T00:00:00.000Z',
						hasPreview: true,
						source: 'wrangler'
					}
				}
			],
			deployments: [
				{
					id: 'deployment_123',
					created_on: '2025-01-02T00:00:00.000Z',
					source: 'wrangler',
					strategy: 'percentage',
					versions: [
						{
							percentage: 100,
							version_id: defaultReconcileRequest.versionId
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

		const result = await reconcilePreviewRegistry(defaultReconcileRequest)

		expect(result.registry.databaseName).toBe('devflare-registry')
		expect(result.previews).toHaveLength(1)
		expect(result.previewScopes).toHaveLength(1)
		expect(result.deployments).toHaveLength(2)
		expect(result.previews[0].scope).toBe('feature-branch')
		expect(result.previewScopes[0].scopeUrl).toBe('https://feature-branch-demo-worker.example-subdomain.workers.dev')
		expect(result.deployments.some((record) => record.channel === 'preview')).toBe(true)
		expect(result.deployments.some((record) => record.channel === 'production')).toBe(true)
		expectRegistryInsertStatements(recordedSql)
	})

	test('records the freshly uploaded preview even when listWorkerVersions does not surface it yet', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedSql: string[] = []
		globalThis.fetch = createPreviewRegistryFetch({
			recordedSql,
			versionsItems: [],
			versionDetail: {
				id: defaultReconcileRequest.versionId,
				number: 7,
				metadata: {
					author_id: 'user_123',
					created_on: '2025-01-01T00:00:00.000Z',
					modified_on: '2025-01-01T00:00:00.000Z',
					hasPreview: false,
					source: 'wrangler'
				}
			},
			deployments: []
		})

		const result = await reconcilePreviewRegistry(defaultReconcileRequest)

		expect(result.previews).toHaveLength(1)
		expect(result.previewScopes).toHaveLength(1)
		expect(result.deployments).toHaveLength(1)
		expect(result.previews[0].versionId).toBe('5dba9570-33c4-4375-b784-e1b34ad01569')
		expect(result.previews[0].previewUrl).toBe('https://5dba9570-demo-worker.example-subdomain.workers.dev')
		expectRegistryInsertStatements(recordedSql)
	})

	test('preserves locally tracked previews when Cloudflare cannot enumerate them during reconcile', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedSql: string[] = []
		globalThis.fetch = createPreviewRegistryFetch({
			recordedSql,
			versionsItems: [],
			deployments: [],
			previewRecords: [
				createPreviewRecordFixture({
					workerName: 'demo-worker',
					versionId: defaultReconcileRequest.versionId,
					previewUrl: defaultReconcileRequest.previewUrl,
					scope: defaultReconcileRequest.previewScope,
					scopeUrl: defaultReconcileRequest.previewScopeUrl
				})
			],
			previewScopeRecords: [
				createPreviewScopeRecordFixture({
					workerName: 'demo-worker',
					scope: defaultReconcileRequest.previewScope,
					scopeUrl: defaultReconcileRequest.previewScopeUrl,
					versionId: defaultReconcileRequest.versionId
				})
			],
			deploymentRecords: [
				createDeploymentRecordFixture({
					id: 'deployment:demo-worker:preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
					workerName: 'demo-worker',
					deploymentId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
					channel: 'preview',
					versionId: defaultReconcileRequest.versionId,
					previewId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
					environment: 'preview',
					url: defaultReconcileRequest.previewScopeUrl
				})
			]
		})

		const result = await reconcilePreviewRegistry({
			accountId: 'acc_123',
			workerName: 'demo-worker'
		})

		expect(result.previews).toHaveLength(0)
		expect(result.previewScopes).toHaveLength(0)
		expect(result.deployments).toHaveLength(0)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_records'))).toBe(false)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_preview_scope_records'))).toBe(false)
		expect(recordedSql.some((sql) => sql.startsWith('INSERT INTO devflare_deployment_records'))).toBe(false)
	})

	test('migrates missing preview registry columns before writing new records', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedSql: string[] = []
		globalThis.fetch = createPreviewRegistryFetch({
			recordedSql,
			tableColumnsByTable: {
				devflare_preview_records: [
					'id',
					'ver',
					'account_id',
					'worker_name',
					'version_id',
					'preview_url',
					'scope',
					'branch_name',
					'commit_sha',
					'source',
					'status',
					'created_by',
					'created_at',
					'updated_at',
					'deleted_at',
					'payload_json'
				],
				devflare_preview_scope_records: [
					'id',
					'ver',
					'account_id',
					'worker_name',
					'scope',
					'scope_url',
					'version_id',
					'branch_name',
					'commit_sha',
					'source',
					'status',
					'created_by',
					'created_at',
					'updated_at',
					'deleted_at',
					'payload_json'
				],
				devflare_deployment_records: [
					'id',
					'ver',
					'account_id',
					'worker_name',
					'deployment_id',
					'channel',
					'status',
					'version_id',
					'environment',
					'url',
					'commit_sha',
					'source',
					'created_by',
					'created_at',
					'updated_at',
					'deleted_at',
					'payload_json'
				]
			},
			versionsItems: [
				{
					id: defaultReconcileRequest.versionId,
					number: 7,
					metadata: {
						author_id: 'user_123',
						created_on: '2025-01-01T00:00:00.000Z',
						modified_on: '2025-01-01T00:00:00.000Z',
						hasPreview: true,
						source: 'wrangler'
					}
				}
			],
			deployments: [
				{
					id: 'deployment_123',
					created_on: '2025-01-02T00:00:00.000Z',
					source: 'wrangler',
					strategy: 'percentage',
					versions: [
						{
							percentage: 100,
							version_id: defaultReconcileRequest.versionId
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

		const result = await reconcilePreviewRegistry(defaultReconcileRequest)

		expect(result.previews).toHaveLength(1)
		expect(recordedSql).toContain('ALTER TABLE "devflare_preview_records" ADD COLUMN scope_url TEXT')
		expect(recordedSql).toContain('ALTER TABLE "devflare_preview_records" ADD COLUMN deployment_id TEXT')
		expect(recordedSql).toContain('ALTER TABLE "devflare_preview_scope_records" ADD COLUMN preview_id TEXT')
		expect(recordedSql).toContain('ALTER TABLE "devflare_deployment_records" ADD COLUMN preview_id TEXT')
		expect(recordedSql).toContain('ALTER TABLE "devflare_deployment_records" ADD COLUMN message TEXT')
	})

	test('retires a targeted preview, scope, and preview deployment without touching production records', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const recordedStatements: Array<{ sql: string; params: unknown[] }> = []
		globalThis.fetch = createPreviewRegistryFetch({
			recordedStatements,
			previewRecords: [
				createPreviewRecordFixture({
					workerName: 'demo-worker',
					versionId: defaultReconcileRequest.versionId,
					previewUrl: defaultReconcileRequest.previewUrl,
					scope: defaultReconcileRequest.previewScope,
					scopeUrl: defaultReconcileRequest.previewScopeUrl,
					branchName: defaultReconcileRequest.branchName
				})
			],
			previewScopeRecords: [
				createPreviewScopeRecordFixture({
					workerName: 'demo-worker',
					scope: defaultReconcileRequest.previewScope,
					scopeUrl: defaultReconcileRequest.previewScopeUrl,
					versionId: defaultReconcileRequest.versionId,
					branchName: defaultReconcileRequest.branchName
				})
			],
			deploymentRecords: [
				createDeploymentRecordFixture({
					id: 'deployment:demo-worker:preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
					workerName: 'demo-worker',
					deploymentId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
					channel: 'preview',
					versionId: defaultReconcileRequest.versionId,
					previewId: 'preview:demo-worker:5dba9570-33c4-4375-b784-e1b34ad01569',
					environment: 'preview',
					url: defaultReconcileRequest.previewScopeUrl
				}),
				createDeploymentRecordFixture({
					id: 'deployment:demo-worker:deployment_123',
					workerName: 'demo-worker',
					deploymentId: 'deployment_123',
					channel: 'production',
					versionId: '7dba9570-33c4-4375-b784-e1b34ad01569',
					environment: 'production',
					url: 'https://demo-worker.example-subdomain.workers.dev',
					createdAt: '2025-01-03T00:00:00.000Z',
					updatedAt: '2025-01-03T00:00:00.000Z'
				})
			]
		})

		const result = await retirePreviewRegistry({
			accountId: 'acc_123',
			workerName: 'demo-worker',
			previewScope: 'feature-branch',
			apply: true
		})

		expect(result.candidates.previews).toHaveLength(1)
		expect(result.candidates.scopes).toHaveLength(1)
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
