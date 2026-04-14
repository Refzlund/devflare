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

// Handler helper configuration
import { configureEmail, resetEmailState } from './email'
import { configureQueue, resetQueueState } from './queue'
import { configureScheduled, resetScheduledState } from './scheduled'
import { configureTail, resetTailState } from './tail'
import { configureWorker, resetWorkerState } from './worker'

// -----------------------------------------------------------------------------
// Global State
// -----------------------------------------------------------------------------

let globalClient: BridgeClient | null = null
let globalMiniflare: any = null
let globalEnvProxy: Record<string, unknown> | null = null
let globalTransportDecode: Map<string, (v: unknown) => unknown> | null = null
let globalRemoteBindings: Record<string, unknown> | null = null
let globalMiniflareBindings: Record<string, unknown> | null = null

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

	globalRemoteBindings = {}

	if (isRemoteModeActive()) {
		if (config.bindings?.ai) {
			const aiBindingName = config.bindings.ai.binding || 'AI'
			globalRemoteBindings[aiBindingName] = createRemoteAI(config.accountId)
		}

		if (config.bindings?.vectorize) {
			for (const [name, vectorConfig] of Object.entries(config.bindings.vectorize)) {
				globalRemoteBindings[name] = createRemoteVectorize(
					vectorConfig.indexName,
					config.accountId
				)
			}
		}
	}

	if (config.vars) {
		for (const [key, value] of Object.entries(config.vars)) {
			globalRemoteBindings[key] = value
		}
	}

	if (config.bindings?.sendEmail) {
		for (const [name, binding] of Object.entries(config.bindings.sendEmail)) {
			globalRemoteBindings[name] = createLocalSendEmailBinding(binding)
		}
	}

	const hints: BindingHints = {}
	if (config.bindings?.kv) {
		for (const name of Object.keys(config.bindings.kv)) {
			hints[name] = 'kv'
		}
	}
	if (config.bindings?.r2) {
		for (const name of Object.keys(config.bindings.r2)) {
			hints[name] = 'r2'
		}
	}
	if (config.bindings?.d1) {
		for (const name of Object.keys(config.bindings.d1)) {
			hints[name] = 'd1'
		}
	}
	if (config.bindings?.durableObjects) {
		for (const name of Object.keys(config.bindings.durableObjects)) {
			hints[name] = 'do'
		}
	}
	if (config.bindings?.services) {
		for (const name of Object.keys(config.bindings.services)) {
			hints[name] = 'service'
		}
	}
	if (config.bindings?.sendEmail) {
		for (const name of Object.keys(config.bindings.sendEmail)) {
			hints[name] = 'sendEmail'
		}
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

	const randomPort = await getAvailablePort()
	const localWorkerBindings: Record<string, unknown> = config.vars ?? {}
	const mfConfig: any = {
		modules: true,
		port: randomPort
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
			globalTransportDecode = new Map()
			for (const [typeName, transporter] of Object.entries(transportModule.transport)) {
				const t = transporter as { encode: (v: unknown) => unknown; decode: (v: unknown) => unknown }
				globalTransportDecode.set(typeName, t.decode)
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

	const { Miniflare } = await import('miniflare')
	globalMiniflare = new Miniflare(mfConfig)
	await globalMiniflare.ready

	globalMiniflareBindings = wrapEnvSendEmailBindings(await globalMiniflare.getBindings())

	const disposeContext = async () => {
		if (globalClient) {
			await globalClient.disconnect()
			globalClient = null
		}
		if (globalMiniflare) {
			await globalMiniflare.dispose()
			globalMiniflare = null
		}
		globalEnvProxy = null
		globalTransportDecode = null
		globalRemoteBindings = null
		globalMiniflareBindings = null

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
				if (globalRemoteBindings && prop in globalRemoteBindings) {
					return globalRemoteBindings[prop]
				}
				if (hints[prop] === 'sendEmail' && globalEnvProxy && prop in globalEnvProxy) {
					return globalEnvProxy[prop]
				}
				if (globalMiniflareBindings && prop in globalMiniflareBindings) {
					return globalMiniflareBindings[prop]
				}
				if (globalEnvProxy && prop in globalEnvProxy) {
					return globalEnvProxy[prop]
				}
				return undefined
			},
			has(_, prop: string) {
				return Boolean(
					(globalRemoteBindings && prop in globalRemoteBindings)
					|| (globalMiniflareBindings && prop in globalMiniflareBindings)
					|| (globalEnvProxy && prop in globalEnvProxy)
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
		port: randomPort,
		handlerPath: resolvedEmailPath,
		configDir,
		getEnv: getTestEnv
	})

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		setBindingHints(hints)

		const envAccessor: Record<string, unknown> = new Proxy({}, {
			get(_, prop: string) {
				if (globalRemoteBindings && prop in globalRemoteBindings) {
					return globalRemoteBindings[prop]
				}
				if (globalMiniflareBindings && prop in globalMiniflareBindings) {
					return globalMiniflareBindings[prop]
				}
				return undefined
			},
			has(_, prop: string) {
				return Boolean(
					(globalRemoteBindings && prop in globalRemoteBindings)
					|| (globalMiniflareBindings && prop in globalMiniflareBindings)
				)
			}
		})

		__setTestContext(envAccessor, disposeContext)
		return
	}

	globalClient = new BridgeClient({
		url: `ws://localhost:${randomPort}`
	})
	await globalClient.connect()

	setBindingHints(hints)
	globalEnvProxy = createEnvProxy({
		client: globalClient,
		transformResult: (result: unknown) => decodeTransport(result)
	})

	const envAccessor: Record<string, unknown> = new Proxy({}, {
		get(_, prop: string) {
			if (globalRemoteBindings && prop in globalRemoteBindings) {
				return globalRemoteBindings[prop]
			}
			if (hints[prop] && globalEnvProxy && prop in globalEnvProxy) {
				return globalEnvProxy[prop]
			}
			if (globalMiniflareBindings && prop in globalMiniflareBindings) {
				return globalMiniflareBindings[prop]
			}
			if (globalEnvProxy) {
				return globalEnvProxy[prop]
			}
			return undefined
		},
		has(_, prop: string) {
			return Boolean(
				(globalRemoteBindings && prop in globalRemoteBindings)
				|| (globalMiniflareBindings && prop in globalMiniflareBindings)
				|| (globalEnvProxy !== null)
			)
		}
	})

	__setTestContext(envAccessor, disposeContext)
}

/**
 * Decode transport types on client side.
 */
function decodeTransport(value: unknown): unknown {
	if (!globalTransportDecode || value === null || typeof value !== 'object') {
		return value
	}

	if ('__transport' in (value as Record<string, unknown>)) {
		const encoded = value as { __transport: string; value: unknown }
		const decoder = globalTransportDecode.get(encoded.__transport)
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

/**
 * @deprecated Use `import { env } from 'devflare'` instead.
 */
export { env } from '../env'
