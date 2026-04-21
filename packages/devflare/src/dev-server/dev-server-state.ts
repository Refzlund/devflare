// =============================================================================
// Dev Server — explicit state container
// =============================================================================
// Lifts the closure-scoped mutables that previously lived inside
// `createDevServer()` into an explicit `DevServerState` object, plus a
// matching `disposeDevServerState()` that mirrors the `stop()` shutdown
// ordering. Holding this state out-of-line gives `createDevServer()` a real
// boundary between "what's running" (state) and "how to drive it" (hooks).
// =============================================================================

import type { BrowserShim } from '../browser-shim'
import type { DOBundler, DOBundleResult } from '../bundler'
import type { DevflareConfig } from '../config'
import type { RouteDiscoveryResult } from '../worker-entry/routes'
import type { Miniflare as MiniflareType } from 'miniflare'
import { clearLocalSendEmailBindings } from '../utils/send-email'
import { stopSpawnedProcessTree } from './vite-utils'
import type { WorkerSurfacePaths } from './worker-surface-paths'

/**
 * All mutable handles owned by a single `createDevServer()` call.
 *
 * Anything that the orchestration layer (`start`/`stop`/watcher hooks) needs
 * to reach across closures lives here. Pure helpers (e.g. config loaders,
 * watcher diff, Miniflare config builders) keep taking explicit arguments
 * instead of reading this object directly.
 */
export interface DevServerState {
	enableVite: boolean
	miniflare: MiniflareType | null
	doBundler: DOBundler | null
	workerSourceWatcher: import('chokidar').FSWatcher | null
	workerWatchTargets: string[]
	viteProcess: import('node:child_process').ChildProcess | null
	config: DevflareConfig | null
	browserShim: BrowserShim | null
	browserShimPort: number
	mainWorkerSurfacePaths: WorkerSurfacePaths
	resolvedWorkerConfigPath: string | null
	mainWorkerScriptPath: string | null
	bundledMainWorkerScriptPath: string | null
	currentDoResult: DOBundleResult | null
	mainWorkerRoutes: RouteDiscoveryResult | null
	generatedViteConfigPath: string | null
}

/**
 * Build a fresh `DevServerState` with all handles in their not-yet-started
 * positions. `enableVite` is the user's request — `start()` may downgrade it
 * later via `resolveViteIntegration`.
 */
export function createDevServerState(initial: {
	enableVite: boolean
	browserShimPort?: number
}): DevServerState {
	return {
		enableVite: initial.enableVite,
		miniflare: null,
		doBundler: null,
		workerSourceWatcher: null,
		workerWatchTargets: [],
		viteProcess: null,
		config: null,
		browserShim: null,
		browserShimPort: initial.browserShimPort ?? 8788,
		mainWorkerSurfacePaths: {
			fetch: null,
			queue: null,
			scheduled: null,
			email: null
		},
		resolvedWorkerConfigPath: null,
		mainWorkerScriptPath: null,
		bundledMainWorkerScriptPath: null,
		currentDoResult: null,
		mainWorkerRoutes: null,
		generatedViteConfigPath: null
	}
}

/**
 * Tear down everything in `state` in the same order the legacy `stop()`
 * function used. After this returns, every handle on `state` is `null` again
 * and the local sendEmail bindings have been cleared.
 *
 * Order is important and intentionally mirrors the production sequence:
 * 1. DO bundler (stop rebuilds before Miniflare goes away)
 * 2. Worker source watcher (stop FS callbacks before Miniflare disposal)
 * 3. Miniflare itself
 * 4. Vite child process (after Miniflare so requests cannot race shutdown)
 * 5. Browser shim
 * 6. Local sendEmail registry reset
 */
export async function disposeDevServerState(state: DevServerState): Promise<void> {
	if (state.doBundler) {
		await state.doBundler.close()
		state.doBundler = null
	}

	if (state.workerSourceWatcher) {
		await state.workerSourceWatcher.close()
		state.workerSourceWatcher = null
	}

	if (state.miniflare) {
		await state.miniflare.dispose()
		state.miniflare = null
	}

	if (state.viteProcess) {
		await stopSpawnedProcessTree(state.viteProcess)
		state.viteProcess = null
	}

	if (state.browserShim) {
		await state.browserShim.stop()
		state.browserShim = null
	}

	clearLocalSendEmailBindings()
}
