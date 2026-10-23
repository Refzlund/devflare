import { describe, expect, test } from 'bun:test'
import {
	SUPPORTED_WORKER_EXTENSIONS,
	TS_WORKER_EXTENSIONS
} from '../../../src/worker-entry/extensions'
import {
	DEFAULT_EMAIL_ENTRY_FILES,
	DEFAULT_FETCH_ENTRY_FILES,
	DEFAULT_QUEUE_ENTRY_FILES,
	DEFAULT_SCHEDULED_ENTRY_FILES
} from '../../../src/worker-entry/surface-paths'

describe('shared worker source extensions', () => {
	test('SUPPORTED_WORKER_EXTENSIONS covers the documented union', () => {
		expect([...SUPPORTED_WORKER_EXTENSIONS].sort()).toEqual([
			'.cjs',
			'.cts',
			'.js',
			'.jsx',
			'.mjs',
			'.mts',
			'.ts',
			'.tsx'
		])
	})

	test('TS_WORKER_EXTENSIONS is a strict subset of SUPPORTED_WORKER_EXTENSIONS', () => {
		const supported = new Set(SUPPORTED_WORKER_EXTENSIONS)
		for (const ext of TS_WORKER_EXTENSIONS) {
			expect(supported.has(ext)).toBe(true)
		}
	})

	test('default surface entry-file lists derive from the same shared extension set', () => {
		const expected = SUPPORTED_WORKER_EXTENSIONS.length
		for (const surface of [
			DEFAULT_FETCH_ENTRY_FILES,
			DEFAULT_QUEUE_ENTRY_FILES,
			DEFAULT_SCHEDULED_ENTRY_FILES,
			DEFAULT_EMAIL_ENTRY_FILES
		]) {
			expect(surface.length).toBe(expected)
			const exts = surface.map((p) => p.replace(/^src\/[^.]+/, ''))
			expect([...exts].sort()).toEqual([...SUPPORTED_WORKER_EXTENSIONS].sort())
		}
	})
})
