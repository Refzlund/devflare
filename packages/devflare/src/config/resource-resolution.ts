import { getPrimaryAccount, listD1Databases, listHyperdrives, listKVNamespaces } from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'
import { loadConfig, type LoadConfigOptions } from './loader'
import { resolveConfigForEnvironment } from './resolve'
import {
	getLocalD1DatabaseIdentifier,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	normalizeD1Binding,
	normalizeHyperdriveBinding,
	normalizeKVBinding,
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
	accountId?: string
	cloudflare?: Partial<CloudflareConfigResolutionApi>
}

export interface LoadResolvedConfigOptions extends LoadConfigOptions {
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

function materializeLocalKVBindings(
	bindings: NonNullable<NonNullable<DevflareConfig['bindings']>['kv']>
): Record<string, { id: string }> {
	return Object.fromEntries(
		Object.entries(bindings).map(([bindingName, bindingConfig]) => {
			return [bindingName, { id: getLocalKVNamespaceIdentifier(bindingConfig) }]
		})
	)
}

function materializeLocalD1Bindings(
	bindings: NonNullable<NonNullable<DevflareConfig['bindings']>['d1']>
): Record<string, { id: string }> {
	return Object.fromEntries(
		Object.entries(bindings).map(([bindingName, bindingConfig]) => {
			return [bindingName, { id: getLocalD1DatabaseIdentifier(bindingConfig) }]
		})
	)
}

function materializeLocalHyperdriveBindings(
	bindings: NonNullable<NonNullable<DevflareConfig['bindings']>['hyperdrive']>
): Record<string, { id: string }> {
	return Object.fromEntries(
		Object.entries(bindings).map(([bindingName, bindingConfig]) => {
			return [bindingName, { id: getLocalHyperdriveConfigIdentifier(bindingConfig) }]
		})
	)
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

function formatMissingKVBindings(missing: Array<{ bindingName: string; namespaceName: string }>): string {
	return missing
		.map(({ bindingName, namespaceName }) => `${bindingName} → ${namespaceName}`)
		.join(', ')
}

function formatMissingD1Bindings(missing: Array<{ bindingName: string; databaseName: string }>): string {
	return missing
		.map(({ bindingName, databaseName }) => `${bindingName} → ${databaseName}`)
		.join(', ')
}

function formatMissingHyperdriveBindings(missing: Array<{ bindingName: string; configurationName: string }>): string {
	return missing
		.map(({ bindingName, configurationName }) => `${bindingName} → ${configurationName}`)
		.join(', ')
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
): DevflareConfig {
	const resolvedConfig = resolveConfigForEnvironment(config, environment)
	const kvBindings = resolvedConfig.bindings?.kv
	const d1Bindings = resolvedConfig.bindings?.d1
	const hyperdriveBindings = resolvedConfig.bindings?.hyperdrive

	if (!kvBindings && !d1Bindings && !hyperdriveBindings) {
		return resolvedConfig
	}

	return {
		...resolvedConfig,
		bindings: {
			...resolvedConfig.bindings,
			...(kvBindings ? { kv: materializeLocalKVBindings(kvBindings) } : {}),
			...(d1Bindings ? { d1: materializeLocalD1Bindings(d1Bindings) } : {}),
			...(hyperdriveBindings ? { hyperdrive: materializeLocalHyperdriveBindings(hyperdriveBindings) } : {})
		}
	}
}

/**
	* Resolve Cloudflare-backed resource references such as KV/D1/Hyperdrive name bindings into
 * concrete IDs for build, deploy, and automation workflows.
 */
export async function resolveConfigResources(
	config: DevflareConfig,
	options: ResolveConfigResourcesOptions = {}
): Promise<DevflareConfig> {
	const resolvedConfig = resolveConfigForEnvironment(config, options.environment)
	const kvBindings = resolvedConfig.bindings?.kv
	const d1Bindings = resolvedConfig.bindings?.d1
	const hyperdriveBindings = resolvedConfig.bindings?.hyperdrive

	if (!kvBindings && !d1Bindings && !hyperdriveBindings) {
		return resolvedConfig
	}

	const pendingKVNameBindings = kvBindings
		? Object.entries(kvBindings)
			.map(([bindingName, bindingConfig]) => {
				const normalized = normalizeKVBinding(bindingConfig)
				return normalized.namespaceId
					? null
					: {
						bindingName,
						namespaceName: normalized.name ?? ''
					}
			})
			.filter((binding): binding is { bindingName: string; namespaceName: string } => binding !== null)
		: []

	const pendingD1NameBindings = d1Bindings
		? Object.entries(d1Bindings)
			.map(([bindingName, bindingConfig]) => {
				const normalized = normalizeD1Binding(bindingConfig)
				return normalized.databaseId
					? null
					: {
						bindingName,
						databaseName: normalized.name ?? ''
					}
			})
			.filter((binding): binding is { bindingName: string; databaseName: string } => binding !== null)
		: []

	const pendingHyperdriveNameBindings = hyperdriveBindings
		? Object.entries(hyperdriveBindings)
			.map(([bindingName, bindingConfig]) => {
				const normalized = normalizeHyperdriveBinding(bindingConfig)
				return normalized.configurationId
					? null
					: {
						bindingName,
						configurationName: normalized.name ?? ''
					}
			})
			.filter((binding): binding is { bindingName: string; configurationName: string } => binding !== null)
		: []

	if (
		pendingKVNameBindings.length === 0 &&
		pendingD1NameBindings.length === 0 &&
		pendingHyperdriveNameBindings.length === 0
	) {
		return {
			...resolvedConfig,
			bindings: {
				...resolvedConfig.bindings,
				...(kvBindings ? { kv: materializeLocalKVBindings(kvBindings) } : {}),
				...(d1Bindings ? { d1: materializeLocalD1Bindings(d1Bindings) } : {}),
				...(hyperdriveBindings ? { hyperdrive: materializeLocalHyperdriveBindings(hyperdriveBindings) } : {})
			}
		}
	}

	const cloudflareApi = resolveCloudflareApi(options.cloudflare)
	const accountId = await resolveLookupAccountId(resolvedConfig, options, cloudflareApi)

	let namespaceIdsByName = new Map<string, string>()
	if (pendingKVNameBindings.length > 0) {
		let namespaces
		try {
			namespaces = await cloudflareApi.listKVNamespaces(accountId)
		} catch (error) {
			throw new ConfigResourceResolutionError(
				`Could not list KV namespaces for Cloudflare account ${accountId} while resolving name-based KV bindings.`,
				error
			)
		}

		namespaceIdsByName = new Map(
			namespaces.map((namespace) => [namespace.name, namespace.id])
		)

		const missingKVBindings = pendingKVNameBindings.filter(({ namespaceName }) => {
			return !namespaceIdsByName.has(namespaceName)
		})

		if (missingKVBindings.length > 0) {
			throw new ConfigResourceResolutionError(
				`Could not find KV namespace(s) for ${formatMissingKVBindings(missingKVBindings)} in Cloudflare account ${accountId}.`
			)
		}
	}

	let databaseIdsByName = new Map<string, string>()
	if (pendingD1NameBindings.length > 0) {
		let databases
		try {
			databases = await cloudflareApi.listD1Databases(accountId)
		} catch (error) {
			throw new ConfigResourceResolutionError(
				`Could not list D1 databases for Cloudflare account ${accountId} while resolving name-based D1 bindings.`,
				error
			)
		}

		databaseIdsByName = new Map(
			databases.map((database) => [database.name, database.id])
		)

		const missingD1Bindings = pendingD1NameBindings.filter(({ databaseName }) => {
			return !databaseIdsByName.has(databaseName)
		})

		if (missingD1Bindings.length > 0) {
			throw new ConfigResourceResolutionError(
				`Could not find D1 database(s) for ${formatMissingD1Bindings(missingD1Bindings)} in Cloudflare account ${accountId}.`
			)
		}
	}

	let hyperdriveIdsByName = new Map<string, string>()
	if (pendingHyperdriveNameBindings.length > 0) {
		let hyperdrives
		try {
			hyperdrives = await cloudflareApi.listHyperdrives(accountId)
		} catch (error) {
			throw new ConfigResourceResolutionError(
				`Could not list Hyperdrive configurations for Cloudflare account ${accountId} while resolving name-based Hyperdrive bindings.`,
				error
			)
		}

		hyperdriveIdsByName = new Map(
			hyperdrives.map((hyperdrive) => [hyperdrive.name, hyperdrive.id])
		)

		const missingHyperdriveBindings = pendingHyperdriveNameBindings.filter(({ configurationName }) => {
			return !hyperdriveIdsByName.has(configurationName)
		})

		if (missingHyperdriveBindings.length > 0) {
			throw new ConfigResourceResolutionError(
				`Could not find Hyperdrive configuration(s) for ${formatMissingHyperdriveBindings(missingHyperdriveBindings)} in Cloudflare account ${accountId}.`
			)
		}
	}

	return {
		...resolvedConfig,
		bindings: {
			...resolvedConfig.bindings,
			...(kvBindings
				? {
					kv: Object.fromEntries(
						Object.entries(kvBindings).map(([bindingName, bindingConfig]) => {
							const normalized = normalizeKVBinding(bindingConfig)
							const resolvedId = normalized.namespaceId ?? namespaceIdsByName.get(normalized.name ?? '') ?? ''
							return [bindingName, { id: resolvedId }]
						})
					)
				}
				: {}),
			...(d1Bindings
				? {
					d1: Object.fromEntries(
						Object.entries(d1Bindings).map(([bindingName, bindingConfig]) => {
							const normalized = normalizeD1Binding(bindingConfig)
							const resolvedId = normalized.databaseId ?? databaseIdsByName.get(normalized.name ?? '') ?? ''
							return [bindingName, { id: resolvedId }]
						})
					)
				}
				: {}),
			...(hyperdriveBindings
				? {
					hyperdrive: Object.fromEntries(
						Object.entries(hyperdriveBindings).map(([bindingName, bindingConfig]) => {
							const normalized = normalizeHyperdriveBinding(bindingConfig)
							const resolvedId = normalized.configurationId ?? hyperdriveIdsByName.get(normalized.name ?? '') ?? ''
							return [bindingName, { id: resolvedId }]
						})
					)
				}
				: {})
		}
	}
}

/**
 * Load devflare.config.* and resolve any Cloudflare-backed resource references.
 *
 * This is the public Node-side API for external automation that needs the same
 * resolved values Devflare build/deploy flows use.
 */
export async function loadResolvedConfig(
	options: LoadResolvedConfigOptions = {}
): Promise<DevflareConfig> {
	const config = await loadConfig(options)
	return resolveConfigResources(config, options)
}
