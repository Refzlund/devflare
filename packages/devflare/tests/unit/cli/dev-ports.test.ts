import { afterEach, describe, expect, test } from 'bun:test'
import {
	resolveDevBrowserShimPort,
	resolveDevRuntimeHost,
	resolveDevRuntimePort
} from '../../../src/cli/dev-ports'
import { parseArgs } from '../../../src/cli/index'

const originalRuntimePort = process.env.DEVFLARE_RUNTIME_PORT
const originalBridgePort = process.env.DEVFLARE_BRIDGE_PORT
const originalBrowserShimPort = process.env.DEVFLARE_BROWSER_SHIM_PORT

function restoreEnv(name: string, original: string | undefined): void {
	if (original === undefined) {
		delete process.env[name]
	} else {
		process.env[name] = original
	}
}

afterEach(() => {
	restoreEnv('DEVFLARE_RUNTIME_PORT', originalRuntimePort)
	restoreEnv('DEVFLARE_BRIDGE_PORT', originalBridgePort)
	restoreEnv('DEVFLARE_BROWSER_SHIM_PORT', originalBrowserShimPort)
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

describe('resolveDevBrowserShimPort', () => {
	test('returns undefined when nothing requests a port, leaving each server its own default', () => {
		delete process.env.DEVFLARE_BROWSER_SHIM_PORT

		expect(resolveDevBrowserShimPort({})).toBeUndefined()
		expect(resolveDevBrowserShimPort({}, {})).toBeUndefined()
	})

	test('parses --browser-shim-port', () => {
		expect(resolveDevBrowserShimPort({ 'browser-shim-port': '8799' }, {})).toBe(8799)
	})

	test('falls back to DEVFLARE_BROWSER_SHIM_PORT', () => {
		expect(resolveDevBrowserShimPort({}, { DEVFLARE_BROWSER_SHIM_PORT: '9788' })).toBe(9788)

		process.env.DEVFLARE_BROWSER_SHIM_PORT = '9789'
		expect(resolveDevBrowserShimPort({})).toBe(9789)
	})

	test('prefers the CLI flag over the environment', () => {
		expect(
			resolveDevBrowserShimPort(
				{ 'browser-shim-port': '8799' },
				{ DEVFLARE_BROWSER_SHIM_PORT: '9788' }
			)
		).toBe(8799)
	})

	test('ignores a blank DEVFLARE_BROWSER_SHIM_PORT', () => {
		expect(resolveDevBrowserShimPort({}, { DEVFLARE_BROWSER_SHIM_PORT: '   ' })).toBeUndefined()
	})

	test('rejects an unusable --browser-shim-port instead of silently using the default', () => {
		expect(() => resolveDevBrowserShimPort({ 'browser-shim-port': 'nope' }, {})).toThrow(
			'--browser-shim-port must be an integer between 1 and 65535'
		)
		expect(() => resolveDevBrowserShimPort({ 'browser-shim-port': '0' }, {})).toThrow(
			'--browser-shim-port must be an integer between 1 and 65535'
		)
		expect(() => resolveDevBrowserShimPort({ 'browser-shim-port': '70000' }, {})).toThrow(
			'--browser-shim-port must be an integer between 1 and 65535'
		)
		expect(() => resolveDevBrowserShimPort({ 'browser-shim-port': '8788.5' }, {})).toThrow(
			'--browser-shim-port must be an integer between 1 and 65535'
		)
	})

	test('rejects a valueless --browser-shim-port', () => {
		expect(() => resolveDevBrowserShimPort({ 'browser-shim-port': true }, {})).toThrow(
			'--browser-shim-port must be an integer between 1 and 65535'
		)
	})

	test('rejects an unusable DEVFLARE_BROWSER_SHIM_PORT', () => {
		expect(() => resolveDevBrowserShimPort({}, { DEVFLARE_BROWSER_SHIM_PORT: 'nope' })).toThrow(
			'DEVFLARE_BROWSER_SHIM_PORT must be an integer between 1 and 65535'
		)
	})

	test('reads the flag as the argument parser hands it over', () => {
		const dev = parseArgs(['dev', '--browser-shim-port', '8791'])
		expect(resolveDevBrowserShimPort(dev.options, {})).toBe(8791)

		const workspace = parseArgs(['workspace', 'dev', '--browser-shim-port', '9800'])
		expect(resolveDevBrowserShimPort(workspace.options, {})).toBe(9800)
	})
})
