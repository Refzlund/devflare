import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Pipeline } from 'cloudflare:pipelines'
import { writeLocalSecret } from '../../../src/secrets/local-secrets'
import {
	createOfflineBindings,
	createOfflineEnv,
	describeOfflineSupport,
	getOfflineSupportMatrix
} from '../../../src/test'

const tempDirs: string[] = []

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-offline-secrets-'))
	tempDirs.push(dir)
	return dir
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop()
		if (dir) {
			rmSync(dir, { recursive: true, force: true })
		}
	}
})

describe('offline support matrix', () => {
	test('classifies services by honest offline support tier', () => {
		const matrix = getOfflineSupportMatrix()

		expect(matrix.durableObjects.tier).toBe('offline-native')
		expect(matrix.services.tier).toBe('offline-native')
		expect(matrix.containers.tier).toBe('offline-native')
		expect(matrix.hyperdrive.tier).toBe('offline-native')
		expect(matrix.workerLoaders.tier).toBe('offline-native')
		expect(matrix.workflows.tier).toBe('offline-native')
		expect(matrix.aiSearch.tier).toBe('offline-fixture')
		expect(matrix.media.tier).toBe('offline-native')
		expect(matrix.stream.tier).toBe('offline-native')
		expect(matrix.flagship.tier).toBe('offline-native')
		expect(matrix.mtlsCertificates.tier).toBe('offline-fixture')
		expect(matrix.ai.tier).toBe('remote-boundary')
		expect(matrix.vectorize.tier).toBe('offline-fixture')
		expect(matrix.analyticsEngine.tier).toBe('offline-fixture')
		expect(matrix.vpcServices.tier).toBe('remote-boundary')
		expect(matrix.vpcNetworks.tier).toBe('remote-boundary')
		expect(matrix.builds.tier).toBe('remote-boundary')
	})

	test('classifies Durable Objects and Services as offline-native via createTestContext()', () => {
		for (const service of ['durableObjects', 'services'] as const) {
			const support = describeOfflineSupport(service)

			expect(support.tier).toBe('offline-native')
			expect(support.tier).not.toBe('remote-boundary')
			expect(support.reason).not.toContain('No offline support classification')
			expect(support.reason).toContain('Miniflare')
			expect(support.recommendation).toContain('createTestContext()')
		}
	})

	test('describes unknown services as remote-boundary instead of guessing', () => {
		const support = describeOfflineSupport('future-cloudflare-product')

		expect(support.tier).toBe('remote-boundary')
		expect(support.reason).toContain('No offline support classification')
		expect(support.recommendation).toContain('remote')
	})

	test('exports skip getters for documented remote-boundary integration tests', async () => {
		const testApi = await import('../../../src/test')

		expect('aiSearch' in testApi.shouldSkip).toBe(true)
		expect('aiGateway' in testApi.shouldSkip).toBe(true)
		expect('media' in testApi.shouldSkip).toBe(true)
		expect('mtlsCertificates' in testApi.shouldSkip).toBe(true)
		expect('artifacts' in testApi.shouldSkip).toBe(true)
		expect('builds' in testApi.shouldSkip).toBe(true)
	})
})

describe('createOfflineBindings', () => {
	const config = {
		name: 'offline-worker',
		compatibilityDate: '2026-04-26',
		compatibilityFlags: [],
		vars: {
			PUBLIC_VALUE: 'local'
		},
		bindings: {
			rateLimits: {
				RATE_LIMITER: {
					namespaceId: '1001',
					simple: {
						limit: 1,
						period: 10 as const
					}
				}
			},
			versionMetadata: {
				binding: 'CF_VERSION_METADATA'
			},
			hyperdrive: {
				POSTGRES: {
					id: 'hyperdrive-id',
					localConnectionString: 'postgres://user:pass@localhost:5432/app'
				}
			},
			workerLoaders: {
				LOADER: {}
			},
			mtlsCertificates: {
				API_CERT: 'cert-123'
			},
			dispatchNamespaces: {
				DISPATCHER: 'tenants'
			},
			workflows: {
				ORDER_WORKFLOW: {
					name: 'orders',
					className: 'OrderWorkflow'
				}
			},
			pipelines: {
				EVENTS: 'events-stream'
			},
			images: {
				IMAGES: true as const
			},
			media: {
				MEDIA: true as const
			},
			artifacts: {
				ARTIFACTS: 'default'
			},
			secretsStore: {
				API_TOKEN: {
					storeId: 'store-123',
					secretName: 'api-token'
				}
			},
			aiSearch: {
				BLOG_SEARCH: {
					instanceName: 'blog'
				}
			},
			aiSearchNamespaces: {
				SEARCH: {
					namespace: 'default'
				}
			},
			ai: {
				binding: 'AI',
				remote: true
			},
			vectorize: {
				DOCUMENTS: {
					indexName: 'docs',
					remote: true
				}
			}
		}
	}

	test('derives deterministic pure-test bindings from devflare config', async () => {
		const result = createOfflineBindings(config, {
			secretsStore: {
				API_TOKEN: 'offline-secret'
			},
			mtlsCertificates: {
				API_CERT: () => new Response('cert fetch')
			},
			dispatchNamespaces: {
				DISPATCHER: {
					workers: {
						tenant: () => new Response('tenant response')
					}
				}
			},
			aiSearch: {
				BLOG_SEARCH: {
					items: [
						{
							key: 'cache.md',
							content: 'Cloudflare cache API stores responses',
							metadata: { slug: '/cache' }
						}
					]
				}
			},
			aiSearchNamespaces: {
				SEARCH: {
					instances: {
						docs: {
							items: [
								{
									key: 'offline.md',
									content: 'Offline support is fixture backed'
								}
							]
						}
					}
				}
			}
		})

		expect(result.env.PUBLIC_VALUE).toBe('local')
		expect(await (result.env.API_TOKEN as SecretsStoreSecret).get()).toBe('offline-secret')
		expect((result.env.POSTGRES as Hyperdrive).connectionString).toBe(
			'postgres://user:pass@localhost:5432/app'
		)
		expect(await (await (result.env.API_CERT as Fetcher).fetch('https://example.com')).text()).toBe(
			'cert fetch'
		)
		expect(
			await (
				await (result.env.DISPATCHER as DispatchNamespace)
					.get('tenant')
					.fetch('https://example.com')
			).text()
		).toBe('tenant response')

		const firstLimit = await (result.env.RATE_LIMITER as RateLimit).limit({ key: 'user-1' })
		const secondLimit = await (result.env.RATE_LIMITER as RateLimit).limit({ key: 'user-1' })
		expect(firstLimit.success).toBe(true)
		expect(secondLimit.success).toBe(false)

		await (result.env.EVENTS as Pipeline).send([{ message: 'hello' }])
		expect((result.env.EVENTS as Pipeline & { _getRecords(): unknown[] })._getRecords()).toEqual([
			{ message: 'hello' }
		])

		const search = await (result.env.BLOG_SEARCH as AiSearchInstance).search({ query: 'cache' })
		expect(search.chunks).toHaveLength(1)
		expect(search.chunks[0].item.key).toBe('cache.md')

		const multi = await (result.env.SEARCH as AiSearchNamespace).search({
			query: 'offline',
			ai_search_options: {
				instance_ids: ['docs']
			}
		})
		expect(multi.chunks).toHaveLength(1)
		expect(multi.chunks[0].instance_id).toBe('docs')

		expect(result.remoteBoundaries.map((boundary) => boundary.service)).toContain('ai')
		// Vectorize now has an offline mock, so it is no longer a remote boundary.
		expect(result.remoteBoundaries.map((boundary) => boundary.service)).not.toContain('vectorize')
		const vectorize = result.env.DOCUMENTS as VectorizeIndex
		expect(typeof vectorize.query).toBe('function')
		expect(result.missingFixtures).toEqual([])
	})

	test('makes missing secret fixtures explicit and non-networked', async () => {
		const result = createOfflineBindings(config)

		expect(result.missingFixtures).toEqual([
			{
				service: 'secretsStore',
				binding: 'API_TOKEN',
				reason:
					'Secrets Store values are not present in fixtures or the local secret store; pass fixtures.secretsStore.API_TOKEN or run devflare secrets --local.'
			}
		])
		await expect((result.env.API_TOKEN as SecretsStoreSecret).get()).rejects.toThrow(
			'fixtures.secretsStore.API_TOKEN'
		)
	})

	test('createOfflineEnv returns only the derived env object', async () => {
		const env = createOfflineEnv(config, {
			secretsStore: {
				API_TOKEN: 'offline-secret'
			}
		})

		expect(await (env.API_TOKEN as SecretsStoreSecret).get()).toBe('offline-secret')
		expect(env.CF_VERSION_METADATA).toEqual({
			id: 'devflare-local-version',
			tag: 'local',
			timestamp: '1970-01-01T00:00:00.000Z'
		})
	})

	test('loads Secrets Store values from the local secret store when cwd is provided', async () => {
		const cwd = createTempDir()
		writeLocalSecret({
			cwd,
			storeId: 'store-123',
			name: 'api-token',
			value: 'local-secret'
		})

		const env = createOfflineEnv(
			{
				name: 'offline-secret-worker',
				secretsStoreId: 'store-123',
				bindings: {
					secretsStore: {
						API_TOKEN: 'api-token'
					}
				}
			},
			{},
			{ cwd }
		)

		expect(await (env.API_TOKEN as SecretsStoreSecret).get()).toBe('local-secret')
	})

	test('creates deterministic Stream and Flagship bindings and flags VPC as remote', async () => {
		const result = createOfflineBindings(
			{
				name: 'cf2-worker',
				bindings: {
					stream: { STREAM: true },
					flagship: { FLAGS: { appId: 'app-id' } },
					vpcServices: { DB: { serviceId: 'service-uuid' } },
					vpcNetworks: { NET: { tunnelId: 'tunnel-uuid' } }
				}
			},
			{
				flagship: {
					FLAGS: { flags: { 'new-checkout': true } }
				}
			}
		)

		const stream = result.env.STREAM as StreamBinding
		expect(await stream.videos.list()).toEqual([])
		expect(typeof stream.video('abc').id).toBe('string')

		const flags = result.env.FLAGS as Flagship
		expect(await flags.getBooleanValue('new-checkout', false)).toBe(true)
		expect(await flags.getBooleanValue('missing-flag', false)).toBe(false)
		const details = await flags.getBooleanDetails('missing-flag', false)
		expect(details.reason).toBe('DEFAULT')

		const boundaries = result.remoteBoundaries.map((boundary) => boundary.service)
		expect(boundaries).toContain('vpcServices')
		expect(boundaries).toContain('vpcNetworks')
		// VPC bindings are proxy-only, so they are not materialized in env.
		expect(result.env.DB).toBeUndefined()
		expect(result.env.NET).toBeUndefined()
	})

	test('auto-wires KV/D1/R2/queue mocks instead of reporting them missing', async () => {
		const result = createOfflineBindings({
			name: 'storage-worker',
			bindings: {
				kv: { CACHE: 'cache-namespace' },
				d1: { DB: 'app' },
				r2: { BUCKET: 'bucket' },
				queues: { producers: { TASKS: 'tasks' } }
			}
		})

		const kv = result.env.CACHE as KVNamespace
		await kv.put('k', 'v')
		expect(await kv.get('k')).toBe('v')

		expect(typeof (result.env.DB as D1Database).prepare).toBe('function')
		expect(typeof (result.env.BUCKET as R2Bucket).put).toBe('function')

		const queue = result.env.TASKS as Queue & { _getMessages(): unknown[] }
		await queue.send({ id: 1 })
		expect(queue._getMessages()).toEqual([{ body: { id: 1 }, options: undefined }])

		// Storage bindings are auto-provided, so none of them land in missingFixtures.
		expect(result.missingFixtures).toEqual([])
	})

	test('explicit storage fixtures override the auto-created mocks', () => {
		const explicitKV = { marker: 'explicit' } as unknown as KVNamespace
		const result = createOfflineBindings(
			{
				name: 'storage-worker',
				bindings: {
					kv: { CACHE: 'cache-namespace' }
				}
			},
			{ kv: { CACHE: explicitKV } }
		)

		expect(result.env.CACHE).toBe(explicitKV)
	})

	test('reports durableObjects/services (but not kv/d1/r2/queues) as missing', () => {
		const result = createOfflineBindings({
			name: 'wiring-worker',
			bindings: {
				kv: { CACHE: 'cache-namespace' },
				durableObjects: { COUNTER: 'Counter' },
				services: { API: { service: 'api-worker' } }
			}
		})

		const missing = result.missingFixtures.map((entry) => entry.service)
		expect(missing).toContain('durableObjects')
		expect(missing).toContain('services')
		expect(missing).not.toContain('kv')
		expect(result.env.CACHE).toBeDefined()
	})

	test('auto-wires Vectorize and Analytics Engine offline mocks', async () => {
		const result = createOfflineBindings({
			name: 'vectors-worker',
			bindings: {
				vectorize: { DOCS: { indexName: 'docs' } },
				analyticsEngine: { EVENTS: { dataset: 'worker_events' } }
			}
		})

		const index = result.env.DOCS as VectorizeIndex
		await index.insert([{ id: 'a', values: [1, 0, 0] }])
		const matches = await index.query([1, 0, 0], { topK: 1 })
		expect(matches.matches[0].id).toBe('a')

		const dataset = result.env.EVENTS as AnalyticsEngineDataset & {
			writtenDataPoints: unknown[]
		}
		dataset.writeDataPoint({ blobs: ['hit'] })
		expect(dataset.writtenDataPoints).toEqual([{ blobs: ['hit'] }])

		// Neither is a remote boundary anymore.
		expect(result.remoteBoundaries.map((b) => b.service)).not.toContain('vectorize')
		expect(result.missingFixtures).toEqual([])
	})
})
