import { afterEach, describe, expect, test } from 'bun:test'
import {
	buildAiSearchInstancesConfig,
	buildAiSearchNamespacesConfig,
	buildHyperdrivesConfig
} from '../../../src/dev-server/miniflare-bindings'

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
