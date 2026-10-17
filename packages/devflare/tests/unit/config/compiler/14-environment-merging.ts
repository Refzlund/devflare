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
	describe('environment merging', () => {
		test('compiles with environment-specific overrides', () => {
			const result = compileConfig(
				{
					...baseConfig,
					vars: { DEBUG: 'false' },
					env: {
						staging: {
							vars: { DEBUG: 'true' }
						}
					}
				},
				'staging'
			)

			expect(result.vars).toEqual({ DEBUG: 'true' })
		})

		test('deep merges bindings for environment', () => {
			const result = compileConfig(
				{
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
				},
				'dev'
			)

			expect(result.kv_namespaces).toEqual([{ binding: 'CACHE', id: 'dev-kv-id' }])
		})

		test('replaces array fields for environment overrides instead of concatenating them', () => {
			const result = compileConfig(
				{
					...baseConfig,
					routes: [{ pattern: 'root.example/*', zone_name: 'example.com' }],
					triggers: {
						crons: ['0 * * * *']
					},
					migrations: [{ tag: 'v1', new_classes: ['RootCounter'] }],
					env: {
						preview: {
							routes: [{ pattern: 'preview.example/*', zone_name: 'example.com' }],
							triggers: {
								crons: ['0 0 * * *']
							},
							migrations: [{ tag: 'v2', new_classes: ['PreviewCounter'] }]
						}
					}
				},
				'preview'
			)

			expect(result.routes).toEqual([{ pattern: 'preview.example/*', zone_name: 'example.com' }])
			expect(result.triggers?.crons).toEqual(['0 0 * * *'])
			expect(result.migrations).toEqual([{ tag: 'v2', new_classes: ['PreviewCounter'] }])
		})
	})
})
