// =============================================================================
// SvelteKit platform options — the config the Vite child serves `platform.env` from
// =============================================================================
// A SvelteKit app's `platform.env` is not served by the coordinator's workers:
// the Vite child loads the config itself and serves the vars from its own
// process. So every step the coordinator takes between `loadConfig` and a
// worker's env has to happen here too, or a var reads differently in a
// SvelteKit route than in a worker. These tests drive the function the
// pre-configured `handle` calls, against a config on disk.
// =============================================================================

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EnvVarResolutionError } from '../../../src/config/env-vars'
import { loadPlatformOptionsFromConfig, resetConfigCache } from '../../../src/sveltekit/platform'

/** The config-time `env` proxy, which the fixture configs import from source. */
const ENV_VARS_MODULE = pathToFileURL(
	join(import.meta.dirname, '../../../src/config/env-vars.ts')
).href

const tempDirs: string[] = []
/** `loadConfig` copies a project's `.env` into `process.env`, so each name a test minted is removed after it. */
const mintedEnvKeys: string[] = []

/**
 * @description Mints an environment variable name that no other test, and no developer
 * shell, already holds. A held name would supply the value from `process.env` and hide
 * whether the project's own `.env` was read.
 * @param label - a readable fragment, for a failure message
 * @returns the name, registered for removal after the test
 */
function mintEnvKey(label: string): string {
	const key = `DEVFLARE_SVELTEKIT_${label}_${crypto.randomUUID().replaceAll('-', '_')}`
	mintedEnvKeys.push(key)
	return key
}

/**
 * @description Writes a SvelteKit app's devflare config, plus any sibling files, into a
 * fresh temp directory.
 * @param varsSource - the config's `vars` object, as TypeScript source; `env` is in scope
 * @param files - extra files beside the config, by name (`.env`, `.dev.vars`)
 * @returns the app root, and the absolute config path the coordinator hands the Vite child
 */
function writeApp(
	varsSource: string,
	files: Record<string, string> = {}
): { cwd: string; configPath: string } {
	const cwd = mkdtempSync(join(tmpdir(), 'devflare-sveltekit-platform-'))
	tempDirs.push(cwd)

	const configPath = join(cwd, 'devflare.config.ts')
	writeFileSync(
		configPath,
		[
			`import { env } from '${ENV_VARS_MODULE}'`,
			'',
			`export default { name: 'sveltekit-app', compatibilityDate: '2026-01-01', vars: ${varsSource} }`,
			''
		].join('\n')
	)
	for (const [name, contents] of Object.entries(files)) {
		writeFileSync(join(cwd, name), contents)
	}

	return { cwd, configPath }
}

afterEach(() => {
	resetConfigCache()
	for (const key of mintedEnvKeys.splice(0)) {
		delete process.env[key]
	}
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('loadPlatformOptionsFromConfig', () => {
	test('a var declared as env.NAME reaches platform.env as its value, not as the descriptor', async () => {
		const key = mintEnvKey('ORIGIN')
		const { cwd, configPath } = writeApp(`{ API_ORIGIN: env.${key} }`, {
			'.env': `${key}=http://127.0.0.1:6281\n`
		})

		const { localBindings } = await loadPlatformOptionsFromConfig(cwd, {
			DEVFLARE_CONFIG_PATH: configPath
		})

		expect(localBindings?.API_ORIGIN).toBe('http://127.0.0.1:6281')
	})

	test('a var is resolved in dev mode, so a .dev() fallback stands in for a missing value', async () => {
		const key = mintEnvKey('UNSET')
		const { cwd, configPath } = writeApp(`{ TENANT: env.${key}.dev('local-tenant') }`)

		const { localBindings } = await loadPlatformOptionsFromConfig(cwd, {
			DEVFLARE_CONFIG_PATH: configPath
		})

		expect(localBindings?.TENANT).toBe('local-tenant')
	})

	test("the app's .dev.vars reaches platform.env over the config's own vars", async () => {
		const { cwd, configPath } = writeApp(`{ GREETING: 'from-config' }`, {
			'.dev.vars': 'GREETING=from-dev-vars\nSESSION_SECRET=local-only\n'
		})

		const { localBindings } = await loadPlatformOptionsFromConfig(cwd, {
			DEVFLARE_CONFIG_PATH: configPath
		})

		expect(localBindings?.GREETING).toBe('from-dev-vars')
		expect(localBindings?.SESSION_SECRET).toBe('local-only')
	})

	test('a missing required var fails loudly, and is read again once .env supplies it', async () => {
		const key = mintEnvKey('REQUIRED')
		const { cwd, configPath } = writeApp(`{ API_ORIGIN: env.${key} }`)
		const environment = { DEVFLARE_CONFIG_PATH: configPath }

		await expect(loadPlatformOptionsFromConfig(cwd, environment)).rejects.toBeInstanceOf(
			EnvVarResolutionError
		)

		writeFileSync(join(cwd, '.env'), `${key}=http://127.0.0.1:6281\n`)
		const { localBindings } = await loadPlatformOptionsFromConfig(cwd, environment)

		expect(localBindings?.API_ORIGIN).toBe('http://127.0.0.1:6281')
	})

	test('an app with no devflare config is served by the bridge alone', async () => {
		const cwd = mkdtempSync(join(tmpdir(), 'devflare-sveltekit-no-config-'))
		tempDirs.push(cwd)

		const options = await loadPlatformOptionsFromConfig(cwd, {})

		expect(options).toEqual({ hints: {}, localBindings: {} })
	})
})
