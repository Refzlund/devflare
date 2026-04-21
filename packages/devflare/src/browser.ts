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

// Safe runtime-facing exports
export { workerName } from './workerName'
export { env } from './env'

// Bridge utilities that are safe in worker/browser bundles
export {
	setBindingHints,
	createEnvProxy,
	initEnv
} from './bridge/proxy'
export type { EnvProxyOptions, BindingHints } from './bridge/proxy'
export { BridgeClient, getClient } from './bridge/client'
export type { BridgeClientOptions } from './bridge/client'

// Decorators
export {
	durableObject,
	getDurableObjectOptions,
	type DurableObjectOptions
} from './decorators'

type CliModule = typeof import('./cli')
type ConfigModule = typeof import('./config')
type TransformModule = typeof import('./transform')
type MiniflareModule = typeof import('./bridge/miniflare')
type BridgeServerModule = typeof import('./bridge/server')
type TestModule = typeof import('./test')

type ConfigNotFoundErrorArgs = ConstructorParameters<ConfigModule['ConfigNotFoundError']>
type ConfigValidationErrorArgs = ConstructorParameters<ConfigModule['ConfigValidationError']>
type ConfigResourceResolutionErrorArgs = ConstructorParameters<ConfigModule['ConfigResourceResolutionError']>

function createUnsupportedApiError(name: string): Error {
	return new Error(
		`${name} is not available in browser environments; import from devflare/test or devflare/runtime in a worker/Node context instead.`
	)
}

function unsupportedFunction<TFunction>(name: string): TFunction {
	return ((..._args: readonly unknown[]) => {
		throw createUnsupportedApiError(name)
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
export const loadResolvedConfig = unsupportedFunction<ConfigModule['loadResolvedConfig']>('loadResolvedConfig')

export const compileConfig = unsupportedFunction<ConfigModule['compileConfig']>('compileConfig')
export const stringifyConfig = unsupportedFunction<ConfigModule['stringifyConfig']>('stringifyConfig')
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

export const findDurableObjectClasses = unsupportedFunction<TransformModule['findDurableObjectClasses']>('findDurableObjectClasses')
export const findDurableObjectClassesDetailed = unsupportedFunction<TransformModule['findDurableObjectClasses']>('findDurableObjectClassesDetailed')
export const generateWrapper = unsupportedFunction<TransformModule['generateWrapper']>('generateWrapper')
export const transformDurableObject = unsupportedFunction<TransformModule['transformDurableObject']>('transformDurableObject')
export const transformWorkerEntrypoint = unsupportedFunction<TransformModule['transformWorkerEntrypoint']>('transformWorkerEntrypoint')
export const findExportedFunctions = unsupportedFunction<TransformModule['findExportedFunctions']>('findExportedFunctions')
export const shouldTransformWorker = unsupportedFunction<TransformModule['shouldTransformWorker']>('shouldTransformWorker')
export const generateRpcInterface = unsupportedFunction<TransformModule['generateRpcInterface']>('generateRpcInterface')

export const startMiniflare = unsupportedFunction<MiniflareModule['startMiniflare']>('startMiniflare')
export const startMiniflareFromConfig = unsupportedFunction<MiniflareModule['startMiniflareFromConfig']>('startMiniflareFromConfig')
export const getMiniflare = unsupportedFunction<MiniflareModule['getMiniflare']>('getMiniflare')
export const stopMiniflare = unsupportedFunction<MiniflareModule['stopMiniflare']>('stopMiniflare')
export const gateway = createUnsupportedObject<BridgeServerModule['default']>('gateway')

export const createTestContext = unsupportedFunction<TestModule['createTestContext']>('createTestContext')
export const createMockTestContext = unsupportedFunction<TestModule['createMockTestContext']>('createMockTestContext')
export const createMockKV = unsupportedFunction<TestModule['createMockKV']>('createMockKV')
export const createMockD1 = unsupportedFunction<TestModule['createMockD1']>('createMockD1')
export const createMockR2 = unsupportedFunction<TestModule['createMockR2']>('createMockR2')
export const createMockQueue = unsupportedFunction<TestModule['createMockQueue']>('createMockQueue')
export const createMockEnv = unsupportedFunction<TestModule['createMockEnv']>('createMockEnv')
export const withTestContext = unsupportedFunction<TestModule['withTestContext']>('withTestContext')

export { defineConfig as default } from './config/define'
