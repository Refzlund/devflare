// =============================================================================
// Devflare — Worker-safe Main Package Entry
// =============================================================================
// Used by browser/worker-target bundlers so runtime imports like
// `import { env } from 'devflare'` do not pull in CLI, Miniflare, or test-only
// Node.js dependencies.
// =============================================================================

// Safe config utilities

export { defineConfig } from './config/define'
export { ref } from './config/ref'

// The local-vars overlay switch: a plain string, so it is safe here as it is at the root entry.

export { LOCAL_DEV_VARS_ENV } from './config/local-dev-vars-switch'

// Safe runtime-facing exports

export { env, vars } from './env'
export { workerName } from './workerName'

// Bridge utilities that are safe in worker/browser bundles

export type { BridgeClientOptions } from './bridge/client'
export { BridgeClient, getClient } from './bridge/client'
export type { BindingHints, EnvProxyOptions } from './bridge/proxy'
export {
	createEnvProxy,
	initEnv,
	setBindingHints
} from './bridge/proxy'

// Decorators

export {
	type DurableObjectOptions,
	durableObject,
	getDurableObjectOptions
} from './decorators'

type CliModule = typeof import('./cli')
type ConfigModule = typeof import('./config')
type TransformModule = typeof import('./transform')
type MiniflareModule = typeof import('./bridge/miniflare')
type BridgeServerModule = typeof import('./bridge/server')
type TestModule = typeof import('./test')

type ConfigNotFoundErrorArgs = ConstructorParameters<ConfigModule['ConfigNotFoundError']>
type ConfigValidationErrorArgs = ConstructorParameters<ConfigModule['ConfigValidationError']>
type ConfigResourceResolutionErrorArgs = ConstructorParameters<
	ConfigModule['ConfigResourceResolutionError']
>

/** Where to go instead, for an export that exists in worker/Node code. */
const WORKER_OR_NODE_HINT =
	'import from devflare/test or devflare/runtime in a worker/Node context instead.'

/** Where to go instead, for an export that only Node can run because it reads the disk. */
const NODE_ONLY_HINT = 'call it from a Node script; it reads files from disk.'

function createUnsupportedApiError(name: string, hint = WORKER_OR_NODE_HINT): Error {
	return new Error(`${name} is not available in browser environments; ${hint}`)
}

function unsupportedFunction<TFunction>(name: string, hint?: string): TFunction {
	return ((..._args: readonly unknown[]) => {
		throw createUnsupportedApiError(name, hint)
	}) as unknown as TFunction
}

// Proxy that refuses ALL forms of introspection. Earlier revisions returned an
// empty object shape (has()=false, ownKeys()=[]) which lied about the absence
// of features — feature-detection code could conclude the export was simply an
// empty module rather than unavailable. Every trap now throws explicitly.
function createUnsupportedObject<T extends object>(name: string): T {
	const fail = (): never => {
		throw createUnsupportedApiError(name)
	}
	return new Proxy({} as T, {
		get: fail,
		has: fail,
		ownKeys: fail,
		getOwnPropertyDescriptor: fail,
		set: fail,
		defineProperty: fail,
		deleteProperty: fail,
		getPrototypeOf: fail
	})
}

export const loadConfig = unsupportedFunction<ConfigModule['loadConfig']>('loadConfig')
export const loadResolvedConfig =
	unsupportedFunction<ConfigModule['loadResolvedConfig']>('loadResolvedConfig')

// Neither devflare/test nor devflare/runtime carries these, so the generic advice would lead nowhere.
export const getDevflareDotenvPaths = unsupportedFunction<ConfigModule['getDevflareDotenvPaths']>(
	'getDevflareDotenvPaths',
	NODE_ONLY_HINT
)
export const loadDevflareDotenv = unsupportedFunction<ConfigModule['loadDevflareDotenv']>(
	'loadDevflareDotenv',
	NODE_ONLY_HINT
)
export const parseDevflareEnvFile = unsupportedFunction<ConfigModule['parseDevflareEnvFile']>(
	'parseDevflareEnvFile',
	NODE_ONLY_HINT
)

export const compileConfig = unsupportedFunction<ConfigModule['compileConfig']>('compileConfig')
// Neither devflare/test nor devflare/runtime carries it either, and it compiles what `loadConfig`
// loads, which only Node can do.
export const compileBuildConfig = unsupportedFunction<ConfigModule['compileBuildConfig']>(
	'compileBuildConfig',
	'call it from a Node script, on a config loadConfig returned.'
)
// It resolves what `loadConfig` loads, for the same Node script, so the same hint.
export const resolveConfigEnvVarsFromSources = unsupportedFunction<
	ConfigModule['resolveConfigEnvVarsFromSources']
>('resolveConfigEnvVarsFromSources', 'call it from a Node script, on a config loadConfig returned.')
export const stringifyConfig =
	unsupportedFunction<ConfigModule['stringifyConfig']>('stringifyConfig')
export const configSchema = createUnsupportedObject<ConfigModule['configSchema']>('configSchema')

export class ConfigNotFoundError extends Error {
	readonly code = 'CONFIG_NOT_FOUND'

	constructor(..._args: ConfigNotFoundErrorArgs) {
		super(createUnsupportedApiError('ConfigNotFoundError').message)
		this.name = 'ConfigNotFoundError'
	}
}

export class ConfigValidationError extends Error {
	readonly code = 'CONFIG_VALIDATION_ERROR'

	constructor(..._args: ConfigValidationErrorArgs) {
		super(createUnsupportedApiError('ConfigValidationError').message)
		this.name = 'ConfigValidationError'
	}
}

export class ConfigResourceResolutionError extends Error {
	readonly code = 'CONFIG_RESOURCE_RESOLUTION_ERROR'

	constructor(..._args: ConfigResourceResolutionErrorArgs) {
		super(createUnsupportedApiError('ConfigResourceResolutionError').message)
		this.name = 'ConfigResourceResolutionError'
	}
}

export const runCli = unsupportedFunction<CliModule['runCli']>('runCli')
export const parseArgs = unsupportedFunction<CliModule['parseArgs']>('parseArgs')

export const findDurableObjectClasses = unsupportedFunction<
	TransformModule['findDurableObjectClasses']
>('findDurableObjectClasses')
export const findDurableObjectClassesDetailed = unsupportedFunction<
	TransformModule['findDurableObjectClasses']
>('findDurableObjectClassesDetailed')
export const generateWrapper =
	unsupportedFunction<TransformModule['generateWrapper']>('generateWrapper')
export const transformDurableObject =
	unsupportedFunction<TransformModule['transformDurableObject']>('transformDurableObject')
export const transformWorkerEntrypoint = unsupportedFunction<
	TransformModule['transformWorkerEntrypoint']
>('transformWorkerEntrypoint')
export const findExportedFunctions =
	unsupportedFunction<TransformModule['findExportedFunctions']>('findExportedFunctions')
export const shouldTransformWorker =
	unsupportedFunction<TransformModule['shouldTransformWorker']>('shouldTransformWorker')
export const generateRpcInterface =
	unsupportedFunction<TransformModule['generateRpcInterface']>('generateRpcInterface')

export const startMiniflare =
	unsupportedFunction<MiniflareModule['startMiniflare']>('startMiniflare')
export const startMiniflareFromConfig = unsupportedFunction<
	MiniflareModule['startMiniflareFromConfig']
>('startMiniflareFromConfig')
export const getMiniflare = unsupportedFunction<MiniflareModule['getMiniflare']>('getMiniflare')
export const stopMiniflare = unsupportedFunction<MiniflareModule['stopMiniflare']>('stopMiniflare')
export const gateway = createUnsupportedObject<BridgeServerModule['default']>('gateway')

export const createTestContext =
	unsupportedFunction<TestModule['createTestContext']>('createTestContext')
export const createMockTestContext =
	unsupportedFunction<TestModule['createMockTestContext']>('createMockTestContext')
export const createMockKV = unsupportedFunction<TestModule['createMockKV']>('createMockKV')
export const createMockD1 = unsupportedFunction<TestModule['createMockD1']>('createMockD1')
export const createMockR2 = unsupportedFunction<TestModule['createMockR2']>('createMockR2')
export const createMockQueue = unsupportedFunction<TestModule['createMockQueue']>('createMockQueue')
export const createMockEnv = unsupportedFunction<TestModule['createMockEnv']>('createMockEnv')
export const withTestContext = unsupportedFunction<TestModule['withTestContext']>('withTestContext')

export { defineConfig as default } from './config/define'
