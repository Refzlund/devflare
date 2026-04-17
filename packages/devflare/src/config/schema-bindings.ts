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
export const durableObjectBindingSchema = z.custom<DurableObjectBindingInput>((val) => {
	if (typeof val === 'string') {
		return true
	}

	if (val && typeof val === 'object' && 'className' in val) {
		const obj = val as Record<string, unknown>
		return typeof obj.className === 'string'
	}

	return false
}, {
	message: 'Expected string or { className: string, scriptName?: string }'
})

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
	retryDelay: z.number().optional()
})

/**
 * Queues configuration for producers and consumers.
 */
export const queuesConfigSchema = z.object({
	/**
	 * Queue producer bindings.
	 * Maps binding name to queue name.
	 * @example { TASK_QUEUE: 'task-queue' }
	 */
	producers: z.record(z.string(), z.string()).optional(),
	/**
	 * Queue consumer configurations.
	 * Array of consumer configs for processing queue messages.
	 */
	consumers: z.array(queueConsumerSchema).optional()
})

/**
 * Service binding schema.
 * Binds to another Worker for RPC-style communication.
 * Accepts plain objects or WorkerBinding from ref().worker.
 */
export const serviceBindingSchema = z.custom<{
	/** Target worker/service name */
	service: string
	/** Optional environment (staging, production, etc.) */
	environment?: string
	/** Optional entrypoint class name for named exports */
	entrypoint?: string
	/** @internal Reference marker for ref() bindings */
	__ref?: unknown
}>((val) => {
	if (typeof val !== 'object' && typeof val !== 'function') {
		return false
	}

	const obj = val as Record<string, unknown>
	return typeof obj.service === 'string'
}, {
	message: 'Expected service binding object with { service: string } or ref().worker'
})

/**
 * AI binding configuration.
 * Provides access to Cloudflare Workers AI for inference.
 */
export const aiBindingSchema = z.object({
	/** Binding name exposed in env (e.g., 'AI') */
	binding: z.string()
})

/**
 * Vectorize index binding configuration.
 * Provides access to a Cloudflare Vectorize index for similarity search.
 */
export const vectorizeBindingSchema = z.object({
	/** Name of the Vectorize index */
	indexName: z.string()
})

/**
 * Hyperdrive binding configuration.
 * Provides accelerated PostgreSQL connections via connection pooling.
 */
export const hyperdriveBindingByIdSchema = z.object({
	/** Explicit Hyperdrive configuration ID */
	id: z.string()
}).strict()

export const hyperdriveBindingByNameSchema = z.object({
	/** Stable Hyperdrive configuration name to resolve to an ID at config/build/deploy time */
	name: z.string(),
	/**
	 * Opt-in fallback behavior for preview-scoped Hyperdrive bindings.
	 * When set to `'base'`, Devflare is permitted to reuse the base Hyperdrive
	 * configuration if no dedicated preview Hyperdrive exists in the account.
	 * When omitted, missing preview Hyperdrives cause a config-resolution error.
	 */
	previewFallback: z.literal('base').optional(),
	/** Explicit dedicated preview Hyperdrive configuration ID */
	previewId: z.string().optional(),
	/** Explicit local connection string used for preview/dev runs */
	previewLocalConnectionString: z.string().optional()
}).strict()

export const hyperdriveBindingSchema = z.union([
	z.string(),
	hyperdriveBindingByIdSchema,
	hyperdriveBindingByNameSchema
])

const SINGLE_BROWSER_BINDING_ERROR_MESSAGE = 'Devflare currently supports exactly one browser binding because Wrangler only supports a single browser binding.'

export function formatBrowserBindingLimitMessage(bindingNames: string[]): string {
	if (bindingNames.length <= 1) {
		return SINGLE_BROWSER_BINDING_ERROR_MESSAGE
	}

	return `${SINGLE_BROWSER_BINDING_ERROR_MESSAGE} Configured bindings: ${bindingNames.join(', ')}`
}

export function getBrowserBindingNames(bindings: Record<string, string> | undefined): string[] {
	return bindings ? Object.keys(bindings) : []
}

/**
 * Browser Rendering binding configuration.
 * Provides headless browser access for rendering/screenshots.
 */
export const browserBindingSchema = z.record(z.string(), z.string()).superRefine((bindings, ctx) => {
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
export const sendEmailBindingSchema = z.object({
	/** Restrict this binding to a specific verified destination address */
	destinationAddress: z.string().optional(),
	/** Restrict this binding to a set of verified destination addresses */
	allowedDestinationAddresses: z.array(z.string()).optional(),
	/** Restrict this binding to a set of verified sender addresses */
	allowedSenderAddresses: z.array(z.string()).optional()
}).refine((binding) => {
	return !(binding.destinationAddress && binding.allowedDestinationAddresses)
}, {
	message: 'sendEmail bindings must use either destinationAddress or allowedDestinationAddresses, not both',
	path: ['allowedDestinationAddresses']
})

export const d1BindingByIdSchema = z.object({
	/** Explicit D1 database ID */
	id: z.string()
}).strict()

export const d1BindingByNameSchema = z.object({
	/** Stable D1 database name to resolve to an ID at config/build/deploy time */
	name: z.string()
}).strict()

export const d1BindingSchema = z.union([
	z.string(),
	d1BindingByIdSchema,
	d1BindingByNameSchema
])

export const kvBindingByIdSchema = z.object({
	/** Explicit KV namespace ID */
	id: z.string()
}).strict()

export const kvBindingByNameSchema = z.object({
	/** Stable KV namespace name to resolve to an ID at config/build/deploy time */
	name: z.string()
}).strict()

export const kvBindingSchema = z.union([
	z.string(),
	kvBindingByIdSchema,
	kvBindingByNameSchema
])

/**
 * All worker bindings configuration.
 * Defines connections to Cloudflare services and resources.
 */
export const bindingsSchema = z.object({
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
	 * Maps binding name to R2 bucket name.
	 */
	r2: z.record(z.string(), z.string()).optional(),

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
	 * Service bindings to other Workers.
	 * Enables RPC-style communication between workers.
	 */
	services: z.record(z.string(), serviceBindingSchema).optional(),

	/**
	 * Workers AI binding for ML inference.
	 */
	ai: aiBindingSchema.optional(),

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
	sendEmail: z.record(z.string(), sendEmailBindingSchema).optional()
}).optional()

export type BrowserBindings = z.infer<typeof browserBindingSchema>
export type D1Binding = z.infer<typeof d1BindingSchema>
export type DurableObjectBinding = z.infer<typeof durableObjectBindingSchema>
export type HyperdriveBinding = z.infer<typeof hyperdriveBindingSchema>
export type KVBinding = z.infer<typeof kvBindingSchema>
export type QueueConsumer = z.infer<typeof queueConsumerSchema>
export type QueuesConfig = z.infer<typeof queuesConfigSchema>
export type ServiceBinding = z.infer<typeof serviceBindingSchema>
