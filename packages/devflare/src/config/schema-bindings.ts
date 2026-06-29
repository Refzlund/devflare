import { z } from 'zod'

/**
 * Durable Object binding input type.
 * Accepts both string shorthand and object form (including DOBindingRef from ref()).
 */
export type DurableObjectBindingInput =
	| string
	| {
			/** The Durable Object class name */
			readonly className: string
			/**
			 * Script name for cross-worker DO access.
			 * For local DOs: file path (e.g., 'do.counter.ts')
			 * For cross-worker DOs: worker name (e.g., 'do-service')
			 */
			readonly scriptName?: string
			/** @internal Reference marker for cross-worker DO bindings */
			readonly __ref?: unknown
	  }

/**
 * Durable Object binding schema.
 * Validates DO binding configuration in either string or object form.
 */
export const durableObjectBindingSchema = z.custom<DurableObjectBindingInput>(
	(val) => {
		if (typeof val === 'string') {
			return true
		}

		if (val && typeof val === 'object' && 'className' in val) {
			const obj = val as Record<string, unknown>
			return typeof obj.className === 'string'
		}

		return false
	},
	{
		message: 'Expected string or { className: string, scriptName?: string }'
	}
)

/**
 * Queue consumer configuration.
 * Defines how messages are consumed from a Cloudflare Queue.
 */
export const queueConsumerSchema = z.object({
	/** Queue name to consume from */
	queue: z.string(),
	/**
	 * Maximum messages per batch (1-100).
	 * @default 10
	 */
	maxBatchSize: z.number().optional(),
	/**
	 * Maximum seconds to wait for a full batch.
	 * @default 5
	 */
	maxBatchTimeout: z.number().optional(),
	/**
	 * Maximum retry attempts for failed messages.
	 * @default 3
	 */
	maxRetries: z.number().optional(),
	/** Queue name to send failed messages after max retries */
	deadLetterQueue: z.string().optional(),
	/** Maximum concurrent batch invocations */
	maxConcurrency: z.number().optional(),
	/** Delay in seconds between retries */
	retryDelay: z.number().optional(),
	/** Milliseconds to wait for pulled messages to become visible again; compiles to `visibility_timeout_ms` */
	visibilityTimeoutMs: z.number().optional()
})

/**
 * Queue producer binding schema.
 * Accepts the queue-name string shorthand or an object form exposing `remote`.
 */
export const queueProducerSchema = z.union([
	z.string(),
	z
		.object({
			/** Queue name this producer writes to */
			queue: z.string().min(1),
			/** Ask Wrangler local development to connect this producer to the remote queue */
			remote: z.boolean().optional(),
			/** Number of seconds to delay messages sent by this producer; compiles to `delivery_delay` */
			deliveryDelay: z.number().optional()
		})
		.strict()
])

/**
 * Queues configuration for producers and consumers.
 */
export const queuesConfigSchema = z.object({
	/**
	 * Queue producer bindings.
	 * Maps binding name to queue name or an object form exposing `remote`.
	 * @example { TASK_QUEUE: 'task-queue' }
	 */
	producers: z.record(z.string(), queueProducerSchema).optional(),
	/**
	 * Queue consumer configurations.
	 * Array of consumer configs for processing queue messages.
	 */
	consumers: z.array(queueConsumerSchema).optional()
})

/**
 * Rate Limiting binding configuration.
 * Devflare uses camelCase authoring and compiles to Wrangler's `ratelimits`
 * array (`namespace_id`, `simple.limit`, `simple.period`).
 */
export const rateLimitBindingSchema = z
	.object({
		/** Positive integer string unique to the Cloudflare account */
		namespaceId: z.string().regex(/^[1-9]\d*$/, 'namespaceId must be a positive integer string'),
		/** Simple rate limiting is the only currently supported Cloudflare mode */
		simple: z
			.object({
				/** Number of allowed calls within the configured period */
				limit: z.number().int().positive(),
				/** Rate limit window in seconds */
				period: z.union([z.literal(10), z.literal(60)])
			})
			.strict()
	})
	.strict()

/**
 * Version Metadata binding configuration.
 */
export const versionMetadataBindingSchema = z
	.object({
		/** Binding name exposed in env (for example, CF_VERSION_METADATA) */
		binding: z.string().min(1)
	})
	.strict()

/**
 * Worker Loader binding configuration for Dynamic Workers.
 */
export const workerLoaderBindingSchema = z.object({}).strict()

/**
 * Secrets Store binding configuration.
 * Devflare accepts object form for explicit per-binding store IDs and string
 * shorthand when the worker sets a top-level `secretsStoreId`.
 */
export const secretsStoreBindingSchema = z.union([
	z.string().min(1),
	z
		.object({
			/** Secrets Store ID containing the account-level secret */
			storeId: z.string().min(1),
			/** Secret name within the store */
			secretName: z.string().min(1)
		})
		.strict()
])

/**
 * Service binding schema.
 * Binds to another Worker for RPC-style communication.
 * Accepts plain objects or WorkerBinding from ref().worker.
 */
const serviceBindingKeys = new Set([
	'service',
	'environment',
	'entrypoint',
	'remote',
	'props',
	'__ref'
])

function isServiceBindingValue(val: unknown): boolean {
	if ((typeof val !== 'object' && typeof val !== 'function') || val === null) {
		return false
	}

	const obj = val as Record<string, unknown>
	if (typeof obj.service !== 'string' || obj.service.trim().length === 0) {
		return false
	}

	if (
		obj.environment !== undefined &&
		(typeof obj.environment !== 'string' || obj.environment.trim().length === 0)
	) {
		return false
	}

	if (
		obj.entrypoint !== undefined &&
		(typeof obj.entrypoint !== 'string' || obj.entrypoint.trim().length === 0)
	) {
		return false
	}

	if (obj.remote !== undefined && typeof obj.remote !== 'boolean') {
		return false
	}

	if (
		obj.props !== undefined &&
		(typeof obj.props !== 'object' || obj.props === null || Array.isArray(obj.props))
	) {
		return false
	}

	if (typeof val === 'object') {
		for (const key of Object.keys(obj)) {
			if (!serviceBindingKeys.has(key)) {
				return false
			}
		}
	}

	return true
}

export const serviceBindingSchema = z.custom<{
	/** Target worker/service name */
	service: string
	/** Optional environment (staging, production, etc.) */
	environment?: string
	/** Optional entrypoint class name for named exports */
	entrypoint?: string
	/** Ask Wrangler local development to connect this binding to the remote service */
	remote?: boolean
	/** Arbitrary props made available to the target worker via `ctx.props` */
	props?: Record<string, unknown>
	/** @internal Reference marker for ref() bindings */
	__ref?: unknown
}>(isServiceBindingValue, {
	message:
		'Expected service binding object with { service: string, environment?: string, entrypoint?: string, remote?: boolean, props?: Record<string, unknown> } or ref().worker'
})

/**
 * AI binding configuration.
 * Provides access to Cloudflare Workers AI for inference.
 */
export const aiBindingSchema = z
	.object({
		/** Binding name exposed in env (e.g., 'AI') */
		binding: z.string(),
		/** Ask Wrangler local development to connect this binding to the remote Workers AI service */
		remote: z.boolean().optional(),
		/** Use Cloudflare's staging Workers AI environment for this binding */
		staging: z.boolean().optional()
	})
	.strict()

/**
 * AI Search namespace binding configuration.
 * Provides access to all AI Search instances in a namespace.
 */
export const aiSearchNamespaceBindingSchema = z
	.object({
		/** AI Search namespace name */
		namespace: z.string().min(1),
		/** Ask Wrangler local development to connect this binding remotely */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * AI Search instance binding configuration.
 * Provides direct access to one AI Search instance in the default namespace.
 */
export const aiSearchInstanceBindingSchema = z
	.object({
		/** AI Search instance name */
		instanceName: z.string().min(1),
		/** Ask Wrangler local development to connect this binding remotely */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * Vectorize index binding configuration.
 * Provides access to a Cloudflare Vectorize index for similarity search.
 */
export const vectorizeBindingSchema = z.object({
	/** Name of the Vectorize index */
	indexName: z.string(),
	/** Ask Wrangler local development to connect this binding to the remote index */
	remote: z.boolean().optional()
})

/**
 * Hyperdrive binding configuration.
 * Provides accelerated PostgreSQL connections via connection pooling.
 */
export const hyperdriveBindingByIdSchema = z
	.object({
		/** Explicit Hyperdrive configuration ID */
		id: z.string(),
		/** Direct database connection string used by local Miniflare/Wrangler dev */
		localConnectionString: z.string().optional()
	})
	.strict()

export const hyperdriveBindingByNameSchema = z
	.object({
		/** Stable Hyperdrive configuration name to resolve to an ID at config/build/deploy time */
		name: z.string(),
		/** Direct database connection string used by local Miniflare/Wrangler dev */
		localConnectionString: z.string().optional(),
		/**
		 * Opt-in fallback behavior for preview-scoped Hyperdrive bindings.
		 * When set to `'base'`, Devflare is permitted to reuse the base Hyperdrive
		 * configuration if no dedicated preview Hyperdrive exists in the account.
		 * When omitted, missing preview Hyperdrives cause a config-resolution error.
		 */
		previewFallback: z.literal('base').optional(),
		/** Explicit dedicated preview Hyperdrive configuration ID */
		previewId: z.string().optional(),
		/** Legacy alias for a preview/dev local connection string; prefer localConnectionString */
		previewLocalConnectionString: z.string().optional()
	})
	.strict()

export const hyperdriveBindingSchema = z.union([
	z.string(),
	hyperdriveBindingByIdSchema,
	hyperdriveBindingByNameSchema
])

const SINGLE_BROWSER_BINDING_ERROR_MESSAGE =
	'Devflare currently supports exactly one browser binding because Wrangler only supports a single browser binding.'

export function formatBrowserBindingLimitMessage(bindingNames: string[]): string {
	if (bindingNames.length <= 1) {
		return SINGLE_BROWSER_BINDING_ERROR_MESSAGE
	}

	return `${SINGLE_BROWSER_BINDING_ERROR_MESSAGE} Configured bindings: ${bindingNames.join(', ')}`
}

export function getBrowserBindingNames(bindings: Record<string, unknown> | undefined): string[] {
	return bindings ? Object.keys(bindings) : []
}

/**
 * Browser Rendering binding configuration.
 * Provides headless browser access for rendering/screenshots.
 */
export const browserBindingValueSchema = z.union([
	z.string(),
	z
		.object({
			/** Ask Wrangler local development to connect this binding to the remote Browser Rendering service */
			remote: z.boolean().optional()
		})
		.strict()
])

export const browserBindingSchema = z
	.record(z.string(), browserBindingValueSchema)
	.superRefine((bindings, ctx) => {
		const bindingNames = getBrowserBindingNames(bindings)
		if (bindingNames.length > 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: formatBrowserBindingLimitMessage(bindingNames)
			})
		}
	})

/**
 * Analytics Engine binding configuration.
 * Provides access to Cloudflare Analytics Engine for event logging.
 */
export const analyticsBindingSchema = z.object({
	/** Analytics Engine dataset name */
	dataset: z.string()
})

/**
 * Email sending binding configuration.
 * Enables sending emails via Cloudflare Email Routing.
 */
export const sendEmailBindingSchema = z
	.object({
		/** Restrict this binding to a specific verified destination address */
		destinationAddress: z.string().optional(),
		/** Restrict this binding to a set of verified destination addresses */
		allowedDestinationAddresses: z.array(z.string()).optional(),
		/** Restrict this binding to a set of verified sender addresses */
		allowedSenderAddresses: z.array(z.string()).optional(),
		/** Ask Wrangler local development to connect this binding to the remote Email Routing service */
		remote: z.boolean().optional()
	})
	.refine(
		(binding) => {
			return !(binding.destinationAddress && binding.allowedDestinationAddresses)
		},
		{
			message:
				'sendEmail bindings must use either destinationAddress or allowedDestinationAddresses, not both',
			path: ['allowedDestinationAddresses']
		}
	)

/** Preview, migration, and remote-development fields shared by D1 binding forms. */
const d1BindingExtraShape = {
	/** D1 database ID used during `wrangler dev`; compiles to `preview_database_id` */
	previewDatabaseId: z.string().optional(),
	/** Name of the migrations table; compiles to `migrations_table` */
	migrationsTable: z.string().optional(),
	/** Path to the migrations directory; compiles to `migrations_dir` */
	migrationsDir: z.string().optional(),
	/** Ask Wrangler local development to connect this binding to the remote database */
	remote: z.boolean().optional()
}

export const d1BindingByIdSchema = z
	.object({
		/** Explicit D1 database ID */
		id: z.string(),
		...d1BindingExtraShape
	})
	.strict()

export const d1BindingByNameSchema = z
	.object({
		/** Stable D1 database name to resolve to an ID at config/build/deploy time */
		name: z.string(),
		...d1BindingExtraShape
	})
	.strict()

export const d1BindingSchema = z.union([z.string(), d1BindingByIdSchema, d1BindingByNameSchema])

/** Preview and remote-development fields shared by KV binding forms. */
const kvBindingExtraShape = {
	/** KV namespace ID used during `wrangler dev`; compiles to `preview_id` */
	previewId: z.string().optional(),
	/** Ask Wrangler local development to connect this binding to the remote namespace */
	remote: z.boolean().optional()
}

export const kvBindingByIdSchema = z
	.object({
		/** Explicit KV namespace ID */
		id: z.string(),
		...kvBindingExtraShape
	})
	.strict()

export const kvBindingByNameSchema = z
	.object({
		/** Stable KV namespace name to resolve to an ID at config/build/deploy time */
		name: z.string(),
		...kvBindingExtraShape
	})
	.strict()

export const kvBindingSchema = z.union([z.string(), kvBindingByIdSchema, kvBindingByNameSchema])

/**
 * R2 bucket binding schema.
 * Accepts the bucket-name string shorthand or an object form exposing
 * `remote`, `previewBucketName`, and `jurisdiction`.
 */
export const r2BindingObjectSchema = z
	.object({
		/** R2 bucket name at the edge */
		bucketName: z.string().min(1),
		/** R2 bucket name used during `wrangler dev`; compiles to `preview_bucket_name` */
		previewBucketName: z.string().optional(),
		/** Jurisdiction the bucket exists in; compiles to `jurisdiction` */
		jurisdiction: z.string().optional(),
		/** Ask Wrangler local development to connect this binding to the remote bucket */
		remote: z.boolean().optional()
	})
	.strict()

export const r2BindingSchema = z.union([z.string(), r2BindingObjectSchema])

export const mtlsCertificateBindingByIdSchema = z
	.object({
		/** Uploaded mTLS certificate UUID from `wrangler mtls-certificate upload` */
		certificateId: z.string().min(1),
		/** Ask Wrangler local development to use the remote binding when available */
		remote: z.boolean().optional()
	})
	.strict()

export const mtlsCertificateBindingByWranglerIdSchema = z
	.object({
		/** Wrangler-native uploaded mTLS certificate UUID */
		certificate_id: z.string().min(1),
		/** Ask Wrangler local development to use the remote binding when available */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * C17 — mTLS Certificate binding.
 * The id is the UUID returned by `wrangler mtls-certificate upload`.
 */
export const mtlsCertificateBindingSchema = z.union([
	z.string().min(1),
	mtlsCertificateBindingByIdSchema,
	mtlsCertificateBindingByWranglerIdSchema
])

/**
 * C17 — Workers for Platforms (Dispatch Namespace) binding.
 */
export const dispatchNamespaceBindingSchema = z.union([
	z.string().min(1),
	z
		.object({
			namespace: z.string().min(1),
			outbound: z
				.object({
					service: z.string().min(1),
					environment: z.string().optional(),
					parameters: z.array(z.string()).optional()
				})
				.strict()
				.optional(),
			remote: z.boolean().optional()
		})
		.strict()
])

/**
 * C17 — Workflows-as-binding (a workflow class exposed for another worker
 * to invoke). Distinct from a worker declaring its own workflows.
 */
export const workflowBindingSchema = z
	.object({
		name: z.string().min(1),
		className: z.string().min(1),
		scriptName: z.string().min(1).optional(),
		remote: z.boolean().optional(),
		limits: z
			.object({
				steps: z.number().int().positive()
			})
			.strict()
			.optional()
	})
	.strict()

/**
 * C17 — Cloudflare Pipelines binding.
 */
export const pipelineBindingSchema = z.union([
	z.string().min(1),
	z
		.object({
			pipeline: z.string().min(1),
			remote: z.boolean().optional()
		})
		.strict()
])

/**
 * C17 — Cloudflare Images binding (transformation/upload service).
 */
export const imagesBindingSchema = z
	.object({
		remote: z.boolean().optional()
	})
	.strict()
	.or(z.literal(true))

/**
 * C17 — Cloudflare Media Transformations binding.
 */
export const mediaBindingSchema = z
	.object({
		remote: z.boolean().optional()
	})
	.strict()
	.or(z.literal(true))

/**
 * C17 — Cloudflare Artifacts binding.
 */
export const artifactsBindingSchema = z.union([
	z.string().min(1),
	z
		.object({
			namespace: z.string().min(1),
			remote: z.boolean().optional()
		})
		.strict()
])

/**
 * CF-2 — Cloudflare Stream binding (video upload/playback service).
 * Mirrors the Images/Media singleton shape: `true` shorthand or `{ remote? }`.
 */
export const streamBindingSchema = z
	.object({
		/** Ask Wrangler local development to connect this binding to the remote Stream service */
		remote: z.boolean().optional()
	})
	.strict()
	.or(z.literal(true))

/**
 * CF-2 — VPC service binding. Connects the Worker to a private service through
 * a Cloudflare VPC connectivity service. Compiles to wrangler's `vpc_services`.
 */
export const vpcServiceBindingSchema = z
	.object({
		/** Service ID of the VPC connectivity service; compiles to `service_id` */
		serviceId: z.string().min(1),
		/** Ask Wrangler local development to connect this binding to the remote VPC service */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * CF-2 — VPC network binding routed through a Cloudflare Tunnel (`tunnelId`).
 */
export const vpcNetworkByTunnelSchema = z
	.object({
		/** Tunnel ID of the Cloudflare Tunnel; compiles to `tunnel_id`. Mutually exclusive with networkId */
		tunnelId: z.string().min(1),
		/** Ask Wrangler local development to connect this binding to the remote VPC network */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * CF-2 — VPC network binding routed through a network ID (`networkId`).
 */
export const vpcNetworkByNetworkSchema = z
	.object({
		/** Network ID to route traffic through; compiles to `network_id`. Mutually exclusive with tunnelId */
		networkId: z.string().min(1),
		/** Ask Wrangler local development to connect this binding to the remote VPC network */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * CF-2 — VPC network binding. Use exactly one of `tunnelId` or `networkId`.
 */
export const vpcNetworkBindingSchema = z.union([
	vpcNetworkByTunnelSchema,
	vpcNetworkByNetworkSchema
])

/**
 * CF-2 — Flagship feature-flag binding. Compiles to wrangler's `flagship`
 * array (`app_id`).
 */
export const flagshipBindingSchema = z
	.object({
		/** Flagship app ID to bind to; compiles to `app_id` */
		appId: z.string().min(1),
		/** Ask Wrangler local development to use the remote Flagship service for flag evaluation */
		remote: z.boolean().optional()
	})
	.strict()

/**
 * All worker bindings configuration.
 * Defines connections to Cloudflare services and resources.
 */
export const bindingsSchema = z
	.object({
		/**
		 * KV Namespace bindings.
		 * Maps binding name to either a stable KV namespace name or an explicit resolver object.
		 */
		kv: z.record(z.string(), kvBindingSchema).optional(),

		/**
		 * D1 Database bindings.
		 * Maps binding name to either a stable D1 database name or an explicit resolver object.
		 */
		d1: z.record(z.string(), d1BindingSchema).optional(),

		/**
		 * R2 Bucket bindings.
		 * Maps binding name to an R2 bucket name or an explicit object form.
		 */
		r2: z.record(z.string(), r2BindingSchema).optional(),

		/**
		 * Durable Object bindings.
		 * Maps binding name to DO class configuration.
		 */
		durableObjects: z.record(z.string(), durableObjectBindingSchema).optional(),

		/**
		 * Queue bindings for producers and consumers.
		 */
		queues: queuesConfigSchema.optional(),

		/**
		 * Rate Limiting bindings.
		 */
		rateLimits: z.record(z.string(), rateLimitBindingSchema).optional(),

		/**
		 * Version Metadata binding.
		 */
		versionMetadata: versionMetadataBindingSchema.optional(),

		/**
		 * Worker Loader bindings for Dynamic Workers.
		 */
		workerLoaders: z.record(z.string(), workerLoaderBindingSchema).optional(),

		/**
		 * Secrets Store bindings.
		 */
		secretsStore: z.record(z.string(), secretsStoreBindingSchema).optional(),

		/**
		 * Service bindings to other Workers.
		 * Enables RPC-style communication between workers.
		 */
		services: z.record(z.string(), serviceBindingSchema).optional(),

		/**
		 * Workers AI binding for ML inference.
		 */
		ai: aiBindingSchema.optional(),

		/**
		 * AI Search namespace bindings.
		 */
		aiSearchNamespaces: z.record(z.string(), aiSearchNamespaceBindingSchema).optional(),

		/**
		 * AI Search instance bindings.
		 */
		aiSearch: z.record(z.string(), aiSearchInstanceBindingSchema).optional(),

		/**
		 * Vectorize index bindings for vector similarity search.
		 */
		vectorize: z.record(z.string(), vectorizeBindingSchema).optional(),

		/**
		 * Hyperdrive bindings for accelerated PostgreSQL.
		 */
		hyperdrive: z.record(z.string(), hyperdriveBindingSchema).optional(),

		/**
		 * Browser Rendering binding for headless browser access.
		 */
		browser: browserBindingSchema.optional(),

		/**
		 * Analytics Engine bindings for event logging.
		 */
		analyticsEngine: z.record(z.string(), analyticsBindingSchema).optional(),

		/**
		 * Email sending bindings.
		 */
		sendEmail: z.record(z.string(), sendEmailBindingSchema).optional(),

		/**
		 * C17 — mTLS Certificate bindings.
		 * Maps a binding name to the certificate UUID issued via
		 * `wrangler mtls-certificate upload`. The runtime exposes the certificate
		 * to the worker as `env.<binding>` for use with `fetch`'s `mTLS` option.
		 */
		mtlsCertificates: z.record(z.string(), mtlsCertificateBindingSchema).optional(),

		/**
		 * C17 — Workers for Platforms (Dispatch Namespace) bindings.
		 * Maps a binding name to the dispatch namespace name. Allows a parent
		 * worker to look up and dispatch to user workers stored in the namespace.
		 */
		dispatchNamespaces: z.record(z.string(), dispatchNamespaceBindingSchema).optional(),

		/**
		 * C17 — Workflows-as-binding.
		 * Maps a binding name to a workflow class hosted by another worker (or
		 * the same worker, via `scriptName`). Distinct from `bindings.workflows`
		 * declarations of workflows defined IN this worker.
		 */
		workflows: z.record(z.string(), workflowBindingSchema).optional(),

		/**
		 * C17 — Pipelines bindings.
		 * Maps a binding name to a Cloudflare Pipelines pipeline (R2-backed
		 * streaming ingestion).
		 */
		pipelines: z.record(z.string(), pipelineBindingSchema).optional(),

		/**
		 * C17 — Cloudflare Images binding.
		 * Maps a binding name to access the Images service from the worker
		 * (transformation/upload via `env.<binding>`).
		 */
		images: z
			.record(z.string(), imagesBindingSchema)
			.optional()
			.superRefine((bindings, ctx) => {
				if (!bindings || Object.keys(bindings).length <= 1) {
					return
				}

				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Wrangler currently supports one Images binding per Worker'
				})
			}),

		/**
		 * C17 — Cloudflare Media Transformations binding.
		 * Maps a binding name to access the Media Transformations service from
		 * the worker (video/audio/frame extraction via `env.<binding>`).
		 */
		media: z
			.record(z.string(), mediaBindingSchema)
			.optional()
			.superRefine((bindings, ctx) => {
				if (!bindings || Object.keys(bindings).length <= 1) {
					return
				}

				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Wrangler currently supports one Media Transformations binding per Worker'
				})
			}),

		/**
		 * C17 — Cloudflare Artifacts bindings.
		 * Maps a binding name to an Artifacts namespace for Git-compatible
		 * file storage.
		 */
		artifacts: z.record(z.string(), artifactsBindingSchema).optional(),

		/**
		 * CF-2 — Cloudflare Stream binding.
		 * Maps a binding name to access the Stream service from the worker
		 * (video upload/playback via `env.<binding>`).
		 */
		stream: z
			.record(z.string(), streamBindingSchema)
			.optional()
			.superRefine((bindings, ctx) => {
				if (!bindings || Object.keys(bindings).length <= 1) {
					return
				}

				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Wrangler currently supports one Stream binding per Worker'
				})
			}),

		/**
		 * CF-2 — VPC service bindings.
		 * Maps a binding name to a Cloudflare VPC connectivity service that
		 * reaches a private service.
		 */
		vpcServices: z.record(z.string(), vpcServiceBindingSchema).optional(),

		/**
		 * CF-2 — VPC network bindings.
		 * Maps a binding name to a VPC network routed through a Cloudflare
		 * Tunnel or a network ID.
		 */
		vpcNetworks: z.record(z.string(), vpcNetworkBindingSchema).optional(),

		/**
		 * CF-2 — Flagship feature-flag bindings.
		 * Maps a binding name to a Flagship app for feature-flag evaluation.
		 */
		flagship: z.record(z.string(), flagshipBindingSchema).optional()
	})
	.optional()

export type BrowserBindings = z.infer<typeof browserBindingSchema>
export type BrowserBinding = z.infer<typeof browserBindingValueSchema>
export type D1Binding = z.infer<typeof d1BindingSchema>
export type DurableObjectBinding = z.infer<typeof durableObjectBindingSchema>
export type HyperdriveBinding = z.infer<typeof hyperdriveBindingSchema>
export type KVBinding = z.infer<typeof kvBindingSchema>
export type R2Binding = z.infer<typeof r2BindingSchema>
export type QueueProducer = z.infer<typeof queueProducerSchema>
export type QueueConsumer = z.infer<typeof queueConsumerSchema>
export type QueuesConfig = z.infer<typeof queuesConfigSchema>
export type RateLimitBinding = z.infer<typeof rateLimitBindingSchema>
export type VersionMetadataBinding = z.infer<typeof versionMetadataBindingSchema>
export type WorkerLoaderBinding = z.infer<typeof workerLoaderBindingSchema>
export type SecretsStoreBinding = z.infer<typeof secretsStoreBindingSchema>
export type ServiceBinding = z.infer<typeof serviceBindingSchema>
export type AiSearchNamespaceBinding = z.infer<typeof aiSearchNamespaceBindingSchema>
export type AiSearchInstanceBinding = z.infer<typeof aiSearchInstanceBindingSchema>
export type MtlsCertificateBinding = z.infer<typeof mtlsCertificateBindingSchema>
export type DispatchNamespaceBinding = z.infer<typeof dispatchNamespaceBindingSchema>
export type WorkflowBinding = z.infer<typeof workflowBindingSchema>
export type PipelineBinding = z.infer<typeof pipelineBindingSchema>
export type ImagesBinding = z.infer<typeof imagesBindingSchema>
export type MediaBinding = z.infer<typeof mediaBindingSchema>
export type ArtifactsBinding = z.infer<typeof artifactsBindingSchema>
export type StreamBinding = z.infer<typeof streamBindingSchema>
export type VpcServiceBinding = z.infer<typeof vpcServiceBindingSchema>
export type VpcNetworkBinding = z.infer<typeof vpcNetworkBindingSchema>
export type FlagshipBinding = z.infer<typeof flagshipBindingSchema>
