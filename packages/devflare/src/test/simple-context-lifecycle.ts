// =============================================================================
// Test Context — Config resolution + dispose helpers
// =============================================================================
// Pure helpers extracted from createTestContext():
//   - resolveTestContextConfig: locate and load the devflare.config.* file
//   - createDisposeContext: build the dispose() function that tears down
//     bridge client + miniflare + per-handler state
// =============================================================================

import { dirname, resolve } from 'path'
import type { BridgeClient } from '../bridge/client'
import { loadConfig, resolveConfigEnvVars } from '../config'
import type { DevflareConfig } from '../config'
import { applyLocalDevVarsToConfig } from '../config/local-dev-vars'
import { __clearTestContext } from '../env'
import { disposeLocalWorkerLoaderBindings } from '../shims/local-worker-loader'
import { stopActiveContainers } from './containers'
import { resetEmailState } from './email'
import { resetQueueState } from './queue'
import { resetScheduledState } from './scheduled'
import { findNearestConfig, getCallerDirectory } from './simple-context-paths'
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
 * Configs already loaded in this process, keyed by their absolute path.
 *
 * Loading one costs ~100ms — evaluating the config module, then resolving env
 * placeholders and `.dev.vars` — and a suite creating a context per test file
 * paid it every time. The config module itself was never actually re-read: the
 * loader evaluates it once per process and hands back that same instance
 * afterwards, rewritten file or not. What the memo additionally holds still is
 * the env / `.dev.vars` overlay, which no longer follows a change made between
 * two contexts. Use {@link __resetTestContextConfigCache} where that matters.
 */
const loadedConfigs = new Map<string, ResolvedTestContextConfig>()

/**
 * Resolve and load the devflare config for the test context.
 *
 * If `configPath` is given, it is interpreted relative to the caller's
 * directory (the file that invoked `createTestContext()`). Otherwise the
 * resolver walks upward from the caller's directory looking for a supported
 * `devflare.config.*` file.
 *
 * The load is memoised per resolved path, so several test files sharing one
 * config in a single process load it once. Different callers reaching the same
 * file share the result; a different file is loaded on its own.
 */
export async function resolveTestContextConfig(
	configPath: string | undefined,
	callerDir: string = getCallerDirectory()
): Promise<ResolvedTestContextConfig> {
	let foundPath: string

	if (configPath) {
		foundPath = resolve(callerDir, configPath)
	} else {
		const found = await findNearestConfig(callerDir)
		if (!found) {
			throw new Error(
				`Could not find a devflare config file. Searched upward from: ${callerDir}\n` +
					`Expected one of: devflare.config.ts, devflare.config.mts, devflare.config.js, devflare.config.mjs\n` +
					`Either create a config file or provide an explicit path: createTestContext('./path/to/config.ts')`
			)
		}
		foundPath = found
	}

	// Autodiscovery answers in posix separators and an explicit path in the
	// platform's, so one config file reached both ways spelled itself two ways.
	// Left alone that is two memo entries and two config objects for one file.
	const absolutePath = resolve(foundPath)

	const remembered = loadedConfigs.get(absolutePath)
	if (remembered) {
		return remembered
	}

	const configDir = dirname(absolutePath)
	const loadedConfig = await loadConfig({
		cwd: configDir,
		configFile: absolutePath.split(/[/\\]/).pop()
	})
	const envResolvedConfig = await resolveConfigEnvVars(loadedConfig, {
		cwd: configDir,
		configPath: absolutePath,
		mode: 'dev'
	})
	const config = await applyLocalDevVarsToConfig(envResolvedConfig, {
		cwd: configDir,
		configPath: absolutePath
	})

	const resolved: ResolvedTestContextConfig = { absolutePath, configDir, config }
	loadedConfigs.set(absolutePath, resolved)
	return resolved
}

/**
 * Forget every config loaded in this process, so the next resolve re-reads the
 * env and `.dev.vars` overlay.
 */
export function __resetTestContextConfigCache(): void {
	loadedConfigs.clear()
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
		await disposeLocalWorkerLoaderBindings()
		await stopActiveContainers()
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
