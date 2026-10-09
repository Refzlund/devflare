import { describe, expect, test } from 'bun:test'
import { INJECTED_VARS_ENV, readInjectedVars } from '../../../src/config/injected-vars'
import { isReservedAppEnvKey } from '../../../src/config/workspace'
import { buildViteChildEnv, type ViteChildEnvOptions } from '../../../src/dev-server/vite-process'

/** Every option set, so every variable devflare can write is present. */
const everyOption: ViteChildEnvOptions = {
	configPath: '/apps/web/devflare.config.ts',
	miniflarePort: 8788,
	runtimeStatusUrl: 'http://127.0.0.1:9100/status',
	r2Presign: { secret: 'presign-secret', origin: 'http://127.0.0.1:8788' }
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

	test('without an app env, the single-app environment is exactly what it was', () => {
		const env = buildViteChildEnv({ PATH: '/usr/bin' }, everyOption)

		expect(env).toEqual({
			PATH: '/usr/bin',
			DEVFLARE_DEV: 'true',
			DEVFLARE_BRIDGE_PORT: '8788',
			DEVFLARE_RUNTIME_STATUS_URL: 'http://127.0.0.1:9100/status',
			DEVFLARE_CONFIG_PATH: '/apps/web/devflare.config.ts',
			DEVFLARE_R2_PRESIGN_SECRET: 'presign-secret',
			DEVFLARE_R2_PRESIGN_ORIGIN: 'http://127.0.0.1:8788',
			FORCE_COLOR: '1'
		})
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
