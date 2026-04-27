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

import { BridgeClient } from '../bridge/client'
import { createEnvProxy, setBindingHints, type BindingHints } from '../bridge/proxy'
import { __setTestContext } from '../env'
import { hasCrossWorkerDOs, hasServiceBindings, resolveDOBindings, resolveServiceBindings } from './resolve-service-bindings'
import { buildDurableObjectGateway } from './simple-context-durable-objects'
import { resolveTransportFile } from './simple-context-paths'
import { extractBindingHints } from './binding-hints'
import { buildRemoteAndStaticBindings } from './simple-context-bindings'
import { configureSurfaceHandlers, createBridgeEnvAccessor, createMultiWorkerEnvAccessor } from './simple-context-env'
import { resolveHandlerPaths } from './simple-context-handlers'
import { createDisposeContext, resolveTestContextConfig } from './simple-context-lifecycle'
import { bootTestRuntime } from './simple-context-runtime'
import { decodeTransportValue, loadTransportDecoders, type TransportDecoderMap } from './simple-context-transport'
import { applyMultiWorkerConfig } from './simple-context-multi-worker'
import { buildInlineBridgeMfConfig } from './simple-context-mfconfig'
import { seedMiniflareLocalSecrets } from '../secrets/local-secrets'

// Handler helper configuration
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
	const { configDir, config } = await resolveTestContextConfig(configPath)

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

	const usesMultiWorker = Boolean(hasMultiWorkerServices || hasMultiWorkerDOs)
	const runtime = await bootTestRuntime(mfConfig, usesMultiWorker)
	await seedMiniflareLocalSecrets(runtime.miniflare, config, configDir)
	const activePort = runtime.activePort
	state.miniflare = runtime.miniflare
	state.miniflareBindings = runtime.miniflareBindings
	state.client = runtime.client

	const disposeContext = createDisposeContext(state)

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

	configureSurfaceHandlers({
		handlerPaths,
		configDir,
		activePort,
		getEnv: getTestEnv
	})

	if (usesMultiWorker) {
		setBindingHints(hints)
		__setTestContext(createMultiWorkerEnvAccessor(state), disposeContext)
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

	__setTestContext(
		createBridgeEnvAccessor(state, hints, shouldPreferBridgeBinding),
		disposeContext
	)
}

/**
 * Test environment interface - extend this in your project's env.d.ts
 */
export interface TestEnv {
	dispose(): Promise<void>
}

/**
 * Base environment type — alias for the global `DevflareEnv` interface that
 * users augment via their project's `env.d.ts`. Re-exported from
 * `devflare/test` so consumers can write `const e: DevflareEnv = ...` against
 * their own augmented bindings without importing from a different module than
 * the rest of the test API.
 */
export type DevflareEnv = globalThis.DevflareEnv

export { env } from '../env'
