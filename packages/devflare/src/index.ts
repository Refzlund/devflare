// =============================================================================
// Devflare — Main Package Entry Point
// =============================================================================
// Config Compiler + CLI Orchestrator for Cloudflare Workers
// =============================================================================

// Config utilities

export {
	ConfigNotFoundError,
	ConfigResourceResolutionError,
	ConfigValidationError,
	compileConfig,
	configSchema,
	type DevflareConfig,
	type DevflareConfigInput,
	defineConfig,
	defineWorkspace,
	type LoadResolvedConfigOptions,
	loadConfig,
	loadResolvedConfig,
	type PreviewScopedName,
	type PreviewScopedNameOptions,
	type PreviewScopeFn,
	type PreviewScopeOptions,
	preview,
	stringifyConfig,
	type WorkspaceApp,
	type WorkspaceManifest,
	type WorkspaceManifestInput
} from './config'

// Cross-config referencing

export {
	type RefResult,
	ref,
	type WorkerBinding,
	type WorkerBindingAccessor
} from './config'

// Worker name (build-time injected)

export { workerName } from './workerName'

// Decorators

export {
	type DurableObjectOptions,
	durableObject,
	getDurableObjectOptions
} from './decorators'

// CLI

export type { CliOptions, CliResult, ParsedArgs } from './cli'
export { parseArgs, runCli } from './cli'

// Unified env / vars — tries request context first, falls back to bridge

export { env, vars } from './env'

// Re-export defineConfig as default for convenience

export { defineConfig as default } from './config'
