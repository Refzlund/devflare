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

import { dirname, join, resolve } from 'path'
import {
	getLocalD1DatabaseIdentifier,
	loadConfig
} from '../config'
import { BridgeClient } from '../bridge/client'
import { createEnvProxy, setBindingHints, type BindingHints } from '../bridge/proxy'
import { isRemoteModeActive } from '../cloudflare/remote-config'
import { __clearTestContext, __setTestContext } from '../env'
import { discoverRoutes } from '../worker-entry/routes'
import { createRemoteAI } from './remote-ai'
import { createRemoteVectorize } from './remote-vectorize'
import { hasCrossWorkerDOs, hasServiceBindings, resolveDOBindings, resolveServiceBindings } from './resolve-service-bindings'
import { buildDurableObjectGateway } from './simple-context-durable-objects'
import { findNearestConfig, getAvailablePort, getCallerDirectory, resolveTransportFile } from './simple-context-paths'
import { createLocalSendEmailBinding, wrapEnvSendEmailBindings } from '../utils/send-email'
import { extractBindingHints } from './binding-hints'
import { startBridgeBackedTestContext } from './simple-context-startup'

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
	transportDecode: Map<string, (v: unknown) => unknown> | null
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

	state.remoteBindings = {}

	if (isRemoteModeActive()) {
		if (config.bindings?.ai) {
			const aiBindingName = config.bindings.ai.binding || 'AI'
			state.remoteBindings[aiBindingName] = createRemoteAI(config.accountId)
		}

		if (config.bindings?.vectorize) {
			for (const [name, vectorConfig] of Object.entries(config.bindings.vectorize)) {
				state.remoteBindings[name] = createRemoteVectorize(
					vectorConfig.indexName,
					config.accountId
				)
			}
		}
	}

	if (config.vars) {
		for (const [key, value] of Object.entries(config.vars)) {
			state.remoteBindings[key] = value
		}
	}

	if (config.bindings?.sendEmail) {
		for (const [name, binding] of Object.entries(config.bindings.sendEmail)) {
			state.remoteBindings[name] = createLocalSendEmailBinding(binding)
		}
	}

	const hints = extractBindingHints(config)

	const decodeTransport = (value: unknown): unknown => {
		if (!state.transportDecode || value === null || typeof value !== 'object') {
			return value
		}

		if ('__transport' in (value as Record<string, unknown>)) {
			const encoded = value as { __transport: string; value: unknown }
			const decoder = state.transportDecode.get(encoded.__transport)
			if (decoder) {
				return decoder(encoded.value)
			}
		}

		if (Array.isArray(value)) {
			return value.map(decodeTransport)
		}

		const result: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = decodeTransport(v)
		}
		return result
	}

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

	const localWorkerBindings: Record<string, unknown> = config.vars ?? {}
	const mfConfig: any = {
		modules: true
	}

	if (config.bindings?.kv) {
		mfConfig.kvNamespaces = Object.keys(config.bindings.kv)
	}
	if (config.bindings?.r2) {
		mfConfig.r2Buckets = Object.keys(config.bindings.r2)
	}
	if (config.bindings?.d1) {
		mfConfig.d1Databases = Object.fromEntries(
			Object.entries(config.bindings.d1).map(([bindingName, bindingConfig]) => {
				return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
			})
		)
	}

	if (config.bindings?.queues?.producers) {
		const queueProducers: Record<string, { queueName: string }> = {}
		for (const [bindingName, queueName] of Object.entries(config.bindings.queues.producers)) {
			queueProducers[bindingName] = { queueName }
		}
		mfConfig.queueProducers = queueProducers
	}

	if (Object.keys(localWorkerBindings).length > 0) {
		mfConfig.bindings = localWorkerBindings
	}

	if (config.bindings?.sendEmail) {
		mfConfig.email = {
			send_email: Object.entries(config.bindings.sendEmail).map(([name, binding]) => ({
				name,
				...(binding.destinationAddress && {
					destination_address: binding.destinationAddress
				}),
				...(binding.allowedDestinationAddresses && {
					allowed_destination_addresses: binding.allowedDestinationAddresses
				}),
				...(binding.allowedSenderAddresses && {
					allowed_sender_addresses: binding.allowedSenderAddresses
				})
			}))
		}
	}

	const transportFile = resolveTransportFile(configDir, config.files?.transport)

	if (transportFile) {
		const transportPath = join(configDir, transportFile)
		const transportModule = await import(transportPath)

		if (!transportModule.transport) {
			console.warn(
				`[devflare] Warning: Transport file "${transportFile}" does not export a named "transport" object.\n`
				+ `Expected: export const transport = { ... }\n`
				+ `Transport encoding/decoding will be disabled.`
			)
		} else {
			state.transportDecode = new Map()
			for (const [typeName, transporter] of Object.entries(transportModule.transport)) {
				const t = transporter as { encode: (v: unknown) => unknown; decode: (v: unknown) => unknown }
				state.transportDecode.set(typeName, t.decode)
			}
		}
	}

	const gateway = await buildDurableObjectGateway(config, configDir, transportFile)
	mfConfig.script = gateway.script
	if (gateway.durableObjects) {
		mfConfig.durableObjects = gateway.durableObjects
	}

	const hasMultiWorkerServices = serviceBindingResolution && serviceBindingResolution.workers.length > 0
	const hasMultiWorkerDOs = doBindingResolution && doBindingResolution.workers.length > 0

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		const primaryDurableObjects = {
			...(mfConfig.durableObjects || {}),
			...(doBindingResolution?.crossWorkerDOBindings || {})
		}

		const primaryWorker: Record<string, unknown> = {
			name: config.name ?? 'primary',
			modules: true,
			script: mfConfig.script,
			compatibilityDate: config.compatibilityDate ?? '2025-01-01',
			...(mfConfig.kvNamespaces && { kvNamespaces: mfConfig.kvNamespaces }),
			...(mfConfig.r2Buckets && { r2Buckets: mfConfig.r2Buckets }),
			...(mfConfig.d1Databases && { d1Databases: mfConfig.d1Databases }),
			...(mfConfig.email && { email: mfConfig.email }),
			...(Object.keys(primaryDurableObjects).length > 0 && { durableObjects: primaryDurableObjects }),
			...(serviceBindingResolution?.primaryServiceBindings && { serviceBindings: serviceBindingResolution.primaryServiceBindings })
		}

		const additionalWorkers = [
			...(serviceBindingResolution?.workers || []),
			...(doBindingResolution?.workers || [])
		]
		const workersByName = new Map<string, typeof additionalWorkers[0]>()

		for (const worker of additionalWorkers) {
			if (!workersByName.has(worker.name)) {
				workersByName.set(worker.name, worker)
				continue
			}

			const existing = workersByName.get(worker.name)!
			if (worker.durableObjects) {
				existing.durableObjects = {
					...(existing.durableObjects || {}),
					...worker.durableObjects
				}
			}
		}

		const workers = [primaryWorker, ...workersByName.values()]
		delete mfConfig.script
		delete mfConfig.modules
		delete mfConfig.kvNamespaces
		delete mfConfig.r2Buckets
		delete mfConfig.d1Databases
		delete mfConfig.durableObjects
		mfConfig.workers = workers
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

	const queuePath = config.files?.queue
	const scheduledPath = config.files?.scheduled
	const fetchPath = config.files?.fetch
	const emailPath = config.files?.email

	const DEFAULT_FETCH_PATH = 'src/fetch.ts'
	const DEFAULT_QUEUE_PATH = 'src/queue.ts'
	const DEFAULT_SCHEDULED_PATH = 'src/scheduled.ts'
	const DEFAULT_EMAIL_PATH = 'src/email.ts'
	const DEFAULT_TAIL_PATH = 'src/tail.ts'

	const resolvePath = async (configValue: string | false | undefined, defaultPath: string): Promise<string | null> => {
		if (typeof configValue === 'string') {
			return configValue
		}
		if (configValue === false) {
			return null
		}

		const defaultAbsolute = join(configDir, defaultPath)
		try {
			const fs = await import('fs/promises')
			await fs.access(defaultAbsolute)
			return defaultPath
		} catch {
			return null
		}
	}

	const [resolvedFetchPath, resolvedQueuePath, resolvedScheduledPath, resolvedEmailPath, resolvedTailPath, resolvedRoutes] = await Promise.all([
		resolvePath(fetchPath, DEFAULT_FETCH_PATH),
		resolvePath(queuePath, DEFAULT_QUEUE_PATH),
		resolvePath(scheduledPath, DEFAULT_SCHEDULED_PATH),
		resolvePath(emailPath, DEFAULT_EMAIL_PATH),
		resolvePath(undefined, DEFAULT_TAIL_PATH),
		discoverRoutes(configDir, config)
	])

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
