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
	normalizeMtlsCertificateBinding,
	normalizeDispatchNamespaceBinding,
	normalizeWorkflowBinding,
	normalizePipelineBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeSecretsStoreBinding,
	normalizeArtifactsBinding,
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
	type NormalizedMtlsCertificateBinding,
	type NormalizedDispatchNamespaceBinding,
	type NormalizedWorkflowBinding,
	type NormalizedPipelineBinding,
	type NormalizedImagesBinding,
	type NormalizedMediaBinding,
	type NormalizedSecretsStoreBinding,
	type NormalizedArtifactsBinding,
	type QueueConsumer,
	type QueuesConfig,
	type RateLimitBinding,
	type VersionMetadataBinding,
	type WorkerLoaderBinding,
	type SecretsStoreBinding,
	type MtlsCertificateBinding,
	type DispatchNamespaceBinding,
	type WorkflowBinding,
	type PipelineBinding,
	type ImagesBinding,
	type MediaBinding,
	type ArtifactsBinding,
	type ServiceBinding,
	type RouteConfig,
	type TailConsumerConfig,
	type WsRouteConfig,
	type AssetsConfig,
	type ContainerConfig,
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
	resolveMaterializedConfigResources,
	type LoadResolvedConfigOptions,
	type ResolveMaterializedConfigResourcesOptions
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
