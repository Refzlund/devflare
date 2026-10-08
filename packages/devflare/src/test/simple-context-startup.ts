// =============================================================================
// Bridge-backed test context startup
// =============================================================================
// Self-contained retry helpers for spinning up a Miniflare instance and a
// BridgeClient against a randomly assigned port. Extracted from
// simple-context.ts to keep the main createTestContext flow readable.
// =============================================================================

import { BridgeClient } from '../bridge/client'
import {
	type SharedOptionsRuntime,
	splitSharedOptions,
	toMiniflareOptions
} from '../utils/miniflare-options'
import { wrapEnvSendEmailBindings } from '../utils/send-email'
import { addR2PresignOriginVar } from './simple-context-mfconfig'
import { getAvailablePort } from './simple-context-paths'

const TEST_CONTEXT_STARTUP_RETRY_ATTEMPTS = 3
const TEST_CONTEXT_STARTUP_RETRY_DELAY_MS = 75
const TEST_CONTEXT_BRIDGE_CONNECT_RETRY_ATTEMPTS = 8
const TEST_CONTEXT_BRIDGE_CONNECT_RETRY_DELAY_MS = 150

export interface StartedBridgeBackedTestContext {
	port: number
	client: BridgeClient
	miniflare: any
	miniflareBindings: Record<string, unknown>
}

export function isRetriableTestContextStartupError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false
	}

	const message = error.message.toLowerCase()
	return (
		message.includes('websocket connection failed') ||
		message.includes('connection timeout: ws://') ||
		message.includes('econnrefused') ||
		message.includes('eaddrinuse') ||
		message.includes('address already in use')
	)
}

async function waitForTestContextStartupRetry(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, TEST_CONTEXT_STARTUP_RETRY_DELAY_MS))
}

async function waitForBridgeClientRetry(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, TEST_CONTEXT_BRIDGE_CONNECT_RETRY_DELAY_MS))
}

export async function connectBridgeClientWithRetry(url: string): Promise<BridgeClient> {
	let lastError: unknown

	for (let attempt = 1; attempt <= TEST_CONTEXT_BRIDGE_CONNECT_RETRY_ATTEMPTS; attempt++) {
		const client = new BridgeClient({ url })

		try {
			await client.connect()
			return client
		} catch (error) {
			lastError = error
			client.disconnect()

			if (
				attempt >= TEST_CONTEXT_BRIDGE_CONNECT_RETRY_ATTEMPTS ||
				!isRetriableTestContextStartupError(error)
			) {
				throw error
			}

			await waitForBridgeClientRetry()
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error('Bridge-backed test context could not connect to the WebSocket gateway.')
}

/**
 * @description Turns a single-worker test config that carries devflare's local
 * shim workers into a multi-worker one: Miniflare-wide options stay at the top
 * level, every other option moves onto the primary worker.
 * @param mfConfig - the single-worker config, possibly carrying shim workers
 * @param runtime - the loaded `miniflare` module, whose schema names the
 *   Miniflare-wide options
 * @returns the config unchanged when there are no shim workers, else the
 *   multi-worker form
 */
function expandLocalBindingWorkers(mfConfig: any, runtime: SharedOptionsRuntime): any {
	const { __devflareLocalSecretWorkers, __devflareLocalBindingWorkers, ...singleWorkerOptions } =
		mfConfig
	const auxiliaryWorkers = [
		...(__devflareLocalSecretWorkers ?? []),
		...(__devflareLocalBindingWorkers ?? [])
	]
	if (auxiliaryWorkers.length === 0) {
		return singleWorkerOptions
	}

	const { shared, worker } = splitSharedOptions(runtime, singleWorkerOptions)
	return {
		...shared,
		workers: [
			{ ...worker, name: typeof worker.name === 'string' ? worker.name : 'primary' },
			...auxiliaryWorkers
		]
	}
}

export async function startBridgeBackedTestContext(
	mfConfig: any
): Promise<StartedBridgeBackedTestContext> {
	const miniflareModule = await import('miniflare')

	for (let attempt = 1; attempt <= TEST_CONTEXT_STARTUP_RETRY_ATTEMPTS; attempt++) {
		const port = await getAvailablePort()
		let miniflare: any = null
		let client: BridgeClient | null = null

		try {
			const attemptConfig: any = { ...mfConfig, port }
			const bindingsWithOrigin = addR2PresignOriginVar(attemptConfig.bindings, port)
			if (bindingsWithOrigin) {
				attemptConfig.bindings = bindingsWithOrigin
			}

			miniflare = new miniflareModule.Miniflare(
				await toMiniflareOptions(
					miniflareModule,
					expandLocalBindingWorkers(attemptConfig, miniflareModule)
				)
			)
			await miniflare.ready

			const miniflareBindings = wrapEnvSendEmailBindings(await miniflare.getBindings())
			client = await connectBridgeClientWithRetry(`ws://localhost:${port}`)

			return {
				port,
				client,
				miniflare,
				miniflareBindings
			}
		} catch (error) {
			client?.disconnect()

			if (miniflare) {
				try {
					await miniflare.dispose()
				} catch {
					// Ignore cleanup failures while retrying test context startup.
				}
			}

			if (
				attempt >= TEST_CONTEXT_STARTUP_RETRY_ATTEMPTS ||
				!isRetriableTestContextStartupError(error)
			) {
				throw error
			}

			await waitForTestContextStartupRetry()
		}
	}

	throw new Error('Bridge-backed test context startup exhausted all retry attempts.')
}
