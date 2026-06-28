/**
 * KV namespace binding by stable namespace name, explicit ID, or resolver
 * object.
 *
 * @example
 * ```ts
 * kv: { CACHE: 'cache-local' }
 * ```
 */
export type KVBindingInput = string | KVBindingByIdInput | KVBindingByNameInput

/**
 * KV namespace binding by explicit namespace ID.
 */
export interface KVBindingByIdInput {
	/**
	 * Explicit KV namespace ID.
	 *
	 * @example
	 * ```ts
	 * kv: { CACHE: { id: 'namespace-id' } }
	 * ```
	 */
	id: string
}

/**
 * KV namespace binding by stable namespace name.
 */
export interface KVBindingByNameInput {
	/**
	 * Stable KV namespace name to resolve at config, build, or deploy time.
	 *
	 * @example
	 * ```ts
	 * kv: { CACHE: { name: 'cache-local' } }
	 * ```
	 */
	name: string
}

/**
 * D1 database binding by stable database name, explicit ID, or resolver object.
 *
 * @example
 * ```ts
 * d1: { DB: 'app-db-local' }
 * ```
 */
export type D1BindingInput = string | D1BindingByIdInput | D1BindingByNameInput

/**
 * D1 database binding by explicit database ID.
 */
export interface D1BindingByIdInput {
	/**
	 * Explicit D1 database ID.
	 *
	 * @example
	 * ```ts
	 * d1: { DB: { id: 'database-id' } }
	 * ```
	 */
	id: string
}

/**
 * D1 database binding by stable database name.
 */
export interface D1BindingByNameInput {
	/**
	 * Stable D1 database name to resolve at config, build, or deploy time.
	 *
	 * @example
	 * ```ts
	 * d1: { DB: { name: 'app-db-local' } }
	 * ```
	 */
	name: string
}

/**
 * Durable Object binding by local class name or object form.
 */
export type DurableObjectBindingInput = string | DurableObjectBindingObjectInput

/**
 * Durable Object binding object form.
 */
export interface DurableObjectBindingObjectInput {
	/**
	 * Durable Object class name.
	 *
	 * @example
	 * ```ts
	 * durableObjects: { COUNTER: { className: 'Counter' } }
	 * ```
	 */
	readonly className: string

	/**
	 * Script name for cross-worker Durable Object access.
	 *
	 * @example
	 * ```ts
	 * durableObjects: { COUNTER: { className: 'Counter', scriptName: 'counter-worker' } }
	 * ```
	 */
	readonly scriptName?: string

	/**
	 * Internal marker used by `ref()` Durable Object bindings.
	 *
	 * @internal
	 */
	readonly __ref?: unknown
}

/**
 * Queue producer and consumer configuration.
 */
export interface QueuesConfigInput {
	/**
	 * Queue producer bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * producers: { TASK_QUEUE: 'tasks-local' }
	 * ```
	 */
	producers?: Record<string, string>

	/**
	 * Queue consumer configurations used to process messages from queues.
	 *
	 * @example
	 * ```ts
	 * consumers: [{ queue: 'tasks-local', maxBatchSize: 5 }]
	 * ```
	 */
	consumers?: QueueConsumerInput[]
}

/**
 * Queue consumer configuration.
 */
export interface QueueConsumerInput {
	/**
	 * Queue name to consume from.
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local' }
	 * ```
	 */
	queue: string

	/**
	 * Maximum messages per batch.
	 *
	 * @default `10`
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local', maxBatchSize: 25 }
	 * ```
	 */
	maxBatchSize?: number

	/**
	 * Maximum seconds to wait before dispatching a partial batch.
	 *
	 * @default `5`
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local', maxBatchTimeout: 10 }
	 * ```
	 */
	maxBatchTimeout?: number

	/**
	 * Maximum retry attempts for failed messages.
	 *
	 * @default `3`
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local', maxRetries: 5 }
	 * ```
	 */
	maxRetries?: number

	/**
	 * Queue name that receives failed messages after retries are exhausted.
	 *
	 * @default No dead-letter queue.
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local', deadLetterQueue: 'tasks-dlq-local' }
	 * ```
	 */
	deadLetterQueue?: string

	/**
	 * Maximum concurrent batch invocations.
	 *
	 * @default Cloudflare Queues default behavior.
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local', maxConcurrency: 4 }
	 * ```
	 */
	maxConcurrency?: number

	/**
	 * Delay in seconds between retries.
	 *
	 * @default Cloudflare Queues default behavior.
	 *
	 * @example
	 * ```ts
	 * { queue: 'tasks-local', retryDelay: 30 }
	 * ```
	 */
	retryDelay?: number
}

/**
 * Rate Limiting binding configuration.
 */
export interface RateLimitBindingInput {
	/**
	 * Positive integer namespace ID unique to the Cloudflare account.
	 *
	 * @example
	 * ```ts
	 * namespaceId: '1001'
	 * ```
	 */
	namespaceId: string

	/**
	 * Simple rate limiting settings.
	 *
	 * @example
	 * ```ts
	 * simple: { limit: 100, period: 60 }
	 * ```
	 */
	simple: RateLimitSimpleInput
}

/**
 * Simple rate limiting settings.
 */
export interface RateLimitSimpleInput {
	/**
	 * Number of allowed calls within the configured period.
	 *
	 * @example
	 * ```ts
	 * limit: 100
	 * ```
	 */
	limit: number

	/**
	 * Rate limit window in seconds.
	 *
	 * @example
	 * ```ts
	 * period: 60
	 * ```
	 */
	period: 10 | 60
}

/**
 * Version Metadata binding configuration.
 */
export interface VersionMetadataBindingInput {
	/**
	 * Binding name exposed in `env`.
	 *
	 * @example
	 * ```ts
	 * versionMetadata: { binding: 'CF_VERSION_METADATA' }
	 * ```
	 */
	binding: string
}

/**
 * Worker Loader binding configuration for Dynamic Workers.
 */
export type WorkerLoaderBindingInput = {}

/**
 * Secrets Store binding by shorthand secret name or explicit store object.
 */
export type SecretsStoreBindingInput = string | SecretsStoreBindingObjectInput

/**
 * Explicit Secrets Store binding configuration.
 */
export interface SecretsStoreBindingObjectInput {
	/**
	 * Secrets Store ID containing the account-level secret.
	 *
	 * @example
	 * ```ts
	 * storeId: 'store-id'
	 * ```
	 */
	storeId: string

	/**
	 * Secret name within the store.
	 *
	 * @example
	 * ```ts
	 * secretName: 'API_TOKEN'
	 * ```
	 */
	secretName: string
}

/**
 * Service binding object, including values produced by `ref().worker`.
 */
export interface ServiceBindingInput {
	/**
	 * Target worker service name.
	 *
	 * @example
	 * ```ts
	 * services: { API: { service: 'api-worker' } }
	 * ```
	 */
	readonly service: string

	/**
	 * Optional target worker environment.
	 *
	 * @default Target worker default environment.
	 *
	 * @example
	 * ```ts
	 * services: { API: { service: 'api-worker', environment: 'staging' } }
	 * ```
	 */
	readonly environment?: string

	/**
	 * Optional named WorkerEntrypoint class.
	 *
	 * @default Target worker default export.
	 *
	 * @example
	 * ```ts
	 * services: { API: { service: 'api-worker', entrypoint: 'ApiEntrypoint' } }
	 * ```
	 */
	readonly entrypoint?: string

	/**
	 * Internal marker used by `ref()` service bindings.
	 *
	 * @internal
	 */
	readonly __ref?: unknown
}

/**
 * Workers AI binding configuration.
 */
export interface AiBindingInput {
	/**
	 * Binding name exposed in `env`.
	 *
	 * @example
	 * ```ts
	 * ai: { binding: 'AI' }
	 * ```
	 */
	binding: string

	/**
	 * Whether Wrangler local development should use the remote Workers AI
	 * service for this binding.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * ai: { binding: 'AI', remote: true }
	 * ```
	 */
	remote?: boolean

	/**
	 * Whether to use Cloudflare's staging Workers AI environment.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * ai: { binding: 'AI', staging: true }
	 * ```
	 */
	staging?: boolean
}

/**
 * AI Search namespace binding configuration.
 */
export interface AiSearchNamespaceBindingInput {
	/**
	 * AI Search namespace name.
	 *
	 * @example
	 * ```ts
	 * namespace: 'docs'
	 * ```
	 */
	namespace: string

	/**
	 * Whether Wrangler local development should use the remote AI Search
	 * namespace.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * AI Search instance binding configuration.
 */
export interface AiSearchInstanceBindingInput {
	/**
	 * AI Search instance name in the default namespace.
	 *
	 * @example
	 * ```ts
	 * instanceName: 'docs-search'
	 * ```
	 */
	instanceName: string

	/**
	 * Whether Wrangler local development should use the remote AI Search
	 * instance.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * Vectorize index binding configuration.
 */
export interface VectorizeBindingInput {
	/**
	 * Vectorize index name.
	 *
	 * @example
	 * ```ts
	 * indexName: 'docs-index'
	 * ```
	 */
	indexName: string

	/**
	 * Whether Wrangler local development should use the remote Vectorize
	 * index.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * Hyperdrive binding by stable name, explicit ID, or resolver object.
 */
export type HyperdriveBindingInput =
	| string
	| HyperdriveBindingByIdInput
	| HyperdriveBindingByNameInput

/**
 * Hyperdrive binding by explicit configuration ID.
 */
export interface HyperdriveBindingByIdInput {
	/**
	 * Explicit Hyperdrive configuration ID.
	 *
	 * @example
	 * ```ts
	 * id: 'hyperdrive-id'
	 * ```
	 */
	id: string

	/**
	 * Direct database connection string used by local Miniflare or Wrangler
	 * development.
	 *
	 * @default No local override.
	 *
	 * @example
	 * ```ts
	 * localConnectionString: 'postgres://localhost/app'
	 * ```
	 */
	localConnectionString?: string
}

/**
 * Hyperdrive binding by stable configuration name.
 */
export interface HyperdriveBindingByNameInput {
	/**
	 * Stable Hyperdrive configuration name.
	 *
	 * @example
	 * ```ts
	 * name: 'app-postgres'
	 * ```
	 */
	name: string

	/**
	 * Direct database connection string used by local Miniflare or Wrangler
	 * development.
	 *
	 * @default No local override.
	 *
	 * @example
	 * ```ts
	 * localConnectionString: 'postgres://localhost/app'
	 * ```
	 */
	localConnectionString?: string

	/**
	 * Preview fallback behavior when no dedicated preview Hyperdrive exists.
	 *
	 * @default Missing preview Hyperdrives fail config resolution.
	 *
	 * @example
	 * ```ts
	 * previewFallback: 'base'
	 * ```
	 */
	previewFallback?: 'base'

	/**
	 * Explicit dedicated preview Hyperdrive configuration ID.
	 *
	 * @default No dedicated preview ID.
	 *
	 * @example
	 * ```ts
	 * previewId: 'preview-hyperdrive-id'
	 * ```
	 */
	previewId?: string

	/**
	 * Legacy alias for a preview or development local connection string.
	 * Prefer `localConnectionString`.
	 *
	 * @default No local override.
	 *
	 * @example
	 * ```ts
	 * previewLocalConnectionString: 'postgres://localhost/app_preview'
	 * ```
	 */
	previewLocalConnectionString?: string
}
