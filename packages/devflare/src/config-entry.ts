// =============================================================================
// Devflare — Config-Only Public Entry
// =============================================================================
// Use this from devflare.config.ts files to avoid loading the full Node-side
// package barrel (CLI, bridge, test helpers, transforms, etc.) just to access
// defineConfig() or ref().
// =============================================================================

export {
	type DefineConfigInput,
	defineConfig,
	defineConfig as default,
	type TypedConfig
} from './config/define'
export {
	type EnvVarDescriptor,
	env,
	type InferConfigVars
} from './config/env-vars'
export {
	type PreviewScopedName,
	type PreviewScopedNameOptions,
	type PreviewScopeFn,
	type PreviewScopeOptions,
	preview
} from './config/preview'
export {
	type DOBindingRef,
	type RefResult,
	ref,
	type WorkerBinding,
	type WorkerBindingAccessor
} from './config/ref'
export type * from './config/schema-types'
