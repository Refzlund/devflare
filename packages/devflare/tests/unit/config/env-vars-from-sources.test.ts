/*
	──────────────────────────────────────────────────────────
	   resolveConfigEnvVarsFromSources — a build's resolution, reported
	──────────────────────────────────────────────────────────
	The resolution `devflare build` and `devflare deploy` run, for a script that sets the conditions
	itself: merge the environment, then resolve each `env.X` descriptor from the values passed. Two
	things differ from the build's own call, and each has a case below: only `sources` is read, and a
	required variable with no value is REPORTED rather than thrown.

	→ KEY: the agreement case is what makes "the same resolution" a claim with a test behind it. It runs
	  the throwing resolver the build uses over the same values, so a change to the ORDER of merge and
	  resolution in either one shows up as a disagreement here. The order inside one descriptor
	  (`.dev()` before `.default()`) is shared code, so only the hard-coded expectations grade it.
*/

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	compileBuildConfig,
	configSchema,
	type DevflareConfig,
	type DevflareConfigInput,
	env,
	preview
} from '../../../src/config'
import { EnvVarParseError, EnvVarResolutionError } from '../../../src/config/env-vars'
import {
	resolveConfigEnvVarsForEnvironment,
	resolveConfigEnvVarsFromSources
} from '../../../src/config/env-vars-for-environment'

const tempDirs: string[] = []

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop()
		if (dir) rmSync(dir, { recursive: true, force: true })
	}
})

/**
 * @description Parse `input` through the config schema, as `loadConfig` does, so each case resolves the
 *   shape a loaded config has: defaults applied, descriptors left in `vars` as they were written.
 * @param input - the config as an author writes it
 * @returns the config as `loadConfig` would return it
 */
function loaded(input: DevflareConfigInput): DevflareConfig {
	return configSchema.parse(input)
}

/**
 * @description Run `run` with `values` set in `process.env`, then put each name back as it was.
 * @param values - the variables to set for the call; an `undefined` one is removed for the call
 * @param run - the work that reads them
 * @returns what `run` returned
 */
async function withProcessEnv<T>(
	values: Record<string, string | undefined>,
	run: () => Promise<T>
): Promise<T> {
	const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
	setProcessEnv(values)
	try {
		return await run()
	} finally {
		setProcessEnv(previous)
	}
}

/**
 * @description Write each name into `process.env`, deleting the ones given as `undefined`.
 * @param values - the names to write
 */
function setProcessEnv(values: Record<string, string | undefined>): void {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
}

describe('resolveConfigEnvVarsFromSources', () => {
	test('a .default() the sources lack is what ships, and a value they carry wins over it', () => {
		const config = loaded({
			name: 'defaults',
			vars: {
				ORIGIN: env.ORIGIN.default('http://localhost:5991'),
				SET: env.SET.default('unused')
			}
		})

		const { config: resolved, missing } = resolveConfigEnvVarsFromSources(config, {
			sources: { SET: 'from-sources' }
		})

		expect(resolved.vars).toEqual({ ORIGIN: 'http://localhost:5991', SET: 'from-sources' })
		expect(missing).toEqual([])
	})

	test('a required variable with no value is reported with its path and dropped, never thrown', () => {
		const config = loaded({
			name: 'missing',
			vars: {
				KEPT: 'literal',
				SENDER: env.EMAIL_FROM,
				mongo: { uri: env.MONGOURI, database: 'voices' },
				LABEL: env.LABEL.optional()
			}
		})

		const { config: resolved, missing } = resolveConfigEnvVarsFromSources(config, { sources: {} })

		expect(resolved.vars).toEqual({ KEPT: 'literal', mongo: { database: 'voices' } })
		// An absent OPTIONAL variable is dropped too, but it is not missing.
		expect(missing).toEqual([
			{ path: ['SENDER'], name: 'EMAIL_FROM' },
			{ path: ['mongo', 'uri'], name: 'MONGOURI' }
		])
	})

	test('it resolves in build mode by default: .dev() and .absentInDev() do not apply', () => {
		const config = loaded({
			name: 'modes',
			vars: {
				TENANT: env.TENANT.dev('dev-tenant'),
				SENDER: env.EMAIL_FROM.absentInDev()
			}
		})

		const build = resolveConfigEnvVarsFromSources(config, { sources: {} })
		expect(build.config.vars).toEqual({})
		expect(build.missing.map((item) => item.name)).toEqual(['TENANT', 'EMAIL_FROM'])

		// The control: in dev both apply, so the build case above is the mode and not the fixture.
		const dev = resolveConfigEnvVarsFromSources(config, { sources: {}, mode: 'dev' })
		expect(dev.config.vars).toEqual({ TENANT: 'dev-tenant' })
		expect(dev.missing).toEqual([])
	})

	test('the environment is merged first, so its descriptors resolve and a base descriptor it replaces with a value is not demanded', () => {
		const config = loaded({
			name: 'merged',
			vars: { ORIGIN: env.BASE_ORIGIN, KEEP: 'base' },
			env: {
				production: {
					vars: {
						ORIGIN: 'https://example.com',
						SHARE: env.SHARE_ORIGIN.default('http://localhost:5991')
					}
				}
			}
		})

		const { config: resolved, missing } = resolveConfigEnvVarsFromSources(config, {
			environment: 'production',
			sources: {}
		})

		expect(resolved.vars).toEqual({
			ORIGIN: 'https://example.com',
			KEEP: 'base',
			SHARE: 'http://localhost:5991'
		})
		expect(missing).toEqual([])
	})

	test('only the sources are read — a value in process.env is not', async () => {
		const name = 'DEVFLARE_TEST_FROM_SOURCES_ONLY'
		const config = loaded({
			name: 'sources-only',
			vars: { VALUE: env[name].default('the-default') }
		})

		const resolved = await withProcessEnv({ [name]: 'from-process-env' }, async () =>
			resolveConfigEnvVarsFromSources(config, { sources: {} })
		)

		expect(resolved.config.vars).toEqual({ VALUE: 'the-default' })
	})

	test('a parser refusing a value in the sources throws, as a build does', () => {
		const config = loaded({
			name: 'parse',
			vars: {
				PORT: env.PORT.parse((value) => {
					const port = Number(value)
					if (!Number.isInteger(port)) throw new Error(`not a port: ${value}`)
					return port
				})
			}
		})

		expect(
			resolveConfigEnvVarsFromSources(config, { sources: { PORT: '8787' } }).config.vars
		).toEqual({
			PORT: 8787
		})
		expect(() => resolveConfigEnvVarsFromSources(config, { sources: { PORT: 'eighty' } })).toThrow(
			EnvVarParseError
		)
	})

	test('compiling the result with alreadyResolved emits the resolved vars, as deploy --dry-run does', () => {
		const config = loaded({
			name: 'compiled',
			compatibilityDate: '2026-05-01',
			vars: { KEEP: 'base' },
			env: { production: { vars: { ORIGIN: env.ORIGIN.default('http://localhost:5991') } } }
		})

		const { config: resolved } = resolveConfigEnvVarsFromSources(config, {
			environment: 'production',
			sources: {}
		})

		expect(compileBuildConfig(resolved, undefined, { alreadyResolved: true }).vars).toEqual({
			KEEP: 'base',
			ORIGIN: 'http://localhost:5991'
		})
		// The premise that makes this case worth having: without the resolution the compile ships the
		// descriptor object, which a check reading `vars` as strings would pass over.
		expect(typeof compileBuildConfig(config, 'production').vars?.ORIGIN).toBe('object')
	})

	test('the result carries no env section, so compiling it for the environment again ships the same vars', () => {
		const config = loaded({
			name: 'no-second-merge',
			vars: { KEEP: 'base' },
			env: { production: { vars: { ORIGIN: env.ORIGIN.default('http://localhost:5991') } } }
		})

		const { config: resolved } = resolveConfigEnvVarsFromSources(config, {
			environment: 'production',
			sources: {}
		})

		// The tempting migration from `compileBuildConfig(loaded, 'production')` swaps only the first
		// argument. With the section kept, that merge brought the unresolved descriptor back.
		expect(resolved.env).toBeUndefined()
		expect(compileBuildConfig(resolved, 'production').vars).toEqual(
			compileBuildConfig(resolved, undefined, { alreadyResolved: true }).vars
		)
	})

	test('preview-scoped names are materialised as a build does, from DEVFLARE_PREVIEW_* in process.env', async () => {
		const pv = preview.scope()
		const unset = {
			DEVFLARE_PREVIEW_BRANCH: undefined,
			DEVFLARE_PREVIEW_IDENTIFIER: undefined,
			DEVFLARE_PREVIEW_PR: undefined
		}
		const config = loaded({
			name: 'preview-names',
			compatibilityDate: '2026-05-01',
			bindings: { r2: { FILES: pv('files') } }
		})
		const bucketsVar = () =>
			compileBuildConfig(
				resolveConfigEnvVarsFromSources(config, { environment: 'production', sources: {} }).config,
				undefined,
				{ alreadyResolved: true }
			).vars?.DEVFLARE_R2_BUCKETS

		// Materialised, never the marker: with `alreadyResolved` the compile does not do it a second time.
		expect(await withProcessEnv(unset, async () => bucketsVar())).toBe(
			'{"FILES":{"bucketName":"files"}}'
		)
		// And read from process.env, not from `sources` — the GOTCHA in the function's doc, demonstrated.
		expect(
			await withProcessEnv({ ...unset, DEVFLARE_PREVIEW_BRANCH: 'feat-x' }, async () =>
				bucketsVar()
			)
		).toBe('{"FILES":{"bucketName":"files-feat-x"}}')
	})

	describe('agrees with the resolver devflare build and deploy throw from', () => {
		/**
		 * @description Run the build's own resolver over `values`, put in `process.env` for the call, from
		 *   an empty directory under the system temp dir, so no `.env` file supplies anything.
		 * @param config - the config to resolve
		 * @param values - the variables to set for the call; each is removed again afterwards
		 * @returns the resolved config, or the `EnvVarResolutionError` it threw
		 */
		async function resolveAsBuild(
			config: DevflareConfig,
			values: Record<string, string>
		): Promise<{ vars?: unknown; error?: EnvVarResolutionError }> {
			const cwd = mkdtempSync(join(tmpdir(), 'devflare-from-sources-'))
			tempDirs.push(cwd)
			return withProcessEnv(values, async () => {
				try {
					const resolved = await resolveConfigEnvVarsForEnvironment(config, {
						cwd,
						environment: 'production',
						mode: 'build'
					})
					return { vars: resolved.vars }
				} catch (error) {
					if (error instanceof EnvVarResolutionError) return { error }
					throw error
				}
			})
		}

		const config = loaded({
			name: 'agreement',
			vars: {
				A: env.DEVFLARE_TEST_AGREE_A,
				B: env.DEVFLARE_TEST_AGREE_B.dev('dev-b').default('default-b'),
				C: env.DEVFLARE_TEST_AGREE_C.optional()
			},
			env: { production: { vars: { D: env.DEVFLARE_TEST_AGREE_D.parse(Number) } } }
		})

		test('with every required variable set, both resolve the same vars', async () => {
			const values = { DEVFLARE_TEST_AGREE_A: 'a', DEVFLARE_TEST_AGREE_D: '4' }

			const build = await resolveAsBuild(config, values)
			const reported = resolveConfigEnvVarsFromSources(config, {
				environment: 'production',
				sources: values
			})

			expect(build.error).toBeUndefined()
			expect(reported.config.vars).toEqual(build.vars as Record<string, unknown>)
			expect(reported.config.vars).toEqual({ A: 'a', B: 'default-b', D: 4 })
			expect(reported.missing).toEqual([])
		})

		test('with some missing, the build throws for exactly the variables this reports', async () => {
			const values = { DEVFLARE_TEST_AGREE_D: '4' }

			const build = await resolveAsBuild(config, values)
			const reported = resolveConfigEnvVarsFromSources(config, {
				environment: 'production',
				sources: values
			})

			expect(build.error?.missing).toEqual(reported.missing)
			expect(reported.missing).toEqual([{ path: ['A'], name: 'DEVFLARE_TEST_AGREE_A' }])
		})
	})
})
