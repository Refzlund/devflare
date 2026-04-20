// =============================================================================
// Test Context — Config resolution + dispose helpers
// =============================================================================
// Pure helpers extracted from createTestContext():
//   - resolveTestContextConfig: locate and load the devflare.config.* file
//   - createDisposeContext: build the dispose() function that tears down
//     bridge client + miniflare + per-handler state
// =============================================================================

import { dirname, resolve } from 'path'
import { loadConfig } from '../config'
import type { DevflareConfig } from '../config'
import type { BridgeClient } from '../bridge/client'
import { __clearTestContext } from '../env'
import { findNearestConfig, getCallerDirectory } from './simple-context-paths'
import { resetEmailState } from './email'
import { resetQueueState } from './queue'
import { resetScheduledState } from './scheduled'
import { resetTailState } from './tail'
import { resetWorkerState } from './worker'

interface DisposeStateView {
	client: BridgeClient | null
	miniflare: any
	envProxy: Record<string, unknown> | null
	transportDecode: unknown
	remoteBindings: Record<string, unknown> | null
	miniflareBindings: Record<string, unknown> | null
}

export interface ResolvedTestContextConfig {
	absolutePath: string
	configDir: string
	config: DevflareConfig
}

/**
 * Resolve and load the devflare config for the test context.
 *
 * If `configPath` is given, it is interpreted relative to the caller's
 * directory (the file that invoked `createTestContext()`). Otherwise the
 * resolver walks upward from the caller's directory looking for a supported
 * `devflare.config.*` file.
 */
export async function resolveTestContextConfig(
	configPath: string | undefined,
	callerDir: string = getCallerDirectory()
): Promise<ResolvedTestContextConfig> {
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

	return { absolutePath, configDir, config }
}

/**
 * Build the dispose() function that tears down a test context. Disconnects
 * the bridge client, disposes Miniflare, clears per-handler global state,
 * and clears the registered test-context env accessor.
 */
export function createDisposeContext(state: DisposeStateView): () => Promise<void> {
	return async () => {
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
}
