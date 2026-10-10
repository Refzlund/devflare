import { describe, expect, test } from 'bun:test'
import { mergeAliases } from '../../../src/bundler'

describe('mergeAliases', () => {
	test('user alias overrides framework default on duplicate find keys', () => {
		const frameworkDefaults = [
			{ find: 'debug', replacement: '/framework/debug-shim.js' },
			{ find: 'devflare', replacement: '/framework/devflare.js' }
		]
		const userAliases = [{ find: 'debug', replacement: '/user/my-debug.js' }]

		const merged = mergeAliases(userAliases, frameworkDefaults)

		const debugEntry = merged.find((entry) => entry.find === 'debug')
		expect(debugEntry?.replacement).toBe('/user/my-debug.js')

		// Framework default for non-overridden key is kept
		const devflareEntry = merged.find((entry) => entry.find === 'devflare')
		expect(devflareEntry?.replacement).toBe('/framework/devflare.js')

		// No duplicate `debug` entry
		expect(merged.filter((entry) => entry.find === 'debug')).toHaveLength(1)
	})

	test('preserves ordering of user entries so regex specificity is predictable', () => {
		const frameworkDefaults = [{ find: 'shared', replacement: '/framework/shared.js' }]
		const specificRegex = /^@app\/ui\//
		const broadRegex = /^@app\//
		const userAliases = [
			{ find: specificRegex, replacement: '/user/ui.js' },
			{ find: broadRegex, replacement: '/user/app.js' },
			{ find: 'utils', replacement: '/user/utils.js' }
		]

		const merged = mergeAliases(userAliases, frameworkDefaults)

		// Framework defaults come first, then user entries in user's order
		expect(merged).toEqual([
			{ find: 'shared', replacement: '/framework/shared.js' },
			{ find: specificRegex, replacement: '/user/ui.js' },
			{ find: broadRegex, replacement: '/user/app.js' },
			{ find: 'utils', replacement: '/user/utils.js' }
		])
	})
})
