import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, env } from '../../../src/config'
import { resolveDevConfig } from '../../../src/config/dev-config'
import { LOCAL_DEV_VARS_ENV } from '../../../src/config/local-dev-vars-switch'

const tempDirs: string[] = []

/** The overlay switch as the shell running this suite holds it. Every case starts with it unset. */
const ambientSwitch = process.env[LOCAL_DEV_VARS_ENV]

beforeEach(() => {
	delete process.env[LOCAL_DEV_VARS_ENV]
})

afterEach(() => {
	if (ambientSwitch === undefined) {
		delete process.env[LOCAL_DEV_VARS_ENV]
	} else {
		process.env[LOCAL_DEV_VARS_ENV] = ambientSwitch
	}
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

describe('resolveDevConfig with the local-vars overlay off', () => {
	test('still resolves descriptors from .env, and lays no .dev.vars over the result', async () => {
		const cwd = mkdtempSync(join(tmpdir(), 'devflare-dev-config-off-'))
		tempDirs.push(cwd)

		// A name no developer shell holds, which would otherwise win over `.env`.
		const key = `DEVFLARE_DEV_CONFIG_${crypto.randomUUID().replaceAll('-', '_')}`
		writeFileSync(join(cwd, '.env'), `${key}=from-env\n`)
		writeFileSync(join(cwd, '.dev.vars'), 'ORIGIN=from-dev-vars\nGREETING=from-dev-vars\n')

		const config = defineConfig({
			name: 'dev-config-off-app',
			compatibilityDate: '2026-01-01',
			vars: {
				ORIGIN: env[key],
				GREETING: 'from-config'
			}
		})
		const options = { cwd, configPath: join(cwd, 'devflare.config.ts') }

		process.env[LOCAL_DEV_VARS_ENV] = 'off'
		expect((await resolveDevConfig(config, options)).vars).toEqual({
			ORIGIN: 'from-env',
			GREETING: 'from-config'
		})

		// The control: with the switch unset, the same `.dev.vars` beats both.
		delete process.env[LOCAL_DEV_VARS_ENV]
		expect((await resolveDevConfig(config, options)).vars).toEqual({
			ORIGIN: 'from-dev-vars',
			GREETING: 'from-dev-vars'
		})
	})
})
