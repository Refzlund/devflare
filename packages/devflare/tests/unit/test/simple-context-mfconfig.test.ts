import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { buildInlineBridgeMfConfig } from '../../../src/test/simple-context-mfconfig'
import { writeLocalSecret } from '../../../src/secrets/local-secrets'

const tempDirs: string[] = []

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-simple-context-secrets-'))
	tempDirs.push(dir)
	return dir
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('buildInlineBridgeMfConfig', () => {
	test('adds Miniflare Rate Limiting bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				rateLimits: {
					MY_RATE_LIMITER: {
						namespaceId: '1001',
						simple: {
							limit: 100,
							period: 60
						}
					}
				}
			}
		})

		expect(mfConfig.ratelimits).toEqual({
			MY_RATE_LIMITER: {
				simple: {
					limit: 100,
					period: 60
				}
			}
		})
	})

	test('adds Miniflare Version Metadata binding for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				versionMetadata: {
					binding: 'CF_VERSION_METADATA'
				}
			}
		})

		expect(mfConfig.versionMetadata).toBe('CF_VERSION_METADATA')
	})

	test('adds Miniflare Hyperdrive bindings with local connection strings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				hyperdrive: {
					POSTGRES: {
						id: 'hyperdrive-id',
						localConnectionString: 'postgres://user:pass@localhost:5432/app'
					}
				}
			}
		})

		expect(mfConfig.hyperdrives).toEqual({
			POSTGRES: 'postgres://user:pass@localhost:5432/app'
		})
	})

	test('adds Miniflare Secrets Store bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				secretsStore: {
					API_TOKEN: {
						storeId: 'store-123',
						secretName: 'api-token'
					}
				}
			}
		})

		expect(mfConfig.secretsStoreSecrets).toEqual({
			API_TOKEN: {
				store_id: 'store-123',
				secret_name: 'api-token'
			}
		})
	})

	test('uses the default Secrets Store id for shorthand bindings in createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			secretsStoreId: 'store-123',
			bindings: {
				secretsStore: {
					API_TOKEN: 'api-token'
				}
			}
		})

		expect(mfConfig.secretsStoreSecrets).toEqual({
			API_TOKEN: {
				store_id: 'store-123',
				secret_name: 'api-token'
			}
		})
	})

	test('uses wrapped bindings for createTestContext local Secrets Store values', () => {
		const cwd = createTempDir()
		writeLocalSecret({ cwd, storeId: 'store-123', name: 'api-token', value: 'local-secret' })

		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			secretsStoreId: 'store-123',
			bindings: {
				secretsStore: {
					API_TOKEN: 'api-token',
					REMOTE_ONLY: 'remote-only'
				}
			}
		}, { cwd })

		expect(mfConfig.secretsStoreSecrets).toEqual({
			REMOTE_ONLY: {
				store_id: 'store-123',
				secret_name: 'remote-only'
			}
		})
		expect(mfConfig.wrappedBindings).toEqual({
			API_TOKEN: {
				scriptName: 'devflare-local-secret-0-api-token',
				bindings: {
					value: 'local-secret'
				}
			}
		})
		expect(mfConfig.__devflareLocalSecretWorkers).toHaveLength(1)
	})

	test('adds Miniflare Worker Loader bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				workerLoaders: {
					LOADER: {}
				}
			}
		})

		expect(mfConfig.workerLoaders).toEqual({
			LOADER: {}
		})
	})

	test('adds Miniflare mTLS Certificate bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				mtlsCertificates: {
					API_CERT: {
						certificateId: 'cert-123'
					}
				}
			}
		})

		expect(mfConfig.mtlsCertificates).toEqual({
			API_CERT: {
				certificate_id: 'cert-123'
			}
		})
	})

	test('adds Miniflare Dispatch Namespace bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				dispatchNamespaces: {
					DISPATCHER: {
						namespace: 'customers'
					}
				}
			}
		})

		expect(mfConfig.dispatchNamespaces).toEqual({
			DISPATCHER: {
				namespace: 'customers'
			}
		})
	})

	test('adds Miniflare Workflow bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				workflows: {
					ORDER_WORKFLOW: {
						name: 'orders',
						className: 'OrderWorkflow',
						scriptName: 'workflow-worker',
						limits: {
							steps: 42
						}
					}
				}
			}
		})

		expect(mfConfig.workflows).toEqual({
			ORDER_WORKFLOW: {
				name: 'orders',
				className: 'OrderWorkflow',
				scriptName: 'workflow-worker',
				stepLimit: 42
			}
		})
	})

	test('adds Miniflare Pipeline bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				pipelines: {
					EVENTS: 'events-stream',
					AUDIT: {
						pipeline: 'audit-stream'
					}
				}
			}
		})

		expect(mfConfig.pipelines).toEqual({
			EVENTS: 'events-stream',
			AUDIT: {
				pipeline: 'audit-stream'
			}
		})
	})

	test('adds Miniflare Images binding for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				images: {
					IMAGES: {
						remote: true
					}
				}
			}
		})

		expect(mfConfig.images).toEqual({
			binding: 'IMAGES'
		})
	})

	test('adds Miniflare Media Transformations binding for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				media: {
					MEDIA: {
						remote: true
					}
				}
			}
		})

		expect(mfConfig.media).toEqual({
			binding: 'MEDIA'
		})
	})

	test('adds Miniflare AI Search bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				aiSearchNamespaces: {
					AI_SEARCH: {
						namespace: 'default',
						remote: true
					}
				},
				aiSearch: {
					DOCS_SEARCH: {
						instanceName: 'docs',
						remote: true
					}
				}
			}
		})

		expect(mfConfig.aiSearchNamespaces).toEqual({
			AI_SEARCH: {
				namespace: 'default'
			}
		})
		expect(mfConfig.aiSearchInstances).toEqual({
			DOCS_SEARCH: {
				instance_name: 'docs'
			}
		})
	})

	test('adds Miniflare Artifacts bindings for createTestContext', () => {
		const mfConfig = buildInlineBridgeMfConfig({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				artifacts: {
					ARTIFACTS: 'default',
					ARCHIVE: {
						namespace: 'archive'
					}
				}
			}
		})

		expect(mfConfig.artifacts).toEqual({
			ARTIFACTS: {
				namespace: 'default'
			},
			ARCHIVE: {
				namespace: 'archive'
			}
		})
	})
})
