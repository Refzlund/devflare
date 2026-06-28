// =============================================================================
// Cross-phase resolver contract tests (F22 prerequisite)
//
// These tests pin the *current* resolution behavior of the same DevflareConfig
// across the three lifecycle consumers that today own duplicated resource
// resolution code:
//
//   * Build phase  — `compileBuildConfig()` (preserves name-based bindings)
//   * Dev / Vite   — `resolveConfigForLocalRuntime()` + `compileConfig()`
//                    (no Cloudflare lookup; uses local stable identifiers)
//   * Deploy phase — `prepareConfigResourcesForDeploy()` + `compileConfig()`
//                    (resolves or provisions concrete Cloudflare ids)
//
// Their behaviors are intentionally different per phase, but the *shape* of
// the result and the *invariants* must remain consistent for the same input.
// This file is the regression gate for any future shared `resolveResources()`
// extraction that unifies the three consumers (REMAINING.md F22 step 2).
// =============================================================================

import { describe, expect, mock, test } from 'bun:test'
import {
	compileBuildConfig,
	compileConfig,
	prepareConfigResourcesForDeploy
} from '../../../src/config'
import { brandAsDeployConfig } from '../../../src/config/resolve-phased'
import { resolveConfigForLocalRuntime } from '../../../src/config/resource-resolution'
import type { DevflareConfig } from '../../../src/config/schema'

const baseFixture: DevflareConfig = {
	name: 'cross-phase-worker',
	compatibilityDate: '2025-01-07',
	compatibilityFlags: [],
	bindings: {
		kv: {
			CACHE: { name: 'cache-kv' },
			SESSIONS: { id: 'sessions-kv-id' }
		},
		d1: {
			DB: { name: 'main-db' },
			AUDIT: { id: 'audit-db-id' }
		},
		hyperdrive: {
			POSTGRES: { name: 'devflare-postgres' }
		}
	}
}

const cloudflareMocks = () => ({
	getPrimaryAccount: mock(async () => ({
		id: 'primary-account',
		name: 'Primary',
		type: 'standard'
	})),
	getEffectiveAccountId: mock(async () => ({
		accountId: 'effective-account',
		source: 'workspace' as const
	})),
	listKVNamespaces: mock(async () => [{ id: 'resolved-cache-kv-id', name: 'cache-kv' }]),
	createKVNamespace: mock(async (_account: string, name: string) => ({
		id: `created-${name}-id`,
		name
	})),
	listD1Databases: mock(async () => [{ id: 'resolved-main-db-id', name: 'main-db' }]),
	createD1Database: mock(async (_account: string, name: string) => ({
		id: `created-${name}-id`,
		name
	})),
	listR2Buckets: mock(async () => []),
	createR2Bucket: mock(async (_account: string, name: string) => ({
		name,
		createdOn: new Date('2026-04-26T00:00:00.000Z')
	})),
	listQueues: mock(async () => []),
	createQueue: mock(async (_account: string, name: string) => ({
		id: `queue-${name}`,
		name
	})),
	listHyperdrives: mock(async () => [{ id: 'resolved-postgres-id', name: 'devflare-postgres' }]),
	listVectorizeIndexes: mock(async () => [])
})

describe('cross-phase resolver contract', () => {
	test('build phase preserves name-based KV/D1/Hyperdrive bindings as Wrangler "name" entries', () => {
		const wranglerConfig = compileBuildConfig(baseFixture)

		expect(wranglerConfig.kv_namespaces).toEqual([
			{ binding: 'CACHE', name: 'cache-kv' },
			{ binding: 'SESSIONS', id: 'sessions-kv-id' }
		])
		expect(wranglerConfig.d1_databases).toEqual([
			{ binding: 'DB', database_name: 'main-db' },
			{ binding: 'AUDIT', database_id: 'audit-db-id' }
		])
		expect(wranglerConfig.hyperdrive).toEqual([{ binding: 'POSTGRES', name: 'devflare-postgres' }])
	})

	test('dev/vite path uses local stable identifiers without Cloudflare lookup', () => {
		const resolvedConfig = resolveConfigForLocalRuntime(baseFixture)
		const wranglerConfig = compileConfig(resolvedConfig)

		// Local runtime collapses both name- and id-based bindings to a stable
		// local identifier, so Miniflare/workerd can use them without auth.
		expect(wranglerConfig.kv_namespaces).toEqual([
			{ binding: 'CACHE', id: 'cache-kv' },
			{ binding: 'SESSIONS', id: 'sessions-kv-id' }
		])
		expect(wranglerConfig.d1_databases).toEqual([
			{ binding: 'DB', database_id: 'main-db' },
			{ binding: 'AUDIT', database_id: 'audit-db-id' }
		])
		expect(wranglerConfig.hyperdrive).toEqual([{ binding: 'POSTGRES', id: 'devflare-postgres' }])
	})

	test('deploy phase resolves name bindings to the verified Cloudflare ids returned by the API', async () => {
		const cloudflare = cloudflareMocks()
		const result = await prepareConfigResourcesForDeploy(baseFixture, { cloudflare })

		expect(result.config.bindings?.kv).toEqual({
			CACHE: { id: 'resolved-cache-kv-id' },
			SESSIONS: { id: 'sessions-kv-id' }
		})
		expect(result.config.bindings?.d1).toEqual({
			DB: { id: 'resolved-main-db-id' },
			AUDIT: { id: 'audit-db-id' }
		})
		expect(result.config.bindings?.hyperdrive).toEqual({
			POSTGRES: { id: 'resolved-postgres-id' }
		})

		// Cloudflare lookups are only invoked for bindings that need them.
		expect(cloudflare.listKVNamespaces).toHaveBeenCalledTimes(1)
		expect(cloudflare.listD1Databases).toHaveBeenCalledTimes(1)
		expect(cloudflare.listHyperdrives).toHaveBeenCalledTimes(1)
		// No new resources were created in this fixture.
		expect(cloudflare.createKVNamespace).toHaveBeenCalledTimes(0)
		expect(cloudflare.createD1Database).toHaveBeenCalledTimes(0)
	})

	test('binding key set is identical across all three phases for the same input', () => {
		const buildResult = compileBuildConfig(baseFixture)
		const devResult = compileConfig(resolveConfigForLocalRuntime(baseFixture))

		const buildBindingNames = new Set([
			...(buildResult.kv_namespaces ?? []).map((entry) => entry.binding),
			...(buildResult.d1_databases ?? []).map((entry) => entry.binding),
			...(buildResult.hyperdrive ?? []).map((entry) => entry.binding)
		])
		const devBindingNames = new Set([
			...(devResult.kv_namespaces ?? []).map((entry) => entry.binding),
			...(devResult.d1_databases ?? []).map((entry) => entry.binding),
			...(devResult.hyperdrive ?? []).map((entry) => entry.binding)
		])

		expect([...buildBindingNames].sort()).toEqual([...devBindingNames].sort())
		expect([...buildBindingNames].sort()).toEqual(['AUDIT', 'CACHE', 'DB', 'POSTGRES', 'SESSIONS'])
	})

	test('binding key set across deploy phase matches build/dev phase for the same input', async () => {
		const cloudflare = cloudflareMocks()
		const deployResult = await prepareConfigResourcesForDeploy(baseFixture, { cloudflare })
		const deployWranglerConfig = compileConfig(brandAsDeployConfig(deployResult.config))

		const deployBindingNames = new Set([
			...(deployWranglerConfig.kv_namespaces ?? []).map((entry) => entry.binding),
			...(deployWranglerConfig.d1_databases ?? []).map((entry) => entry.binding),
			...(deployWranglerConfig.hyperdrive ?? []).map((entry) => entry.binding)
		])

		expect([...deployBindingNames].sort()).toEqual(['AUDIT', 'CACHE', 'DB', 'POSTGRES', 'SESSIONS'])
	})

	test('build phase rejects name-only bindings if invoked through compileConfig (the non-build entrypoint)', () => {
		// compileConfig() requires resolved ids and must throw on name-only
		// bindings. This invariant is what lets the dev path safely call
		// resolveConfigForLocalRuntime() first to materialize ids, and what
		// blocks accidental misuse in callers that should be using
		// compileBuildConfig() instead.
		expect(() => compileConfig(baseFixture as never)).toThrow(
			/must be resolved before compiling Wrangler config/
		)
	})

	test('environment overrides apply consistently across all three phases', () => {
		const fixtureWithEnv: DevflareConfig = {
			...baseFixture,
			env: {
				production: {
					bindings: {
						kv: {
							CACHE: { name: 'cache-kv-prod' }
						}
					}
				}
			}
		}

		const buildResult = compileBuildConfig(fixtureWithEnv, 'production')
		const devResult = compileConfig(resolveConfigForLocalRuntime(fixtureWithEnv, 'production'))

		const buildCacheBinding = buildResult.kv_namespaces?.find((entry) => entry.binding === 'CACHE')
		const devCacheBinding = devResult.kv_namespaces?.find((entry) => entry.binding === 'CACHE')

		// Build path keeps the environment-scoped name; dev path collapses to
		// the same name as a local id. Both must pick up the override.
		expect(buildCacheBinding).toEqual({ binding: 'CACHE', name: 'cache-kv-prod' })
		expect(devCacheBinding).toEqual({ binding: 'CACHE', id: 'cache-kv-prod' })
	})

	test('configs without any name-based bindings round-trip cleanly through every phase', async () => {
		const idOnlyFixture: DevflareConfig = {
			...baseFixture,
			bindings: {
				kv: { CACHE: { id: 'cache-kv-id' } },
				d1: { DB: { id: 'db-id' } }
			}
		}

		const buildResult = compileBuildConfig(idOnlyFixture)
		const devResult = compileConfig(resolveConfigForLocalRuntime(idOnlyFixture))

		const cloudflare = cloudflareMocks()
		const deployResult = await prepareConfigResourcesForDeploy(idOnlyFixture, { cloudflare })

		// All three phases produce identical id-shaped Wrangler bindings, and
		// the deploy phase makes no Cloudflare calls because nothing needs
		// resolving.
		expect(buildResult.kv_namespaces).toEqual([{ binding: 'CACHE', id: 'cache-kv-id' }])
		expect(devResult.kv_namespaces).toEqual([{ binding: 'CACHE', id: 'cache-kv-id' }])
		expect(deployResult.config.bindings?.kv).toEqual({ CACHE: { id: 'cache-kv-id' } })

		expect(cloudflare.listKVNamespaces).toHaveBeenCalledTimes(0)
		expect(cloudflare.listD1Databases).toHaveBeenCalledTimes(0)
		expect(cloudflare.listHyperdrives).toHaveBeenCalledTimes(0)
	})
})
