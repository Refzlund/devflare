import {
	type D1DatabaseInfo,
	type HyperdriveConfigInfo,
	type KVNamespaceInfo,
	type QueueInfo,
	type R2BucketInfo,
	type VectorizeIndexInfo,
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
	listVectorizeIndexes
} from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'
import {
	type PendingNameBinding,
	collectPendingNameBindings,
	formatMissingBindings,
	materializeHyperdriveIdBindings,
	materializeIdBindings,
	materializeResolvedNameBindings,
	normalizeD1NameBinding,
	normalizeHyperdriveNameBinding,
	normalizeKVNameBinding,
	withResolvedIdBindings
} from './binding-resolution-helpers'
import type { PreviewResolutionOptions } from './preview'
import { type DeployConfig, brandAsDeployConfig, resolveResources } from './resolve-phased'
import { ConfigResourceResolutionError } from './resource-resolution'
import {
	type DevflareConfig,
	getLocalD1DatabaseIdentifier,
	getLocalKVNamespaceIdentifier
} from './schema'

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
	/** C6 — see `PrepareMaterializedConfigResourcesForDeployOptions.describeOnly`. */
	describeOnly?: boolean
}

export interface PrepareMaterializedConfigResourcesForDeployOptions {
	accountId?: string
	cloudflare?: Partial<DeployResourcePreparationApi>
	/**
	 * C6 — describe-only mode. When true, no `create*` Cloudflare APIs are
	 * called. Resources missing in the account are reported via the returned
	 * `created` field (their IDs are placeholder strings prefixed with
	 * `<would-create:>`), so dry-run can render the same plan that a real
	 * deploy would execute without performing any side effects.
	 */
	describeOnly?: boolean
}

export interface PrepareConfigResourcesForDeployResult {
	config: DeployConfig
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

/**
 * C13 — surface partial-progress orphans on a failed deploy preparation.
 *
 * If any resource was already created before the throw, attach a clear
 * footer to the error message listing what was created so the user can
 * decide whether to keep, delete, or rerun. Auto-deletion is intentionally
 * not performed: deletion is irreversible, has cross-binding side effects
 * (DBs may have data, queues may be inflight), and the deploy may simply
 * be retried after fixing the underlying error.
 */
function decorateOrphanError(err: unknown, created: DeployResourceNames): Error {
	const summaryParts: string[] = []
	if (created.kv.length > 0) summaryParts.push(`KV: ${created.kv.join(', ')}`)
	if (created.d1.length > 0) summaryParts.push(`D1: ${created.d1.join(', ')}`)
	if (created.hyperdrive.length > 0)
		summaryParts.push(`Hyperdrive: ${created.hyperdrive.join(', ')}`)
	if (created.r2.length > 0) summaryParts.push(`R2: ${created.r2.join(', ')}`)
	if (created.queues.length > 0) summaryParts.push(`Queues: ${created.queues.join(', ')}`)
	if (created.vectorize.length > 0) summaryParts.push(`Vectorize: ${created.vectorize.join(', ')}`)

	const base = err instanceof Error ? err : new Error(String(err))
	if (summaryParts.length === 0) return base

	const orphanFooter =
		`\n\nDeploy preparation failed AFTER provisioning the following Cloudflare resources, ` +
		`which were left in your account:\n  - ${summaryParts.join('\n  - ')}\n` +
		`Re-run \`devflare deploy\` after fixing the error to reuse them, or delete them manually if abandoning the deploy.`

	const decorated = new Error(`${base.message}${orphanFooter}`)
	if ('cause' in base && base.cause !== undefined) {
		;(decorated as Error & { cause: unknown }).cause = base.cause
	} else {
		;(decorated as Error & { cause: unknown }).cause = base
	}
	return decorated
}

function resolveDeployResourcePreparationApi(
	overrides: Partial<DeployResourcePreparationApi> | undefined
): DeployResourcePreparationApi {
	return {
		...defaultDeployResourcePreparationApi,
		...(overrides ?? {})
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

function resolveUniquePendingBindings(pendingBindings: PendingNameBinding[]): PendingNameBinding[] {
	return [...new Map(pendingBindings.map((binding) => [binding.resourceName, binding])).values()]
}

async function resolveLookupAccountId(
	config: DevflareConfig,
	options: PrepareMaterializedConfigResourcesForDeployOptions,
	cloudflareApi: DeployResourcePreparationApi
): Promise<string> {
	// Priority order matches command-utils.resolveCloudflareAccountId so the
	// account that provisions resources is always the same one the worker is
	// deployed against. Without the env-var fallback here, a CI job could
	// auto-create KV/D1 namespaces in the personal "primary" account while
	// `wrangler deploy` simultaneously targets the env-var account — leaving
	// orphaned resources cross-account with no warning.
	const envAccountId =
		typeof process !== 'undefined' ? process.env?.CLOUDFLARE_ACCOUNT_ID?.trim() : undefined
	const explicitAccountId = options.accountId ?? config.accountId ?? (envAccountId || undefined)
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

	const idsByName = new Map(resources.map((resource) => [resource.name, resource.id]))
	const created: string[] = []
	const existing = resolveUniquePendingBindings(pendingBindings)
		.filter(({ resourceName }) => idsByName.has(resourceName))
		.map(({ resourceName }) => resourceName)
	const missingBindings = resolveUniquePendingBindings(pendingBindings).filter(
		({ resourceName }) => !idsByName.has(resourceName)
	)

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
				options.createFailureMessage?.(missingBinding.resourceName) ??
					`Could not create Cloudflare resource "${missingBinding.resourceName}" during deploy preparation.`,
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
				options.createFailureMessage?.(resourceName) ??
					`Could not create Cloudflare resource "${resourceName}" during deploy preparation.`,
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

	if (
		!kvBindings &&
		!d1Bindings &&
		!hyperdriveBindings &&
		r2Names.length === 0 &&
		queueNames.length === 0 &&
		vectorizeNames.length === 0
	) {
		return {
			config: brandAsDeployConfig(resolvedConfig),
			created,
			existing,
			warnings
		}
	}

	const pendingKVNameBindings = collectPendingNameBindings(kvBindings, normalizeKVNameBinding)
	const pendingD1NameBindings = collectPendingNameBindings(d1Bindings, normalizeD1NameBinding)
	const pendingHyperdriveNameBindings = collectPendingNameBindings(
		hyperdriveBindings,
		normalizeHyperdriveNameBinding
	)

	if (
		pendingKVNameBindings.length === 0 &&
		pendingD1NameBindings.length === 0 &&
		pendingHyperdriveNameBindings.length === 0 &&
		r2Names.length === 0 &&
		queueNames.length === 0 &&
		vectorizeNames.length === 0
	) {
		return {
			config: brandAsDeployConfig(
				withResolvedIdBindings(resolvedConfig, {
					kv: kvBindings
						? materializeIdBindings(kvBindings, getLocalKVNamespaceIdentifier)
						: undefined,
					d1: d1Bindings
						? materializeIdBindings(d1Bindings, getLocalD1DatabaseIdentifier)
						: undefined,
					hyperdrive: materializeHyperdriveIdBindings(hyperdriveBindings)
				})
			),
			created,
			existing,
			warnings
		}
	}

	const cloudflareApi = resolveDeployResourcePreparationApi(options.cloudflare)
	const accountId = await resolveLookupAccountId(resolvedConfig, options, cloudflareApi)

	// C6 — describe-only mode for dry-run: stub the create-* APIs so they
	// return `<would-create:NAME>` placeholders rather than calling the live
	// Cloudflare API. Resolution of existing resources still happens for
	// real, so the dry-run output reflects the actual mix of "would create"
	// vs "would reuse" the live deploy would perform.
	if (options.describeOnly) {
		cloudflareApi.createKVNamespace = (async (_acc: string, name: string) => ({
			id: `<would-create:${name}>`,
			name
		})) as DeployResourcePreparationApi['createKVNamespace']
		cloudflareApi.createD1Database = (async (_acc: string, name: string) => ({
			id: `<would-create:${name}>`,
			name,
			version: '',
			tableCount: 0,
			sizeBytes: 0
		})) as DeployResourcePreparationApi['createD1Database']
		cloudflareApi.createR2Bucket = (async (_acc: string, name: string) => ({
			name
		})) as DeployResourcePreparationApi['createR2Bucket']
		cloudflareApi.createQueue = (async (_acc: string, name: string) => ({
			id: `<would-create:${name}>`,
			name
		})) as DeployResourcePreparationApi['createQueue']
	}

	// C13 — sequential provisioning leaves silent orphans. We do not
	// auto-delete created resources on a later failure (Cloudflare resource
	// deletion is asynchronous, partial, and risky against resources a user
	// might already be reading). Instead we make the orphans LOUD: any
	// throw between KV/D1/Hyperdrive/R2/Queues/Vectorize is re-thrown
	// decorated with the exact set of resources already created during this
	// deploy, so the user can clean them up manually if the deploy is
	// abandoned.
	try {
		// C3 — resolve-only resources (Hyperdrive, Vectorize) FIRST so that a
		// "create the index first" failure happens BEFORE we provision any
		// KV/D1/R2/Queue resources. Otherwise a missing Hyperdrive config would
		// only be detected after side effects (orphans).
		const hyperdriveIdsByName = await resolveOrCreateResourceIdsByName(
			pendingHyperdriveNameBindings,
			{
				listResources: async () => cloudflareApi.listHyperdrives(accountId),
				listFailureMessage: `Could not list Hyperdrive configurations for Cloudflare account ${accountId} while preparing deploy resources.`,
				missingFailureMessage: (missingBindings) => {
					return `Could not find Hyperdrive configuration(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}. Cloudflare does not expose a create API that Devflare can use from only a binding name, so create the Hyperdrive config first or configure the binding with an explicit id.`
				}
			}
		)
		created.hyperdrive.push(...hyperdriveIdsByName.created)
		existing.hyperdrive.push(...hyperdriveIdsByName.existing)

		const vectorizeState = await ensureNamedResourcesExist<VectorizeIndexInfo>(vectorizeNames, {
			listResources: async () => cloudflareApi.listVectorizeIndexes(accountId),
			listFailureMessage: `Could not list Vectorize indexes for Cloudflare account ${accountId} while preparing deploy resources.`,
			missingFailureMessage: (missingNames) => {
				return `Could not find Vectorize index(es) ${missingNames.join(', ')} in Cloudflare account ${accountId}. Devflare can only auto-provision preview-scoped Vectorize indexes by cloning an existing base index; for normal deploys create the index first.`
			}
		})
		created.vectorize.push(...vectorizeState.created)
		existing.vectorize.push(...vectorizeState.existing)

		const namespaceIdsByName = await resolveOrCreateResourceIdsByName(pendingKVNameBindings, {
			listResources: async () => cloudflareApi.listKVNamespaces(accountId),
			createResource: async (resourceName) =>
				cloudflareApi.createKVNamespace(accountId, resourceName),
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
			createResource: async (resourceName) =>
				cloudflareApi.createD1Database(accountId, resourceName),
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

		const config = withResolvedIdBindings(resolvedConfig, {
			kv: kvBindings
				? pendingKVNameBindings.length > 0
					? materializeResolvedNameBindings(
							kvBindings,
							normalizeKVNameBinding,
							namespaceIdsByName.idsByName
						)
					: materializeIdBindings(kvBindings, getLocalKVNamespaceIdentifier)
				: undefined,
			d1: d1Bindings
				? pendingD1NameBindings.length > 0
					? materializeResolvedNameBindings(
							d1Bindings,
							normalizeD1NameBinding,
							databaseIdsByName.idsByName
						)
					: materializeIdBindings(d1Bindings, getLocalD1DatabaseIdentifier)
				: undefined,
			hyperdrive: hyperdriveBindings
				? pendingHyperdriveNameBindings.length > 0
					? materializeHyperdriveIdBindings(hyperdriveBindings, hyperdriveIdsByName.idsByName)
					: materializeHyperdriveIdBindings(hyperdriveBindings)
				: undefined
		})

		return {
			config: brandAsDeployConfig(config),
			created,
			existing,
			warnings
		}
	} catch (err) {
		throw decorateOrphanError(err, created)
	}
}

export async function prepareConfigResourcesForDeploy(
	config: DevflareConfig,
	options: PrepareConfigResourcesForDeployOptions = {}
): Promise<PrepareConfigResourcesForDeployResult> {
	// C2 step 3 — env-merge + preview-materialization is the build-phase work
	// of the unified resolveResources seam. We then hand the prepared config to
	// the materialised-deploy helper so we still get the richer
	// `{ created, existing, warnings }` result that the seam itself does not
	// expose for the provisioning case.
	const resolvedConfig = await resolveResources(config, {
		phase: 'build',
		environment: options.environment,
		preview: {
			environment: options.environment,
			env: options.env,
			identifier: options.identifier
		}
	})

	return prepareMaterializedConfigResourcesForDeploy(resolvedConfig, {
		accountId: options.accountId,
		cloudflare: options.cloudflare,
		describeOnly: options.describeOnly
	})
}
