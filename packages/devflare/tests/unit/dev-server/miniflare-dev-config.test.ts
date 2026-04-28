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
		const mfConfig = buildMiniflareDevConfig(buildBaseInput({
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
		}))

		const workerNames = mfConfig.workers.map((worker: { name: string }) => worker.name)
		expect(workerNames).toContain('gateway')
		expect(workerNames).toContain('voicestory-api')
		expect(mfConfig.workers[0].serviceBindings.VOICESTORY_API).toEqual({
			name: 'voicestory-api',
			entrypoint: 'VoiceStoryApi'
		})
	})
})
