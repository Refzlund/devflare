import { afterAll, describe, expect, test } from 'bun:test'
import {
	createLocalWorkerLoaderBinding,
	disposeLocalWorkerLoaderBindings
} from '../../../src/shims/local-worker-loader'

describe('createLocalWorkerLoaderBinding', () => {
	afterAll(async () => {
		await disposeLocalWorkerLoaderBindings()
	})

	test('runs the loaded worker fetch entrypoint through nested Miniflare', async () => {
		const stub = createLocalWorkerLoaderBinding().load({
			compatibilityDate: '2026-04-27',
			mainModule: 'worker.js',
			modules: {
				'worker.js': {
					js: "export default { async fetch() { return new Response('ok') } }"
				}
			}
		})

		const response = await stub.getEntrypoint().fetch('https://x/')

		expect(await response.text()).toBe('ok')
	})

	test('getDurableObjectClass() throws the precise documented limitation', () => {
		const stub = createLocalWorkerLoaderBinding().load({
			compatibilityDate: '2026-04-27',
			mainModule: 'worker.js',
			modules: {
				'worker.js': {
					js: 'export default {}'
				}
			}
		})

		expect(() => stub.getDurableObjectClass()).toThrow(/Durable Object class/)
	})
})
