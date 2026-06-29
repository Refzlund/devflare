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
	describe('basic fields', () => {
		test('compiles minimal config', () => {
			const result = compileConfig(baseConfig)

			expect(result.name).toBe('my-worker')
			expect(result.compatibility_date).toBe('2025-01-07')
			expect(result.compatibility_flags).toEqual(['nodejs_compat', 'nodejs_als'])
		})

		test('defaults preview urls and workers.dev to enabled', () => {
			const result = compileConfig(baseConfig)

			expect(result.preview_urls).toBe(true)
			expect(result.workers_dev).toBe(true)
		})

		test('includes account_id when set', () => {
			const result = compileConfig({
				...baseConfig,
				accountId: 'abc123def456'
			})

			expect(result.account_id).toBe('abc123def456')
		})

		test('includes main entry point from files.fetch', () => {
			const result = compileConfig({
				...baseConfig,
				files: {
					fetch: './src/index.ts'
				}
			})

			expect(result.main).toBe('./src/index.ts')
		})

		test('includes compatibility flags', () => {
			const result = compileConfig({
				...baseConfig,
				compatibilityFlags: ['nodejs_compat_v2', 'url_standard']
			})

			expect(result.compatibility_flags).toEqual([
				'nodejs_compat',
				'nodejs_als',
				'nodejs_compat_v2',
				'url_standard'
			])
		})

		test('normalizes compatibility flags for already-resolved build configs', () => {
			const result = compileBuildConfig(
				{
					...baseConfig,
					compatibilityFlags: ['url_standard']
				},
				undefined,
				{ alreadyResolved: true }
			)

			expect(result.compatibility_flags).toEqual(['nodejs_compat', 'nodejs_als', 'url_standard'])
		})

		test('compiles required secret declarations for Wrangler local/deploy validation', () => {
			const result = compileConfig({
				...baseConfig,
				secrets: {
					API_TOKEN: { required: true },
					OPTIONAL_TOKEN: { required: false }
				}
			})

			expect(result.secrets).toEqual({
				required: ['API_TOKEN']
			})
		})

		test('emits compliance_region when set', () => {
			const result = compileConfig({
				...baseConfig,
				complianceRegion: 'fedramp_high'
			})

			expect(result.compliance_region).toBe('fedramp_high')
		})

		test('omits compliance_region when not set', () => {
			const result = compileConfig(baseConfig)

			expect(result.compliance_region).toBeUndefined()
		})

		test('emits workers_dev: false when workersDev is false', () => {
			const result = compileConfig({
				...baseConfig,
				workersDev: false
			})

			expect(result.workers_dev).toBe(false)
		})

		test('defaults workers_dev to true when workersDev is omitted', () => {
			const result = compileConfig(baseConfig)

			expect(result.workers_dev).toBe(true)
		})

		test('compiles streaming_tail_consumers', () => {
			const result = compileConfig({
				...baseConfig,
				streamingTailConsumers: [
					'stream-worker',
					{ service: 'staging-stream-worker', environment: 'staging' }
				]
			})

			expect(result.streaming_tail_consumers).toEqual([
				{ service: 'stream-worker' },
				{ service: 'staging-stream-worker', environment: 'staging' }
			])
		})
	})
})
