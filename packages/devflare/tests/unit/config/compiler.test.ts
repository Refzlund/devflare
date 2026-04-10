// =============================================================================
// Config Compiler Tests — Transforms DevflareConfig to wrangler.jsonc
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { compileConfig, rebaseWranglerConfigPaths } from '../../../src/config/compiler'
import type { DevflareConfig } from '../../../src/config/schema'

describe('compileConfig', () => {
	const baseConfig: DevflareConfig = {
		name: 'my-worker',
		compatibilityDate: '2025-01-07',
		compatibilityFlags: []
	}

	describe('basic fields', () => {
		test('compiles minimal config', () => {
			const result = compileConfig(baseConfig)

			expect(result.name).toBe('my-worker')
			expect(result.compatibility_date).toBe('2025-01-07')
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

			expect(result.compatibility_flags).toEqual(['nodejs_compat_v2', 'url_standard'])
		})
	})

	describe('bindings', () => {
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

		test('compiles AI binding', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					ai: { binding: 'AI' }
				}
			})

			expect(result.ai).toEqual({ binding: 'AI' })
		})

		test('compiles Vectorize bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					vectorize: {
						VECTOR_INDEX: { indexName: 'my-index' }
					}
				}
			})

			expect(result.vectorize).toEqual([
				{ binding: 'VECTOR_INDEX', index_name: 'my-index' }
			])
		})

		test('compiles Hyperdrive bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					hyperdrive: {
						POSTGRES: { id: 'hyperdrive-id' }
					}
				}
			})

			expect(result.hyperdrive).toEqual([
				{ binding: 'POSTGRES', id: 'hyperdrive-id' }
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

		test('throws when multiple Browser bindings are compiled', () => {
			expect(() => compileConfig({
				...baseConfig,
				bindings: {
					browser: {
						BROWSER_ONE: 'browser-one',
						BROWSER_TWO: 'browser-two'
					}
				}
			} as DevflareConfig)).toThrow('exactly one browser binding')
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
					binding: 'ASSETS'
				}
			})

			expect(result.assets).toEqual({
				directory: './public',
				binding: 'ASSETS'
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
	})

	describe('limits', () => {
		test('compiles limits config', () => {
			const result = compileConfig({
				...baseConfig,
				limits: { cpu_ms: 50 }
			})

			expect(result.limits).toEqual({ cpu_ms: 50 })
		})
	})

	describe('migrations', () => {
		test('compiles migrations array', () => {
			const result = compileConfig({
				...baseConfig,
				migrations: [
					{ tag: 'v1', new_classes: ['Counter'] }
				]
			})

			expect(result.migrations).toEqual([
				{ tag: 'v1', new_classes: ['Counter'] }
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
	})
})
