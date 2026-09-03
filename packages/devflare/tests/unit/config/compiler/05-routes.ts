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

import { configSchema } from '../../../../src/config/schema'
import type { DevflareConfig } from '../../../../src/config/schema'

const baseConfig = brandAsLocalConfig({
	name: 'my-worker',
	compatibilityDate: '2025-01-07',
	compatibilityFlags: []
} satisfies DevflareConfig)

describe('compileConfig', () => {
	describe('routes', () => {
		test('compiles routes array', () => {
			const result = compileConfig({
				...baseConfig,
				routes: [{ pattern: 'example.com/*', zone_name: 'example.com' }]
			})

			expect(result.routes).toEqual([{ pattern: 'example.com/*', zone_name: 'example.com' }])
		})

		test('compiles custom-domain route enabled and previews_enabled', () => {
			const result = compileConfig({
				...baseConfig,
				routes: [
					{
						pattern: 'worker.example.com',
						custom_domain: true,
						enabled: true,
						previews_enabled: false
					}
				]
			})

			expect(result.routes).toEqual([
				{
					pattern: 'worker.example.com',
					custom_domain: true,
					enabled: true,
					previews_enabled: false
				}
			])
		})

		test('rejects enabled/previews_enabled on a non-custom-domain route', () => {
			// wrangler's ZoneIdRoute/ZoneNameRoute are additionalProperties:false
			// and reject enabled/previews_enabled — only CustomDomainRoute accepts
			// them. The strict schema must reject the bad combo at parse time so it
			// never validates locally but fails deploy.
			const enabledOnZoneId = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				routes: [{ pattern: 'example.com/*', zone_id: 'abc123', enabled: true }]
			})
			expect(enabledOnZoneId.success).toBe(false)

			const previewsOnZoneName = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2025-01-07',
				routes: [{ pattern: 'example.com/*', zone_name: 'example.com', previews_enabled: false }]
			})
			expect(previewsOnZoneName.success).toBe(false)
		})
	})
})
