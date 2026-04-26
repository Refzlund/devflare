import { describe, expect, test } from 'bun:test'
import {
	makeMiniflareWorker,
	type MakeMiniflareWorkerContext
} from '../../../src/dev-server/miniflare-worker-config'

describe('makeMiniflareWorker', () => {
	test('maps Wrangler module rules to Miniflare module rules for file-backed workers', () => {
		const context: MakeMiniflareWorkerContext = {
			cwd: 'C:/project',
			loadedConfig: {
				name: 'app-worker',
				compatibilityDate: '2026-04-26',
				compatibilityFlags: [],
				baseDir: './worker',
				rules: [
					{ type: 'Text', globs: ['**/*.txt'], fallthrough: true },
					{ type: 'Data', globs: ['**/*.bin'] },
					{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
				]
			} as any,
			bindings: {},
			sendEmailConfig: undefined,
			rateLimitsConfig: undefined,
			versionMetadataConfig: undefined,
			workerLoadersConfig: undefined,
			mtlsCertificatesConfig: undefined,
			dispatchNamespacesConfig: undefined,
			workflowsConfig: undefined,
			pipelinesConfig: undefined,
			hyperdrivesConfig: {
				POSTGRES: 'postgres://user:pass@localhost:5432/app'
			},
			imagesConfig: undefined,
			mediaConfig: undefined,
			aiSearchNamespacesConfig: undefined,
			aiSearchInstancesConfig: undefined,
			artifactsConfig: undefined,
			secretsStoreConfig: undefined,
			queueProducers: undefined
		}

		const workerConfig = makeMiniflareWorker(context, {
			name: 'app-worker',
			scriptPath: 'C:/project/.devflare/worker.js'
		})

		expect(workerConfig.modulesRoot).toBe('C:/project/worker')
		expect(workerConfig.modulesRules).toEqual([
			{ type: 'Text', include: ['**/*.txt'], fallthrough: true },
			{ type: 'Data', include: ['**/*.bin'] },
			{ type: 'CompiledWasm', include: ['**/*.wasm'] },
			{ type: 'ESModule', include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.mjs'] },
			{ type: 'CommonJS', include: ['**/*.js', '**/*.cjs'] },
			{ type: 'ESModule', include: ['**/*.jsx'] }
		])
		expect(workerConfig.hyperdrives).toEqual({
			POSTGRES: 'postgres://user:pass@localhost:5432/app'
		})
	})
})
