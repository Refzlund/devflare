import { normalizeCompatibilityFlags } from './compatibility'
import { compileBindings } from './compiler/bindings'
import {
	compileContainers,
	compileModuleOptions,
	compileWranglerMigrations
} from './compiler/core-helpers'
import type { CompileConfigOptions, WranglerConfig } from './compiler/types'
import { toWranglerSecretsConfig } from './local-dev-vars'
import { resolveConfigForEnvironment } from './resolve'
import type { ResolvedConfig } from './resolve-phased'
import type { DevflareConfig } from './schema'
import { normalizeR2Binding } from './schema-normalization'

export { compileDOWorkerConfig } from './compiler/do-workers'
export {
	isolateViteBuildOutputPaths,
	readWranglerConfig,
	rebaseWranglerConfigPaths,
	stringifyConfig,
	writeWranglerConfig
} from './compiler/paths'
export type {
	CompileConfigOptions,
	WranglerConfig,
	WranglerD1DatabaseBinding,
	WranglerHyperdriveBinding,
	WranglerKVNamespaceBinding,
	WranglerModuleRule
} from './compiler/types'

/**
 * Compile a phase-resolved DevflareConfig to WranglerConfig.
 *
 * R1 step 3: input is type-narrowed to `ResolvedConfig` (`LocalConfig | DeployConfig`)
 * so callers cannot accidentally pass a raw `DevflareConfig` whose KV/D1/Hyperdrive
 * bindings might still be name-only. The runtime throw remains as a defense-in-depth
 * guard for callers that bypass the type system.
 *
 * @param config - A phase-resolved devflare configuration (`LocalConfig` or `DeployConfig`)
 * @param environment - Optional environment name for env-specific overrides
 * @returns Wrangler-compatible configuration object
 */
export function compileConfig(config: ResolvedConfig, environment?: string): WranglerConfig {
	return compileConfigInternal(config, environment)
}

export function compileBuildConfig(
	config: DevflareConfig,
	environment?: string,
	options: { alreadyResolved?: boolean } = {}
): WranglerConfig {
	return compileConfigInternal(config, environment, {
		preserveNamedBindings: true,
		alreadyResolved: options.alreadyResolved
	})
}

function compileConfigInternal(
	config: DevflareConfig,
	environment?: string,
	options: CompileConfigOptions = {}
): WranglerConfig {
	const resolvedConfig = options.alreadyResolved
		? config
		: resolveConfigForEnvironment(config, environment)
	const mergedConfig = {
		...resolvedConfig,
		compatibilityFlags: normalizeCompatibilityFlags(resolvedConfig.compatibilityFlags)
	}

	const result: WranglerConfig = {
		name: mergedConfig.name,
		compatibility_date: mergedConfig.compatibilityDate,
		preview_urls: true,
		workers_dev: mergedConfig.workersDev ?? true,
		...(mergedConfig.complianceRegion !== undefined && {
			compliance_region: mergedConfig.complianceRegion
		})
	}

	if (mergedConfig.accountId) {
		result.account_id = mergedConfig.accountId
	}

	const mainEntry = mergedConfig.files?.fetch
	if (typeof mainEntry === 'string') {
		result.main = mainEntry
	}

	compileModuleOptions(mergedConfig, result)

	if (mergedConfig.compatibilityFlags && mergedConfig.compatibilityFlags.length > 0) {
		result.compatibility_flags = mergedConfig.compatibilityFlags
	}

	if (mergedConfig.bindings) {
		compileBindings(mergedConfig.bindings, result, options, mergedConfig.secretsStoreId)
	}

	if (mergedConfig.triggers?.crons && mergedConfig.triggers.crons.length > 0) {
		result.triggers = { crons: mergedConfig.triggers.crons }
	}

	if (mergedConfig.tailConsumers && mergedConfig.tailConsumers.length > 0) {
		result.tail_consumers = mergedConfig.tailConsumers.map((consumer) =>
			typeof consumer === 'string'
				? { service: consumer }
				: {
						service: consumer.service,
						...(consumer.environment && { environment: consumer.environment })
					}
		)
	}

	if (mergedConfig.streamingTailConsumers && mergedConfig.streamingTailConsumers.length > 0) {
		// wrangler's StreamingTailConsumer accepts only `service` (no `environment`,
		// unlike tail_consumers), so emit service-only to stay deploy-valid.
		result.streaming_tail_consumers = mergedConfig.streamingTailConsumers.map((consumer) =>
			typeof consumer === 'string' ? { service: consumer } : { service: consumer.service }
		)
	}

	// Deploy-time symmetry for `presignR2Put`/`presignR2Get`: the runtime
	// cannot learn a binding's bucket name from the R2Bucket binding object,
	// so the binding→bucket mapping is injected as a plain var. An explicit
	// user var of the same name wins.
	const r2BucketsVar = buildR2BucketsVar(mergedConfig.bindings?.r2)
	if ((mergedConfig.vars && Object.keys(mergedConfig.vars).length > 0) || r2BucketsVar) {
		result.vars = {
			...(r2BucketsVar && { DEVFLARE_R2_BUCKETS: r2BucketsVar }),
			...mergedConfig.vars
		}
	}

	const secrets = toWranglerSecretsConfig(mergedConfig.secrets)
	if (secrets) {
		result.secrets = secrets
	}

	if (mergedConfig.routes && mergedConfig.routes.length > 0) {
		result.routes = mergedConfig.routes.map((route) => ({
			pattern: route.pattern,
			...(route.zone_name && { zone_name: route.zone_name }),
			...(route.zone_id && { zone_id: route.zone_id }),
			...(route.custom_domain !== undefined && { custom_domain: route.custom_domain }),
			// `enabled`/`previews_enabled` are accepted by wrangler only on a
			// CustomDomainRoute, so emit them only when this is a custom-domain
			// route (defense-in-depth; the schema already rejects the bad combo).
			...(route.custom_domain && route.enabled !== undefined && { enabled: route.enabled }),
			...(route.custom_domain &&
				route.previews_enabled !== undefined && {
					previews_enabled: route.previews_enabled
				})
		}))
	}

	if (mergedConfig.assets?.directory) {
		result.assets = {
			directory: mergedConfig.assets.directory,
			...(mergedConfig.assets.binding && { binding: mergedConfig.assets.binding }),
			...(mergedConfig.assets.html_handling && {
				html_handling: mergedConfig.assets.html_handling
			}),
			...(mergedConfig.assets.not_found_handling && {
				not_found_handling: mergedConfig.assets.not_found_handling
			}),
			...(mergedConfig.assets.run_worker_first !== undefined && {
				run_worker_first: mergedConfig.assets.run_worker_first
			})
		}
	}

	if (mergedConfig.placement) {
		result.placement = mergedConfig.placement
	}

	if (mergedConfig.observability) {
		result.observability = mergedConfig.observability
	}

	if (mergedConfig.limits) {
		result.limits = mergedConfig.limits
	}

	compileContainers(mergedConfig, result)

	if (mergedConfig.migrations && mergedConfig.migrations.length > 0) {
		result.migrations = compileWranglerMigrations(mergedConfig.migrations)
	}

	if (mergedConfig.wrangler?.passthrough) {
		Object.assign(result, mergedConfig.wrangler.passthrough)
	}

	return result
}

/**
 * Build the JSON value of the injected `DEVFLARE_R2_BUCKETS` var: a mapping
 * of R2 binding name → `{ bucketName, jurisdiction? }` that `presignR2Put`/
 * `presignR2Get` read at runtime to presign against the right bucket without
 * the app hardcoding bucket names. Returns `undefined` when the config has
 * no R2 bindings.
 */
function buildR2BucketsVar(
	r2Bindings: NonNullable<DevflareConfig['bindings']>['r2'] | undefined
): string | undefined {
	if (!r2Bindings || Object.keys(r2Bindings).length === 0) {
		return undefined
	}

	const mapping = Object.fromEntries(
		Object.entries(r2Bindings).map(([bindingName, bindingConfig]) => {
			const normalized = normalizeR2Binding(bindingConfig)
			return [
				bindingName,
				{
					bucketName: normalized.bucketName,
					...(normalized.jurisdiction && { jurisdiction: normalized.jurisdiction })
				}
			]
		})
	)
	return JSON.stringify(mapping)
}

/**
 * Compile DevflareConfig to programmatic config for @cloudflare/vite-plugin.
 * This is used instead of wrangler.jsonc in dev mode.
 *
 * @param config - The devflare configuration
 * @param environment - Optional environment name for env-specific overrides
 * @returns Config object compatible with cloudflare({ config: ... })
 */
export function compileToProgrammaticConfig(
	config: DevflareConfig,
	environment?: string,
	options: { preserveNamedBindings?: boolean } = {}
): Record<string, unknown> {
	return options.preserveNamedBindings
		? compileBuildConfig(config, environment)
		: compileConfig(config as ResolvedConfig, environment)
}
