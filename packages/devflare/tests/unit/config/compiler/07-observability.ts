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
	describe('observability', () => {
		test('compiles observability config', () => {
			const result = compileConfig({
				...baseConfig,
				observability: {
					enabled: true,
					head_sampling_rate: 0.1
				}
			})

			expect(result.observability).toEqual({
				enabled: true,
				head_sampling_rate: 0.1
			})
		})

		test('compiles nested logs and traces observability config', () => {
			const result = compileConfig({
				...baseConfig,
				observability: {
					enabled: true,
					logs: {
						enabled: true,
						head_sampling_rate: 0.25,
						invocation_logs: false,
						persist: false,
						destinations: ['workers_logs']
					},
					traces: {
						enabled: true,
						head_sampling_rate: 0.1,
						persist: true,
						destinations: ['cloudflare']
					}
				}
			})

			expect(result.observability).toEqual({
				enabled: true,
				logs: {
					enabled: true,
					head_sampling_rate: 0.25,
					invocation_logs: false,
					persist: false,
					destinations: ['workers_logs']
				},
				traces: {
					enabled: true,
					head_sampling_rate: 0.1,
					persist: true,
					destinations: ['cloudflare']
				}
			})
		})
	})
})
