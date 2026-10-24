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

describe('compileBuildConfig', () => {
	// The contract a predeploy check relies on now that this is public: the `vars` it compiles
	// offline are the vars a deploy of that environment ships, a name-only binding notwithstanding.
	test('compiles the environment merge and the passthrough offline, keeping a name-only D1 by name', () => {
		const config: DevflareConfig = {
			...baseConfig,
			bindings: { d1: { DB: 'main-db' } },
			vars: { BASE: 'base', OVERRIDDEN: 'base' },
			env: { production: { vars: { OVERRIDDEN: 'production' } } }
		}

		const merged = compileBuildConfig(config, 'production')
		expect(merged.vars).toEqual({ BASE: 'base', OVERRIDDEN: 'production' })
		expect(merged.d1_databases).toEqual([{ binding: 'DB', database_name: 'main-db' }])

		// `wrangler.passthrough` is applied last, so its `vars` REPLACE the compiled map whole —
		// including when it is an environment's override that carries them.
		const passed = compileBuildConfig(
			{
				...config,
				env: { production: { wrangler: { passthrough: { vars: { ONLY: 'passthrough' } } } } }
			},
			'production'
		)
		expect(passed.vars).toEqual({ ONLY: 'passthrough' })

		// And the name-only binding is exactly what the resolving compiler refuses offline.
		expect(() => compileConfig(brandAsLocalConfig(config), 'production')).toThrow(
			'D1 binding "DB" is configured by name'
		)
	})
})
