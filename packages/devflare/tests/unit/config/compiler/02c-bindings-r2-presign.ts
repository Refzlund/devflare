// =============================================================================
// Config Compiler Tests — Injected DEVFLARE_R2_BUCKETS var (R2 presign support)
// =============================================================================

import { describe, expect, test } from 'bun:test'

import { compileConfig } from '../../../../src/config/compiler'

import { brandAsLocalConfig } from '../../../../src/config/resolve-phased'

import type { DevflareConfig } from '../../../../src/config/schema'

const baseConfig = brandAsLocalConfig({
	name: 'my-worker',
	compatibilityDate: '2025-01-07',
	compatibilityFlags: []
} satisfies DevflareConfig)

describe('compileConfig', () => {
	describe('injected DEVFLARE_R2_BUCKETS var', () => {
		test('injects the binding → bucket metadata mapping for R2 bindings', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					r2: {
						BUCKET: 'my-bucket',
						EU_BUCKET: { bucketName: 'eu-bucket', jurisdiction: 'eu' }
					}
				}
			})

			expect(JSON.parse(result.vars?.DEVFLARE_R2_BUCKETS as string)).toEqual({
				BUCKET: { bucketName: 'my-bucket' },
				EU_BUCKET: { bucketName: 'eu-bucket', jurisdiction: 'eu' }
			})
		})

		test('merges with user vars; an explicit user var of the same name wins', () => {
			const withUserVars = compileConfig({
				...baseConfig,
				vars: { APP_NAME: 'demo' },
				bindings: { r2: { BUCKET: 'my-bucket' } }
			})
			expect(withUserVars.vars?.APP_NAME).toBe('demo')
			expect(withUserVars.vars?.DEVFLARE_R2_BUCKETS).toBeDefined()

			const withOverride = compileConfig({
				...baseConfig,
				vars: { DEVFLARE_R2_BUCKETS: 'user-owned' },
				bindings: { r2: { BUCKET: 'my-bucket' } }
			})
			expect(withOverride.vars?.DEVFLARE_R2_BUCKETS).toBe('user-owned')
		})

		test('does not emit the var without R2 bindings', () => {
			const result = compileConfig({
				...baseConfig,
				vars: { APP_NAME: 'demo' }
			})
			expect(result.vars).toEqual({ APP_NAME: 'demo' })
		})
	})
})
