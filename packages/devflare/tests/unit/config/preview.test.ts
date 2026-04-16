import { afterEach, describe, expect, test } from 'bun:test'
import {
	isPreviewScopedName,
	materializePreviewScopedString,
	preview,
	resolveConfigForEnvironment,
	type DevflareConfig
} from '../../../src/config'

const previewBranchEnvKeys = [
	'DEVFLARE_PREVIEW_IDENTIFIER',
	'DEVFLARE_PREVIEW_PR',
	'DEVFLARE_PREVIEW_BRANCH'
] as const

const originalPreviewEnv = Object.fromEntries(
	previewBranchEnvKeys.map((key) => [key, process.env[key]])
) as Record<(typeof previewBranchEnvKeys)[number], string | undefined>

afterEach(() => {
	for (const key of previewBranchEnvKeys) {
		const originalValue = originalPreviewEnv[key]
		if (originalValue === undefined) {
			delete process.env[key]
			continue
		}

		process.env[key] = originalValue
	}
})

describe('preview.scope', () => {
	test('creates opaque preview-scoped markers', () => {
		const pv = preview.scope()
		const cacheName = pv('cache-kv')

		expect(typeof cacheName).toBe('string')
		expect(isPreviewScopedName(cacheName)).toBe(true)
		expect(materializePreviewScopedString(cacheName)).toBe('cache-kv')
		expect(materializePreviewScopedString(cacheName, {
			environment: 'preview'
		})).toBe('cache-kv-preview')
	})

	test('supports custom separators and branch sanitization', () => {
		const pv = preview.scope({ separator: '--' })
		const datasetName = pv('analytics-dataset')

		expect(materializePreviewScopedString(datasetName, {
			env: {
				DEVFLARE_PREVIEW_BRANCH: 'Feature/TeSt-Branch'
			}
		})).toBe('analytics-dataset--feature-test-branch')
	})

	test('rejects empty base names early', () => {
		const pv = preview.scope()

		expect(() => pv('   ')).toThrow('preview.scope(...) requires a non-empty baseName.')
	})

	test('rejects malformed preview-scoped markers with a clear error', () => {
		expect(() => materializePreviewScopedString('__DEVFLARE_PREVIEW_SCOPE__:not-json')).toThrow(
			'Invalid Devflare preview-scoped value: the encoded payload is not valid JSON.'
		)
	})

	test('rejects preview-scoped markers that omit the base name', () => {
		const invalidScopedName = `${'__DEVFLARE_PREVIEW_SCOPE__:'}${JSON.stringify({ separator: '-' })}`

		expect(() => materializePreviewScopedString(invalidScopedName)).toThrow(
			'Invalid Devflare preview-scoped value: the encoded payload is missing a non-empty baseName.'
		)
	})
})

describe('resolveConfigForEnvironment', () => {
	test('materializes preview-scoped binding names for preview environments', () => {
		const pv = preview.scope()
		const config: DevflareConfig = {
			name: 'demo-worker',
			compatibilityDate: '2026-04-08',
			bindings: {
				kv: {
					CACHE: pv('cache-kv')
				},
				r2: {
					ASSETS: pv('assets-bucket')
				},
				queues: {
					producers: {
						JOBS: pv('jobs-queue')
					},
					consumers: [
						{
							queue: pv('jobs-queue'),
							deadLetterQueue: pv('jobs-dlq')
						}
					]
				},
				vectorize: {
					DOCUMENT_INDEX: {
						indexName: pv('document-index')
					}
				},
				browser: {
					BROWSER: pv('browser-renderer')
				},
				analyticsEngine: {
					APP_ANALYTICS: {
						dataset: pv('analytics-dataset')
					}
				}
			},
			env: {
				production: {
					bindings: {
						kv: {
							CACHE: 'cache-kv-production'
						}
					}
				}
			}
		}

		const previewConfig = resolveConfigForEnvironment(config, 'preview')
		const productionConfig = resolveConfigForEnvironment(config, 'production')

		expect(previewConfig.bindings?.kv?.CACHE).toBe('cache-kv-preview')
		expect(previewConfig.bindings?.r2?.ASSETS).toBe('assets-bucket-preview')
		expect(previewConfig.bindings?.queues?.producers?.JOBS).toBe('jobs-queue-preview')
		expect(previewConfig.bindings?.queues?.consumers?.[0]?.queue).toBe('jobs-queue-preview')
		expect(previewConfig.bindings?.queues?.consumers?.[0]?.deadLetterQueue).toBe('jobs-dlq-preview')
		expect(previewConfig.bindings?.vectorize?.DOCUMENT_INDEX.indexName).toBe('document-index-preview')
		expect(previewConfig.bindings?.browser?.BROWSER).toBe('browser-renderer-preview')
		expect(previewConfig.bindings?.analyticsEngine?.APP_ANALYTICS.dataset).toBe('analytics-dataset-preview')

		expect(productionConfig.bindings?.kv?.CACHE).toBe('cache-kv-production')
		expect(productionConfig.bindings?.r2?.ASSETS).toBe('assets-bucket')
	})

	test('prefers explicit branch identifiers over the generic preview suffix', () => {
		process.env.DEVFLARE_PREVIEW_BRANCH = 'Feature/Queue-Cleanup'

		const pv = preview.scope()
		const config: DevflareConfig = {
			name: 'demo-worker',
			compatibilityDate: '2026-04-08',
			bindings: {
				d1: {
					PRIMARY_DB: pv('primary-db')
				},
				hyperdrive: {
					POSTGRES: pv('postgres-hyperdrive')
				}
			}
		}

		const previewConfig = resolveConfigForEnvironment(config, 'preview')

		expect(previewConfig.bindings?.d1?.PRIMARY_DB).toBe('primary-db-feature-queue-cleanup')
		expect(previewConfig.bindings?.hyperdrive?.POSTGRES).toBe('postgres-hyperdrive-feature-queue-cleanup')
	})
})
