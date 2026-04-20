// =============================================================================
// ref() Cross-Config Reference Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { ref } from '../../../src/config/ref'

describe('ref', () => {
	test('returns a lazy proxy', async () => {
		const mockConfig = {
			name: 'test-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref(async () => ({ default: mockConfig }))

		// configPath is available immediately
		expect(result.configPath).toBeDefined()

		// Resolve the ref
		await result.resolve()

		// Now name and config are available
		expect(result.name).toBe('test-worker')
		expect(result.config).toBe(mockConfig)
	})

	test('supports name override as first argument', async () => {
		const mockConfig = {
			name: 'original-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref('custom-worker', async () => ({ default: mockConfig }))

		await result.resolve()

		expect(result.name).toBe('custom-worker')
	})

	test('provides .worker accessor for service binding', async () => {
		const mockConfig = {
			name: 'math-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref(async () => ({ default: mockConfig }))

		// .worker is available immediately (lazy)
		const binding = result.worker
		expect(binding.__ref).toBe(result)

		// After resolution, service name is available
		await result.resolve()
		expect(binding.service).toBe('math-worker')
	})

	test('.worker can be called with entrypoint', async () => {
		const mockConfig = {
			name: 'math-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref(async () => ({ default: mockConfig }))
		await result.resolve()

		const binding = result.worker('MathService')
		expect(binding.service).toBe('math-worker')
		expect(binding.entrypoint).toBe('MathService')
		expect(binding.__ref).toBe(result)
	})

	test('handles direct export (no default)', async () => {
		const mockConfig = {
			name: 'direct-export-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref(async () => mockConfig)
		await result.resolve()

		expect(result.name).toBe('direct-export-worker')
	})

	test('worker.service returns name override before resolution', () => {
		const mockConfig = {
			name: 'original-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref('custom-worker', async () => ({ default: mockConfig }))

		// Before resolution, should use name override
		expect(result.worker.service).toBe('custom-worker')
	})

	test('worker() keeps the same ref instance for repeated access', async () => {
		const mockConfig = {
			name: 'math-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = ref(async () => ({ default: mockConfig }))
		const baseBinding = result.worker
		await result.resolve()

		expect(baseBinding.__ref).toBe(result)
		expect(baseBinding.service).toBe('math-worker')
		expect(result.worker.__ref).toBe(result)
	})

	test('extracts configPath from an arrow function with implicit import(...)', () => {
		// @ts-expect-error intentionally non-existent module for configPath extraction test
		const result = ref(() => import('./does-not-exist/devflare.config') as never)
		expect(result.configPath).toBe('./does-not-exist/devflare.config')
	})

	test('extracts configPath from a block-body function returning import(...)', () => {
		const result = ref(function load() {
			// @ts-expect-error intentionally non-existent module for configPath extraction test
			return import('./another-path/devflare.config') as never
		})
		expect(result.configPath).toBe('./another-path/devflare.config')
	})

	test('returns pending sentinel when the import function has no import(...) call', () => {
		const result = ref(async () => ({ default: { name: 'x' } }) as never)
		expect(result.configPath).toBe('<pending>')
	})

	test('throws a clear error when the import specifier is a dynamic template literal', () => {
		// Wrapping the template literal inside a factory prevents TypeScript/Bun
		// from constant-folding `segment` into a static string literal.
		const makeFn = (segment: string) => () => import(`./${segment}/devflare.config`) as never
		expect(() => ref(makeFn('foo')))
			.toThrow(/template literal with an embedded expression|static string literal/)
	})
})
