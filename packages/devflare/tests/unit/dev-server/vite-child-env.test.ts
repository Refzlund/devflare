import { describe, expect, test } from 'bun:test'
import {
	COPIED_DOTENV_NAMES_ENV,
	readCopiedDotenvNames
} from '../../../src/config/copied-dotenv-names'
import { INJECTED_VARS_ENV, readInjectedVars } from '../../../src/config/injected-vars'
import { isReservedAppEnvKey } from '../../../src/config/workspace'
import { buildViteChildEnv, type ViteChildEnvOptions } from '../../../src/dev-server/vite-process'

/** Every option set, so every variable devflare can write is present. */
const everyOption: ViteChildEnvOptions = {
	configPath: '/apps/web/devflare.config.ts',
	miniflarePort: 8788,
	runtimeStatusUrl: 'http://127.0.0.1:9100/status',
	r2Presign: { secret: 'presign-secret', origin: 'http://127.0.0.1:8788' },
	copiedDotenvNames: ['FROM_A_DOTENV']
}

describe('buildViteChildEnv', () => {
	test('inherits the coordinator environment', () => {
		// The inheritance is a contract: a workspace consumer passes values the
		// manifest does not carry through the coordinator's own environment.
		const inherited = { PATH: '/usr/bin', HOME: '/home/dev', DOC_API_ORIGIN: 'http://lane:6281' }

		const env = buildViteChildEnv(inherited, { miniflarePort: 8788 })

		expect(env).toMatchObject(inherited)
	})

	test("sets each of the app's manifest env entries in the child", () => {
		const env = buildViteChildEnv(
			{},
			{ miniflarePort: 8788, appEnv: { DOC_API_ORIGIN: 'http://127.0.0.1:6281', SEED: '1' } }
		)

		expect(env.DOC_API_ORIGIN).toBe('http://127.0.0.1:6281')
		expect(env.SEED).toBe('1')
	})

	test('an app env value beats the same name inherited from the shell', () => {
		const env = buildViteChildEnv(
			{ DOC_API_ORIGIN: 'https://api.ui.localhost' },
			{ miniflarePort: 8788, appEnv: { DOC_API_ORIGIN: 'http://127.0.0.1:6281' } }
		)

		expect(env.DOC_API_ORIGIN).toBe('http://127.0.0.1:6281')
	})

	test("devflare's own variables beat a colliding app env", () => {
		// A loaded manifest refuses these names; this is what happens to a caller
		// that skipped that check.
		const env = buildViteChildEnv(
			{},
			{
				...everyOption,
				appEnv: {
					DEVFLARE_BRIDGE_PORT: '1',
					DEVFLARE_CONFIG_PATH: '/elsewhere.ts',
					FORCE_COLOR: '0'
				}
			}
		)

		expect(env.DEVFLARE_BRIDGE_PORT).toBe('8788')
		expect(env.DEVFLARE_CONFIG_PATH).toBe('/apps/web/devflare.config.ts')
		expect(env.FORCE_COLOR).toBe('1')
	})

	test('passes the app env as one injected-vars map the child can read back', () => {
		const appEnv = { DOC_API_ORIGIN: 'http://127.0.0.1:6281', SEED: '1' }

		const env = buildViteChildEnv({}, { miniflarePort: 8788, appEnv })

		expect(readInjectedVars(env)).toEqual(appEnv)
	})

	test('sets no injected-vars map without an app env, and never inherits one', () => {
		const inherited = { [INJECTED_VARS_ENV]: JSON.stringify({ LEAKED: 'from-a-parent' }) }

		const withoutAppEnv = buildViteChildEnv(inherited, { miniflarePort: 8788 })
		const withAppEnv = buildViteChildEnv(inherited, { miniflarePort: 8788, appEnv: { OWN: 'x' } })

		expect(INJECTED_VARS_ENV in withoutAppEnv).toBe(false)
		expect(readInjectedVars(withAppEnv)).toEqual({ OWN: 'x' })
	})

	test("without an app env, the child gets the inherited environment and devflare's own variables", () => {
		const env = buildViteChildEnv({ PATH: '/usr/bin', FROM_A_DOTENV: 'copied' }, everyOption)

		expect(env).toEqual({
			PATH: '/usr/bin',
			FROM_A_DOTENV: 'copied',
			[COPIED_DOTENV_NAMES_ENV]: '["FROM_A_DOTENV"]',
			DEVFLARE_DEV: 'true',
			DEVFLARE_BRIDGE_PORT: '8788',
			DEVFLARE_RUNTIME_STATUS_URL: 'http://127.0.0.1:9100/status',
			DEVFLARE_CONFIG_PATH: '/apps/web/devflare.config.ts',
			DEVFLARE_R2_PRESIGN_SECRET: 'presign-secret',
			DEVFLARE_R2_PRESIGN_ORIGIN: 'http://127.0.0.1:8788',
			FORCE_COLOR: '1'
		})
	})

	test("names the coordinator's .env copies, so the child can rank them as the coordinator does", () => {
		const env = buildViteChildEnv(
			{ SHARED: 'copied-from-another-app', SHELL_ONLY: 'from-the-shell' },
			{ miniflarePort: 8788, copiedDotenvNames: ['SHARED'] }
		)

		expect(readCopiedDotenvNames(env)).toEqual(['SHARED'])
		// Names only: the value already reaches the child under its own name.
		expect(env[COPIED_DOTENV_NAMES_ENV]).not.toContain('copied-from-another-app')
	})

	test("a copy the app's manifest env sets is the child's environment, so it is not named", () => {
		// The documented contract: a manifest value is what the child's process.env holds,
		// and it outranks the app's own .env there. Ranking it as a copy would invert that.
		const env = buildViteChildEnv(
			{ SHARED: 'copied-from-another-app', KEPT: 'copied-too' },
			{
				miniflarePort: 8788,
				appEnv: { SHARED: 'from-the-manifest' },
				copiedDotenvNames: ['SHARED', 'KEPT']
			}
		)

		expect(readCopiedDotenvNames(env)).toEqual(['KEPT'])
	})

	test('a copy devflare overwrites with its own variable is not named', () => {
		const env = buildViteChildEnv(
			{ FORCE_COLOR: '0', DEVFLARE_BRIDGE_PORT: '1' },
			{ ...everyOption, copiedDotenvNames: ['FORCE_COLOR', 'DEVFLARE_BRIDGE_PORT'] }
		)

		expect(COPIED_DOTENV_NAMES_ENV in env).toBe(false)
	})

	test('sets no copied-names list without copies, and never inherits one', () => {
		const inherited = { [COPIED_DOTENV_NAMES_ENV]: JSON.stringify(['LEAKED_FROM_A_PARENT']) }

		const withoutCopies = buildViteChildEnv(inherited, { miniflarePort: 8788 })
		const withCopies = buildViteChildEnv(inherited, {
			miniflarePort: 8788,
			copiedDotenvNames: ['OWN']
		})

		expect(COPIED_DOTENV_NAMES_ENV in withoutCopies).toBe(false)
		expect(readCopiedDotenvNames(withCopies)).toEqual(['OWN'])
	})

	test("every variable devflare sets is a name a Vite app's manifest env may not use", () => {
		// Derived from what the builder writes, so a new devflare variable that the
		// manifest would let an app shadow fails here by name.
		const written = Object.keys(
			buildViteChildEnv({}, { ...everyOption, appEnv: { APP_ONLY: 'x' } })
		).filter((key) => key !== 'APP_ONLY')

		expect(written.length).toBeGreaterThan(0)
		expect(written.filter((key) => !isReservedAppEnvKey(key, { vite: true }))).toEqual([])
	})
})
