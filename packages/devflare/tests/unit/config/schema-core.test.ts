// =============================================================================
// Config Schema Core Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { configSchema } from '../../../src/config/schema'

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
				expect(result.data.compatibilityFlags).toContain('nodejs_compat')
				expect(result.data.compatibilityFlags).toContain('nodejs_als')
			}
		})
	})

	describe('preview behavior', () => {
		test('accepts preview cron settings', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				previews: {
					includeCrons: true
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.previews?.includeCrons).toBe(true)
			}
		})

		test('defaults preview cron inclusion to false when previews is present without overrides', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				previews: {}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.previews?.includeCrons).toBe(false)
			}
		})
	})

	describe('dev server settings', () => {
		test('accepts a server host and port', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				server: {
					host: '0.0.0.0',
					port: 3000
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.server?.host).toBe('0.0.0.0')
				expect(result.data.server?.port).toBe(3000)
			}
		})

		test('rejects an out-of-range server port', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				server: {
					port: 70000
				}
			})

			expect(result.success).toBe(false)
		})

		test('rejects unknown server keys', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				server: {
					hostname: 'localhost'
				}
			})

			expect(result.success).toBe(false)
		})
	})

	describe('deploy policy flags', () => {
		test('accepts logpush, uploadSourceMaps, and keepVars booleans', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				logpush: true,
				uploadSourceMaps: true,
				keepVars: false
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.logpush).toBe(true)
				expect(result.data.uploadSourceMaps).toBe(true)
				expect(result.data.keepVars).toBe(false)
			}
		})

		test('rejects non-boolean deploy policy flag values', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				logpush: 'yes'
			})

			expect(result.success).toBe(false)
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

	describe('runtime config', () => {
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

		test('accepts routes array', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				routes: [
					{ pattern: 'example.com/*', zone_name: 'example.com' },
					{ pattern: 'api.example.com', custom_domain: true }
				]
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.routes?.[0].pattern).toBe('example.com/*')
			}
		})

		test('rejects wildcard or path patterns for custom domain routes', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				routes: [
					{ pattern: 'api.example.com/*', custom_domain: true },
					{ pattern: 'app.example.com/login', custom_domain: true }
				]
			})

			expect(result.success).toBe(false)
			if (!result.success) {
				const messages = result.error.issues.map((issue) => issue.message)
				expect(messages).toContain('Wildcard operators (*) are not allowed in Custom Domains')
				expect(messages).toContain('Paths are not allowed in Custom Domains')
			}
		})

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

		test('accepts module rules for text, data, and compiled WASM assets', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				rules: [
					{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
					{ type: 'Data', globs: ['**/*.bin'] },
					{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
				],
				findAdditionalModules: true,
				baseDir: './src',
				preserveFileNames: true
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rules).toEqual([
					{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
					{ type: 'Data', globs: ['**/*.bin'] },
					{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
				])
				expect(result.data.findAdditionalModules).toBe(true)
				expect(result.data.baseDir).toBe('./src')
				expect(result.data.preserveFileNames).toBe(true)
			}
		})

		test('rejects Python module rules so beta Python Workers remain explicit passthrough', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				rules: [{ type: 'PythonModule', globs: ['**/*.py'] }]
			})

			expect(result.success).toBe(false)
		})

		test('accepts native Containers config with offline local-dev options', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				containers: [
					{
						className: 'MyContainer',
						image: './Dockerfile',
						maxInstances: 3,
						instanceType: 'lite',
						imageBuildContext: '.',
						imageVars: {
							NODE_VERSION: '22'
						},
						rolloutStepPercentage: [10, 100]
					}
				]
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.containers?.[0]).toEqual({
					className: 'MyContainer',
					image: './Dockerfile',
					maxInstances: 3,
					instanceType: 'lite',
					imageBuildContext: '.',
					imageVars: {
						NODE_VERSION: '22'
					},
					rolloutStepPercentage: [10, 100]
				})
			}
		})

		test('rejects Containers config without a class name', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				containers: [
					{
						image: './Dockerfile'
					}
				]
			})

			expect(result.success).toBe(false)
		})

		test('accepts DO migrations', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
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

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.migrations?.[0].tag).toBe('v1')
				expect(result.data.migrations?.[0].new_sqlite_classes).toEqual(['Counter'])
				expect(result.data.migrations?.[1].deleted_classes).toEqual(['OldCounter'])
			}
		})

		test('rejects unsupported DO transfer migrations instead of stripping them', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				migrations: [
					{
						tag: 'v4',
						transferred_classes: [
							{
								from: 'OldCounter',
								from_script: 'old-worker',
								to: 'Counter'
							}
						]
					}
				]
			})

			expect(result.success).toBe(false)
		})

		test('rejects extra fields inside DO renamed_classes entries', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				migrations: [
					{
						tag: 'v3',
						renamed_classes: [
							{
								from: 'Counter',
								to: 'CounterV2',
								from_script: 'old-worker'
							}
						]
					}
				]
			})

			expect(result.success).toBe(false)
		})
	})
})
