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
	describe('placement', () => {
		test('compiles Smart Placement config', () => {
			const result = compileConfig({
				...baseConfig,
				placement: { mode: 'smart' }
			})

			expect(result.placement).toEqual({ mode: 'smart' })
		})

		test('compiles explicit Placement Hints config', () => {
			const result = compileConfig({
				...baseConfig,
				placement: { region: 'aws:us-east-1' }
			})

			expect(result.placement).toEqual({ region: 'aws:us-east-1' })
		})
	})
})
