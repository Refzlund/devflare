import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case19-minimal-test',
	// compatibilityDate is optional - defaults to current date
	// compatibilityFlags is optional - nodejs_compat and nodejs_als are always forced
	
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter', scriptName: 'do.counter.ts' }
		}
	}
})
