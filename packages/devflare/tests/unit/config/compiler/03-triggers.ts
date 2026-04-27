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
	describe('triggers', () => {
		test('compiles cron triggers', () => {
			const result = compileConfig({
				...baseConfig,
				triggers: {
					crons: ['0 * * * *', '0 0 * * *']
				}
			})

			expect(result.triggers?.crons).toEqual(['0 * * * *', '0 0 * * *'])
		})
	})
})
