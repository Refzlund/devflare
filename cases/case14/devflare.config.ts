import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case14-hyperdrive',

	bindings: {
		// Hyperdrive for PostgreSQL connection pooling
		// In local dev, we use Bun's built-in SQL with SQLite
		hyperdrive: {
			DB: { id: 'hyperdrive-config-id' }
		}
	}
})
