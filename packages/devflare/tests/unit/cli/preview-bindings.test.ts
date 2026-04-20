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
	test('parses Wrangler version binding tables', () => {
		const parsed = parseWranglerVersionBindings(`
Type                    Name                    Resource
Queue                   JOBS                    jobs-queue
Worker                  AUTH_SERVICE            auth-service
Analytics Engine        ANALYTICS               analytics-dataset
`.trim())

		expect(parsed).toEqual([
			{ type: 'Queue', bindingName: 'JOBS', resource: 'jobs-queue' },
			{ type: 'Worker', bindingName: 'AUTH_SERVICE', resource: 'auth-service' },
			{ type: 'Analytics Engine', bindingName: 'ANALYTICS', resource: 'analytics-dataset' }
		])
	})

	test('parses Wrangler version binding tables in the current compact binding/type format', () => {
		const parsed = parseWranglerVersionBindings(`
Binding                      Resource
env.AUTH_SERVICE (demo-auth-service)             Worker
env.SEARCH_INDEX (demo-search-index)             Vectorize Index
env.APP_NAME ("demo-preview")                   Environment Variable
Handlers:             fetch
`.trim())

		expect(parsed).toEqual([
			{ type: 'Worker', bindingName: 'AUTH_SERVICE', resource: 'demo-auth-service' },
			{ type: 'Vectorize Index', bindingName: 'SEARCH_INDEX', resource: 'demo-search-index' },
			{ type: 'Environment Variable', bindingName: 'APP_NAME', resource: '"demo-preview"' }
		])
	})

	test('unified parser strips ANSI color codes from compact-format output', () => {
		const esc = '\u001B'
		const parsed = parseWranglerVersionBindings([
			`${esc}[1mBinding                      Resource${esc}[0m`,
			`  ${esc}[32menv.AUTH_SERVICE (demo-auth-service)${esc}[0m             Worker`,
			`  env.SEARCH_INDEX (demo-search-index)             Vectorize Index`,
			`Handlers:             fetch`
		].join('\n'))

		expect(parsed).toEqual([
			{ type: 'Worker', bindingName: 'AUTH_SERVICE', resource: 'demo-auth-service' },
			{ type: 'Vectorize Index', bindingName: 'SEARCH_INDEX', resource: 'demo-search-index' }
		])
	})

	test('unified parser tolerates indented rows and trailing annotations in legacy-format output', () => {
		const parsed = parseWranglerVersionBindings(`
Type                    Name                    Resource
----------------------------------------------------------
  Queue                   JOBS                    jobs-queue
  Worker                  AUTH_SERVICE            auth-service    (bound)
Handlers: fetch
Compatibility date: 2025-01-01
`.trim())

		expect(parsed).toEqual([
			{ type: 'Queue', bindingName: 'JOBS', resource: 'jobs-queue' },
			{ type: 'Worker', bindingName: 'AUTH_SERVICE', resource: 'auth-service (bound)' }
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

				if (joined === 'bunx wrangler versions view version-demo --name demo-worker') {
					return {
						exitCode: 0,
						stdout: `
Type                    Name                    Resource
Queue                   JOBS                    jobs-queue
Worker                  AUTH_SERVICE            auth-service
`.trim(),
						stderr: '',
						failed: false,
						killed: false
					}
				}

				if (joined === 'bunx wrangler versions view version-other --name other-worker') {
					return {
						exitCode: 0,
						stdout: `
Type                    Name                    Resource
Queue                   JOBS                    jobs-queue
`.trim(),
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
					}
				}
			},
			workerName: 'demo-worker',
			cwd: process.cwd(),
			exec
		})

		const jobsRow = inspection.rows.find((row) => row.resource === 'jobs-queue')
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
		expect(authRow).toBeDefined()
		expect(authRow?.reference).toBe('AUTH_SERVICE')
		expect(authRow?.workerCount).toBe(1)
		expect(authRow?.connectedWorkers).toEqual(['demo-worker'])
		expect(dlqRow).toBeDefined()
		expect(dlqRow?.workerCount).toBe(0)
		expect(dlqRow?.notes).toContain('dead letter queue')
		expect(execCalls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
			'bunx wrangler versions view version-demo --name demo-worker',
			'bunx wrangler versions view version-other --name other-worker',
			'bunx wrangler queues info jobs-queue',
			'bunx wrangler queues info jobs-dlq'
		])
	})
})
