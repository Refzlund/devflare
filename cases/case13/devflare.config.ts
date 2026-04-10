import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case13-tail-workers',

	// This case calls src/tail.ts directly in tests while tail helper wiring
	// remains a manual/advanced path.

	bindings: {
		// KV for storing processed log entries
		kv: {
			LOG_STORE: 'log-store-kv-id'
		}
	},

	vars: {
		// Minimum log level to capture
		MIN_LOG_LEVEL: 'log'
	}
})
