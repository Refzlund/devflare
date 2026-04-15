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

// Mock utilities (for unit testing without Miniflare)
export {
	createMockTestContext,
	createMockKV,
	createMockD1,
	createMockR2,
	createMockQueue,
	createMockEnv,
	withTestContext,
	type TestContext,
	type TestContextOptions,
	type MockEnvOptions
} from './utilities'

// Bridge test context (for integration testing with real Miniflare)
export {
	createBridgeTestContext,
	stopBridgeTestContext,
	getBridgeTestContext,
	testEnv,
	type BridgeTestContext,
	type BridgeTestContextOptions
} from './bridge-context'
