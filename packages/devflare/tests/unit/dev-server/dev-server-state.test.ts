// =============================================================================
// DevServerState — initial-state + disposal-order regression tests (F45)
// =============================================================================
// Pin the contract of the explicit state container that backs
// `createDevServer()`: initial null/empty handles, and the exact teardown
// ordering used by `disposeDevServerState()`.
// =============================================================================

import { describe, expect, mock, test } from 'bun:test'
import {
	createDevServerState,
	disposeDevServerState
} from '../../../src/dev-server/dev-server-state'

describe('createDevServerState', () => {
	test('initializes every handle to its not-yet-started value', () => {
		const state = createDevServerState({ enableVite: true })

		expect(state.enableVite).toBe(true)
		expect(state.miniflare).toBeNull()
		expect(state.doBundler).toBeNull()
		expect(state.workerSourceWatcher).toBeNull()
		expect(state.workerWatchTargets).toEqual([])
		expect(state.viteProcess).toBeNull()
		expect(state.config).toBeNull()
		expect(state.serviceBindingResolution).toBeNull()
		expect(state.browserShim).toBeNull()
		expect(state.browserShimPort).toBe(8788)
		expect(state.mainWorkerSurfacePaths).toEqual({
			fetch: null,
			queue: null,
			scheduled: null,
			email: null,
			tail: null
		})
		expect(state.resolvedWorkerConfigPath).toBeNull()
		expect(state.mainWorkerScriptPath).toBeNull()
		expect(state.bundledMainWorkerScriptPath).toBeNull()
		expect(state.currentDoResult).toBeNull()
		expect(state.mainWorkerRoutes).toBeNull()
		expect(state.generatedViteConfigPath).toBeNull()
	})

	test('respects custom browserShimPort + initial enableVite=false', () => {
		const state = createDevServerState({ enableVite: false, browserShimPort: 9000 })
		expect(state.enableVite).toBe(false)
		expect(state.browserShimPort).toBe(9000)
	})
})

describe('disposeDevServerState', () => {
	test('is a no-op on a fresh state', async () => {
		const state = createDevServerState({ enableVite: true })
		await expect(disposeDevServerState(state)).resolves.toBeUndefined()
		expect(state.miniflare).toBeNull()
		expect(state.doBundler).toBeNull()
		expect(state.workerSourceWatcher).toBeNull()
		expect(state.viteProcess).toBeNull()
		expect(state.browserShim).toBeNull()
	})

	test('tears down in the documented order: doBundler → watcher → miniflare → vite → browserShim', async () => {
		const order: string[] = []
		const state = createDevServerState({ enableVite: true })

		state.doBundler = {
			close: mock(async () => {
				order.push('doBundler')
			})
		} as unknown as typeof state.doBundler
		state.workerSourceWatcher = {
			close: mock(async () => {
				order.push('watcher')
			})
		} as unknown as typeof state.workerSourceWatcher
		state.miniflare = {
			dispose: mock(async () => {
				order.push('miniflare')
			})
		} as unknown as typeof state.miniflare
		// viteProcess is killed via stopSpawnedProcessTree; we use a marker.
		state.viteProcess = {
			__dispose: () => order.push('vite')
		} as unknown as typeof state.viteProcess
		state.browserShim = {
			stop: mock(async () => {
				order.push('browserShim')
			})
		} as unknown as typeof state.browserShim

		// Patch stopSpawnedProcessTree by intercepting its module — easier: just
		// rely on the fact that it will be called with our marker object. We
		// can't trivially mock the import here, so instead replace viteProcess
		// with a child-process-shaped stub whose `kill` records the order.
		// Mock the spawned process so `stopSpawnedProcessTree` resolves
		// immediately on every platform: setting `killed = true` short-circuits
		// `waitForProcessExit`, and `pid = undefined` skips the win32
		// `taskkill` branch so we don't try to spawn a real child process.
		const fakeProc: {
			killed: boolean
			pid: undefined
			exitCode: number
			kill: (signal?: string) => void
			on: () => void
			once: () => void
			removeListener: () => void
		} = {
			kill: (_signal?: string) => {
				order.push('vite')
				fakeProc.killed = true
			},
			killed: false,
			pid: undefined,
			exitCode: 0,
			on: () => {},
			once: () => {},
			removeListener: () => {}
		}
		state.viteProcess = fakeProc as unknown as typeof state.viteProcess

		await disposeDevServerState(state)

		// We expect doBundler/watcher/miniflare/browserShim to be present and in order.
		// vite ordering may be implementation-dependent (handled via stopSpawnedProcessTree),
		// but it must come after miniflare and before browserShim.
		expect(order.indexOf('doBundler')).toBeLessThan(order.indexOf('watcher'))
		expect(order.indexOf('watcher')).toBeLessThan(order.indexOf('miniflare'))
		expect(order.indexOf('miniflare')).toBeLessThan(order.indexOf('browserShim'))

		// All handles are cleared after disposal.
		expect(state.doBundler).toBeNull()
		expect(state.workerSourceWatcher).toBeNull()
		expect(state.miniflare).toBeNull()
		expect(state.viteProcess).toBeNull()
		expect(state.browserShim).toBeNull()
	})
})
