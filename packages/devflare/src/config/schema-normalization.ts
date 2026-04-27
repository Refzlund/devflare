import {
	formatBrowserBindingLimitMessage,
	getBrowserBindingNames,
	type ArtifactsBinding,
	type BrowserBindings,
	type D1Binding,
	type DispatchNamespaceBinding,
	type DurableObjectBinding,
	type HyperdriveBinding,
	type ImagesBinding,
	type KVBinding,
	type MediaBinding,
	type MtlsCertificateBinding,
	type PipelineBinding,
	type SecretsStoreBinding,
	type WorkflowBinding
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
}

export interface NormalizedKVBinding {
	/** Resolved KV namespace ID when one is already known */
	namespaceId?: string
	/** Stable KV namespace name when the binding is configured by name */
	name?: string
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
export function getSingleBrowserBindingName(bindings: BrowserBindings | undefined): string | undefined {
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
	const kind: 'local' | 'cross-worker' = (scriptName || __ref) ? 'cross-worker' : 'local'

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

	if ('id' in config) {
		return { databaseId: config.id }
	}

	return { name: config.name }
}

/**
 * Normalize a KV binding to a consistent object form.
 * String bindings are treated as stable namespace names.
 */
export function normalizeKVBinding(config: KVBinding): NormalizedKVBinding {
	if (typeof config === 'string') {
		return { name: config }
	}

	if ('id' in config) {
		return { namespaceId: config.id }
	}

	return { name: config.name }
}

/**
 * Normalize a Hyperdrive binding to a consistent object form.
 * String bindings are treated as stable Hyperdrive configuration names.
 */
export function normalizeHyperdriveBinding(config: HyperdriveBinding): NormalizedHyperdriveBinding {
	if (typeof config === 'string') {
		return { name: config }
	}

	const localConnectionString = 'localConnectionString' in config
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
export function normalizeWorkflowBinding(
	config: WorkflowBinding
): NormalizedWorkflowBinding {
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
export function normalizePipelineBinding(
	config: PipelineBinding
): NormalizedPipelineBinding {
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
export function normalizeArtifactsBinding(
	config: ArtifactsBinding
): NormalizedArtifactsBinding {
	if (typeof config === 'string') {
		return { namespace: config }
	}

	return {
		namespace: config.namespace,
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
