import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case1-basic-worker',

	bindings: {
		kv: {
			CACHE: 'cache-kv-id'
		}
	},

	vars: {
		LOG_LEVEL: 'info'
	}
})
