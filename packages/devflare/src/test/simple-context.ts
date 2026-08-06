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

import type { BridgeClient } from '../bridge/client'
import { type BindingHints, createEnvProxy, setBindingHints } from '../bridge/proxy'
import { createHostEmailDeliverySink } from '../email/host-sink'
import { resolveEmailRuntime } from '../email/runtime-config'
import { __setTestContext } from '../env'
import { setEmailDeliverySink } from '../utils/email-delivery'
import { extractBindingHints } from './binding-hints'
import {
	hasCrossWorkerDOs,
	hasServiceBindings,
	resolveDOBindings,
	resolveServiceBindings
} from './resolve-service-bindings'
import { buildRemoteAndStaticBindings } from './simple-context-bindings'
import { buildDurableObjectGateway } from './simple-context-durable-objects'
import {
	configureSurfaceHandlers,
	createBridgeEnvAccessor,
	createMultiWorkerEnvAccessor
} from './simple-context-env'
import { resolveHandlerPaths } from './simple-context-handlers'
import { createDisposeContext, resolveTestContextConfig } from './simple-context-lifecycle'
import { buildInlineBridgeMfConfig } from './simple-context-mfconfig'
import { applyMultiWorkerConfig } from './simple-context-multi-worker'
import { resolveTransportFile } from './simple-context-paths'
import { bootTestRuntime } from './simple-context-runtime'
import {
	type TransportDecoderMap,
	decodeTransportValue,
	loadTransportDecoders
} from './simple-context-transport'

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

	// Settle email behaviour before any binding exists. `capture` is the default
	// and is never inferred from credentials, so a suite that happens to run on a
	// machine holding SMTP settings still cannot transmit anything.
	const emailRuntime = resolveEmailRuntime(config.email, process.env)
	setEmailDeliverySink(createHostEmailDeliverySink(() => emailRuntime))

	state.remoteBindings = buildRemoteAndStaticBindings(config, { emailMode: emailRuntime.mode })

	const hints = extractBindingHints(config)

	const decodeTransport = (value: unknown): unknown =>
		decodeTransportValue(state.transportDecode, value)

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

	const mfConfig: any = buildInlineBridgeMfConfig(config, { cwd: configDir })

	// Local R2 presign: hand the gateway a per-boot HMAC secret so app code
	// under test can mint presigned URLs against this instance. The origin is
	// only known after boot and is overlaid onto the test env further down.
	const r2PresignSecret = config.bindings?.r2
		? `${crypto.randomUUID()}${crypto.randomUUID()}`
		: null
	if (r2PresignSecret) {
		mfConfig.bindings = {
			...mfConfig.bindings,
			DEVFLARE_R2_PRESIGN_SECRET: r2PresignSecret
		}
	}

	const transportFile = resolveTransportFile(configDir, config.files?.transport)

	if (transportFile) {
		state.transportDecode = await loadTransportDecoders(configDir, transportFile)
	}

	const gateway = await buildDurableObjectGateway(config, configDir, transportFile)
	mfConfig.script = gateway.script
	if (gateway.durableObjects) {
		mfConfig.durableObjects = gateway.durableObjects
	}

	const hasMultiWorkerServices =
		serviceBindingResolution && serviceBindingResolution.workers.length > 0
	const hasMultiWorkerDOs = doBindingResolution && doBindingResolution.workers.length > 0

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		applyMultiWorkerConfig(mfConfig, config, serviceBindingResolution, doBindingResolution)
	}

	const usesMultiWorker = Boolean(hasMultiWorkerServices || hasMultiWorkerDOs)
	const runtime = await bootTestRuntime(mfConfig, usesMultiWorker)
	const activePort = runtime.activePort
	state.miniflare = runtime.miniflare
	state.miniflareBindings = runtime.miniflareBindings
	state.client = runtime.client

	if (r2PresignSecret && state.miniflareBindings) {
		state.miniflareBindings.DEVFLARE_R2_PRESIGN_SECRET = r2PresignSecret
		state.miniflareBindings.DEVFLARE_R2_PRESIGN_ORIGIN = `http://127.0.0.1:${activePort}`
	}

	const disposeContext = createDisposeContext(state)

	const getTestEnv = (): Record<string, unknown> => {
		return new Proxy(
			{},
			{
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
						(state.remoteBindings && prop in state.remoteBindings) ||
							(state.miniflareBindings && prop in state.miniflareBindings) ||
							(state.envProxy && prop in state.envProxy)
					)
				}
			}
		) as Record<string, unknown>
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

	__setTestContext(createBridgeEnvAccessor(state, hints, shouldPreferBridgeBinding), disposeContext)
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
