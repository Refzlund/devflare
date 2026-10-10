import { describe, expect, test } from 'bun:test'
import { normalizeDOBinding } from '../../../src/config/schema-normalization'

describe('normalizeDOBinding', () => {
	test('shorthand string form -> kind: local', () => {
		const result = normalizeDOBinding('Counter')

		expect(result).toEqual({ className: 'Counter', kind: 'local' })
		expect(result.kind).toBe('local')
		expect(result.scriptName).toBeUndefined()
	})

	test('object form without scriptName / __ref -> kind: local', () => {
		const result = normalizeDOBinding({ className: 'Counter' })

		expect(result.kind).toBe('local')
		expect(result.scriptName).toBeUndefined()
		expect(result.className).toBe('Counter')
	})

	test('object form with explicit scriptName -> kind: cross-worker', () => {
		const result = normalizeDOBinding({
			className: 'Counter',
			scriptName: 'other-worker'
		})

		expect(result.kind).toBe('cross-worker')
		expect(result.scriptName).toBe('other-worker')
		expect(result.className).toBe('Counter')
	})

	test('object form carrying a __ref marker -> kind: cross-worker', () => {
		const refMarker = { name: 'other-worker' }
		const result = normalizeDOBinding({
			className: 'Counter',
			__ref: refMarker
		} as unknown as Parameters<typeof normalizeDOBinding>[0])

		expect(result.kind).toBe('cross-worker')
		expect(result.__ref).toBe(refMarker)
	})
})
