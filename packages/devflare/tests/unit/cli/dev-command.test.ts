import { afterEach, describe, expect, test } from 'bun:test'
import { resolveDevRuntimeHost, resolveDevRuntimePort } from '../../../src/cli/commands/dev'

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
		expect(() =>
			resolveDevRuntimePort({
				'runtime-port': '8795',
				'bridge-port': '8796'
			})
		).toThrow('Conflicting Devflare runtime ports')
	})

	test('falls back to the config server.port before the 8787 default', () => {
		expect(resolveDevRuntimePort({}, {}, 9001)).toBe(9001)
		expect(resolveDevRuntimePort({}, {})).toBe(8787)
	})

	test('CLI and environment ports take precedence over config server.port', () => {
		expect(resolveDevRuntimePort({ 'runtime-port': '8791' }, {}, 9001)).toBe(8791)
		expect(resolveDevRuntimePort({}, { DEVFLARE_RUNTIME_PORT: '8793' }, 9001)).toBe(8793)
	})
})

describe('resolveDevRuntimeHost', () => {
	test('defaults to 127.0.0.1', () => {
		expect(resolveDevRuntimeHost({}, {})).toBe('127.0.0.1')
	})

	test('falls back to the config server.host before the default', () => {
		expect(resolveDevRuntimeHost({}, {}, '0.0.0.0')).toBe('0.0.0.0')
	})

	test('honors --runtime-host and DEVFLARE_RUNTIME_HOST over config', () => {
		expect(resolveDevRuntimeHost({}, { DEVFLARE_RUNTIME_HOST: 'example.local' }, '0.0.0.0')).toBe(
			'example.local'
		)
		expect(
			resolveDevRuntimeHost(
				{ 'runtime-host': '192.168.1.10' },
				{ DEVFLARE_RUNTIME_HOST: 'example.local' },
				'0.0.0.0'
			)
		).toBe('192.168.1.10')
	})

	test('ignores a blank DEVFLARE_RUNTIME_HOST', () => {
		expect(resolveDevRuntimeHost({}, { DEVFLARE_RUNTIME_HOST: '   ' }, '0.0.0.0')).toBe('0.0.0.0')
	})
})
