import {
	formatBrowserBindingLimitMessage,
	getBrowserBindingNames,
	type BrowserBindings,
	type D1Binding,
	type DurableObjectBinding,
	type HyperdriveBinding,
	type KVBinding
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
	/** Optional script name — file path for local DOs, worker name for cross-worker DOs */
	scriptName?: string
	/** Reference result for cross-worker DOs (from ref().DO_NAME) */
	__ref?: unknown
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
		return { className: config }
	}

	return {
		className: config.className,
		scriptName: config.scriptName,
		__ref: (config as { __ref?: unknown }).__ref
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

	if ('id' in config) {
		return { configurationId: config.id }
	}

	return { name: config.name }
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
