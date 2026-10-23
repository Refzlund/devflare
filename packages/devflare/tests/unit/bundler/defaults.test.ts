import { describe, expect, test } from 'bun:test'
import { createWorkerdBundlerDefaults } from '../../../src/bundler/defaults'

describe('createWorkerdBundlerDefaults', () => {
	test('returns the documented baseline shape', () => {
		const d = createWorkerdBundlerDefaults()
		expect(d).toEqual({
			platform: 'browser',
			defaultTsconfigMode: 'if-present',
			sourcemap: false,
			minify: false
		})
	})

	test('returns a fresh object each call (callers are free to mutate the spread)', () => {
		const a = createWorkerdBundlerDefaults()
		const b = createWorkerdBundlerDefaults()
		expect(a).not.toBe(b)
		expect(a).toEqual(b)
	})

	test('parity for shared keys consumed by both worker- and do-bundler', () => {
		const d = createWorkerdBundlerDefaults()
		const sharedKeys = ['platform', 'defaultTsconfigMode', 'sourcemap', 'minify']
		for (const k of sharedKeys) {
			expect(d).toHaveProperty(k)
		}
	})
})
