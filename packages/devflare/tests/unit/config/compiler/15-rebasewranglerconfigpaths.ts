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
	describe('rebaseWranglerConfigPaths', () => {
		test('rebases main and assets.directory relative to the generated config directory', () => {
			const rebased = rebaseWranglerConfigPaths('/project', '/project/.devflare/build', {
				name: 'my-worker',
				compatibility_date: '2025-01-07',
				main: '.svelte-kit/cloudflare/_worker.js',
				assets: {
					directory: '.svelte-kit/cloudflare',
					binding: 'ASSETS'
				}
			})

			expect(rebased.main).toBe('../../.svelte-kit/cloudflare/_worker.js')
			expect(rebased.assets).toEqual({
				directory: '../../.svelte-kit/cloudflare',
				binding: 'ASSETS'
			})
		})

		test('preserves unrelated Wrangler fields while rebasing path fields', () => {
			const rebased = rebaseWranglerConfigPaths('/project', '/project/.devflare', {
				name: 'my-worker',
				compatibility_date: '2025-01-07',
				workers_dev: true,
				assets: {
					directory: 'public'
				}
			})

			expect(rebased.workers_dev).toBe(true)
			expect(rebased.assets).toEqual({
				directory: '../public'
			})
		})

		test('rebases local Container image paths and build contexts', () => {
			const rebased = rebaseWranglerConfigPaths('/project', '/project/.devflare', {
				name: 'my-worker',
				compatibility_date: '2025-01-07',
				containers: [
					{
						class_name: 'MyContainer',
						image: './Dockerfile',
						image_build_context: './container'
					},
					{
						class_name: 'RegistryContainer',
						image: 'ghcr.io/acme/app:local'
					}
				]
			})

			expect(rebased.containers).toEqual([
				{
					class_name: 'MyContainer',
					image: '../Dockerfile',
					image_build_context: '../container'
				},
				{
					class_name: 'RegistryContainer',
					image: 'ghcr.io/acme/app:local'
				}
			])
		})
	})
})
