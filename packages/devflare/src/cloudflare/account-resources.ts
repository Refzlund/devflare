import { apiDelete, apiGetAll, apiPost, CloudflareAPIError, type APIClientOptions } from './api'
import type {
	AIModel,
	AIModelInfo,
	D1Database,
	D1DatabaseInfo,
	D1QueryParameter,
	D1QueryResult,
	D1RawQueryResult,
	HyperdriveConfig,
	HyperdriveConfigInfo,
	KVNamespace,
	KVNamespaceInfo,
	Queue,
	QueueInfo,
	R2Bucket,
	R2BucketInfo,
	VectorizeIndex,
	VectorizeIndexInfo
} from './types'

export async function listKVNamespaces(
	accountId: string,
	options?: APIClientOptions
): Promise<KVNamespaceInfo[]> {
	const namespaces = await apiGetAll<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		options
	)

	return namespaces.map((namespace) => ({
		id: namespace.id,
		name: namespace.title
	}))
}

export async function createKVNamespace(
	accountId: string,
	title: string,
	options?: APIClientOptions
): Promise<KVNamespaceInfo> {
	const namespace = await apiPost<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		{ title },
		options
	)

	return {
		id: namespace.id,
		name: namespace.title
	}
}

export async function deleteKVNamespace(
	accountId: string,
	namespaceId: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedNamespaceId = encodeURIComponent(namespaceId)
	await apiDelete<{}>(
		`/accounts/${accountId}/storage/kv/namespaces/${encodedNamespaceId}`,
		options
	)
}

export async function listD1Databases(
	accountId: string,
	options?: APIClientOptions
): Promise<D1DatabaseInfo[]> {
	const databases = await apiGetAll<D1Database>(
		`/accounts/${accountId}/d1/database`,
		options
	)

	return databases.map((database) => ({
		id: database.uuid,
		name: database.name,
		version: database.version,
		tableCount: database.num_tables,
		sizeBytes: database.file_size
	}))
}

export async function createD1Database(
	accountId: string,
	name: string,
	options?: APIClientOptions & {
		jurisdiction?: 'eu' | 'fedramp'
		primaryLocationHint?: 'wnam' | 'enam' | 'weur' | 'eeur' | 'apac' | 'oc'
	}
): Promise<D1DatabaseInfo> {
	const created = await apiPost<D1Database>(
		`/accounts/${accountId}/d1/database`,
		{
			name,
			...(options?.jurisdiction ? { jurisdiction: options.jurisdiction } : {}),
			...(options?.primaryLocationHint ? { primary_location_hint: options.primaryLocationHint } : {})
		},
		options
	)

	return {
		id: created.uuid,
		name: created.name,
		version: created.version,
		tableCount: created.num_tables,
		sizeBytes: created.file_size
	}
}

export async function deleteD1Database(
	accountId: string,
	databaseId: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedDatabaseId = encodeURIComponent(databaseId)
	await apiDelete<{}>(
		`/accounts/${accountId}/d1/database/${encodedDatabaseId}`,
		options
	)
}

export async function queryD1Database<T = Record<string, unknown>>(
	accountId: string,
	databaseId: string,
	query: {
		sql: string
		params?: D1QueryParameter[]
	},
	options?: APIClientOptions
): Promise<D1QueryResult<T>[]> {
	const { apiPost } = await import('./api')
	return apiPost<D1QueryResult<T>[]>(
		`/accounts/${accountId}/d1/database/${databaseId}/query`,
		query,
		options
	)
}

export async function rawD1DatabaseQuery(
	accountId: string,
	databaseId: string,
	query: {
		sql: string
		params?: D1QueryParameter[]
	},
	options?: APIClientOptions
): Promise<D1RawQueryResult[]> {
	const { apiPost } = await import('./api')
	return apiPost<D1RawQueryResult[]>(
		`/accounts/${accountId}/d1/database/${databaseId}/raw`,
		query,
		options
	)
}

export async function listQueues(
	accountId: string,
	options?: APIClientOptions
): Promise<QueueInfo[]> {
	const queues = await apiGetAll<Queue>(
		`/accounts/${accountId}/queues`,
		options
	)

	return queues
		.filter((queue): queue is Queue & { queue_id: string; queue_name: string } => {
			return typeof queue.queue_id === 'string' && queue.queue_id.length > 0
				&& typeof queue.queue_name === 'string' && queue.queue_name.length > 0
		})
		.map((queue) => ({
			id: queue.queue_id,
			name: queue.queue_name,
			createdOn: queue.created_on ? new Date(queue.created_on) : undefined,
			modifiedOn: queue.modified_on ? new Date(queue.modified_on) : undefined,
			deliveryDelay: queue.settings?.delivery_delay,
			deliveryPaused: queue.settings?.delivery_paused,
			messageRetentionPeriod: queue.settings?.message_retention_period
		}))
}

export async function createQueue(
	accountId: string,
	queueName: string,
	options?: APIClientOptions
): Promise<QueueInfo> {
	const queue = await apiPost<Queue>(
		`/accounts/${accountId}/queues`,
		{ queue_name: queueName },
		options
	)

	return {
		id: queue.queue_id ?? '',
		name: queue.queue_name ?? queueName,
		createdOn: queue.created_on ? new Date(queue.created_on) : undefined,
		modifiedOn: queue.modified_on ? new Date(queue.modified_on) : undefined,
		deliveryDelay: queue.settings?.delivery_delay,
		deliveryPaused: queue.settings?.delivery_paused,
		messageRetentionPeriod: queue.settings?.message_retention_period
	}
}

export async function deleteQueue(
	accountId: string,
	queueId: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedQueueId = encodeURIComponent(queueId)
	await apiDelete<{}>(
		`/accounts/${accountId}/queues/${encodedQueueId}`,
		options
	)
}

export async function listR2Buckets(
	accountId: string,
	options?: APIClientOptions
): Promise<R2BucketInfo[]> {
	const buckets = await apiGetAll<R2Bucket>(
		`/accounts/${accountId}/r2/buckets`,
		options
	)

	return buckets.map((bucket) => ({
		name: bucket.name,
		createdOn: new Date(bucket.creation_date),
		location: bucket.location
	}))
}

export async function createR2Bucket(
	accountId: string,
	name: string,
	options?: APIClientOptions & {
		locationHint?: 'apac' | 'eeur' | 'enam' | 'oc' | 'weur' | 'wnam'
		storageClass?: 'Standard' | 'InfrequentAccess'
	}
): Promise<R2BucketInfo> {
	const bucket = await apiPost<R2Bucket>(
		`/accounts/${accountId}/r2/buckets`,
		{
			name,
			...(options?.locationHint ? { locationHint: options.locationHint } : {}),
			...(options?.storageClass ? { storageClass: options.storageClass } : {})
		},
		options
	)

	return {
		name: bucket.name,
		createdOn: bucket.creation_date ? new Date(bucket.creation_date) : new Date(),
		location: bucket.location
	}
}

export async function deleteR2Bucket(
	accountId: string,
	bucketName: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedBucketName = encodeURIComponent(bucketName)
	await apiDelete<{}>(
		`/accounts/${accountId}/r2/buckets/${encodedBucketName}`,
		options
	)
}

export async function listHyperdrives(
	accountId: string,
	options?: APIClientOptions
): Promise<HyperdriveConfigInfo[]> {
	const hyperdrives = await apiGetAll<HyperdriveConfig>(
		`/accounts/${accountId}/hyperdrive/configs`,
		options
	)

	return hyperdrives.map((hyperdrive) => ({
		id: hyperdrive.id,
		name: hyperdrive.name,
		createdOn: hyperdrive.created_on ? new Date(hyperdrive.created_on) : undefined,
		modifiedOn: hyperdrive.modified_on ? new Date(hyperdrive.modified_on) : undefined
	}))
}

export async function deleteHyperdrive(
	accountId: string,
	hyperdriveId: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedHyperdriveId = encodeURIComponent(hyperdriveId)
	await apiDelete<{}>(
		`/accounts/${accountId}/hyperdrive/configs/${encodedHyperdriveId}`,
		options
	)
}

export async function listVectorizeIndexes(
	accountId: string,
	options?: APIClientOptions
): Promise<VectorizeIndexInfo[]> {
	try {
		const indexes = await apiGetAll<VectorizeIndex>(
			`/accounts/${accountId}/vectorize/v2/indexes`,
			options
		)

		return indexes.map((index) => ({
			name: index.name,
			dimensions: index.config.dimensions,
			metric: index.config.metric,
			description: index.description
		}))
	} catch (error) {
		// Swallow only "endpoint not available on this account" style errors
		// (404). Any other failure — auth (401/403), rate limit (429), 5xx —
		// must be surfaced so callers don't silently treat the account as
		// empty and re-create resources or skip a validation step.
		if (error instanceof CloudflareAPIError && error.code === 404) {
			return []
		}
		throw error
	}
}

export async function createVectorizeIndex(
	accountId: string,
	index: {
		name: string
		dimensions: number
		metric: 'cosine' | 'euclidean' | 'dot-product' | string
		description?: string
	},
	options?: APIClientOptions
): Promise<VectorizeIndexInfo> {
	const created = await apiPost<VectorizeIndex>(
		`/accounts/${accountId}/vectorize/v2/indexes`,
		{
			name: index.name,
			config: {
				dimensions: index.dimensions,
				metric: index.metric
			},
			...(index.description ? { description: index.description } : {})
		},
		options
	)

	return {
		name: created.name,
		dimensions: created.config.dimensions,
		metric: created.config.metric,
		description: created.description
	}
}

export async function deleteVectorizeIndex(
	accountId: string,
	indexName: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedIndexName = encodeURIComponent(indexName)
	await apiDelete<{}>(
		`/accounts/${accountId}/vectorize/v2/indexes/${encodedIndexName}`,
		options
	)
}

export async function listAIModels(
	accountId: string,
	options?: APIClientOptions
): Promise<AIModelInfo[]> {
	try {
		const models = await apiGetAll<AIModel>(
			`/accounts/${accountId}/ai/models/search`,
			options
		)

		return models.map((model) => ({
			id: model.id,
			name: model.name,
			task: model.task?.name,
			description: model.description
		}))
	} catch {
		return []
	}
}
