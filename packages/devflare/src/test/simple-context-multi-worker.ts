// =============================================================================
// Test-context multi-worker Miniflare config builder
// =============================================================================
// When the user's devflare config declares cross-worker service or DO
// bindings, the test bridge needs Miniflare to spin up a worker-per-target
// instead of running everything inline as the bridge gateway script.
// This helper takes the in-progress single-worker `mfConfig`, the resolution
// results from resolve-service-bindings, and the user config, and rewrites
// `mfConfig` in place into a multi-worker layout.
//
// → Every per-worker option moves onto the primary worker. Which options stay
//   at the top level comes from Miniflare's own schema (splitSharedOptions),
//   never from a list here: a hand-kept list of bindings to copy is how
//   queue producers and Hyperdrive were once left behind and lost.
// =============================================================================

import type { DevflareConfig } from '../config'
import { type SharedOptionsRuntime, splitSharedOptions } from '../utils/miniflare-options'
import type { resolveDOBindings, resolveServiceBindings } from './resolve-service-bindings'

type ServiceBindingResolution = Awaited<ReturnType<typeof resolveServiceBindings>>
type DOBindingResolution = Awaited<ReturnType<typeof resolveDOBindings>>

/** An auxiliary worker entry, as the binding resolutions and local shims emit them. */
type AuxiliaryWorker = ServiceBindingResolution['workers'][number]

/**
 * @description Converts the in-progress single-worker `mfConfig` into a
 * multi-worker Miniflare config, in place. The first worker (the "primary")
 * receives every per-worker option the single-worker config carried — the
 * bridge gateway script, compatibility settings and all bindings — plus the
 * cross-worker DO and service bindings. Additional workers come from the two
 * resolutions and devflare's local shim workers, deduplicated by name.
 * @param mfConfig - the single-worker config; replaced by the multi-worker one
 * @param config - the user's devflare config (primary name and compat date)
 * @param serviceBindingResolution - workers and primary bindings for `services`
 * @param doBindingResolution - workers and primary bindings for cross-worker DOs
 * @param runtime - the loaded `miniflare` module, whose schema names the
 *   Miniflare-wide options that stay at the top level
 */
export function applyMultiWorkerConfig(
	mfConfig: any,
	config: DevflareConfig,
	serviceBindingResolution: ServiceBindingResolution | null,
	doBindingResolution: DOBindingResolution | null,
	runtime: SharedOptionsRuntime
): void {
	const { __devflareLocalSecretWorkers, __devflareLocalBindingWorkers, ...singleWorkerOptions } =
		mfConfig
	const { shared, worker } = splitSharedOptions(runtime, singleWorkerOptions)
	const { durableObjects, serviceBindings, ...workerOptions } = worker

	const primaryDurableObjects = {
		...(durableObjects as Record<string, unknown> | undefined),
		...doBindingResolution?.crossWorkerDOBindings
	}
	const primaryServiceBindings = {
		...(serviceBindings as Record<string, unknown> | undefined),
		...serviceBindingResolution?.primaryServiceBindings
	}

	const primaryWorker: Record<string, unknown> = {
		...workerOptions,
		name: config.name ?? 'primary',
		modules: true,
		compatibilityDate: config.compatibilityDate ?? '2025-01-01',
		...(Object.keys(primaryDurableObjects).length > 0 && { durableObjects: primaryDurableObjects }),
		...(Object.keys(primaryServiceBindings).length > 0 && {
			serviceBindings: primaryServiceBindings
		})
	}

	const additionalWorkers: AuxiliaryWorker[] = [
		...(serviceBindingResolution?.workers || []),
		...(doBindingResolution?.workers || []),
		...(__devflareLocalSecretWorkers || []),
		...(__devflareLocalBindingWorkers || [])
	]
	const workersByName = new Map<string, AuxiliaryWorker>()

	for (const additional of additionalWorkers) {
		if (!workersByName.has(additional.name)) {
			workersByName.set(additional.name, additional)
			continue
		}

		const existing = workersByName.get(additional.name)!
		if (additional.durableObjects) {
			existing.durableObjects = {
				...(existing.durableObjects || {}),
				...additional.durableObjects
			}
		}
	}

	// The caller holds `mfConfig`, so it is rewritten in place: only the
	// Miniflare-wide options stay beside `workers`.
	for (const key of Object.keys(mfConfig)) delete mfConfig[key]
	Object.assign(mfConfig, shared, { workers: [primaryWorker, ...workersByName.values()] })
}
