// =============================================================================
// Bridge Log — Debug-gated logger tests
// =============================================================================

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { bridgeLog } from '../../../src/bridge/log'

describe('bridgeLog', () => {
	const originalDebug = process.env.DEVFLARE_DEBUG_BRIDGE
	let warnSpy: ReturnType<typeof mock>
	let debugSpy: ReturnType<typeof mock>
	let originalWarn: typeof console.warn
	let originalDebugFn: typeof console.debug

	beforeEach(() => {
		warnSpy = mock(() => {})
		debugSpy = mock(() => {})
		originalWarn = console.warn
		originalDebugFn = console.debug
		console.warn = warnSpy as unknown as typeof console.warn
		console.debug = debugSpy as unknown as typeof console.debug
	})

	afterEach(() => {
		console.warn = originalWarn
		console.debug = originalDebugFn
		if (originalDebug === undefined) delete process.env.DEVFLARE_DEBUG_BRIDGE
		else process.env.DEVFLARE_DEBUG_BRIDGE = originalDebug
	})

	test('stays silent when DEVFLARE_DEBUG_BRIDGE is unset', () => {
		delete process.env.DEVFLARE_DEBUG_BRIDGE
		bridgeLog.warn('should be dropped', new Error('boom'))
		bridgeLog.debug('should be dropped')
		expect(warnSpy).not.toHaveBeenCalled()
		expect(debugSpy).not.toHaveBeenCalled()
	})

	test('emits warn and debug when DEVFLARE_DEBUG_BRIDGE is enabled', () => {
		process.env.DEVFLARE_DEBUG_BRIDGE = '1'
		const err = new Error('boom')
		bridgeLog.warn('hello', err)
		bridgeLog.debug('hi')
		expect(warnSpy).toHaveBeenCalledTimes(1)
		expect(debugSpy).toHaveBeenCalledTimes(1)
		const [warnMessage, warnError] = warnSpy.mock.calls[0]
		expect(warnMessage).toContain('hello')
		expect(warnError).toBe(err)
	})
})
