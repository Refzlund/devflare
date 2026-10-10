// =============================================================================
// Config Module — Public exports
// =============================================================================

export {
	compileBuildConfig,
	compileConfig,
	readWranglerConfig,
	stringifyConfig,
	type WranglerConfig,
	type WranglerD1DatabaseBinding,
	type WranglerHyperdriveBinding,
	type WranglerKVNamespaceBinding,
	writeWranglerConfig
} from './compiler'
export { type DefineConfigInput, defineConfig, type TypedConfig } from './define'
export {
	type DeployResourceNames,
	type PrepareConfigResourcesForDeployOptions,
	type PrepareConfigResourcesForDeployResult,
	type PrepareMaterializedConfigResourcesForDeployOptions,
	prepareConfigResourcesForDeploy,
	prepareMaterializedConfigResourcesForDeploy
} from './deploy-resources'
export {
	type DevflareVarInput,
	type DevflareVarsInput,
	type EnvResolutionMode,
	type EnvVarDescriptor,
	EnvVarParseError,
	EnvVarResolutionError,
	env,
	type InferConfigVars,
	isEnvVarDescriptor,
	loadDevflareDotenv,
	loadDevflareDotenvIntoProcess,
	type MissingEnvVar,
	parseDevflareEnvFile,
	type ResolveConfigEnvVarsOptions,
	resolveConfigEnvVars
} from './env-vars'
export {
	ConfigNotFoundError,
	ConfigResourceResolutionError,
	ConfigValidationError,
	type LoadConfigOptions,
	loadConfig,
	loadResolvedConfig,
	resolveConfigPath
} from './loader'
export {
	isPreviewScopedName,
	materializePreviewScopedConfig,
	materializePreviewScopedString,
	type PreviewIdentifierSource,
	type PreviewResolutionOptions,
	type PreviewScopedName,
	type PreviewScopedNameOptions,
	type PreviewScopeFn,
	type PreviewScopeOptions,
	preview,
	type ResolvedPreviewIdentifier,
	resolvePreviewIdentifier
} from './preview'
// Cross-config referencing
export {
	type DOBindingRef,
	type RefResult,
	ref,
	type WorkerBinding,
	type WorkerBindingAccessor
} from './ref'
export { resolveConfigForEnvironment } from './resolve'
export {
	type BuildConfig,
	type DeployConfig,
	type LocalConfig,
	type Phase,
	type PhaseConfig,
	type ResolveResourcesBuildOptions,
	type ResolveResourcesDeployOptions,
	type ResolveResourcesLocalOptions,
	type ResolveResourcesOptions,
	resolveResources
} from './resolve-phased'
export {
	type LoadResolvedConfigOptions,
	type ResolveMaterializedConfigResourcesOptions,
	resolveMaterializedConfigResources
} from './resource-resolution'
export {
	type ArtifactsBinding,
	type AssetsConfig,
	type BrowserBindings,
	type ContainerConfig,
	configSchema,
	type D1Binding,
	type DevflareConfig,
	type DevflareConfigInput,
	type DevflareEnvConfig,
	type DispatchNamespaceBinding,
	type DurableObjectBinding,
	type FlagshipBinding,
	getLocalD1DatabaseIdentifier,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	getSingleBrowserBindingName,
	type HyperdriveBinding,
	type ImagesBinding,
	type KVBinding,
	type MediaBinding,
	type MigrationConfig,
	type MtlsCertificateBinding,
	type NormalizedArtifactsBinding,
	type NormalizedD1Binding,
	type NormalizedDispatchNamespaceBinding,
	type NormalizedDOBinding,
	type NormalizedFlagshipBinding,
	type NormalizedHyperdriveBinding,
	type NormalizedImagesBinding,
	type NormalizedKVBinding,
	type NormalizedMediaBinding,
	type NormalizedMtlsCertificateBinding,
	type NormalizedPipelineBinding,
	type NormalizedQueueProducer,
	type NormalizedR2Binding,
	type NormalizedSecretsStoreBinding,
	type NormalizedStreamBinding,
	type NormalizedVpcNetworkBinding,
	type NormalizedVpcServiceBinding,
	type NormalizedWorkflowBinding,
	normalizeArtifactsBinding,
	normalizeD1Binding,
	normalizeDispatchNamespaceBinding,
	normalizeDOBinding,
	normalizeFlagshipBinding,
	normalizeHyperdriveBinding,
	normalizeImagesBinding,
	normalizeKVBinding,
	normalizeMediaBinding,
	normalizeMtlsCertificateBinding,
	normalizePipelineBinding,
	normalizeQueueProducer,
	normalizeR2Binding,
	normalizeSecretsStoreBinding,
	normalizeStreamBinding,
	normalizeVpcNetworkBinding,
	normalizeVpcServiceBinding,
	normalizeWorkflowBinding,
	type PipelineBinding,
	type PreviewConfig,
	type QueueConsumer,
	type QueueProducer,
	type QueuesConfig,
	type R2Binding,
	type RateLimitBinding,
	type RolldownConfig,
	type RouteConfig,
	type SecretsStoreBinding,
	type ServiceBinding,
	type StreamBinding,
	type TailConsumerConfig,
	type VersionMetadataBinding,
	type ViteConfig,
	type VpcNetworkBinding,
	type VpcServiceBinding,
	type WorkerLoaderBinding,
	type WorkflowBinding,
	type WsRouteConfig
} from './schema'
export {
	collectReferencedServiceNames,
	ServiceBindingValidationError,
	type ValidateServiceBindingsOptions,
	validateServiceBindings
} from './service-bindings-validation'
export {
	assertSharedBindingIds,
	defineWorkspace,
	type LoadedWorkspaceManifest,
	type LoadWorkspaceManifestOptions,
	loadWorkspaceManifest,
	resolveAppDirectSocketPort,
	type WorkspaceApp,
	type WorkspaceManifest,
	type WorkspaceManifestInput,
	WorkspaceManifestNotFoundError,
	WorkspaceManifestValidationError
} from './workspace'
