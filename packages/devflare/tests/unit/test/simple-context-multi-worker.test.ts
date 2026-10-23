import { describe, expect, test } from 'bun:test'
import * as miniflare from 'miniflare'
import type { DevflareConfig } from '../../../src/config'
import { buildInlineBridgeMfConfig } from '../../../src/test/simple-context-mfconfig'
import { applyMultiWorkerConfig } from '../../../src/test/simple-context-multi-worker'
import { toMiniflareOptions } from '../../../src/utils/miniflare-options'

/**
 * A main worker carrying per-worker settings the multi-worker rewrite must move:
 * compatibility flags, a queue producer and a Hyperdrive binding. The last two
 * were missing from the hand-kept list the rewrite used to copy from.
 */
const config = {
	name: 'primary-worker',
	compatibilityDate: '2026-04-26',
	compatibilityFlags: ['nodejs_compat'],
	bindings: {
		queues: { producers: { JOBS: 'jobs-queue' } },
		hyperdrive: {
			PG: { id: 'hyperdrive-id', localConnectionString: 'postgres://user:pass@localhost:5432/app' }
		}
	}
} satisfies DevflareConfig

/** One service-bound worker, which is what turns the test context multi-worker. */
const serviceBindingResolution = {
	workers: [
		{
			name: 'service-worker',
			modules: true,
			script: 'export default { fetch() { return new Response("svc") } }',
			compatibilityDate: '2026-04-26'
		}
	],
	primaryServiceBindings: { SERVICE: { name: 'service-worker' } }
} as unknown as Parameters<typeof applyMultiWorkerConfig>[2]

/** The single-worker baseline with the gateway script set, as createTestContext() has it by now. */
function buildMultiWorkerMfConfig() {
	const mfConfig = buildInlineBridgeMfConfig(config)
	mfConfig.script = 'export default { fetch() { return new Response("gateway") } }'
	// No test-context path sets a Miniflare-wide option today; one is added so the
	// rewrite is graded on keeping such options beside `workers`.
	mfConfig.host = '127.0.0.1'
	applyMultiWorkerConfig(mfConfig, config, serviceBindingResolution, null, miniflare)
	return mfConfig
}

describe('applyMultiWorkerConfig', () => {
	test('leaves only Miniflare-wide options at the top level and moves the rest onto the main worker', () => {
		const mfConfig = buildMultiWorkerMfConfig()

		expect(Object.keys(mfConfig).sort()).toEqual(['host', 'workers'])
		expect(mfConfig.workers[0].host).toBeUndefined()
		expect(mfConfig.workers[0]).toMatchObject({
			name: 'primary-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: ['nodejs_compat'],
			queueProducers: { JOBS: { queueName: 'jobs-queue' } },
			hyperdrives: { PG: 'postgres://user:pass@localhost:5432/app' },
			serviceBindings: { SERVICE: { name: 'service-worker' } }
		})
	})

	// Boots workerd: ~1.5s alone, and past bun's 5s default when sharing the box with other files.
	test('boots a main worker that holds its queue, Hyperdrive and service bindings', async () => {
		const options = await toMiniflareOptions(miniflare, { ...buildMultiWorkerMfConfig(), port: 0 })
		const runtime = new miniflare.Miniflare(options)
		try {
			const bindings = await runtime.getBindings('primary-worker')

			expect(Object.keys(bindings).sort()).toEqual(
				expect.arrayContaining(['JOBS', 'PG', 'SERVICE'])
			)
			expect(options.workers[0]?.config.compatibilityFlags).toEqual(['nodejs_compat'])
		} finally {
			await runtime.dispose()
		}
	}, 30_000)
})
