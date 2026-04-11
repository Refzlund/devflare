// =============================================================================
// Config Schema Tests — TDD: Write tests first, implement to pass
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { configSchema, type DevflareConfig } from '../../../src/config/schema'

describe('configSchema', () => {
	describe('minimal config', () => {
		test('validates minimal valid config', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07'
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.name).toBe('my-worker')
				expect(result.data.compatibilityDate).toBe('2025-01-07')
			}
		})

		test('requires name', () => {
			const result = configSchema.safeParse({
				compatibilityDate: '2025-01-07'
			})

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].path).toContain('name')
			}
		})

		test('defaults compatibilityDate to current date when not provided', () => {
			const result = configSchema.safeParse({
				name: 'my-worker'
			})

			expect(result.success).toBe(true)
			if (result.success) {
				// Should be a date in YYYY-MM-DD format
				expect(result.data.compatibilityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
			}
		})

		test('validates compatibilityDate format (YYYY-MM-DD)', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: 'invalid-date'
			})

			expect(result.success).toBe(false)
		})
	})

	describe('compatibility flags', () => {
		test('merges user flags with forced flags', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				compatibilityFlags: ['nodejs_compat_v2']
			})

			expect(result.success).toBe(true)
			if (result.success) {
				// Should include forced flags (nodejs_compat, nodejs_als) plus user flags
				expect(result.data.compatibilityFlags).toContain('nodejs_compat')
				expect(result.data.compatibilityFlags).toContain('nodejs_als')
				expect(result.data.compatibilityFlags).toContain('nodejs_compat_v2')
			}
		})

		test('includes forced flags even when not provided', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07'
			})

			expect(result.success).toBe(true)
			if (result.success) {
				// Should include forced flags (nodejs_compat, nodejs_als)
				expect(result.data.compatibilityFlags).toContain('nodejs_compat')
				expect(result.data.compatibilityFlags).toContain('nodejs_als')
			}
		})
	})

	describe('file handlers', () => {
		test('accepts file handler paths', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				files: {
					fetch: './src/fetch.ts',
					queue: './src/queue.ts',
					scheduled: './src/scheduled.ts'
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.files?.fetch).toBe('./src/fetch.ts')
			}
		})

		test('accepts false to disable handler', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				files: {
					fetch: false
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.files?.fetch).toBe(false)
			}
		})

		test('accepts routes config object', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				files: {
					routes: { dir: './src/routes', prefix: '/api' }
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				const routes = result.data.files?.routes
				expect(routes).toBeDefined()
				if (routes) {
					expect(routes.dir).toBe('./src/routes')
					expect(routes.prefix).toBe('/api')
				}
			}
		})

		test('accepts null transport to disable transport autodiscovery', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				files: {
					transport: null
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.files?.transport).toBeNull()
			}
		})
	})

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

		test('accepts Service bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					services: {
						AUTH: { service: 'auth-worker' }
					}
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts AI binding', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					ai: { binding: 'AI' }
				}
			})

			expect(result.success).toBe(true)
		})

		test('accepts Vectorize bindings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					vectorize: {
						VECTOR_INDEX: { indexName: 'my-index' }
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
						POSTGRES: { name: 'devflare-testing' }
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.hyperdrive?.POSTGRES).toEqual({ name: 'devflare-testing' })
			}
		})

		test('accepts Hyperdrive bindings configured by explicit id object', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				bindings: {
					hyperdrive: {
						POSTGRES: { id: 'hyperdrive-config-id' }
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

	describe('triggers', () => {
		test('accepts cron triggers', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				triggers: {
					crons: ['0 * * * *', '0 0 * * *']
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.triggers?.crons).toEqual(['0 * * * *', '0 0 * * *'])
			}
		})
	})

	describe('vars and secrets', () => {
		test('accepts vars', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				vars: {
					API_URL: 'https://api.example.com',
					DEBUG: 'true'
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.vars?.API_URL).toBe('https://api.example.com')
			}
		})

		test('accepts secrets config', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				secrets: {
					API_KEY: { required: true },
					OPTIONAL_KEY: { required: false }
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.secrets?.API_KEY.required).toBe(true)
			}
		})
	})

	describe('environment overrides', () => {
		test('accepts environment-specific config', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				env: {
					production: {
						vars: { DEBUG: 'false' }
					},
					staging: {
						vars: { DEBUG: 'true' }
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.env?.production?.vars?.DEBUG).toBe('false')
			}
		})

		test('accepts environment-specific vite and rolldown overrides', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				env: {
					preview: {
						vite: {
							plugins: [{ name: 'preview-plugin' }]
						},
						rolldown: {
							minify: true,
							options: {
								external: ['cloudflare:workers']
							}
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.env?.preview?.vite?.plugins).toEqual([{ name: 'preview-plugin' }])
				expect(result.data.env?.preview?.rolldown?.minify).toBe(true)
				expect(result.data.env?.preview?.rolldown?.options?.external).toEqual(['cloudflare:workers'])
			}
		})

		test('normalizes legacy environment build/plugins aliases', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				env: {
					preview: {
						plugins: [{ name: 'legacy-preview-plugin' }],
						build: {
							minify: true,
							rolldownOptions: {
								external: ['cloudflare:workers']
							}
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.env?.preview?.vite?.plugins).toEqual([{ name: 'legacy-preview-plugin' }])
				expect(result.data.env?.preview?.rolldown?.minify).toBe(true)
				expect(result.data.env?.preview?.rolldown?.options?.external).toEqual(['cloudflare:workers'])
			}
		})
	})

	describe('wrangler passthrough', () => {
		test('accepts passthrough config', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				wrangler: {
					passthrough: {
						unsafe: {
							bindings: [{ name: 'BETA', type: 'new_type' }]
						}
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.wrangler?.passthrough?.unsafe).toBeDefined()
			}
		})
	})

	describe('rolldown config', () => {
		test('accepts canonical rolldown configuration', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				rolldown: {
					target: 'esnext',
					minify: true,
					sourcemap: true,
					options: {
						external: ['cloudflare:workers']
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rolldown?.minify).toBe(true)
				expect(result.data.rolldown?.options?.external).toEqual(['cloudflare:workers'])
			}
		})

		test('normalizes legacy build alias into rolldown output', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				build: {
					target: 'esnext',
					minify: true,
					sourcemap: true,
					rolldownOptions: {
						external: ['cloudflare:workers']
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rolldown?.target).toBe('esnext')
				expect(result.data.rolldown?.minify).toBe(true)
				expect(result.data.rolldown?.options?.external).toEqual(['cloudflare:workers'])
				expect('build' in (result.data as Record<string, unknown>)).toBe(false)
			}
		})
	})

	describe('vite config', () => {
		test('accepts canonical vite configuration', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				vite: {
					plugins: [{ name: 'vite-plugin' }],
					optInMode: 'spa'
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.vite?.plugins).toEqual([{ name: 'vite-plugin' }])
				expect((result.data.vite as Record<string, unknown> | undefined)?.optInMode).toBe('spa')
			}
		})

		test('normalizes legacy plugins alias into vite.plugins', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				plugins: [{ name: 'legacy-vite-plugin' }]
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.vite?.plugins).toEqual([{ name: 'legacy-vite-plugin' }])
				expect('plugins' in (result.data as Record<string, unknown>)).toBe(false)
			}
		})
	})

	describe('assets config', () => {
		test('accepts assets configuration', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				assets: {
					directory: './public',
					binding: 'ASSETS'
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.assets?.directory).toBe('./public')
			}
		})
	})

	describe('routes config', () => {
		test('accepts routes array', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				routes: [
					{ pattern: 'example.com/*', zone_name: 'example.com' },
					{ pattern: 'api.example.com/*', custom_domain: true }
				]
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.routes?.[0].pattern).toBe('example.com/*')
			}
		})
	})

	describe('observability config', () => {
		test('accepts observability settings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				observability: {
					enabled: true,
					head_sampling_rate: 0.1
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.observability?.enabled).toBe(true)
			}
		})
	})

	describe('limits config', () => {
		test('accepts limits configuration', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				limits: {
					cpu_ms: 50
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.limits?.cpu_ms).toBe(50)
			}
		})
	})

	describe('migrations config', () => {
		test('accepts DO migrations', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				migrations: [
					{
						tag: 'v1',
						new_classes: ['Counter']
					},
					{
						tag: 'v2',
						renamed_classes: [{ from: 'Counter', to: 'CounterV2' }]
					}
				]
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.migrations?.[0].tag).toBe('v1')
			}
		})
	})
})
