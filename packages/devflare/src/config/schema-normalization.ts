import {
	type ArtifactsBinding,
	type BrowserBindings,
	type D1Binding,
	type DispatchNamespaceBinding,
	type DurableObjectBinding,
	type FlagshipBinding,
	type HyperdriveBinding,
	type ImagesBinding,
	type KVBinding,
	type MediaBinding,
	type MtlsCertificateBinding,
	type PipelineBinding,
	type QueueProducer,
	type R2Binding,
	type SecretsStoreBinding,
	type StreamBinding,
	type VpcNetworkBinding,
	type VpcServiceBinding,
	type WorkflowBinding,
	formatBrowserBindingLimitMessage,
	getBrowserBindingNames
} from './schema-bindings'

// Re-exported so call sites can format the same message Zod uses without
// importing schema-bindings directly.
export { formatBrowserBindingLimitMessage }

/**
 * Normalized DO binding shape — consistent representation for all DO binding variants.
 * Used throughout devflare for DO configuration handling.
 */
export interface NormalizedDOBinding {
	/** The DO class name (e.g., 'Counter') */
	className: string
	/**
	 * Optional script name — file path for local DOs, worker name for
	 * cross-worker DOs.
	 *
	 * Prefer the `kind` discriminator below for branching; reach for
	 * `scriptName` only when you need the actual script identifier.
	 */
	scriptName?: string
	/** Reference result for cross-worker DOs (from ref().DO_NAME) */
	__ref?: unknown
	/**
	 * Discriminator: `'local'` when the DO class is hosted in the current
	 * worker (no `scriptName`, no `__ref`), `'cross-worker'` when the DO is
	 * declared via an explicit `scriptName` or via `ref()`.
	 */
	kind: 'local' | 'cross-worker'
}

export interface NormalizedD1Binding {
	/** Resolved D1 database ID when one is already known */
	databaseId?: string
	/** Stable D1 database name when the binding is configured by name */
	name?: string
	/** D1 database ID used during `wrangler dev`; compiles to `preview_database_id` */
	previewDatabaseId?: string
	/** Name of the migrations table; compiles to `migrations_table` */
	migrationsTable?: string
	/** Path to the migrations directory; compiles to `migrations_dir` */
	migrationsDir?: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedKVBinding {
	/** Resolved KV namespace ID when one is already known */
	namespaceId?: string
	/** Stable KV namespace name when the binding is configured by name */
	name?: string
	/** KV namespace ID used during `wrangler dev`; compiles to `preview_id` */
	previewId?: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedR2Binding {
	/** R2 bucket name at the edge */
	bucketName: string
	/** R2 bucket name used during `wrangler dev`; compiles to `preview_bucket_name` */
	previewBucketName?: string
	/** Jurisdiction the bucket exists in; compiles to `jurisdiction` */
	jurisdiction?: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedQueueProducer {
	/** Queue name this producer writes to */
	queue: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedHyperdriveBinding {
	/** Resolved Hyperdrive configuration ID when one is already known */
	configurationId?: string
	/** Stable Hyperdrive configuration name when the binding is configured by name */
	name?: string
	/** Direct database connection string for local Hyperdrive emulation */
	localConnectionString?: string
}

export interface NormalizedMtlsCertificateBinding {
	/** Uploaded mTLS certificate UUID */
	certificateId: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedDispatchNamespaceBinding {
	/** Dispatch namespace name */
	namespace: string
	/** Optional outbound Worker config */
	outbound?: {
		service: string
		environment?: string
		parameters?: string[]
	}
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedWorkflowBinding {
	/** Workflow resource name */
	name: string
	/** Exported Workflow class name */
	className: string
	/** Optional Worker script name when the Workflow class is external */
	scriptName?: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
	/** Optional Workflow-specific limits */
	limits?: {
		steps: number
	}
}

export interface NormalizedPipelineBinding {
	/** Pipeline or stream name/id */
	pipeline: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedImagesBinding {
	/** Images binding name */
	binding: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedMediaBinding {
	/** Media Transformations binding name */
	binding: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedArtifactsBinding {
	/** Artifacts namespace */
	namespace: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedStreamBinding {
	/** Stream binding name */
	binding: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedVpcServiceBinding {
	/** VPC connectivity service ID */
	serviceId: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedVpcNetworkBinding {
	/** Cloudflare Tunnel ID; mutually exclusive with networkId */
	tunnelId?: string
	/** VPC network ID; mutually exclusive with tunnelId */
	networkId?: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedFlagshipBinding {
	/** Flagship app ID */
	appId: string
	/** Wrangler local-development remote-binding preference */
	remote?: boolean
}

export interface NormalizedSecretsStoreBinding {
	/** Secrets Store ID containing the account-level secret */
	storeId: string
	/** Secret name within the store */
	secretName: string
}

/**
 * Return the single browser binding name, or `undefined` when no browser
 * binding is configured.
 *
 * invariant: `bindings` is expected to have been validated by
 * `browserBindingSchema` (see `schema-bindings.ts`), which rejects
 * configurations with more than one browser binding via
 * `superRefine` + `formatBrowserBindingLimitMessage`. Callers that bypass
 * Zod (e.g. by casting raw input as `DevflareConfig`) should re-validate
 * via `browserBindingSchema.parse()` before relying on this selector.
 */
export function getSingleBrowserBindingName(
	bindings: BrowserBindings | undefined
): string | undefined {
	const bindingNames = getBrowserBindingNames(bindings)

	if (bindingNames.length === 0) {
		return undefined
	}

	return bindingNames[0]
}

/**
 * Normalize a DO binding to its object form.
 */
export function normalizeDOBinding(config: DurableObjectBinding): NormalizedDOBinding {
	if (typeof config === 'string') {
		return { className: config, kind: 'local' }
	}

	const scriptName = config.scriptName
	const __ref = (config as { __ref?: unknown }).__ref
	const kind: 'local' | 'cross-worker' = scriptName || __ref ? 'cross-worker' : 'local'

	return {
		className: config.className,
		scriptName,
		__ref,
		kind
	}
}

/**
 * Normalize a D1 binding to a consistent object form.
 * String bindings are treated as stable database names.
 */
export function normalizeD1Binding(config: D1Binding): NormalizedD1Binding {
	if (typeof config === 'string') {
		return { name: config }
	}

	const extras = {
		...(config.previewDatabaseId !== undefined && { previewDatabaseId: config.previewDatabaseId }),
		...(config.migrationsTable !== undefined && { migrationsTable: config.migrationsTable }),
		...(config.migrationsDir !== undefined && { migrationsDir: config.migrationsDir }),
		...(config.remote !== undefined && { remote: config.remote })
	}

	if ('id' in config) {
		return { databaseId: config.id, ...extras }
	}

	return { name: config.name, ...extras }
}

/**
 * Normalize a KV binding to a consistent object form.
 * String bindings are treated as stable namespace names.
 */
export function normalizeKVBinding(config: KVBinding): NormalizedKVBinding {
	if (typeof config === 'string') {
		return { name: config }
	}

	const extras = {
		...(config.previewId !== undefined && { previewId: config.previewId }),
		...(config.remote !== undefined && { remote: config.remote })
	}

	if ('id' in config) {
		return { namespaceId: config.id, ...extras }
	}

	return { name: config.name, ...extras }
}

/**
 * Normalize an R2 binding to a consistent object form.
 * String bindings are treated as bucket names.
 */
export function normalizeR2Binding(config: R2Binding): NormalizedR2Binding {
	if (typeof config === 'string') {
		return { bucketName: config }
	}

	return {
		bucketName: config.bucketName,
		...(config.previewBucketName !== undefined && {
			previewBucketName: config.previewBucketName
		}),
		...(config.jurisdiction !== undefined && { jurisdiction: config.jurisdiction }),
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a queue producer binding to a consistent object form.
 * String bindings are treated as queue names.
 */
export function normalizeQueueProducer(config: QueueProducer): NormalizedQueueProducer {
	if (typeof config === 'string') {
		return { queue: config }
	}

	return {
		queue: config.queue,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Hyperdrive binding to a consistent object form.
 * String bindings are treated as stable Hyperdrive configuration names.
 */
export function normalizeHyperdriveBinding(config: HyperdriveBinding): NormalizedHyperdriveBinding {
	if (typeof config === 'string') {
		return { name: config }
	}

	const localConnectionString =
		'localConnectionString' in config
			? config.localConnectionString
			: 'previewLocalConnectionString' in config
				? config.previewLocalConnectionString
				: undefined

	if ('id' in config) {
		return {
			configurationId: config.id,
			...(localConnectionString && { localConnectionString })
		}
	}

	return {
		name: config.name,
		...(localConnectionString && { localConnectionString })
	}
}

/**
 * Normalize an mTLS certificate binding to Devflare's camelCase shape.
 */
export function normalizeMtlsCertificateBinding(
	config: MtlsCertificateBinding
): NormalizedMtlsCertificateBinding {
	if (typeof config === 'string') {
		return { certificateId: config }
	}

	if ('certificateId' in config) {
		return {
			certificateId: config.certificateId,
			...(config.remote !== undefined && { remote: config.remote })
		}
	}

	return {
		certificateId: config.certificate_id,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Dispatch Namespace binding to its object form.
 */
export function normalizeDispatchNamespaceBinding(
	config: DispatchNamespaceBinding
): NormalizedDispatchNamespaceBinding {
	if (typeof config === 'string') {
		return { namespace: config }
	}

	return {
		namespace: config.namespace,
		...(config.outbound && {
			outbound: {
				service: config.outbound.service,
				...(config.outbound.environment && { environment: config.outbound.environment }),
				...(config.outbound.parameters && { parameters: config.outbound.parameters })
			}
		}),
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Workflow binding to its object form.
 */
export function normalizeWorkflowBinding(config: WorkflowBinding): NormalizedWorkflowBinding {
	return {
		name: config.name,
		className: config.className,
		...(config.scriptName && { scriptName: config.scriptName }),
		...(config.remote !== undefined && { remote: config.remote }),
		...(config.limits && {
			limits: {
				steps: config.limits.steps
			}
		})
	}
}

/**
 * Normalize a Pipeline binding to its object form.
 */
export function normalizePipelineBinding(config: PipelineBinding): NormalizedPipelineBinding {
	if (typeof config === 'string') {
		return { pipeline: config }
	}

	return {
		pipeline: config.pipeline,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize an Images binding to Wrangler's singleton binding object.
 */
export function normalizeImagesBinding(
	binding: string,
	config: ImagesBinding
): NormalizedImagesBinding {
	if (config === true) {
		return { binding }
	}

	return {
		binding,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Media Transformations binding to Wrangler's singleton binding object.
 */
export function normalizeMediaBinding(
	binding: string,
	config: MediaBinding
): NormalizedMediaBinding {
	if (config === true) {
		return { binding }
	}

	return {
		binding,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize an Artifacts binding to its object form.
 */
export function normalizeArtifactsBinding(config: ArtifactsBinding): NormalizedArtifactsBinding {
	if (typeof config === 'string') {
		return { namespace: config }
	}

	return {
		namespace: config.namespace,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Stream binding to Wrangler's singleton binding object.
 */
export function normalizeStreamBinding(
	binding: string,
	config: StreamBinding
): NormalizedStreamBinding {
	if (config === true) {
		return { binding }
	}

	return {
		binding,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a VPC service binding to its object form.
 */
export function normalizeVpcServiceBinding(config: VpcServiceBinding): NormalizedVpcServiceBinding {
	return {
		serviceId: config.serviceId,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a VPC network binding to its object form. Exactly one of
 * `tunnelId`/`networkId` is set, mirroring the wrangler `anyOf` schema.
 */
export function normalizeVpcNetworkBinding(config: VpcNetworkBinding): NormalizedVpcNetworkBinding {
	if ('tunnelId' in config) {
		return {
			tunnelId: config.tunnelId,
			...(config.remote !== undefined && { remote: config.remote })
		}
	}

	return {
		networkId: config.networkId,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Flagship binding to its object form.
 */
export function normalizeFlagshipBinding(config: FlagshipBinding): NormalizedFlagshipBinding {
	return {
		appId: config.appId,
		...(config.remote !== undefined && { remote: config.remote })
	}
}

/**
 * Normalize a Secrets Store binding to its explicit store/name form.
 */
export function normalizeSecretsStoreBinding(
	config: SecretsStoreBinding,
	defaultStoreId?: string,
	bindingName = 'unknown'
): NormalizedSecretsStoreBinding {
	if (typeof config === 'string') {
		if (!defaultStoreId) {
			throw new Error(
				`Secrets Store binding "${bindingName}" uses shorthand and requires top-level secretsStoreId.`
			)
		}

		return {
			storeId: defaultStoreId,
			secretName: config
		}
	}

	return {
		storeId: config.storeId,
		secretName: config.secretName
	}
}

/**
 * Get the identifier Devflare should use for local/runtime KV wiring.
 */
export function getLocalKVNamespaceIdentifier(config: KVBinding): string {
	const normalized = normalizeKVBinding(config)
	return normalized.namespaceId ?? normalized.name ?? ''
}

/**
 * Get the identifier Devflare should use for local/runtime D1 wiring.
 */
export function getLocalD1DatabaseIdentifier(config: D1Binding): string {
	const normalized = normalizeD1Binding(config)
	return normalized.databaseId ?? normalized.name ?? ''
}

/**
 * Get the identifier Devflare should use for local/runtime Hyperdrive wiring.
 */
export function getLocalHyperdriveConfigIdentifier(config: HyperdriveBinding): string {
	const normalized = normalizeHyperdriveBinding(config)
	return normalized.configurationId ?? normalized.name ?? ''
}
