import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case7-edge-cases',

	bindings: {
		kv: {
			CACHE: 'cache-kv-id'
		}
	}
})
