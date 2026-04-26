import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	loadResolvedConfig,
	prepareConfigResourcesForDeploy
} from '../../../src/config'
import {
	resolveConfigForLocalRuntime,
	resolveConfigResources
} from '../../../src/config/resource-resolution'
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

	test('normalizes KV, D1, and Hyperdrive name bindings for local runtime without Cloudflare lookup', () => {
		const result = resolveConfigForLocalRuntime({
			...baseConfig,
			bindings: {
				kv: {
					CACHE: { name: 'cache-kv' },
					SESSIONS: { id: 'sessions-kv-id' },
					REPORTING_CACHE: 'reporting-cache-kv'
				},
				d1: {
					DB: { name: 'main-db' },
					AUDIT: { id: 'audit-db-id' },
					REPORTING: 'reporting-db'
				},
				hyperdrive: {
					POSTGRES: {
						name: 'devflare-testing',
						localConnectionString: 'postgres://user:pass@localhost:5432/app'
					},
					REPLICA: { id: 'replica-hyperdrive-id' },
					REPORTING_POSTGRES: 'reporting-postgres'
				}
			}
		})

		expect(result.bindings?.kv).toEqual({
			CACHE: { id: 'cache-kv' },
			SESSIONS: { id: 'sessions-kv-id' },
			REPORTING_CACHE: { id: 'reporting-cache-kv' }
		})
		expect(result.bindings?.d1).toEqual({
			DB: { id: 'main-db' },
			AUDIT: { id: 'audit-db-id' },
			REPORTING: { id: 'reporting-db' }
		})
		expect(result.bindings?.hyperdrive).toEqual({
			POSTGRES: {
				id: 'devflare-testing',
				localConnectionString: 'postgres://user:pass@localhost:5432/app'
			},
			REPLICA: { id: 'replica-hyperdrive-id' },
			REPORTING_POSTGRES: { id: 'reporting-postgres' }
		})
	})

	test('resolves KV, D1, and Hyperdrive name bindings using Cloudflare resource lookup', async () => {
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
			{ id: 'reporting-cache-kv-id', name: 'reporting-cache-kv' },
			{ id: 'sessions-kv-id', name: 'sessions-kv' }
		]))
		const listD1Databases = mock(async () => ([
			{ id: 'resolved-db-id', name: 'main-db' },
			{ id: 'analytics-db-id', name: 'analytics-db' },
			{ id: 'reporting-db-id', name: 'reporting-db' }
		]))
		const listHyperdrives = mock(async () => ([
			{ id: 'resolved-postgres-id', name: 'devflare-testing' },
			{ id: 'reporting-postgres-id', name: 'reporting-postgres' },
			{ id: 'replica-hyperdrive-id', name: 'replica-postgres' }
		]))

		const result = await resolveConfigResources({
			...baseConfig,
			bindings: {
				kv: {
					CACHE: { name: 'cache-kv' },
					REPORTING_CACHE: 'reporting-cache-kv',
					SESSIONS: { id: 'sessions-kv-id' }
				},
				d1: {
					DB: { name: 'main-db' },
					ANALYTICS: { id: 'analytics-db-id' },
					REPORTING: 'reporting-db'
				},
				hyperdrive: {
					POSTGRES: {
						name: 'devflare-testing',
						localConnectionString: 'postgres://user:pass@localhost:5432/app'
					},
					REPORTING_POSTGRES: 'reporting-postgres',
					REPLICA: { id: 'replica-hyperdrive-id' }
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
				listD1Databases,
				listHyperdrives
			}
		})

		expect(result.bindings?.kv).toEqual({
			CACHE: { id: 'resolved-cache-kv-id' },
			REPORTING_CACHE: { id: 'reporting-cache-kv-id' },
			SESSIONS: { id: 'sessions-kv-id' }
		})
		expect(result.bindings?.d1).toEqual({
			DB: { id: 'resolved-db-id' },
			ANALYTICS: { id: 'analytics-db-id' },
			REPORTING: { id: 'reporting-db-id' }
		})
		expect(result.bindings?.hyperdrive).toEqual({
			POSTGRES: {
				id: 'resolved-postgres-id',
				localConnectionString: 'postgres://user:pass@localhost:5432/app'
			},
			REPORTING_POSTGRES: { id: 'reporting-postgres-id' },
			REPLICA: { id: 'replica-hyperdrive-id' }
		})
		expect(result.bindings?.r2).toEqual({
			ASSETS: 'assets-bucket'
		})
		expect(getPrimaryAccount).toHaveBeenCalledTimes(1)
		expect(getEffectiveAccountId).toHaveBeenCalledWith('primary-account')
		expect(listKVNamespaces).toHaveBeenCalledWith('effective-account')
		expect(listD1Databases).toHaveBeenCalledWith('effective-account')
		expect(listHyperdrives).toHaveBeenCalledWith('effective-account')
	})

	test('prefers explicit accountId when resolving KV, D1, and Hyperdrive names', async () => {
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
		const listHyperdrives = mock(async (accountId: string) => {
			expect(accountId).toBe('config-account')
			return [{ id: 'resolved-postgres-id', name: 'devflare-testing' }]
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
				},
				hyperdrive: {
					POSTGRES: { name: 'devflare-testing' }
				}
			}
		}, {
			cloudflare: {
				getPrimaryAccount,
				listKVNamespaces,
				listD1Databases,
				listHyperdrives
			}
		})

		expect(result.bindings?.kv).toEqual({ CACHE: { id: 'resolved-cache-kv-id' } })
		expect(result.bindings?.d1).toEqual({ DB: { id: 'resolved-db-id' } })
		expect(result.bindings?.hyperdrive).toEqual({ POSTGRES: { id: 'resolved-postgres-id' } })
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

	test('throws a helpful error when a named Hyperdrive configuration cannot be found', async () => {
		await expect(resolveConfigResources({
			...baseConfig,
			bindings: {
				hyperdrive: {
					POSTGRES: { name: 'missing-hyperdrive' }
				}
			}
		}, {
			cloudflare: {
				getPrimaryAccount: async () => ({ id: 'primary-account', name: 'Primary', type: 'standard' }),
				getEffectiveAccountId: async () => ({ accountId: 'effective-account', source: 'workspace' as const }),
				listKVNamespaces: async () => [],
				listD1Databases: async () => [],
				listHyperdrives: async () => [{ id: 'resolved-postgres-id', name: 'devflare-testing' }]
			}
		})).rejects.toThrow('Could not find Hyperdrive configuration(s) for POSTGRES → missing-hyperdrive')
	})

	test('loads config from disk and resolves KV, D1, and Hyperdrive name bindings', async () => {
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
				hyperdrive: {
					POSTGRES: 'devflare-testing'
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
				listD1Databases: async () => [{ id: 'resolved-db-id', name: 'main-db' }],
				listHyperdrives: async () => [{ id: 'resolved-postgres-id', name: 'devflare-testing' }]
			}
		})

		expect(result.name).toBe('resolved-worker')
		expect(result.bindings?.kv).toEqual({ CACHE: { id: 'resolved-cache-kv-id' } })
		expect(result.bindings?.d1).toEqual({ DB: { id: 'resolved-db-id' } })
		expect(result.bindings?.hyperdrive).toEqual({ POSTGRES: { id: 'resolved-postgres-id' } })
		expect(result.bindings?.r2).toEqual({ ASSETS: 'assets-bucket' })
	})

	test('prepares deploy resources by provisioning missing KV and D1 names', async () => {
		const result = await prepareConfigResourcesForDeploy({
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
				listKVNamespaces: async () => [],
				createKVNamespace: async (_accountId, resourceName) => ({
					id: `kv-${resourceName}`,
					name: resourceName
				}),
				listD1Databases: async () => [],
				createD1Database: async (_accountId, resourceName) => ({
					id: `d1-${resourceName}`,
					name: resourceName,
					version: 'alpha'
				})
			}
		})

		expect(result.config.bindings?.kv).toEqual({
			CACHE: { id: 'kv-cache-kv' }
		})
		expect(result.config.bindings?.d1).toEqual({
			DB: { id: 'd1-main-db' }
		})
		expect(result.created.kv).toEqual(['cache-kv'])
		expect(result.created.d1).toEqual(['main-db'])
	})
})
