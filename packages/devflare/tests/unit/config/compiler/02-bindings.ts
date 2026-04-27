// =============================================================================
// Config Compiler Tests — Transforms DevflareConfig to wrangler.jsonc
// =============================================================================

import { describe, expect, test } from 'bun:test'

import { preview } from '../../../../src/config'

import {
	compileBuildConfig,
	compileConfig,
	compileDOWorkerConfig,
	rebaseWranglerConfigPaths
} from '../../../../src/config/compiler'

import { brandAsLocalConfig } from '../../../../src/config/resolve-phased'

import type { DevflareConfig } from '../../../../src/config/schema'

const baseConfig = brandAsLocalConfig({
	name: 'my-worker',
	compatibilityDate: '2025-01-07',
	compatibilityFlags: []
} satisfies DevflareConfig)

describe('compileConfig', () => {
	describe('bindings', () => {
		test('materializes preview-scoped bindings before compilation', () => {
			const pv = preview.scope()
			const result = compileConfig({
				...baseConfig,
				bindings: {
					r2: { BUCKET: pv('my-bucket') },
					queues: {
						producers: { JOBS: pv('jobs-queue') },
						consumers: [{ queue: pv('jobs-queue') }]
					},
					vectorize: {
						SEARCH_INDEX: { indexName: pv('search-index') }
					},
					browser: { BROWSER: pv('browser-renderer') },
					analyticsEngine: {
						ANALYTICS: { dataset: pv('analytics-dataset') }
					}
				}
			})

			expect(result.r2_buckets).toEqual([{ binding: 'BUCKET', bucket_name: 'my-bucket' }])
			expect(result.queues?.producers).toEqual([{ binding: 'JOBS', queue: 'jobs-queue' }])
			expect(result.queues?.consumers).toEqual([{ queue: 'jobs-queue' }])
			expect(result.vectorize).toEqual([{ binding: 'SEARCH_INDEX', index_name: 'search-index' }])
			expect(result.browser).toEqual({ binding: 'BROWSER' })
			expect(result.analytics_engine_datasets).toEqual([
				{ binding: 'ANALYTICS', dataset: 'analytics-dataset' }
			])
		})

		test('compiles KV bindings configured with explicit id objects', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					kv: { CACHE: { id: 'kv-id-123' } }
				}
			})

			expect(result.kv_namespaces).toEqual([{ binding: 'CACHE', id: 'kv-id-123' }])
		})

		test('throws for unresolved KV name bindings configured with string shorthand', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						kv: { CACHE: 'cache-kv' }
					}
				})
			).toThrow('configured by name (cache-kv)')
		})

		test('throws for unresolved KV name bindings configured with { name }', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						kv: { CACHE: { name: 'cache-kv' } }
					}
				})
			).toThrow('loadResolvedConfig() or resolveConfigResources()')
		})

		test('preserves KV names in build artifacts', () => {
			const result = compileBuildConfig({
				...baseConfig,
				bindings: {
					kv: { CACHE: { name: 'cache-kv' } }
				}
			})

			expect(result.kv_namespaces).toEqual([{ binding: 'CACHE', name: 'cache-kv' }])
		})

		test('treats D1 string shorthand as an unresolved database name', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						d1: { DB: 'app-db' }
					}
				})
			).toThrow('configured by name (app-db)')
		})

		test('compiles D1 bindings configured with explicit id objects', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					d1: { DB: { id: 'd1-id-789' } }
				}
			})

			expect(result.d1_databases).toEqual([{ binding: 'DB', database_id: 'd1-id-789' }])
		})

		test('throws for unresolved D1 name bindings', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						d1: { DB: { name: 'main-database' } }
					}
				})
			).toThrow('loadResolvedConfig() or resolveConfigResources()')
		})

		test('preserves D1 names in build artifacts', () => {
			const result = compileBuildConfig({
				...baseConfig,
				bindings: {
					d1: { DB: { name: 'main-database' } }
				}
			})

			expect(result.d1_databases).toEqual([{ binding: 'DB', database_name: 'main-database' }])
		})

		test('compiles R2 bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					r2: { BUCKET: 'my-bucket' }
				}
			})

			expect(result.r2_buckets).toEqual([{ binding: 'BUCKET', bucket_name: 'my-bucket' }])
		})

		test('compiles Durable Object bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'Counter' }
					}
				}
			})

			expect(result.durable_objects?.bindings).toEqual([{ name: 'COUNTER', class_name: 'Counter' }])
		})

		test('compiles Durable Object bindings with script name', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'Counter', scriptName: 'other-worker' }
					}
				}
			})

			expect(result.durable_objects?.bindings).toEqual([
				{ name: 'COUNTER', class_name: 'Counter', script_name: 'other-worker' }
			])
		})

		test('compiles Agents SDK Durable Object bindings and migrations', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						ChatAgent: {
							className: 'ChatAgent'
						}
					}
				},
				migrations: [
					{
						tag: 'v1',
						new_sqlite_classes: ['ChatAgent']
					}
				]
			})

			expect(result.durable_objects?.bindings).toEqual([
				{
					name: 'ChatAgent',
					class_name: 'ChatAgent'
				}
			])
			expect(result.migrations).toEqual([
				{
					tag: 'v1',
					new_sqlite_classes: ['ChatAgent']
				}
			])
		})

		test('compiles Queue producer bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					queues: {
						producers: { QUEUE: 'my-queue' }
					}
				}
			})

			expect(result.queues?.producers).toEqual([{ binding: 'QUEUE', queue: 'my-queue' }])
		})

		test('compiles Queue consumer bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					queues: {
						consumers: [{ queue: 'my-queue', maxBatchSize: 10, maxRetries: 3 }]
					}
				}
			})

			expect(result.queues?.consumers).toEqual([
				{ queue: 'my-queue', max_batch_size: 10, max_retries: 3 }
			])
		})

		test('compiles Tail Consumers', () => {
			const result = compileConfig({
				...baseConfig,
				tailConsumers: [
					'observability-tail',
					{
						service: 'staging-observability-tail',
						environment: 'staging'
					}
				]
			})

			expect(result.tail_consumers).toEqual([
				{ service: 'observability-tail' },
				{ service: 'staging-observability-tail', environment: 'staging' }
			])
		})

		test('compiles Rate Limiting bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					rateLimits: {
						MY_RATE_LIMITER: {
							namespaceId: '1001',
							simple: {
								limit: 100,
								period: 60
							}
						}
					}
				}
			})

			expect(result.ratelimits).toEqual([
				{
					name: 'MY_RATE_LIMITER',
					namespace_id: '1001',
					simple: {
						limit: 100,
						period: 60
					}
				}
			])
		})

		test('compiles Version Metadata binding', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					versionMetadata: {
						binding: 'CF_VERSION_METADATA'
					}
				}
			})

			expect(result.version_metadata).toEqual({
				binding: 'CF_VERSION_METADATA'
			})
		})

		test('compiles Worker Loader bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					workerLoaders: {
						LOADER: {}
					}
				}
			})

			expect(result.worker_loaders).toEqual([{ binding: 'LOADER' }])
		})

		test('compiles mTLS Certificate bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					mtlsCertificates: {
						API_CERT: {
							certificateId: 'cert-123',
							remote: true
						}
					}
				}
			})

			expect(result.mtls_certificates).toEqual([
				{
					binding: 'API_CERT',
					certificate_id: 'cert-123',
					remote: true
				}
			])
		})

		test('compiles Dispatch Namespace bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					dispatchNamespaces: {
						DISPATCHER: {
							namespace: 'customers',
							outbound: {
								service: 'outbound-worker',
								environment: 'production',
								parameters: ['ctx']
							},
							remote: true
						}
					}
				}
			})

			expect(result.dispatch_namespaces).toEqual([
				{
					binding: 'DISPATCHER',
					namespace: 'customers',
					outbound: {
						service: 'outbound-worker',
						environment: 'production',
						parameters: ['ctx']
					},
					remote: true
				}
			])
		})

		test('compiles Workflow bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					workflows: {
						ORDER_WORKFLOW: {
							name: 'orders',
							className: 'OrderWorkflow',
							scriptName: 'workflow-worker',
							remote: true,
							limits: {
								steps: 42
							}
						}
					}
				}
			})

			expect(result.workflows).toEqual([
				{
					binding: 'ORDER_WORKFLOW',
					name: 'orders',
					class_name: 'OrderWorkflow',
					script_name: 'workflow-worker',
					remote: true,
					limits: {
						steps: 42
					}
				}
			])
		})

		test('compiles Pipeline bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					pipelines: {
						EVENTS: 'events-stream',
						AUDIT: {
							pipeline: 'audit-stream',
							remote: true
						}
					}
				}
			})

			expect(result.pipelines).toEqual([
				{
					binding: 'EVENTS',
					pipeline: 'events-stream'
				},
				{
					binding: 'AUDIT',
					pipeline: 'audit-stream',
					remote: true
				}
			])
		})

		test('compiles Images binding', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					images: {
						IMAGES: {
							remote: true
						}
					}
				}
			})

			expect(result.images).toEqual({
				binding: 'IMAGES',
				remote: true
			})
		})

		test('compiles Media Transformations binding', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					media: {
						MEDIA: {
							remote: true
						}
					}
				}
			})

			expect(result.media).toEqual({
				binding: 'MEDIA',
				remote: true
			})
		})

		test('compiles Artifacts bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					artifacts: {
						ARTIFACTS: 'default',
						ARCHIVE: {
							namespace: 'archive',
							remote: true
						}
					}
				}
			})

			expect(result.artifacts).toEqual([
				{
					binding: 'ARTIFACTS',
					namespace: 'default'
				},
				{
					binding: 'ARCHIVE',
					namespace: 'archive',
					remote: true
				}
			])
		})

		test('compiles Secrets Store bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					secretsStore: {
						API_TOKEN: {
							storeId: 'store-123',
							secretName: 'api-token'
						}
					}
				}
			})

			expect(result.secrets_store_secrets).toEqual([
				{
					binding: 'API_TOKEN',
					store_id: 'store-123',
					secret_name: 'api-token'
				}
			])
		})

		test('compiles Service bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					services: {
						AUTH: { service: 'auth-worker' }
					}
				}
			})

			expect(result.services).toEqual([{ binding: 'AUTH', service: 'auth-worker' }])
		})

		test('compiles Service bindings with named entrypoints', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					services: {
						AUTH: {
							service: 'auth-worker',
							entrypoint: 'AdminEntrypoint',
							environment: 'staging'
						}
					}
				}
			})

			expect(result.services).toEqual([
				{
					binding: 'AUTH',
					service: 'auth-worker',
					entrypoint: 'AdminEntrypoint',
					environment: 'staging'
				}
			])
		})

		test('compiles AI binding with local-development flags', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					ai: {
						binding: 'AI',
						remote: true,
						staging: true
					}
				}
			})

			expect(result.ai).toEqual({
				binding: 'AI',
				remote: true,
				staging: true
			})
		})

		test('compiles AI Search namespace and instance bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					aiSearchNamespaces: {
						AI_SEARCH: {
							namespace: 'default',
							remote: true
						}
					},
					aiSearch: {
						DOCS_SEARCH: {
							instanceName: 'docs',
							remote: true
						}
					}
				}
			})

			expect(result.ai_search_namespaces).toEqual([
				{
					binding: 'AI_SEARCH',
					namespace: 'default',
					remote: true
				}
			])
			expect(result.ai_search).toEqual([
				{
					binding: 'DOCS_SEARCH',
					instance_name: 'docs',
					remote: true
				}
			])
		})

		test('compiles Vectorize bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					vectorize: {
						VECTOR_INDEX: { indexName: 'my-index', remote: true }
					}
				}
			})

			expect(result.vectorize).toEqual([
				{ binding: 'VECTOR_INDEX', index_name: 'my-index', remote: true }
			])
		})

		test('throws for unresolved Hyperdrive name bindings configured with string shorthand', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						hyperdrive: {
							POSTGRES: 'devflare-testing'
						}
					}
				})
			).toThrow('configured by name (devflare-testing)')
		})

		test('compiles Hyperdrive bindings configured with explicit id objects', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					hyperdrive: {
						POSTGRES: {
							id: 'hyperdrive-id',
							localConnectionString: 'postgres://user:pass@localhost:5432/app'
						}
					}
				}
			})

			expect(result.hyperdrive).toEqual([
				{
					binding: 'POSTGRES',
					id: 'hyperdrive-id',
					localConnectionString: 'postgres://user:pass@localhost:5432/app'
				}
			])
		})

		test('throws for unresolved Hyperdrive name bindings configured with { name }', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						hyperdrive: {
							POSTGRES: { name: 'devflare-testing' }
						}
					}
				})
			).toThrow('loadResolvedConfig() or resolveConfigResources()')
		})

		test('preserves Hyperdrive names in build artifacts', () => {
			const result = compileBuildConfig({
				...baseConfig,
				bindings: {
					hyperdrive: {
						POSTGRES: {
							name: 'devflare-testing',
							localConnectionString: 'postgres://user:pass@localhost:5432/app'
						}
					}
				}
			})

			expect(result.hyperdrive).toEqual([
				{
					binding: 'POSTGRES',
					name: 'devflare-testing',
					localConnectionString: 'postgres://user:pass@localhost:5432/app'
				}
			])
		})

		test('compiles Browser binding map syntax', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					browser: { BROWSER: 'browser-resource' }
				}
			})

			expect(result.browser).toEqual({ binding: 'BROWSER' })
		})

		test('compiles Browser binding object form with remote option', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					browser: {
						BROWSER: {
							remote: true
						}
					}
				}
			})

			expect(result.browser).toEqual({
				binding: 'BROWSER',
				remote: true
			})
		})

		test('throws when multiple Browser bindings are compiled', () => {
			expect(() =>
				compileConfig({
					...baseConfig,
					bindings: {
						browser: {
							BROWSER_ONE: 'browser-one',
							BROWSER_TWO: 'browser-two'
						}
					}
				})
			).toThrow('exactly one browser binding')
		})

		test('compiles Analytics Engine bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					analyticsEngine: {
						ANALYTICS: { dataset: 'my-dataset' }
					}
				}
			})

			expect(result.analytics_engine_datasets).toEqual([
				{ binding: 'ANALYTICS', dataset: 'my-dataset' }
			])
		})

		test('compiles sendEmail bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					sendEmail: {
						EMAIL: {
							destinationAddress: 'admin@example.com',
							allowedSenderAddresses: ['sender@example.com']
						},
						BULK_EMAIL: {
							allowedDestinationAddresses: ['ops@example.com', 'team@example.com']
						}
					}
				}
			})

			expect(result.send_email).toEqual([
				{
					name: 'EMAIL',
					destination_address: 'admin@example.com',
					allowed_sender_addresses: ['sender@example.com']
				},
				{
					name: 'BULK_EMAIL',
					allowed_destination_addresses: ['ops@example.com', 'team@example.com']
				}
			])
		})
	})
})
