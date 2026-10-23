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

describe('compileDOWorkerConfig', () => {
	const baseConfig: DevflareConfig = {
		name: 'my-worker',
		compatibilityDate: '2025-01-07',
		compatibilityFlags: []
	}

	test('returns an empty array when no Durable Objects are configured', () => {
		const results = compileDOWorkerConfig(baseConfig, 'src/workers/do.ts')
		expect(results).toEqual([])
	})

	test('produces one compiled-worker entry per DO class, named from the class', () => {
		const results = compileDOWorkerConfig(
			{
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'CounterObject' },
						CHAT: { className: 'ChatRoom' }
					}
				}
			},
			'src/workers/do.ts'
		)

		expect(results).toHaveLength(2)

		const counterWorker = results.find((r) => r.name === 'my-worker-counter-object')
		const chatWorker = results.find((r) => r.name === 'my-worker-chat-room')

		expect(counterWorker).toBeDefined()
		expect(chatWorker).toBeDefined()

		expect(counterWorker?.durable_objects).toEqual({
			bindings: [{ name: 'COUNTER', class_name: 'CounterObject' }]
		})
		expect(chatWorker?.durable_objects).toEqual({
			bindings: [{ name: 'CHAT', class_name: 'ChatRoom' }]
		})
	})

	test('respects an explicit scriptName when provided', () => {
		const results = compileDOWorkerConfig(
			{
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'CounterObject', scriptName: 'custom-do-worker' }
					}
				}
			},
			'src/workers/do.ts'
		)

		expect(results).toHaveLength(1)
		expect(results[0]?.name).toBe('custom-do-worker')
	})

	test('groups multiple bindings that share a class into a single worker', () => {
		const results = compileDOWorkerConfig(
			{
				...baseConfig,
				bindings: {
					durableObjects: {
						PRIMARY: { className: 'CounterObject' },
						SECONDARY: { className: 'CounterObject' }
					}
				}
			},
			'src/workers/do.ts'
		)

		expect(results).toHaveLength(1)
		expect(results[0]?.durable_objects?.bindings).toEqual([
			{ name: 'PRIMARY', class_name: 'CounterObject' },
			{ name: 'SECONDARY', class_name: 'CounterObject' }
		])
	})
})
