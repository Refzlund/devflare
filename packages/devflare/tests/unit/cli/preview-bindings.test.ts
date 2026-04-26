import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
	inspectBindingAssociations,
	parseWranglerQueueInfo,
	parseWranglerVersionBindings
} from '../../../src/cli/preview-bindings'
import { jsonResponse } from '../../helpers/cloudflare-api'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
})

describe('preview binding inspection helpers', () => {
	test('parses Wrangler versions view --json output into association rows', () => {
		const parsed = parseWranglerVersionBindings(JSON.stringify({
			id: 'version-demo',
			metadata: { author_email: 'demo@example.com', created_on: '2025-01-04T00:00:00.000Z' },
			resources: {
				script: { handlers: ['fetch'] },
				script_runtime: { compatibility_date: '2025-01-01' },
				bindings: [
					{ type: 'queue', name: 'JOBS', queue_name: 'jobs-queue' },
					{ type: 'ratelimit', name: 'MY_RATE_LIMITER', namespace_id: '1001' },
					{ type: 'service', name: 'AUTH_SERVICE', service: 'auth-service' },
					{ type: 'worker_loader', name: 'LOADER' },
					{ type: 'mtls_certificate', name: 'API_CERT', certificate_id: 'cert-123' },
					{ type: 'dispatch_namespace', name: 'DISPATCHER', namespace: 'customers' },
					{ type: 'workflow', name: 'ORDER_WORKFLOW', workflow_name: 'orders', class_name: 'OrderWorkflow' },
					{ type: 'pipeline', name: 'EVENTS', pipeline: 'events-stream' },
					{ type: 'images', name: 'IMAGES' },
					{ type: 'media', name: 'MEDIA' },
					{ type: 'artifacts', name: 'ARTIFACTS', namespace: 'default' },
					{ type: 'secrets_store_secret', name: 'API_TOKEN', store_id: 'store-123', secret_name: 'api-token' },
					{ type: 'analytics_engine', name: 'ANALYTICS', dataset: 'analytics-dataset' },
					{ type: 'kv_namespace', name: 'CACHE', namespace_id: 'kv_abc' },
					{ type: 'd1', name: 'DB', id: 'd1_xyz' },
					{ type: 'r2_bucket', name: 'ASSETS', bucket_name: 'assets-bucket' },
					{ type: 'durable_object_namespace', name: 'COUNTER', class_name: 'Counter', script_name: 'main' },
					{ type: 'browser', name: 'BROWSER' },
					{ type: 'ai', name: 'AI' },
					{ type: 'plain_text', name: 'APP_NAME', text: 'demo-preview' },
					{ type: 'secret_text', name: 'API_KEY' }
				]
			}
		}))

		expect(parsed).toEqual([
			{ type: 'Queue', bindingName: 'JOBS', resource: 'jobs-queue' },
			{ type: 'Rate Limiting', bindingName: 'MY_RATE_LIMITER', resource: '1001' },
			{ type: 'Worker', bindingName: 'AUTH_SERVICE', resource: 'auth-service' },
			{ type: 'Worker Loader', bindingName: 'LOADER', resource: 'Worker Loader' },
			{ type: 'mTLS Certificate', bindingName: 'API_CERT', resource: 'cert-123' },
			{ type: 'Dispatch Namespace', bindingName: 'DISPATCHER', resource: 'customers' },
			{ type: 'Workflow', bindingName: 'ORDER_WORKFLOW', resource: 'orders' },
			{ type: 'Pipeline', bindingName: 'EVENTS', resource: 'events-stream' },
			{ type: 'Images', bindingName: 'IMAGES', resource: 'Images' },
			{ type: 'Media Transformations', bindingName: 'MEDIA', resource: 'Media Transformations' },
			{ type: 'Artifacts', bindingName: 'ARTIFACTS', resource: 'default' },
			{ type: 'Secrets Store', bindingName: 'API_TOKEN', resource: 'store-123/api-token' },
			{ type: 'Analytics Engine', bindingName: 'ANALYTICS', resource: 'analytics-dataset' },
			{ type: 'KV Namespace', bindingName: 'CACHE', resource: 'kv_abc' },
			{ type: 'D1 Database', bindingName: 'DB', resource: 'd1_xyz' },
			{ type: 'R2 Bucket', bindingName: 'ASSETS', resource: 'assets-bucket' },
			{ type: 'Durable Object Namespace', bindingName: 'COUNTER', resource: 'Counter' },
			{ type: 'Browser', bindingName: 'BROWSER', resource: 'Browser Rendering' },
			{ type: 'AI', bindingName: 'AI', resource: 'Workers AI' }
		])
	})

	test('parseWranglerVersionBindings returns [] when JSON is malformed or missing bindings', () => {
		expect(parseWranglerVersionBindings('not json')).toEqual([])
		expect(parseWranglerVersionBindings('{}')).toEqual([])
		expect(parseWranglerVersionBindings(JSON.stringify({ resources: {} }))).toEqual([])
		expect(parseWranglerVersionBindings(JSON.stringify({ resources: { bindings: [] } }))).toEqual([])
	})

	test('parseWranglerVersionBindings carries entrypoint suffix on service bindings', () => {
		const parsed = parseWranglerVersionBindings(JSON.stringify({
			resources: {
				bindings: [
					{ type: 'service', name: 'INTERNAL', service: 'core-worker', entrypoint: 'AdminAPI' }
				]
			}
		}))

		expect(parsed).toEqual([
			{ type: 'Worker', bindingName: 'INTERNAL', resource: 'core-worker#AdminAPI' }
		])
	})

	test('parses Wrangler queue info output with inline and multiline worker lists', () => {
		const parsed = parseWranglerQueueInfo(`
Queue Name: jobs-queue
Producers:
  worker:demo-worker
  worker:other-worker
Consumers: worker:demo-worker
`.trim())

		expect(parsed).toEqual({
			queueName: 'jobs-queue',
			producerWorkers: ['demo-worker', 'other-worker'],
			consumerWorkers: ['demo-worker']
		})
	})

	test('aggregates binding associations across deployed workers and queue attachments', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'script_demo',
						name: 'demo-worker',
						created_on: '2025-01-01T00:00:00.000Z',
						modified_on: '2025-01-02T00:00:00.000Z'
					},
					{
						id: 'script_other',
						name: 'other-worker',
						created_on: '2025-01-01T00:00:00.000Z',
						modified_on: '2025-01-02T00:00:00.000Z'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 2,
					total_count: 2
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deploy_demo',
							created_on: '2025-01-04T00:00:00.000Z',
							source: 'api',
							strategy: 'percentage',
							versions: [
								{ percentage: 100, version_id: 'version-demo' }
							],
							annotations: {},
							author_email: 'demo@example.com'
						}
					]
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/other-worker/deployments')) {
				return jsonResponse({
					deployments: [
						{
							id: 'deploy_other',
							created_on: '2025-01-04T00:00:00.000Z',
							source: 'api',
							strategy: 'percentage',
							versions: [
								{ percentage: 100, version_id: 'version-other' }
							],
							annotations: {},
							author_email: 'other@example.com'
						}
					]
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const execCalls: Array<{ command: string; args: string[] }> = []
		const exec = {
			exec: async (command: string, args: string[] = []) => {
				execCalls.push({ command, args })
				const joined = `${command} ${args.join(' ')}`

				if (joined === 'bunx wrangler versions view version-demo --name demo-worker --json') {
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							resources: {
								bindings: [
									{ type: 'queue', name: 'JOBS', queue_name: 'jobs-queue' },
									{ type: 'ratelimit', name: 'MY_RATE_LIMITER', namespace_id: '1001' },
									{ type: 'version_metadata', name: 'CF_VERSION_METADATA' },
									{ type: 'worker_loader', name: 'LOADER' },
									{ type: 'mtls_certificate', name: 'API_CERT', certificate_id: 'cert-123' },
									{ type: 'dispatch_namespace', name: 'DISPATCHER', namespace: 'customers' },
									{ type: 'workflow', name: 'ORDER_WORKFLOW', workflow_name: 'orders', class_name: 'OrderWorkflow' },
									{ type: 'pipeline', name: 'EVENTS', pipeline: 'events-stream' },
									{ type: 'images', name: 'IMAGES' },
									{ type: 'media', name: 'MEDIA' },
									{ type: 'artifacts', name: 'ARTIFACTS', namespace: 'default' },
									{ type: 'secrets_store_secret', name: 'API_TOKEN', store_id: 'store-123', secret_name: 'api-token' },
									{ type: 'service', name: 'AUTH_SERVICE', service: 'auth-service' }
								]
							}
						}),
						stderr: '',
						failed: false,
						killed: false
					}
				}

				if (joined === 'bunx wrangler versions view version-other --name other-worker --json') {
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							resources: {
								bindings: [
									{ type: 'queue', name: 'JOBS', queue_name: 'jobs-queue' }
								]
							}
						}),
						stderr: '',
						failed: false,
						killed: false
					}
				}

				if (joined === 'bunx wrangler queues info jobs-queue') {
					return {
						exitCode: 0,
						stdout: `
Queue Name: jobs-queue
Producers: worker:demo-worker, worker:other-worker
Consumers: worker:demo-worker
`.trim(),
						stderr: '',
						failed: false,
						killed: false
					}
				}

				if (joined === 'bunx wrangler queues info jobs-dlq') {
					return {
						exitCode: 0,
						stdout: `
Queue Name: jobs-dlq
Producers:
Consumers:
`.trim(),
						stderr: '',
						failed: false,
						killed: false
					}
				}

				throw new Error(`Unexpected exec call: ${joined}`)
			},
			spawn: () => {
				throw new Error('spawn should not be called')
			}
		}

		const inspection = await inspectBindingAssociations({
			accountId: 'acc_123',
			config: {
				name: 'demo-worker',
				accountId: 'acc_123',
				compatibilityDate: '2025-01-01',
				compatibilityFlags: [],
				bindings: {
					queues: {
						producers: { JOBS: 'jobs-queue' },
						consumers: [
							{ queue: 'jobs-queue', deadLetterQueue: 'jobs-dlq' }
						]
					},
					services: {
						AUTH_SERVICE: { service: 'auth-service' }
					},
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
						IMAGES: {}
					},
					media: {
						MEDIA: {}
					},
					artifacts: {
						ARTIFACTS: 'default'
					},
					secretsStore: {
						API_TOKEN: {
							storeId: 'store-123',
							secretName: 'api-token'
						}
					}
				},
				tailConsumers: [
					'observability-tail'
				]
			},
			workerName: 'demo-worker',
			cwd: process.cwd(),
			exec
		})

		const jobsRow = inspection.rows.find((row) => row.resource === 'jobs-queue')
		const rateLimitRow = inspection.rows.find((row) => row.resource === '1001')
		const versionMetadataRow = inspection.rows.find((row) => row.reference === 'CF_VERSION_METADATA')
		const workerLoaderRow = inspection.rows.find((row) => row.reference === 'LOADER')
		const mtlsCertificateRow = inspection.rows.find((row) => row.reference === 'API_CERT')
		const dispatchNamespaceRow = inspection.rows.find((row) => row.reference === 'DISPATCHER')
		const workflowRow = inspection.rows.find((row) => row.reference === 'ORDER_WORKFLOW')
		const pipelineRow = inspection.rows.find((row) => row.reference === 'EVENTS')
		const imagesRow = inspection.rows.find((row) => row.reference === 'IMAGES')
		const mediaRow = inspection.rows.find((row) => row.reference === 'MEDIA')
		const artifactsRow = inspection.rows.find((row) => row.reference === 'ARTIFACTS')
		const secretsStoreRow = inspection.rows.find((row) => row.reference === 'API_TOKEN')
		const tailConsumerRow = inspection.rows.find((row) => row.resource === 'observability-tail')
		const authRow = inspection.rows.find((row) => row.resource === 'auth-service')
		const dlqRow = inspection.rows.find((row) => row.resource === 'jobs-dlq')

		expect(inspection.workerName).toBe('demo-worker')
		expect(inspection.scannedWorkers).toEqual(['demo-worker', 'other-worker'])
		expect(jobsRow).toBeDefined()
		expect(jobsRow?.reference).toBe('JOBS')
		expect(jobsRow?.workerCount).toBe(2)
		expect(jobsRow?.connectedWorkers).toEqual(['demo-worker', 'other-worker'])
		expect(jobsRow?.notes).toContain('producer binding')
		expect(jobsRow?.notes).toContain('consumer attachment')
		expect(jobsRow?.notes).toContain('producers 2')
		expect(jobsRow?.notes).toContain('consumers 1')
		expect(rateLimitRow).toBeDefined()
		expect(rateLimitRow?.reference).toBe('MY_RATE_LIMITER')
		expect(rateLimitRow?.type).toBe('Rate Limiting')
		expect(rateLimitRow?.workerCount).toBe(1)
		expect(versionMetadataRow).toBeDefined()
		expect(versionMetadataRow?.type).toBe('Version Metadata')
		expect(versionMetadataRow?.workerCount).toBe(1)
		expect(workerLoaderRow).toBeDefined()
		expect(workerLoaderRow?.type).toBe('Worker Loader')
		expect(workerLoaderRow?.workerCount).toBe(1)
		expect(mtlsCertificateRow).toBeDefined()
		expect(mtlsCertificateRow?.type).toBe('mTLS Certificate')
		expect(mtlsCertificateRow?.resource).toBe('cert-123')
		expect(mtlsCertificateRow?.workerCount).toBe(1)
		expect(dispatchNamespaceRow).toBeDefined()
		expect(dispatchNamespaceRow?.type).toBe('Dispatch Namespace')
		expect(dispatchNamespaceRow?.resource).toBe('customers')
		expect(dispatchNamespaceRow?.workerCount).toBe(1)
		expect(workflowRow).toBeDefined()
		expect(workflowRow?.type).toBe('Workflow')
		expect(workflowRow?.resource).toBe('orders')
		expect(workflowRow?.workerCount).toBe(1)
		expect(pipelineRow).toBeDefined()
		expect(pipelineRow?.type).toBe('Pipeline')
		expect(pipelineRow?.resource).toBe('events-stream')
		expect(pipelineRow?.workerCount).toBe(1)
		expect(imagesRow).toBeDefined()
		expect(imagesRow?.type).toBe('Images')
		expect(imagesRow?.resource).toBe('Images')
		expect(imagesRow?.workerCount).toBe(1)
		expect(mediaRow).toBeDefined()
		expect(mediaRow?.type).toBe('Media Transformations')
		expect(mediaRow?.resource).toBe('Media Transformations')
		expect(mediaRow?.workerCount).toBe(1)
		expect(artifactsRow).toBeDefined()
		expect(artifactsRow?.type).toBe('Artifacts')
		expect(artifactsRow?.resource).toBe('default')
		expect(artifactsRow?.workerCount).toBe(1)
		expect(secretsStoreRow).toBeDefined()
		expect(secretsStoreRow?.type).toBe('Secrets Store')
		expect(secretsStoreRow?.resource).toBe('store-123/api-token')
		expect(secretsStoreRow?.workerCount).toBe(1)
		expect(tailConsumerRow).toBeDefined()
		expect(tailConsumerRow?.type).toBe('Tail Consumer')
		expect(tailConsumerRow?.workerCount).toBe(0)
		expect(authRow).toBeDefined()
		expect(authRow?.reference).toBe('AUTH_SERVICE')
		expect(authRow?.workerCount).toBe(1)
		expect(authRow?.connectedWorkers).toEqual(['demo-worker'])
		expect(dlqRow).toBeDefined()
		expect(dlqRow?.workerCount).toBe(0)
		expect(dlqRow?.notes).toContain('dead letter queue')
		expect(execCalls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
			'bunx wrangler versions view version-demo --name demo-worker --json',
			'bunx wrangler versions view version-other --name other-worker --json',
			'bunx wrangler queues info jobs-queue',
			'bunx wrangler queues info jobs-dlq'
		])
	})
})
