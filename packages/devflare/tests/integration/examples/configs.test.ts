import { describe, expect, test } from 'bun:test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'pathe'
import { createMockEnv } from '../../../src/test'
import {
	compileConfig,
	loadConfig,
	resolveConfigForEnvironment,
	resolveConfigForLocalRuntime,
	type DevflareConfig
} from '../../../src/config'

const repoRoot = resolve(import.meta.dirname, '../../../../../')
const testingAppDir = resolve(repoRoot, 'apps/testing')
const documentationAppDir = resolve(repoRoot, 'apps/documentation')
const testingFetchModulePath = pathToFileURL(resolve(testingAppDir, 'src/fetch.ts')).href
const testingQueueModulePath = pathToFileURL(resolve(testingAppDir, 'src/queue.ts')).href
const testingScheduledModulePath = pathToFileURL(resolve(testingAppDir, 'src/scheduled.ts')).href

interface TestingStatusSummary {
	appName: string
	deploymentChannel: string
	smokeEnabled: boolean
	hasDurableObjectBindings: boolean
	hasServiceBindings: boolean
	hasVectorizeBindings: boolean
	hasAnalyticsBindings: boolean
	hasSendEmailBindings: boolean
	hasHyperdriveBinding: boolean
	bindings: Record<string, unknown>
	lastSmokeResult: TestingSmokeResult | null
	lastQueueJobs: TestingQueueState | null
	lastQueueEmails: TestingQueueState | null
	lastScheduledRun: TestingScheduledState | null
}

interface TestingSmokeResult {
	runId: string
	startedAt: string
	completedAt: string
	ok: boolean
	results: Record<string, { ok: boolean; data?: unknown; error?: string }>
}

interface TestingSmokeSummary extends TestingSmokeResult {
	appName: string
	deploymentChannel: string
}

interface TestingSmokeErrorSummary {
	ok: false
	error: string
	smokeEnabled: boolean
}

interface TestingQueueState {
	appName: string
	queue: string
	messageCount: number
	lastMessage: unknown
	processedAt: string
}

interface TestingScheduledState {
	appName: string
	cron: string
	scheduledTime: number
	ranAt: string
}

interface TestingExampleHarness {
	env: Record<string, unknown>
	sentEmails: Array<{ binding: string; message: unknown }>
	analyticsWrites: Array<{ binding: string; point: unknown }>
	serviceCalls: string[]
	browserRequests: string[]
	jobsQueue: { _getMessages(): Array<{ body: unknown; options?: unknown }> }
	emailsQueue: { _getMessages(): Array<{ body: unknown; options?: unknown }> }
}

function createExecutionContext(): ExecutionContext {
	return {
		props: {},
		waitUntil() { },
		passThroughOnException() { }
	} as unknown as ExecutionContext
}

function createTestingExampleEnv(config: DevflareConfig): TestingExampleHarness {
	const sentEmails: Array<{ binding: string; message: unknown }> = []
	const analyticsWrites: Array<{ binding: string; point: unknown }> = []
	const serviceCalls: string[] = []
	const browserRequests: string[] = []
	const sessionRoomMembers = new Set<string>()
	const collaborationEvents: Array<{ actor: string; kind: string; target: string }> = []
	let lockOwner: string | null = null
	let lockExpiresAt = 0

	const searchVectors = new Map<string, { values: number[]; metadata?: Record<string, unknown> }>()
	const documentVectors = new Map<string, { values: number[]; metadata?: Record<string, unknown> }>()

	const durableObjectBindings = {
		SESSION_ROOM: {
			getByName: () => ({
				async touchMember(memberId: string) {
					sessionRoomMembers.add(memberId)
					return {
						activeMembers: [...sessionRoomMembers].sort(),
						updatedAt: new Date().toISOString()
					}
				},
				async getSummary() {
					return {
						activeMembers: [...sessionRoomMembers].sort(),
						memberCount: sessionRoomMembers.size
					}
				}
			})
		},
		COLLABORATION_STATE: {
			getByName: () => ({
				async recordChange(change: { actor: string; kind: string; target: string }) {
					collaborationEvents.push(change)
					return {
						events: [...collaborationEvents],
						updatedAt: new Date().toISOString()
					}
				},
				async getSummary() {
					return {
						events: [...collaborationEvents],
						eventCount: collaborationEvents.length
					}
				}
			})
		},
		CROSS_WORKER_LOCK: {
			getByName: () => ({
				async acquire(owner: string, ttlMs = 60_000) {
					const now = Date.now()
					if (!lockOwner || lockExpiresAt <= now || lockOwner === owner) {
						lockOwner = owner
						lockExpiresAt = now + ttlMs
						return {
							acquired: true,
							owner: lockOwner,
							expiresAt: lockExpiresAt
						}
					}

					return {
						acquired: false,
						owner: lockOwner,
						expiresAt: lockExpiresAt
					}
				},
				async status() {
					return lockOwner
						? {
							owner: lockOwner,
							expiresAt: lockExpiresAt
						}
						: null
				}
			})
		}
	}

	const serviceBindings = {
		AUTH_SERVICE: {
			getServiceInfo: () => {
				serviceCalls.push('AUTH_SERVICE:getServiceInfo')
				return {
					service: 'devflare-testing-auth-service',
					version: '1.0.0'
				}
			},
			issueServiceToken: (subject: string) => {
				serviceCalls.push('AUTH_SERVICE:issueServiceToken')
				return {
					subject,
					token: `testing-token-${subject}`,
					scopes: ['smoke:run']
				}
			}
		},
		ADMIN_RPC: {
			async getHealth() {
				serviceCalls.push('ADMIN_RPC:getHealth')
				return {
					status: 'healthy'
				}
			},
			async runDiagnostics() {
				serviceCalls.push('ADMIN_RPC:runDiagnostics')
				return {
					queueBacklog: 0
				}
			}
		},
		SEARCH_SERVICE: {
			getServiceInfo: () => {
				serviceCalls.push('SEARCH_SERVICE:getServiceInfo')
				return {
					service: 'devflare-testing-search-service',
					channel: 'staging'
				}
			},
			search: (query: string) => {
				serviceCalls.push('SEARCH_SERVICE:search')
				return {
					query,
					results: [{ id: '1', title: `Result for ${query}`, score: 0.99 }]
				}
			}
		}
	}

	const vectorizeBindings = {
		DOCUMENT_INDEX: {
			async describe() {
				return {
					name: 'devflare-testing-document-index'
				}
			},
			async upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) {
				for (const vector of vectors) {
					documentVectors.set(vector.id, {
						values: vector.values,
						metadata: vector.metadata
					})
				}

				return {
					count: vectors.length,
					ids: vectors.map((vector) => vector.id)
				}
			}
		},
		SEARCH_INDEX: {
			async describe() {
				return {
					name: 'devflare-testing-search-index'
				}
			},
			async upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) {
				for (const vector of vectors) {
					searchVectors.set(vector.id, {
						values: vector.values,
						metadata: vector.metadata
					})
				}

				return {
					count: vectors.length,
					ids: vectors.map((vector) => vector.id)
				}
			},
			async query() {
				const firstMatch = [...searchVectors.entries()][0]
				return {
					matches: firstMatch
						? [{ id: firstMatch[0], metadata: firstMatch[1].metadata, score: 0.99 }]
						: []
				}
			}
		}
	}

	const hyperdriveBindings = {
		POSTGRES: {
			async query() {
				return [{ ok: 1 }]
			}
		}
	}

	const browserBindings = Object.fromEntries(
		Object.keys(config.bindings?.browser ?? {}).map((name) => [name, {
			fetch: async (request: Request) => {
				browserRequests.push(`${name}:${new URL(request.url).pathname}`)
				return new Response(`${name}-ok`, {
					status: 200
				})
			}
		}])
	)

	const analyticsBindings = Object.fromEntries(
		Object.keys(config.bindings?.analyticsEngine ?? {}).map((name) => [name, {
			writeDataPoint: (point: unknown) => {
				analyticsWrites.push({
					binding: name,
					point
				})
			}
		}])
	)

	const sendEmailBindings = Object.fromEntries(
		Object.keys(config.bindings?.sendEmail ?? {}).map((name) => [name, {
			send: async (message: unknown) => {
				sentEmails.push({
					binding: name,
					message
				})
			}
		}])
	)

	const aiBinding = config.bindings?.ai
		? {
			[config.bindings.ai.binding]: {
				run: async (...args: unknown[]) => ({
					ok: true,
					argsLength: args.length
				})
			}
		}
		: {}

	const baseEnv = createMockEnv({
		kv: Object.keys(config.bindings?.kv ?? {}),
		d1: Object.keys(config.bindings?.d1 ?? {}),
		r2: Object.keys(config.bindings?.r2 ?? {}),
		queues: Object.keys(config.bindings?.queues?.producers ?? {}),
		vars: config.vars,
		secrets: Object.fromEntries(
			Object.keys(config.secrets ?? {}).map((name) => [name, `${name.toLowerCase()}-value`])
		)
	})

	const jobsQueue = baseEnv.JOBS as { _getMessages(): Array<{ body: unknown; options?: unknown }> }
	const emailsQueue = baseEnv.EMAILS as { _getMessages(): Array<{ body: unknown; options?: unknown }> }

	const env = createMockEnv({
		custom: {
			...baseEnv,
			...durableObjectBindings,
			...serviceBindings,
			...aiBinding,
			...vectorizeBindings,
			...hyperdriveBindings,
			...browserBindings,
			...analyticsBindings,
			...sendEmailBindings
		}
	})

	return {
		env,
		sentEmails,
		analyticsWrites,
		serviceCalls,
		browserRequests,
		jobsQueue,
		emailsQueue
	}
}

async function runTestingFetch(
	config: DevflareConfig,
	path: string,
	init: RequestInit | undefined,
	harness: TestingExampleHarness,
	type: 'status'
): Promise<{ summary: TestingStatusSummary; harness: TestingExampleHarness }>
async function runTestingFetch(
	config: DevflareConfig,
	path: string,
	init: RequestInit | undefined,
	harness: TestingExampleHarness,
	type: 'smoke'
): Promise<{ summary: TestingSmokeSummary; harness: TestingExampleHarness }>
async function runTestingFetch(
	config: DevflareConfig,
	path: string,
	init: RequestInit | undefined,
	harness: TestingExampleHarness,
	type: 'smoke-error'
): Promise<{ summary: TestingSmokeErrorSummary; harness: TestingExampleHarness }>
async function runTestingFetch(
	config: DevflareConfig,
	path: string,
	init?: RequestInit,
	harness = createTestingExampleEnv(config),
	type: 'status' | 'smoke' | 'smoke-error' = 'status'
): Promise<{ summary: TestingStatusSummary | TestingSmokeSummary | TestingSmokeErrorSummary; harness: TestingExampleHarness }> {
	const { fetch } = await import(testingFetchModulePath) as {
		fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response>
	}
	const request = new Request(`https://example.com${path}`, init)
	const response = await fetch(request, harness.env, createExecutionContext())

	return {
		summary: await response.json() as TestingStatusSummary | TestingSmokeSummary | TestingSmokeErrorSummary,
		harness
	}
}

async function runTestingQueue(config: DevflareConfig, batch: { queue: string; messages: Array<{ body: unknown; ack?(): void }> }): Promise<TestingExampleHarness> {
	const { queue } = await import(testingQueueModulePath) as {
		queue(batch: { queue: string; messages: Array<{ body: unknown; ack?(): void }> }, env: Record<string, unknown>): Promise<void>
	}
	const harness = createTestingExampleEnv(config)
	await queue(batch, harness.env)
	return harness
}

async function runTestingScheduled(config: DevflareConfig): Promise<TestingExampleHarness> {
	const { scheduled } = await import(testingScheduledModulePath) as {
		scheduled(controller: { cron: string; scheduledTime?: number }, env: Record<string, unknown>): Promise<void>
	}
	const harness = createTestingExampleEnv(config)
	await scheduled({
		cron: '0 */6 * * *',
		scheduledTime: 1_700_000_000_000
	}, harness.env)
	return harness
}

describe('repo example app configs', () => {
	test('apps/testing covers the full binding matrix, uses sidecar refs, and keeps preview/production overrides', async () => {
		const config = await loadConfig({ cwd: testingAppDir })
		const preview = resolveConfigForEnvironment(config, 'preview')
		const production = resolveConfigForEnvironment(config, 'production')
		const compiled = compileConfig(resolveConfigForLocalRuntime(config))

		expect(Object.keys(config.bindings?.kv ?? {}).sort()).toEqual(['CACHE', 'SESSIONS'])
		expect(Object.keys(config.bindings?.d1 ?? {}).sort()).toEqual(['AUDIT_DB', 'LEGACY_DB', 'PRIMARY_DB'])
		expect(Object.keys(config.bindings?.r2 ?? {}).sort()).toEqual(['ARCHIVE', 'ASSETS'])
		expect(Object.keys(config.bindings?.durableObjects ?? {}).sort()).toEqual([
			'COLLABORATION_STATE',
			'CROSS_WORKER_LOCK',
			'SESSION_ROOM'
		])
		expect(Object.keys(config.bindings?.queues?.producers ?? {}).sort()).toEqual(['EMAILS', 'JOBS'])
		expect(Object.keys(config.bindings?.services ?? {}).sort()).toEqual([
			'ADMIN_RPC',
			'AUTH_SERVICE',
			'SEARCH_SERVICE'
		])
		expect(config.bindings?.ai).toEqual({ binding: 'AI' })
		expect(Object.keys(config.bindings?.vectorize ?? {}).sort()).toEqual(['DOCUMENT_INDEX', 'SEARCH_INDEX'])
		expect(Object.keys(config.bindings?.hyperdrive ?? {})).toEqual(['POSTGRES'])
		expect(config.bindings?.browser).toEqual({ BROWSER: 'devflare-testing-browser' })
		expect(config.compatibilityFlags).toEqual(expect.arrayContaining(['nodejs_compat']))
		expect(Object.keys(config.bindings?.analyticsEngine ?? {}).sort()).toEqual([
			'APP_ANALYTICS',
			'SEARCH_ANALYTICS'
		])
		expect(Object.keys(config.bindings?.sendEmail ?? {}).sort()).toEqual([
			'SUPPORT_EMAIL',
			'TRANSACTIONAL_EMAIL'
		])

		expect(preview.vars?.APP_NAME).toBe('testing-binding-matrix-preview')
		expect(preview.vars?.DEPLOYMENT_CHANNEL).toBe('preview')
		expect(preview.bindings?.kv?.CACHE).toBe('devflare-testing-cache-kv-preview')
		expect(preview.bindings?.r2?.ASSETS).toBe('devflare-testing-assets-bucket-preview')
		expect(compiled.services).toEqual(expect.arrayContaining([
			{
				binding: 'AUTH_SERVICE',
				service: 'devflare-testing-auth-service'
			},
			{
				binding: 'ADMIN_RPC',
				service: 'devflare-testing-auth-service',
				entrypoint: 'AdminEntrypoint'
			},
			{
				binding: 'SEARCH_SERVICE',
				service: 'devflare-testing-search-service',
				environment: 'staging'
			}
		]))

		expect(production.vars?.APP_NAME).toBe('testing-binding-matrix-production')
		expect(production.vars?.DEPLOYMENT_CHANNEL).toBe('production')
		expect(production.bindings?.kv?.CACHE).toBe('devflare-testing-cache-kv-production')
		expect(production.bindings?.r2?.ASSETS).toBe('devflare-testing-assets-bucket-production')
	})

	test('apps/testing default routes stay cheap and smoke stays guarded until explicitly invoked', async () => {
		const config = await loadConfig({ cwd: testingAppDir })
		const preview = resolveConfigForEnvironment(config, 'preview')

		const previewRun = await runTestingFetch(preview, '/', undefined, createTestingExampleEnv(preview), 'status')
		expect(previewRun.summary.appName).toBe('testing-binding-matrix-preview')
		expect(previewRun.summary.deploymentChannel).toBe('preview')
		expect(previewRun.summary.smokeEnabled).toBe(true)
		expect(previewRun.summary.hasDurableObjectBindings).toBe(true)
		expect(previewRun.summary.hasServiceBindings).toBe(true)
		expect(previewRun.summary.hasVectorizeBindings).toBe(true)
		expect(previewRun.summary.hasAnalyticsBindings).toBe(true)
		expect(previewRun.summary.hasSendEmailBindings).toBe(true)
		expect(previewRun.summary.hasHyperdriveBinding).toBe(true)
		expect(previewRun.summary.lastSmokeResult).toBeNull()
		expect(previewRun.harness.sentEmails).toHaveLength(0)
		expect(previewRun.harness.analyticsWrites).toHaveLength(0)
		expect(previewRun.harness.serviceCalls).toHaveLength(0)
		expect(previewRun.harness.browserRequests).toHaveLength(0)
		expect(previewRun.harness.jobsQueue._getMessages()).toHaveLength(0)
		expect(previewRun.harness.emailsQueue._getMessages()).toHaveLength(0)
		expect('AI' in previewRun.harness.env).toBe(true)
		expect('SESSION_ROOM' in previewRun.harness.env).toBe(true)
		expect('POSTGRES' in previewRun.harness.env).toBe(true)

		const unauthorizedRun = await runTestingFetch(preview, '/smoke', {
			method: 'POST'
		}, createTestingExampleEnv(preview), 'smoke-error')
		expect(unauthorizedRun.summary.ok).toBe(false)
		expect(unauthorizedRun.summary.error).toBe('Missing or invalid X-Devflare-Smoke-Key header')
	})

	test('apps/testing guarded smoke route exercises the full matrix and persists status', async () => {
		const config = await loadConfig({ cwd: testingAppDir })
		const preview = resolveConfigForEnvironment(config, 'preview')
		const harness = createTestingExampleEnv(preview)
		const smokeRun = await runTestingFetch(preview, '/smoke', {
			method: 'POST',
			headers: {
				'X-Devflare-Smoke-Key': 'smoke_key-value'
			}
		}, harness, 'smoke')

		expect(smokeRun.summary.appName).toBe('testing-binding-matrix-preview')
		expect(smokeRun.summary.ok).toBe(true)
		expect(smokeRun.summary.results.kv.ok).toBe(true)
		expect(smokeRun.summary.results.d1.ok).toBe(true)
		expect(smokeRun.summary.results.r2.ok).toBe(true)
		expect(smokeRun.summary.results.durableObjects.ok).toBe(true)
		expect(smokeRun.summary.results.queues.ok).toBe(true)
		expect(smokeRun.summary.results.services.ok).toBe(true)
		expect(smokeRun.summary.results.ai.ok).toBe(true)
		expect(smokeRun.summary.results.vectorize.ok).toBe(true)
		expect(smokeRun.summary.results.hyperdrive.ok).toBe(true)
		expect(smokeRun.summary.results.browser.ok).toBe(true)
		expect(smokeRun.summary.results.analytics.ok).toBe(true)
		expect(smokeRun.summary.results.sendEmail.ok).toBe(true)
		expect(smokeRun.harness.sentEmails).toHaveLength(2)
		expect(smokeRun.harness.analyticsWrites).toHaveLength(2)
		expect(smokeRun.harness.serviceCalls).toEqual([
			'AUTH_SERVICE:getServiceInfo',
			'AUTH_SERVICE:issueServiceToken',
			'ADMIN_RPC:getHealth',
			'ADMIN_RPC:runDiagnostics',
			'SEARCH_SERVICE:getServiceInfo',
			'SEARCH_SERVICE:search'
		])
		expect(smokeRun.harness.browserRequests).toEqual(['BROWSER:/'])
		expect(smokeRun.harness.jobsQueue._getMessages()).toHaveLength(1)
		expect(smokeRun.harness.emailsQueue._getMessages()).toHaveLength(1)

		const statusRun = await runTestingFetch(preview, '/status', undefined, harness, 'status')
		expect(statusRun.summary.lastSmokeResult?.runId).toBe(smokeRun.summary.runId)
	})

	test('apps/testing queue and scheduled handlers record their latest activity in KV', async () => {
		const config = await loadConfig({ cwd: testingAppDir })
		const preview = resolveConfigForEnvironment(config, 'preview')

		const queueHarness = await runTestingQueue(preview, {
			queue: 'devflare-testing-jobs-queue',
			messages: [{ body: { type: 'job-smoke' } }]
		})
		const queueState = await (queueHarness.env.SESSIONS as KVNamespace).get('testing:queue:jobs:last')
		expect(queueState).not.toBeNull()

		const scheduledHarness = await runTestingScheduled(preview)
		const scheduledState = await (scheduledHarness.env.SESSIONS as KVNamespace).get('testing:scheduled:last-run')
		expect(scheduledState).not.toBeNull()
	})

	test('apps/documentation compiles into a preview-capable generated Wrangler config', async () => {
		const config = await loadConfig({ cwd: documentationAppDir })
		const compiled = compileConfig(config)

		expect(compiled.name).toBe('devflare-docs')
		expect(compiled.main).toBe('.adapter-cloudflare/_worker.js')
		expect(compiled.assets).toEqual({
			binding: 'ASSETS',
			directory: '.adapter-cloudflare'
		})
		expect(compiled.preview_urls).toBe(true)
		expect(compiled.workers_dev).toBe(true)
		expect(config.files?.fetch).toBe('.adapter-cloudflare/_worker.js')
		expect(config.assets).toEqual({
			binding: 'ASSETS',
			directory: '.adapter-cloudflare'
		})
	})
})