import { describe, expect, test } from 'bun:test'
import type { DevflareConfig } from '../../../src/config/schema'
import {
	collectReferencedServiceNames,
	ServiceBindingValidationError,
	validateServiceBindings
} from '../../../src/config/service-bindings-validation'

const fixtureWithServices: DevflareConfig = {
	name: 'caller-worker',
	compatibilityDate: '2025-01-07',
	compatibilityFlags: [],
	bindings: {
		services: {
			USER_API: { service: 'user-api' },
			PAYMENTS: { service: 'payments', environment: 'production' },
			SELF: { service: 'caller-worker' }
		}
	}
}

describe('collectReferencedServiceNames', () => {
	test('returns deduplicated target worker names', () => {
		const names = collectReferencedServiceNames({
			...fixtureWithServices,
			bindings: {
				services: {
					A: { service: 'shared' },
					B: { service: 'shared' },
					C: { service: 'other' }
				}
			}
		})
		expect(names.sort()).toEqual(['other', 'shared'])
	})

	test('returns [] for configs without service bindings', () => {
		expect(collectReferencedServiceNames({
			name: 'x',
			compatibilityDate: '2025-01-07',
			compatibilityFlags: []
		})).toEqual([])
	})
})

describe('validateServiceBindings', () => {
	test('passes when every referenced worker exists in the account', async () => {
		await validateServiceBindings(fixtureWithServices, 'acct', {
			listWorkers: async () => [
				{ name: 'user-api' },
				{ name: 'payments' },
				{ name: 'caller-worker' }
			],
			selfWorkerName: 'caller-worker'
		})
	})

	test('tolerates a missing self-reference (first-deploy)', async () => {
		await validateServiceBindings(fixtureWithServices, 'acct', {
			listWorkers: async () => [
				{ name: 'user-api' },
				{ name: 'payments' }
			],
			selfWorkerName: 'caller-worker'
		})
	})

	test('throws ServiceBindingValidationError listing every missing target', async () => {
		const promise = validateServiceBindings(fixtureWithServices, 'acct', {
			listWorkers: async () => [
				{ name: 'user-api' }
			],
			selfWorkerName: 'caller-worker'
		})
		await expect(promise).rejects.toBeInstanceOf(ServiceBindingValidationError)
		try {
			await promise
		} catch (error) {
			const err = error as ServiceBindingValidationError
			expect(err.missing).toEqual(['payments'])
			expect(err.message).toContain('payments')
			expect(err.message).toContain('acct')
		}
	})

	test('skips listing the account when there are no referenced services', async () => {
		let called = false
		await validateServiceBindings({
			name: 'x',
			compatibilityDate: '2025-01-07',
			compatibilityFlags: []
		}, 'acct', {
			listWorkers: async () => {
				called = true
				return []
			}
		})
		expect(called).toBe(false)
	})
})
