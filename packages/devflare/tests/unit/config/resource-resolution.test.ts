import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	loadResolvedConfig,
	resolveConfigForLocalRuntime,
	resolveConfigResources
} from '../../../src/config'
import type { DevflareConfig } from '../../../src/config/schema'

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('config resource resolution', () => {
	const baseConfig: DevflareConfig = {
		name: 'resource-worker',
		compatibilityDate: '2025-01-07',
		compatibilityFlags: []
	}

	test('normalizes KV and D1 name bindings for local runtime without Cloudflare lookup', () => {
		const result = resolveConfigForLocalRuntime({
			...baseConfig,
			bindings: {
				kv: {
					CACHE: { name: 'cache-kv' },
					SESSIONS: { id: 'sessions-kv-id' },
					LEGACY_CACHE: 'legacy-cache-kv'
				},
				d1: {
					DB: { name: 'main-db' },
					AUDIT: { id: 'audit-db-id' },
					LEGACY: 'legacy-db'
				}
			}
		})

		expect(result.bindings?.kv).toEqual({
			CACHE: { id: 'cache-kv' },
			SESSIONS: { id: 'sessions-kv-id' },
			LEGACY_CACHE: { id: 'legacy-cache-kv' }
		})
		expect(result.bindings?.d1).toEqual({
			DB: { id: 'main-db' },
			AUDIT: { id: 'audit-db-id' },
			LEGACY: { id: 'legacy-db' }
		})
	})

	test('resolves KV and D1 name bindings using Cloudflare resource lookup', async () => {
		const getPrimaryAccount = mock(async () => ({
			id: 'primary-account',
			name: 'Primary',
			type: 'standard'
		}))
		const getEffectiveAccountId = mock(async () => ({
			accountId: 'effective-account',
			source: 'workspace' as const
		}))
		const listKVNamespaces = mock(async () => ([
			{ id: 'resolved-cache-kv-id', name: 'cache-kv' },
			{ id: 'legacy-cache-kv-id', name: 'legacy-cache-kv' },
			{ id: 'sessions-kv-id', name: 'sessions-kv' }
		]))
		const listD1Databases = mock(async () => ([
			{ id: 'resolved-db-id', name: 'main-db' },
			{ id: 'analytics-db-id', name: 'analytics-db' },
			{ id: 'legacy-db-id', name: 'legacy-db' }
		]))

		const result = await resolveConfigResources({
			...baseConfig,
			bindings: {
				kv: {
					CACHE: { name: 'cache-kv' },
					LEGACY_CACHE: 'legacy-cache-kv',
					SESSIONS: { id: 'sessions-kv-id' }
				},
				d1: {
					DB: { name: 'main-db' },
					ANALYTICS: { id: 'analytics-db-id' },
					LEGACY: 'legacy-db'
				},
				r2: {
					ASSETS: 'assets-bucket'
				}
			}
		}, {
			cloudflare: {
				getPrimaryAccount,
				getEffectiveAccountId,
				listKVNamespaces,
				listD1Databases
			}
		})

		expect(result.bindings?.kv).toEqual({
			CACHE: { id: 'resolved-cache-kv-id' },
			LEGACY_CACHE: { id: 'legacy-cache-kv-id' },
			SESSIONS: { id: 'sessions-kv-id' }
		})
		expect(result.bindings?.d1).toEqual({
			DB: { id: 'resolved-db-id' },
			ANALYTICS: { id: 'analytics-db-id' },
			LEGACY: { id: 'legacy-db-id' }
		})
		expect(result.bindings?.r2).toEqual({
			ASSETS: 'assets-bucket'
		})
		expect(getPrimaryAccount).toHaveBeenCalledTimes(1)
		expect(getEffectiveAccountId).toHaveBeenCalledWith('primary-account')
		expect(listKVNamespaces).toHaveBeenCalledWith('effective-account')
		expect(listD1Databases).toHaveBeenCalledWith('effective-account')
	})

	test('prefers explicit accountId when resolving KV and D1 names', async () => {
		const getPrimaryAccount = mock(async () => {
			throw new Error('should not need primary account lookup')
		})
		const listKVNamespaces = mock(async (accountId: string) => {
			expect(accountId).toBe('config-account')
			return [{ id: 'resolved-cache-kv-id', name: 'cache-kv' }]
		})
		const listD1Databases = mock(async (accountId: string) => {
			expect(accountId).toBe('config-account')
			return [{ id: 'resolved-db-id', name: 'main-db' }]
		})

		const result = await resolveConfigResources({
			...baseConfig,
			accountId: 'config-account',
			bindings: {
				kv: {
					CACHE: { name: 'cache-kv' }
				},
				d1: {
					DB: { name: 'main-db' }
				}
			}
		}, {
			cloudflare: {
				getPrimaryAccount,
				listKVNamespaces,
				listD1Databases
			}
		})

		expect(result.bindings?.kv).toEqual({ CACHE: { id: 'resolved-cache-kv-id' } })
		expect(result.bindings?.d1).toEqual({ DB: { id: 'resolved-db-id' } })
		expect(getPrimaryAccount).not.toHaveBeenCalled()
	})

	test('throws a helpful error when a named KV namespace cannot be found', async () => {
		await expect(resolveConfigResources({
			...baseConfig,
			bindings: {
				kv: {
					CACHE: { name: 'missing-cache-kv' }
				}
			}
		}, {
			cloudflare: {
				getPrimaryAccount: async () => ({ id: 'primary-account', name: 'Primary', type: 'standard' }),
				getEffectiveAccountId: async () => ({ accountId: 'effective-account', source: 'workspace' as const }),
				listKVNamespaces: async () => [{ id: 'resolved-cache-kv-id', name: 'cache-kv' }],
				listD1Databases: async () => []
			}
		})).rejects.toThrow('Could not find KV namespace(s) for CACHE → missing-cache-kv')
	})

	test('throws a helpful error when a named D1 database cannot be found', async () => {
		await expect(resolveConfigResources({
			...baseConfig,
			bindings: {
				d1: {
					DB: { name: 'missing-db' }
				}
			}
		}, {
			cloudflare: {
				getPrimaryAccount: async () => ({ id: 'primary-account', name: 'Primary', type: 'standard' }),
				getEffectiveAccountId: async () => ({ accountId: 'effective-account', source: 'workspace' as const }),
				listD1Databases: async () => [{ id: 'resolved-db-id', name: 'main-db' }]
			}
		})).rejects.toThrow('Could not find D1 database(s) for DB → missing-db')
	})

	test('loads config from disk and resolves KV and D1 name bindings', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-resolved-config-'))
		tempDirs.push(projectDir)

		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'resolved-worker',
	compatibilityDate: '2025-01-07',
	bindings: {
		kv: {
			CACHE: { name: 'cache-kv' }
		},
		d1: {
			DB: { name: 'main-db' }
		},
		r2: {
			ASSETS: 'assets-bucket'
		}
	}
}
		`.trim())

		const result = await loadResolvedConfig({
			cwd: projectDir,
			cloudflare: {
				getPrimaryAccount: async () => ({ id: 'primary-account', name: 'Primary', type: 'standard' }),
				getEffectiveAccountId: async () => ({ accountId: 'effective-account', source: 'workspace' as const }),
				listKVNamespaces: async () => [{ id: 'resolved-cache-kv-id', name: 'cache-kv' }],
				listD1Databases: async () => [{ id: 'resolved-db-id', name: 'main-db' }]
			}
		})

		expect(result.name).toBe('resolved-worker')
		expect(result.bindings?.kv).toEqual({ CACHE: { id: 'resolved-cache-kv-id' } })
		expect(result.bindings?.d1).toEqual({ DB: { id: 'resolved-db-id' } })
		expect(result.bindings?.r2).toEqual({ ASSETS: 'assets-bucket' })
	})
})