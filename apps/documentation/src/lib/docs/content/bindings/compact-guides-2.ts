import { type BindingGuideDefinition, createCompactBindingGuide } from './shared'

export const compactBindingGuidesPart2: BindingGuideDefinition[] = [
	createCompactBindingGuide({
		slugBase: 'workflows',
		label: 'Workflows',
		categoryDescription:
			'Workflow bindings for starting and inspecting workflow instances from Workers.',
		configKey: 'bindings.workflows',
		authoringShape: 'Record<string, { name; className; scriptName?; limits? }>',
		localStory:
			'Offline-native for application-level calls through Miniflare or deterministic workflow mocks',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts',
			'cases/case16/*'
		],
		compileTarget: 'Wrangler `workflows`',
		envType: '`Workflow`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockWorkflow()` / `createMockEnv({ workflows })`',
		bestFor: 'starting long-running workflow instances from a Worker path',
		remoteBoundary:
			'Devflare does not provision Workflow resources or inspect production instance state; Wrangler/Cloudflare own deployed lifecycle.',
		configSnippet: {
			title: 'Smallest Workflow binding config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'workflow-client',
	bindings: {
		workflows: {
			ORDER_WORKFLOW: {
				name: 'order-workflow',
				className: 'OrderWorkflow'
			}
		}
	}
})`
		},
		usageSnippet: {
			title: 'Create one workflow instance',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const orderId = new URL(request.url).searchParams.get('order') ?? 'demo'
	const instance = await env.ORDER_WORKFLOW.create({
		id: orderId,
		params: { orderId }
	})

	return Response.json({ id: instance.id })
}`
		},
		testSnippet: {
			title: 'Pure workflow call test',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockWorkflow } from 'devflare/test'

test('creates a workflow instance', async () => {
	const workflow = createMockWorkflow()
	const instance = await workflow.create({ id: 'order-1', params: { orderId: 'order-1' } })

	expect(instance.id).toBe('order-1')
})`
		},
		compileOutput: String.raw`{
	"workflows": [
		{ "binding": "ORDER_WORKFLOW", "name": "order-workflow", "class_name": "OrderWorkflow" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'pipelines',
		label: 'Pipelines',
		categoryDescription:
			'Pipeline bindings for event ingestion, with local send recording and Cloudflare-managed sinks.',
		configKey: 'bindings.pipelines',
		authoringShape: 'Record<string, string | { pipeline; remote? }>',
		localStory:
			'Offline-native for send-recording tests; Cloudflare owns production batching and sink delivery',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `pipelines`',
		envType: '`Pipeline`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockPipeline()` / `createMockEnv({ pipelines })`',
		bestFor: 'Worker-side event ingestion into Cloudflare Pipelines',
		remoteBoundary:
			'Devflare records local sends but does not create pipelines, manage R2 sinks, or emulate production batching.',
		configSnippet: {
			title: 'Smallest Pipeline config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'events-worker',
	bindings: {
		pipelines: {
			EVENTS: 'app-events'
		}
	}
})`
		},
		usageSnippet: {
			title: 'Send one record batch',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	await env.EVENTS.send([
		{ timestamp: Date.now(), message: 'signup' }
	])

	return new Response('recorded')
}`
		},
		testSnippet: {
			title: 'Assert recorded Pipeline sends',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockPipeline } from 'devflare/test'

test('records sent pipeline rows', async () => {
	const pipeline = createMockPipeline()
	await pipeline.send([{ message: 'signup' }])

	expect(pipeline._getRecords()).toEqual([{ message: 'signup' }])
})`
		},
		compileOutput: String.raw`{
	"pipelines": [
		{ "binding": "EVENTS", "pipeline": "app-events" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'images',
		label: 'Images',
		categoryDescription:
			'Cloudflare Images binding docs with singleton config, local chain-shape tests, and hosted-image boundaries.',
		configKey: 'bindings.images',
		authoringShape: 'Record<string, true | { remote? }>',
		localStory:
			'Offline-native for low-fidelity chain-shape tests; Wrangler currently supports one Images binding per Worker',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `images`',
		envType: '`ImagesBinding`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()`',
		testHelper: '`createMockImagesBinding()` / `createMockEnv({ images })`',
		bestFor: 'image transformation/upload paths where the Worker calls the Images binding',
		remoteBoundary:
			'The local mock proves call shape; Cloudflare owns hosted image APIs, transform fidelity, billing, and storage.',
		configSnippet: {
			title: 'Smallest Images config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'images-worker',
	bindings: {
		images: {
			IMAGES: true
		}
	}
})`
		},
		usageSnippet: {
			title: 'Transform uploaded image bytes',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	if (!request.body) {
		return new Response('missing image', { status: 400 })
	}

	return env.IMAGES
		.input(request.body)
		.transform({ width: 320 })
		.output({ format: 'image/jpeg' })
}`
		},
		testSnippet: {
			title: 'Pure Images chain-shape test',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockImagesBinding } from 'devflare/test'

test('returns a deterministic image response', async () => {
	const images = createMockImagesBinding()
	const response = await images.input(new Blob(['image'])).transform({ width: 320 }).output()

	expect(response.headers.get('content-type')).toBe('image/png')
})`
		},
		compileOutput: String.raw`{
	"images": {
		"binding": "IMAGES"
	}
}`
	}),
	createCompactBindingGuide({
		slugBase: 'media-transformations',
		label: 'Media Transformations',
		categoryDescription:
			'Media Transformations binding docs with fixture-backed tests and clear remote fidelity boundaries.',
		configKey: 'bindings.media',
		authoringShape: 'Record<string, true | { remote? }>',
		localStory:
			'Offline-fixture: pure tests can model the chain, but real media processing is hosted Cloudflare behavior',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `media`',
		envType: '`MediaBinding`',
		defaultHarness: '`createOfflineEnv()` with media fixtures',
		testHelper: '`createMockMediaBinding()` / `createMockEnv({ media })`',
		bestFor:
			'video/audio transformation paths where the Worker calls Cloudflare Media Transformations',
		remoteBoundary:
			'Cloudflare owns real media output, codecs, duration handling, and billing; local tests only prove call shape.',
		configSnippet: {
			title: 'Smallest Media Transformations config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'media-worker',
	bindings: {
		media: {
			MEDIA: true
		}
	}
})`
		},
		usageSnippet: {
			title: 'Run one media transformation chain',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	if (!request.body) {
		return new Response('missing media', { status: 400 })
	}

	return env.MEDIA
		.input(request.body)
		.transform({ width: 640 })
		.output({ format: 'video/mp4' })
}`
		},
		testSnippet: {
			title: 'Pure Media chain-shape test',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockMediaBinding } from 'devflare/test'

test('returns a deterministic media response', async () => {
	const media = createMockMediaBinding()
	const response = await media.input(new Blob(['media'])).transform({ width: 640 }).output()

	expect(response.headers.get('content-type')).toBe('video/mp4')
})`
		},
		compileOutput: String.raw`{
	"media": {
		"binding": "MEDIA"
	}
}`
	}),
	createCompactBindingGuide({
		slugBase: 'artifacts',
		label: 'Artifacts',
		categoryDescription:
			'Artifacts bindings for Git-compatible file storage, with in-memory repo/token tests.',
		configKey: 'bindings.artifacts',
		authoringShape: 'Record<string, string | { namespace; remote? }>',
		localStory:
			'Offline-fixture: repo metadata and token flows can be modeled in memory, not as real Git remotes',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `artifacts`',
		envType: '`Artifacts`',
		defaultHarness: '`createOfflineEnv()` with artifact fixtures',
		testHelper: '`createMockArtifacts()` / `createMockEnv({ artifacts })`',
		bestFor: 'Worker-managed repo metadata, temporary tokens, and artifact namespace workflows',
		remoteBoundary:
			'Cloudflare owns real Git protocol, durable namespace storage, permissions, and remote URLs.',
		configSnippet: {
			title: 'Smallest Artifacts config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'artifact-worker',
	bindings: {
		artifacts: {
			ARTIFACTS: 'build-artifacts'
		}
	}
})`
		},
		usageSnippet: {
			title: 'Create one Artifacts repository',
			language: 'ts',
			code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const repo = await env.ARTIFACTS.create('run-logs', {
		description: 'CI run logs'
	})

	return Response.json({ remote: repo.remote })
}`
		},
		testSnippet: {
			title: 'Pure Artifacts repo test',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { createMockArtifacts } from 'devflare/test'

test('creates an in-memory artifact repo', async () => {
	const artifacts = createMockArtifacts()
	const repo = await artifacts.create('run-logs')

	expect(repo.name).toBe('run-logs')
})`
		},
		compileOutput: String.raw`{
	"artifacts": [
		{ "binding": "ARTIFACTS", "namespace": "build-artifacts" }
	]
}`
	}),
	createCompactBindingGuide({
		slugBase: 'containers',
		label: 'Containers',
		categoryDescription:
			'Cloudflare Containers config plus a Worker route that hands requests to a container-backed Durable Object.',
		configKey: 'containers',
		authoringShape: 'Array<{ className; image; maxInstances?; instanceType?; imageBuildContext? }>',
		localStory:
			'Offline-native only when an explicit Docker/Podman engine is available and the image can run without pulling',
		sourcePages: [
			'packages/devflare/src/config/schema-runtime.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/containers.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `containers`',
		envType: 'Container class config plus a Durable Object container binding',
		defaultHarness: '`devflare/test` containers helpers guarded by `shouldSkip.containers`',
		testHelper: '`detectContainerEngine()` / `createContainerManager()` / `containers`',
		bestFor:
			'routing requests to a stateful container instance that runs code outside the Workers runtime',
		remoteBoundary:
			'Cloudflare owns deployed container rollout, registry image availability, SSH, scaling, and the full Containers Durable Object runtime.',
		configSnippet: {
			title: 'Smallest Containers config',
			language: 'ts',
			code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'container-worker',
	files: {
		fetch: 'src/container.api.ts',
		durableObjects: 'src/container.api.ts'
	},
	bindings: {
		durableObjects: {
			API_CONTAINER: {
				className: 'ApiContainer'
			}
		}
	},
	containers: [
		{
			className: 'ApiContainer',
			image: 'localhost/devflare-api:latest',
			maxInstances: 1
		}
	],
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ApiContainer']
		}
	]
})`
		},
		usageSnippet: {
			title: 'Proxy one application route to a container instance',
			language: 'ts',
			code: String.raw`import { Container, getContainer } from '@cloudflare/containers'
import { env } from 'devflare/runtime'

export class ApiContainer extends Container {
	defaultPort = 8080
	sleepAfter = '10m'
}

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const sessionId = url.searchParams.get('session') ?? 'public'
	const container = getContainer(env.API_CONTAINER, sessionId)

	return container.fetch(request)
}`
		},
		testSnippet: {
			title: 'Detect Docker or Podman before running container tests',
			language: 'ts',
			code: String.raw`import { expect, test } from 'bun:test'
import { detectContainerEngine } from 'devflare/test'

test('container engine detection is explicit', async () => {
	const engine = await detectContainerEngine()
	expect(['available', 'missing', 'unhealthy']).toContain(engine.status)
})`
		},
		compileOutput: String.raw`{
	"containers": [
		{ "class_name": "ApiContainer", "image": "localhost/devflare-api:latest", "max_instances": 1 }
	],
	"durable_objects": {
		"bindings": [
			{ "name": "API_CONTAINER", "class_name": "ApiContainer" }
		]
	},
	"migrations": [
		{ "tag": "v1", "new_sqlite_classes": ["ApiContainer"] }
	]
}`
	})
]
