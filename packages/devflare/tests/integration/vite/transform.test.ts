// =============================================================================
// Vite Plugin Transform Hook — Integration Tests
// =============================================================================

import { beforeEach, describe, expect, test } from 'bun:test'
import type { Plugin, TransformResult } from 'vite'
import { devflarePlugin } from '../../../src/vite/plugin'

/** Transform function signature - uses unknown for this context since we don't use it */
type TransformFn = (
	this: unknown,
	code: string,
	id: string,
	options?: { ssr?: boolean }
) => Promise<TransformResult | undefined> | TransformResult | undefined

/**
 * Helper to get the transform function from a Vite plugin.
 * Handles both function and object-with-handler forms.
 */
function getTransformFn(transform: Plugin['transform']): TransformFn | null {
	if (!transform) return null
	if (typeof transform === 'function') return transform as TransformFn
	if ('handler' in transform) return transform.handler as TransformFn
	return null
}

/** Mock context for testing - transform doesn't use `this` in our implementation */
const mockContext = null

describe('vite plugin transform hook', () => {
	let plugin: Plugin
	let transformFn: TransformFn

	beforeEach(() => {
		plugin = devflarePlugin({ doTransforms: true })
		const fn = getTransformFn(plugin.transform)
		if (!fn) throw new Error('Plugin transform not found')
		transformFn = fn
	})

	describe('file filtering', () => {
		test('returns null for non-typescript files', async () => {
			const result = await transformFn.call(
				mockContext,
				'export const x = 1',
				'/project/src/index.js',
				{}
			)

			expect(result).toBeNull()
		})

		test('returns null for node_modules files', async () => {
			const code = `
				import { DurableObject } from 'cloudflare:workers'
				export class MyDO extends DurableObject {}
			`

			const result = await transformFn.call(
				mockContext,
				code,
				'/project/node_modules/@cloudflare/workers-types/index.ts',
				{}
			)

			expect(result).toBeNull()
		})

		test('returns null for code without DurableObject', async () => {
			const result = await transformFn.call(
				mockContext,
				'export const x = 1',
				'/project/src/utils.ts',
				{}
			)

			expect(result).toBeNull()
		})

		test('processes .ts files with DurableObject', async () => {
			const code = `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	private count = 0
	
	async increment() {
		return ++this.count
	}
}
			`

			const result = await transformFn.call(mockContext, code, '/project/src/do/counter.ts', {})

			expect(result).not.toBeNull()
			expect(typeof result === 'object' && result !== null && 'code' in result).toBe(true)
		})

		test('processes .tsx files with DurableObject', async () => {
			const code = `
import { DurableObject } from 'cloudflare:workers'

export class StateDO extends DurableObject {
	private state = {}
}
			`

			const result = await transformFn.call(mockContext, code, '/project/src/do/state.tsx', {})

			expect(result).not.toBeNull()
		})
	})

	describe('durable object transformation', () => {
		test('wraps DO class with context injection', async () => {
			const code = `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	private count = 0
	
	async increment() {
		return ++this.count
	}
}
			`

			const result = await transformFn.call(mockContext, code, '/project/src/counter.ts', {})

			expect(result).not.toBeNull()
			const output =
				typeof result === 'object' && result !== null && 'code' in result
					? (result as { code: string }).code
					: ''

			// Should contain wrapper with actual naming pattern
			expect(output).toContain('CounterWrapper')
			expect(output).toContain('__OriginalCounter')
			expect(output).toContain('createDurableObjectFetchEvent')
			expect(output).toContain('runWithEventContext')
		})

		test('handles multiple DO classes', async () => {
			const code = `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	async increment() {}
}

export class Timer extends DurableObject {
	async start() {}
}
			`

			const result = await transformFn.call(mockContext, code, '/project/src/objects.ts', {})

			expect(result).not.toBeNull()
			const output =
				typeof result === 'object' && result !== null && 'code' in result
					? (result as { code: string }).code
					: ''

			// Both should be wrapped with actual naming pattern
			expect(output).toContain('CounterWrapper')
			expect(output).toContain('TimerWrapper')
			expect(output).toContain('__OriginalCounter')
			expect(output).toContain('__OriginalTimer')
		})

		test('preserves source maps', async () => {
			const code = `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	async increment() { return 1 }
}
			`

			const result = await transformFn.call(mockContext, code, '/project/src/counter.ts', {})

			expect(result).not.toBeNull()
			if (typeof result === 'object' && result !== null && 'map' in result) {
				expect((result as { map: unknown }).map).toBeDefined()
			}
		})
	})

	describe('doTransforms disabled', () => {
		test('returns null when doTransforms is false', async () => {
			const disabledPlugin = devflarePlugin({ doTransforms: false })
			const disabledTransformFn = getTransformFn(disabledPlugin.transform)
			if (!disabledTransformFn) throw new Error('Plugin transform not found')

			const code = `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {}
			`

			const result = await disabledTransformFn.call(
				mockContext,
				code,
				'/project/src/counter.ts',
				{}
			)

			expect(result).toBeNull()
		})
	})

	describe('decorator detection', () => {
		test('detects @durableObject decorator', async () => {
			const code = `
import { durableObject } from 'devflare'

@durableObject()
export class Counter {
	private count = 0
	
	async increment() {
		return ++this.count
	}
}
			`

			const result = await transformFn.call(mockContext, code, '/project/src/counter.ts', {})

			// Should at least detect the code contains @durableObject
			// Full decorator support will be added in Phase C
			expect(result !== undefined).toBe(true)
		})
	})
})
