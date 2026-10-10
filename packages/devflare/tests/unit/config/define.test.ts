// =============================================================================
// defineConfig Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { defineConfig } from '../../../src/config/define'

describe('defineConfig', () => {
	test('returns config object unchanged', () => {
		const config = defineConfig({
			name: 'my-worker',
			compatibilityDate: '2025-01-07'
		})

		expect(config.name).toBe('my-worker')
		expect(config.compatibilityDate).toBe('2025-01-07')
	})

	test('provides type safety for config', () => {
		// This test verifies TypeScript compilation
		const config = defineConfig({
			name: 'my-worker',
			compatibilityDate: '2025-01-07',
			bindings: {
				kv: { CACHE: 'cache-kv' },
				d1: { DB: 'primary-db' }
			}
		})

		expect(config.bindings?.kv?.CACHE).toBe('cache-kv')
	})

	test('accepts function returning config', () => {
		const config = defineConfig(() => ({
			name: 'dynamic-worker',
			compatibilityDate: '2025-01-07'
		}))

		expect(config.name).toBe('dynamic-worker')
	})

	test('accepts async function returning config', async () => {
		const configFn = defineConfig(async () => ({
			name: 'async-worker',
			compatibilityDate: '2025-01-07'
		}))

		const config = await configFn
		expect(config.name).toBe('async-worker')
	})
})
