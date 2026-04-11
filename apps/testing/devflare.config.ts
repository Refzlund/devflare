import { defineConfig, ref } from '../../packages/devflare/src/config-entry'
import { resolveTestingWorkerNames } from './worker-names'

const accountId = (
	globalThis as typeof globalThis & {
		process?: { env?: Record<string, string | undefined> }
	}
).process?.env?.CLOUDFLARE_ACCOUNT_ID?.trim()
const workerNames = resolveTestingWorkerNames()
const authService = ref(workerNames.authServiceName, () => import('./workers/auth-service/devflare.config'))
const searchService = ref(workerNames.searchServiceName, () => import('./workers/search-service/devflare.config'))

export default defineConfig({
	name: workerNames.mainWorkerName,
	compatibilityDate: '2026-04-08',
	accountId,
	compatibilityFlags: ['nodejs_compat'],

	// This config is the repo's deploy-oriented, real-world testing app.
	// It keeps the exhaustive binding matrix, but pairs it with actual source
	// files, sidecar workers, queue/scheduled handlers, and guarded smoke routes
	// so public requests stay cheap and safe by default.
	bindings: {
		kv: {
			// devflare-testing-cache-kv
			CACHE: 'devflare-testing-cache-kv',
			// devflare-testing-sessions-kv
			SESSIONS: 'devflare-testing-sessions-kv'
		},

		d1: {
			PRIMARY_DB: 'devflare-testing-primary-db',
			AUDIT_DB: { name: 'devflare-testing-audit-db' },
			LEGACY_DB: { name: 'devflare-testing-legacy-db' }
		},

		r2: {
			ASSETS: 'devflare-testing-assets-bucket',
			ARCHIVE: 'devflare-testing-archive-bucket'
		},

		durableObjects: {
			SESSION_ROOM: 'SessionRoom',
			COLLABORATION_STATE: { className: 'CollaborationState' },
			CROSS_WORKER_LOCK: 'CrossWorkerLock'
		},

		queues: {
			producers: {
				JOBS: 'devflare-testing-jobs-queue',
				EMAILS: 'devflare-testing-emails-queue'
			},
			consumers: [
				{
					queue: 'devflare-testing-jobs-queue',
					maxBatchSize: 10,
					maxBatchTimeout: 5,
					maxRetries: 3,
					maxConcurrency: 2,
					retryDelay: 30,
					deadLetterQueue: 'devflare-testing-jobs-dlq'
				},
				{
					queue: 'devflare-testing-emails-queue',
					maxBatchSize: 25,
					maxBatchTimeout: 3,
					maxRetries: 5,
					deadLetterQueue: 'devflare-testing-emails-dlq'
				}
			]
		},

		services: {
			AUTH_SERVICE: authService.worker,
			ADMIN_RPC: authService.worker('AdminEntrypoint'),
			SEARCH_SERVICE: searchService.worker
		},

		ai: {
			binding: 'AI'
		},

		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'devflare-testing-document-index'
			},
			SEARCH_INDEX: {
				indexName: 'devflare-testing-search-index'
			}
		},

		hyperdrive: {
			// Requires a real Hyperdrive config backed by a real database.
			// Prefer the stable configured name over a raw id so Devflare can resolve it when needed.
			POSTGRES: 'devflare-testing'
		},

		browser: {
			BROWSER: 'devflare-testing-browser'
		},

		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'devflare-testing-app-analytics'
			},
			SEARCH_ANALYTICS: {
				dataset: 'devflare-testing-search-analytics'
			}
		},

		sendEmail: {
			TRANSACTIONAL_EMAIL: {
				allowedDestinationAddresses: ['ops@example.com', 'support@example.com'],
				allowedSenderAddresses: ['noreply@example.com']
			},
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	},

	vars: {
		APP_NAME: 'testing-binding-matrix',
		DEPLOYMENT_CHANNEL: 'development',
		AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
		BROWSER_TARGET_URL: 'https://example.com/',
		MAIL_FROM: 'noreply@example.com',
		OPS_EMAIL: 'ops@example.com',
		SUPPORT_EMAIL_ADDRESS: 'support@example.com'
	},

	env: {
		preview: {
			vars: {
				APP_NAME: 'testing-binding-matrix-preview',
				DEPLOYMENT_CHANNEL: 'preview'
			},
			bindings: {
				kv: {
					// devflare-testing-cache-kv-preview
					CACHE: 'devflare-testing-cache-kv-preview'
				},
				r2: {
					ASSETS: 'devflare-testing-assets-bucket-preview'
				}
			}
		},
		production: {
			vars: {
				APP_NAME: 'testing-binding-matrix-production',
				DEPLOYMENT_CHANNEL: 'production'
			},
			bindings: {
				kv: {
					// devflare-testing-cache-kv-production
					CACHE: 'devflare-testing-cache-kv-production'
				},
				r2: {
					ASSETS: 'devflare-testing-assets-bucket-production'
				}
			}
		}
	},

	secrets: {
		API_TOKEN: {},
		SMOKE_KEY: {
			required: false
		},
		OPTIONAL_WEBHOOK_SECRET: {
			required: false
		}
	},

	triggers: {
		crons: ['0 */6 * * *']
	},

	migrations: [
		{
			tag: 'v1',
			new_classes: ['SessionRoom', 'CollaborationState', 'CrossWorkerLock']
		}
	]
})