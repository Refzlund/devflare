// =============================================================================
// Shared binding-resolution helpers (R1 step 2 — collapse duplicate helpers)
// =============================================================================
// `resource-resolution.ts` (build/local/automation) and `deploy-resources.ts`
// (deploy with optional auto-provisioning) historically each carried their
// own copy of the same KV/D1/Hyperdrive name-binding plumbing. This module
// hosts the truly shared, side-effect-free helpers so both pipelines reuse
// one implementation. Side-effecting bits (account-id resolution chain,
// list-or-create) remain in their respective files because their failure
// modes and error messages diverge.
// =============================================================================

import {
	normalizeD1Binding,
	normalizeHyperdriveBinding,
	normalizeKVBinding,
	type DevflareConfig
} from './schema'

export interface NormalizedNameBinding {
	id?: string
	name?: string
}

export interface PendingNameBinding {
	bindingName: string
	resourceName: string
}

type KVBindings = NonNullable<NonNullable<DevflareConfig['bindings']>['kv']>
type D1Bindings = NonNullable<NonNullable<DevflareConfig['bindings']>['d1']>
type HyperdriveBindings = NonNullable<NonNullable<DevflareConfig['bindings']>['hyperdrive']>

export function normalizeKVNameBinding(bindingConfig: KVBindings[string]): NormalizedNameBinding {
	const normalized = normalizeKVBinding(bindingConfig)
	return {
		id: normalized.namespaceId,
		name: normalized.name
	}
}

export function normalizeD1NameBinding(bindingConfig: D1Bindings[string]): NormalizedNameBinding {
	const normalized = normalizeD1Binding(bindingConfig)
	return {
		id: normalized.databaseId,
		name: normalized.name
	}
}

export function normalizeHyperdriveNameBinding(
	bindingConfig: HyperdriveBindings[string]
): NormalizedNameBinding {
	const normalized = normalizeHyperdriveBinding(bindingConfig)
	return {
		id: normalized.configurationId,
		name: normalized.name
	}
}

export function materializeIdBindings<TBinding>(
	bindings: Record<string, TBinding>,
	resolveId: (binding: TBinding) => string
): Record<string, { id: string }> {
	return Object.fromEntries(
		Object.entries(bindings).map(([bindingName, bindingConfig]) => {
			return [bindingName, { id: resolveId(bindingConfig) }]
		})
	)
}

export function collectPendingNameBindings<TBinding>(
	bindings: Record<string, TBinding> | undefined,
	normalizeBinding: (binding: TBinding) => NormalizedNameBinding
): PendingNameBinding[] {
	if (!bindings) {
		return []
	}

	return Object.entries(bindings)
		.map(([bindingName, bindingConfig]) => {
			const normalized = normalizeBinding(bindingConfig)
			return normalized.id
				? null
				: {
					bindingName,
					resourceName: normalized.name ?? ''
				}
		})
		.filter((binding): binding is PendingNameBinding => binding !== null)
}

export function materializeResolvedNameBindings<TBinding>(
	bindings: Record<string, TBinding> | undefined,
	normalizeBinding: (binding: TBinding) => NormalizedNameBinding,
	idsByName: Map<string, string>
): Record<string, { id: string }> | undefined {
	if (!bindings) {
		return undefined
	}

	return materializeIdBindings(bindings, (bindingConfig) => {
		const normalized = normalizeBinding(bindingConfig)
		return normalized.id ?? idsByName.get(normalized.name ?? '') ?? ''
	})
}

export function withResolvedIdBindings(
	resolvedConfig: DevflareConfig,
	bindings: {
		kv?: Record<string, { id: string }>
		d1?: Record<string, { id: string }>
		hyperdrive?: Record<string, { id: string }>
	}
): DevflareConfig {
	return {
		...resolvedConfig,
		bindings: {
			...resolvedConfig.bindings,
			...(bindings.kv ? { kv: bindings.kv } : {}),
			...(bindings.d1 ? { d1: bindings.d1 } : {}),
			...(bindings.hyperdrive ? { hyperdrive: bindings.hyperdrive } : {})
		}
	}
}

export function formatMissingBindings(missing: PendingNameBinding[]): string {
	return missing
		.map(({ bindingName, resourceName }) => `${bindingName} → ${resourceName}`)
		.join(', ')
}
