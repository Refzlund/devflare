import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case14-hyperdrive',
	compatibilityDate: '2026-04-26',

	bindings: {
		// Hyperdrive for PostgreSQL connection pooling
		// Prefer the stable configured name over a raw Hyperdrive configuration id
		hyperdrive: {
			DB: 'devflare-testing'
		}
	}
})
