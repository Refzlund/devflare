// =============================================================================
// Config Compiler Tests — Transforms DevflareConfig to wrangler.jsonc
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { preview } from '../../../src/config'
import {
	compileBuildConfig,
	compileConfig,
	compileDOWorkerConfig,
	rebaseWranglerConfigPaths
} from '../../../src/config/compiler'
import { brandAsLocalConfig } from '../../../src/config/resolve-phased'
import type { DevflareConfig } from '../../../src/config/schema'

describe('compileConfig', () => {
	const baseConfig = brandAsLocalConfig({
		name: 'my-worker',
		compatibilityDate: '2025-01-07',
		compatibilityFlags: []
	} satisfies DevflareConfig)

	describe('basic fields', () => {
		test('compiles minimal config', () => {
			const result = compileConfig(baseConfig)

			expect(result.name).toBe('my-worker')
			expect(result.compatibility_date).toBe('2025-01-07')
			expect(result.compatibility_flags).toEqual(['nodejs_compat', 'nodejs_als'])
		})

		test('defaults preview urls and workers.dev to enabled', () => {
			const result = compileConfig(baseConfig)

			expect(result.preview_urls).toBe(true)
			expect(result.workers_dev).toBe(true)
		})

		test('includes account_id when set', () => {
			const result = compileConfig({
				...baseConfig,
				accountId: 'abc123def456'
			})

			expect(result.account_id).toBe('abc123def456')
		})

		test('includes main entry point from files.fetch', () => {
			const result = compileConfig({
				...baseConfig,
				files: {
					fetch: './src/index.ts'
				}
			})

			expect(result.main).toBe('./src/index.ts')
		})

		test('includes compatibility flags', () => {
			const result = compileConfig({
				...baseConfig,
				compatibilityFlags: ['nodejs_compat_v2', 'url_standard']
			})

			expect(result.compatibility_flags).toEqual([
				'nodejs_compat',
				'nodejs_als',
				'nodejs_compat_v2',
				'url_standard'
			])
		})

		test('normalizes compatibility flags for already-resolved build configs', () => {
			const result = compileBuildConfig({
				...baseConfig,
				compatibilityFlags: ['url_standard']
			}, undefined, { alreadyResolved: true })

			expect(result.compatibility_flags).toEqual([
				'nodejs_compat',
				'nodejs_als',
				'url_standard'
			])
		})

		test('compiles required secret declarations for Wrangler local/deploy validation', () => {
			const result = compileConfig({
				...baseConfig,
				secrets: {
					API_TOKEN: { required: true },
					OPTIONAL_TOKEN: { required: false }
				}
			})

			expect(result.secrets).toEqual({
				required: ['API_TOKEN']
			})
		})
	})

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

			expect(result.r2_buckets).toEqual([
				{ binding: 'BUCKET', bucket_name: 'my-bucket' }
			])
			expect(result.queues?.producers).toEqual([
				{ binding: 'JOBS', queue: 'jobs-queue' }
			])
			expect(result.queues?.consumers).toEqual([
				{ queue: 'jobs-queue' }
			])
			expect(result.vectorize).toEqual([
				{ binding: 'SEARCH_INDEX', index_name: 'search-index' }
			])
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

			expect(result.kv_namespaces).toEqual([
				{ binding: 'CACHE', id: 'kv-id-123' }
			])
		})

		test('throws for unresolved KV name bindings configured with string shorthand', () => {
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					kv: { CACHE: 'cache-kv' }
				}
			})).toThrow('configured by name (cache-kv)')
		})

		test('throws for unresolved KV name bindings configured with { name }', () => {
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					kv: { CACHE: { name: 'cache-kv' } }
				}
			})).toThrow('loadResolvedConfig() or resolveConfigResources()')
		})

		test('preserves KV names in build artifacts', () => {
			const result = compileBuildConfig({
				...baseConfig,
				bindings: {
					kv: { CACHE: { name: 'cache-kv' } }
				}
			})

			expect(result.kv_namespaces).toEqual([
				{ binding: 'CACHE', name: 'cache-kv' }
			])
		})

		test('treats D1 string shorthand as an unresolved database name', () => {
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					d1: { DB: 'app-db' }
				}
			})).toThrow('configured by name (app-db)')
		})

		test('compiles D1 bindings configured with explicit id objects', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					d1: { DB: { id: 'd1-id-789' } }
				}
			})

			expect(result.d1_databases).toEqual([
				{ binding: 'DB', database_id: 'd1-id-789' }
			])
		})

		test('throws for unresolved D1 name bindings', () => {
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					d1: { DB: { name: 'main-database' } }
				}
			})).toThrow('loadResolvedConfig() or resolveConfigResources()')
		})

		test('preserves D1 names in build artifacts', () => {
			const result = compileBuildConfig({
				...baseConfig,
				bindings: {
					d1: { DB: { name: 'main-database' } }
				}
			})

			expect(result.d1_databases).toEqual([
				{ binding: 'DB', database_name: 'main-database' }
			])
		})

		test('compiles R2 bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					r2: { BUCKET: 'my-bucket' }
				}
			})

			expect(result.r2_buckets).toEqual([
				{ binding: 'BUCKET', bucket_name: 'my-bucket' }
			])
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

			expect(result.durable_objects?.bindings).toEqual([
				{ name: 'COUNTER', class_name: 'Counter' }
			])
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

			expect(result.queues?.producers).toEqual([
				{ binding: 'QUEUE', queue: 'my-queue' }
			])
		})

		test('compiles Queue consumer bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					queues: {
						consumers: [
							{ queue: 'my-queue', maxBatchSize: 10, maxRetries: 3 }
						]
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

			expect(result.worker_loaders).toEqual([
				{ binding: 'LOADER' }
			])
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

			expect(result.services).toEqual([
				{ binding: 'AUTH', service: 'auth-worker' }
			])
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
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					hyperdrive: {
						POSTGRES: 'devflare-testing'
					}
				}
			})).toThrow('configured by name (devflare-testing)')
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
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					hyperdrive: {
						POSTGRES: { name: 'devflare-testing' }
					}
				}
			})).toThrow('loadResolvedConfig() or resolveConfigResources()')
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
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					browser: {
						BROWSER_ONE: 'browser-one',
						BROWSER_TWO: 'browser-two'
					}
				}
			})).toThrow('exactly one browser binding')
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

	describe('triggers', () => {
		test('compiles cron triggers', () => {
			const result = compileConfig({
				...baseConfig,
				triggers: {
					crons: ['0 * * * *', '0 0 * * *']
				}
			})

			expect(result.triggers?.crons).toEqual(['0 * * * *', '0 0 * * *'])
		})
	})

	describe('vars', () => {
		test('compiles environment variables', () => {
			const result = compileConfig({
				...baseConfig,
				vars: {
					API_URL: 'https://api.example.com',
					DEBUG: 'true'
				}
			})

			expect(result.vars).toEqual({
				API_URL: 'https://api.example.com',
				DEBUG: 'true'
			})
		})
	})

	describe('routes', () => {
		test('compiles routes array', () => {
			const result = compileConfig({
				...baseConfig,
				routes: [
					{ pattern: 'example.com/*', zone_name: 'example.com' }
				]
			})

			expect(result.routes).toEqual([
				{ pattern: 'example.com/*', zone_name: 'example.com' }
			])
		})
	})

	describe('assets', () => {
		test('compiles assets config', () => {
			const result = compileConfig({
				...baseConfig,
				assets: {
					directory: './public',
					binding: 'ASSETS',
					html_handling: 'force-trailing-slash',
					not_found_handling: 'single-page-application',
					run_worker_first: ['/api/*', '!/api/docs/*']
				}
			})

			expect(result.assets).toEqual({
				directory: './public',
				binding: 'ASSETS',
				html_handling: 'force-trailing-slash',
				not_found_handling: 'single-page-application',
				run_worker_first: ['/api/*', '!/api/docs/*']
			})
		})
	})

	describe('observability', () => {
		test('compiles observability config', () => {
			const result = compileConfig({
				...baseConfig,
				observability: {
					enabled: true,
					head_sampling_rate: 0.1
				}
			})

			expect(result.observability).toEqual({
				enabled: true,
				head_sampling_rate: 0.1
			})
		})

		test('compiles nested logs and traces observability config', () => {
			const result = compileConfig({
				...baseConfig,
				observability: {
					enabled: true,
					logs: {
						enabled: true,
						head_sampling_rate: 0.25,
						invocation_logs: false,
						persist: false,
						destinations: ['workers_logs']
					},
					traces: {
						enabled: true,
						head_sampling_rate: 0.1,
						persist: true,
						destinations: ['cloudflare']
					}
				}
			})

			expect(result.observability).toEqual({
				enabled: true,
				logs: {
					enabled: true,
					head_sampling_rate: 0.25,
					invocation_logs: false,
					persist: false,
					destinations: ['workers_logs']
				},
				traces: {
					enabled: true,
					head_sampling_rate: 0.1,
					persist: true,
					destinations: ['cloudflare']
				}
			})
		})
	})

	describe('limits', () => {
		test('compiles limits config', () => {
			const result = compileConfig({
				...baseConfig,
				limits: { cpu_ms: 50, subrequests: 150 }
			})

			expect(result.limits).toEqual({ cpu_ms: 50, subrequests: 150 })
		})
	})

	describe('containers', () => {
		test('compiles native Containers config to Wrangler containers', () => {
			const result = compileConfig({
				...baseConfig,
				containers: [
					{
						className: 'MyContainer',
						image: './Dockerfile',
						maxInstances: 2,
						instanceType: 'basic',
						name: 'api-container',
						imageBuildContext: './container',
						imageVars: {
							NODE_VERSION: '22'
						},
						rolloutActiveGracePeriod: 30,
						rolloutStepPercentage: [10, 50, 100]
					}
				]
			})

			expect(result.containers).toEqual([
				{
					class_name: 'MyContainer',
					image: './Dockerfile',
					max_instances: 2,
					instance_type: 'basic',
					name: 'api-container',
					image_build_context: './container',
					image_vars: {
						NODE_VERSION: '22'
					},
					rollout_active_grace_period: 30,
					rollout_step_percentage: [10, 50, 100]
				}
			])
		})
	})

	describe('placement', () => {
		test('compiles Smart Placement config', () => {
			const result = compileConfig({
				...baseConfig,
				placement: { mode: 'smart' }
			})

			expect(result.placement).toEqual({ mode: 'smart' })
		})

		test('compiles explicit Placement Hints config', () => {
			const result = compileConfig({
				...baseConfig,
				placement: { region: 'aws:us-east-1' }
			})

			expect(result.placement).toEqual({ region: 'aws:us-east-1' })
		})
	})

	describe('module rules', () => {
		test('compiles non-JavaScript module rules and additional module options', () => {
			const result = compileConfig({
				...baseConfig,
				rules: [
					{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
					{ type: 'Data', globs: ['**/*.bin'] },
					{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
				],
				findAdditionalModules: true,
				baseDir: './src',
				preserveFileNames: true
			})

			expect(result.rules).toEqual([
				{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
				{ type: 'Data', globs: ['**/*.bin'] },
				{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
			])
			expect(result.find_additional_modules).toBe(true)
			expect(result.base_dir).toBe('./src')
			expect(result.preserve_file_names).toBe(true)
		})
	})

	describe('migrations', () => {
		test('compiles migrations array', () => {
			const result = compileConfig({
				...baseConfig,
				migrations: [
					{
						tag: 'v1',
						new_sqlite_classes: ['Counter']
					},
					{
						tag: 'v2',
						new_classes: ['LegacyCounter'],
						renamed_classes: [{ from: 'Counter', to: 'CounterV2' }],
						deleted_classes: ['OldCounter']
					}
				]
			})

			expect(result.migrations).toEqual([
				{
					tag: 'v1',
					new_sqlite_classes: ['Counter']
				},
				{
					tag: 'v2',
					new_classes: ['LegacyCounter'],
					renamed_classes: [{ from: 'Counter', to: 'CounterV2' }],
					deleted_classes: ['OldCounter']
				}
			])
		})
	})

	describe('passthrough', () => {
		test('merges passthrough config at top level', () => {
			const result = compileConfig({
				...baseConfig,
				wrangler: {
					passthrough: {
						unsafe: {
							bindings: [{ name: 'BETA', type: 'custom' }]
						},
						custom_field: 'value'
					}
				}
			})

			expect(result.unsafe).toEqual({
				bindings: [{ name: 'BETA', type: 'custom' }]
			})
			expect(result.custom_field).toBe('value')
		})

		test('passes Containers config through for Wrangler-managed container deployments', () => {
			const result = compileConfig({
				...baseConfig,
				wrangler: {
					passthrough: {
						containers: [
							{
								class_name: 'MyContainer',
								image: './Dockerfile',
								max_instances: 5
							}
						]
					}
				}
			})

			expect(result.containers).toEqual([
				{
					class_name: 'MyContainer',
					image: './Dockerfile',
					max_instances: 5
				}
			])
		})

		test('passes Sandbox SDK container config through with the matching Durable Object binding', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						Sandbox: {
							className: 'Sandbox'
						}
					}
				},
				migrations: [
					{
						tag: 'v1',
						new_sqlite_classes: ['Sandbox']
					}
				],
				wrangler: {
					passthrough: {
						containers: [
							{
								class_name: 'Sandbox',
								image: './Dockerfile'
							}
						]
					}
				}
			})

			expect(result.containers).toEqual([
				{
					class_name: 'Sandbox',
					image: './Dockerfile'
				}
			])
			expect(result.durable_objects?.bindings).toEqual([
				{
					name: 'Sandbox',
					class_name: 'Sandbox'
				}
			])
			expect(result.migrations).toEqual([
				{
					tag: 'v1',
					new_sqlite_classes: ['Sandbox']
				}
			])
		})

		test('allows disabling preview urls and workers.dev via passthrough overrides', () => {
			const result = compileConfig({
				...baseConfig,
				wrangler: {
					passthrough: {
						preview_urls: false,
						workers_dev: false
					}
				}
			})

			expect(result.preview_urls).toBe(false)
			expect(result.workers_dev).toBe(false)
		})
	})

	describe('environment merging', () => {
		test('compiles with environment-specific overrides', () => {
			const result = compileConfig({
				...baseConfig,
				vars: { DEBUG: 'false' },
				env: {
					staging: {
						vars: { DEBUG: 'true' }
					}
				}
			}, 'staging')

			expect(result.vars).toEqual({ DEBUG: 'true' })
		})

		test('deep merges bindings for environment', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					kv: { CACHE: { id: 'prod-kv-id' } }
				},
				env: {
					dev: {
						bindings: {
							kv: { CACHE: { id: 'dev-kv-id' } }
						}
					}
				}
			}, 'dev')

			expect(result.kv_namespaces).toEqual([
				{ binding: 'CACHE', id: 'dev-kv-id' }
			])
		})

		test('replaces array fields for environment overrides instead of concatenating them', () => {
			const result = compileConfig({
				...baseConfig,
				routes: [
					{ pattern: 'root.example/*', zone_name: 'example.com' }
				],
				triggers: {
					crons: ['0 * * * *']
				},
				migrations: [
					{ tag: 'v1', new_classes: ['RootCounter'] }
				],
				env: {
					preview: {
						routes: [
							{ pattern: 'preview.example/*', zone_name: 'example.com' }
						],
						triggers: {
							crons: ['0 0 * * *']
						},
						migrations: [
							{ tag: 'v2', new_classes: ['PreviewCounter'] }
						]
					}
				}
			}, 'preview')

			expect(result.routes).toEqual([
				{ pattern: 'preview.example/*', zone_name: 'example.com' }
			])
			expect(result.triggers?.crons).toEqual(['0 0 * * *'])
			expect(result.migrations).toEqual([
				{ tag: 'v2', new_classes: ['PreviewCounter'] }
			])
		})
	})

	describe('rebaseWranglerConfigPaths', () => {
		test('rebases main and assets.directory relative to the generated config directory', () => {
			const rebased = rebaseWranglerConfigPaths('/project', '/project/.devflare/build', {
				name: 'my-worker',
				compatibility_date: '2025-01-07',
				main: '.svelte-kit/cloudflare/_worker.js',
				assets: {
					directory: '.svelte-kit/cloudflare',
					binding: 'ASSETS'
				}
			})

			expect(rebased.main).toBe('../../.svelte-kit/cloudflare/_worker.js')
			expect(rebased.assets).toEqual({
				directory: '../../.svelte-kit/cloudflare',
				binding: 'ASSETS'
			})
		})

		test('preserves unrelated Wrangler fields while rebasing path fields', () => {
			const rebased = rebaseWranglerConfigPaths('/project', '/project/.devflare', {
				name: 'my-worker',
				compatibility_date: '2025-01-07',
				workers_dev: true,
				assets: {
					directory: 'public'
				}
			})

			expect(rebased.workers_dev).toBe(true)
			expect(rebased.assets).toEqual({
				directory: '../public'
			})
		})

		test('rebases local Container image paths and build contexts', () => {
			const rebased = rebaseWranglerConfigPaths('/project', '/project/.devflare', {
				name: 'my-worker',
				compatibility_date: '2025-01-07',
				containers: [
					{
						class_name: 'MyContainer',
						image: './Dockerfile',
						image_build_context: './container'
					},
					{
						class_name: 'RegistryContainer',
						image: 'ghcr.io/acme/app:local'
					}
				]
			})

			expect(rebased.containers).toEqual([
				{
					class_name: 'MyContainer',
					image: '../Dockerfile',
					image_build_context: '../container'
				},
				{
					class_name: 'RegistryContainer',
					image: 'ghcr.io/acme/app:local'
				}
			])
		})
	})
})

describe('compileDOWorkerConfig', () => {
	const baseConfig: DevflareConfig = {
		name: 'my-worker',
		compatibilityDate: '2025-01-07',
		compatibilityFlags: []
	}

	test('returns an empty array when no Durable Objects are configured', () => {
		const results = compileDOWorkerConfig(baseConfig, 'src/workers/do.ts')
		expect(results).toEqual([])
	})

	test('produces one compiled-worker entry per DO class, named from the class', () => {
		const results = compileDOWorkerConfig(
			{
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'CounterObject' },
						CHAT: { className: 'ChatRoom' }
					}
				}
			},
			'src/workers/do.ts'
		)

		expect(results).toHaveLength(2)

		const counterWorker = results.find((r) => r.name === 'my-worker-counter-object')
		const chatWorker = results.find((r) => r.name === 'my-worker-chat-room')

		expect(counterWorker).toBeDefined()
		expect(chatWorker).toBeDefined()

		expect(counterWorker?.durable_objects).toEqual({
			bindings: [{ name: 'COUNTER', class_name: 'CounterObject' }]
		})
		expect(chatWorker?.durable_objects).toEqual({
			bindings: [{ name: 'CHAT', class_name: 'ChatRoom' }]
		})
	})

	test('respects an explicit scriptName when provided', () => {
		const results = compileDOWorkerConfig(
			{
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'CounterObject', scriptName: 'custom-do-worker' }
					}
				}
			},
			'src/workers/do.ts'
		)

		expect(results).toHaveLength(1)
		expect(results[0]?.name).toBe('custom-do-worker')
	})

	test('groups multiple bindings that share a class into a single worker', () => {
		const results = compileDOWorkerConfig(
			{
				...baseConfig,
				bindings: {
					durableObjects: {
						PRIMARY: { className: 'CounterObject' },
						SECONDARY: { className: 'CounterObject' }
					}
				}
			},
			'src/workers/do.ts'
		)

		expect(results).toHaveLength(1)
		expect(results[0]?.durable_objects?.bindings).toEqual([
			{ name: 'PRIMARY', class_name: 'CounterObject' },
			{ name: 'SECONDARY', class_name: 'CounterObject' }
		])
	})
})
