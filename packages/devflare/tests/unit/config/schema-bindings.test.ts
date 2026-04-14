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
})
