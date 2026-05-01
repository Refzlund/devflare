import type { DocPage } from '../../types'

export const docsLink = (slug: string): string => `/docs/${slug}`

export const projectShapeConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		durableObjects: 'src/do/**/*.ts',
		transport: null
	},
	assets: {
		directory: 'public'
	}
})`

export const fullConfigExampleCode = String.raw`import { defineConfig, env } from 'devflare/config'

export default defineConfig({
	name: 'docs-platform',
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	compatibilityDate: '2026-03-17',
	compatibilityFlags: ['urlpattern_polyfill'],
	previews: {
		includeCrons: false
	},
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts',
		entrypoints: 'src/ep/**/*.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		workflows: 'src/workflows/**/*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		kv: {
			CACHE: 'docs-cache'
		},
		d1: {
			PRIMARY_DB: 'docs-db'
		},
		r2: {
			UPLOADS: 'docs-uploads'
		},
		durableObjects: {
			CHAT_ROOMS: 'ChatRoom'
		},
		queues: {
			producers: {
				EMAILS: 'docs-emails'
			},
			consumers: [
				{
					queue: 'docs-emails',
					deadLetterQueue: 'docs-emails-dlq',
					maxBatchSize: 50,
					maxBatchTimeout: 10,
					maxRetries: 5,
					maxConcurrency: 2,
					retryDelay: 30
				}
			]
		},
		services: {
			AUTH: {
				service: 'auth-worker'
			}
		},
		ai: {
			binding: 'AI'
		},
		vectorize: {
			SEARCH_INDEX: {
				indexName: 'docs-search'
			}
		},
		hyperdrive: {
			APP_DB: 'docs-primary-db'
		},
		browser: {
			BROWSER: 'browser'
		},
		analyticsEngine: {
			REQUESTS: {
				dataset: 'docs_requests'
			}
		},
		sendEmail: {
			MAILER: {
				destinationAddress: 'team@example.com'
			}
		}
	},
	triggers: {
		crons: ['0 */6 * * *']
	},
	vars: {
		APP_ENV: 'development',
		mongo: {
			uri: env.MONGOURI,
			database: env.MONGODATABASE
		},
		retries: env.RETRIES.parse(Number)
	},
	secrets: {
		API_TOKEN: {
			required: true
		}
	},
	routes: [
		{
			pattern: 'docs.example.com/*',
			custom_domain: true
		}
	],
	wsRoutes: [
		{
			pattern: '/ws/:id',
			doNamespace: 'CHAT_ROOMS',
			idParam: 'id',
			forwardPath: '/websocket'
		}
	],
	assets: {
		directory: 'static',
		binding: 'ASSETS'
	},
	limits: {
		cpu_ms: 50
	},
	observability: {
		enabled: true,
		head_sampling_rate: 1
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatRoom']
		}
	],
	rolldown: {
		target: 'es2022',
		minify: true,
		sourcemap: true,
		options: {}
	},
	vite: {
		plugins: []
	},
	env: {
		preview: {
			vars: {
				APP_ENV: 'preview'
			},
			previews: {
				includeCrons: false
			},
			observability: {
				enabled: true,
				head_sampling_rate: 1
			}
		},
		production: {
			vars: {
				APP_ENV: 'production'
			}
		}
	},
	wrangler: {
		passthrough: {
			logpush: true
		}
	}
})`

export const typedEnvVarsConfigCode = String.raw`import { defineConfig, env } from 'devflare/config'

export default defineConfig({
	name: 'voices-api',
	vars: {
		secret: env.SECRET,
		mongo: {
			uri: env.MONGOURI,
			database: env.MONGODATABASE
		},
		retries: env.RETRIES.parse(Number),
		optionalLabel: env.OPTIONAL_LABEL.optional(),
		mode: env.APP_MODE.default('local'),
		mockTenantId: env.MOCK_TENANT_ID.dev(123)
	}
})`

export const typedEnvVarsRuntimeCode = String.raw`import { vars } from 'devflare'

export default {
	async fetch() {
		return Response.json({
			database: vars.mongo.database,
			retries: vars.retries
		})
	}
}`

export const typedEnvVarsDotenvCode = String.raw`# .env.dev
SECRET=local-secret
MONGOURI=mongodb://127.0.0.1:27017
MONGODATABASE=voices_dev
RETRIES=1

# .env
MONGODATABASE=voices`

export const environmentOverlayCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			CACHE: 'notes-cache'
		}
	},
	vars: {
		APP_ENV: 'local'
	},
	env: {
		preview: {
			bindings: {
				kv: {
					CACHE: 'notes-preview-cache'
				}
			},
			vars: {
				APP_ENV: 'preview'
			},
			previews: {
				includeCrons: false
			}
		},
		production: {
			vars: {
				APP_ENV: 'production'
			},
			observability: {
				enabled: true,
				head_sampling_rate: 1
			}
		}
	}
})`

export const previewBindingsConfigCode = String.raw`import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	name: 'notes-api',
	bindings: {
		kv: {
			CACHE: pv('notes-cache-kv')
		},
		d1: {
			PRIMARY_DB: pv('notes-db')
		},
		r2: {
			UPLOADS: pv('notes-uploads-bucket')
		},
		queues: {
			producers: {
				EMAILS: pv('notes-emails-queue')
			},
			consumers: [
				{
					queue: pv('notes-emails-queue'),
					deadLetterQueue: pv('notes-emails-dlq')
				}
			]
		}
	},
	env: {
		preview: {
			vars: {
				APP_ENV: 'preview'
			}
		},
		production: {
			bindings: {
				kv: {
					CACHE: 'notes-cache-kv-production'
				},
				d1: {
					PRIMARY_DB: 'notes-db-production'
				}
			},
			vars: {
				APP_ENV: 'production'
			}
		}
	}
})`

export const previewBindingsLifecycleCode = String.raw`bunx --bun devflare deploy --preview next
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews cleanup --scope next --apply`

export const workerSurfacesConfigCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'jobs-worker',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		routes: false
	},
	triggers: {
		crons: ['0 */6 * * *']
	},
	previews: {
		includeCrons: false
	}
})`

export const runtimeDeploySettingsCode = String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'docs-site',
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	compatibilityDate: '2026-03-17',
	assets: {
		directory: 'static',
		binding: 'ASSETS'
	},
	routes: [
		{ pattern: 'docs.example.com/*', custom_domain: true }
	],
	wsRoutes: [
		{
			pattern: '/ws/:id',
			doNamespace: 'CHAT_ROOMS'
		}
	],
	limits: {
		cpu_ms: 50
	},
	observability: {
		enabled: true,
		head_sampling_rate: 1
	},
	previews: {
		includeCrons: false
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatRoom']
		}
	]
})`

export const generatedTypesOutputCode = String.raw`// Generated by devflare - DO NOT EDIT
// Run devflare types to regenerate

import type { MathServiceInterface } from '../src/math-service.types'
import type { AdminEntrypointInterface } from '../src/math-service.types'

declare global {
	interface DevflareEnv {
		MATH_SERVICE: MathServiceInterface
		ADMIN: AdminEntrypointInterface
	}
}

/**
 * Named entrypoints discovered from ep.*.ts files.
 * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.
 */
export type Entrypoints = 'AdminEntrypoint'`
