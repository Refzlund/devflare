// =============================================================================
// Case 20: SvelteKit 3 local binding matrix
// =============================================================================
// The binding matrix case18 runs on SvelteKit 2, on SvelteKit 3: the app reads
// every binding from `cloudflare:workers` rather than `event.platform`.
// =============================================================================

import { defineConfig, ref } from 'devflare/config'

const apiWorker = ref('case20-service-api', () => import('./devflare.service-api.config'))

export default defineConfig({
	name: 'case20-sveltekit3',
	compatibilityDate: '2026-04-27',
	files: {
		// SvelteKit writes the Worker entry during build, so Devflare does not compose it.
		fetch: false,
		workflows: 'src/wf.*.ts'
	},
	vars: {
		CASE20_STRING_VAR: 'case20-var-value'
	},
	secretsStoreId: 'case20-local-store',
	bindings: {
		services: {
			CASE20_API: apiWorker.worker('Case20Api')
		},
		hyperdrive: {
			POSTGRES: {
				id: 'case20-hyperdrive',
				localConnectionString: 'postgres://case20:password@localhost:5432/case20'
			}
		},
		workerLoaders: {
			WORKER_LOADER: {}
		},
		workflows: {
			ORDER_WORKFLOW: {
				name: 'case20-order-workflow',
				className: 'OrderWorkflow'
			}
		},
		images: {
			IMAGES_SERVICE: true
		},
		media: {
			MEDIA_SERVICE: true
		},
		secretsStore: {
			API_TOKEN: 'api-token'
		},
		sendEmail: {
			EMAIL: {
				destinationAddress: 'recipient@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		}
	},
	wrangler: {
		passthrough: {
			main: '.svelte-kit/cloudflare/_worker.js'
		}
	}
})
