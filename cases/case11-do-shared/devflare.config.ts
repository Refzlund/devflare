import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case11-do-shared',
	compatibilityDate: '2026-04-26',

	bindings: {
		// Local bindings for the DOs hosted in this worker
		durableObjects: {
			SESSION_STORE: 'SessionStore'
		}
	}
})
