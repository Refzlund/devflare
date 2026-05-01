import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { defineConfig, env } from '../../../src/config'
import {
	EnvVarResolutionError,
	loadDevflareDotenv,
	resolveConfigEnvVars
} from '../../../src/config/env-vars'

const tempDirs: string[] = []

function makeTempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-env-vars-'))
	tempDirs.push(dir)
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

describe('loadDevflareDotenv', () => {
	test('loads parent .env files first and lets closer files override them', async () => {
		const root = makeTempProject()
		const app = join(root, 'apps', 'site')
		mkdirSync(app, { recursive: true })
		writeProjectFile(root, '.env', [
			'SHARED=from-root',
			'ROOT_ONLY=yes',
			'RAW_VALUE=abc$not_expanded#not_comment'
		].join('\n'))
		writeProjectFile(app, '.env', [
			'SHARED=from-app',
			'APP_ONLY=yes'
		].join('\n'))

		const loaded = await loadDevflareDotenv(app)

		expect(loaded.values).toMatchObject({
			SHARED: 'from-app',
			ROOT_ONLY: 'yes',
			RAW_VALUE: 'abc$not_expanded#not_comment',
			APP_ONLY: 'yes'
		})
	})

	test('loads .env.dev before .env so .env has final precedence', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env.dev', [
			'SHARED=from-dev',
			'DEV_ONLY=yes'
		].join('\n'))
		writeProjectFile(cwd, '.env', [
			'SHARED=from-env',
			'ENV_ONLY=yes'
		].join('\n'))

		const loaded = await loadDevflareDotenv(cwd)

		expect(loaded.values).toMatchObject({
			SHARED: 'from-env',
			DEV_ONLY: 'yes',
			ENV_ONLY: 'yes'
		})
	})
})

describe('resolveConfigEnvVars', () => {
	test('resolves nested env descriptors, parsers, defaults, dev defaults, and optional vars', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env', [
			'SECRET=from-env',
			'MONGOURI=mongodb://localhost:27017',
			'MONGODATABASE=voices',
			'NUMBER=42.5'
		].join('\n'))

		const config = defineConfig({
			name: 'env-worker',
			compatibilityDate: '2026-05-01',
			vars: {
				secret: env.SECRET,
				mongo: {
					uri: env.MONGOURI,
					database: env.MONGODATABASE
				},
				isNumber: env.NUMBER.parse(parseFloat),
				optionalValue: env.NOT_PRESENT.optional(),
				withDefault: env.DEFAULTED.default('fallback'),
				devOnly: env.DEV_ONLY.dev(123)
			}
		})

		const resolved = await resolveConfigEnvVars(config, {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'dev'
		})

		expect(resolved.vars).toEqual({
			secret: 'from-env',
			mongo: {
				uri: 'mongodb://localhost:27017',
				database: 'voices'
			},
			isNumber: 42.5,
			withDefault: 'fallback',
			devOnly: 123
		})
	})

	test('throws a nested missing-variable report in build mode', async () => {
		const cwd = makeTempProject()
		const config = defineConfig({
			name: 'missing-env-worker',
			compatibilityDate: '2026-05-01',
			vars: {
				secret: env.SECRET,
				mongo: {
					uri: env.MONGOURI
				}
			}
		})

		await expect(resolveConfigEnvVars(config, {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'build'
		})).rejects.toThrow(EnvVarResolutionError)

		try {
			await resolveConfigEnvVars(config, {
				cwd,
				configPath: join(cwd, 'devflare.config.ts'),
				mode: 'build'
			})
		} catch (error) {
			expect(error).toBeInstanceOf(EnvVarResolutionError)
			expect((error as Error).message).toContain('These environment variables are missing:')
			expect((error as Error).message).toContain('secret: SECRET')
			expect((error as Error).message).toContain('mongo:')
			expect((error as Error).message).toContain('uri: MONGOURI')
		}
	})

	test('lets process.env override dotenv values', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env', 'DEVFLARE_TEST_PROCESS_OVERRIDE=from-file\n')
		const previous = process.env.DEVFLARE_TEST_PROCESS_OVERRIDE
		process.env.DEVFLARE_TEST_PROCESS_OVERRIDE = 'from-process'

		try {
			const config = defineConfig({
				name: 'process-env-worker',
				compatibilityDate: '2026-05-01',
				vars: {
					value: env.DEVFLARE_TEST_PROCESS_OVERRIDE
				}
			})

			const resolved = await resolveConfigEnvVars(config, {
				cwd,
				configPath: join(cwd, 'devflare.config.ts'),
				mode: 'build'
			})

			expect(resolved.vars).toEqual({ value: 'from-process' })
		} finally {
			if (previous === undefined) {
				delete process.env.DEVFLARE_TEST_PROCESS_OVERRIDE
			} else {
				process.env.DEVFLARE_TEST_PROCESS_OVERRIDE = previous
			}
		}
	})
})
