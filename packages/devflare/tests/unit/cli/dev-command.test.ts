import { afterEach, describe, expect, test } from 'bun:test'
import { resolveDevRuntimePort } from '../../../src/cli/commands/dev'

const originalRuntimePort = process.env.DEVFLARE_RUNTIME_PORT
const originalBridgePort = process.env.DEVFLARE_BRIDGE_PORT

afterEach(() => {
	if (originalRuntimePort === undefined) {
		delete process.env.DEVFLARE_RUNTIME_PORT
	} else {
		process.env.DEVFLARE_RUNTIME_PORT = originalRuntimePort
	}

	if (originalBridgePort === undefined) {
		delete process.env.DEVFLARE_BRIDGE_PORT
	} else {
		process.env.DEVFLARE_BRIDGE_PORT = originalBridgePort
	}
})

describe('resolveDevRuntimePort', () => {
	test('defaults to 8787', () => {
		delete process.env.DEVFLARE_RUNTIME_PORT
		delete process.env.DEVFLARE_BRIDGE_PORT

		expect(resolveDevRuntimePort({})).toBe(8787)
	})

	test('accepts --runtime-port and --bridge-port as aliases', () => {
		expect(resolveDevRuntimePort({ 'runtime-port': '8791' })).toBe(8791)
		expect(resolveDevRuntimePort({ 'bridge-port': '8792' })).toBe(8792)
	})

	test('uses DEVFLARE_RUNTIME_PORT and DEVFLARE_BRIDGE_PORT when no CLI option is set', () => {
		process.env.DEVFLARE_RUNTIME_PORT = '8793'
		expect(resolveDevRuntimePort({})).toBe(8793)

		delete process.env.DEVFLARE_RUNTIME_PORT
		process.env.DEVFLARE_BRIDGE_PORT = '8794'
		expect(resolveDevRuntimePort({})).toBe(8794)
	})

	test('rejects conflicting runtime and bridge port options', () => {
		expect(() => resolveDevRuntimePort({
			'runtime-port': '8795',
			'bridge-port': '8796'
		})).toThrow('Conflicting Devflare runtime ports')
	})
})
