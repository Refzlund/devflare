// =============================================================================
// Config Module — Public exports
// =============================================================================

export { defineConfig } from './define'
export {
	preview,
	isPreviewScopedName,
	resolvePreviewIdentifier,
	materializePreviewScopedConfig,
	materializePreviewScopedString,
	type ResolvedPreviewIdentifier,
	type PreviewIdentifierSource,
	type PreviewScopeFn,
	type PreviewScopeOptions,
	type PreviewScopedName,
	type PreviewScopedNameOptions,
	type PreviewResolutionOptions
} from './preview'
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
	type PreviewConfig,
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
	type MigrationConfig
} from './schema'
export {
	compileBuildConfig,
	compileConfig,
	readWranglerConfig,
	stringifyConfig,
	writeWranglerConfig,
	type WranglerConfig,
	type WranglerD1DatabaseBinding,
	type WranglerHyperdriveBinding,
	type WranglerKVNamespaceBinding
} from './compiler'
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
	resolveMaterializedConfigResources,
	resolveConfigResources,
	type LoadResolvedConfigOptions,
	type ResolveMaterializedConfigResourcesOptions,
	type ResolveConfigResourcesOptions
} from './resource-resolution'
export {
	prepareConfigResourcesForDeploy,
	prepareMaterializedConfigResourcesForDeploy,
	type DeployResourceNames,
	type PrepareConfigResourcesForDeployOptions,
	type PrepareConfigResourcesForDeployResult,
	type PrepareMaterializedConfigResourcesForDeployOptions
} from './deploy-resources'
export {
	resolveResources,
	type BuildConfig,
	type LocalConfig,
	type DeployConfig,
	type Phase,
	type PhaseConfig,
	type ResolveResourcesOptions,
	type ResolveResourcesBuildOptions,
	type ResolveResourcesLocalOptions,
	type ResolveResourcesDeployOptions
} from './resolve-phased'
export {
	collectReferencedServiceNames,
	validateServiceBindings,
	ServiceBindingValidationError,
	type ValidateServiceBindingsOptions
} from './service-bindings-validation'

// Cross-config referencing
export {
	ref,
	type RefResult,
	type WorkerBinding,
	type WorkerBindingAccessor,
	type DOBindingRef
} from './ref'
