// =============================================================================
// Config Compiler Tests — Stream, VPC services/networks, and Flagship bindings
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
	describe('bindings', () => {
		test('compiles Stream binding from true shorthand and object form', () => {
			const shorthand = compileConfig({
				...baseConfig,
				bindings: {
					stream: { STREAM: true }
				}
			})

			expect(shorthand.stream).toEqual({ binding: 'STREAM' })

			const objectForm = compileConfig({
				...baseConfig,
				bindings: {
					stream: { STREAM: { remote: true } }
				}
			})

			expect(objectForm.stream).toEqual({ binding: 'STREAM', remote: true })
		})

		test('compiles VPC service bindings to vpc_services', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					vpcServices: {
						DB: { serviceId: 'service-uuid', remote: true },
						CACHE: { serviceId: 'cache-uuid' }
					}
				}
			})

			expect(result.vpc_services).toEqual([
				{ binding: 'DB', service_id: 'service-uuid', remote: true },
				{ binding: 'CACHE', service_id: 'cache-uuid' }
			])
		})

		test('compiles VPC network bindings to vpc_networks (tunnel_id / network_id)', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					vpcNetworks: {
						TUNNEL_NET: { tunnelId: 'tunnel-uuid' },
						ID_NET: { networkId: 'network-uuid', remote: true }
					}
				}
			})

			expect(result.vpc_networks).toEqual([
				{ binding: 'TUNNEL_NET', tunnel_id: 'tunnel-uuid' },
				{ binding: 'ID_NET', network_id: 'network-uuid', remote: true }
			])
		})

		test('compiles Flagship bindings to flagship (app_id)', () => {
			const result = compileConfig({
				...baseConfig,
				bindings: {
					flagship: {
						FLAGS: { appId: 'app-id', remote: true },
						EXPERIMENTS: { appId: 'experiments-id' }
					}
				}
			})

			expect(result.flagship).toEqual([
				{ binding: 'FLAGS', app_id: 'app-id', remote: true },
				{ binding: 'EXPERIMENTS', app_id: 'experiments-id' }
			])
		})
	})
})
