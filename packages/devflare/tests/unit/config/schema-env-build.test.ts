// =============================================================================
// Config Schema Environment and Build Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { configSchema } from '../../../src/config/schema'

describe('configSchema', () => {
	describe('environment overrides', () => {
		test('accepts environment-specific config', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				env: {
					production: {
						vars: { DEBUG: 'false' },
						previews: {
							includeCrons: true
						}
					},
					staging: {
						vars: { DEBUG: 'true' }
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.env?.production?.vars?.DEBUG).toBe('false')
				expect(result.data.env?.production?.previews?.includeCrons).toBe(true)
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

		test('rejects unsupported environment-level build and plugin shorthand', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				env: {
					preview: {
						plugins: [{ name: 'preview-plugin' }],
						build: {
							minify: true,
							rolldownOptions: {
								external: ['cloudflare:workers']
							}
						}
					}
				}
			})

			expect(result.success).toBe(false)
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

		test('rejects unsupported top-level build shorthand', () => {
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

			expect(result.success).toBe(false)
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

		test('rejects unsupported top-level plugins shorthand', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				plugins: [{ name: 'vite-plugin' }]
			})

			expect(result.success).toBe(false)
		})
	})
})
