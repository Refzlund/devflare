// =============================================================================
// Config Compiler Tests — CF-9 binding sub-field coverage
// =============================================================================

import { describe, expect, test } from 'bun:test'

import { compileConfig } from '../../../../src/config/compiler'

import { brandAsLocalConfig } from '../../../../src/config/resolve-phased'

import type { DevflareConfig } from '../../../../src/config/schema'

const baseConfig = brandAsLocalConfig({
	name: 'my-worker',
	compatibilityDate: '2025-01-07',
	compatibilityFlags: []
} satisfies DevflareConfig)

describe('compileConfig', () => {
	describe('CF-9 binding sub-fields', () => {
		test('compiles queue consumer visibility_timeout_ms', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					queues: {
						consumers: [{ queue: 'my-queue', visibilityTimeoutMs: 30000 }]
					}
				}
			})

			expect(result.queues?.consumers).toEqual([
				{ queue: 'my-queue', visibility_timeout_ms: 30000 }
			])
		})

		test('compiles queue producer delivery_delay', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					queues: {
						producers: { JOBS: { queue: 'jobs-queue', deliveryDelay: 60 } }
					}
				}
			})

			expect(result.queues?.producers).toEqual([
				{ binding: 'JOBS', queue: 'jobs-queue', delivery_delay: 60 }
			])
		})

		test('compiles sendEmail remote flag', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					sendEmail: {
						EMAIL: { destinationAddress: 'admin@example.com', remote: true }
					}
				}
			})

			expect(result.send_email).toEqual([
				{ name: 'EMAIL', destination_address: 'admin@example.com', remote: true }
			])
		})

		test('compiles service binding props', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					services: {
						AUTH: { service: 'auth-worker', props: { tier: 'gold' } }
					}
				}
			})

			expect(result.services).toEqual([
				{ binding: 'AUTH', service: 'auth-worker', props: { tier: 'gold' } }
			])
		})
	})

	describe('CF-19/CF-21 per-binding environment', () => {
		test('compiles a cross-worker Durable Object binding with environment', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: {
							className: 'Counter',
							scriptName: 'other-worker',
							environment: 'production'
						}
					}
				}
			})

			expect(result.durable_objects?.bindings).toEqual([
				{
					name: 'COUNTER',
					class_name: 'Counter',
					script_name: 'other-worker',
					environment: 'production'
				}
			])
		})

		test('drops environment on a local Durable Object binding (no script_name)', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					durableObjects: {
						COUNTER: { className: 'Counter', environment: 'production' }
					}
				}
			})

			// environment is only valid alongside script_name (cross-worker); a
			// local DO must not emit it.
			expect(result.durable_objects?.bindings).toEqual([{ name: 'COUNTER', class_name: 'Counter' }])
		})

		test('folds a service binding environment into the service name', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					services: {
						AUTH: { service: 'auth-worker', environment: 'staging' }
					}
				}
			})

			// wrangler addresses an environment via the service name; no separate field.
			expect(result.services).toEqual([{ binding: 'AUTH', service: 'auth-worker-staging' }])
		})
	})
})
