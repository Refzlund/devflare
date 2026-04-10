import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'do-service',

	files: {
		// fetch.ts is at root (not in src/), so we must specify it
		fetch: 'fetch.ts',
		// Non-recursive pattern (intentionally more restrictive than default **/do.*.{ts,js})
		durableObjects: 'do.*.ts'
	},

	bindings: {
		// Local bindings for the DOs hosted in this worker
		durableObjects: {
			COUNTER: {
				className: 'Counter',
				scriptName: 'do.counter.ts'
			},
			RATE_LIMITER: {
				className: 'RateLimiter',
				scriptName: 'do.rate-limiter.ts'
			}
		}
	}
})
