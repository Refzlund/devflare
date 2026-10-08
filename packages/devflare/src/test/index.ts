// =============================================================================
// Test Module — Public Exports
// =============================================================================

// Simple test context API (recommended for single-worker tests)

export {
	createTestContext,
	type DevflareEnv,
	env,
	type TestEnv
} from './simple-context'

// Cloudflare test helpers — unified API for triggering all handler types

export { alarm } from './alarm'
export { cf } from './cf'
export { email } from './email'
export { queue } from './queue'
export { scheduled } from './scheduled'
export { tail } from './tail'
export { worker } from './worker'

// Helper types

export type { AlarmTriggerOptions, AlarmTriggerResult, AlarmTriggerTarget } from './alarm'
export type { EmailReceiveCallback, EmailSendOptions, ReceivedEmail } from './email'
export type { QueueMessageOptions, QueueTriggerResult } from './queue'
export type { ScheduledTriggerOptions, ScheduledTriggerResult } from './scheduled'
export type { TailTriggerResult, TraceItemOptions } from './tail'
export type { WorkerFetchOptions } from './worker'

// Service binding resolution (internal use)

export {
	clearBundleCache,
	type DOBindingResolution,
	hasCrossWorkerDOs,
	hasServiceBindings,
	type ResolvedWorker,
	resolveDOBindings,
	resolveServiceBindings,
	type ServiceBindingResolution
} from './resolve-service-bindings'

// Cache resets — for a suite that rewrites the tree it is testing, mid-process

export { __resetDurableObjectBundleCache } from './durable-object-bundle-cache'
export { __resetTestContextConfigCache } from './simple-context-lifecycle'

// Skip helper for conditional test execution

export { shouldSkip } from './should-skip'

// Local Cloudflare Containers testing helpers

export {
	type ContainerCommandResult,
	type ContainerCommandRunner,
	type ContainerEngineCheck,
	type ContainerEngineName,
	type ContainerEnginePreference,
	type ContainerEngineStatus,
	type ContainerManager,
	type ContainerManagerOptions,
	containers,
	createContainerManager,
	type DevflareContainerInstance,
	detectContainerEngine,
	getContainerSkipReason,
	type LocalContainerState,
	type StartContainerOptions,
	stopActiveContainers
} from './containers'

// Offline-first support matrix and config-derived pure-test env helpers

export {
	createOfflineBindings,
	createOfflineEnv,
	describeOfflineSupport,
	getOfflineSupportMatrix,
	type OfflineBindingFixtures,
	type OfflineBindingsResult,
	type OfflineMissingFixture,
	type OfflineRemoteBoundary,
	type OfflineSupportEntry,
	type OfflineSupportTier
} from './offline-bindings'

// AI Search pure unit-test mocks

export {
	createMockAISearchInstance,
	createMockAISearchNamespace,
	type MockAISearchInstance,
	type MockAISearchInstanceOptions,
	type MockAISearchItemFixture,
	type MockAISearchNamespace,
	type MockAISearchNamespaceOptions
} from './ai-search'

// Mock utilities (for unit testing without Miniflare)

export {
	createLocalSendEmailBinding,
	createMockAnalyticsEngine,
	createMockArtifacts,
	createMockD1,
	createMockDispatchNamespace,
	createMockEnv,
	createMockFlagshipBinding,
	createMockHyperdrive,
	createMockImagesBinding,
	createMockKV,
	createMockMediaBinding,
	createMockMTLSCertificate,
	createMockPipeline,
	createMockQueue,
	createMockR2,
	createMockRateLimit,
	createMockSecretsStoreSecret,
	createMockSendEmail,
	createMockStreamBinding,
	createMockTestContext,
	createMockVectorize,
	createMockVersionMetadata,
	createMockWorkerLoader,
	createMockWorkflow,
	type LocalSendEmailBindingConfig,
	type MockAnalyticsEngineDataset,
	type MockArtifactsOptions,
	type MockDispatchNamespaceOptions,
	type MockEnvOptions,
	type MockFetcherHandler,
	type MockFetchInput,
	type MockFlagshipBindingOptions,
	type MockImagesBindingOptions,
	type MockMediaBindingOptions,
	type MockPipeline,
	type MockRateLimitOptions,
	type MockSendEmailBinding,
	type MockStreamBindingOptions,
	type MockVectorizeIndex,
	type MockVectorizeOptions,
	type MockWorkerLoaderOptions,
	type MockWorkflowInstanceOptions,
	type MockWorkflowOptions,
	type TestContext,
	type TestContextOptions,
	withTestContext
} from './utilities'
