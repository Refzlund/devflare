import { describe, expect, test } from 'bun:test'
import { preview, type DevflareConfig } from '../../../src/config'
import {
	cleanupPreviewScopedResources,
	collectPreviewScopedResourcePlan,
	preparePreviewScopedResourcesForDeploy
} from '../../../src/config/preview-resources'

const pv = preview.scope()

function createPreviewScopedResourceConfig(): DevflareConfig {
	return {
		name: 'preview-resource-worker',
		compatibilityDate: '2026-04-08',
		compatibilityFlags: [],
		bindings: {
			kv: {
				CACHE: pv('cache-kv'),
				SESSIONS: pv('sessions-kv')
			},
			d1: {
				PRIMARY_DB: pv('primary-db')
			},
			r2: {
				ASSETS: pv('assets-bucket')
			},
			queues: {
				producers: {
					JOBS: pv('jobs-queue')
				},
				consumers: [
					{
						queue: pv('jobs-queue'),
						deadLetterQueue: pv('jobs-dlq')
					}
				]
			},
			vectorize: {
				DOCUMENT_INDEX: {
					indexName: pv('document-index')
				},
				SEARCH_INDEX: {
					indexName: pv('search-index')
				}
			},
			hyperdrive: {
				POSTGRES: { name: pv('testing-hyperdrive'), previewFallback: 'base' }
			},
			browser: {
				BROWSER: pv('browser-renderer')
			},
			analyticsEngine: {
				APP_ANALYTICS: {
					dataset: pv('analytics-dataset')
				}
			}
		}
	}
}

describe('preview-scoped resource lifecycle', () => {
	test('collects preview-scoped resource names for a resolved preview identifier', () => {
		const plan = collectPreviewScopedResourcePlan(createPreviewScopedResourceConfig(), {
			environment: 'preview',
			identifier: 'Feature/Search'
		})

		expect(plan.kv.map((ref) => ref.previewName)).toEqual([
			'cache-kv-feature-search',
			'sessions-kv-feature-search'
		])
		expect(plan.d1.map((ref) => ref.previewName)).toEqual([
			'primary-db-feature-search'
		])
		expect(plan.r2.map((ref) => ref.previewName)).toEqual([
			'assets-bucket-feature-search'
		])
		expect(plan.queues.map((ref) => ref.previewName).sort()).toEqual([
			'jobs-dlq-feature-search',
			'jobs-queue-feature-search'
		])
		expect(plan.vectorize.map((ref) => ref.previewName)).toEqual([
			'document-index-feature-search',
			'search-index-feature-search'
		])
		expect(plan.hyperdrive.map((ref) => ref.previewName)).toEqual([
			'testing-hyperdrive-feature-search'
		])
		expect(plan.browser.map((ref) => ref.previewName)).toEqual([
			'browser-renderer-feature-search'
		])
		expect(plan.analyticsEngine.map((ref) => ref.previewName)).toEqual([
			'analytics-dataset-feature-search'
		])
	})

	test('keeps base preview resource names stable when preview env vars are already set', () => {
		const originalPreviewBranch = process.env.DEVFLARE_PREVIEW_BRANCH
		const originalPreviewIdentifier = process.env.DEVFLARE_PREVIEW_IDENTIFIER

		try {
			process.env.DEVFLARE_PREVIEW_BRANCH = 'next'
			process.env.DEVFLARE_PREVIEW_IDENTIFIER = 'next'

			const plan = collectPreviewScopedResourcePlan(createPreviewScopedResourceConfig(), {
				environment: 'preview'
			})

			expect(plan.kv.map((ref) => ({
				baseName: ref.baseName,
				previewName: ref.previewName
			}))).toEqual([
				{
					baseName: 'cache-kv',
					previewName: 'cache-kv-next'
				},
				{
					baseName: 'sessions-kv',
					previewName: 'sessions-kv-next'
				}
			])
			expect(plan.queues.map((ref) => ref.previewName).sort()).toEqual([
				'jobs-dlq-next',
				'jobs-queue-next'
			])
			expect(plan.hyperdrive.map((ref) => ({
				baseName: ref.baseName,
				previewName: ref.previewName
			}))).toEqual([
				{
					baseName: 'testing-hyperdrive',
					previewName: 'testing-hyperdrive-next'
				}
			])
		} finally {
			if (originalPreviewBranch === undefined) {
				delete process.env.DEVFLARE_PREVIEW_BRANCH
			} else {
				process.env.DEVFLARE_PREVIEW_BRANCH = originalPreviewBranch
			}

			if (originalPreviewIdentifier === undefined) {
				delete process.env.DEVFLARE_PREVIEW_IDENTIFIER
			} else {
				process.env.DEVFLARE_PREVIEW_IDENTIFIER = originalPreviewIdentifier
			}
		}
	})

	test('provisions supported preview resources and falls back to the base Hyperdrive config', async () => {
		const result = await preparePreviewScopedResourcesForDeploy(createPreviewScopedResourceConfig(), {
			environment: 'preview',
			identifier: 'pr-42',
			accountId: 'account-123',
			cloudflare: {
				listKVNamespaces: async () => [],
				createKVNamespace: async (_accountId, name) => ({ id: `kv-${name}`, name }),
				listD1Databases: async () => [],
				createD1Database: async (_accountId, name) => ({ id: `d1-${name}`, name, version: 'alpha' }),
				listR2Buckets: async () => [],
				createR2Bucket: async (_accountId, name) => ({ name, createdOn: new Date('2026-01-01T00:00:00Z') }),
				listQueues: async () => [],
				createQueue: async (_accountId, name) => ({ id: `queue-${name}`, name }),
				listVectorizeIndexes: async () => ([
					{ name: 'document-index', dimensions: 32, metric: 'cosine', description: 'documents' },
					{ name: 'search-index', dimensions: 16, metric: 'euclidean', description: 'search' }
				]),
				createVectorizeIndex: async (_accountId, index) => ({
					name: index.name,
					dimensions: index.dimensions,
					metric: index.metric,
					description: index.description
				}),
				listHyperdrives: async () => ([
					{ id: 'hyperdrive-base', name: 'testing-hyperdrive' }
				])
			}
		})

		expect(result.accountId).toBe('account-123')
		expect(result.created.kv).toEqual(['cache-kv-pr-42', 'sessions-kv-pr-42'])
		expect(result.created.d1).toEqual(['primary-db-pr-42'])
		expect(result.created.r2).toEqual(['assets-bucket-pr-42'])
		expect(result.created.queues.sort()).toEqual(['jobs-dlq-pr-42', 'jobs-queue-pr-42'])
		expect(result.created.vectorize).toEqual(['document-index-pr-42', 'search-index-pr-42'])
		expect(result.config.bindings?.kv?.CACHE).toBe('cache-kv-pr-42')
		expect(result.config.bindings?.d1?.PRIMARY_DB).toBe('primary-db-pr-42')
		expect(result.config.bindings?.r2?.ASSETS).toBe('assets-bucket-pr-42')
		expect(result.config.bindings?.queues?.producers?.JOBS).toBe('jobs-queue-pr-42')
		expect(result.config.bindings?.vectorize?.DOCUMENT_INDEX.indexName).toBe('document-index-pr-42')
		expect(result.config.bindings?.hyperdrive?.POSTGRES).toBe('testing-hyperdrive')
		expect(result.config.bindings?.analyticsEngine?.APP_ANALYTICS.dataset).toBe('analytics-dataset-pr-42')
		expect(result.warnings.some((warning) => warning.includes('base Hyperdrive'))).toBe(true)
		expect(result.warnings.some((warning) => warning.includes('Analytics Engine'))).toBe(true)
		expect(result.warnings.some((warning) => warning.includes('Browser Rendering'))).toBe(true)
	})

	test('uses explicit previewId Hyperdrive bindings without lifecycle lookup', async () => {
		const config: DevflareConfig = {
			name: 'preview-hyperdrive-worker',
			compatibilityDate: '2026-04-08',
			compatibilityFlags: [],
			bindings: {
				hyperdrive: {
					POSTGRES: {
						name: pv('testing-hyperdrive'),
						previewId: 'preview-hyperdrive-id'
					}
				}
			}
		}

		const plan = collectPreviewScopedResourcePlan(config, {
			environment: 'preview',
			identifier: 'pr-7'
		})
		expect(plan.hyperdrive).toEqual([])

		const result = await preparePreviewScopedResourcesForDeploy(config, {
			environment: 'preview',
			identifier: 'pr-7',
			cloudflare: {
				listHyperdrives: async () => {
					throw new Error('should not list Hyperdrive configs')
				}
			}
		})

		expect(result.config.bindings?.hyperdrive?.POSTGRES).toEqual({
			id: 'preview-hyperdrive-id'
		})
		expect(result.accountId).toBeUndefined()
	})

	test('cleans up existing preview-scoped resources for the active preview identifier', async () => {
		const deleted: string[] = []
		const result = await cleanupPreviewScopedResources(createPreviewScopedResourceConfig(), {
			environment: 'preview',
			identifier: 'pr-42',
			accountId: 'account-123',
			apply: true,
			cloudflare: {
				listKVNamespaces: async () => ([
					{ id: 'kv-cache', name: 'cache-kv-pr-42' },
					{ id: 'kv-sessions', name: 'sessions-kv-pr-42' }
				]),
				deleteKVNamespace: async (_accountId, namespaceId) => {
					deleted.push(`kv:${namespaceId}`)
				},
				listD1Databases: async () => ([
					{ id: 'd1-primary', name: 'primary-db-pr-42', version: 'alpha' }
				]),
				deleteD1Database: async (_accountId, databaseId) => {
					deleted.push(`d1:${databaseId}`)
				},
				listR2Buckets: async () => ([
					{ name: 'assets-bucket-pr-42', createdOn: new Date('2026-01-01T00:00:00Z') }
				]),
				deleteR2Bucket: async (_accountId, bucketName) => {
					deleted.push(`r2:${bucketName}`)
				},
				listQueues: async () => ([
					{ id: 'queue-jobs', name: 'jobs-queue-pr-42' },
					{ id: 'queue-dlq', name: 'jobs-dlq-pr-42' }
				]),
				deleteQueue: async (_accountId, queueId) => {
					deleted.push(`queue:${queueId}`)
				},
				listVectorizeIndexes: async () => ([
					{ name: 'document-index-pr-42', dimensions: 32, metric: 'cosine' },
					{ name: 'search-index-pr-42', dimensions: 16, metric: 'euclidean' }
				]),
				deleteVectorizeIndex: async (_accountId, indexName) => {
					deleted.push(`vectorize:${indexName}`)
				},
				listHyperdrives: async () => ([
					{ id: 'hyperdrive-preview', name: 'testing-hyperdrive-pr-42' }
				]),
				deleteHyperdrive: async (_accountId, hyperdriveId) => {
					deleted.push(`hyperdrive:${hyperdriveId}`)
				}
			}
		})

		expect(result.candidates.kv).toEqual(['cache-kv-pr-42', 'sessions-kv-pr-42'])
		expect(result.candidates.d1).toEqual(['primary-db-pr-42'])
		expect(result.candidates.r2).toEqual(['assets-bucket-pr-42'])
		expect(result.candidates.queues.sort()).toEqual(['jobs-dlq-pr-42', 'jobs-queue-pr-42'])
		expect(result.candidates.vectorize).toEqual(['document-index-pr-42', 'search-index-pr-42'])
		expect(result.candidates.hyperdrive).toEqual(['testing-hyperdrive-pr-42'])
		expect(result.deleted.hyperdrive).toEqual(['testing-hyperdrive-pr-42'])
		expect(deleted.sort()).toEqual([
			'd1:d1-primary',
			'hyperdrive:hyperdrive-preview',
			'kv:kv-cache',
			'kv:kv-sessions',
			'queue:queue-dlq',
			'queue:queue-jobs',
			'r2:assets-bucket-pr-42',
			'"vectorize:document-index-pr-42"',
			'"vectorize:search-index-pr-42"'
		].map((entry) => entry.replaceAll('"', '')))
		expect(result.warnings.some((warning) => warning.includes('Analytics Engine'))).toBe(true)
		expect(result.warnings.some((warning) => warning.includes('Browser Rendering'))).toBe(true)
	})

	test('throws when a preview Hyperdrive binding has no dedicated preview and no previewFallback opt-in', async () => {
		const config: DevflareConfig = {
			name: 'preview-hyperdrive-worker',
			compatibilityDate: '2026-04-08',
			compatibilityFlags: [],
			bindings: {
				hyperdrive: {
					POSTGRES: pv('testing-hyperdrive')
				}
			}
		}

		await expect(
			preparePreviewScopedResourcesForDeploy(config, {
				environment: 'preview',
				identifier: 'pr-7',
				accountId: 'account-123',
				cloudflare: {
					listHyperdrives: async () => ([
						{ id: 'hyperdrive-base', name: 'testing-hyperdrive' }
					])
				}
			})
		).rejects.toThrow(/previewFallback: 'base'/)
	})
})
