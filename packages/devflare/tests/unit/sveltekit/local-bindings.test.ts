import { describe, expect, test } from 'bun:test'
import { buildSvelteKitLocalBindings } from '../../../src/sveltekit/local-bindings'
import { HYPERDRIVE_CONNECT_MESSAGE } from '../../../src/shims/local-hyperdrive'

describe('buildSvelteKitLocalBindings', () => {
	test('exposes config vars as normal synchronous platform.env strings', () => {
		const bindings = buildSvelteKitLocalBindings({
			name: 'sveltekit-vars',
			vars: {
				API_ORIGIN: 'http://127.0.0.1:8791'
			}
		}, process.cwd())

		expect(bindings.API_ORIGIN).toBe('http://127.0.0.1:8791')
		expect(String(bindings.API_ORIGIN)).toBe('http://127.0.0.1:8791')
	})

	test('builds a Hyperdrive binding whose connect() throws the shared message', () => {
		const bindings = buildSvelteKitLocalBindings({
			name: 'sveltekit-hyperdrive',
			bindings: {
				hyperdrive: {
					POSTGRES: {
						id: 'hd-id',
						localConnectionString: 'postgres://user:pass@localhost:5432/app'
					}
				}
			}
		}, process.cwd())

		const hyperdrive = bindings.POSTGRES as Hyperdrive

		expect(hyperdrive.connectionString).toBe('postgres://user:pass@localhost:5432/app')
		expect(hyperdrive.host).toBe('localhost')
		expect(() => hyperdrive.connect()).toThrow(HYPERDRIVE_CONNECT_MESSAGE)
	})
})
