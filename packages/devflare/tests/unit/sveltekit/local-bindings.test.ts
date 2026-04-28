import { describe, expect, test } from 'bun:test'
import { buildSvelteKitLocalBindings } from '../../../src/sveltekit/local-bindings'

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
})
