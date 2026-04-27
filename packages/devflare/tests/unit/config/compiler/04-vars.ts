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
	describe('vars', () => {
		test('compiles environment variables', () => {
			const result = compileConfig({
				...baseConfig,
				vars: {
					API_URL: 'https://api.example.com',
					DEBUG: 'true'
				}
			})

			expect(result.vars).toEqual({
				API_URL: 'https://api.example.com',
				DEBUG: 'true'
			})
		})
	})
})
