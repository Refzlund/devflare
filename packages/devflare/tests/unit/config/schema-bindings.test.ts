// =============================================================================
// Config Schema Binding Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { configSchema } from '../../../src/config/schema'

describe('configSchema', () => {
	describe('bindings', () => {
		test('accepts KV bindings configured by string shorthand names', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					kv: {
						CACHE: 'cache-kv'
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.kv?.CACHE).toBe('cache-kv')
			}
		})

		test('accepts KV bindings configured by name', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					kv: {
						CACHE: {
							name: 'cache-kv'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.kv?.CACHE).toEqual({ name: 'cache-kv' })
			}
		})

		test('accepts KV bindings configured by explicit id object', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					kv: {
						CACHE: {
							id: 'kv-namespace-id-123'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.kv?.CACHE).toEqual({ id: 'kv-namespace-id-123' })
			}
		})

		test('accepts D1 bindings configured by string shorthand names', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					d1: {
						DB: 'app-database'
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.d1?.DB).toBe('app-database')
			}
		})

		test('accepts D1 bindings configured by name', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					d1: {
						DB: {
							name: 'main-database'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.d1?.DB).toEqual({ name: 'main-database' })
			}
		})

		test('accepts D1 bindings configured by explicit id object', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					d1: {
						DB: {
							id: 'd1-database-id-789'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.d1?.DB).toEqual({ id: 'd1-database-id-789' })
			}
		})

		test('accepts R2 bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					r2: {
						BUCKET: 'my-bucket-name'
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.r2?.BUCKET).toBe('my-bucket-name')
			}
		})

		test('accepts Durable Object bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					durableObjects: {
						COUNTER: {
							className: 'Counter',
							scriptName: 'my-worker'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				const doBinding = result.data.bindings?.durableObjects?.COUNTER
				expect(typeof doBinding === 'object' && doBinding?.className).toBe('Counter')
			}
		})

		test('accepts Queue bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					queues: {
						producers: {
							QUEUE: 'my-queue-name'
						},
						consumers: [
							{ queue: 'my-queue-name', maxBatchSize: 10 }
						]
					}
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts files.tail and Tail Consumers configuration', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				files: {
					tail: 'src/observability-tail.ts'
				},
				tailConsumers: [
					'observability-tail',
					{
						service: 'staging-observability-tail',
						environment: 'staging'
					}
				]
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.files?.tail).toBe('src/observability-tail.ts')
				expect(result.data.tailConsumers).toEqual([
					'observability-tail',
					{
						service: 'staging-observability-tail',
						environment: 'staging'
					}
				])
			}
		})

		test('rejects Tail Consumers without a service name', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				tailConsumers: [
					{ service: '' }
				]
			})

			expect(result.success).toBe(false)
		})

		test('accepts Rate Limiting bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.rateLimits?.MY_RATE_LIMITER).toEqual({
					namespaceId: '1001',
					simple: {
						limit: 100,
						period: 60
					}
				})
			}
		})

		test('rejects Rate Limiting bindings with unsupported periods', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					rateLimits: {
						MY_RATE_LIMITER: {
							namespaceId: '1001',
							simple: {
								limit: 100,
								period: 30
							}
						}
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts Version Metadata bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					versionMetadata: {
						binding: 'CF_VERSION_METADATA'
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.versionMetadata).toEqual({
					binding: 'CF_VERSION_METADATA'
				})
			}
		})

		test('accepts Worker Loader bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					workerLoaders: {
						LOADER: {}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.workerLoaders?.LOADER).toEqual({})
			}
		})

		test('accepts mTLS Certificate bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					mtlsCertificates: {
						API_CERT: {
							certificateId: 'cert-123',
							remote: true
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.mtlsCertificates?.API_CERT).toEqual({
					certificateId: 'cert-123',
					remote: true
				})
			}
		})

		test('rejects mTLS Certificate bindings without a certificate id', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					mtlsCertificates: {
						API_CERT: {
							certificateId: ''
						}
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts Dispatch Namespace bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.dispatchNamespaces?.DISPATCHER).toEqual({
					namespace: 'customers',
					outbound: {
						service: 'outbound-worker',
						environment: 'production',
						parameters: ['ctx']
					},
					remote: true
				})
			}
		})

		test('accepts Workflow bindings with remote and step limits', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.workflows?.ORDER_WORKFLOW).toEqual({
					name: 'orders',
					className: 'OrderWorkflow',
					scriptName: 'workflow-worker',
					remote: true,
					limits: {
						steps: 42
					}
				})
			}
		})

		test('accepts Pipeline bindings with string and remote object forms', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.pipelines?.EVENTS).toBe('events-stream')
				expect(result.data.bindings?.pipelines?.AUDIT).toEqual({
					pipeline: 'audit-stream',
					remote: true
				})
			}
		})

		test('accepts one Images binding with remote option', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					images: {
						IMAGES: {
							remote: true
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.images?.IMAGES).toEqual({
					remote: true
				})
			}
		})

		test('rejects multiple Images bindings until Wrangler supports them', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					images: {
						IMAGES: {},
						OTHER_IMAGES: {}
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts one Media Transformations binding with remote option', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					media: {
						MEDIA: {
							remote: true
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.media?.MEDIA).toEqual({
					remote: true
				})
			}
		})

		test('rejects multiple Media Transformations bindings until Wrangler supports them', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					media: {
						MEDIA: {},
						OTHER_MEDIA: {}
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts Artifacts bindings with string and remote object forms', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.artifacts?.ARTIFACTS).toBe('default')
				expect(result.data.bindings?.artifacts?.ARCHIVE).toEqual({
					namespace: 'archive',
					remote: true
				})
			}
		})

		test('accepts Secrets Store bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					secretsStore: {
						API_TOKEN: {
							storeId: 'store-123',
							secretName: 'api-token'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.secretsStore?.API_TOKEN).toEqual({
					storeId: 'store-123',
					secretName: 'api-token'
				})
			}
		})

		test('rejects Secrets Store bindings without a store id', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					secretsStore: {
						API_TOKEN: {
							storeId: '',
							secretName: 'api-token'
						}
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts Service bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					services: {
						AUTH: { service: 'auth-worker' },
						ADMIN: {
							service: 'auth-worker',
							environment: 'production',
							entrypoint: 'AdminEntrypoint'
						}
					}
				}
			})

			expect(result.success).toBe(true)
		})

		test('rejects malformed Service binding entrypoints and unknown keys', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					services: {
						AUTH: {
							service: 'auth-worker',
							entrypoint: 123,
							unsafe: true
						}
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts AI binding with local-development flags', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					ai: {
						binding: 'AI',
						remote: true,
						staging: true
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.ai).toEqual({
					binding: 'AI',
					remote: true,
					staging: true
				})
			}
		})

		test('accepts AI Search namespace and instance bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.aiSearchNamespaces?.AI_SEARCH).toEqual({
					namespace: 'default',
					remote: true
				})
				expect(result.data.bindings?.aiSearch?.DOCS_SEARCH).toEqual({
					instanceName: 'docs',
					remote: true
				})
			}
		})

		test('accepts Vectorize bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					vectorize: {
						VECTOR_INDEX: { indexName: 'my-index', remote: true }
					}
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts Hyperdrive bindings configured by string shorthand names', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					hyperdrive: {
						POSTGRES: 'devflare-testing'
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.hyperdrive?.POSTGRES).toBe('devflare-testing')
			}
		})

		test('accepts Hyperdrive bindings configured by name', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					hyperdrive: {
						POSTGRES: {
							name: 'devflare-testing',
							localConnectionString: 'postgres://user:pass@localhost:5432/app'
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.hyperdrive?.POSTGRES).toEqual({
					name: 'devflare-testing',
					localConnectionString: 'postgres://user:pass@localhost:5432/app'
				})
			}
		})

		test('accepts Hyperdrive bindings configured by explicit id object', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					hyperdrive: {
						POSTGRES: {
							id: 'hyperdrive-config-id',
							localConnectionString: 'postgres://user:pass@localhost:5432/app'
						}
					}
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts Browser binding map syntax', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					browser: { BROWSER: 'browser-resource' }
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts Browser binding object form with remote option', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					browser: {
						BROWSER: {
							remote: true
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.browser?.BROWSER).toEqual({
					remote: true
				})
			}
		})

		test('rejects multiple Browser bindings until Wrangler supports them', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					browser: {
						BROWSER_ONE: 'browser-one',
						BROWSER_TWO: 'browser-two'
					}
				}
			})

			expect(result.success).toBe(false)
			if (!result.success) {
				const browserIssue = result.error.issues.find((issue) =>
					issue.path.includes('browser')
				)
				expect(browserIssue?.message).toContain('exactly one browser binding')
				expect(browserIssue?.message).toContain('BROWSER_ONE')
				expect(browserIssue?.message).toContain('BROWSER_TWO')
			}
		})

		test('accepts Analytics Engine bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					analyticsEngine: {
						ANALYTICS: { dataset: 'my-dataset' }
					}
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts sendEmail bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					sendEmail: {
						EMAIL: {
							destinationAddress: 'admin@example.com',
							allowedSenderAddresses: ['sender@example.com']
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.sendEmail?.EMAIL.destinationAddress).toBe('admin@example.com')
				expect(result.data.bindings?.sendEmail?.EMAIL.allowedSenderAddresses).toEqual(['sender@example.com'])
			}
		})

		test('rejects sendEmail bindings that mix destinationAddress and allowedDestinationAddresses', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					sendEmail: {
						EMAIL: {
							destinationAddress: 'admin@example.com',
							allowedDestinationAddresses: ['ops@example.com']
						}
					}
				}
			})

			expect(result.success).toBe(false)
		})
	})

	describe('runtime config', () => {
		test('accepts expanded Static Assets routing options', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				assets: {
					directory: './public',
					binding: 'ASSETS',
					html_handling: 'force-trailing-slash',
					not_found_handling: 'single-page-application',
					run_worker_first: ['/api/*', '!/api/docs/*']
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.assets).toEqual({
					directory: './public',
					binding: 'ASSETS',
					html_handling: 'force-trailing-slash',
					not_found_handling: 'single-page-application',
					run_worker_first: ['/api/*', '!/api/docs/*']
				})
			}
		})

		test('rejects unsupported Static Assets routing options', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				assets: {
					directory: './public',
					html_handling: 'sometimes'
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts expanded Observability logs and traces options', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.observability).toEqual({
					enabled: true,
					head_sampling_rate: 0.5,
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
			}
		})

		test('rejects invalid nested Observability sampling rates', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				observability: {
					logs: {
						head_sampling_rate: 1.5
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('rejects unsupported nested Observability options', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				observability: {
					traces: {
						unsupported: true
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts CPU and subrequest limits', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				limits: {
					cpu_ms: 100,
					subrequests: 150
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.limits).toEqual({
					cpu_ms: 100,
					subrequests: 150
				})
			}
		})

		test('rejects unsupported limit options', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				limits: {
					memory_mb: 256
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts Smart Placement and explicit placement hints', () => {
			const smart = configSchema.safeParse({
				name: 'smart-worker',
				compatibilityDate: '2026-04-26',
				placement: {
					mode: 'smart'
				}
			})
			const region = configSchema.safeParse({
				name: 'region-worker',
				compatibilityDate: '2026-04-26',
				placement: {
					region: 'aws:us-east-1'
				}
			})
			const host = configSchema.safeParse({
				name: 'host-worker',
				compatibilityDate: '2026-04-26',
				placement: {
					host: 'db.example.com:5432'
				}
			})
			const hostname = configSchema.safeParse({
				name: 'hostname-worker',
				compatibilityDate: '2026-04-26',
				placement: {
					hostname: 'api.example.com'
				}
			})

			expect(smart.success).toBe(true)
			expect(region.success).toBe(true)
			expect(host.success).toBe(true)
			expect(hostname.success).toBe(true)
			if (region.success) {
				expect(region.data.placement).toEqual({ region: 'aws:us-east-1' })
			}
		})

		test('rejects mixed Placement hint formats', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				placement: {
					mode: 'smart',
					region: 'aws:us-east-1'
				}
			})

			expect(result.success).toBe(false)
		})
	})
})
