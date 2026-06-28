// =============================================================================
// Test context — runtime boot phase
// =============================================================================
// Selects between the multi-worker Miniflare path and the bridge-backed path
// and returns the assembled runtime handles. Extracted from
// `createTestContext()` so the main function reads as a sequence of
// well-named lifecycle steps (assemble config → boot runtime → wire env).
// =============================================================================

import type { BridgeClient } from '../bridge/client'
import { wrapEnvSendEmailBindings } from '../utils/send-email'
import { getAvailablePort } from './simple-context-paths'
import { startBridgeBackedTestContext } from './simple-context-startup'

export interface BootedTestRuntime {
	activePort: number
	miniflare: any
	miniflareBindings: Record<string, unknown>
	/** Only present in the bridge-backed path. */
	client: BridgeClient | null
}

/**
 * Boot the Miniflare runtime that backs `createTestContext()`.
 *
 * Two paths:
 * - **multi-worker**: when the caller has cross-worker DOs or service
 *   bindings, spin up Miniflare directly on a free port. No bridge client.
 * - **bridge-backed**: otherwise, defer to `startBridgeBackedTestContext()`,
 *   which also returns a connected `BridgeClient`.
 */
export async function bootTestRuntime(
	mfConfig: any,
	usesMultiWorker: boolean
): Promise<BootedTestRuntime> {
	if (usesMultiWorker) {
		const { Miniflare } = await import('miniflare')
		const activePort = await getAvailablePort()
		const miniflare = new Miniflare({
			...mfConfig,
			port: activePort
		})
		await miniflare.ready
		const miniflareBindings = wrapEnvSendEmailBindings(await miniflare.getBindings())
		return { activePort, miniflare, miniflareBindings, client: null }
	}

	const started = await startBridgeBackedTestContext(mfConfig)
	return {
		activePort: started.port,
		miniflare: started.miniflare,
		miniflareBindings: started.miniflareBindings,
		client: started.client
	}
}
