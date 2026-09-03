// =============================================================================
// Vite Plugin Config Hook — Compile / Stringify Integration Tests
// =============================================================================
//
// Split out of `config.test.ts` to keep both files under the reviewable
// source-file-size ceiling. These cover the pure `compileConfig` /
// `stringifyConfig` paths (no filesystem harness); the plugin
// configResolved/configureServer + `resolveViteUserConfig` tests stay in
// `config.test.ts`.

import { describe, expect, test } from 'bun:test'
import { compileConfig } from '../../../src/config/compiler'
import { type LocalConfig, brandAsLocalConfig } from '../../../src/config/resolve-phased'
import type { DevflareConfigInput } from '../../../src/config/schema'
import { configSchema } from '../../../src/config/schema'

/**
 * Helper to parse and validate config from input
 */
function parseConfig(input: DevflareConfigInput): LocalConfig {
	return brandAsLocalConfig(configSchema.parse(input))
}

describe('vite plugin config generation (compile)', () => {
	describe('compileConfig', () => {
		test('compiles minimal config', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01'
			}

			const result = compileConfig(parseConfig(config))

			expect(result.name).toBe('test-worker')
			expect(result.compatibility_date).toBe('2024-01-01')
		})

		test('compiles KV bindings configured with explicit ids', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					kv: {
						CACHE: { id: 'cache-namespace-id' },
						STORE: { id: 'store-namespace-id' }
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.kv_namespaces).toBeDefined()
			expect(result.kv_namespaces).toHaveLength(2)
		})

		test('compiles D1 bindings', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					d1: {
						DB: { id: 'database-id' }
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.d1_databases).toBeDefined()
			expect(result.d1_databases).toHaveLength(1)
			expect(result.d1_databases![0].binding).toBe('DB')
		})

		test('compiles R2 bindings', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					r2: {
						BUCKET: 'bucket-name'
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.r2_buckets).toBeDefined()
			expect(result.r2_buckets).toHaveLength(1)
		})

		test('compiles Durable Object bindings', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					durableObjects: {
						COUNTER: { className: 'Counter' }
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.durable_objects).toBeDefined()
			expect(result.durable_objects?.bindings).toHaveLength(1)
			expect(result.durable_objects?.bindings?.[0].name).toBe('COUNTER')
			expect(result.durable_objects?.bindings?.[0].class_name).toBe('Counter')
		})

		test('compiles vars', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				vars: {
					API_URL: 'https://api.example.com',
					DEBUG: 'true'
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.vars).toBeDefined()
			expect(result.vars?.API_URL).toBe('https://api.example.com')
			expect(result.vars?.DEBUG).toBe('true')
		})

		test('compiles cron triggers', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				triggers: {
					crons: ['0 * * * *', '0 0 * * *']
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.triggers).toBeDefined()
			expect(result.triggers?.crons).toEqual(['0 * * * *', '0 0 * * *'])
		})

		test('compiles with environment override', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				vars: {
					API_URL: 'https://api.dev.example.com'
				},
				env: {
					production: {
						vars: {
							API_URL: 'https://api.example.com'
						}
					}
				}
			}

			const result = compileConfig(parseConfig(config), 'production')

			expect(result.vars?.API_URL).toBe('https://api.example.com')
		})

		test('merges compatibility flags', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				compatibilityFlags: ['nodejs_compat']
			}

			const result = compileConfig(parseConfig(config))

			expect(result.compatibility_flags).toContain('nodejs_compat')
		})
	})

	describe('stringifyConfig', () => {
		test('produces valid JSON with header comment', () => {
			const { stringifyConfig } = require('../../../src/config/compiler')

			const wranglerConfig = {
				name: 'test-worker',
				compatibility_date: '2024-01-01'
			}

			const content = stringifyConfig(wranglerConfig)

			expect(content).toContain('// Generated by devflare')
			expect(content).toContain('test-worker')
		})

		test('formats output as JSON with tabs', () => {
			const { stringifyConfig } = require('../../../src/config/compiler')

			const wranglerConfig = {
				name: 'test-worker',
				compatibility_date: '2024-01-01',
				vars: { API_URL: 'https://api.example.com' }
			}

			const content = stringifyConfig(wranglerConfig)

			// Remove comment lines and parse
			const jsonContent = content
				.split('\n')
				.filter((line: string) => !line.trim().startsWith('//'))
				.join('\n')

			const parsed = JSON.parse(jsonContent)
			expect(parsed.name).toBe('test-worker')
			expect(parsed.vars.API_URL).toBe('https://api.example.com')
		})

		test('includes all bindings in output', () => {
			const { stringifyConfig } = require('../../../src/config/compiler')

			const wranglerConfig = {
				name: 'test-worker',
				compatibility_date: '2024-01-01',
				kv_namespaces: [{ binding: 'CACHE', id: 'cache-ns' }],
				d1_databases: [{ binding: 'DB', database_id: 'db-id' }]
			}

			const content = stringifyConfig(wranglerConfig)

			expect(content).toContain('kv_namespaces')
			expect(content).toContain('CACHE')
			expect(content).toContain('d1_databases')
			expect(content).toContain('DB')
		})
	})

	describe('config with all bindings', () => {
		test('compiles complex config with multiple bindings', () => {
			const config: DevflareConfigInput = {
				name: 'full-worker',
				compatibilityDate: '2024-01-01',
				compatibilityFlags: ['nodejs_compat'],
				bindings: {
					kv: { CACHE: { id: 'cache-ns' } },
					d1: { DB: { id: 'database-id' } },
					r2: { BUCKET: 'bucket-name' },
					durableObjects: { COUNTER: { className: 'Counter' } },
					services: { AUTH: { service: 'auth-worker' } }
				},
				vars: {
					API_URL: 'https://api.example.com'
				},
				triggers: {
					crons: ['0 * * * *']
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.name).toBe('full-worker')
			expect(result.kv_namespaces).toHaveLength(1)
			expect(result.d1_databases).toHaveLength(1)
			expect(result.r2_buckets).toHaveLength(1)
			expect(result.durable_objects?.bindings).toHaveLength(1)
			expect(result.services).toHaveLength(1)
			expect(result.vars?.API_URL).toBe('https://api.example.com')
			expect(result.triggers?.crons).toHaveLength(1)
		})
	})
})
