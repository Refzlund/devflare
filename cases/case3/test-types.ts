import { defineConfig, ref } from 'devflare/config'

const doService = ref(() => import('./do-service/devflare.config'))

// Test: With ref() - does this cause tsc error?
const config = defineConfig({
	name: 'test',
	bindings: {
		durableObjects: {
			SESSION: 'SessionStore',
			COUNTER: doService.COUNTER
		}
	}
})

export default config
