// =============================================================================
// Workspace browser-shim port block
// =============================================================================
// `devflare workspace dev` hands every app that binds browser rendering its own
// shim listener, laid out contiguously from one base port so `--browser-shim-port`
// moves the whole block. Pin the layout the CLI help advertises.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	DEFAULT_BROWSER_SHIM_BASE_PORT,
	resolveAppBrowserShimPort
} from '../../../src/dev-server/workspace/server'

describe('resolveAppBrowserShimPort', () => {
	test('starts the block at the documented 9700 default', () => {
		expect(DEFAULT_BROWSER_SHIM_BASE_PORT).toBe(9700)
		expect(resolveAppBrowserShimPort(DEFAULT_BROWSER_SHIM_BASE_PORT, 0)).toBe(9700)
	})

	test('gives each app the base port plus its manifest index', () => {
		expect(resolveAppBrowserShimPort(9700, 0)).toBe(9700)
		expect(resolveAppBrowserShimPort(9700, 1)).toBe(9701)
		expect(resolveAppBrowserShimPort(9700, 4)).toBe(9704)
	})

	test('moves the whole block when the base port is overridden', () => {
		const moved = [0, 1, 2].map((index) => resolveAppBrowserShimPort(9800, index))
		expect(moved).toEqual([9800, 9801, 9802])
	})
})
