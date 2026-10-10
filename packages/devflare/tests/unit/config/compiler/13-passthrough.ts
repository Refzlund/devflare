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
	describe('passthrough', () => {
		test('merges passthrough config at top level', () => {
			const result = compileConfig({
				...baseConfig,
				wrangler: {
					passthrough: {
						unsafe: {
							bindings: [{ name: 'BETA', type: 'custom' }]
						},
						custom_field: 'value'
					}
				}
			})

			expect(result.unsafe).toEqual({
				bindings: [{ name: 'BETA', type: 'custom' }]
			})
			expect(result.custom_field).toBe('value')
		})

		test('passes Containers config through for Wrangler-managed container deployments', () => {
			const result = compileConfig({
				...baseConfig,
				wrangler: {
					passthrough: {
						containers: [
							{
								class_name: 'MyContainer',
								image: './Dockerfile',
								max_instances: 5
							}
						]
					}
				}
			})

			expect(result.containers).toEqual([
				{
					class_name: 'MyContainer',
					image: './Dockerfile',
					max_instances: 5
				}
			])
		})

		test('passes Sandbox SDK container config through with the matching Durable Object binding', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						Sandbox: {
							className: 'Sandbox'
						}
					}
				},
				migrations: [
					{
						tag: 'v1',
						new_sqlite_classes: ['Sandbox']
					}
				],
				wrangler: {
					passthrough: {
						containers: [
							{
								class_name: 'Sandbox',
								image: './Dockerfile'
							}
						]
					}
				}
			})

			expect(result.containers).toEqual([
				{
					class_name: 'Sandbox',
					image: './Dockerfile'
				}
			])
			expect(result.durable_objects?.bindings).toEqual([
				{
					name: 'Sandbox',
					class_name: 'Sandbox'
				}
			])
			expect(result.migrations).toEqual([
				{
					tag: 'v1',
					new_sqlite_classes: ['Sandbox']
				}
			])
		})

		test('allows disabling preview urls and workers.dev via passthrough overrides', () => {
			const result = compileConfig({
				...baseConfig,
				wrangler: {
					passthrough: {
						preview_urls: false,
						workers_dev: false
					}
				}
			})

			expect(result.preview_urls).toBe(false)
			expect(result.workers_dev).toBe(false)
		})
	})
})
