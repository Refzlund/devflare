import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCli } from '../../../src/cli'
import { listLocalSecrets, readLocalSecret } from '../../../src/secrets/local-secrets'

const tempDirs: string[] = []

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-secrets-cli-'))
	tempDirs.push(dir)
	return dir
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('secrets command', () => {
	test('stores a local Secrets Store value without printing the secret', async () => {
		const cwd = createTempDir()

		const result = await runCli(
			[
				'secrets',
				'--local',
				'--store',
				'store-123',
				'--name',
				'api-token',
				'--value',
				'local-secret'
			],
			{
				cwd,
				silent: true
			}
		)

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('store-123/api-token')
		expect(result.output).not.toContain('local-secret')
		expect(readLocalSecret({ cwd, storeId: 'store-123', name: 'api-token' })).toBe('local-secret')
	})

	test('lists and deletes local Secrets Store names without exposing values', async () => {
		const cwd = createTempDir()
		await runCli(
			[
				'secrets',
				'--local',
				'--store',
				'store-123',
				'--name',
				'api-token',
				'--value',
				'local-secret'
			],
			{
				cwd,
				silent: true
			}
		)

		const listResult = await runCli(['secrets', '--local', '--store', 'store-123', '--list'], {
			cwd,
			silent: true
		})
		expect(listResult.exitCode).toBe(0)
		expect(listResult.output).toContain('store-123/api-token')
		expect(listResult.output).not.toContain('local-secret')

		const deleteResult = await runCli(
			['secrets', '--local', '--store', 'store-123', '--name', 'api-token', '--delete'],
			{
				cwd,
				silent: true
			}
		)

		expect(deleteResult.exitCode).toBe(0)
		expect(deleteResult.output).toBe('store-123/api-token')
		expect(listLocalSecrets({ cwd, storeId: 'store-123' })).toEqual([])
	})
})
