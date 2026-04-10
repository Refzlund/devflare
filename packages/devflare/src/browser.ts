// =============================================================================
// Devflare — Worker-safe Main Package Entry
// =============================================================================
// Used by browser/worker-target bundlers so runtime imports like
// `import { env } from 'devflare'` do not pull in CLI, Miniflare, or test-only
// Node.js dependencies.
// =============================================================================

// Safe config utilities
export { defineConfig } from './config/define'
export { ref, resolveRef, serviceBinding } from './config/ref'

// Safe runtime-facing exports
export { workerName } from './workerName'
export { env } from './env'

// Bridge utilities that are safe in worker/browser bundles
export {
	setBindingHints,
	createEnvProxy,
	initEnv,
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

function createUnsupportedApiError(name: string): Error {
	return new Error(
		`${name} is not available in worker/browser bundles. ` +
		`Import it from the Node-side devflare package entry instead.`
	)
}

function unsupportedFunction<T extends (...args: any[]) => any>(name: string): T {
	return ((..._args: any[]) => {
		throw createUnsupportedApiError(name)
	}) as unknown as T
}

function createUnsupportedObject<T extends object>(name: string): T {
	return new Proxy({} as T, {
		get() {
			throw createUnsupportedApiError(name)
		},
		has() {
			return false
		},
		ownKeys() {
			return []
		},
		getOwnPropertyDescriptor() {
			return undefined
		}
	})
}

export async function loadConfig(..._args: any[]): Promise<never> {
	throw createUnsupportedApiError('loadConfig')
}

export async function loadResolvedConfig(..._args: any[]): Promise<never> {
	throw createUnsupportedApiError('loadResolvedConfig')
}

export const compileConfig = unsupportedFunction('compileConfig')
export const stringifyConfig = unsupportedFunction('stringifyConfig')
export const configSchema = createUnsupportedObject<Record<string, unknown>>('configSchema')
export const resolveConfigForLocalRuntime = unsupportedFunction('resolveConfigForLocalRuntime')
export const resolveConfigResources = unsupportedFunction('resolveConfigResources')

export class ConfigNotFoundError extends Error {
	readonly code = 'CONFIG_NOT_FOUND'

	constructor(..._args: any[]) {
		super(createUnsupportedApiError('ConfigNotFoundError').message)
		this.name = 'ConfigNotFoundError'
	}
}

export class ConfigValidationError extends Error {
	readonly code = 'CONFIG_VALIDATION_ERROR'

	constructor(..._args: any[]) {
		super(createUnsupportedApiError('ConfigValidationError').message)
		this.name = 'ConfigValidationError'
	}
}

export class ConfigResourceResolutionError extends Error {
	readonly code = 'CONFIG_RESOURCE_RESOLUTION_ERROR'

	constructor(..._args: any[]) {
		super(createUnsupportedApiError('ConfigResourceResolutionError').message)
		this.name = 'ConfigResourceResolutionError'
	}
}

export const runCli = unsupportedFunction('runCli')
export const parseArgs = unsupportedFunction('parseArgs')

export const findDurableObjectClasses = unsupportedFunction('findDurableObjectClasses')
export const findDurableObjectClassesDetailed = unsupportedFunction('findDurableObjectClassesDetailed')
export const generateWrapper = unsupportedFunction('generateWrapper')
export const transformDurableObject = unsupportedFunction('transformDurableObject')
export const transformWorkerEntrypoint = unsupportedFunction('transformWorkerEntrypoint')
export const findExportedFunctions = unsupportedFunction('findExportedFunctions')
export const shouldTransformWorker = unsupportedFunction('shouldTransformWorker')
export const generateRpcInterface = unsupportedFunction('generateRpcInterface')

export const startMiniflare = unsupportedFunction('startMiniflare')
export const startMiniflareFromConfig = unsupportedFunction('startMiniflareFromConfig')
export const getMiniflare = unsupportedFunction('getMiniflare')
export const stopMiniflare = unsupportedFunction('stopMiniflare')
export const gateway = createUnsupportedObject<Record<string, unknown>>('gateway')

export const createTestContext = unsupportedFunction('createTestContext')
export const createMockTestContext = unsupportedFunction('createMockTestContext')
export const createMockKV = unsupportedFunction('createMockKV')
export const createMockD1 = unsupportedFunction('createMockD1')
export const createMockR2 = unsupportedFunction('createMockR2')
export const createMockQueue = unsupportedFunction('createMockQueue')
export const createMockEnv = unsupportedFunction('createMockEnv')
export const withTestContext = unsupportedFunction('withTestContext')
export const createBridgeTestContext = unsupportedFunction('createBridgeTestContext')
export const stopBridgeTestContext = unsupportedFunction('stopBridgeTestContext')
export const getBridgeTestContext = unsupportedFunction('getBridgeTestContext')
export const testEnv = createUnsupportedObject<Record<string, unknown>>('testEnv')

export { defineConfig as default } from './config/define'
