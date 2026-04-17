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

// CLI
export { runCli, parseArgs } from './cli'
export type { ParsedArgs, CliOptions, CliResult } from './cli'

// Unified env — tries request context first, falls back to bridge
export { env } from './env'

// Re-export defineConfig as default for convenience
export { defineConfig as default } from './config'
