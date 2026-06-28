// =============================================================================
// Test-context multi-worker Miniflare config builder
// =============================================================================
// When the user's devflare config declares cross-worker service or DO
// bindings, the test bridge needs Miniflare to spin up a worker-per-target
// instead of running everything inline as the bridge gateway script.
// This pure helper takes the in-progress single-worker `mfConfig`, the
// resolution results from resolve-service-bindings, and the user config,
// and rewrites `mfConfig` in place into a multi-worker layout.
// =============================================================================

import type { DevflareConfig } from '../config'
import type { resolveDOBindings, resolveServiceBindings } from './resolve-service-bindings'

type ServiceBindingResolution = Awaited<ReturnType<typeof resolveServiceBindings>>
type DOBindingResolution = Awaited<ReturnType<typeof resolveDOBindings>>

/**
 * Convert the in-progress single-worker `mfConfig` into a multi-worker
 * Miniflare config. Mutates `mfConfig` in place.
 *
 * The first worker (the "primary") inherits the bridge gateway script and the
 * KV/R2/D1/email/DO settings that were set on the top-level mfConfig;
 * additional workers come from `serviceBindingResolution.workers` and
 * `doBindingResolution.workers`, deduplicated by name.
 */
export function applyMultiWorkerConfig(
	mfConfig: any,
	config: DevflareConfig,
	serviceBindingResolution: ServiceBindingResolution | null,
	doBindingResolution: DOBindingResolution | null
): void {
	const primaryDurableObjects = {
		...(mfConfig.durableObjects || {}),
		...(doBindingResolution?.crossWorkerDOBindings || {})
	}

	const primaryWorker: Record<string, unknown> = {
		name: config.name ?? 'primary',
		modules: true,
		script: mfConfig.script,
		compatibilityDate: config.compatibilityDate ?? '2025-01-01',
		...(mfConfig.kvNamespaces && { kvNamespaces: mfConfig.kvNamespaces }),
		...(mfConfig.r2Buckets && { r2Buckets: mfConfig.r2Buckets }),
		...(mfConfig.d1Databases && { d1Databases: mfConfig.d1Databases }),
		...(mfConfig.ratelimits && { ratelimits: mfConfig.ratelimits }),
		...(mfConfig.versionMetadata && { versionMetadata: mfConfig.versionMetadata }),
		...(mfConfig.workerLoaders && { workerLoaders: mfConfig.workerLoaders }),
		...(mfConfig.mtlsCertificates && { mtlsCertificates: mfConfig.mtlsCertificates }),
		...(mfConfig.dispatchNamespaces && { dispatchNamespaces: mfConfig.dispatchNamespaces }),
		...(mfConfig.workflows && { workflows: mfConfig.workflows }),
		...(mfConfig.pipelines && { pipelines: mfConfig.pipelines }),
		...(mfConfig.images && { images: mfConfig.images }),
		...(mfConfig.media && { media: mfConfig.media }),
		...(mfConfig.artifacts && { artifacts: mfConfig.artifacts }),
		...(mfConfig.secretsStoreSecrets && { secretsStoreSecrets: mfConfig.secretsStoreSecrets }),
		...(mfConfig.wrappedBindings && { wrappedBindings: mfConfig.wrappedBindings }),
		...(mfConfig.email && { email: mfConfig.email }),
		...(Object.keys(primaryDurableObjects).length > 0 && { durableObjects: primaryDurableObjects }),
		...(mfConfig.serviceBindings || serviceBindingResolution?.primaryServiceBindings
			? {
					serviceBindings: {
						...(mfConfig.serviceBindings ?? {}),
						...(serviceBindingResolution?.primaryServiceBindings ?? {})
					}
				}
			: {})
	}

	const additionalWorkers = [
		...(serviceBindingResolution?.workers || []),
		...(doBindingResolution?.workers || []),
		...(mfConfig.__devflareLocalSecretWorkers || []),
		...(mfConfig.__devflareLocalBindingWorkers || [])
	]
	const workersByName = new Map<string, (typeof additionalWorkers)[0]>()

	for (const worker of additionalWorkers) {
		if (!workersByName.has(worker.name)) {
			workersByName.set(worker.name, worker)
			continue
		}

		const existing = workersByName.get(worker.name)!
		if (worker.durableObjects) {
			existing.durableObjects = {
				...(existing.durableObjects || {}),
				...worker.durableObjects
			}
		}
	}

	const workers = [primaryWorker, ...workersByName.values()]
	delete mfConfig.script
	delete mfConfig.modules
	delete mfConfig.kvNamespaces
	delete mfConfig.r2Buckets
	delete mfConfig.d1Databases
	delete mfConfig.ratelimits
	delete mfConfig.versionMetadata
	delete mfConfig.workerLoaders
	delete mfConfig.mtlsCertificates
	delete mfConfig.dispatchNamespaces
	delete mfConfig.workflows
	delete mfConfig.pipelines
	delete mfConfig.images
	delete mfConfig.media
	delete mfConfig.artifacts
	delete mfConfig.secretsStoreSecrets
	delete mfConfig.wrappedBindings
	delete mfConfig.serviceBindings
	delete mfConfig.__devflareLocalSecretWorkers
	delete mfConfig.__devflareLocalBindingWorkers
	delete mfConfig.durableObjects
	mfConfig.workers = workers
}
