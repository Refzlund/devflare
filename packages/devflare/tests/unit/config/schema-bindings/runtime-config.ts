// =============================================================================
// Config Schema Binding Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'

import { configSchema } from '../../../../src/config/schema'

describe('schema validation', () => {
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
