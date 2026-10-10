import { defineConfig, ref } from 'devflare/config'

const apiWorker = ref('case18-service-api', () => import('./devflare.service-api.config'))

export default defineConfig({
	name: 'case18-sveltekit-local-bindings',
	compatibilityDate: '2026-04-27',
	files: {
		fetch: false,
		workflows: 'src/wf.*.ts',
		transport: 'src/transport.ts'
	},
	vars: {
		CASE18_STRING_VAR: 'case18-var-value'
	},
	secretsStoreId: 'case18-local-store',
	bindings: {
		services: {
			CASE18_API: apiWorker.worker('Case18Api')
		},
		hyperdrive: {
			POSTGRES: {
				id: 'case18-hyperdrive',
				localConnectionString: 'postgres://case18:password@localhost:5432/case18'
			}
		},
		workerLoaders: {
			WORKER_LOADER: {}
		},
		workflows: {
			ORDER_WORKFLOW: {
				name: 'case18-order-workflow',
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
