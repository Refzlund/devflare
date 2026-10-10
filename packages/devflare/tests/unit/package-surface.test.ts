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
