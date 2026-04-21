import { getPrimaryAccount, listD1Databases, listHyperdrives, listKVNamespaces } from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'
import {
	collectPendingNameBindings,
	formatMissingBindings,
	materializeIdBindings,
	materializeResolvedNameBindings,
	normalizeD1NameBinding,
	normalizeHyperdriveNameBinding,
	normalizeKVNameBinding,
	withResolvedIdBindings,
	type PendingNameBinding
} from './binding-resolution-helpers'
import { loadConfig, type LoadConfigOptions } from './loader'
import { type PreviewResolutionOptions } from './preview'
import { brandAsDeployConfig, brandAsLocalConfig, resolveResources, type DeployConfig, type LocalConfig } from './resolve-phased'
import { resolveConfigForEnvironment } from './resolve'
import {
	getLocalD1DatabaseIdentifier,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	type DevflareConfig
} from './schema'

interface CloudflareConfigResolutionApi {
	getPrimaryAccount: typeof getPrimaryAccount
	getEffectiveAccountId: typeof getEffectiveAccountId
	listKVNamespaces: typeof listKVNamespaces
	listD1Databases: typeof listD1Databases
	listHyperdrives: typeof listHyperdrives
}

const defaultCloudflareApi: CloudflareConfigResolutionApi = {
	getPrimaryAccount,
	getEffectiveAccountId,
	listKVNamespaces,
	listD1Databases,
	listHyperdrives
}

export interface ResolveConfigResourcesOptions {
	environment?: string
	env?: PreviewResolutionOptions['env']
	identifier?: string
	accountId?: string
	cloudflare?: Partial<CloudflareConfigResolutionApi>
}

export interface ResolveMaterializedConfigResourcesOptions {
	accountId?: string
	cloudflare?: Partial<CloudflareConfigResolutionApi>
}

export interface LoadResolvedConfigOptions extends LoadConfigOptions {
	env?: PreviewResolutionOptions['env']
	identifier?: string
	accountId?: string
	cloudflare?: Partial<CloudflareConfigResolutionApi>
}

export class ConfigResourceResolutionError extends Error {
	readonly code = 'CONFIG_RESOURCE_RESOLUTION_ERROR'

	constructor(message: string, cause?: unknown) {
		super(message)
		this.name = 'ConfigResourceResolutionError'
		if (cause !== undefined) {
			; (this as Error & { cause?: unknown }).cause = cause
		}
	}
}

function resolveCloudflareApi(
	overrides: Partial<CloudflareConfigResolutionApi> | undefined
): CloudflareConfigResolutionApi {
	return {
		...defaultCloudflareApi,
		...(overrides ?? {})
	}
}

async function resolveLookupAccountId(
	config: DevflareConfig,
	options: ResolveConfigResourcesOptions,
	cloudflareApi: CloudflareConfigResolutionApi
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
			'Could not resolve Cloudflare-backed resource names because Devflare could not read your Cloudflare accounts. Set accountId in devflare.config.ts, configure a workspace/global default account, or log in with Wrangler.',
			error
		)
	}

	if (!primaryAccount) {
		throw new ConfigResourceResolutionError(
			'Could not resolve Cloudflare-backed resource names because no Cloudflare account is available. Set accountId in devflare.config.ts, configure a workspace/global default account, or log in with Wrangler.'
		)
	}

	try {
		const { accountId } = await cloudflareApi.getEffectiveAccountId(primaryAccount.id)
		return accountId
	} catch (error) {
		throw new ConfigResourceResolutionError(
			`Could not determine the effective Cloudflare account for name-based resource resolution after selecting primary account ${primaryAccount.id}.`,
			error
		)
	}
}

async function resolveResourceIdsByName<TResource extends { id: string; name: string }>(
	pendingBindings: PendingNameBinding[],
	options: {
		listResources: () => Promise<TResource[]>
		listFailureMessage: string
		missingFailureMessage: (missing: PendingNameBinding[]) => string
	}
): Promise<Map<string, string>> {
	if (pendingBindings.length === 0) {
		return new Map()
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

	const missingBindings = pendingBindings.filter(({ resourceName }) => {
		return !idsByName.has(resourceName)
	})

	if (missingBindings.length > 0) {
		throw new ConfigResourceResolutionError(options.missingFailureMessage(missingBindings))
	}

	return idsByName
}

/**
	* Resolve environment overrides and normalize KV/D1/Hyperdrive bindings for purely local runtimes.
 *
 * Local Miniflare/workerd flows can use either an explicit resource ID or the
 * stable resource name as the backing identifier, so this path avoids requiring
 * Cloudflare auth for local development and tests.
 */
export function resolveConfigForLocalRuntime(
	config: DevflareConfig,
	environment?: string
): LocalConfig {
	const resolvedConfig = resolveConfigForEnvironment(config, environment)
	const kvBindings = resolvedConfig.bindings?.kv
	const d1Bindings = resolvedConfig.bindings?.d1
	const hyperdriveBindings = resolvedConfig.bindings?.hyperdrive

	if (!kvBindings && !d1Bindings && !hyperdriveBindings) {
		return brandAsLocalConfig(resolvedConfig)
	}
	const pendingKVNameBindings = collectPendingNameBindings(kvBindings, normalizeKVNameBinding)
	return brandAsLocalConfig(withResolvedIdBindings(resolvedConfig, {
		kv: kvBindings ? materializeIdBindings(kvBindings, getLocalKVNamespaceIdentifier) : undefined,
		d1: d1Bindings ? materializeIdBindings(d1Bindings, getLocalD1DatabaseIdentifier) : undefined,
		hyperdrive: hyperdriveBindings ? materializeIdBindings(hyperdriveBindings, getLocalHyperdriveConfigIdentifier) : undefined
	}))
}

/**
 * Resolve Cloudflare-backed resource references such as KV/D1/Hyperdrive
 * name bindings into concrete IDs.
 *
 * Used by the deploy path and by automation/programmatic consumers that need
 * fully-resolved bindings against a live Cloudflare account. The build path
 * intentionally does NOT call this — `compileBuildConfig({ preserveNamedBindings: true })`
 * keeps name-only bindings symbolic in the build artifact so builds remain
 * reproducible offline. Pick this helper only when ID resolution is desired.
 */
export async function resolveMaterializedConfigResources(
	resolvedConfig: DevflareConfig,
	options: ResolveMaterializedConfigResourcesOptions = {}
): Promise<DeployConfig> {
	const kvBindings = resolvedConfig.bindings?.kv
	const d1Bindings = resolvedConfig.bindings?.d1
	const hyperdriveBindings = resolvedConfig.bindings?.hyperdrive

	if (!kvBindings && !d1Bindings && !hyperdriveBindings) {
		return brandAsDeployConfig(resolvedConfig)
	}

	const pendingKVNameBindings = collectPendingNameBindings(kvBindings, normalizeKVNameBinding)
	const pendingD1NameBindings = collectPendingNameBindings(d1Bindings, normalizeD1NameBinding)
	const pendingHyperdriveNameBindings = collectPendingNameBindings(hyperdriveBindings, normalizeHyperdriveNameBinding)

	if (
		pendingKVNameBindings.length === 0
		&& pendingD1NameBindings.length === 0
		&& pendingHyperdriveNameBindings.length === 0
	) {
		return brandAsDeployConfig(withResolvedIdBindings(resolvedConfig, {
			kv: kvBindings ? materializeIdBindings(kvBindings, getLocalKVNamespaceIdentifier) : undefined,
			d1: d1Bindings ? materializeIdBindings(d1Bindings, getLocalD1DatabaseIdentifier) : undefined,
			hyperdrive: hyperdriveBindings ? materializeIdBindings(hyperdriveBindings, getLocalHyperdriveConfigIdentifier) : undefined
		}))
	}

	const cloudflareApi = resolveCloudflareApi(options.cloudflare)
	const accountId = await resolveLookupAccountId(resolvedConfig, options, cloudflareApi)

	const namespaceIdsByName = await resolveResourceIdsByName(pendingKVNameBindings, {
		listResources: async () => cloudflareApi.listKVNamespaces(accountId),
		listFailureMessage: `Could not list KV namespaces for Cloudflare account ${accountId} while resolving name-based KV bindings.`,
		missingFailureMessage: (missingBindings) => {
			return `Could not find KV namespace(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}.`
		}
	})

	const databaseIdsByName = await resolveResourceIdsByName(pendingD1NameBindings, {
		listResources: async () => cloudflareApi.listD1Databases(accountId),
		listFailureMessage: `Could not list D1 databases for Cloudflare account ${accountId} while resolving name-based D1 bindings.`,
		missingFailureMessage: (missingBindings) => {
			return `Could not find D1 database(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}.`
		}
	})

	const hyperdriveIdsByName = await resolveResourceIdsByName(pendingHyperdriveNameBindings, {
		listResources: async () => cloudflareApi.listHyperdrives(accountId),
		listFailureMessage: `Could not list Hyperdrive configurations for Cloudflare account ${accountId} while resolving name-based Hyperdrive bindings.`,
		missingFailureMessage: (missingBindings) => {
			return `Could not find Hyperdrive configuration(s) for ${formatMissingBindings(missingBindings)} in Cloudflare account ${accountId}.`
		}
	})

	return brandAsDeployConfig(withResolvedIdBindings(resolvedConfig, {
		kv: materializeResolvedNameBindings(kvBindings, normalizeKVNameBinding, namespaceIdsByName),
		d1: materializeResolvedNameBindings(d1Bindings, normalizeD1NameBinding, databaseIdsByName),
		hyperdrive: materializeResolvedNameBindings(hyperdriveBindings, normalizeHyperdriveNameBinding, hyperdriveIdsByName)
	}))
}

/**
	* Resolve Cloudflare-backed resource references such as KV/D1/Hyperdrive name bindings into
 * concrete IDs for build, deploy, and automation workflows.
 */
export async function resolveConfigResources(
	config: DevflareConfig,
	options: ResolveConfigResourcesOptions = {}
): Promise<DeployConfig> {
	return resolveResources(config, {
		phase: 'deploy',
		environment: options.environment,
		preview: {
			environment: options.environment,
			env: options.env,
			identifier: options.identifier
		},
		accountId: options.accountId,
		cloudflare: options.cloudflare
	})
}

/**
 * Load devflare.config.* and resolve any Cloudflare-backed resource references.
 *
 * This is the public Node-side API for external automation that needs the same
 * resolved values Devflare build/deploy flows use.
 */
export async function loadResolvedConfig(
	options: LoadResolvedConfigOptions = {}
): Promise<DeployConfig> {
	const config = await loadConfig(options)
	return resolveConfigResources(config, options)
}
