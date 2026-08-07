import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
		writeProjectFile(
			root,
			'.env',
			['SHARED=from-root', 'ROOT_ONLY=yes', 'RAW_VALUE=abc$not_expanded#not_comment'].join('\n')
		)
		writeProjectFile(app, '.env', ['SHARED=from-app', 'APP_ONLY=yes'].join('\n'))

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
		writeProjectFile(cwd, '.env.dev', ['SHARED=from-dev', 'DEV_ONLY=yes'].join('\n'))
		writeProjectFile(cwd, '.env', ['SHARED=from-env', 'ENV_ONLY=yes'].join('\n'))

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
		writeProjectFile(
			cwd,
			'.env',
			[
				'SECRET=from-env',
				'MONGOURI=mongodb://localhost:27017',
				'MONGODATABASE=voices',
				'NUMBER=42.5'
			].join('\n')
		)

		const config = defineConfig({
			name: 'env-worker',
			compatibilityDate: '2026-05-01',
			vars: {
				secret: env.SECRET,
				mongo: {
					uri: env.MONGOURI,
					database: env.MONGODATABASE
				},
				isNumber: env.NUMBER.parse(Number.parseFloat),
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

		await expect(
			resolveConfigEnvVars(config, {
				cwd,
				configPath: join(cwd, 'devflare.config.ts'),
				mode: 'build'
			})
		).rejects.toThrow(EnvVarResolutionError)

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

describe('.env.public — the committed tier', () => {
	test('is read like any other env file', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env.public', 'EMAIL_FROM=no-reply@example.test')

		const loaded = await loadDevflareDotenv(cwd)

		expect(loaded.values.EMAIL_FROM).toBe('no-reply@example.test')
	})

	test('LOSES to both of a developer own files in the same directory', async () => {
		// The whole reason it is a separate tier. A value the repository ships is a default, and a default
		// that overrode the machine it is running on would be worse than no default at all.
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env.public', ['A=public', 'B=public', 'C=public'].join('\n'))
		writeProjectFile(cwd, '.env.dev', ['B=dev', 'C=dev'].join('\n'))
		writeProjectFile(cwd, '.env', 'C=env')

		const loaded = await loadDevflareDotenv(cwd)

		expect(loaded.values).toMatchObject({ A: 'public', B: 'dev', C: 'env' })
	})

	test('a CLOSER .env.public still beats a parent .env', async () => {
		// Directory proximity outranks file tier — the same rule the other two files already follow. Worth
		// pinning because the two orderings compose, and "the weakest tier" could be read as weakest overall.
		const root = makeTempProject()
		const app = join(root, 'apps', 'site')
		mkdirSync(app, { recursive: true })
		writeProjectFile(root, '.env', 'WHICH=root-env')
		writeProjectFile(app, '.env.public', 'WHICH=app-public')

		const loaded = await loadDevflareDotenv(app)

		expect(loaded.values.WHICH).toBe('app-public')
	})
})

describe('.absentInDev() — required to build, absent to develop', () => {
	/** A config with one `.absentInDev()` var, so each mode can be asked about the same shape. */
	function senderConfig() {
		return defineConfig({
			name: 'env-worker',
			compatibilityDate: '2026-05-01',
			vars: { EMAIL_FROM: env.EMAIL_FROM.absentInDev() }
		})
	}

	test('a BUILD with the variable missing fails, naming it', async () => {
		// The point of the whole descriptor. `.optional()` would have shipped this deploy silently.
		const cwd = makeTempProject()

		const failure = resolveConfigEnvVars(senderConfig(), {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'build'
		})

		await expect(failure).rejects.toThrow(EnvVarResolutionError)
		await failure.catch((error: unknown) => {
			expect((error as EnvVarResolutionError).missing).toEqual([
				{ path: ['EMAIL_FROM'], name: 'EMAIL_FROM' }
			])
		})
	})

	test('a BUILD with the variable set emits it', async () => {
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env', 'EMAIL_FROM=no-reply@example.test')

		const resolved = await resolveConfigEnvVars(senderConfig(), {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'build'
		})

		expect(resolved.vars).toEqual({ EMAIL_FROM: 'no-reply@example.test' })
	})

	test('a DEV run with it missing omits the KEY, rather than emitting undefined', async () => {
		// `Object.hasOwn`, not a truthiness or undefined check: a key present-and-undefined is a different
		// thing from an absent one to any consumer that shape-checks its environment, which is exactly the
		// kind of consumer this descriptor exists for.
		const cwd = makeTempProject()

		const resolved = await resolveConfigEnvVars(senderConfig(), {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'dev'
		})

		expect(Object.hasOwn(resolved.vars ?? {}, 'EMAIL_FROM')).toBe(false)
	})

	test('a DEV run with it SET still uses it', async () => {
		// Absent by default is not the same as forbidden. A developer who deliberately points their machine
		// at a real sender must be able to.
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env', 'EMAIL_FROM=me@example.test')

		const resolved = await resolveConfigEnvVars(senderConfig(), {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'dev'
		})

		expect(resolved.vars).toEqual({ EMAIL_FROM: 'me@example.test' })
	})

	test('a value committed to .env.public DEFEATS it — the documented trap, demonstrated', async () => {
		// The reason the docs forbid pairing the two. `.env.public` is committed, so a sender written there
		// reaches every checkout and hands the placeholder to every laptop this descriptor exists to
		// withhold. Pinning it here keeps that warning HONEST: if resolution ever started ignoring a
		// committed value in dev, this test fails and the prose that says otherwise gets corrected with it.
		const cwd = makeTempProject()
		writeProjectFile(cwd, '.env.public', 'EMAIL_FROM=no-reply@committed.test')

		const resolved = await resolveConfigEnvVars(senderConfig(), {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'dev'
		})

		expect(resolved.vars).toEqual({ EMAIL_FROM: 'no-reply@committed.test' })
	})

	test('an explicit .dev() value wins over it, and .default() does not', async () => {
		// Both combinations are contradictory, so the resolution order decides rather than the author. The
		// one that NAMES dev mode wins in dev mode; a whole-mode default loses to it.
		const cwd = makeTempProject()
		const config = defineConfig({
			name: 'env-worker',
			compatibilityDate: '2026-05-01',
			vars: {
				withDevValue: env.WITH_DEV.absentInDev().dev('dev-value'),
				withDefault: env.WITH_DEFAULT.default('fallback').absentInDev()
			}
		})

		const resolved = await resolveConfigEnvVars(config, {
			cwd,
			configPath: join(cwd, 'devflare.config.ts'),
			mode: 'dev'
		})

		expect(resolved.vars).toEqual({ withDevValue: 'dev-value' })
	})
})
