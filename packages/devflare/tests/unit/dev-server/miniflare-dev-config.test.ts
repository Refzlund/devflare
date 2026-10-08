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

	test('threads the dev server block (https/inspectorPort/inspectorHost/upstream/verbose/logRequests/cf/publicUrl) into shared options', () => {
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
						inspectorHost: '0.0.0.0',
						upstream: 'https://example.com',
						liveReload: true,
						verbose: true,
						logRequests: false,
						cf: { colo: 'SFO', country: 'US' },
						publicUrl: 'https://my-worker.example.com'
					}
				}
			})
		)

		expect(mfConfig.https).toBe(true)
		expect(mfConfig.httpsKeyPath).toBe('./certs/key.pem')
		expect(mfConfig.httpsCertPath).toBe('./certs/cert.pem')
		expect(mfConfig.inspectorPort).toBe(9229)
		expect(mfConfig.inspectorHost).toBe('0.0.0.0')
		expect(mfConfig.upstream).toBe('https://example.com')
		// Miniflare 5 has no live reload; the gateway serves it (see the live-reload test below).
		expect(mfConfig.liveReload).toBeUndefined()
		expect(mfConfig.verbose).toBe(true)
		expect(mfConfig.logRequests).toBe(false)
		expect(mfConfig.cf).toEqual({ colo: 'SFO', country: 'US' })
		expect(mfConfig.publicUrl).toBe('https://my-worker.example.com')
	})

	test('omits the dev server block options when no server config is set', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput())
		expect(mfConfig.https).toBeUndefined()
		expect(mfConfig.inspectorPort).toBeUndefined()
		expect(mfConfig.inspectorHost).toBeUndefined()
		expect(mfConfig.upstream).toBeUndefined()
		expect(mfConfig.liveReload).toBeUndefined()
		expect(mfConfig.verbose).toBeUndefined()
		expect(mfConfig.logRequests).toBeUndefined()
		expect(mfConfig.cf).toBeUndefined()
		expect(mfConfig.publicUrl).toBeUndefined()
	})

	test('persists every resource under one resourcePersistencePath when persisting', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput({ persist: true }))
		// The per-resource `*Persist` paths sat at `<data>/<plugin>`; Miniflare 5 derives the same
		// dirs from this root, so the root must be that `<data>` dir and nothing deeper.
		expect(mfConfig.resourcePersistencePath).toMatch(/[\\/]\.devflare[\\/]data$/)
		expect(mfConfig.kvPersist).toBeUndefined()
		expect(mfConfig.cachePersist).toBeUndefined()
	})

	test('leaves resourcePersistencePath undefined when not persisting', () => {
		const mfConfig = buildMiniflareDevConfig(buildBaseInput({ persist: false }))
		expect(mfConfig.resourcePersistencePath).toBeUndefined()
	})

	test('serves live reload from the gateway when server.liveReload is on', () => {
		const gatewayScript = (server: Record<string, unknown> | undefined) =>
			buildMiniflareDevConfig(
				buildBaseInput({
					config: { name: 'site-worker', compatibilityDate: '2026-04-28', server }
				})
			).workers.find((worker: { name: string }) => worker.name === 'gateway').script as string

		expect(gatewayScript({ liveReload: true })).toContain('const LIVE_RELOAD = true')
		expect(gatewayScript({ liveReload: false })).toContain('const LIVE_RELOAD = false')
		expect(gatewayScript(undefined)).toContain('const LIVE_RELOAD = false')
	})

	test('points the browser binding worker at the requested browser shim port', () => {
		const mfConfig = buildMiniflareDevConfig(
			buildBaseInput({
				config: {
					name: 'site-worker',
					compatibilityDate: '2026-04-28',
					bindings: { browser: { BROWSER: 'browser' } }
				},
				// A browser binding worker is only emitted when something can call
				// it — here, the worker-only main worker.
				enableVite: false,
				mainWorkerSurfacePaths: {
					fetch: 'C:/repo/site/src/fetch.ts',
					queue: null,
					scheduled: null,
					email: null,
					tail: null
				},
				browserShimPort: 9911
			})
		)

		const browserWorker = mfConfig.workers.find(
			(worker: { name: string }) => worker.name === 'browser-binding'
		)
		expect(browserWorker).toBeDefined()
		expect(browserWorker.script).toContain('http://127.0.0.1:9911')
		expect(browserWorker.script).not.toContain('8788')
	})
})
