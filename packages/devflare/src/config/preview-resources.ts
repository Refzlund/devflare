import {
	createD1Database,
	createKVNamespace,
	createQueue,
	createR2Bucket,
	createVectorizeIndex,
	deleteD1Database,
	deleteHyperdrive,
	deleteKVNamespace,
	deleteQueue,
	deleteR2Bucket,
	deleteVectorizeIndex,
	getPrimaryAccount,
	listD1Databases,
	listHyperdrives,
	listKVNamespaces,
	listQueues,
	listR2Buckets,
	listVectorizeIndexes,
	type D1DatabaseInfo,
	type HyperdriveConfigInfo,
	type KVNamespaceInfo,
	type QueueInfo,
	type R2BucketInfo,
	type VectorizeIndexInfo
} from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'
import {
	isPreviewScopedName,
	materializePreviewScopedConfig,
	materializePreviewScopedString,
	type PreviewResolutionOptions
} from './preview'
import { mergeConfigForEnvironment } from './resolve'
import type { DevflareConfig } from './schema'

export interface PreviewScopedResourceRef {
	bindingName?: string
	baseName: string
	previewName: string
}

export interface PreviewScopedResourcePlan {
	kv: PreviewScopedResourceRef[]
	d1: PreviewScopedResourceRef[]
	r2: PreviewScopedResourceRef[]
	queues: PreviewScopedResourceRef[]
	vectorize: PreviewScopedResourceRef[]
	hyperdrive: PreviewScopedResourceRef[]
	analyticsEngine: PreviewScopedResourceRef[]
	browser: PreviewScopedResourceRef[]
}

export interface PreviewScopedResourceNames {
	kv: string[]
	d1: string[]
	r2: string[]
	queues: string[]
	vectorize: string[]
	hyperdrive: string[]
	analyticsEngine: string[]
	browser: string[]
}

export interface PreparePreviewScopedResourcesForDeployResult {
	accountId?: string
	config: DevflareConfig
	plan: PreviewScopedResourcePlan
	created: PreviewScopedResourceNames
	existing: PreviewScopedResourceNames
	warnings: string[]
}

export interface CleanupPreviewScopedResourcesResult {
	accountId?: string
	plan: PreviewScopedResourcePlan
	candidates: PreviewScopedResourceNames
	deleted: PreviewScopedResourceNames
	warnings: string[]
}

interface PreviewScopedResourceLifecycleApi {
	getPrimaryAccount: typeof getPrimaryAccount
	getEffectiveAccountId: typeof getEffectiveAccountId
	listKVNamespaces: typeof listKVNamespaces
	createKVNamespace: typeof createKVNamespace
	deleteKVNamespace: typeof deleteKVNamespace
	listD1Databases: typeof listD1Databases
	createD1Database: typeof createD1Database
	deleteD1Database: typeof deleteD1Database
	listR2Buckets: typeof listR2Buckets
	createR2Bucket: typeof createR2Bucket
	deleteR2Bucket: typeof deleteR2Bucket
	listQueues: typeof listQueues
	createQueue: typeof createQueue
	deleteQueue: typeof deleteQueue
	listVectorizeIndexes: typeof listVectorizeIndexes
	createVectorizeIndex: typeof createVectorizeIndex
	deleteVectorizeIndex: typeof deleteVectorizeIndex
	listHyperdrives: typeof listHyperdrives
	deleteHyperdrive: typeof deleteHyperdrive
}

interface PreviewScopedResourceLifecycleState {
	namespaces: KVNamespaceInfo[]
	databases: D1DatabaseInfo[]
	buckets: R2BucketInfo[]
	queues: QueueInfo[]
	vectorizeIndexes: VectorizeIndexInfo[]
	hyperdrives: HyperdriveConfigInfo[]
}

export interface PreviewScopedResourceLifecycleOptions extends PreviewResolutionOptions {
	accountId?: string
	cloudflare?: Partial<PreviewScopedResourceLifecycleApi>
}

const defaultPreviewScopedResourceLifecycleApi: PreviewScopedResourceLifecycleApi = {
	getPrimaryAccount,
	getEffectiveAccountId,
	listKVNamespaces,
	createKVNamespace,
	deleteKVNamespace,
	listD1Databases,
	createD1Database,
	deleteD1Database,
	listR2Buckets,
	createR2Bucket,
	deleteR2Bucket,
	listQueues,
	createQueue,
	deleteQueue,
	listVectorizeIndexes,
	createVectorizeIndex,
	deleteVectorizeIndex,
	listHyperdrives,
	deleteHyperdrive
}

function resolvePreviewScopedResourceLifecycleApi(
	overrides: Partial<PreviewScopedResourceLifecycleApi> | undefined
): PreviewScopedResourceLifecycleApi {
	return {
		...defaultPreviewScopedResourceLifecycleApi,
		...(overrides ?? {})
	}
}

function createEmptyPreviewScopedResourceNames(): PreviewScopedResourceNames {
	return {
		kv: [],
		d1: [],
		r2: [],
		queues: [],
		vectorize: [],
		hyperdrive: [],
		analyticsEngine: [],
		browser: []
	}
}

function createEmptyPreviewScopedResourcePlan(): PreviewScopedResourcePlan {
	return {
		kv: [],
		d1: [],
		r2: [],
		queues: [],
		vectorize: [],
		hyperdrive: [],
		analyticsEngine: [],
		browser: []
	}
}

function createPreviewScopedResourceRef(
	value: string,
	bindingName: string | undefined,
	options: PreviewResolutionOptions
): PreviewScopedResourceRef | null {
	if (!isPreviewScopedName(value)) {
		return null
	}

	const baseName = materializePreviewScopedString(value)
	const previewName = materializePreviewScopedString(value, options)

	if (!baseName || !previewName || baseName === previewName) {
		return null
	}

	return {
		...(bindingName ? { bindingName } : {}),
		baseName,
		previewName
	}
}

function upsertPreviewScopedQueueRef(
	queueRefs: Map<string, PreviewScopedResourceRef>,
	value: string,
	options: PreviewResolutionOptions
): void {
	const ref = createPreviewScopedResourceRef(value, undefined, options)
	if (!ref) {
		return
	}

	if (!queueRefs.has(ref.previewName)) {
		queueRefs.set(ref.previewName, ref)
	}
}

function applyHyperdriveBindingFallbacks(
	config: DevflareConfig,
	hyperdriveBindingFallbacks: Record<string, string>
): DevflareConfig {
	if (!config.bindings?.hyperdrive || Object.keys(hyperdriveBindingFallbacks).length === 0) {
		return config
	}

	return {
		...config,
		bindings: {
			...config.bindings,
			hyperdrive: Object.fromEntries(
				Object.entries(config.bindings.hyperdrive).map(([bindingName, bindingConfig]) => {
					const fallbackName = hyperdriveBindingFallbacks[bindingName]
					if (!fallbackName || typeof bindingConfig !== 'string') {
						return [bindingName, bindingConfig]
					}

					return [bindingName, fallbackName]
				})
			)
		}
	}
}

function resolvePreviewScopedResourceLifecycleWarnings(plan: PreviewScopedResourcePlan): string[] {
	const warnings: string[] = []

	if (plan.analyticsEngine.length > 0) {
		warnings.push(
			'Workers Analytics Engine datasets are created automatically on first write, so Devflare does not provision or delete preview-scoped analytics datasets.'
		)
	}

	if (plan.browser.length > 0) {
		warnings.push(
			'Browser Rendering bindings do not own account-scoped resources, so Devflare does not provision or delete preview-scoped browser bindings.'
		)
	}

	return warnings
}

function hasPreviewScopedLifecycleResources(plan: PreviewScopedResourcePlan): boolean {
	return plan.kv.length > 0
		|| plan.d1.length > 0
		|| plan.r2.length > 0
		|| plan.queues.length > 0
		|| plan.vectorize.length > 0
		|| plan.hyperdrive.length > 0
}

async function resolveLifecycleAccountId(
	config: DevflareConfig,
	options: PreviewScopedResourceLifecycleOptions,
	cloudflareApi: PreviewScopedResourceLifecycleApi
): Promise<string> {
	if (options.accountId?.trim()) {
		return options.accountId.trim()
	}

	if (config.accountId?.trim()) {
		return config.accountId.trim()
	}

	const primaryAccount = await cloudflareApi.getPrimaryAccount()
	if (!primaryAccount) {
		throw new Error(
			'Could not resolve a Cloudflare account for preview-scoped resource lifecycle management. Set accountId in devflare.config.ts, pass --account, or authenticate with Wrangler.'
		)
	}

	const effective = await cloudflareApi.getEffectiveAccountId(primaryAccount.id)
	return effective.accountId
}

async function loadPreviewScopedResourceLifecycleState(
	accountId: string,
	plan: PreviewScopedResourcePlan,
	cloudflareApi: PreviewScopedResourceLifecycleApi
): Promise<PreviewScopedResourceLifecycleState> {
	const [namespaces, databases, buckets, queues, vectorizeIndexes, hyperdrives] = await Promise.all([
		plan.kv.length > 0 ? cloudflareApi.listKVNamespaces(accountId) : Promise.resolve([] as KVNamespaceInfo[]),
		plan.d1.length > 0 ? cloudflareApi.listD1Databases(accountId) : Promise.resolve([] as D1DatabaseInfo[]),
		plan.r2.length > 0 ? cloudflareApi.listR2Buckets(accountId) : Promise.resolve([] as R2BucketInfo[]),
		plan.queues.length > 0 ? cloudflareApi.listQueues(accountId) : Promise.resolve([] as QueueInfo[]),
		plan.vectorize.length > 0 ? cloudflareApi.listVectorizeIndexes(accountId) : Promise.resolve([] as VectorizeIndexInfo[]),
		plan.hyperdrive.length > 0 ? cloudflareApi.listHyperdrives(accountId) : Promise.resolve([] as HyperdriveConfigInfo[])
	])

	return {
		namespaces,
		databases,
		buckets,
		queues,
		vectorizeIndexes,
		hyperdrives
	}
}

function findVectorizeIndexByName(
	indexes: VectorizeIndexInfo[],
	name: string
): VectorizeIndexInfo | undefined {
	return indexes.find((index) => index.name === name)
}

function findKVNamespaceByName(
	namespaces: KVNamespaceInfo[],
	name: string
): KVNamespaceInfo | undefined {
	return namespaces.find((namespace) => namespace.name === name)
}

function findD1DatabaseByName(
	databases: D1DatabaseInfo[],
	name: string
): D1DatabaseInfo | undefined {
	return databases.find((database) => database.name === name)
}

function findR2BucketByName(
	buckets: R2BucketInfo[],
	name: string
): R2BucketInfo | undefined {
	return buckets.find((bucket) => bucket.name === name)
}

function findQueueByName(
	queues: QueueInfo[],
	name: string
): QueueInfo | undefined {
	return queues.find((queue) => queue.name === name)
}

function findHyperdriveByName(
	hyperdrives: HyperdriveConfigInfo[],
	name: string
): HyperdriveConfigInfo | undefined {
	return hyperdrives.find((hyperdrive) => hyperdrive.name === name)
}

export function collectPreviewScopedResourcePlan(
	config: DevflareConfig,
	options: PreviewResolutionOptions = {}
): PreviewScopedResourcePlan {
	const mergedConfig = mergeConfigForEnvironment(config, options.environment)
	const plan = createEmptyPreviewScopedResourcePlan()
	const bindings = mergedConfig.bindings

	if (!bindings) {
		return plan
	}

	if (bindings.kv) {
		plan.kv = Object.entries(bindings.kv)
			.map(([bindingName, bindingConfig]) => {
				return typeof bindingConfig === 'string'
					? createPreviewScopedResourceRef(bindingConfig, bindingName, options)
					: null
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	if (bindings.d1) {
		plan.d1 = Object.entries(bindings.d1)
			.map(([bindingName, bindingConfig]) => {
				return typeof bindingConfig === 'string'
					? createPreviewScopedResourceRef(bindingConfig, bindingName, options)
					: null
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	if (bindings.r2) {
		plan.r2 = Object.entries(bindings.r2)
			.map(([bindingName, bindingConfig]) => {
				return createPreviewScopedResourceRef(bindingConfig, bindingName, options)
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	if (bindings.queues) {
		const queueRefs = new Map<string, PreviewScopedResourceRef>()

		for (const queueName of Object.values(bindings.queues.producers ?? {})) {
			upsertPreviewScopedQueueRef(queueRefs, queueName, options)
		}

		for (const consumer of bindings.queues.consumers ?? []) {
			upsertPreviewScopedQueueRef(queueRefs, consumer.queue, options)
			if (consumer.deadLetterQueue) {
				upsertPreviewScopedQueueRef(queueRefs, consumer.deadLetterQueue, options)
			}
		}

		plan.queues = Array.from(queueRefs.values())
	}

	if (bindings.vectorize) {
		plan.vectorize = Object.entries(bindings.vectorize)
			.map(([bindingName, bindingConfig]) => {
				return createPreviewScopedResourceRef(bindingConfig.indexName, bindingName, options)
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	if (bindings.hyperdrive) {
		plan.hyperdrive = Object.entries(bindings.hyperdrive)
			.map(([bindingName, bindingConfig]) => {
				return typeof bindingConfig === 'string'
					? createPreviewScopedResourceRef(bindingConfig, bindingName, options)
					: null
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	if (bindings.analyticsEngine) {
		plan.analyticsEngine = Object.entries(bindings.analyticsEngine)
			.map(([bindingName, bindingConfig]) => {
				return createPreviewScopedResourceRef(bindingConfig.dataset, bindingName, options)
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	if (bindings.browser) {
		plan.browser = Object.entries(bindings.browser)
			.map(([bindingName, bindingConfig]) => {
				return createPreviewScopedResourceRef(bindingConfig, bindingName, options)
			})
			.filter((ref): ref is PreviewScopedResourceRef => ref !== null)
	}

	return plan
}

export async function preparePreviewScopedResourcesForDeploy(
	config: DevflareConfig,
	options: PreviewScopedResourceLifecycleOptions = {}
): Promise<PreparePreviewScopedResourcesForDeployResult> {
	const mergedConfig = mergeConfigForEnvironment(config, options.environment)
	const plan = collectPreviewScopedResourcePlan(config, options)
	const created = createEmptyPreviewScopedResourceNames()
	const existing = createEmptyPreviewScopedResourceNames()
	const warnings = resolvePreviewScopedResourceLifecycleWarnings(plan)

	if (!hasPreviewScopedLifecycleResources(plan)) {
		return {
			config: materializePreviewScopedConfig(mergedConfig, options),
			plan,
			created,
			existing,
			warnings
		}
	}

	const cloudflareApi = resolvePreviewScopedResourceLifecycleApi(options.cloudflare)
	const accountId = await resolveLifecycleAccountId(config, options, cloudflareApi)

	const {
		namespaces,
		databases,
		buckets,
		queues,
		vectorizeIndexes,
		hyperdrives
	} = await loadPreviewScopedResourceLifecycleState(accountId, plan, cloudflareApi)

	for (const ref of plan.kv) {
		if (findKVNamespaceByName(namespaces, ref.previewName)) {
			existing.kv.push(ref.previewName)
			continue
		}

		await cloudflareApi.createKVNamespace(accountId, ref.previewName)
		created.kv.push(ref.previewName)
		namespaces.push({ id: '', name: ref.previewName })
	}

	for (const ref of plan.d1) {
		if (findD1DatabaseByName(databases, ref.previewName)) {
			existing.d1.push(ref.previewName)
			continue
		}

		const database = await cloudflareApi.createD1Database(accountId, ref.previewName)
		created.d1.push(ref.previewName)
		databases.push(database)
	}

	for (const ref of plan.r2) {
		if (findR2BucketByName(buckets, ref.previewName)) {
			existing.r2.push(ref.previewName)
			continue
		}

		const bucket = await cloudflareApi.createR2Bucket(accountId, ref.previewName)
		created.r2.push(ref.previewName)
		buckets.push(bucket)
	}

	for (const ref of plan.queues) {
		if (findQueueByName(queues, ref.previewName)) {
			existing.queues.push(ref.previewName)
			continue
		}

		const queue = await cloudflareApi.createQueue(accountId, ref.previewName)
		created.queues.push(ref.previewName)
		queues.push(queue)
	}

	for (const ref of plan.vectorize) {
		if (findVectorizeIndexByName(vectorizeIndexes, ref.previewName)) {
			existing.vectorize.push(ref.previewName)
			continue
		}

		const baseIndex = findVectorizeIndexByName(vectorizeIndexes, ref.baseName)
		if (!baseIndex) {
			throw new Error(
				`Could not provision preview Vectorize index "${ref.previewName}" because the base index "${ref.baseName}" was not found.`
			)
		}

		const createdIndex = await cloudflareApi.createVectorizeIndex(accountId, {
			name: ref.previewName,
			dimensions: baseIndex.dimensions,
			metric: baseIndex.metric,
			description: baseIndex.description
		})
		created.vectorize.push(ref.previewName)
		vectorizeIndexes.push(createdIndex)
	}

	const hyperdriveBindingFallbacks: Record<string, string> = {}

	for (const ref of plan.hyperdrive) {
		if (findHyperdriveByName(hyperdrives, ref.previewName)) {
			existing.hyperdrive.push(ref.previewName)
			continue
		}

		if (!findHyperdriveByName(hyperdrives, ref.baseName)) {
			throw new Error(
				`Could not resolve preview Hyperdrive "${ref.previewName}" because neither the preview config nor the base config "${ref.baseName}" exists in this account.`
			)
		}

		if (ref.bindingName) {
			hyperdriveBindingFallbacks[ref.bindingName] = ref.baseName
		}

		warnings.push(
			`Preview Hyperdrive "${ref.previewName}" is not auto-provisioned because Cloudflare does not expose stored Hyperdrive credentials for cloning. Devflare will reuse the base Hyperdrive "${ref.baseName}" for binding ${ref.bindingName ?? ref.previewName}.`
		)
	}

	return {
		accountId,
		config: materializePreviewScopedConfig(
			applyHyperdriveBindingFallbacks(mergedConfig, hyperdriveBindingFallbacks),
			options
		),
		plan,
		created,
		existing,
		warnings
	}
}

export async function cleanupPreviewScopedResources(
	config: DevflareConfig,
	options: PreviewScopedResourceLifecycleOptions & { apply?: boolean } = {}
): Promise<CleanupPreviewScopedResourcesResult> {
	const plan = collectPreviewScopedResourcePlan(config, options)
	const candidates = createEmptyPreviewScopedResourceNames()
	const deleted = createEmptyPreviewScopedResourceNames()
	const warnings = resolvePreviewScopedResourceLifecycleWarnings(plan)

	if (!hasPreviewScopedLifecycleResources(plan)) {
		return {
			plan,
			candidates,
			deleted,
			warnings
		}
	}

	const cloudflareApi = resolvePreviewScopedResourceLifecycleApi(options.cloudflare)
	const accountId = await resolveLifecycleAccountId(config, options, cloudflareApi)
	const apply = options.apply === true

	const {
		namespaces,
		databases,
		buckets,
		queues,
		vectorizeIndexes,
		hyperdrives
	} = await loadPreviewScopedResourceLifecycleState(accountId, plan, cloudflareApi)

	const kvCandidates = plan.kv
		.map((ref) => findKVNamespaceByName(namespaces, ref.previewName))
		.filter((namespace): namespace is KVNamespaceInfo => namespace !== undefined)
	for (const namespace of kvCandidates) {
		candidates.kv.push(namespace.name)
		if (!apply) {
			continue
		}

		await cloudflareApi.deleteKVNamespace(accountId, namespace.id)
		deleted.kv.push(namespace.name)
	}

	const d1Candidates = plan.d1
		.map((ref) => findD1DatabaseByName(databases, ref.previewName))
		.filter((database): database is D1DatabaseInfo => database !== undefined)
	for (const database of d1Candidates) {
		candidates.d1.push(database.name)
		if (!apply) {
			continue
		}

		await cloudflareApi.deleteD1Database(accountId, database.id)
		deleted.d1.push(database.name)
	}

	const r2Candidates = plan.r2
		.map((ref) => findR2BucketByName(buckets, ref.previewName))
		.filter((bucket): bucket is R2BucketInfo => bucket !== undefined)
	for (const bucket of r2Candidates) {
		candidates.r2.push(bucket.name)
		if (!apply) {
			continue
		}

		await cloudflareApi.deleteR2Bucket(accountId, bucket.name)
		deleted.r2.push(bucket.name)
	}

	const queueCandidates = plan.queues
		.map((ref) => findQueueByName(queues, ref.previewName))
		.filter((queue): queue is QueueInfo => queue !== undefined)
	for (const queue of queueCandidates) {
		candidates.queues.push(queue.name)
		if (!apply) {
			continue
		}

		if (!queue.id) {
			warnings.push(`Skipping queue deletion for "${queue.name}" because Cloudflare did not return a queue id.`)
			continue
		}

		await cloudflareApi.deleteQueue(accountId, queue.id)
		deleted.queues.push(queue.name)
	}

	const vectorizeCandidates = plan.vectorize
		.map((ref) => findVectorizeIndexByName(vectorizeIndexes, ref.previewName))
		.filter((index): index is VectorizeIndexInfo => index !== undefined)
	for (const index of vectorizeCandidates) {
		candidates.vectorize.push(index.name)
		if (!apply) {
			continue
		}

		await cloudflareApi.deleteVectorizeIndex(accountId, index.name)
		deleted.vectorize.push(index.name)
	}

	const hyperdriveCandidates = plan.hyperdrive
		.map((ref) => findHyperdriveByName(hyperdrives, ref.previewName))
		.filter((hyperdrive): hyperdrive is HyperdriveConfigInfo => hyperdrive !== undefined)
	for (const hyperdrive of hyperdriveCandidates) {
		candidates.hyperdrive.push(hyperdrive.name)
		if (!apply) {
			continue
		}

		await cloudflareApi.deleteHyperdrive(accountId, hyperdrive.id)
		deleted.hyperdrive.push(hyperdrive.name)
	}

	if (plan.hyperdrive.length > 0) {
		warnings.push(
			'Preview-scoped Hyperdrive cleanup only deletes preview configs that already exist. Devflare does not auto-provision preview Hyperdrives because Cloudflare does not expose stored Hyperdrive credentials for cloning.'
		)
	}

	return {
		accountId,
		plan,
		candidates,
		deleted,
		warnings
	}
}
