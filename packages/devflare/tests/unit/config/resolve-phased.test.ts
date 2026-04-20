// =============================================================================
// Phase-discriminated resolver facade contract (R1 step 1)
// =============================================================================
// Pins the behaviour of `resolveResources({ phase })` against the legacy
// per-phase helpers it delegates to. Subsequent R1 steps collapse the
// duplicated internals; this suite is the regression gate that guarantees
// the collapse is behaviour-preserving.
// =============================================================================

import { describe, expect, mock, test } from 'bun:test'
import {
	compileBuildConfig,
	compileConfig,
	resolveConfigForLocalRuntime,
	resolveResources
} from '../../../src/config'
import type { DevflareConfig } from '../../../src/config/schema'

const baseFixture: DevflareConfig = {
	name: 'phased-worker',
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
	listKVNamespaces: mock(async () => ([
		{ id: 'resolved-cache-kv-id', name: 'cache-kv' }
	])),
	createKVNamespace: mock(async (_account: string, name: string) => ({
		id: `created-${name}-id`,
		name
	})),
	listD1Databases: mock(async () => ([
		{ id: 'resolved-main-db-id', name: 'main-db' }
	])),
	createD1Database: mock(async (_account: string, name: string) => ({
		id: `created-${name}-id`,
		name
	})),
	listR2Buckets: mock(async () => []),
	createR2Bucket: mock(async (_account: string, name: string) => ({ name })),
	listQueues: mock(async () => []),
	createQueue: mock(async (_account: string, name: string) => ({
		id: `queue-${name}`,
		name
	})),
	listHyperdrives: mock(async () => ([
		{ id: 'resolved-postgres-id', name: 'devflare-postgres' }
	])),
	listVectorizeIndexes: mock(async () => [])
})

describe('resolveResources facade', () => {
	test('phase=build returns the env-merged source config (names preserved)', async () => {
		const built = await resolveResources(baseFixture, { phase: 'build' })
		// Names remain symbolic; ids remain as provided.
		expect(built.bindings?.kv).toEqual({
			CACHE: { name: 'cache-kv' },
			SESSIONS: { id: 'sessions-kv-id' }
		})
		// Compiling as a build artefact yields the same shape as the legacy helper.
		expect(compileBuildConfig(built).kv_namespaces).toEqual(
			compileBuildConfig(baseFixture).kv_namespaces
		)
	})

	test('phase=local materialises name-based bindings into stable local identifiers', async () => {
		const local = await resolveResources(baseFixture, { phase: 'local' })
		const wrangler = compileConfig(local)
		const legacy = compileConfig(resolveConfigForLocalRuntime(baseFixture))
		expect(wrangler.kv_namespaces).toEqual(legacy.kv_namespaces)
		expect(wrangler.d1_databases).toEqual(legacy.d1_databases)
		expect(wrangler.hyperdrive).toEqual(legacy.hyperdrive)
	})

	test('phase=deploy without provision routes through read-only materialization', async () => {
		const cloudflare = cloudflareMocks()
		const resolved = await resolveResources(baseFixture, {
			phase: 'deploy',
			cloudflare
		})

		// Same ids as the legacy materialization helper on the same mocks.
		expect(resolved.bindings?.kv).toEqual({
			CACHE: { id: 'resolved-cache-kv-id' },
			SESSIONS: { id: 'sessions-kv-id' }
		})
		expect(resolved.bindings?.d1).toEqual({
			DB: { id: 'resolved-main-db-id' },
			AUDIT: { id: 'audit-db-id' }
		})
		expect(resolved.bindings?.hyperdrive).toEqual({
			POSTGRES: { id: 'resolved-postgres-id' }
		})
		// No create calls happened on the read-only path.
		expect(cloudflare.createKVNamespace).toHaveBeenCalledTimes(0)
		expect(cloudflare.createD1Database).toHaveBeenCalledTimes(0)
	})

	test('environment overrides apply before phase resolution', async () => {
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

		const built = await resolveResources(fixtureWithEnv, {
			phase: 'build',
			environment: 'production'
		})
		expect((built.bindings?.kv as Record<string, { name?: string; id?: string }> | undefined)?.CACHE).toEqual({
			name: 'cache-kv-prod'
		})
	})
})
