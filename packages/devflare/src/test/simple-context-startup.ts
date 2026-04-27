// =============================================================================
// Bridge-backed test context startup
// =============================================================================
// Self-contained retry helpers for spinning up a Miniflare instance and a
// BridgeClient against a randomly assigned port. Extracted from
// simple-context.ts to keep the main createTestContext flow readable.
// =============================================================================

import { BridgeClient } from '../bridge/client'
import { wrapEnvSendEmailBindings } from '../utils/send-email'
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
	return message.includes('websocket connection failed')
		|| message.includes('connection timeout: ws://')
		|| message.includes('econnrefused')
		|| message.includes('eaddrinuse')
		|| message.includes('address already in use')
}

async function waitForTestContextStartupRetry(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, TEST_CONTEXT_STARTUP_RETRY_DELAY_MS))
}

async function waitForBridgeClientRetry(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, TEST_CONTEXT_BRIDGE_CONNECT_RETRY_DELAY_MS))
}

export async function connectBridgeClientWithRetry(url: string): Promise<BridgeClient> {
	let lastError: unknown

	for (let attempt = 1;attempt <= TEST_CONTEXT_BRIDGE_CONNECT_RETRY_ATTEMPTS;attempt++) {
		const client = new BridgeClient({ url })

		try {
			await client.connect()
			return client
		} catch (error) {
			lastError = error
			client.disconnect()

			if (
				attempt >= TEST_CONTEXT_BRIDGE_CONNECT_RETRY_ATTEMPTS
				|| !isRetriableTestContextStartupError(error)
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

function expandLocalSecretWorkers(mfConfig: any): any {
	const auxiliaryWorkers = mfConfig.__devflareLocalSecretWorkers
	if (!Array.isArray(auxiliaryWorkers) || auxiliaryWorkers.length === 0) {
		return mfConfig
	}

	const {
		__devflareLocalSecretWorkers,
		port,
		host,
		log,
		kvPersist,
		r2Persist,
		d1Persist,
		durableObjectsPersist,
		workflowsPersist,
		imagesPersist,
		...primaryWorker
	} = mfConfig
	const primaryWorkerName = typeof primaryWorker.name === 'string'
		? primaryWorker.name
		: 'primary'

	return {
		...(port !== undefined && { port }),
		...(host && { host }),
		...(log && { log }),
		...(kvPersist && { kvPersist }),
		...(r2Persist && { r2Persist }),
		...(d1Persist && { d1Persist }),
		...(durableObjectsPersist && { durableObjectsPersist }),
		...(workflowsPersist && { workflowsPersist }),
		...(imagesPersist && { imagesPersist }),
		workers: [
			{
				...primaryWorker,
				name: primaryWorkerName
			},
			...auxiliaryWorkers
		]
	}
}

export async function startBridgeBackedTestContext(mfConfig: any): Promise<StartedBridgeBackedTestContext> {
	const { Miniflare } = await import('miniflare')

	for (let attempt = 1;attempt <= TEST_CONTEXT_STARTUP_RETRY_ATTEMPTS;attempt++) {
		const port = await getAvailablePort()
		let miniflare: any = null
		let client: BridgeClient | null = null

		try {
			miniflare = new Miniflare(expandLocalSecretWorkers({
				...mfConfig,
				port
			}))
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

			if (attempt >= TEST_CONTEXT_STARTUP_RETRY_ATTEMPTS || !isRetriableTestContextStartupError(error)) {
				throw error
			}

			await waitForTestContextStartupRetry()
		}
	}

	throw new Error('Bridge-backed test context startup exhausted all retry attempts.')
}
