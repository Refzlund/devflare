// =============================================================================
// Vite Plugin Tests
// =============================================================================

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { type DevflarePluginOptions, devflarePlugin } from '../../../src/vite/plugin'

describe('devflarePlugin', () => {
	test('returns valid vite plugin object', () => {
		const plugin = devflarePlugin()

		expect(plugin.name).toBe('devflare')
		expect(typeof plugin.configResolved).toBe('function')
	})

	test('accepts custom config path', () => {
		const plugin = devflarePlugin({
			configPath: 'custom.config.ts'
		})

		expect(plugin).toBeDefined()
	})

	test('has correct hook order enforcement', () => {
		const plugin = devflarePlugin()

		// Should run before @cloudflare/vite-plugin
		expect(plugin.enforce).toBe('pre')
	})
})

describe('DO Transform Integration', () => {
	// These tests will validate the Durable Object transformation
	// once we implement the transform module

	test('placeholder for DO transform tests', () => {
		expect(true).toBe(true)
	})
})
