import { afterEach, describe, expect, test } from 'bun:test'
import type { DevflareConfig } from '../../../src/config'
import {
	buildAiSearchInstancesConfig,
	buildAiSearchNamespacesConfig,
	buildAnalyticsEngineConfig,
	buildFlagshipConfig,
	buildHyperdrivesConfig,
	buildMtlsCertificatesConfig,
	buildQueueProducers,
	buildSendEmailConfig,
	buildStreamConfig,
	buildStreamingTailConsumersConfig,
	buildTailConsumersConfig
} from '../../../src/dev-server/miniflare-bindings'

type Bindings = NonNullable<DevflareConfig['bindings']>

const hyperdriveEnvName = 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_POSTGRES'
const deprecatedHyperdriveEnvName = 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_LEGACY'
const originalHyperdriveEnv = process.env[hyperdriveEnvName]
const originalDeprecatedHyperdriveEnv = process.env[deprecatedHyperdriveEnvName]

afterEach(() => {
	if (originalHyperdriveEnv === undefined) {
		delete process.env[hyperdriveEnvName]
	} else {
		process.env[hyperdriveEnvName] = originalHyperdriveEnv
	}

	if (originalDeprecatedHyperdriveEnv === undefined) {
		delete process.env[deprecatedHyperdriveEnvName]
	} else {
		process.env[deprecatedHyperdriveEnvName] = originalDeprecatedHyperdriveEnv
	}
})

describe('buildHyperdrivesConfig', () => {
	test('maps Hyperdrive local connection strings to Miniflare hyperdrives', () => {
		const result = buildHyperdrivesConfig({
			hyperdrive: {
				POSTGRES: {
					name: 'app-postgres',
					localConnectionString: 'postgres://user:pass@localhost:5432/app'
				},
				ANALYTICS: {
					id: 'hyperdrive-id',
					localConnectionString: 'postgres://user:pass@localhost:5432/analytics'
				},
				REMOTE_ONLY: {
					name: 'remote-only'
				}
			}
		})

		expect(result).toEqual({
			POSTGRES: 'postgres://user:pass@localhost:5432/app',
			ANALYTICS: 'postgres://user:pass@localhost:5432/analytics'
		})
	})

	test('lets environment variables override configured Hyperdrive local connection strings', () => {
		process.env[hyperdriveEnvName] = 'postgres://env:pass@localhost:5432/env'
		process.env[deprecatedHyperdriveEnvName] = 'postgres://legacy:pass@localhost:5432/legacy'

		const result = buildHyperdrivesConfig({
			hyperdrive: {
				POSTGRES: {
					name: 'app-postgres',
					localConnectionString: 'postgres://config:pass@localhost:5432/app'
				},
				LEGACY: {
					name: 'legacy-postgres'
				}
			}
		})

		expect(result).toEqual({
			POSTGRES: 'postgres://env:pass@localhost:5432/env',
			LEGACY: 'postgres://legacy:pass@localhost:5432/legacy'
		})
	})
})

describe('AI Search Miniflare config builders', () => {
	test('maps AI Search namespace and instance bindings to Miniflare config', () => {
		const bindings = {
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

		expect(buildAiSearchNamespacesConfig(bindings)).toEqual({
			AI_SEARCH: {
				namespace: 'default'
			}
		})
		expect(buildAiSearchInstancesConfig(bindings)).toEqual({
			DOCS_SEARCH: {
				instance_name: 'docs'
			}
		})
	})
})

describe('buildStreamConfig', () => {
	test('maps a Stream binding (true shorthand) to the native Miniflare option', () => {
		const bindings = { stream: { STREAM: true } } as unknown as Bindings
		expect(buildStreamConfig(bindings)).toEqual({ binding: 'STREAM' })
	})

	test('maps a Stream binding (object form) to the native Miniflare option', () => {
		const bindings = { stream: { STREAM: { remote: true } } } as unknown as Bindings
		expect(buildStreamConfig(bindings)).toEqual({ binding: 'STREAM' })
	})

	test('returns undefined when no Stream binding is configured', () => {
		expect(buildStreamConfig({} as Bindings)).toBeUndefined()
	})
})

describe('buildFlagshipConfig', () => {
	test('maps Flagship bindings to the native Miniflare app_id record', () => {
		const bindings = {
			flagship: {
				FLAGS: { appId: 'app-id', remote: true },
				EXPERIMENTS: { appId: 'experiments-id' }
			}
		} as unknown as Bindings

		expect(buildFlagshipConfig(bindings)).toEqual({
			FLAGS: { app_id: 'app-id' },
			EXPERIMENTS: { app_id: 'experiments-id' }
		})
	})

	test('returns undefined when no Flagship binding is configured', () => {
		expect(buildFlagshipConfig({} as Bindings)).toBeUndefined()
	})
})

describe('buildAnalyticsEngineConfig', () => {
	test('maps Analytics Engine bindings to the native analyticsEngineDatasets record', () => {
		const bindings = {
			analyticsEngine: {
				ANALYTICS: { dataset: 'events' },
				METRICS: { dataset: 'metrics-dataset' }
			}
		} as unknown as Bindings

		expect(buildAnalyticsEngineConfig(bindings)).toEqual({
			ANALYTICS: { dataset: 'events' },
			METRICS: { dataset: 'metrics-dataset' }
		})
	})

	test('returns undefined when no Analytics Engine binding is configured', () => {
		expect(buildAnalyticsEngineConfig({} as Bindings)).toBeUndefined()
	})
})

describe('buildTailConsumersConfig', () => {
	test('maps string tail consumers to the Miniflare tails service-name array', () => {
		expect(buildTailConsumersConfig({ tailConsumers: ['trace-worker', 'logs'] })).toEqual([
			'trace-worker',
			'logs'
		])
	})

	test('maps object tail consumers to their service names', () => {
		expect(
			buildTailConsumersConfig({
				tailConsumers: [{ service: 'trace-worker', environment: 'production' }]
			})
		).toEqual(['trace-worker'])
	})

	test('returns undefined when no tail consumers are configured', () => {
		expect(buildTailConsumersConfig({})).toBeUndefined()
		expect(buildTailConsumersConfig({ tailConsumers: [] })).toBeUndefined()
	})
})

describe('buildMtlsCertificatesConfig', () => {
	test('preserves the remote flag alongside certificate_id', () => {
		const bindings = {
			mtlsCertificates: {
				CLIENT_CERT: { certificateId: 'cert-uuid', remote: true },
				LOCAL_CERT: { certificateId: 'local-uuid' }
			}
		} as unknown as Bindings

		expect(buildMtlsCertificatesConfig(bindings)).toEqual({
			CLIENT_CERT: { certificate_id: 'cert-uuid', remote: true },
			LOCAL_CERT: { certificate_id: 'local-uuid' }
		})
	})

	test('returns undefined when no mTLS binding is configured', () => {
		expect(buildMtlsCertificatesConfig({} as Bindings)).toBeUndefined()
	})
})

describe('buildQueueProducers', () => {
	test('carries deliveryDelay onto the Miniflare producer designator', () => {
		const bindings = {
			queues: {
				producers: {
					JOBS: { queue: 'jobs-queue', deliveryDelay: 60 },
					MAIL: 'mail-queue'
				}
			}
		} as unknown as Bindings

		expect(buildQueueProducers(bindings)).toEqual({
			JOBS: { queueName: 'jobs-queue', deliveryDelay: 60 },
			MAIL: { queueName: 'mail-queue' }
		})
	})
})

describe('buildSendEmailConfig', () => {
	test('carries the remote flag onto the Miniflare send_email designator', () => {
		const bindings = {
			sendEmail: {
				EMAIL: { destinationAddress: 'admin@example.com', remote: true }
			}
		} as unknown as Bindings

		expect(buildSendEmailConfig(bindings)).toEqual({
			send_email: [{ name: 'EMAIL', destination_address: 'admin@example.com', remote: true }]
		})
	})
})

describe('buildStreamingTailConsumersConfig', () => {
	test('maps string streaming tail consumers to the Miniflare streamingTails array', () => {
		expect(
			buildStreamingTailConsumersConfig({ streamingTailConsumers: ['stream-worker', 'logs'] })
		).toEqual(['stream-worker', 'logs'])
	})

	test('maps object streaming tail consumers to their service names', () => {
		expect(
			buildStreamingTailConsumersConfig({
				streamingTailConsumers: [{ service: 'stream-worker', environment: 'production' }]
			})
		).toEqual(['stream-worker'])
	})

	test('returns undefined when no streaming tail consumers are configured', () => {
		expect(buildStreamingTailConsumersConfig({})).toBeUndefined()
		expect(buildStreamingTailConsumersConfig({ streamingTailConsumers: [] })).toBeUndefined()
	})
})
