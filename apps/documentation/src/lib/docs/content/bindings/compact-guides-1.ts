import { type BindingGuideDefinition, createCompactBindingGuide } from './shared'

export const compactBindingGuidesPart1: BindingGuideDefinition[] = [
	createCompactBindingGuide({
		slugBase: 'rate-limiting',
		label: 'Rate Limiting',
		categoryDescription:
			'Fixed-window request limits with Miniflare-backed local behavior and a pure mock for unit tests.',
		configKey: 'bindings.rateLimits',
		authoringShape: 'Record<string, { namespaceId; simple: { limit; period } }>',
		localStory:
			'Offline-native: Miniflare and Devflare pure mocks can exercise application-level rate limit behavior',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `ratelimits`',
		envType: '`RateLimit`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockRateLimit()` / `createMockEnv({ rateLimits })`',
		bestFor:
			'login throttles, per-user limits, and API guardrails that can use Cloudflare fixed windows',
		remoteBoundary:
			'Cloudflare owns account namespace ids and production enforcement, but the local limiter is useful for deterministic app tests.',
		configSnippet: {
			title: 'Smallest Rate Limiting config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'limited-worker',
	bindings: {
		rateLimits: {
			LOGIN_RATE_LIMIT: {
				namespaceId: '1001',
				simple: {
					limit: 20,
					period: 60
				}
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Use the limiter in a request path',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const key = request.headers.get('cf-connecting-ip') ?? 'local'
	const outcome = await env.LOGIN_RATE_LIMIT.limit({ key })

	if (!outcome.success) {
		return new Response('slow down', { status: 429 })
	}

	return new Response('ok')
}`
		},
		testSnippet: {
			title: 'Pure unit test for rate-limit branching',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockEnv } from 'devflare/test'

test('blocks the second call in the same window', async () => {
	const env = createMockEnv({
		rateLimits: {
			LOGIN_RATE_LIMIT: { limit: 1, period: 60 }
		}
	})

	expect((await env.LOGIN_RATE_LIMIT.limit({ key: 'user-1' })).success).toBe(true)
	expect((await env.LOGIN_RATE_LIMIT.limit({ key: 'user-1' })).success).toBe(false)
})`
		},
		compileOutput: String.raw`{
	"ratelimits": [
		{ "name": "LOGIN_RATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'version-metadata',
		label: 'Version Metadata',
		categoryDescription:
			'Version identity for deployed Workers, with deterministic metadata in local tests.',
		configKey: 'bindings.versionMetadata',
		authoringShape: '{ binding: string }',
		localStory:
			'Offline-native: Devflare can provide deterministic local metadata without Cloudflare state',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `version_metadata`',
		envType: '`WorkerVersionMetadata`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockVersionMetadata()` / `createMockEnv({ versionMetadata })`',
		bestFor:
			'responses, logs, and diagnostics that need the current Worker version id, tag, or timestamp',
		remoteBoundary:
			'Cloudflare supplies real deployment metadata; local tests should assert deterministic fallback behavior only.',
		configSnippet: {
			title: 'Smallest Version Metadata config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'versioned-worker',
	bindings: {
		versionMetadata: {
			binding: 'CF_VERSION_METADATA'
		}
	}
})`
		},
		usageSnippet: {
			title: 'Return the current version tag',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	return Response.json({
		tag: env.CF_VERSION_METADATA.tag,
		id: env.CF_VERSION_METADATA.id
	})
}`
		},
		testSnippet: {
			title: 'Assert deterministic local metadata',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockEnv } from 'devflare/test'

test('uses deterministic local version metadata', () => {
	const env = createMockEnv({ versionMetadata: 'CF_VERSION_METADATA' })

	expect(env.CF_VERSION_METADATA.tag).toBe('local')
})`
		},
		compileOutput: String.raw`{
	"version_metadata": {
		"binding": "CF_VERSION_METADATA"
	}
}`
	}),
	createCompactBindingGuide({
		slugBase: 'worker-loaders',
		label: 'Worker Loaders',
		categoryDescription:
			'Dynamic Worker loader bindings for apps that explicitly supply or mock tenant Worker payloads.',
		configKey: 'bindings.workerLoaders',
		authoringShape: 'Record<string, {}>',
		localStory:
			'Offline-fixture: the binding exists locally, but tests should supply a Worker stub when behavior matters',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `worker_loaders`',
		envType: '`WorkerLoader`',
		defaultHarness: '`createTestContext()` with explicit Worker payloads or a pure stub',
		testHelper: '`createMockWorkerLoader()` / `createMockEnv({ workerLoaders })`',
		bestFor: 'Dynamic Workers where the app loads Worker code at runtime from an explicit source',
		remoteBoundary:
			'Devflare wires the binding; it does not bundle, upload, discover, or provision dynamic Worker payloads for you.',
		configSnippet: {
			title: 'Smallest Worker Loader config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'loader-worker',
	bindings: {
		workerLoaders: {
			LOADER: {}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Load an explicit Worker payload',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const stub = env.LOADER.get('tenant-a', () => ({
		compatibilityDate: '2026-04-26',
		mainModule: 'index.js',
		modules: {
			'index.js': 'export default { fetch() { return new Response("ok") } }'
		}
	}))

	return stub.fetch(request)
}`
		},
		testSnippet: {
			title: 'Pure test with an explicit Worker stub',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockWorkerLoader } from 'devflare/test'

test('uses a supplied dynamic Worker stub', async () => {
	const loader = createMockWorkerLoader({
		stub: {
			fetch: async () => new Response('tenant-ok')
		}
	})

	const stub = loader.get('tenant-a', () => ({ mainModule: 'index.js', modules: {} }))
	expect(await (await stub.fetch('https://example.com')).text()).toBe('tenant-ok')
})`
		},
		compileOutput: String.raw`{
	"worker_loaders": [
		{ "binding": "LOADER" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'secrets-store',
		label: 'Secrets Store',
		categoryDescription:
			'Account-level Secrets Store bindings with explicit fixture values for offline tests.',
		configKey: 'bindings.secretsStore',
		authoringShape: 'Record<string, { storeId; secretName }>',
		localStory:
			'Offline-native when tests provide fixture values; missing fixtures fail with a non-networked error',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `secrets_store_secrets`',
		envType: '`SecretsStoreSecret`',
		defaultHarness: '`createOfflineEnv()` with `fixtures.secretsStore`',
		testHelper: '`createMockSecretsStoreSecret()` / `createMockEnv({ secretsStore })`',
		bestFor:
			'shared account secrets that should be referenced by store id and secret name instead of copied into config',
		remoteBoundary:
			'Devflare does not read or provision secret values; tests must supply explicit fixtures.',
		configSnippet: {
			title: 'Smallest Secrets Store config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'secret-worker',
	bindings: {
		secretsStore: {
			API_TOKEN: {
				storeId: 'store-123',
				secretName: 'api-token'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Read a Secrets Store value',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const token = await env.API_TOKEN.get()
	return new Response(token.length > 0 ? 'configured' : 'missing')
}`
		},
		testSnippet: {
			title: 'Fixture a Secrets Store value offline',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createOfflineEnv } from 'devflare/test'
import config from '../devflare.config'

test('reads a fixed offline secret', async () => {
	const env = createOfflineEnv(config, {
		secretsStore: {
			API_TOKEN: 'test-token'
		}
	})

	expect(await env.API_TOKEN.get()).toBe('test-token')
})`
		},
		compileOutput: String.raw`{
	"secrets_store_secrets": [
		{ "binding": "API_TOKEN", "store_id": "store-123", "secret_name": "api-token" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'ai-search',
		label: 'AI Search',
		categoryDescription:
			'AI Search instance and namespace bindings with fixture-backed local tests and remote relevance boundaries.',
		configKey: 'bindings.aiSearch',
		authoringShape:
			'Record<string, { instanceName; remote? }> plus `aiSearchNamespaces` for namespace access',
		localStory:
			'Offline-fixture: deterministic in-memory instances can test application flow, not hosted relevance behavior',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/ai-search.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `ai_search` / `ai_search_namespaces`',
		envType: '`AiSearchInstance` or `AiSearchNamespace`',
		defaultHarness: '`createOfflineEnv()` with AI Search fixtures',
		testHelper: '`createMockAISearchInstance()` / `createMockAISearchNamespace()`',
		bestFor:
			'search/chat flows where the app calls an AI Search instance or namespace from a Worker',
		remoteBoundary:
			'Cloudflare owns crawling, indexing, ranking, and hosted model behavior; local mocks only prove app control flow.',
		configSnippet: {
			title: 'Smallest AI Search config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'search-worker',
	bindings: {
		aiSearch: {
			DOCS_SEARCH: {
				instanceName: 'docs-search'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Search one AI Search instance',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const query = new URL(request.url).searchParams.get('q') ?? 'devflare'
	const result = await env.DOCS_SEARCH.search({ query })

	return Response.json(result.chunks)
}`
		},
		testSnippet: {
			title: 'Fixture AI Search results offline',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockAISearchInstance } from 'devflare/test'

test('finds fixture content', async () => {
	const search = createMockAISearchInstance({
		items: [{ key: 'offline.md', content: 'Offline fixtures make tests deterministic' }]
	})

	const result = await search.search({ query: 'fixtures' })
	expect(result.chunks.length).toBeGreaterThan(0)
})`
		},
		compileOutput: String.raw`{
	"ai_search": [
		{ "binding": "DOCS_SEARCH", "instance_name": "docs-search" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'mtls-certificates',
		label: 'mTLS Certificates',
		categoryDescription:
			'mTLS certificate Fetcher bindings with local handler fixtures and remote certificate-presentation boundaries.',
		configKey: 'bindings.mtlsCertificates',
		authoringShape: 'Record<string, string | { certificateId; remote? }>',
		localStory:
			'Offline-fixture: local tests can model Fetcher behavior, but not real certificate presentation',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `mtls_certificates`',
		envType: '`Fetcher`',
		defaultHarness: '`createOfflineEnv()` with `fixtures.mtlsCertificates`',
		testHelper: '`createMockMTLSCertificate()` / `createMockEnv({ mtlsCertificates })`',
		bestFor: 'calling origins that require a Cloudflare-uploaded client certificate',
		remoteBoundary:
			'Real TLS client-certificate presentation is Cloudflare/Wrangler remote behavior.',
		configSnippet: {
			title: 'Smallest mTLS Certificate config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'mtls-worker',
	bindings: {
		mtlsCertificates: {
			CLIENT_CERT: {
				certificateId: 'certificate-uuid'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Fetch through the mTLS binding',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	return env.CLIENT_CERT.fetch('https://origin.example/status')
}`
		},
		testSnippet: {
			title: 'Fixture an mTLS Fetcher locally',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockMTLSCertificate } from 'devflare/test'

test('uses a local mTLS Fetcher fixture', async () => {
	const cert = createMockMTLSCertificate(async () => Response.json({ ok: true }))
	const response = await cert.fetch('https://origin.example/status')

	expect(await response.json()).toEqual({ ok: true })
})`
		},
		compileOutput: String.raw`{
	"mtls_certificates": [
		{ "binding": "CLIENT_CERT", "certificate_id": "certificate-uuid" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'dispatch-namespaces',
		label: 'Dispatch Namespaces',
		categoryDescription:
			'Workers for Platforms dispatch bindings with explicit local tenant fetcher fixtures.',
		configKey: 'bindings.dispatchNamespaces',
		authoringShape: 'Record<string, string | { namespace; outbound?; remote? }>',
		localStory:
			'Offline-fixture: tests can provide named tenant fetchers, but Devflare does not emulate tenant upload/lifecycle',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `dispatch_namespaces`',
		envType: '`DispatchNamespace`',
		defaultHarness: '`createOfflineEnv()` with `fixtures.dispatchNamespaces`',
		testHelper: '`createMockDispatchNamespace()` / `createMockEnv({ dispatchNamespaces })`',
		bestFor: 'platform Workers that dispatch to tenant Workers by name',
		remoteBoundary:
			'Cloudflare owns dispatch namespace creation, tenant uploads, Worker metadata, and production routing.',
		configSnippet: {
			title: 'Smallest Dispatch Namespace config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'platform-worker',
	bindings: {
		dispatchNamespaces: {
			DISPATCHER: {
				namespace: 'tenants'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Dispatch to one tenant Worker',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const tenant = new URL(request.url).searchParams.get('tenant') ?? 'default'
	return env.DISPATCHER.get(tenant).fetch(request)
}`
		},
		testSnippet: {
			title: 'Fixture tenant dispatch locally',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockDispatchNamespace } from 'devflare/test'

test('dispatches to a configured tenant', async () => {
	const dispatcher = createMockDispatchNamespace({
		workers: {
			default: async () => new Response('tenant-ok')
		}
	})

	expect(await (await dispatcher.get('default').fetch('https://example.com')).text()).toBe('tenant-ok')
})`
		},
		compileOutput: String.raw`{
	"dispatch_namespaces": [
		{ "binding": "DISPATCHER", "namespace": "tenants" }
	]
}`
	})
]
