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
			'Full local support through Miniflare workflow bindings and deterministic workflow mocks',
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
			'Cloudflare owns deployed Workflow durability, retries, scheduling, and production instance history.',
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
			title: 'Define and start one order workflow',
			language: 'ts',
			code: String.raw`import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { env } from 'devflare/runtime'

type OrderWorkflowParams = {
	orderId: string
	email: string
}

export class OrderWorkflow extends WorkflowEntrypoint<DevflareEnv, OrderWorkflowParams> {
	async run(event: WorkflowEvent<OrderWorkflowParams>, step: WorkflowStep): Promise<unknown> {
		const invoice = await step.do('create invoice', async () => {
			return { id: 'inv_' + event.payload.orderId, email: event.payload.email }
		})

		await step.do('send confirmation', async () => {
			await fetch('https://api.example.com/confirmations', {
				method: 'POST',
				body: JSON.stringify(invoice)
			})
			return { queued: true }
		})

		return invoice
	}
}

export async function fetch(request: Request): Promise<Response> {
	const orderId = new URL(request.url).searchParams.get('order') ?? 'demo'
	const instance = await env.ORDER_WORKFLOW.create({
		id: orderId,
		params: { orderId, email: 'customer@example.com' }
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
			'Full local support through Miniflare image bindings, persisted local state, and deterministic pure mocks',
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
			'Cloudflare owns hosted image storage, variants, delivery rules, billing, and final transform fidelity.',
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
	const result = await images.input(new Blob(['image']).stream()).transform({ width: 320 }).output({ format: 'image/png' })

	expect(result.response().headers.get('content-type')).toBe('image/png')
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
			'Media Transformations binding docs with local transform-chain support and clear codec fidelity boundaries.',
		configKey: 'bindings.media',
		authoringShape: 'Record<string, true | { remote? }>',
		localStory:
			'Full local support through Miniflare media bindings and deterministic pure mocks for transform chains',
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/compiler.ts',
			'packages/devflare/src/test/utilities.ts',
			'packages/devflare/src/test/offline-bindings.ts'
		],
		compileTarget: 'Wrangler `media`',
		envType: '`MediaBinding`',
		defaultHarness: '`createTestContext()` or `createOfflineEnv()` with media fixtures',
		testHelper: '`createMockMediaBinding()` / `createMockEnv({ media })`',
		bestFor:
			'video/audio transformation paths where the Worker calls Cloudflare Media Transformations',
		remoteBoundary:
			'Cloudflare owns real codecs, output fidelity, duration handling, cache behavior, and billing.',
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
	const result = media.input(new Blob(['media']).stream()).transform({ width: 640 }).output({ mode: 'video' })
	const response = await result.response()

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
			'packages/devflare/src/test/offline-bindings.ts',
			'https://developers.cloudflare.com/containers/get-started/',
			'https://developers.cloudflare.com/containers/platform-details/image-management/',
			'https://developers.cloudflare.com/containers/container-class/',
			'https://developers.cloudflare.com/workers/wrangler/configuration/#containers'
		],
		compileTarget: 'Wrangler `containers`',
		envType: 'Container class config plus a Durable Object container binding',
		defaultHarness: '`devflare/test` containers helpers guarded by `shouldSkip.containers`',
		testHelper: '`detectContainerEngine()` / `createContainerManager()` / `containers`',
		bestFor:
			'routing requests to a stateful container instance that runs code outside the Workers runtime',
		remoteBoundary:
			'Cloudflare owns deployed container rollout, managed registry availability, SSH, scaling, and hosted platform behavior; Devflare owns the Docker/Podman local loop.',
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
			imageBuildContext: './containers/api',
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
	const status = await detectContainerEngine()
	if (!status.available) {
		expect(status.reason.length).toBeGreaterThan(0)
		return
	}

	expect(['docker', 'podman']).toContain(status.engine)
})`
		},
		overviewSections: [
			{
				id: 'container-image-workflow',
				title: 'Build and reference the image deliberately',
				paragraphs: [
					'Devflare treats the `containers` entry as the contract between the Worker class and a real container image. For local work, point `image` at a tag that already exists in Docker or Podman, or point it at a local Dockerfile path that Devflare can build from files on disk.',
					'Cloudflare uses the same container idea in the hosted lane: Wrangler accepts a Dockerfile path or an image reference. Dockerfile paths are built locally and pushed during deploy, while image references can come from the Cloudflare Registry, Docker Hub, or Amazon ECR.'
				],
				snippets: [
					{
						title: 'Build the local image with Docker or Podman',
						language: 'bash',
						code: String.raw`docker build -t localhost/devflare-api:latest ./containers/api
docker image inspect localhost/devflare-api:latest

podman build -t localhost/devflare-api:latest ./containers/api
podman image inspect localhost/devflare-api:latest`
					},
					{
						title: 'Reference that local image from Devflare config',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'container-worker',
	containers: [
		{
			className: 'ApiContainer',
			image: 'localhost/devflare-api:latest',
			imageBuildContext: './containers/api',
			maxInstances: 1
		}
	]
})`
					},
					{
						title: 'Use a Dockerfile or registry image for the Cloudflare lane',
						language: 'bash',
						code: String.raw`wrangler containers build ./containers/api -t devflare-api:latest
wrangler containers push devflare-api:latest

# Cloudflare can also reference registry images such as:
# registry.cloudflare.com/<account-id>/devflare-api:latest
# docker.io/library/nginx:alpine
# <account>.dkr.ecr.<region>.amazonaws.com/devflare-api:latest`
					}
				],
				bullets: [
					'Use `image: "./containers/api/Dockerfile"` or `image: "./containers/api"` when you want Wrangler deploy to build and push from source.',
					'Use `image: "localhost/devflare-api:latest"` for a local tag that Docker or Podman can inspect without a network pull.',
					'Use `registry.cloudflare.com/<account-id>/<image>:<tag>` for Cloudflare Registry images, Docker Hub names such as `docker.io/library/nginx:alpine`, or Amazon ECR image references when the hosted deploy should pull a prebuilt image.',
					'Use `wrangler containers registries configure` when the image lives in a private external registry.'
				]
			},
			{
				id: 'container-local-requirements',
				title: 'Full local support requirements',
				paragraphs: [
					'Full local support means Devflare can build, launch, call, inspect, and clean up the container without Cloudflare when the local machine has a working Docker or Podman engine.',
					'The offline-first default is strict: Dockerfile builds use cached base layers, and image references must already exist locally. Set `offline: false` only when the test is allowed to pull from a registry.'
				],
				snippets: [
					{
						title: 'Run a container-backed route test only when the engine is available',
						language: 'ts',
						code: String.raw`import { afterAll, expect, test } from 'bun:test'
import { containers, shouldSkip } from 'devflare/test'

const skipContainers = await shouldSkip.containers

afterAll(() => containers.stopAll())

test.skipIf(skipContainers)('proxies to the local API container', async () => {
	const api = await containers.start('ApiContainer', {
		configPath: 'devflare.config.ts',
		port: 8080,
		offline: true
	})

	const response = await api.fetch('/health')
	expect(response.status).toBe(200)
})`
					}
				],
				bullets: [
					'Install Docker or Podman and make sure `docker info` or `podman info` succeeds before running container tests.',
					'Set `DEVFLARE_CONTAINER_TESTS=1` for test lanes that are allowed to start local containers.',
					'Gate CI and hosted runners with `shouldSkip.containers` because GitHub Actions, Cloudflare runners, and preview workers may not expose a usable container engine.',
					'Keep base images cached when running offline. A missing local tag or uncached base layer is a setup problem, not a reason to silently reach out to a registry.'
				]
			}
		],
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
