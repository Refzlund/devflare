import {
	createD1Database,
	createKVNamespace,
	createQueue,
	createR2Bucket,
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
import { materializePreviewScopedConfig, type PreviewResolutionOptions } from './preview'
import { mergeConfigForEnvironment } from './resolve'
import {
	getLocalD1DatabaseIdentifier,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	normalizeD1Binding,
	normalizeHyperdriveBinding,
	normalizeKVBinding,
	type DevflareConfig
} from './schema'
import { ConfigResourceResolutionError } from './resource-resolution'

interface DeployResourcePreparationApi {
	getPrimaryAccount: typeof getPrimaryAccount
	getEffectiveAccountId: typeof getEffectiveAccountId
	listKVNamespaces: typeof listKVNamespaces
	createKVNamespace: typeof createKVNamespace
	listD1Databases: typeof listD1Databases
	createD1Database: typeof createD1Database
	listR2Buckets: typeof listR2Buckets
	createR2Bucket: typeof createR2Bucket
	listQueues: typeof listQueues
	createQueue: typeof createQueue
	listHyperdrives: typeof listHyperdrives
	listVectorizeIndexes: typeof listVectorizeIndexes
}

const defaultDeployResourcePreparationApi: DeployResourcePreparationApi = {
	getPrimaryAccount,
	getEffectiveAccountId,
	listKVNamespaces,
	createKVNamespace,
	listD1Databases,
	createD1Database,
	listR2Buckets,
	createR2Bucket,
	listQueues,
	createQueue,
	listHyperdrives,
	listVectorizeIndexes
}

interface NormalizedNameBinding {
	id?: string
	name?: string
}

interface PendingNameBinding {
	bindingName: string
	resourceName: string
}

export interface DeployResourceNames {
	kv: string[]
	d1: string[]
	r2: string[]
	queues: string[]
	vectorize: string[]
	hyperdrive: string[]
}

export interface PrepareConfigResourcesForDeployOptions {
	environment?: string
	env?: PreviewResolutionOptions['env']
	identifier?: string
	accountId?: string
	cloudflare?: Partial<DeployResourcePreparationApi>
}

export interface PrepareMaterializedConfigResourcesForDeployOptions {
	accountId?: string
	cloudflare?: Partial<DeployResourcePreparationApi>
}

export interface PrepareConfigResourcesForDeployResult {
	config: DevflareConfig
	created: DeployResourceNames
	existing: DeployResourceNames
	warnings: string[]
}

interface ResolvedResourceIdsByNameResult {
	idsByName: Map<string, string>
	created: string[]
	existing: string[]
}

function createEmptyDeployResourceNames(): DeployResourceNames {
	return {
		kv: [],
		d1: [],
		r2: [],
		queues: [],
		vectorize: [],
		hyperdrive: []
	}
}

function resolveDeployResourcePreparationApi(
	overrides: Partial<DeployResourcePreparationApi> | undefined
): DeployResourcePreparationApi {
	return {
		...defaultDeployResourcePreparationApi,
		...(overrides ?? {})
	}
}

function materializeIdBindings<TBinding>(
	bindings: Record<string, TBinding>,
	resolveId: (binding: TBinding) => string
): Record<string, { id: string }> {
	return Object.fromEntries(
		Object.entries(bindings).map(([bindingName, bindingConfig]) => {
			return [bindingName, { id: resolveId(bindingConfig) }]
		})
	)
}

function collectPendingNameBindings<TBinding>(
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

function materializeResolvedNameBindings<TBinding>(
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

function withResolvedIdBindings(
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

function normalizeKVNameBinding(
	bindingConfig: NonNullable<NonNullable<DevflareConfig['bindings']>['kv']>[string]
): NormalizedNameBinding {
	const normalized = normalizeKVBinding(bindingConfig)
	return {
		id: normalized.namespaceId,
		name: normalized.name
	}
}

function normalizeD1NameBinding(
	bindingConfig: NonNullable<NonNullable<DevflareConfig['bindings']>['d1']>[string]
): NormalizedNameBinding {
	const normalized = normalizeD1Binding(bindingConfig)
	return {
		id: normalized.databaseId,
		name: normalized.name
	}
}

function normalizeHyperdriveNameBinding(
	bindingConfig: NonNullable<NonNullable<DevflareConfig['bindings']>['hyperdrive']>[string]
): NormalizedNameBinding {
	const normalized = normalizeHyperdriveBinding(bindingConfig)
	return {
		id: normalized.configurationId,
		name: normalized.name
	}
}

function resolveUniqueNames(values: Iterable<string | undefined>): string[] {
	const names = new Set<string>()

	for (const value of values) {
		const trimmed = value?.trim()
		if (!trimmed) {
			continue
		}

		names.add(trimmed)
	}

	return [...names]
}

function collectQueueNames(config: DevflareConfig): string[] {
	const queues = config.bindings?.queues
	if (!queues) {
		return []
	}

	return resolveUniqueNames([
		...Object.values(queues.producers ?? {}),
		...(queues.consumers ?? []).flatMap((consumer) => [consumer.queue, consumer.deadLetterQueue])
	])
}

function collectVectorizeIndexNames(config: DevflareConfig): string[] {
	return resolveUniqueNames(
		Object.values(config.bindings?.vectorize ?? {}).map((binding) => binding.indexName)
	)
}

function formatMissingBindings(missing: PendingNameBinding[]): string {
	return missing
		.map(({ bindingName, resourceName }) => `${bindingName} → ${resourceName}`)
		.join(', ')
}

function resolveUniquePendingBindings(pendingBindings: PendingNameBinding[]): PendingNameBinding[] {
	return [...new Map(
		pendingBindings.map((binding) => [binding.resourceName, binding])
	).values()]
}

async function resolveLookupAccountId(
	config: DevflareConfig,
	options: PrepareMaterializedConfigResourcesForDeployOptions,
	cloudflareApi: DeployResourcePreparationApi
): Promise<string> {
	const explicitAccountId = options.accountId ?? config.accountId
	if (explicitAccountId) {
		return explicitAccountId
	}

	let primaryAccount
	try {
		primaryAccount = await cloudflareApi.getPrimaryAccount()
	} catch (error) {
		throw new ConfigResourceResolutionError(
			'Could not prepare Cloudflare-backed deploy resources because Devflare could not read your Cloudflare accounts. Set accountId in devflare.config.ts, configure a workspace/global default account, or log in with Wrangler.',
			error
		)
	}

	if (!primaryAccount) {
		throw new ConfigResourceResolutionError(
			'Could not prepare Cloudflare-backed deploy resources because no Cloudflare account is available. Set accountId in devflare.config.ts, configure a workspace/global default account, or log in with Wrangler.'
		)
	}

	try {
		const { accountId } = await cloudflareApi.getEffectiveAccountId(primaryAccount.id)
		return accountId
	} catch (error) {
		throw new ConfigResourceResolutionError(
			`Could not determine the effective Cloudflare account for deploy-time resource preparation after selecting primary account ${primaryAccount.id}.`,
			error
		)
	}
}

async function resolveOrCreateResourceIdsByName<TResource extends { id: string; name: string }>(
	pendingBindings: PendingNameBinding[],
	options: {
		listResources: () => Promise<TResource[]>
		createResource?: (resourceName: string) => Promise<TResource>
		listFailureMessage: string
		missingFailureMessage: (missing: PendingNameBinding[]) => string
		createFailureMessage?: (resourceName: string) => string
	}
): Promise<ResolvedResourceIdsByNameResult> {
	if (pendingBindings.length === 0) {
		return {
			idsByName: new Map(),
			created: [],
			existing: []
		}
	}

	let resources: TResource[]
	try {
		resources = await options.listResources()
	} catch (error) {
		throw new ConfigResourceResolutionError(options.listFailureMessage, error)
	}

	const idsByName = new Map(
		resources.map((resource) => [resource.name, resource.id])
	)
	const created: string[] = []
	const existing = resolveUniquePendingBindings(pendingBindings)
		.filter(({ resourceName }) => idsByName.has(resourceName))
		.map(({ resourceName }) => resourceName)
	const missingBindings = resolveUniquePendingBindings(pendingBindings)
		.filter(({ resourceName }) => !idsByName.has(resourceName))

	if (missingBindings.length === 0) {
		return {
			idsByName,
			created,
			existing
		}
	}

	if (!options.createResource) {
		throw new ConfigResourceResolutionError(options.missingFailureMessage(missingBindings))
	}

	for (const missingBinding of missingBindings) {
		try {
			const createdResource = await options.createResource(missingBinding.resourceName)
			idsByName.set(createdResource.name, createdResource.id)
			created.push(createdResource.name)
		} catch (error) {
			throw new ConfigResourceResolutionError(
				options.createFailureMessage?.(missingBinding.resourceName)
				?? `Could not create Cloudflare resource "${missingBinding.resourceName}" during deploy preparation.`,
				error
			)
		}
	}

	return {
		idsByName,
		created,
		existing
	}
}

async function ensureNamedResourcesExist<TResource extends { name: string }>(
	resourceNames: string[],
	options: {
		listResources: () => Promise<TResource[]>
		createResource?: (resourceName: string) => Promise<TResource>
		listFailureMessage: string
		missingFailureMessage: (missingNames: string[]) => string
		createFailureMessage?: (resourceName: string) => string
	}
): Promise<{
	created: string[]
	existing: string[]
}> {
	if (resourceNames.length === 0) {
		return {
			created: [],
			existing: []
		}
	}

	let resources: TResource[]
	try {
		resources = await options.listResources()
	} catch (error) {
		throw new ConfigResourceResolutionError(options.listFailureMessage, error)
	}

	const existingNames = new Set(resources.map((resource) => resource.name))
	const existing = resourceNames.filter((resourceName) => existingNames.has(resourceName))
	const missingNames = resourceNames.filter((resourceName) => !existingNames.has(resourceName))
	const created: string[] = []

	if (missingNames.length === 0) {
		return {
			created,
			existing
		}
	}

	if (!options.createResource) {
		throw new ConfigResourceResolutionError(options.missingFailureMessage(missingNames))
	}

	for (const resourceName of missingNames) {
		try {
			const createdResource = await options.createResource(resourceName)
			created.push(createdResource.name)
		} catch (error) {
			throw new ConfigResourceResolutionError(
				options.createFailureMessage?.(resourceName)
				?? `Could not create Cloudflare resource "${resourceName}" during deploy preparation.`,
				error
			)
		}
	}

	return {
		created,
		existing
	}
}

export async function prepareMaterializedConfigResourcesForDeploy(
	resolvedConfig: DevflareConfig,
	options: PrepareMaterializedConfigResourcesForDeployOptions = {}
): Promise<PrepareConfigResourcesForDeployResult> {
	const created = createEmptyDeployResourceNames()
	const existing = createEmptyDeployResourceNames()
	const warnings: string[] = []
	const kvBindings = resolvedConfig.bindings?.kv
	const d1Bindings = resolvedConfig.bindings?.d1
	const hyperdriveBindings = resolvedConfig.bindings?.hyperdrive
	const r2Names = resolveUniqueNames(Object.values(resolvedConfig.bindings?.r2 ?? {}))
	const queueNames = collectQueueNames(resolvedConfig)
	const vectorizeNames = collectVectorizeIndexNames(resolvedConfig)

	if (!kvBindings && !d1Bindings && !hyperdriveBindings && r2Names.length === 0 && queueNames.length === 0 && vectorizeNames.length === 0) {
		return {
			config: resolvedConfig,
			created,
			existing,
			warnings
		}
	}

	const pendingKVNameBindings = collectPendingNameBindings(kvBindings, normalizeKVNameBinding)
	const pendingD1NameBindings = collectPendingNameBindings(d1Bindings, normalizeD1NameBinding)
	const pendingHyperdriveNameBindings = collectPendingNameBindings(hyperdriveBindings, normalizeHyperdriveNameBinding)

	if (
		pendingKVNameBindings.length === 0
		&& pendingD1NameBindings.length === 0
		&& pendingHyperdriveNameBindings.length === 0
		&& r2Names.length === 0
		&& queueNames.length === 0
		&& vectorizeNames.length === 0
	) {
		return {
			config: withResolvedIdBindings(resolvedConfig, {
				kv: kvBindings ? materializeIdBindings(kvBindings, getLocalKVNamespaceIdentifier) : undefined,
				d1: d1Bindings ? materializeIdBindings(d1Bindings, getLocalD1DatabaseIdentifier) : undefined,
				hyperdrive: hyperdriveBindings ? materializeIdBindings(hyperdriveBindings, getLocalHyperdriveConfigIdentifier) : undefined
			}),
			created,
			existing,
			warnings
		}
	}

	const cloudflareApi = resolveDeployResourcePreparationApi(options.cloudflare)
	const accountId = await resolveLookupAccountId(resolvedConfig, options, cloudflareApi)

	const namespaceIdsByName = await resolveOrCreateResourceIdsByName(pendingKVNameBindings, {
		listResources: async () => cloudflareApi.listKVNamespaces(accountId),
		createResource: async (resourceName) => cloudflareApi.createKVNamespace(accountId, resourceName),
		listFailureMessage: `Could not list KV namespaces for Cloudflare account ${accountId} while preparing deploy resources.`,
		missingFailureMessage: (missingBindings) => {
			return `Could not find KV namespace(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}.`
		},
		createFailureMessage: (resourceName) => {
			return `Could not create KV namespace "${resourceName}" in Cloudflare account ${accountId} during deploy preparation.`
		}
	})
	created.kv.push(...namespaceIdsByName.created)
	existing.kv.push(...namespaceIdsByName.existing)

	const databaseIdsByName = await resolveOrCreateResourceIdsByName(pendingD1NameBindings, {
		listResources: async () => cloudflareApi.listD1Databases(accountId),
		createResource: async (resourceName) => cloudflareApi.createD1Database(accountId, resourceName),
		listFailureMessage: `Could not list D1 databases for Cloudflare account ${accountId} while preparing deploy resources.`,
		missingFailureMessage: (missingBindings) => {
			return `Could not find D1 database(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}.`
		},
		createFailureMessage: (resourceName) => {
			return `Could not create D1 database "${resourceName}" in Cloudflare account ${accountId} during deploy preparation.`
		}
	})
	created.d1.push(...databaseIdsByName.created)
	existing.d1.push(...databaseIdsByName.existing)

	const hyperdriveIdsByName = await resolveOrCreateResourceIdsByName(pendingHyperdriveNameBindings, {
		listResources: async () => cloudflareApi.listHyperdrives(accountId),
		listFailureMessage: `Could not list Hyperdrive configurations for Cloudflare account ${accountId} while preparing deploy resources.`,
		missingFailureMessage: (missingBindings) => {
			return `Could not find Hyperdrive configuration(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}. Cloudflare does not expose a create API that Devflare can use from only a binding name, so create the Hyperdrive config first or configure the binding with an explicit id.`
		}
	})
	created.hyperdrive.push(...hyperdriveIdsByName.created)
	existing.hyperdrive.push(...hyperdriveIdsByName.existing)

	const r2State = await ensureNamedResourcesExist<R2BucketInfo>(r2Names, {
		listResources: async () => cloudflareApi.listR2Buckets(accountId),
		createResource: async (resourceName) => cloudflareApi.createR2Bucket(accountId, resourceName),
		listFailureMessage: `Could not list R2 buckets for Cloudflare account ${accountId} while preparing deploy resources.`,
		missingFailureMessage: (missingNames) => {
			return `Could not find R2 bucket(s) ${missingNames.join(', ')} in Cloudflare account ${accountId}.`
		},
		createFailureMessage: (resourceName) => {
			return `Could not create R2 bucket "${resourceName}" in Cloudflare account ${accountId} during deploy preparation.`
		}
	})
	created.r2.push(...r2State.created)
	existing.r2.push(...r2State.existing)

	const queueState = await ensureNamedResourcesExist<QueueInfo>(queueNames, {
		listResources: async () => cloudflareApi.listQueues(accountId),
		createResource: async (resourceName) => cloudflareApi.createQueue(accountId, resourceName),
		listFailureMessage: `Could not list Queues for Cloudflare account ${accountId} while preparing deploy resources.`,
		missingFailureMessage: (missingNames) => {
			return `Could not find Queue(s) ${missingNames.join(', ')} in Cloudflare account ${accountId}.`
		},
		createFailureMessage: (resourceName) => {
			return `Could not create Queue "${resourceName}" in Cloudflare account ${accountId} during deploy preparation.`
		}
	})
	created.queues.push(...queueState.created)
	existing.queues.push(...queueState.existing)

	const vectorizeState = await ensureNamedResourcesExist<VectorizeIndexInfo>(vectorizeNames, {
		listResources: async () => cloudflareApi.listVectorizeIndexes(accountId),
		listFailureMessage: `Could not list Vectorize indexes for Cloudflare account ${accountId} while preparing deploy resources.`,
		missingFailureMessage: (missingNames) => {
			return `Could not find Vectorize index(es) ${missingNames.join(', ')} in Cloudflare account ${accountId}. Devflare can only auto-provision preview-scoped Vectorize indexes by cloning an existing base index; for normal deploys create the index first.`
		}
	})
	created.vectorize.push(...vectorizeState.created)
	existing.vectorize.push(...vectorizeState.existing)

	const config = withResolvedIdBindings(resolvedConfig, {
		kv: kvBindings
			? pendingKVNameBindings.length > 0
				? materializeResolvedNameBindings(kvBindings, normalizeKVNameBinding, namespaceIdsByName.idsByName)
				: materializeIdBindings(kvBindings, getLocalKVNamespaceIdentifier)
			: undefined,
		d1: d1Bindings
			? pendingD1NameBindings.length > 0
				? materializeResolvedNameBindings(d1Bindings, normalizeD1NameBinding, databaseIdsByName.idsByName)
				: materializeIdBindings(d1Bindings, getLocalD1DatabaseIdentifier)
			: undefined,
		hyperdrive: hyperdriveBindings
			? pendingHyperdriveNameBindings.length > 0
				? materializeResolvedNameBindings(hyperdriveBindings, normalizeHyperdriveNameBinding, hyperdriveIdsByName.idsByName)
				: materializeIdBindings(hyperdriveBindings, getLocalHyperdriveConfigIdentifier)
			: undefined
	})

	return {
		config,
		created,
		existing,
		warnings
	}
}

export async function prepareConfigResourcesForDeploy(
	config: DevflareConfig,
	options: PrepareConfigResourcesForDeployOptions = {}
): Promise<PrepareConfigResourcesForDeployResult> {
	const resolvedConfig = materializePreviewScopedConfig(
		mergeConfigForEnvironment(config, options.environment),
		{
			environment: options.environment,
			env: options.env,
			identifier: options.identifier
		}
	)

	return prepareMaterializedConfigResourcesForDeploy(resolvedConfig, {
		accountId: options.accountId,
		cloudflare: options.cloudflare
	})
}
