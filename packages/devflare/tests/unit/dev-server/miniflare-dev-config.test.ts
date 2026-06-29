import { describe, expect, test } from 'bun:test'
import { buildMiniflareDevConfig } from '../../../src/dev-server/miniflare-dev-config'

function buildBaseInput(overrides: Record<string, unknown> = {}) {
	return {
		config: {
			name: 'site-worker',
			compatibilityDate: '2026-04-28',
			bindings: {
				services: {
					VOICESTORY_API: {
						service: 'voicestory-api',
						entrypoint: 'VoiceStoryApi'
					}
				}
			}
		},
		cwd: 'C:/repo/site',
		miniflarePort: 8787,
		persist: false,
		enableVite: true,
		debug: false,
		mainWorkerSurfacePaths: {
			fetch: null,
			queue: null,
			scheduled: null,
			email: null,
			tail: null
		},
		mainWorkerRoutes: null,
		mainWorkerScriptPath: null,
		bundledMainWorkerScriptPath: null,
		workflowEntrypointScript: '',
		browserShimPort: 8788,
		doResult: null,
		...overrides
	} as Parameters<typeof buildMiniflareDevConfig>[0] & Record<string, unknown>
}

describe('buildMiniflareDevConfig', () => {
	test('includes resolved ref service workers in the same Miniflare runtime', () => {
		const mfConfig = buildMiniflareDevConfig(
			buildBaseInput({
				serviceBindingResolution: {
					primaryServiceBindings: {
						VOICESTORY_API: {
							name: 'voicestory-api',
							entrypoint: 'VoiceStoryApi'
						}
					},
					workers: [
						{
							name: 'voicestory-api',
							modules: true,
							script: 'export class VoiceStoryApi { async ping() { return "pong" } }',
							compatibilityDate: '2026-04-28'
						}
					]
				}
			})
		)

		const workerNames = mfConfig.workers.map((worker: { name: string }) => worker.name)
		expect(workerNames).toContain('gateway')
		expect(workerNames).toContain('voicestory-api')
		expect(mfConfig.workers[0].serviceBindings.VOICESTORY_API).toEqual({
			name: 'voicestory-api',
			entrypoint: 'VoiceStoryApi'
		})
	})

	test('defaults the runtime host to 127.0.0.1', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput())
		expect(mfConfig.host).toBe('127.0.0.1')
		expect(mfConfig.port).toBe(8787)
	})

	test('binds to the provided miniflareHost and miniflarePort', () => {
		const mfConfig = buildMiniflareDevConfig(
			buildBaseInput({
				miniflareHost: '0.0.0.0',
				miniflarePort: 3000
			})
		)
		expect(mfConfig.host).toBe('0.0.0.0')
		expect(mfConfig.port).toBe(3000)
	})

	test('threads the dev server block (https/inspectorPort/upstream) into shared options', () => {
		const mfConfig = buildMiniflareDevConfig(
			buildBaseInput({
				config: {
					name: 'site-worker',
					compatibilityDate: '2026-04-28',
					server: {
						https: true,
						httpsKeyPath: './certs/key.pem',
						httpsCertPath: './certs/cert.pem',
						inspectorPort: 9229,
						upstream: 'https://example.com'
					}
				}
			})
		)

		expect(mfConfig.https).toBe(true)
		expect(mfConfig.httpsKeyPath).toBe('./certs/key.pem')
		expect(mfConfig.httpsCertPath).toBe('./certs/cert.pem')
		expect(mfConfig.inspectorPort).toBe(9229)
		expect(mfConfig.upstream).toBe('https://example.com')
	})

	test('omits the dev server block options when no server config is set', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput())
		expect(mfConfig.https).toBeUndefined()
		expect(mfConfig.inspectorPort).toBeUndefined()
		expect(mfConfig.upstream).toBeUndefined()
	})

	test('sets cachePersist alongside the sibling *Persist options when persisting', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput({ persist: true }))
		expect(mfConfig.cachePersist).toBe(mfConfig.kvPersist.replace(/\/kv$/, '/cache'))
		expect(typeof mfConfig.cachePersist).toBe('string')
	})

	test('leaves cachePersist undefined when not persisting', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput({ persist: false }))
		expect(mfConfig.cachePersist).toBeUndefined()
	})
})
