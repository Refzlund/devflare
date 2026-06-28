import type {
	AnalyticsBindingInput,
	ArtifactsBindingInput,
	BrowserBindingInput,
	DispatchNamespaceBindingInput,
	ImagesBindingInput,
	MediaBindingInput,
	MtlsCertificateBindingInput,
	PipelineBindingInput,
	SendEmailBindingInput,
	WorkflowBindingInput
} from './schema-types-bindings-platform'
import type {
	AiBindingInput,
	AiSearchInstanceBindingInput,
	AiSearchNamespaceBindingInput,
	D1BindingInput,
	DurableObjectBindingInput,
	HyperdriveBindingInput,
	KVBindingInput,
	QueueConsumerInput,
	QueuesConfigInput,
	R2BindingInput,
	RateLimitBindingInput,
	SecretsStoreBindingInput,
	ServiceBindingInput,
	VectorizeBindingInput,
	VersionMetadataBindingInput,
	WorkerLoaderBindingInput
} from './schema-types-bindings-resources'

export interface BindingsConfigInput {
	/**
	 * KV namespace bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * kv: { CACHE: 'my-cache' }
	 * ```
	 */
	kv?: Record<string, KVBindingInput>

	/**
	 * D1 database bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * d1: { DB: 'my-database' }
	 * ```
	 */
	d1?: Record<string, D1BindingInput>

	/**
	 * R2 bucket bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * r2: { BUCKET: 'uploads-local' }
	 * ```
	 */
	r2?: Record<string, R2BindingInput>

	/**
	 * Durable Object bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * durableObjects: { COUNTER: 'Counter' }
	 * ```
	 */
	durableObjects?: Record<string, DurableObjectBindingInput>

	/**
	 * Queue producer and consumer bindings.
	 *
	 * @example
	 * ```ts
	 * queues: {
	 *   producers: { TASKS: 'tasks-local' },
	 *   consumers: [{ queue: 'tasks-local' }]
	 * }
	 * ```
	 */
	queues?: QueuesConfigInput

	/**
	 * Rate Limiting bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * rateLimits: {
	 *   RATE_LIMITER: {
	 *     namespaceId: '1001',
	 *     simple: { limit: 100, period: 60 }
	 *   }
	 * }
	 * ```
	 */
	rateLimits?: Record<string, RateLimitBindingInput>

	/**
	 * Version Metadata binding.
	 *
	 * @example
	 * ```ts
	 * versionMetadata: { binding: 'CF_VERSION_METADATA' }
	 * ```
	 */
	versionMetadata?: VersionMetadataBindingInput

	/**
	 * Worker Loader bindings for Dynamic Workers.
	 *
	 * @example
	 * ```ts
	 * workerLoaders: { LOADER: {} }
	 * ```
	 */
	workerLoaders?: Record<string, WorkerLoaderBindingInput>

	/**
	 * Secrets Store bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * secretsStore: {
	 *   API_TOKEN: { storeId: 'store-id', secretName: 'API_TOKEN' }
	 * }
	 * ```
	 */
	secretsStore?: Record<string, SecretsStoreBindingInput>

	/**
	 * Service bindings to other Workers, including `ref().worker` outputs.
	 *
	 * @example
	 * ```ts
	 * services: {
	 *   API: apiWorker.worker('ApiEntrypoint')
	 * }
	 * ```
	 */
	services?: Record<string, ServiceBindingInput>

	/**
	 * Workers AI binding.
	 *
	 * @example
	 * ```ts
	 * ai: { binding: 'AI' }
	 * ```
	 */
	ai?: AiBindingInput

	/**
	 * AI Search namespace bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * aiSearchNamespaces: { SEARCH: { namespace: 'docs' } }
	 * ```
	 */
	aiSearchNamespaces?: Record<string, AiSearchNamespaceBindingInput>

	/**
	 * AI Search instance bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * aiSearch: { SEARCH: { instanceName: 'docs-search' } }
	 * ```
	 */
	aiSearch?: Record<string, AiSearchInstanceBindingInput>

	/**
	 * Vectorize index bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * vectorize: { VECTORIZE: { indexName: 'docs-index' } }
	 * ```
	 */
	vectorize?: Record<string, VectorizeBindingInput>

	/**
	 * Hyperdrive bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * hyperdrive: {
	 *   DB: { name: 'postgres', localConnectionString: 'postgres://localhost/db' }
	 * }
	 * ```
	 */
	hyperdrive?: Record<string, HyperdriveBindingInput>

	/**
	 * Browser Rendering bindings. Wrangler currently supports one browser
	 * binding per Worker.
	 *
	 * @example
	 * ```ts
	 * browser: { BROWSER: { remote: true } }
	 * ```
	 */
	browser?: Record<string, BrowserBindingInput>

	/**
	 * Analytics Engine bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * analyticsEngine: { EVENTS: { dataset: 'worker_events' } }
	 * ```
	 */
	analyticsEngine?: Record<string, AnalyticsBindingInput>

	/**
	 * Email sending bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * sendEmail: {
	 *   EMAIL: { allowedDestinationAddresses: ['ops@example.com'] }
	 * }
	 * ```
	 */
	sendEmail?: Record<string, SendEmailBindingInput>

	/**
	 * mTLS certificate bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * mtlsCertificates: { CERT: 'certificate-uuid' }
	 * ```
	 */
	mtlsCertificates?: Record<string, MtlsCertificateBindingInput>

	/**
	 * Workers for Platforms dispatch namespace bindings keyed by runtime
	 * binding name.
	 *
	 * @example
	 * ```ts
	 * dispatchNamespaces: { DISPATCHER: 'customers' }
	 * ```
	 */
	dispatchNamespaces?: Record<string, DispatchNamespaceBindingInput>

	/**
	 * Workflow bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * workflows: {
	 *   ONBOARDING: { name: 'onboarding', className: 'OnboardingWorkflow' }
	 * }
	 * ```
	 */
	workflows?: Record<string, WorkflowBindingInput>

	/**
	 * Cloudflare Pipelines bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * pipelines: { EVENTS: 'events-pipeline' }
	 * ```
	 */
	pipelines?: Record<string, PipelineBindingInput>

	/**
	 * Cloudflare Images service bindings keyed by runtime binding name.
	 * Wrangler currently supports one Images binding per Worker.
	 *
	 * @example
	 * ```ts
	 * images: { IMAGES: true }
	 * ```
	 */
	images?: Record<string, ImagesBindingInput>

	/**
	 * Cloudflare Media Transformations bindings keyed by runtime binding name.
	 * Wrangler currently supports one Media binding per Worker.
	 *
	 * @example
	 * ```ts
	 * media: { MEDIA: { remote: true } }
	 * ```
	 */
	media?: Record<string, MediaBindingInput>

	/**
	 * Cloudflare Artifacts bindings keyed by runtime binding name.
	 *
	 * @example
	 * ```ts
	 * artifacts: { ARTIFACTS: { namespace: 'builds' } }
	 * ```
	 */
	artifacts?: Record<string, ArtifactsBindingInput>
}

export type * from './schema-types-bindings-resources'
export type * from './schema-types-bindings-platform'
