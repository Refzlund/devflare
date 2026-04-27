// =============================================================================
// Test Module — Public Exports
// =============================================================================

// Simple test context API (recommended for single-worker tests)
export {
	createTestContext,
	env,
	type DevflareEnv,
	type TestEnv
} from './simple-context'

// Cloudflare test helpers — unified API for triggering all handler types
export { cf } from './cf'
export { email } from './email'
export { queue } from './queue'
export { scheduled } from './scheduled'
export { worker } from './worker'
export { tail } from './tail'

// Helper types
export type { EmailSendOptions, ReceivedEmail, EmailReceiveCallback } from './email'
export type { QueueMessageOptions, QueueTriggerResult } from './queue'
export type { ScheduledTriggerOptions, ScheduledTriggerResult } from './scheduled'
export type { WorkerFetchOptions } from './worker'
export type { TraceItemOptions, TailTriggerResult } from './tail'

// Service binding resolution (internal use)
export {
	hasServiceBindings,
	resolveServiceBindings,
	hasCrossWorkerDOs,
	resolveDOBindings,
	clearBundleCache,
	type ResolvedWorker,
	type ServiceBindingResolution,
	type DOBindingResolution
} from './resolve-service-bindings'

// Skip helper for conditional test execution
export { shouldSkip } from './should-skip'

// Local Cloudflare Containers testing helpers
export {
	containers,
	createContainerManager,
	detectContainerEngine,
	getContainerSkipReason,
	stopActiveContainers,
	type ContainerCommandResult,
	type ContainerCommandRunner,
	type ContainerEngineCheck,
	type ContainerEngineName,
	type ContainerEnginePreference,
	type ContainerEngineStatus,
	type ContainerManager,
	type ContainerManagerOptions,
	type DevflareContainerInstance,
	type LocalContainerState,
	type StartContainerOptions
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
	createMockTestContext,
	createMockKV,
	createMockD1,
	createMockR2,
	createMockQueue,
	createMockRateLimit,
	createMockVersionMetadata,
	createMockHyperdrive,
	createMockWorkerLoader,
	createMockMTLSCertificate,
	createMockDispatchNamespace,
	createMockWorkflow,
	createMockPipeline,
	createMockImagesBinding,
	createMockMediaBinding,
	createMockArtifacts,
	createMockSecretsStoreSecret,
	createMockEnv,
	withTestContext,
	type TestContext,
	type TestContextOptions,
	type MockEnvOptions,
	type MockRateLimitOptions,
	type MockWorkerLoaderOptions,
	type MockFetchInput,
	type MockFetcherHandler,
	type MockDispatchNamespaceOptions,
	type MockWorkflowOptions,
	type MockWorkflowInstanceOptions,
	type MockPipeline,
	type MockImagesBindingOptions,
	type MockMediaBindingOptions,
	type MockArtifactsOptions
} from './utilities'
