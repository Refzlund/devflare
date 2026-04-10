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

import { resolve, dirname, join, relative } from 'path'
import { existsSync } from 'fs'
import {
	getLocalD1DatabaseIdentifier,
	loadConfig,
	normalizeDOBinding,
	resolveConfigPath,
	type DurableObjectBinding
} from '../config'
import { BridgeClient } from '../bridge/client'
import { createEnvProxy, setBindingHints, type BindingHints } from '../bridge/proxy'
import { isRemoteModeActive } from '../cloudflare/remote-config'
import { createRemoteAI } from './remote-ai'
import { createRemoteVectorize } from './remote-vectorize'
import { hasServiceBindings, resolveServiceBindings, hasCrossWorkerDOs, resolveDOBindings } from './resolve-service-bindings'
import { __setTestContext, __clearTestContext } from '../env'
import { findFiles, DEFAULT_DO_PATTERN } from '../utils/glob'
import { createLocalSendEmailBinding, wrapEnvSendEmailBindings } from '../utils/send-email'
import { discoverRoutes } from '../worker-entry/routes'

// Handler helper configuration
import { configureQueue, resetQueueState } from './queue'
import { configureScheduled, resetScheduledState } from './scheduled'
import { configureWorker, resetWorkerState } from './worker'
import { configureTail, resetTailState } from './tail'
import { configureEmail, resetEmailState } from './email'

/**
 * Find all exported class names in a TypeScript/JavaScript file
 * Matches: export class ClassName { ... }
 * Also handles: extends, implements, generics
 */
function findExportedClasses(code: string): string[] {
	const classes: string[] = []
	const classPattern = /export\s+class\s+(\w+)/g

	let match: RegExpExecArray | null
	while ((match = classPattern.exec(code)) !== null) {
		classes.push(match[1])
	}

	return classes
}

function classSupportsNativeDurableObjectRpc(code: string, className: string): boolean {
	const nativeRpcPattern = new RegExp(`export\\s+class\\s+${className}\\s+extends\\s+DurableObject\\b`)
	return nativeRpcPattern.test(code)
}

function toGeneratedIdentifier(value: string): string {
	const normalized = value.replace(/[^A-Za-z0-9_$]/g, '_')
	return /^[A-Za-z_$]/.test(normalized) ? normalized : `_${normalized}`
}

// -----------------------------------------------------------------------------
// Bun Runtime Detection
// -----------------------------------------------------------------------------

/**
 * Access Bun global via globalThis to avoid shadowing richer @types/bun
 * when available. Returns undefined if not running in Bun.
 */
function getBunRuntime(): {
	main: string
	build: (options: {
		entrypoints: string[]
		target: string
		format: string
		minify: boolean
		external?: string[]
	}) => Promise<{
		success: boolean
		logs: string[]
		outputs: Array<{ path: string; text: () => Promise<string> }>
	}>
} | undefined {
	const g = globalThis as { Bun?: unknown }
	if (typeof g.Bun === 'object' && g.Bun !== null) {
		return g.Bun as ReturnType<typeof getBunRuntime>
	}
	return undefined
}

// -----------------------------------------------------------------------------
// Global State
// -----------------------------------------------------------------------------

let globalClient: BridgeClient | null = null
let globalMiniflare: any = null
let globalEnvProxy: Record<string, unknown> | null = null
let globalTransportDecode: Map<string, (v: unknown) => unknown> | null = null
let globalRemoteBindings: Record<string, unknown> | null = null
let globalMiniflareBindings: Record<string, unknown> | null = null // Direct bindings from Miniflare (for service bindings)

const DEFAULT_TRANSPORT_ENTRY_FILES = [
	'src/transport.ts',
	'src/transport.js',
	'src/transport.mts',
	'src/transport.mjs'
] as const

// -----------------------------------------------------------------------------
// Path Resolution Utilities
// -----------------------------------------------------------------------------

/**
 * Get the directory of the test file.
 * Uses Bun.main for bun test, falls back to stack trace parsing.
 */
function getCallerDirectory(): string {
	// In Bun test, Bun.main points to the test file
	const bun = getBunRuntime()
	if (bun?.main) {
		const mainPath = bun.main
		// Bun.main might be [eval] or similar, check if it's a real file
		if (!mainPath.includes('[') && existsSync(mainPath)) {
			return dirname(mainPath)
		}
	}

	// Fallback: parse stack trace
	const originalPrepare = Error.prepareStackTrace
	Error.prepareStackTrace = (_, stack) => stack
	const err = new Error()
	const stack = err.stack as unknown as NodeJS.CallSite[]
	Error.prepareStackTrace = originalPrepare

	// Find the first call site that's a real file outside this module
	for (const site of stack) {
		const filename = site.getFileName?.()
		if (
			filename &&
			!filename.includes('simple-context') &&
			!filename.includes('node_modules') &&
			!filename.includes('[') &&
			existsSync(filename)
		) {
			return dirname(filename)
		}
	}

	// Fallback to cwd
	return process.cwd()
}

/**
 * Find the nearest supported devflare config by searching upward from startDir
 */
async function findNearestConfig(startDir: string): Promise<string | null> {
	let currentDir = startDir

	while (true) {
		const configPath = await resolveConfigPath(currentDir)
		if (configPath) {
			return configPath
		}

		const parentDir = dirname(currentDir)
		if (parentDir === currentDir) {
			// Reached root
			return null
		}
		currentDir = parentDir
	}
}

function resolveTransportFile(configDir: string, configuredPath: string | null | undefined): string | null {
	if (typeof configuredPath === 'string') {
		return configuredPath
	}

	if (configuredPath === null) {
		return null
	}

	for (const defaultEntry of DEFAULT_TRANSPORT_ENTRY_FILES) {
		if (existsSync(join(configDir, defaultEntry))) {
			return defaultEntry
		}
	}

	return null
}

// -----------------------------------------------------------------------------
// Main API
// -----------------------------------------------------------------------------

/**
 * Create a test context from a devflare config file.
 * This starts Miniflare with the configured bindings and sets up the bridge.
 * 
 * @param configPath - Optional path to config file. If not provided, searches
 *                     upward from the test file for a supported devflare config.
 *                     If provided, path is resolved relative to the test file.
 */
export async function createTestContext(configPath?: string): Promise<void> {
	const callerDir = getCallerDirectory()
	let absolutePath: string

	if (configPath) {
		// Resolve relative to the caller's directory (test file location)
		absolutePath = resolve(callerDir, configPath)
	} else {
		// Auto-find nearest config
		const found = await findNearestConfig(callerDir)
		if (!found) {
			throw new Error(
				`Could not find a devflare config file. Searched upward from: ${callerDir}\n` +
				`Expected one of: devflare.config.ts, devflare.config.mts, devflare.config.js, devflare.config.mjs\n` +
				`Either create a config file or provide an explicit path: createTestContext('./path/to/config.ts')`
			)
		}
		absolutePath = found
	}

	const configDir = dirname(absolutePath)

	const config = await loadConfig({
		cwd: configDir,
		configFile: absolutePath.split(/[/\\]/).pop()
	})

	// Set up remote bindings for AI and Vectorize if remote mode is enabled
	globalRemoteBindings = {}

	if (isRemoteModeActive()) {
		// AI binding
		if (config.bindings?.ai) {
			const aiBindingName = config.bindings.ai.binding || 'AI'
			globalRemoteBindings[aiBindingName] = createRemoteAI(config.accountId)
		}

		// Vectorize bindings
		if (config.bindings?.vectorize) {
			for (const [name, vectorConfig] of Object.entries(config.bindings.vectorize)) {
				globalRemoteBindings[name] = createRemoteVectorize(
					vectorConfig.indexName,
					config.accountId
				)
			}
		}
	}

	// Add vars to remote bindings (they're simple values, not Miniflare bindings)
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

	// Build binding hints
	const hints: BindingHints = {}
	if (config.bindings?.kv) {
		for (const name of Object.keys(config.bindings.kv)) hints[name] = 'kv'
	}
	if (config.bindings?.r2) {
		for (const name of Object.keys(config.bindings.r2)) hints[name] = 'r2'
	}
	if (config.bindings?.d1) {
		for (const name of Object.keys(config.bindings.d1)) hints[name] = 'd1'
	}
	if (config.bindings?.durableObjects) {
		for (const name of Object.keys(config.bindings.durableObjects)) hints[name] = 'do'
	}
	if (config.bindings?.services) {
		for (const name of Object.keys(config.bindings.services)) hints[name] = 'service'
	}
	if (config.bindings?.sendEmail) {
		for (const name of Object.keys(config.bindings.sendEmail)) hints[name] = 'sendEmail'
	}

	// Check if we need multi-worker setup for service bindings or cross-worker DOs
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

	// Build Miniflare config
	// Use a random port in the high range to reduce conflicts in parallel tests
	const randomPort = 10000 + Math.floor(Math.random() * 50000)
	const localWorkerBindings: Record<string, unknown> = config.vars ?? {}
	const mfConfig: any = {
		modules: true,
		port: randomPort
	}

	if (config.bindings?.kv) mfConfig.kvNamespaces = Object.keys(config.bindings.kv)
	if (config.bindings?.r2) mfConfig.r2Buckets = Object.keys(config.bindings.r2)
	if (config.bindings?.d1) {
		mfConfig.d1Databases = Object.fromEntries(
			Object.entries(config.bindings.d1).map(([bindingName, bindingConfig]) => {
				return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
			})
		)
	}

	// Queue producer bindings
	// Miniflare uses queueProducers: { BINDING_NAME: { queueName: 'queue-name' } }
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

	// Resolve transport path from files.transport config or the conventional src/transport.* entry
	const transportFile = resolveTransportFile(configDir, config.files?.transport)

	// Load transport decoders for CLIENT-SIDE decoding (Node.js side)
	// This runs in the test process to decode RPC responses from Miniflare
	if (transportFile) {
		const transportPath = join(configDir, transportFile)
		const transportModule = await import(transportPath)

		// Validate transport export format
		if (!transportModule.transport) {
			console.warn(
				`[devflare] Warning: Transport file "${transportFile}" does not export a named "transport" object.\n` +
				`Expected: export const transport = { ... }\n` +
				`Transport encoding/decoding will be disabled.`
			)
		} else {
			globalTransportDecode = new Map()
			for (const [typeName, transporter] of Object.entries(transportModule.transport)) {
				const t = transporter as { encode: (v: unknown) => unknown; decode: (v: unknown) => unknown }
				globalTransportDecode.set(typeName, t.decode)
			}
		}
	}

	// Bundle DO classes + transport for SERVER-SIDE encoding (Miniflare/workerd side)
	// This is bundled into the gateway script that runs inside Miniflare
	// Note: Transport is loaded twice intentionally - once for client decode, once for server encode
	if (config.bindings?.durableObjects) {
		const doConfig: Record<string, string> = {}
		const doInfos: Array<{
			name: string
			className: string
			scriptPath: string
			nativeRpc: boolean
			runtimeClassName: string
		}> = []

		// Build className -> filePath map from files.durableObjects pattern
		// This allows simplified syntax like: SESSION: 'SessionStore'
		// Note: We find all exported classes, not just those extending DurableObject,
		// because the test context wraps plain classes with RPC handling
		const classToFilePath = new Map<string, { filePath: string; nativeRpc: boolean }>()
		const doPatternConfig = config.files?.durableObjects
		const doPattern = typeof doPatternConfig === 'string' ? doPatternConfig : DEFAULT_DO_PATTERN

		if (doPatternConfig !== false) {
			const fs = await import('fs/promises')
			const doFiles = await findFiles(doPattern, { cwd: configDir })

			for (const filePath of doFiles) {
				try {
					const code = await fs.readFile(filePath, 'utf-8')
					const classNames = findExportedClasses(code)

					for (const className of classNames) {
						classToFilePath.set(className, {
							filePath,
							nativeRpc: classSupportsNativeDurableObjectRpc(code, className)
						})
					}
				} catch {
					// Skip files that can't be read
				}
			}
		}

		for (const [name, rawDoInfo] of Object.entries(config.bindings.durableObjects)) {
			const doInfo = normalizeDOBinding(rawDoInfo)

			// Skip cross-worker DOs (those with __ref) — they're handled by multi-worker setup
			if (doInfo.__ref) {
				continue
			}

			// Resolve script path for local DOs
			let scriptPath: string
			let nativeRpc = false

			if (doInfo.scriptName) {
				// Explicit scriptName provided (e.g., 'do.counter.ts')
				scriptPath = join(configDir, 'src', doInfo.scriptName)
				try {
					const code = await (await import('fs/promises')).readFile(scriptPath, 'utf-8')
					nativeRpc = classSupportsNativeDurableObjectRpc(code, doInfo.className)
				} catch {
					nativeRpc = false
				}
			} else {
				// Look up from discovered DO classes
				const discoveredClass = classToFilePath.get(doInfo.className)
				if (!discoveredClass) {
					throw new Error(
						`Durable object ${name} (className: '${doInfo.className}') not found.\n` +
						`Either:\n` +
						`  1. Set files.durableObjects pattern in config (e.g., 'src/do.*.ts')\n` +
						`  2. Use explicit scriptName: { className: '${doInfo.className}', scriptName: 'do.file.ts' }`
					)
				}
				scriptPath = discoveredClass.filePath
				nativeRpc = discoveredClass.nativeRpc
			}

			const runtimeClassName = nativeRpc
				? doInfo.className
				: `__Devflare${toGeneratedIdentifier(name)}RpcWrapper`

			doConfig[name] = runtimeClassName
			doInfos.push({
				name,
				className: doInfo.className,
				scriptPath,
				nativeRpc,
				runtimeClassName
			})
		}

		const wrapperCode = doInfos
			.filter((info) => !info.nativeRpc)
			.map((info) => `
export class ${info.runtimeClassName} {
	constructor(state, env) {
		this.__instance = new ${info.className}(state, env)
	}

	async fetch(request) {
		const url = new URL(request.url)
		if (request.method !== 'POST' || url.pathname !== '/_rpc') {
			return new Response('Not found', { status: 404 })
		}

		try {
			const payload = await request.json()
			const method = payload?.method
			const params = Array.isArray(payload?.params) ? payload.params : []
			const target = this.__instance?.[method]

			if (typeof target !== 'function') {
				return new Response(JSON.stringify({
					ok: false,
					error: { message: 'Method not found: ' + String(method) }
				}), {
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			let result = await target.apply(this.__instance, params)
			result = __encodeTransport(result)

			return new Response(JSON.stringify({ ok: true, result }), {
				headers: { 'Content-Type': 'application/json' }
			})
		} catch (error) {
			return new Response(JSON.stringify({
				ok: false,
				error: { message: error instanceof Error ? error.message : String(error) }
			}), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}
}`.trim())
			.join('\n\n')

		// Create a virtual entrypoint that imports transport + all DOs
		// This ensures Bun deduplicates shared imports (like DoubleableNumber)
		const virtualImports: string[] = []
		const virtualExports: string[] = []

		if (transportFile) {
			const transportPath = join(configDir, transportFile)
			virtualImports.push(`import { transport } from '${transportPath.replace(/\\/g, '/')}'`)
			virtualExports.push('export { transport }')
		}

		for (const info of doInfos) {
			virtualImports.push(`import { ${info.className} } from '${info.scriptPath.replace(/\\/g, '/')}'`)
			virtualExports.push(`export { ${info.className} }`)
		}

		// Only bundle if there are local DOs or transport to include
		// When there are only cross-worker DOs (via ref()), skip bundling
		// because bundling an empty file produces an unwanted default export
		let bundledCode = ''

		if (virtualImports.length > 0) {
			const virtualEntry = [...virtualImports, '', ...virtualExports].join('\n')
			const virtualPath = join(configDir, '.devflare', '__test_entry.ts')

			// Write the virtual entrypoint
			const { writeFileSync, mkdirSync } = await import('fs')
			mkdirSync(dirname(virtualPath), { recursive: true })
			writeFileSync(virtualPath, virtualEntry)

			// Bundle the single entrypoint - requires Bun runtime
			const bun = getBunRuntime()
			if (!bun) {
				throw new Error('Bun runtime is required for createTestContext with Durable Objects')
			}

			const result = await bun.build({
				entrypoints: [virtualPath],
				target: 'browser',
				format: 'esm',
				minify: false,
				// Mark cloudflare modules as external - Miniflare provides them
				external: ['cloudflare:workers', 'cloudflare:*']
			})

			if (!result.success) {
				throw new Error(`Failed to bundle test entry: ${result.logs.join('\n')}`)
			}

			bundledCode = await result.outputs[0].text()
		}

		mfConfig.durableObjects = doConfig
		mfConfig.script = buildGatewayScript(bundledCode, wrapperCode)
	} else {
		mfConfig.script = buildGatewayScript('', '')
	}

	// Check if we need multi-worker setup (for service bindings or cross-worker DOs)
	const hasMultiWorkerServices = serviceBindingResolution && serviceBindingResolution.workers.length > 0
	const hasMultiWorkerDOs = doBindingResolution && doBindingResolution.workers.length > 0

	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		// Add cross-worker DO bindings to primary worker's durableObjects
		const primaryDurableObjects = {
			...(mfConfig.durableObjects || {}),
			...(doBindingResolution?.crossWorkerDOBindings || {})
		}

		// Convert to multi-worker config using workers array
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

		// Merge workers from service bindings and cross-worker DOs
		const additionalWorkers = [
			...(serviceBindingResolution?.workers || []),
			...(doBindingResolution?.workers || [])
		]

		// Dedupe by name (in case a worker hosts both entrypoints and DOs)
		const workersByName = new Map<string, typeof additionalWorkers[0]>()
		for (const worker of additionalWorkers) {
			if (!workersByName.has(worker.name)) {
				workersByName.set(worker.name, worker)
			} else {
				// Merge durableObjects if same worker appears twice
				const existing = workersByName.get(worker.name)!
				if (worker.durableObjects) {
					existing.durableObjects = {
						...(existing.durableObjects || {}),
						...worker.durableObjects
					}
				}
			}
		}

		const workers = [primaryWorker, ...workersByName.values()]

		// Replace single-worker config with multi-worker config
		delete mfConfig.script
		delete mfConfig.modules
		delete mfConfig.kvNamespaces
		delete mfConfig.r2Buckets
		delete mfConfig.d1Databases
		delete mfConfig.durableObjects
		mfConfig.workers = workers
	}

	// Start Miniflare
	const { Miniflare } = await import('miniflare')
	globalMiniflare = new Miniflare(mfConfig)
	await globalMiniflare.ready

	// Always get direct Miniflare bindings for cf.* helpers
	// These helpers call handlers directly, so they need real bindings, not proxy
	globalMiniflareBindings = wrapEnvSendEmailBindings(await globalMiniflare.getBindings())

	// Create the dispose function
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

		// Reset all handler helpers
		resetQueueState()
		resetScheduledState()
		resetWorkerState()
		resetTailState()
		resetEmailState()

		__clearTestContext()
	}

	// Helper to get the test env (used by cf.* helpers)
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
					(globalRemoteBindings && prop in globalRemoteBindings) ||
					(globalMiniflareBindings && prop in globalMiniflareBindings) ||
					(globalEnvProxy && prop in globalEnvProxy)
				)
			}
		}) as Record<string, unknown>
	}

	// Configure handler helpers with paths and env getter
	// Note: config.files.* can be string | false | undefined
	// - string: explicit path to handler
	// - false: explicitly disabled (pass null)
	// - undefined: use default path (convention-over-configuration)
	const queuePath = config.files?.queue
	const scheduledPath = config.files?.scheduled
	const fetchPath = config.files?.fetch
	const emailPath = config.files?.email

	// Default handler paths (convention-over-configuration)
	const DEFAULT_FETCH_PATH = 'src/fetch.ts'
	const DEFAULT_QUEUE_PATH = 'src/queue.ts'
	const DEFAULT_SCHEDULED_PATH = 'src/scheduled.ts'
	const DEFAULT_EMAIL_PATH = 'src/email.ts'
	const DEFAULT_TAIL_PATH = 'src/tail.ts'

	// Resolve handler path: explicit path > default path (if file exists) > null
	const resolvePath = async (configValue: string | false | undefined, defaultPath: string): Promise<string | null> => {
		if (typeof configValue === 'string') return configValue
		if (configValue === false) return null
		// Check if default exists
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

	// If we have multi-worker setup (service bindings or cross-worker DOs),
	// get bindings directly from Miniflare (not through bridge)
	if (hasMultiWorkerServices || hasMultiWorkerDOs) {
		// globalMiniflareBindings already set above
		setBindingHints(hints)

		// Create combined env accessor for unified env
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
					(globalRemoteBindings && prop in globalRemoteBindings) ||
					(globalMiniflareBindings && prop in globalMiniflareBindings)
				)
			}
		})

		// Wire into the unified env from 'devflare'
		__setTestContext(envAccessor, disposeContext)
		return
	}

	// Connect bridge with custom decoder (only for DO-based setups)
	globalClient = new BridgeClient({
		url: `ws://localhost:${randomPort}`
	})
	await globalClient.connect()

	setBindingHints(hints)
	globalEnvProxy = createEnvProxy({
		client: globalClient,
		transformResult: (result: unknown) => decodeTransport(result)
	})

	// Create combined env accessor for unified env
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
				(globalRemoteBindings && prop in globalRemoteBindings) ||
				(globalMiniflareBindings && prop in globalMiniflareBindings) ||
				(globalEnvProxy !== null)
			)
		}
	})

	// Wire into the unified env from 'devflare'
	__setTestContext(envAccessor, disposeContext)
}

/**
 * Decode transport types on client side
 */
function decodeTransport(value: unknown): unknown {
	if (!globalTransportDecode || value === null || typeof value !== 'object') {
		return value
	}

	// Check if it's an encoded transport value
	if ('__transport' in (value as Record<string, unknown>)) {
		const encoded = value as { __transport: string; value: unknown }
		const decoder = globalTransportDecode.get(encoded.__transport)
		if (decoder) {
			return decoder(encoded.value)
		}
	}

	// Recursively decode arrays and objects
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
 * The generated env.d.ts declares `interface Env { ... }` in global scope
 */
export interface TestEnv {
	dispose(): Promise<void>
}

/**
 * Base environment type - augmented by user's env.d.ts via module augmentation.
 * Projects should run `devflare types` to generate env.d.ts which extends
 * this interface with proper binding types.
 * 
 * @example Generated env.d.ts:
 * ```ts
 * declare global {
 *   interface DevflareEnv {
 *     COUNTER: DurableObjectNamespace
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DevflareEnv { }

/**
 * @deprecated Use `import { env } from 'devflare'` instead.
 * This export is kept for backwards compatibility.
 * 
 * The unified env from 'devflare' works everywhere:
 * - Inside request handlers (uses request context)
 * - In tests (after createTestContext())
 * - In dev mode scripts (uses bridge)
 */
export { env } from '../env'

// -----------------------------------------------------------------------------
// Build gateway script with bundled DO classes
// -----------------------------------------------------------------------------

function buildGatewayScript(bundledCode: string, wrappers: string): string {
	// bundledCode: single bundle containing transport + DO classes
	// wrappers: class wrappers that add fetch() handling
	return `
// Bundled transport + DO classes
${bundledCode}

// DO Wrappers with RPC
${wrappers}

// Transport encoding helper
const __transportEncoders = typeof transport !== 'undefined' ? transport : {}

function __encodeTransport(value) {
	if (value === null || value === undefined) return value
	
	// Try each encoder
	for (const [typeName, transporter] of Object.entries(__transportEncoders)) {
		const encoded = transporter.encode(value)
		if (encoded !== false && encoded !== undefined) {
			return { __transport: typeName, value: encoded }
		}
	}
	
	// Recursively encode arrays and objects
	if (Array.isArray(value)) {
		return value.map(__encodeTransport)
	}
	if (typeof value === 'object') {
		const result = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = __encodeTransport(v)
		}
		return result
	}
	
	return value
}

// Gateway with WebSocket RPC
export default {
	async fetch(request, env) {
		if (request.headers.get('Upgrade') === 'websocket') {
			const { 0: client, 1: server } = new WebSocketPair()
			server.accept()
			server.addEventListener('message', async (e) => {
				try {
					const m = JSON.parse(e.data)
					if (m.t === 'rpc.call') {
						const result = await executeRpc(env, m.method, m.params)
						server.send(JSON.stringify({ t: 'rpc.ok', id: m.id, result }))
					}
				} catch (error) {
					server.send(JSON.stringify({ t: 'rpc.err', id: 'unknown', error: { code: 'RPC_ERROR', message: error.message } }))
				}
			})
			return new Response(null, { status: 101, webSocket: client })
		}
		return new Response('Gateway')
	}
}

async function executeRpc(env, method, params) {
	const [bindingName, ...rest] = method.split('.')
	const op = rest.join('.')
	const binding = env[bindingName]
	const RAW_EMAIL = 'EmailMessage::raw'
	if (!binding) throw new Error('Binding not found: ' + bindingName)

	// KV operations
	if (op === 'get') return binding.get(params[0], params[1])
	if (op === 'put') return binding.put(params[0], params[1], params[2])
	if (op === 'delete') return binding.delete(params[0])
	if (op === 'list') return binding.list(params[0])
	if (op === 'getWithMetadata') return binding.getWithMetadata(params[0], params[1])

	// R2 operations
	if (op === 'r2.get') return binding.get(params[0], params[1])
	if (op === 'r2.put') return binding.put(params[0], params[1], params[2])
	if (op === 'r2.delete') return binding.delete(params[0])
	if (op === 'r2.list') return binding.list(params[0])
	if (op === 'head') return binding.head(params[0])

	// D1 operations
	if (op === 'exec') return binding.exec(params[0])
	if (op === 'dump') return binding.dump()
	if (op === 'batch') {
		const stmts = params[0].map(s => {
			const stmt = binding.prepare(s.sql)
			return s.bindings?.length ? stmt.bind(...s.bindings) : stmt
		})
		return binding.batch(stmts)
	}
	if (op === 'prepare.run') return binding.prepare(params[0]).bind(...(params[1] || [])).run()
	if (op === 'prepare.all') return binding.prepare(params[0]).bind(...(params[1] || [])).all()
	if (op === 'prepare.first') return binding.prepare(params[0]).bind(...(params[1] || [])).first(params[2])
	if (op === 'prepare.raw') return binding.prepare(params[0]).bind(...(params[1] || [])).raw({ columnNames: params[2] })

	// Send email operations
	if (op === 'email.send') {
		return binding.send(__normalizeEmailMessage(params[0]))
	}

	// DO operations
	if (op === 'idFromName') {
		return { __type: 'DOId', hex: binding.idFromName(params[0]).toString() }
	}
	if (op === 'stub.rpc') {
		const [, idSerialized, rpcMethod, rpcParams] = params
		const stub = binding.get(binding.idFromString(idSerialized.hex))

		if (typeof stub[rpcMethod] === 'function') {
			// Use native RPC when the Durable Object exposes RPC methods directly.
			let result = await stub[rpcMethod](...(rpcParams || []))
			result = __encodeTransport(result)
			return result
		}

		const response = await stub.fetch(new Request('http://do/_rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: rpcMethod, params: rpcParams || [] })
		}))

		const payload = await response.json()
		if (!response.ok || !payload?.ok) {
			throw new Error(payload?.error?.message || ('DO RPC failed with status ' + response.status))
		}

		return payload.result
	}

	throw new Error('Unknown operation: ' + method)
}

function __createEmailMessageRaw(raw) {
	if (typeof raw === 'string' || raw instanceof ReadableStream) {
		return raw
	}
	if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
		return new Response(raw).body
	}
	throw new Error('Unsupported EmailMessage raw payload')
}

function __buildRawEmail(message) {
	const lines = []
	const messageId = '<' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@devflare.dev>'

	lines.push('From: ' + message.from)
	lines.push('To: ' + (Array.isArray(message.to) ? message.to.join(', ') : message.to))
	lines.push('Date: ' + new Date().toUTCString())
	lines.push('Message-ID: ' + messageId)

	if (message.subject) lines.push('Subject: ' + message.subject)
	if (message.replyTo) lines.push('Reply-To: ' + String(message.replyTo))
	if (message.cc) lines.push('Cc: ' + (Array.isArray(message.cc) ? message.cc.join(', ') : message.cc))
	if (message.bcc) lines.push('Bcc: ' + (Array.isArray(message.bcc) ? message.bcc.join(', ') : message.bcc))

	for (const [key, value] of Object.entries(message.headers || {})) {
		lines.push(key + ': ' + value)
	}

	lines.push('MIME-Version: 1.0')
	lines.push('Content-Type: ' + (message.html ? 'text/html' : 'text/plain') + '; charset=UTF-8')
	lines.push('')
	lines.push(String(message.html ?? message.text ?? '').replace(/\\r?\\n/g, '\\r\\n'))

	return lines.join('\\r\\n')
}

function __normalizeEmailMessage(message) {
	if (!message || typeof message !== 'object' || !('from' in message) || !('to' in message)) {
		return message
	}
	if ('EmailMessage::raw' in message) {
		return message
	}
	if ('raw' in message && message.raw !== undefined) {
		return {
			from: message.from,
			to: message.to,
			[RAW_EMAIL]: __createEmailMessageRaw(message.raw)
		}
	}
	return {
		from: message.from,
		to: message.to,
		[RAW_EMAIL]: __createEmailMessageRaw(__buildRawEmail(message))
	}
}
`
}
