import { describe, expect, test } from 'bun:test'

describe('main barrel public surface', () => {
	test('exports expected public names', async () => {
		const mod = await import('../../src/index.ts')
		const expected = [
			'defineConfig',
			'preview',
			'loadConfig',
			'loadResolvedConfig',
			'compileConfig',
			'ref',
			'workerName',
			'runCli',
			'parseArgs',
			'env',
			'durableObject',
			'getDurableObjectOptions',
			'configSchema',
			'ConfigNotFoundError',
			'ConfigValidationError',
			'ConfigResourceResolutionError',
			'default'
		]
		for (const name of expected) {
			expect(name in mod).toBe(true)
		}
	})

	test('does not expose internal bridge/test/transform helpers', async () => {
		const mod = await import('../../src/index.ts')
		const removed = [
			'setBindingHints',
			'createEnvProxy',
			'initEnv',
			'BridgeClient',
			'getClient',
			'startMiniflare',
			'getMiniflare',
			'stopMiniflare',
			'gateway',
			'createTestContext',
			'createMockKV',
			'createMockD1',
			'createBridgeTestContext',
			'testEnv',
			'findDurableObjectClasses',
			'transformDurableObject',
			'transformWorkerEntrypoint'
		]
		for (const name of removed) {
			expect(name in mod).toBe(false)
		}
	})

	test('re-exports the env-vars dotenv readers themselves, not wrappers', async () => {
		const mod = await import('../../src/index.ts')
		const layer = await import('../../src/config/env-vars.ts')

		// Identity, not presence: a wrapper or a second copy could drift from the layer. That the
		// loader calls these same functions is `loader.ts`'s property, and this does not grade it.
		expect(mod.getDevflareDotenvPaths).toBe(layer.getDevflareDotenvPaths)
		expect(mod.loadDevflareDotenv).toBe(layer.loadDevflareDotenv)
		expect(mod.parseDevflareEnvFile).toBe(layer.parseDevflareEnvFile)

		// The mutating sibling stays internal: copying into a caller's process.env is loadConfig's call.
		expect('loadDevflareDotenvIntoProcess' in mod).toBe(false)
	})

	test('re-exports the offline build compiler itself, not a wrapper', async () => {
		const mod = await import('../../src/index.ts')
		const compiler = await import('../../src/config/compiler.ts')

		// Identity for the same reason as the dotenv readers: what a predeploy check grades with it
		// must be what `devflare build` and `deploy --dry-run` compile with.
		expect(mod.compileBuildConfig).toBe(compiler.compileBuildConfig)
	})

	test('the browser entry refuses the dotenv readers by name rather than omitting them', async () => {
		const browser = await import('../../src/browser.ts')

		for (const name of [
			'getDevflareDotenvPaths',
			'loadDevflareDotenv',
			'parseDevflareEnvFile'
		] as const) {
			// The Node-only hint, because neither devflare/test nor devflare/runtime carries them.
			expect(() => (browser[name] as () => unknown)()).toThrow(
				`${name} is not available in browser environments; call it from a Node script`
			)
		}

		// The same for the offline compiler, whose generic hint would point at entries that lack it.
		expect(() => (browser.compileBuildConfig as () => unknown)()).toThrow(
			'compileBuildConfig is not available in browser environments; call it from a Node script'
		)
	})

	test('the browser entry carries every root export, bar two gaps that predate this check', async () => {
		const root = Object.keys(await import('../../src/index.ts'))
		const browser = new Set(Object.keys(await import('../../src/browser.ts')))

		// → NOTE: these two were already missing when this check was written. Each must STILL be
		//   missing, so closing a gap fails here until its name leaves the list.
		const knownGaps = ['defineWorkspace', 'preview']
		for (const name of knownGaps) expect(browser.has(name)).toBe(false)

		const missing = root.filter((name) => !browser.has(name) && !knownGaps.includes(name))
		expect(missing).toEqual([])
	})

	test('removed names remain importable from devflare/test subpath', async () => {
		const testMod = await import('../../src/test/index.ts')
		expect('createTestContext' in testMod).toBe(true)
		expect('createBridgeTestContext' in testMod).toBe(false)
	})

	test('bridge internals remain importable from bridge subpath', async () => {
		const bridgeMod = await import('../../src/bridge/index.ts')
		expect('startMiniflare' in bridgeMod).toBe(true)
		expect('BridgeClient' in bridgeMod).toBe(true)
		expect('createEnvProxy' in bridgeMod).toBe(true)
	})
})
