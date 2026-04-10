import { defineConfig, ref } from 'devflare/config'

// =============================================================================
// Case 3: Cross-Worker Durable Objects
// =============================================================================
// This case demonstrates:
// 1. Local DOs: SESSION and TRACKER (unique to this worker)
// 2. Cross-worker DOs: COUNTER and RATE_LIMITER (hosted by do-service)
//
// Cross-Worker Pattern:
//   1. Create a ref() to the worker that hosts the DOs
//   2. Use ref.BINDING_NAME to get a cross-worker DO binding
//   3. Access the DO like any other: env.COUNTER.idFromName('x').get()
//
// The test context automatically sets up multi-worker Miniflare when it
// detects cross-worker DO bindings (those with __ref).
// =============================================================================

const doService = ref(() => import('./do-service/devflare.config'))

export default defineConfig({
	name: 'case3-durable-objects',

	bindings: {
		durableObjects: {
			// Local DOs — unique to case3, hosted by this worker
			// Uses simplified string syntax: BINDING: 'ClassName'
			SESSION: 'SessionStore',
			TRACKER: 'RequestTracker',

			// Cross-worker DOs — hosted by do-service
			// doService.COUNTER returns { className: 'Counter', scriptName: 'do-service', __ref }
			COUNTER: doService.COUNTER,
			RATE_LIMITER: doService.RATE_LIMITER
		}
	}
})
