// =============================================================================
// ref() Cross-Config Reference Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { ref, resolveRef, serviceBinding } from '../../../src/config/ref'

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
})

describe('resolveRef (deprecated)', () => {
	test('resolves config with name', async () => {
		const mockConfig = {
			name: 'test-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = await resolveRef(async () => ({ default: mockConfig }))

		expect(result.name).toBe('test-worker')
		expect(result.config).toBe(mockConfig)
	})

	test('respects workerName override', async () => {
		const mockConfig = {
			name: 'original-worker',
			compatibilityDate: '2025-01-07'
		}

		const result = await resolveRef(
			async () => ({ default: mockConfig }),
			{ workerName: 'custom-worker' }
		)

		expect(result.name).toBe('custom-worker')
	})
})

describe('serviceBinding (deprecated)', () => {
	test('creates service binding from ref result', async () => {
		const mockConfig = {
			name: 'math-worker',
			compatibilityDate: '2025-01-07'
		}

		const refResult = ref(async () => ({ default: mockConfig }))
		await refResult.resolve()

		const binding = serviceBinding(refResult)

		expect(binding.service).toBe('math-worker')
		expect(binding.__ref).toBeDefined()
	})

	test('handles entrypoint via options', async () => {
		const mockConfig = {
			name: 'math-worker',
			compatibilityDate: '2025-01-07'
		}

		const refResult = ref(async () => ({ default: mockConfig }))
		await refResult.resolve()

		const binding = serviceBinding(refResult, { entrypoint: 'MathService' })

		expect(binding.service).toBe('math-worker')
		expect(binding.entrypoint).toBe('MathService')
	})
})
