import type { WranglerConfig } from '../config/compiler'
import type { ResolvedWorker, resolveServiceBindings } from '../test/resolve-service-bindings'
import type { AuxiliaryWorkerConfig } from './plugin-durable-objects'

export const VIRTUAL_SERVICE_WORKER_PREFIX = 'virtual:devflare-service-worker/'
export const RESOLVED_VIRTUAL_SERVICE_WORKER_PREFIX = '\0' + VIRTUAL_SERVICE_WORKER_PREFIX

type ServiceBindingResolution = Awaited<ReturnType<typeof resolveServiceBindings>>

export interface AuxiliaryServiceWorkerResult {
	auxiliaryWorkers: AuxiliaryWorkerConfig[]
	virtualModules: Map<string, string>
}

function virtualServiceWorkerId(workerName: string): string {
	return `${VIRTUAL_SERVICE_WORKER_PREFIX}${encodeURIComponent(workerName)}`
}

export function resolvedVirtualServiceWorkerId(workerName: string): string {
	return `${RESOLVED_VIRTUAL_SERVICE_WORKER_PREFIX}${encodeURIComponent(workerName)}`
}

function objectEntries<T>(record: Record<string, T> | undefined): Array<[string, T]> {
	return record ? Object.entries(record) : []
}

function toWranglerDurableObjectBinding(
	name: string,
	value: NonNullable<ResolvedWorker['durableObjects']>[string]
): { name: string; class_name: string; script_name?: string } {
	if (typeof value === 'string') {
		return { name, class_name: value }
	}

	return {
		name,
		class_name: value.className,
		script_name: value.scriptName
	}
}

function toWranglerWorkerConfig(worker: ResolvedWorker): WranglerConfig {
	const queueProducers = worker.queueProducers
		? objectEntries(worker.queueProducers).map(([binding, producer]) => ({
				binding,
				queue: producer.queueName
			}))
		: undefined
	const queueConsumers = worker.queueConsumers
		? objectEntries(worker.queueConsumers).map(([queue, consumer]) => ({
				queue,
				...(consumer.maxBatchSize !== undefined && {
					max_batch_size: consumer.maxBatchSize as number
				}),
				...(consumer.maxBatchTimeout !== undefined && {
					max_batch_timeout: consumer.maxBatchTimeout as number
				}),
				...(consumer.maxRetries !== undefined && { max_retries: consumer.maxRetries as number }),
				...(typeof consumer.deadLetterQueue === 'string' && {
					dead_letter_queue: consumer.deadLetterQueue
				}),
				...(consumer.maxConcurrency !== undefined && {
					max_concurrency: consumer.maxConcurrency as number
				}),
				...(consumer.retryDelay !== undefined && { retry_delay: consumer.retryDelay as number })
			}))
		: undefined
	const queues =
		queueProducers || queueConsumers
			? {
					...(queueProducers && { producers: queueProducers }),
					...(queueConsumers && { consumers: queueConsumers })
				}
			: undefined
	const durableObjectBindings = worker.durableObjects
		? objectEntries(worker.durableObjects).map(([name, value]) =>
				toWranglerDurableObjectBinding(name, value)
			)
		: []
	const serviceBindings = worker.serviceBindings
		? objectEntries(worker.serviceBindings).map(([binding, target]) => ({
				binding,
				service: target.name,
				...(target.entrypoint && { entrypoint: target.entrypoint })
			}))
		: []

	const config: WranglerConfig = {
		name: worker.name,
		main: virtualServiceWorkerId(worker.name),
		compatibility_date: worker.compatibilityDate,
		...(worker.compatibilityFlags && { compatibility_flags: worker.compatibilityFlags }),
		...(worker.bindings && { vars: worker.bindings }),
		...(worker.kvNamespaces && {
			kv_namespaces: objectEntries(worker.kvNamespaces).map(([binding, id]) => ({
				binding,
				id
			}))
		}),
		...(worker.r2Buckets && {
			r2_buckets: objectEntries(worker.r2Buckets).map(([binding, bucket_name]) => ({
				binding,
				bucket_name
			}))
		}),
		...(worker.d1Databases && {
			d1_databases: objectEntries(worker.d1Databases).map(([binding, database_id]) => ({
				binding,
				database_id,
				database_name: database_id
			}))
		}),
		...(durableObjectBindings.length > 0 && {
			durable_objects: {
				bindings: durableObjectBindings
			}
		}),
		...(serviceBindings.length > 0 && {
			services: serviceBindings
		}),
		...(queues && { queues })
	}

	return config
}

export function createAuxiliaryServiceWorkerConfigs(
	resolution: ServiceBindingResolution | null | undefined
): AuxiliaryServiceWorkerResult {
	if (!resolution || resolution.workers.length === 0) {
		return { auxiliaryWorkers: [], virtualModules: new Map() }
	}

	const virtualModules = new Map<string, string>()
	const auxiliaryWorkers = resolution.workers.map((worker) => {
		virtualModules.set(resolvedVirtualServiceWorkerId(worker.name), worker.script)

		return {
			config: toWranglerWorkerConfig(worker) as unknown as Record<string, unknown>
		}
	})

	return { auxiliaryWorkers, virtualModules }
}
