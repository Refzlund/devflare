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
	describe('assets', () => {
		test('compiles assets config', () => {
			const result = compileConfig({
				...baseConfig,
				assets: {
					directory: './public',
					binding: 'ASSETS',
					html_handling: 'force-trailing-slash',
					not_found_handling: 'single-page-application',
					run_worker_first: ['/api/*', '!/api/docs/*']
				}
			})

			expect(result.assets).toEqual({
				directory: './public',
				binding: 'ASSETS',
				html_handling: 'force-trailing-slash',
				not_found_handling: 'single-page-application',
				run_worker_first: ['/api/*', '!/api/docs/*']
			})
		})
	})
})
