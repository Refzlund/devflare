import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case7-edge-cases',
	compatibilityDate: '2026-04-26',

	bindings: {
		kv: {
			CACHE: 'cache-kv-id'
		}
	}
})
