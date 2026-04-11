// =============================================================================
// Devflare — Main Package Entry Point
// =============================================================================
// Config Compiler + CLI Orchestrator for Cloudflare Workers
// =============================================================================

// Config utilities
export {
	defineConfig,
	preview,
	loadConfig,
	loadResolvedConfig,
	compileConfig,
	stringifyConfig,
	configSchema,
	ConfigNotFoundError,
	ConfigValidationError,
	ConfigResourceResolutionError,
	resolveConfigForLocalRuntime,
	resolveConfigResources,
	type DevflareConfig,
	type DevflareConfigInput,
	type PreviewScopeFn,
	type PreviewScopeOptions,
	type PreviewScopedName,
	type PreviewScopedNameOptions,
	type LoadResolvedConfigOptions,
	type ResolveConfigResourcesOptions
} from './config'

// Cross-config referencing
export {
	ref,
	resolveRef,
	serviceBinding,
	type RefResult,
	type WorkerBinding,
	type WorkerBindingAccessor
} from './config'

// Worker name (build-time injected)
export { workerName } from './workerName'

// Decorators
export {
	durableObject,
	getDurableObjectOptions,
	type DurableObjectOptions
} from './decorators'

// Transform utilities (for advanced usage)
export {
	findDurableObjectClasses,
	findDurableObjectClassesDetailed,
	generateWrapper,
	transformDurableObject,
	type DOClassInfo,
	type WrapperOptions,
	type TransformResult
} from './transform/durable-object'

// Worker entrypoint transformation
export {
	transformWorkerEntrypoint,
	findExportedFunctions,
	shouldTransformWorker,
	generateRpcInterface,
	type ExportedFunction,
	type WorkerTransformOptions,
	type WorkerTransformResult
} from './transform'

// CLI
export { runCli, parseArgs } from './cli'
export type { ParsedArgs, CliOptions, CliResult } from './cli'

// Bridge — WebSocket RPC to Miniflare
export {
	// Main API
	setBindingHints,
	createEnvProxy,
	initEnv,
	type EnvProxyOptions,
	type BindingHints,

	// Client
	BridgeClient,
	getClient,
	type BridgeClientOptions,

	// Miniflare Orchestration
	startMiniflare,
	startMiniflareFromConfig,
	getMiniflare,
	stopMiniflare,
	type MiniflareInstance,
	type MiniflareOptions,

	// Gateway (for Miniflare worker)
	gateway
} from './bridge'

// Unified env — tries request context first, falls back to bridge
export { env } from './env'

// Test utilities (re-exported from devflare/test for convenience)
export {
	createTestContext,
	createMockTestContext,
	createMockKV,
	createMockD1,
	createMockR2,
	createMockQueue,
	createMockEnv,
	withTestContext,
	type TestContext,
	type TestContextOptions,
	type MockEnvOptions,

	// Bridge test context (integration testing with Miniflare)
	createBridgeTestContext,
	stopBridgeTestContext,
	getBridgeTestContext,
	testEnv,
	type BridgeTestContext,
	type BridgeTestContextOptions
} from './test'

// Re-export defineConfig as default for convenience
export { defineConfig as default } from './config'
