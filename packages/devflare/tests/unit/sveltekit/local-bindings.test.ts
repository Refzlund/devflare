import { describe, expect, test } from 'bun:test'
import { HYPERDRIVE_CONNECT_MESSAGE } from '../../../src/shims/local-hyperdrive'
import { buildSvelteKitLocalBindings } from '../../../src/sveltekit/local-bindings'

describe('buildSvelteKitLocalBindings', () => {
	test('exposes config vars as normal synchronous platform.env strings', () => {
		const bindings = buildSvelteKitLocalBindings(
			{
				name: 'sveltekit-vars',
				vars: {
					API_ORIGIN: 'http://127.0.0.1:8791'
				}
			},
			process.cwd()
		)

		expect(bindings.API_ORIGIN).toBe('http://127.0.0.1:8791')
		expect(String(bindings.API_ORIGIN)).toBe('http://127.0.0.1:8791')
	})

	test("layers a workspace app's injected vars over the config's vars", () => {
		const bindings = buildSvelteKitLocalBindings(
			{
				name: 'sveltekit-workspace-vars',
				vars: {
					API_ORIGIN: 'https://api.ui.localhost',
					KEPT: 'from-config'
				}
			},
			process.cwd(),
			{ API_ORIGIN: 'http://127.0.0.1:6281', SEED: '1' }
		)

		expect(bindings.API_ORIGIN).toBe('http://127.0.0.1:6281')
		expect(bindings.SEED).toBe('1')
		expect(bindings.KEPT).toBe('from-config')
	})

	test('builds a Hyperdrive binding whose connect() throws the shared message', () => {
		const bindings = buildSvelteKitLocalBindings(
			{
				name: 'sveltekit-hyperdrive',
				bindings: {
					hyperdrive: {
						POSTGRES: {
							id: 'hd-id',
							localConnectionString: 'postgres://user:pass@localhost:5432/app'
						}
					}
				}
			},
			process.cwd()
		)

		const hyperdrive = bindings.POSTGRES as Hyperdrive

		expect(hyperdrive.connectionString).toBe('postgres://user:pass@localhost:5432/app')
		expect(hyperdrive.host).toBe('localhost')
		expect(() => hyperdrive.connect()).toThrow(HYPERDRIVE_CONNECT_MESSAGE)
	})
})
