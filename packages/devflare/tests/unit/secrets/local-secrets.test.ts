import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'

import {
	deleteLocalSecret,
	listLocalSecrets,
	readLocalSecret,
	resolveLocalSecretValuesForBindings,
	seedMiniflareLocalSecrets,
	writeLocalSecret
} from '../../../src/secrets/local-secrets'
import type { DevflareConfig } from '../../../src/config'
import { startMiniflareFromConfig } from '../../../src/bridge/miniflare'

const tempDirs: string[] = []

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-local-secrets-'))
	tempDirs.push(dir)
	return dir
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('local Secrets Store file', () => {
	test('writes, reads, lists, and deletes local secrets by store id and name', () => {
		const cwd = createTempDir()

		writeLocalSecret({ cwd, storeId: 'store-123', name: 'api-token', value: 'local-secret' })

		expect(readLocalSecret({ cwd, storeId: 'store-123', name: 'api-token' })).toBe('local-secret')
		expect(listLocalSecrets({ cwd, storeId: 'store-123' })).toEqual([
			{
				storeId: 'store-123',
				name: 'api-token',
				hasValue: true,
				updatedAt: expect.any(String)
			}
		])

		expect(deleteLocalSecret({ cwd, storeId: 'store-123', name: 'api-token' })).toBe(true)
		expect(readLocalSecret({ cwd, storeId: 'store-123', name: 'api-token' })).toBeUndefined()
	})

	test('resolves configured Secrets Store bindings from the local store without exposing values in config', () => {
		const cwd = createTempDir()
		writeLocalSecret({ cwd, storeId: 'store-123', name: 'api-token', value: 'local-secret' })
		writeLocalSecret({ cwd, storeId: 'store-admin', name: 'admin-token', value: 'admin-secret' })

		const config = {
			name: 'secret-worker',
			compatibilityDate: '2026-04-27',
			compatibilityFlags: [],
			secretsStoreId: 'store-123',
			bindings: {
				secretsStore: {
					API_TOKEN: 'api-token',
					ADMIN_TOKEN: {
						storeId: 'store-admin',
						secretName: 'admin-token'
					}
				}
			}
		} satisfies DevflareConfig

		expect(resolveLocalSecretValuesForBindings(config, cwd)).toEqual({
			API_TOKEN: 'local-secret',
			ADMIN_TOKEN: 'admin-secret'
		})
	})

	test('seeds Miniflare Secrets Store admin APIs from local values', async () => {
		const cwd = createTempDir()
		const created: string[] = []
		writeLocalSecret({ cwd, storeId: 'store-123', name: 'api-token', value: 'local-secret' })

		const config = {
			name: 'secret-worker',
			compatibilityDate: '2026-04-27',
			compatibilityFlags: [],
			secretsStoreId: 'store-123',
			bindings: {
				secretsStore: {
					API_TOKEN: 'api-token'
				}
			}
		} satisfies DevflareConfig

		await seedMiniflareLocalSecrets(
			{
				async getSecretsStoreSecretAPI(bindingName: string) {
					expect(bindingName).toBe('API_TOKEN')
					return {
						async create(value: string) {
							created.push(value)
							return 'secret-id'
						}
					}
				}
			},
			config,
			cwd
		)

		expect(created).toEqual(['local-secret'])
	})

	test('seeds an actual Miniflare Secrets Store binding from local values', async () => {
		const cwd = createTempDir()
		writeLocalSecret({ cwd, storeId: 'store-123', name: 'api-token', value: 'local-secret' })

		const config = {
			name: 'secret-worker',
			compatibilityDate: '2026-04-27',
			compatibilityFlags: [],
			secretsStoreId: 'store-123',
			bindings: {
				secretsStore: {
					API_TOKEN: 'api-token'
				}
			}
		} satisfies DevflareConfig

		const instance = await startMiniflareFromConfig(config, { cwd, port: 0 })
		try {
			const bindings = await instance.getBindings()
			expect(await (bindings.API_TOKEN as SecretsStoreSecret).get()).toBe('local-secret')
		} finally {
			await instance.dispose()
		}
	})
})
