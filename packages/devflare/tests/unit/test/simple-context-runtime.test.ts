// =============================================================================
// bootTestRuntime — initialization-order coverage (F49)
// =============================================================================
// Pin the contract that `bootTestRuntime` only ever takes one of two paths
// based on the `usesMultiWorker` flag, and that the bridge-backed path's
// `client` is preserved while the multi-worker path leaves it null.
// =============================================================================

import { describe, expect, mock, test } from 'bun:test'

// We mock the two collaborators via module patching at import time.
const startBridgeBackedTestContextMock = mock(async (_mfConfig: any) => ({
	port: 4321,
	client: { __isBridge: true } as any,
	miniflare: { __label: 'bridge-mf' },
	miniflareBindings: { B: 1 }
}))

const getAvailablePortMock = mock(async () => 5678)

const miniflareCtorCalls: any[] = []
class FakeMiniflare {
	ready = Promise.resolve()
	private _port: number
	constructor(opts: any) {
		miniflareCtorCalls.push(opts)
		this._port = opts.port
	}
	async getBindings() {
		return { MW: this._port }
	}
}

mock.module('../../../src/test/simple-context-startup', () => ({
	startBridgeBackedTestContext: startBridgeBackedTestContextMock
}))

mock.module('../../../src/test/simple-context-paths', () => ({
	getAvailablePort: getAvailablePortMock,
	resolveTransportFile: () => null
}))

// Loaded before the mock is installed: only the Miniflare class is faked, so the
// real v4→v5 option conversion (toMiniflareOptions) still runs on the boot path.
const realMiniflare = await import('miniflare')
mock.module('miniflare', () => ({
	...realMiniflare,
	Miniflare: FakeMiniflare
}))

// Note: we deliberately do NOT mock '../../../src/utils/send-email' here.
// Bun's `mock.module()` is process-global and leaks the patched module into
// every other test file that runs in the same process — patching it here
// would silently corrupt e.g. tests/unit/runtime/context.test.ts which
// observes `runWithContext`'s env identity. The real `wrapEnvSendEmailBindings`
// is a no-op for envs without SendEmail bindings, which is what the fixtures
// below provide, so the bridge / multi-worker assertions below are unaffected.

import { bootTestRuntime } from '../../../src/test/simple-context-runtime'

describe('bootTestRuntime', () => {
	test('bridge-backed path returns the bridge client and skips Miniflare boot', async () => {
		startBridgeBackedTestContextMock.mockClear()
		miniflareCtorCalls.length = 0

		const result = await bootTestRuntime({ workers: [{ name: 'main' }] }, false)

		expect(startBridgeBackedTestContextMock).toHaveBeenCalledTimes(1)
		expect(miniflareCtorCalls.length).toBe(0)
		expect(result.activePort).toBe(4321)
		expect(result.client).not.toBeNull()
		expect(result.miniflare).toEqual({ __label: 'bridge-mf' })
		expect(result.miniflareBindings).toEqual({ B: 1 })
	})

	test('multi-worker path boots Miniflare on a fresh port and returns no client', async () => {
		startBridgeBackedTestContextMock.mockClear()
		miniflareCtorCalls.length = 0

		const worker = (name: string) => ({ name, modules: true, script: 'export default {}' })
		const result = await bootTestRuntime({ workers: [worker('main'), worker('svc')] }, true)

		expect(startBridgeBackedTestContextMock).not.toHaveBeenCalled()
		expect(miniflareCtorCalls.length).toBe(1)
		expect(miniflareCtorCalls[0].port).toBe(5678)
		// Miniflare 5's shape: the converter moved each worker under `config`.
		expect(
			miniflareCtorCalls[0].workers.map(
				(worker: { config: { name: string } }) => worker.config.name
			)
		).toEqual(['main', 'svc'])
		expect(result.activePort).toBe(5678)
		expect(result.client).toBeNull()
		expect(result.miniflareBindings).toEqual({ MW: 5678 })
	})
})
