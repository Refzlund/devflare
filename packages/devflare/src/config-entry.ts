// =============================================================================
// Devflare — Config-Only Public Entry
// =============================================================================
// Use this from devflare.config.ts files to avoid loading the full Node-side
// package barrel (CLI, bridge, test helpers, transforms, etc.) just to access
// defineConfig() or ref().
// =============================================================================

export {
	defineConfig,
	type DefineConfigInput,
	type TypedConfig
} from './config/define'

export {
	env,
	type EnvVarDescriptor,
	type InferConfigVars
} from './config/env-vars'

export {
	preview,
	type PreviewScopeFn,
	type PreviewScopeOptions,
	type PreviewScopedName,
	type PreviewScopedNameOptions
} from './config/preview'

export {
	ref,
	type RefResult,
	type WorkerBinding,
	type WorkerBindingAccessor,
	type DOBindingRef
} from './config/ref'

export type * from './config/schema-types'

export { defineConfig as default } from './config/define'
