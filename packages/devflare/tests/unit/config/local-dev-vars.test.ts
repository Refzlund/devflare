import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
	applyLocalDevVarsToConfig,
	loadLocalDevVars,
	toWranglerSecretsConfig
} from '../../../src/config/local-dev-vars'
import type { DevflareConfig } from '../../../src/config/schema'

const tempDirs: string[] = []

function makeTempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-local-vars-'))
	tempDirs.push(dir)
	writeFileSync(join(dir, 'devflare.config.ts'), 'export default {}')
	return dir
}

function writeProjectFile(dir: string, name: string, contents: string): void {
	writeFileSync(join(dir, name), contents)
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop()
		if (dir) {
			rmSync(dir, { recursive: true, force: true })
		}
	}
})

describe('loadLocalDevVars', () => {
	test('loads .dev.vars ahead of .env and lets local values override config vars', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.dev.vars', [
			'SHARED=from-dev-vars',
			'LOCAL_ONLY=secret'
		].join('\n'))
		writeProjectFile(cwd, '.env', [
			'LOCAL_ONLY=from-env',
			'ENV_ONLY=ignored'
		].join('\n'))

		const vars = await loadLocalDevVars({
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			vars: {
				SHARED: 'from-config',
				CONFIG_ONLY: 'plain'
			}
		})

		expect(vars).toEqual({
			SHARED: 'from-dev-vars',
			CONFIG_ONLY: 'plain',
			LOCAL_ONLY: 'secret'
		})
	})

	test('uses environment-specific .dev.vars without merging generic .dev.vars', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.dev.vars', [
			'SHARED=generic',
			'GENERIC_ONLY=yes'
		].join('\n'))
		writeProjectFile(cwd, '.dev.vars.staging', [
			'SHARED=staging',
			'STAGING_ONLY=yes'
		].join('\n'))

		const vars = await loadLocalDevVars({
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			environment: 'staging'
		})

		expect(vars).toEqual({
			SHARED: 'staging',
			STAGING_ONLY: 'yes'
		})
	})

	test('merges .env files and lets the most specific environment file win', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env', [
			'SHARED=base',
			'BASE_ONLY=yes'
		].join('\n'))
		writeProjectFile(cwd, '.env.local', [
			'LOCAL_ONLY=yes'
		].join('\n'))
		writeProjectFile(cwd, '.env.staging', [
			'ENV_ONLY=yes'
		].join('\n'))
		writeProjectFile(cwd, '.env.staging.local', [
			'SHARED=staging-local',
			'STAGING_LOCAL_ONLY=yes'
		].join('\n'))

		const vars = await loadLocalDevVars({
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			environment: 'staging'
		})

		expect(vars).toEqual({
			SHARED: 'staging-local',
			BASE_ONLY: 'yes',
			LOCAL_ONLY: 'yes',
			ENV_ONLY: 'yes',
			STAGING_LOCAL_ONLY: 'yes'
		})
	})

	test('filters local secret files to required secret declarations when configured', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.dev.vars', [
			'API_TOKEN=secret',
			'EXTRA_SECRET=ignored'
		].join('\n'))

		const vars = await loadLocalDevVars({
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			vars: {
				PUBLIC_FLAG: 'on'
			},
			secrets: {
				API_TOKEN: { required: true }
			}
		})

		expect(vars).toEqual({
			PUBLIC_FLAG: 'on',
			API_TOKEN: 'secret'
		})
	})
})

describe('toWranglerSecretsConfig', () => {
	test('converts Devflare secret declarations into Wrangler required secret names', () => {
		expect(toWranglerSecretsConfig({
			API_TOKEN: { required: true },
			OPTIONAL_TOKEN: { required: false }
		})).toEqual({
			required: ['API_TOKEN']
		})
	})

	test('omits Wrangler secrets config when no required secrets are declared', () => {
		expect(toWranglerSecretsConfig({
			OPTIONAL_TOKEN: { required: false }
		})).toBeUndefined()
	})
})

describe('applyLocalDevVarsToConfig', () => {
	test('returns a config copy with local dev vars merged into runtime vars', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.dev.vars', 'API_TOKEN=secret\n')
		const config: DevflareConfig = {
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			vars: {
				API_TOKEN: 'from-config',
				PUBLIC_FLAG: 'on'
			}
		}

		const withLocalVars = await applyLocalDevVarsToConfig(config, {
			cwd,
			configPath: join(cwd, 'devflare.config.ts')
		})

		expect(withLocalVars).not.toBe(config)
		expect(withLocalVars.vars).toEqual({
			API_TOKEN: 'secret',
			PUBLIC_FLAG: 'on'
		})
	})
})
