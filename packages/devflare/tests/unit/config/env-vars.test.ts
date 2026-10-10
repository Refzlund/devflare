import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, env } from '../../../src/config'
import {
	EnvVarResolutionError,
	getDevflareDotenvPaths,
	listCopiedDotenvNames,
	loadDevflareDotenv,
	loadDevflareDotenvIntoProcess,
	recordInheritedDotenvCopies,
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

	/**
	 * @description Two sibling config directories, each with a `.env`, as a gateway and the
	 * worker it references, or two workspace apps, lay out. Names are unique per call.
	 * @returns both directories and the variable names their files set
	 */
	function writeSiblingConfigDirs() {
		const root = makeTempProject()
		const first = join(root, 'first')
		const second = join(root, 'second')
		mkdirSync(first)
		mkdirSync(second)
		const suffix = crypto.randomUUID().replaceAll('-', '_')
		const shared = `DEVFLARE_COPIED_SHARED_${suffix}`
		const onlyFirst = `DEVFLARE_COPIED_ONLY_FIRST_${suffix}`
		writeProjectFile(first, '.env', `${shared}=from-first\n${onlyFirst}=only-in-first\n`)
		writeProjectFile(second, '.env', `${shared}=from-second\n`)

		const secondConfig = defineConfig({
			name: 'second-worker',
			compatibilityDate: '2026-05-01',
			vars: { shared: env[shared], onlyFirst: env[onlyFirst] }
		})
		const resolveSecond = () =>
			resolveConfigEnvVars(secondConfig, {
				cwd: second,
				configPath: join(second, 'devflare.config.ts'),
				mode: 'dev'
			})

		return { first, shared, onlyFirst, resolveSecond }
	}

	test("a value copied from another config's .env ranks below this config's own, and still fills a gap", async () => {
		// `loadConfig` copies each config's `.env` into `process.env`, so a second config would
		// otherwise read the first one's file before its own.
		const { first, shared, onlyFirst, resolveSecond } = writeSiblingConfigDirs()

		try {
			await loadDevflareDotenvIntoProcess(first)
			const resolved = await resolveSecond()

			expect(resolved.vars).toEqual({ shared: 'from-second', onlyFirst: 'only-in-first' })
		} finally {
			delete process.env[shared]
			delete process.env[onlyFirst]
		}
	})

	test('a copied value that has since been overwritten counts as the environment, and wins', async () => {
		const { first, shared, onlyFirst, resolveSecond } = writeSiblingConfigDirs()

		try {
			await loadDevflareDotenvIntoProcess(first)
			process.env[shared] = 'set-after-the-copy'
			const resolved = await resolveSecond()

			expect(resolved.vars).toEqual({ shared: 'set-after-the-copy', onlyFirst: 'only-in-first' })
		} finally {
			delete process.env[shared]
			delete process.env[onlyFirst]
		}
	})

	test('a missing variable names the .env files that could have supplied it', async () => {
		const cwd = makeTempProject()
		const missing = `DEVFLARE_MISSING_${crypto.randomUUID().replaceAll('-', '_')}`

		const failure = await resolveConfigEnvVars(
			defineConfig({
				name: 'missing-worker',
				compatibilityDate: '2026-05-01',
				vars: { value: env[missing] }
			}),
			{ cwd, configPath: join(cwd, 'devflare.config.ts'), mode: 'dev' }
		).then(
			() => null,
			(error: unknown) => error
		)

		expect(failure).toBeInstanceOf(EnvVarResolutionError)
		expect((failure as EnvVarResolutionError).dotenvPaths).toEqual(getDevflareDotenvPaths(cwd))
	})
})

describe('copies a child process inherits', () => {
	// A process devflare spawns (a workspace app's Vite child) inherits the values its parent
	// copied from a `.env` as ordinary environment. Told their names, it ranks them as the parent
	// did. These tests stand in for the inheritance by writing `process.env` directly, which is
	// what an inherited value looks like: nothing in this process copied it.

	/**
	 * @description An app directory whose `.env` sets one name, a config resolving two names
	 * from it, and the two names, minted per call. Neither name carries the `DEVFLARE_` prefix.
	 * @returns the names, and a function resolving the config against the app's `.env`
	 */
	function writeChildApp() {
		const cwd = makeTempProject()
		const suffix = crypto.randomUUID().replaceAll('-', '_')
		const shared = `CHILD_SHARED_${suffix}`
		const onlyInherited = `CHILD_ONLY_INHERITED_${suffix}`
		writeProjectFile(cwd, '.env', `${shared}=from-own-env\n`)

		const config = defineConfig({
			name: 'child-app',
			compatibilityDate: '2026-05-01',
			vars: { shared: env[shared], onlyInherited: env[onlyInherited] }
		})
		const resolve = () =>
			resolveConfigEnvVars(config, {
				cwd,
				configPath: join(cwd, 'devflare.config.ts'),
				mode: 'dev'
			})

		return { shared, onlyInherited, resolve }
	}

	test("an inherited copy ranks below the config's own .env once recorded, and still fills a gap", async () => {
		const { shared, onlyInherited, resolve } = writeChildApp()
		process.env[shared] = 'copied-by-the-parent'
		process.env[onlyInherited] = 'only-the-parent-copied'

		try {
			recordInheritedDotenvCopies([shared, onlyInherited])
			const resolved = await resolve()

			expect(resolved.vars).toEqual({
				shared: 'from-own-env',
				onlyInherited: 'only-the-parent-copied'
			})
		} finally {
			delete process.env[shared]
			delete process.env[onlyInherited]
		}
	})

	test('an inherited value the parent did not copy is the environment, and wins', async () => {
		const { shared, onlyInherited, resolve } = writeChildApp()
		process.env[shared] = 'from-the-parent-environment'
		process.env[onlyInherited] = 'copied-by-the-parent'

		try {
			recordInheritedDotenvCopies([onlyInherited])
			const resolved = await resolve()

			expect(resolved.vars?.shared).toBe('from-the-parent-environment')
		} finally {
			delete process.env[shared]
			delete process.env[onlyInherited]
		}
	})

	test('a value written over a recorded copy is the environment, even when the names are recorded again', async () => {
		// The child records the names before every config read; a later write must not be
		// re-recorded as a copy, or it would lose to the config's own .env.
		const { shared, onlyInherited, resolve } = writeChildApp()
		process.env[shared] = 'copied-by-the-parent'
		process.env[onlyInherited] = 'from-the-parent-environment'

		try {
			recordInheritedDotenvCopies([shared])
			process.env[shared] = 'written-after-the-record'
			recordInheritedDotenvCopies([shared])
			const resolved = await resolve()

			expect(resolved.vars?.shared).toBe('written-after-the-record')
		} finally {
			delete process.env[shared]
			delete process.env[onlyInherited]
		}
	})

	test('the parent lists each copy that still holds its copied value, and nothing else', async () => {
		const root = makeTempProject()
		const suffix = crypto.randomUUID().replaceAll('-', '_')
		const kept = `PARENT_KEPT_${suffix}`
		const overwritten = `PARENT_OVERWRITTEN_${suffix}`
		const environment = `PARENT_ENVIRONMENT_${suffix}`
		writeProjectFile(root, '.env', `${kept}=a\n${overwritten}=b\n${environment}=c\n`)
		process.env[environment] = 'from-the-environment'

		try {
			await loadDevflareDotenvIntoProcess(root)
			process.env[overwritten] = 'written-after-the-copy'
			const names = listCopiedDotenvNames()

			expect(names).toContain(kept)
			expect(names).not.toContain(overwritten)
			expect(names).not.toContain(environment)
		} finally {
			delete process.env[kept]
			delete process.env[overwritten]
			delete process.env[environment]
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
