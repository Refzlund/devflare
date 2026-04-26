import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	BUILD_MANIFEST_VERSION,
	compareManifests,
	createBuildManifest,
	formatDriftWarning,
	hashSourceConfig,
	readBuildManifest,
	summarizeBindings,
	writeBuildManifest
} from '../../../src/cli/build-manifest'
import type { DevflareConfig } from '../../../src/config'

const baseConfig: DevflareConfig = {
	name: 'my-worker',
	compatibilityDate: '2026-04-01',
	compatibilityFlags: [],
	bindings: {
		kv: { CACHE: { name: 'cache-kv' } },
		d1: { DB: { name: 'main-db' } }
	}
}

describe('build-manifest', () => {
	test('hashSourceConfig produces stable hash and ignores accountId drift', () => {
		const a = hashSourceConfig(baseConfig)
		const b = hashSourceConfig({ ...baseConfig, accountId: 'account-A' })
		const c = hashSourceConfig({ ...baseConfig, accountId: 'account-B' })
		expect(a).toEqual(b)
		expect(b).toEqual(c)
	})

	test('hashSourceConfig changes when bindings change', () => {
		const a = hashSourceConfig(baseConfig)
		const b = hashSourceConfig({
			...baseConfig,
			bindings: { ...baseConfig.bindings, kv: { CACHE2: { name: 'cache-kv-2' } } }
		})
		expect(a).not.toEqual(b)
	})

	test('summarizeBindings collects sorted binding keys per type', () => {
		const summary = summarizeBindings({
			...baseConfig,
			tailConsumers: [
				'observability-tail'
			],
			bindings: {
				...baseConfig.bindings,
				rateLimits: {
					MY_RATE_LIMITER: {
						namespaceId: '1001',
						simple: { limit: 100, period: 60 }
					}
				},
				versionMetadata: { binding: 'CF_VERSION_METADATA' },
				workerLoaders: {
					LOADER: {}
				},
				mtlsCertificates: {
					API_CERT: {
						certificateId: 'cert-123'
					}
				},
				dispatchNamespaces: {
					DISPATCHER: {
						namespace: 'customers'
					}
				},
				workflows: {
					ORDER_WORKFLOW: {
						name: 'orders',
						className: 'OrderWorkflow'
					}
				},
				pipelines: {
					EVENTS: {
						pipeline: 'events-stream'
					}
				},
				images: {
					IMAGES: {
						remote: true
					}
				},
				media: {
					MEDIA: {
						remote: true
					}
				},
				artifacts: {
					ARTIFACTS: {
						namespace: 'default'
					}
				},
				secretsStore: {
					API_TOKEN: {
						storeId: 'store-123',
						secretName: 'api-token'
					}
				}
			}
		})
		expect(summary.kv).toEqual(['CACHE'])
		expect(summary.d1).toEqual(['DB'])
		expect(summary.r2).toEqual([])
		expect(summary.rateLimits).toEqual(['MY_RATE_LIMITER'])
		expect(summary.versionMetadata).toEqual(['CF_VERSION_METADATA'])
		expect(summary.workerLoaders).toEqual(['LOADER'])
		expect(summary.mtlsCertificates).toEqual(['API_CERT'])
		expect(summary.dispatchNamespaces).toEqual(['DISPATCHER'])
		expect(summary.workflows).toEqual(['ORDER_WORKFLOW'])
		expect(summary.pipelines).toEqual(['EVENTS'])
		expect(summary.images).toEqual(['IMAGES'])
		expect(summary.media).toEqual(['MEDIA'])
		expect(summary.artifacts).toEqual(['ARTIFACTS'])
		expect(summary.secretsStore).toEqual(['API_TOKEN'])
		expect(summary.tailConsumers).toEqual(['observability-tail'])
	})

	test('createBuildManifest stamps version + target + bindings snapshot', () => {
		const manifest = createBuildManifest(baseConfig, {
			devflareVersion: '1.0.0-test',
			intendedTarget: { preview: false }
		})
		expect(manifest.manifestVersion).toBe(BUILD_MANIFEST_VERSION)
		expect(manifest.devflareVersion).toBe('1.0.0-test')
		expect(manifest.intendedTarget.preview).toBe(false)
		expect(manifest.bindingsSnapshot.kv).toEqual(['CACHE'])
	})

	test('writeBuildManifest and readBuildManifest round-trip on disk', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'devflare-manifest-'))
		try {
			const manifest = createBuildManifest(baseConfig, {
				devflareVersion: '1.0.0-test',
				intendedTarget: { preview: false }
			})
			const path = await writeBuildManifest(dir, manifest)
			expect(path.endsWith('manifest.json')).toBe(true)
			const read = await readBuildManifest(dir)
			expect(read?.sourceConfigHash).toBe(manifest.sourceConfigHash)
			expect(read?.devflareVersion).toBe('1.0.0-test')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test('readBuildManifest returns null when no manifest exists', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'devflare-manifest-empty-'))
		try {
			const read = await readBuildManifest(dir)
			expect(read).toBeNull()
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test('compareManifests detects config drift, version drift, and target drift', () => {
		const previous = createBuildManifest(baseConfig, {
			devflareVersion: '1.0.0',
			intendedTarget: { preview: true, previewScope: 'pr-1' }
		})
		const current = createBuildManifest(
			{
				...baseConfig,
				bindings: {
					...baseConfig.bindings,
					r2: { ASSETS: 'assets-bucket' }
				}
			},
			{
				devflareVersion: '1.0.1',
				intendedTarget: { preview: false }
			}
		)
		const drift = compareManifests(previous, current)
		expect(drift.configChanged).toBe(true)
		expect(drift.versionChanged).toBe(true)
		expect(drift.targetChanged).toBe(true)
		expect(drift.bindingsAdded).toContain('r2:ASSETS')
		expect(drift.bindingsRemoved).toEqual([])
	})

	test('formatDriftWarning returns null when no drift', () => {
		const m = createBuildManifest(baseConfig, {
			devflareVersion: '1.0.0',
			intendedTarget: { preview: false }
		})
		const drift = compareManifests(m, m)
		expect(formatDriftWarning(drift)).toBeNull()
	})

	test('formatDriftWarning surfaces preview->production flip clearly', () => {
		const built = createBuildManifest(baseConfig, {
			devflareVersion: '1.0.0',
			intendedTarget: { preview: true, previewScope: 'pr-1' }
		})
		const deployed = createBuildManifest(baseConfig, {
			devflareVersion: '1.0.0',
			intendedTarget: { preview: false }
		})
		const warning = formatDriftWarning(compareManifests(built, deployed))
		expect(warning).not.toBeNull()
		expect(warning).toContain('deployment target differs')
		expect(warning).toContain('preview')
		expect(warning).toContain('production')
	})
})
