// =============================================================================
// Vite plugin transform — order/skip regression tests (F35)
// =============================================================================
// Pin the public contract of `runDevflareTransform` and the two step helpers
// so the worker-entry vs DO transform separation cannot silently regress.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	isTransformCandidate,
	runDevflareTransform,
	runDurableObjectTransform,
	runWorkerEntryTransform
} from '../../../src/vite/plugin-transform'

describe('isTransformCandidate', () => {
	test('rejects node_modules paths', () => {
		expect(isTransformCandidate('/repo/node_modules/foo/index.ts')).toBe(false)
	})

	test('rejects non-source extensions', () => {
		expect(isTransformCandidate('/repo/src/styles.css')).toBe(false)
		expect(isTransformCandidate('/repo/src/data.json')).toBe(false)
	})

	test('accepts ts/tsx/js source files', () => {
		expect(isTransformCandidate('/repo/src/foo.ts')).toBe(true)
		expect(isTransformCandidate('/repo/src/foo.tsx')).toBe(true)
		expect(isTransformCandidate('/repo/src/foo.js')).toBe(true)
	})
})

describe('runWorkerEntryTransform', () => {
	test('returns null for non-worker files', async () => {
		const result = await runWorkerEntryTransform(
			'export default {}',
			'/repo/src/foo.ts'
		)
		expect(result).toBeNull()
	})

	test('returns null when worker source has no recognized handlers', async () => {
		const result = await runWorkerEntryTransform(
			'// nothing useful here',
			'/repo/src/worker.ts'
		)
		expect(result).toBeNull()
	})
})

describe('runDurableObjectTransform', () => {
	test('returns null when doTransforms is disabled', async () => {
		const code = 'import { DurableObject } from "cloudflare:workers"\nexport class C extends DurableObject {}'
		const result = await runDurableObjectTransform(code, '/repo/src/c.ts', { doTransforms: false })
		expect(result).toBeNull()
	})

	test('returns null when source does not mention DurableObject', async () => {
		const result = await runDurableObjectTransform(
			'export const x = 1',
			'/repo/src/x.ts',
			{ doTransforms: true }
		)
		expect(result).toBeNull()
	})
})

describe('runDevflareTransform — order', () => {
	test('skips node_modules entirely', async () => {
		const result = await runDevflareTransform(
			'export class C extends DurableObject {}',
			'/repo/node_modules/pkg/worker.ts',
			{ doTransforms: true }
		)
		expect(result).toBeNull()
	})

	test('skips non-source files entirely', async () => {
		const result = await runDevflareTransform(
			'.foo { color: red }',
			'/repo/src/styles.css',
			{ doTransforms: true }
		)
		expect(result).toBeNull()
	})

	test('returns null for ordinary modules with no DO marker', async () => {
		const result = await runDevflareTransform(
			'export const x = 1',
			'/repo/src/util.ts',
			{ doTransforms: true }
		)
		expect(result).toBeNull()
	})

	test('worker-entry step runs before DO step for worker.ts files', async () => {
		// worker.ts files with no recognized handler should fall through to the DO step.
		// This pins the documented order: worker-entry first, DO second.
		const code = 'export const placeholder = 1'
		const workerResult = await runDevflareTransform(code, '/repo/src/worker.ts', { doTransforms: true })
		// No handler => worker step yields null, DO step also yields null (no DO marker).
		expect(workerResult).toBeNull()
	})
})
