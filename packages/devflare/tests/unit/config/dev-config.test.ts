import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, env } from '../../../src/config'
import { resolveDevConfig } from '../../../src/config/dev-config'

const tempDirs: string[] = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('resolveDevConfig', () => {
	test('reads .env beside the config, and .dev.vars for the named environment from cwd', async () => {
		// The config sits in a subdirectory of the app root, so each file is found in
		// exactly one of the two places: `.env` only beside the config, `.dev.vars` only
		// at cwd. Reading either from the other directory finds nothing.
		const cwd = mkdtempSync(join(tmpdir(), 'devflare-dev-config-'))
		tempDirs.push(cwd)
		const configDir = join(cwd, 'config')
		mkdirSync(configDir)

		// A name no developer shell holds, which would otherwise win over `.env`.
		const key = `DEVFLARE_DEV_CONFIG_${crypto.randomUUID().replaceAll('-', '_')}`
		writeFileSync(join(configDir, '.env'), `${key}=from-env-beside-the-config\n`)
		writeFileSync(join(cwd, '.dev.vars'), 'GREETING=from-dev-vars\n')
		writeFileSync(join(cwd, '.dev.vars.staging'), 'GREETING=from-staging-dev-vars\n')

		const config = defineConfig({
			name: 'dev-config-app',
			compatibilityDate: '2026-01-01',
			vars: {
				ORIGIN: env[key],
				GREETING: 'from-config'
			}
		})

		const resolved = await resolveDevConfig(config, {
			cwd,
			configPath: join(configDir, 'devflare.config.ts'),
			environment: 'staging'
		})

		expect(resolved.vars).toEqual({
			ORIGIN: 'from-env-beside-the-config',
			GREETING: 'from-staging-dev-vars'
		})
	})
})
