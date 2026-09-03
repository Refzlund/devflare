import { type BindingGuideDefinition, createCompactBindingGuide } from './shared'

export const compactBindingGuidesPart3: BindingGuideDefinition[] = [
	createCompactBindingGuide({
		slugBase: 'stream',
		label: 'Stream',
		categoryDescription:
			'Cloudflare Stream binding docs with singleton config, a local Miniflare-backed simulator, and clear video-upload fidelity boundaries.',
		configKey: 'bindings.stream',
		authoringShape: 'Record<string, true | { remote? }>',
		localStory:
			'Full local support through the native Miniflare Stream plugin (a local StreamObject backed by disk persistence) plus a deterministic pure mock for app-level tests',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/dev-server/miniflare-bindings.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `stream`',
		envType: '`StreamBinding`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockStreamBinding()` / `createMockEnv({ stream })`',
		bestFor: 'video listing and per-video metadata paths where the Worker calls the Stream binding',
		remoteBoundary:
			'Cloudflare owns real video upload, transcode, delivery, signed tokens, and billing; the local mock only models the binding shape.',
		configSnippet: {
			title: 'Smallest Stream config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'stream-worker',
	bindings: {
		stream: {
			STREAM: true
		}
	}
})`
		},
		usageSnippet: {
			title: 'List Stream videos',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const videos = await env.STREAM.videos.list()

	return Response.json({ count: videos.length })
}`
		},
		testSnippet: {
			title: 'Pure Stream shape test',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockStreamBinding } from 'devflare/test'

test('lists no videos by default', async () => {
	const stream = createMockStreamBinding()
	const videos = await stream.videos.list()

	expect(videos).toEqual([])
})`
		},
		compileOutput: String.raw`{
	"stream": {
		"binding": "STREAM"
	}
}`
	}),
	createCompactBindingGuide({
		slugBase: 'vpc-services',
		label: 'VPC Services',
		categoryDescription:
			'VPC service bindings that reach a private service through a Cloudflare VPC connectivity service.',
		configKey: 'bindings.vpcServices',
		authoringShape: 'Record<string, { serviceId; remote? }>',
		localStory:
			'Remote boundary: Miniflare wires VPC services only as a remote proxy client, so there is no offline simulation',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `vpc_services`',
		envType: 'a VPC service `Fetcher`',
		defaultHarness: 'a deployed or remote-mode test against the real VPC service',
		testHelper: 'a custom fake binding injected through `createMockEnv()`',
		bestFor: 'reaching a private upstream service over a Cloudflare VPC connectivity service',
		remoteBoundary:
			'Cloudflare owns the VPC connectivity service and the private network path; there is no local simulation because Miniflare only proxies to the remote service.',
		configSnippet: {
			title: 'Smallest VPC service config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'vpc-service-worker',
	bindings: {
		vpcServices: {
			DB: {
				serviceId: 'service-uuid'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Call a private service over VPC',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	return env.DB.fetch('https://internal.service/health')
}`
		},
		testSnippet: {
			title: 'Test the app flow with a custom VPC fake',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockEnv } from 'devflare/test'

test('reaches the private service over VPC', async () => {
	const env = createMockEnv({
		custom: { DB: { fetch: async () => new Response('ok') } }
	}) as { DB: Fetcher }

	const response = await env.DB.fetch('https://internal.service/health')

	expect(await response.text()).toBe('ok')
})`
		},
		compileOutput: String.raw`{
	"vpc_services": [
		{ "binding": "DB", "service_id": "service-uuid" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'vpc-networks',
		label: 'VPC Networks',
		categoryDescription:
			'VPC network bindings that route traffic through a Cloudflare Tunnel or a network ID.',
		configKey: 'bindings.vpcNetworks',
		authoringShape: 'Record<string, { tunnelId } | { networkId }>',
		localStory:
			'Remote boundary: Miniflare wires VPC networks only as a remote proxy client, so there is no offline simulation',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `vpc_networks`',
		envType: 'a VPC network `Fetcher`',
		defaultHarness: 'a deployed or remote-mode test against the real VPC network',
		testHelper: 'a custom fake binding injected through `createMockEnv()`',
		bestFor: 'routing Worker traffic through a Cloudflare Tunnel or a private network ID',
		remoteBoundary:
			'Cloudflare owns the Tunnel and private network path; there is no local simulation because Miniflare only proxies to the remote network.',
		configSnippet: {
			title: 'Smallest VPC network config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'vpc-network-worker',
	bindings: {
		vpcNetworks: {
			NET: {
				tunnelId: 'tunnel-uuid'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Route a request through the VPC network',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	return env.NET.fetch('https://10.0.0.10/status')
}`
		},
		testSnippet: {
			title: 'Test the app flow with a custom VPC network fake',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockEnv } from 'devflare/test'

test('routes a request through the VPC network', async () => {
	const env = createMockEnv({
		custom: { NET: { fetch: async () => new Response('ok') } }
	}) as { NET: Fetcher }

	const response = await env.NET.fetch('https://10.0.0.10/status')

	expect(await response.text()).toBe('ok')
})`
		},
		compileOutput: String.raw`{
	"vpc_networks": [
		{ "binding": "NET", "tunnel_id": "tunnel-uuid" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'flagship',
		label: 'Flagship',
		categoryDescription:
			'Flagship feature-flag bindings for reading feature flags from Workers, with deterministic pure mocks that return configured flag values.',
		configKey: 'bindings.flagship',
		authoringShape: 'Record<string, { appId; remote? }>',
		localStory:
			"Miniflare's Flagship plugin returns each call's default value locally and ignores the flag key (it does not evaluate flag rules), while Devflare's deterministic pure mock (createMockFlagshipBinding({ flags })) returns configured flag values, falling back to the default",
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/dev-server/miniflare-bindings.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `flagship`',
		envType: '`Flagship`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockFlagshipBinding({ flags })` / `createMockEnv({ flagship })`',
		bestFor: 'application paths where the Worker reads feature flags from the Flagship binding',
		remoteBoundary:
			'Cloudflare owns real targeting-rule evaluation, flag management, and remote flag state; the local mock returns configured values and otherwise the default.',
		configSnippet: {
			title: 'Smallest Flagship config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'flagship-worker',
	bindings: {
		flagship: {
			FLAGS: {
				appId: 'app-id'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Read a boolean flag',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const enabled = await env.FLAGS.getBooleanValue('new-checkout', false)

	return Response.json({ enabled })
}`
		},
		testSnippet: {
			title: 'Pure Flagship flag-reading test',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockFlagshipBinding } from 'devflare/test'

test('returns configured flag value', async () => {
	const flags = createMockFlagshipBinding({ flags: { 'new-checkout': true } })

	expect(await flags.getBooleanValue('new-checkout', false)).toBe(true)
})`
		},
		compileOutput: String.raw`{
	"flagship": [
		{ "binding": "FLAGS", "app_id": "app-id" }
	]
}`
	})
]
