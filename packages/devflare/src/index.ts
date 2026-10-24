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
	compileBuildConfig,
	compileConfig,
	configSchema,
	type DevflareConfig,
	type DevflareConfigInput,
	defineConfig,
	defineWorkspace,
	type LoadConfigOptions,
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

// The dotenv layer — which `.env` files a command loads, and what they set
//
// Every command that loads a config (`dev`, `build`, `deploy --prod` included) runs this layer first,
// so a script that must know what a deploy will see — a predeploy guard refusing a committed dev
// value — has to ask it rather than mirror it. The pure readers only: the mutating
// `loadDevflareDotenvIntoProcess` stays internal, because copying into a caller's `process.env` is
// a decision `loadConfig` makes for itself.

export {
	getDevflareDotenvPaths,
	type LoadDevflareDotenvResult,
	loadDevflareDotenv,
	parseDevflareEnvFile
} from './config'

// What a build resolves `env.X` var descriptors to, from values the caller chooses
//
// The same script grading a deploy needs the descriptors resolved as `devflare build` resolves them,
// `.default()` included, without reading the dotenv layer and without failing on a required variable
// nobody provisioned. The function reports that variable instead; the throwing resolvers stay internal.

export {
	type ConfigEnvVarsResolution,
	type EnvResolutionMode,
	type MissingEnvVar,
	type ResolveConfigEnvVarsFromSourcesOptions,
	resolveConfigEnvVarsFromSources
} from './config'

// The local-vars overlay switch — the variable that keeps `.dev.vars` (or wrangler's `.env` fallback)
// from being laid over a config's `vars` in dev
//
// Exported so a launcher setting it, and a test asserting the launcher does, name the same variable
// rather than two copies of a string.

export { LOCAL_DEV_VARS_ENV } from './config/local-dev-vars-switch'

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
