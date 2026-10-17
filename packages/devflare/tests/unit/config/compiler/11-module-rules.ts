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
	describe('module rules', () => {
		test('compiles non-JavaScript module rules and additional module options', () => {
			const result = compileConfig({
				...baseConfig,
				rules: [
					{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
					{ type: 'Data', globs: ['**/*.bin'] },
					{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
				],
				findAdditionalModules: true,
				baseDir: './src',
				preserveFileNames: true
			})

			expect(result.rules).toEqual([
				{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
				{ type: 'Data', globs: ['**/*.bin'] },
				{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
			])
			expect(result.find_additional_modules).toBe(true)
			expect(result.base_dir).toBe('./src')
			expect(result.preserve_file_names).toBe(true)
		})
	})

	describe('deploy policy flags', () => {
		test('compiles logpush, uploadSourceMaps, and keepVars to wrangler keys', () => {
			const result = compileConfig({
				...baseConfig,
				logpush: true,
				uploadSourceMaps: true,
				keepVars: false
			})

			expect(result.logpush).toBe(true)
			expect(result.upload_source_maps).toBe(true)
			expect(result.keep_vars).toBe(false)
		})

		test('omits deploy policy flags when unset', () => {
			const result = compileConfig({ ...baseConfig })

			expect(result.logpush).toBeUndefined()
			expect(result.upload_source_maps).toBeUndefined()
			expect(result.keep_vars).toBeUndefined()
		})
	})
})
