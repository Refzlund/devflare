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
	describe('migrations', () => {
		test('compiles migrations array', () => {
			const result = compileConfig({
				...baseConfig,
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

			expect(result.migrations).toEqual([
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
			])
		})
	})
})
