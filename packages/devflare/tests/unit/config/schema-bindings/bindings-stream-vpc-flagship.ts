// =============================================================================
// Config Schema Binding Tests — Stream, VPC services/networks, and Flagship
// =============================================================================

import { describe, expect, test } from 'bun:test'

import { configSchema } from '../../../../src/config/schema'

describe('schema validation', () => {
	describe('bindings', () => {
		test('accepts one Stream binding with true shorthand and remote object form', () => {
			const trueForm = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					stream: { STREAM: true }
				}
			})

			expect(trueForm.success).toBe(true)
			if (trueForm.success) {
				expect(trueForm.data.bindings?.stream?.STREAM).toBe(true)
			}

			const objectForm = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					stream: { STREAM: { remote: true } }
				}
			})

			expect(objectForm.success).toBe(true)
			if (objectForm.success) {
				expect(objectForm.data.bindings?.stream?.STREAM).toEqual({ remote: true })
			}
		})

		test('rejects multiple Stream bindings until Wrangler supports them', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					stream: {
						STREAM: true,
						OTHER_STREAM: true
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts VPC service bindings with serviceId and remote', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					vpcServices: {
						DB: { serviceId: 'service-uuid', remote: true }
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.vpcServices?.DB).toEqual({
					serviceId: 'service-uuid',
					remote: true
				})
			}
		})

		test('rejects VPC service bindings without serviceId', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					vpcServices: {
						DB: { remote: true }
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts VPC network bindings by tunnelId or networkId', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					vpcNetworks: {
						TUNNEL_NET: { tunnelId: 'tunnel-uuid' },
						ID_NET: { networkId: 'network-uuid', remote: true }
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.vpcNetworks?.TUNNEL_NET).toEqual({
					tunnelId: 'tunnel-uuid'
				})
				expect(result.data.bindings?.vpcNetworks?.ID_NET).toEqual({
					networkId: 'network-uuid',
					remote: true
				})
			}
		})

		test('rejects VPC network bindings that mix tunnelId and networkId', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					vpcNetworks: {
						NET: { tunnelId: 'tunnel-uuid', networkId: 'network-uuid' }
					}
				}
			})

			expect(result.success).toBe(false)
		})

		test('accepts Flagship bindings with appId and remote', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					flagship: {
						FLAGS: { appId: 'app-id', remote: true }
					}
				}
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.bindings?.flagship?.FLAGS).toEqual({
					appId: 'app-id',
					remote: true
				})
			}
		})

		test('rejects Flagship bindings without appId', () => {
			const result = configSchema.safeParse({
				name: 'my-worker',
				compatibilityDate: '2026-04-26',
				bindings: {
					flagship: {
						FLAGS: { remote: true }
					}
				}
			})

			expect(result.success).toBe(false)
		})
	})
})
