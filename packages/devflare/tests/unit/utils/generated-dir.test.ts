import { describe, expect, test } from 'bun:test'
import { resolve } from 'pathe'
import {
	DEFAULT_GENERATED_DIR,
	GENERATED_DIR_ENV,
	generatedDir,
	generatedDirName,
	withGeneratedRoot,
	workspaceAppGeneratedRoot
} from '../../../src/utils/generated-dir'

describe('generatedDirName', () => {
	test('defaults to .devflare when nothing overrides it', () => {
		expect(generatedDirName({})).toBe(DEFAULT_GENERATED_DIR)
	})

	test('uses the override when set', () => {
		expect(generatedDirName({ [GENERATED_DIR_ENV]: '.devflare-e2e' })).toBe('.devflare-e2e')
	})

	test('trims surrounding whitespace', () => {
		expect(generatedDirName({ [GENERATED_DIR_ENV]: '  .devflare-e2e  ' })).toBe('.devflare-e2e')
	})

	// A variable that is present but empty is how a shell exports "unset" by
	// accident (`DEVFLARE_DIR=`). Resolving that to the cwd itself would scatter
	// generated files across the app and, worse, hand `.gitignore` containing `*`
	// to the project root.
	test.each(['', '   '])('falls back when the override is blank (%p)', (blank) => {
		expect(generatedDirName({ [GENERATED_DIR_ENV]: blank })).toBe(DEFAULT_GENERATED_DIR)
	})
})

describe('generatedDir', () => {
	test('resolves segments below the generated root', () => {
		expect(generatedDir('/app', 'worker-entrypoints', 'main.js')).toBe(
			resolve('/app', DEFAULT_GENERATED_DIR, 'worker-entrypoints', 'main.js')
		)
	})

	test('two instances with different roots never share a path', () => {
		const previous = process.env[GENERATED_DIR_ENV]
		try {
			process.env[GENERATED_DIR_ENV] = '.devflare-e2e'
			const suite = generatedDir('/app', 'vite.config.mjs')
			delete process.env[GENERATED_DIR_ENV]
			const dev = generatedDir('/app', 'vite.config.mjs')

			expect(suite).not.toBe(dev)
			expect(dev).toBe(resolve('/app', DEFAULT_GENERATED_DIR, 'vite.config.mjs'))
		} finally {
			if (previous === undefined) delete process.env[GENERATED_DIR_ENV]
			else process.env[GENERATED_DIR_ENV] = previous
		}
	})
})

describe('withGeneratedRoot', () => {
	test('roots every lookup inside it, across awaits and timers, and none outside it', async () => {
		const env = { [GENERATED_DIR_ENV]: '/shared' }
		const seen = await withGeneratedRoot('/shared/apps/api', async () => {
			const before = generatedDir('/repo/apps/api', 'worker-entrypoints')
			await Bun.sleep(1)
			const afterAwait = generatedDirName(env)
			const inTimer = await new Promise<string>((done) =>
				setTimeout(() => done(generatedDir('/repo/apps/api', 'do-bundles')), 1)
			)
			return { before, afterAwait, inTimer }
		})

		expect(seen).toEqual({
			before: resolve('/shared/apps/api', 'worker-entrypoints'),
			afterAwait: '/shared/apps/api',
			inTimer: resolve('/shared/apps/api', 'do-bundles')
		})
		expect(generatedDirName(env)).toBe('/shared')
	})
})

describe('workspaceAppGeneratedRoot', () => {
	const manifestDir = '/repo'

	test.each([
		['unset', {}],
		['the default', { [GENERATED_DIR_ENV]: DEFAULT_GENERATED_DIR }],
		['a relative override that stays inside the app', { [GENERATED_DIR_ENV]: '.devflare-e2e' }]
	])(
		'assigns nothing when the override is %s, since each app already has its own',
		(_label, env) => {
			expect(workspaceAppGeneratedRoot(manifestDir, '/repo/apps/api', env)).toBeUndefined()
		}
	)

	test('gives each app the subdirectory of an absolute override matching its path', () => {
		const env = { [GENERATED_DIR_ENV]: '/elsewhere/gen' }
		const api = workspaceAppGeneratedRoot(manifestDir, '/repo/apps/api', env)
		const web = workspaceAppGeneratedRoot(manifestDir, '/repo/apps/web', env)

		expect(api).toBe('/elsewhere/gen/apps/api')
		expect(web).toBe('/elsewhere/gen/apps/web')
	})

	test('treats a relative override that climbs out of the app as shared too', () => {
		// `../gen` from apps/a and from apps/b is the same apps/gen.
		const env = { [GENERATED_DIR_ENV]: '../gen' }

		expect(workspaceAppGeneratedRoot(manifestDir, '/repo/apps/a', env)).toBe(
			'/repo/apps/gen/apps/a'
		)
		expect(workspaceAppGeneratedRoot(manifestDir, '/repo/apps/b', env)).toBe(
			'/repo/apps/gen/apps/b'
		)
	})

	test('roots an app at the manifest directory at the override itself', () => {
		expect(workspaceAppGeneratedRoot(manifestDir, '/repo', { [GENERATED_DIR_ENV]: '/gen' })).toBe(
			'/gen'
		)
	})

	test.each([
		['a sibling of the manifest directory', '/repo', '/other/app'],
		["the manifest directory's parent", '/work/repo', '/work'],
		['on another drive', '/repo', 'D:/app']
	])('refuses an app %s, naming both directories', (_label, manifest, appDir) => {
		expect(() =>
			workspaceAppGeneratedRoot(manifest, appDir, { [GENERATED_DIR_ENV]: '/gen' })
		).toThrow(`Workspace app ${appDir} is not inside the manifest directory ${manifest}`)
	})
})
