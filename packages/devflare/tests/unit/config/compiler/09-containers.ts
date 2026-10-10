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
	describe('containers', () => {
		test('compiles native Containers config to Wrangler containers', () => {
			const result = compileConfig({
				...baseConfig,
				containers: [
					{
						className: 'MyContainer',
						image: './Dockerfile',
						maxInstances: 2,
						instanceType: 'basic',
						name: 'api-container',
						imageBuildContext: './container',
						imageVars: {
							NODE_VERSION: '22'
						},
						rolloutActiveGracePeriod: 30,
						rolloutStepPercentage: [10, 50, 100]
					}
				]
			})

			expect(result.containers).toEqual([
				{
					class_name: 'MyContainer',
					image: './Dockerfile',
					max_instances: 2,
					instance_type: 'basic',
					name: 'api-container',
					image_build_context: './container',
					image_vars: {
						NODE_VERSION: '22'
					},
					rollout_active_grace_period: 30,
					rollout_step_percentage: [10, 50, 100]
				}
			])
		})
	})
})
