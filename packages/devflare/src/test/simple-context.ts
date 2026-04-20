// =============================================================================
// Simple Test Context — The user-friendly API
// =============================================================================
// Usage:
//   import { createTestContext } from 'devflare/test'
//   import { env } from 'devflare'
//   beforeAll(() => createTestContext())  // Auto-finds the nearest devflare config
//   afterAll(() => env.dispose())
//   test('works', async () => {
//     const result = await env.MY_DO.getByName('main').getValue()
//   })
// =============================================================================

import { dirname, resolve } from 'path'
import {
	loadConfig
} from '../config'
import { BridgeClient } from '../bridge/client'
import { createEnvProxy, setBindingHints, type BindingHints } from '../bridge/proxy'
import { __clearTestContext, __setTestContext } from '../env'
import { hasCrossWorkerDOs, hasServiceBindings, resolveDOBindings, resolveServiceBindings } from './resolve-service-bindings'
import { buildDurableObjectGateway } from './simple-context-durable-objects'
import { findNearestConfig, getAvailablePort, getCallerDirectory, resolveTransportFile } from './simple-context-paths'
import { wrapEnvSendEmailBindings } from '../utils/send-email'
import { extractBindingHints } from './binding-hints'
import { buildRemoteAndStaticBindings } from './simple-context-bindings'
import { resolveHandlerPaths } from './simple-context-handlers'
import { startBridgeBackedTestContext } from './simple-context-startup'
import { decodeTransportValue, loadTransportDecoders, type TransportDecoderMap } from './simple-context-transport'
import { applyMultiWorkerConfig } from './simple-context-multi-worker'
import { buildInlineBridgeMfConfig } from './simple-context-mfconfig'

// Handler helper configuration
import { configureEmail, resetEmailState } from './email'
import { configureQueue, resetQueueState } from './queue'
import { configureScheduled, resetScheduledState } from './scheduled'
import { configureTail, resetTailState } from './tail'
import { configureWorker, resetWorkerState } from './worker'

// -----------------------------------------------------------------------------
// Per-context state
// -----------------------------------------------------------------------------

interface TestContextState {
	client: BridgeClient | null
	miniflare: any
	envProxy: Record<string, unknown> | null
	transportDecode: TransportDecoderMap | null
	remoteBindings: Record<string, unknown> | null
	miniflareBindings: Record<string, unknown> | null
}

function createTestContextState(): TestContextState {
	return {
		client: null,
		miniflare: null,
		envProxy: null,
		transportDecode: null,
		remoteBindings: null,
		miniflareBindings: null
	}
}

function shouldPreferBridgeBinding(hint: BindingHints[string] | undefined): boolean {
	return hint === 'do' || hint === 'service'
}

// -----------------------------------------------------------------------------
// Main API
// -----------------------------------------------------------------------------

/**
 * Create a test context from a devflare config file.
 * This starts Miniflare with the configured bindings and sets up the bridge.
 *
 * @param configPath - Optional path to config file. If not provided, searches
 * upward from the test file for a supported devflare config.
 */
export async function createTestContext(configPath?: string): Promise<void> {
	const state = createTestContextState()
	const callerDir = getCallerDirectory()
	let absolutePath: string

	if (configPath) {
		absolutePath = resolve(callerDir, configPath)
	} else {
		const found = await findNearestConfig(callerDir)
		if (!found) {
			throw new Error(
				`Could not find a devflare config file. Searched upward from: ${callerDir}\n`
				+ `Expected one of: devflare.config.ts, devflare.config.mts, devflare.config.js, devflare.config.mjs\n`
				+ `Either create a config file or provide an explicit path: createTestContext('./path/to/config.ts')`
			)
		}
		absolutePath = found
	}

	const configDir = dirname(absolutePath)
	const config = await loadConfig({
		cwd: configDir,
		configFile: absolutePath.split(/[/\\]/).pop()
	})

	state.remoteBindings = buildRemoteAndStaticBindings(config)

	const hints = extractBindingHints(config)

	const decodeTransport = (value: unknown): unknown => decodeTransportValue(state.transportDecode, value)

	const needsMultiWorkerForServices = hasServiceBindings(config)
	const needsMultiWorkerForDOs = hasCrossWorkerDOs(config)
	const needsMultiWorker = needsMultiWorkerForServices || needsMultiWorkerForDOs

	let serviceBindingResolution: Awaited<ReturnType<typeof resolveServiceBindings>> | null = null
	let doBindingResolution: Awaited<ReturnType<typeof resolveDOBindings>> | null = null

	if (needsMultiWorkerForServices) {
		serviceBindingResolution = await resolveServiceBindings(config, configDir)
	}
	if (needsMultiWorkerForDOs) {
		doBindingResolution = await resolveDOBindings(config, configDir)
	}

	const mfConfig: any = buildInlineBridgeMfConfig(config)

	const transportFile = resolveTransportFile(configDir, config.files?.transport)

	if (transportFile) {
		state.transportDecode = await loadTransportDecoders(configDir, transportFile)
	}

	const gateway = await buildDurableObjectGateway(config, configDir, transportFile)
	mfConfig.script = gateway.script
	if (gateway.durableObjects) {
		mfConfig.durableObjects = gateway.durableObjects
	}

	const hasMultiWorkerServices = serviceBindingResolution && serviceBindingResolution.workers.length > 0
	const hasMultiWorkerDOs = doBindingResolution && doBindingResolution.workers.length > 0

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		applyMultiWorkerConfig(mfConfig, config, serviceBindingResolution, doBindingResolution)
	}

	let activePort: number

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		const { Miniflare } = await import('miniflare')
		activePort = await getAvailablePort()
		state.miniflare = new Miniflare({
			...mfConfig,
			port: activePort
		})
		await state.miniflare.ready
		state.miniflareBindings = wrapEnvSendEmailBindings(await state.miniflare.getBindings())
	} else {
		const startedBridgeBackedTestContext = await startBridgeBackedTestContext(mfConfig)
		activePort = startedBridgeBackedTestContext.port
		state.miniflare = startedBridgeBackedTestContext.miniflare
		state.miniflareBindings = startedBridgeBackedTestContext.miniflareBindings
		state.client = startedBridgeBackedTestContext.client
	}

	const disposeContext = async () => {
		if (state.client) {
			await state.client.disconnect()
			state.client = null
		}
		if (state.miniflare) {
			await state.miniflare.dispose()
			state.miniflare = null
		}
		state.envProxy = null
		state.transportDecode = null
		state.remoteBindings = null
		state.miniflareBindings = null

		resetQueueState()
		resetScheduledState()
		resetWorkerState()
		resetTailState()
		resetEmailState()

		__clearTestContext()
	}

	const getTestEnv = (): Record<string, unknown> => {
		return new Proxy({}, {
			get(_, prop: string) {
				if (state.remoteBindings && prop in state.remoteBindings) {
					return state.remoteBindings[prop]
				}
				if (hints[prop] === 'sendEmail' && state.envProxy && prop in state.envProxy) {
					return state.envProxy[prop]
				}
				if (state.miniflareBindings && prop in state.miniflareBindings) {
					return state.miniflareBindings[prop]
				}
				if (state.envProxy && prop in state.envProxy) {
					return state.envProxy[prop]
				}
				return undefined
			},
			has(_, prop: string) {
				return Boolean(
					(state.remoteBindings && prop in state.remoteBindings)
					|| (state.miniflareBindings && prop in state.miniflareBindings)
					|| (state.envProxy && prop in state.envProxy)
				)
			}
		}) as Record<string, unknown>
	}

	const handlerPaths = await resolveHandlerPaths(configDir, config)
	const resolvedFetchPath = handlerPaths.fetch
	const resolvedQueuePath = handlerPaths.queue
	const resolvedScheduledPath = handlerPaths.scheduled
	const resolvedEmailPath = handlerPaths.email
	const resolvedTailPath = handlerPaths.tail
	const resolvedRoutes = handlerPaths.routes

	configureQueue({
		handlerPath: resolvedQueuePath,
		configDir,
		getEnv: getTestEnv
	})
	configureScheduled({
		handlerPath: resolvedScheduledPath,
		configDir,
		getEnv: getTestEnv
	})
	configureWorker({
		handlerPath: resolvedFetchPath,
		routes: resolvedRoutes?.routes.map((route) => ({
			filePath: route.filePath,
			routePath: route.routePath,
			segments: route.segments
		})) ?? [],
		configDir,
		getEnv: getTestEnv
	})
	configureTail({
		handlerPath: resolvedTailPath,
		configDir,
		getEnv: getTestEnv
	})
	configureEmail({
		port: activePort,
		handlerPath: resolvedEmailPath,
		configDir,
		getEnv: getTestEnv
	})

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		setBindingHints(hints)

		const envAccessor: Record<string, unknown> = new Proxy({}, {
			get(_, prop: string) {
				if (state.remoteBindings && prop in state.remoteBindings) {
					return state.remoteBindings[prop]
				}
				if (state.miniflareBindings && prop in state.miniflareBindings) {
					return state.miniflareBindings[prop]
				}
				return undefined
			},
			has(_, prop: string) {
				return Boolean(
					(state.remoteBindings && prop in state.remoteBindings)
					|| (state.miniflareBindings && prop in state.miniflareBindings)
				)
			}
		})

		__setTestContext(envAccessor, disposeContext)
		return
	}

	const bridgeClient = state.client
	if (!bridgeClient) {
		throw new Error('Bridge-backed test context did not initialize a client.')
	}

	setBindingHints(hints)
	state.envProxy = createEnvProxy({
		client: bridgeClient,
		transformResult: (result: unknown) => decodeTransport(result)
	})

	const envAccessor: Record<string, unknown> = new Proxy({}, {
		get(_, prop: string) {
			const hint = hints[prop]
			const prefersBridgeBinding = shouldPreferBridgeBinding(hint)

			if (state.remoteBindings && prop in state.remoteBindings) {
				return state.remoteBindings[prop]
			}
			if (!prefersBridgeBinding && state.miniflareBindings && prop in state.miniflareBindings) {
				return state.miniflareBindings[prop]
			}
			if (state.envProxy) {
				return state.envProxy[prop]
			}
			if (prefersBridgeBinding && state.miniflareBindings && prop in state.miniflareBindings) {
				return state.miniflareBindings[prop]
			}
			return undefined
		},
		has(_, prop: string) {
			return Boolean(
				(state.remoteBindings && prop in state.remoteBindings)
				|| (state.miniflareBindings && prop in state.miniflareBindings)
				|| (state.envProxy !== null)
			)
		}
	})

	__setTestContext(envAccessor, disposeContext)
}

/**
 * Test environment interface - extend this in your project's env.d.ts
 */
export interface TestEnv {
	dispose(): Promise<void>
}

/**
 * Base environment type - augmented by user's env.d.ts via module augmentation.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DevflareEnv { }

export { env } from '../env'
