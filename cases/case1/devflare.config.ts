import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case1-basic-worker',
	compatibilityDate: '2026-04-26',

	bindings: {
		kv: {
			CACHE: 'cache-kv-id'
		}
	},

	vars: {
		LOG_LEVEL: 'info'
	}
})
