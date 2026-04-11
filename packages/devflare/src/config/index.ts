// =============================================================================
// Config Module — Public exports
// =============================================================================

export { defineConfig } from './define'
export {
	configSchema,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	getSingleBrowserBindingName,
	getLocalD1DatabaseIdentifier,
	normalizeHyperdriveBinding,
	normalizeKVBinding,
	normalizeD1Binding,
	normalizeDOBinding,
	type BrowserBindings,
	type D1Binding,
	type HyperdriveBinding,
	type DevflareConfig,
	type DevflareConfigInput,
	type DevflareEnvConfig,
	type DurableObjectBinding,
	type KVBinding,
	type NormalizedHyperdriveBinding,
	type NormalizedKVBinding,
	type NormalizedD1Binding,
	type NormalizedDOBinding,
	type QueueConsumer,
	type QueuesConfig,
	type ServiceBinding,
	type RouteConfig,
	type WsRouteConfig,
	type AssetsConfig,
	type ViteConfig,
	type RolldownConfig,
	type BuildConfig,
	type MigrationConfig
} from './schema'
export { compileConfig, stringifyConfig, writeWranglerConfig, type WranglerConfig } from './compiler'
export {
	loadConfig,
	loadResolvedConfig,
	resolveConfigPath,
	ConfigNotFoundError,
	ConfigValidationError,
	ConfigResourceResolutionError,
	type LoadConfigOptions
} from './loader'
export { resolveConfigForEnvironment } from './resolve'
export {
	resolveConfigForLocalRuntime,
	resolveConfigResources,
	type LoadResolvedConfigOptions,
	type ResolveConfigResourcesOptions
} from './resource-resolution'

// Cross-config referencing
export {
	ref,
	resolveRef,
	serviceBinding,
	type RefResult,
	type WorkerBinding,
	type WorkerBindingAccessor,
	type DOBindingRef
} from './ref'
