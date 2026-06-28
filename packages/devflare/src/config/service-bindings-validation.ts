// =============================================================================
// Service binding validation (C16 fix, R3 scope)
// =============================================================================
// Cloudflare `services.X.service` bindings are only validated at runtime:
// a typo compiles and deploys, then the worker fails the first time it
// dispatches to the nonexistent service. This helper surfaces the error at
// deploy time by listing the account's workers and asserting that every
// referenced service name exists.
//
// Intended callers: the deploy CLI (`deploy.ts`) and preview-scope deploy
// paths (`preview-resources.ts`). The helper is deliberately NOT wired into
// the resolver chain - validation is a deploy-phase concern and running it
// during `vite build` / local dev would require Cloudflare credentials for
// offline work.
// =============================================================================

import type { DevflareConfig } from './schema'

export class ServiceBindingValidationError extends Error {
	readonly code = 'SERVICE_BINDING_VALIDATION_ERROR'
	readonly missing: readonly string[]

	constructor(missing: readonly string[], accountId: string) {
		super(
			`Service binding(s) reference worker(s) that do not exist in Cloudflare account ${accountId}: ` +
				missing.join(', ') +
				`. Check the 'services' map in devflare.config.ts for typos or deploy the target worker(s) first.`
		)
		this.name = 'ServiceBindingValidationError'
		this.missing = missing
	}
}

export interface ValidateServiceBindingsOptions {
	/**
	 * Lists workers in the target Cloudflare account. Must return one entry
	 * per deployed worker script with its `name`.
	 */
	listWorkers: (accountId: string) => Promise<Array<{ name: string }>>
	/**
	 * Name of the worker currently being deployed. A service binding back
	 * to the same worker is allowed even if the worker has never been
	 * deployed before (first deploy self-reference).
	 */
	selfWorkerName?: string
}

/**
 * Collect every `service` target referenced by the config's `bindings.services`
 * map, deduplicated. Returns `[]` when no service bindings are configured.
 */
export function collectReferencedServiceNames(config: DevflareConfig): string[] {
	const services = config.bindings?.services
	if (!services) {
		return []
	}

	const names = new Set<string>()
	for (const binding of Object.values(services)) {
		if (
			binding &&
			typeof binding === 'object' &&
			typeof (binding as { service?: unknown }).service === 'string'
		) {
			const name = (binding as { service: string }).service.trim()
			if (name.length > 0) {
				names.add(name)
			}
		}
	}
	return [...names]
}

/**
 * Validate that every service binding target exists in the Cloudflare account.
 *
 * Throws `ServiceBindingValidationError` with the full list of missing
 * targets if any are unreachable. A missing self-reference is tolerated
 * when `selfWorkerName` matches, so first deploys don't fail against
 * themselves.
 */
export async function validateServiceBindings(
	config: DevflareConfig,
	accountId: string,
	options: ValidateServiceBindingsOptions
): Promise<void> {
	const referenced = collectReferencedServiceNames(config)
	if (referenced.length === 0) {
		return
	}

	const selfName = options.selfWorkerName?.trim()
	const toValidate = selfName ? referenced.filter((name) => name !== selfName) : referenced

	if (toValidate.length === 0) {
		return
	}

	const workers = await options.listWorkers(accountId)
	const workerNames = new Set(workers.map((worker) => worker.name))

	const missing = toValidate.filter((name) => !workerNames.has(name))
	if (missing.length > 0) {
		throw new ServiceBindingValidationError(missing, accountId)
	}
}
