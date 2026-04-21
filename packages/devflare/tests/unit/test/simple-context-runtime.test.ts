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

mock.module('miniflare', () => ({
	Miniflare: FakeMiniflare
}))

mock.module('../../../src/utils/send-email', () => ({
	wrapEnvSendEmailBindings: (b: Record<string, unknown>) => ({ ...b, __wrapped: true })
}))

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

		const result = await bootTestRuntime({ workers: [{ name: 'main' }, { name: 'svc' }] }, true)

		expect(startBridgeBackedTestContextMock).not.toHaveBeenCalled()
		expect(miniflareCtorCalls.length).toBe(1)
		expect(miniflareCtorCalls[0].port).toBe(5678)
		expect(result.activePort).toBe(5678)
		expect(result.client).toBeNull()
		expect(result.miniflareBindings).toEqual({ MW: 5678, __wrapped: true })
	})
})
