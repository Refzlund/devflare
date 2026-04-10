import { defineConfig, ref } from 'devflare/config'

// Reference the math-service worker's config
// Returns a synchronous proxy - no await needed
const mathWorker = ref(() => import('./math-service/devflare.config'))

export default defineConfig({
	name: 'case5-gateway',

	bindings: {
		// Service bindings to other workers (RPC-style)
		services: {
			// Default worker.ts export (transformed to WorkerEntrypoint)
			MATH_SERVICE: mathWorker.worker,

			// Named entrypoint (class extending WorkerEntrypoint in ep.admin.ts)
			ADMIN: mathWorker.worker('AdminEntrypoint')
		}
	}
})
