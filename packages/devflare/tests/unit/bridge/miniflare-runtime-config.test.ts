import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveMiniflareRuntimeConfig } from '../../../src/bridge/miniflare'
import { defineConfig, env } from '../../../src/config'

const tempDirs: string[] = []
/** Names a test set on `process.env`, removed after it. */
const setEnvKeys: string[] = []

/**
 * @description Sets a variable no developer shell holds on `process.env`.
 * @param value - the value to set
 * @returns the name, registered for removal after the test
 */
function setUniqueEnvVar(value: string): string {
	const key = `DEVFLARE_MF_RUNTIME_${crypto.randomUUID().replaceAll('-', '_')}`
	setEnvKeys.push(key)
	process.env[key] = value
	return key
}

/**
 * @description Makes an app root holding a `.dev.vars`, which only a `cwd` can point at.
 * @returns the directory
 */
function makeAppWithDevVars(): string {
	const cwd = mkdtempSync(join(tmpdir(), 'devflare-mf-runtime-'))
	tempDirs.push(cwd)
	writeFileSync(join(cwd, '.dev.vars'), 'SESSION_SECRET=from-dev-vars\n')
	return cwd
}

afterEach(() => {
	for (const key of setEnvKeys.splice(0)) {
		delete process.env[key]
	}
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('resolveMiniflareRuntimeConfig', () => {
	test('with a cwd, resolves env.NAME vars and applies that directory’s .dev.vars', async () => {
		const key = setUniqueEnvVar('from-the-environment')
		const cwd = makeAppWithDevVars()
		const config = defineConfig({
			name: 'mf-runtime',
			compatibilityDate: '2026-04-26',
			vars: { ORIGIN: env[key] }
		})

		const runtime = await resolveMiniflareRuntimeConfig(config, { cwd })

		expect(runtime.vars).toEqual({
			ORIGIN: 'from-the-environment',
			SESSION_SECRET: 'from-dev-vars'
		})
	})

	test('without a cwd, still resolves env.NAME vars, from process.env alone', async () => {
		const key = setUniqueEnvVar('from-the-environment')
		const config = defineConfig({
			name: 'mf-runtime',
			compatibilityDate: '2026-04-26',
			vars: { ORIGIN: env[key], PLAIN: 'as-written' }
		})

		const runtime = await resolveMiniflareRuntimeConfig(config, {})

		expect(runtime.vars).toEqual({ ORIGIN: 'from-the-environment', PLAIN: 'as-written' })
	})
})
