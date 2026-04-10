import { readJson, stateKeys, writeJson } from './state'

interface SmokeCheckResult<T = unknown> {
	ok: boolean
	data?: T
	error?: string
}

interface StoredQueueResult {
	appName: string
	queue: string
	messageCount: number
	lastMessage: unknown
	processedAt: string
}

interface StoredScheduledResult {
	appName: string
	cron: string
	scheduledTime: number
	ranAt: string
}

interface StoredSmokeResult {
	runId: string
	startedAt: string
	completedAt: string
	ok: boolean
	results: Record<string, SmokeCheckResult>
}

interface QueueBinding {
	send(message: unknown, options?: unknown): Promise<void>
}

interface SessionRoomStub {
	touchMember(memberId: string): Promise<unknown>
	getSummary(): Promise<unknown>
}

interface CollaborationStateStub {
	recordChange(change: { actor: string; kind: string; target: string }): Promise<unknown>
	getSummary(): Promise<unknown>
}

interface CrossWorkerLockStub {
	acquire(owner: string, ttlMs?: number): Promise<unknown>
	status(): Promise<unknown>
}

interface DurableObjectNamespaceLike<T> {
	getByName(name: string): T
}

interface AuthServiceRpc {
	getServiceInfo(): Promise<unknown> | unknown
	issueServiceToken(subject: string): Promise<unknown> | unknown
}

interface AdminRpc {
	getHealth(): Promise<unknown>
	runDiagnostics?(): Promise<unknown>
}

interface SearchServiceRpc {
	getServiceInfo(): Promise<unknown> | unknown
	search(query: string): Promise<unknown> | unknown
}

interface VectorizeBinding {
	describe?(): Promise<unknown>
	upsert?(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<unknown>
	query?(vector: number[], options?: { topK?: number; returnMetadata?: boolean }): Promise<unknown>
}

interface HyperdriveSocketInfo {
	remoteAddress?: string
	localAddress?: string
}

interface HyperdriveSocket {
	opened: Promise<HyperdriveSocketInfo>
	close(): Promise<void>
}

interface HyperdriveBinding {
	query?(sql: string): Promise<unknown>
	connect?(): HyperdriveSocket
	connectionString?: string
	host?: string
	port?: number
	database?: string
}

interface BrowserFetchLike {
	fetch?(request: Request): Promise<Response>
}

interface AIBinding {
	run(model: string, input: unknown, options?: unknown): Promise<unknown>
}

interface EmailBinding {
	send(message: unknown): Promise<void>
}

interface AnalyticsBinding {
	writeDataPoint(point: unknown): void
}

interface TestingEnv {
	APP_NAME: string
	DEPLOYMENT_CHANNEL?: string
	AI_MODEL?: string
	BROWSER_TARGET_URL?: string
	MAIL_FROM?: string
	OPS_EMAIL?: string
	SUPPORT_EMAIL_ADDRESS?: string
	API_TOKEN?: string
	OPTIONAL_WEBHOOK_SECRET?: string
	SMOKE_KEY?: string
	CACHE: KVNamespace
	SESSIONS: KVNamespace
	PRIMARY_DB: D1Database
	AUDIT_DB: D1Database
	LEGACY_DB: D1Database
	ASSETS: R2Bucket
	ARCHIVE: R2Bucket
	SESSION_ROOM: DurableObjectNamespaceLike<SessionRoomStub>
	COLLABORATION_STATE: DurableObjectNamespaceLike<CollaborationStateStub>
	CROSS_WORKER_LOCK: DurableObjectNamespaceLike<CrossWorkerLockStub>
	JOBS: QueueBinding
	EMAILS: QueueBinding
	AUTH_SERVICE: AuthServiceRpc
	ADMIN_RPC: AdminRpc
	SEARCH_SERVICE: SearchServiceRpc
	AI: AIBinding
	DOCUMENT_INDEX: VectorizeBinding
	SEARCH_INDEX: VectorizeBinding
	POSTGRES?: HyperdriveBinding
	BROWSER?: BrowserFetchLike
	APP_ANALYTICS: AnalyticsBinding
	SEARCH_ANALYTICS: AnalyticsBinding
	TRANSACTIONAL_EMAIL: EmailBinding
	SUPPORT_EMAIL: EmailBinding
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}

	return String(error)
}

function truncatePreview(value: unknown): string {
	const text = typeof value === 'string'
		? value
		: JSON.stringify(value)

	if (!text) return 'null'
	return text.length > 240 ? `${text.slice(0, 237)}...` : text
}

function createBindingsSummary(env: TestingEnv): Record<string, unknown> {
	return {
		kv: {
			CACHE: Boolean(env.CACHE),
			SESSIONS: Boolean(env.SESSIONS)
		},
		d1: {
			PRIMARY_DB: Boolean(env.PRIMARY_DB),
			AUDIT_DB: Boolean(env.AUDIT_DB),
			LEGACY_DB: Boolean(env.LEGACY_DB)
		},
		r2: {
			ASSETS: Boolean(env.ASSETS),
			ARCHIVE: Boolean(env.ARCHIVE)
		},
		durableObjects: {
			SESSION_ROOM: Boolean(env.SESSION_ROOM),
			COLLABORATION_STATE: Boolean(env.COLLABORATION_STATE),
			CROSS_WORKER_LOCK: Boolean(env.CROSS_WORKER_LOCK)
		},
		queues: {
			JOBS: Boolean(env.JOBS),
			EMAILS: Boolean(env.EMAILS)
		},
		services: {
			AUTH_SERVICE: Boolean(env.AUTH_SERVICE),
			ADMIN_RPC: Boolean(env.ADMIN_RPC),
			SEARCH_SERVICE: Boolean(env.SEARCH_SERVICE)
		},
		ai: {
			AI: Boolean(env.AI)
		},
		vectorize: {
			DOCUMENT_INDEX: Boolean(env.DOCUMENT_INDEX),
			SEARCH_INDEX: Boolean(env.SEARCH_INDEX)
		},
		hyperdrive: {
			POSTGRES: Boolean(env.POSTGRES)
		},
		browser: {
			BROWSER: Boolean(env.BROWSER)
		},
		analyticsEngine: {
			APP_ANALYTICS: Boolean(env.APP_ANALYTICS),
			SEARCH_ANALYTICS: Boolean(env.SEARCH_ANALYTICS)
		},
		sendEmail: {
			TRANSACTIONAL_EMAIL: Boolean(env.TRANSACTIONAL_EMAIL),
			SUPPORT_EMAIL: Boolean(env.SUPPORT_EMAIL)
		},
		secrets: {
			API_TOKEN: Boolean(env.API_TOKEN),
			OPTIONAL_WEBHOOK_SECRET: Boolean(env.OPTIONAL_WEBHOOK_SECRET),
			SMOKE_KEY: Boolean(env.SMOKE_KEY)
		}
	}
}

async function buildStatusResponse(env: TestingEnv): Promise<Record<string, unknown>> {
	const [lastSmokeResult, lastQueueJobs, lastQueueEmails, lastScheduledRun] = await Promise.all([
		readJson<StoredSmokeResult>(env.SESSIONS, stateKeys.smokeResult),
		readJson<StoredQueueResult>(env.SESSIONS, stateKeys.queueJobs),
		readJson<StoredQueueResult>(env.SESSIONS, stateKeys.queueEmails),
		readJson<StoredScheduledResult>(env.SESSIONS, stateKeys.scheduled)
	])

	return {
		appName: env.APP_NAME,
		deploymentChannel: env.DEPLOYMENT_CHANNEL ?? 'development',
		smokeEnabled: Boolean(env.SMOKE_KEY),
		routes: {
			status: 'GET /status',
			health: 'GET /health',
			smoke: 'POST /smoke with X-Devflare-Smoke-Key'
		},
		hasDurableObjectBindings: Boolean(env.SESSION_ROOM && env.COLLABORATION_STATE && env.CROSS_WORKER_LOCK),
		hasServiceBindings: Boolean(env.AUTH_SERVICE && env.ADMIN_RPC && env.SEARCH_SERVICE),
		hasVectorizeBindings: Boolean(env.DOCUMENT_INDEX && env.SEARCH_INDEX),
		hasAnalyticsBindings: Boolean(env.APP_ANALYTICS && env.SEARCH_ANALYTICS),
		hasSendEmailBindings: Boolean(env.TRANSACTIONAL_EMAIL && env.SUPPORT_EMAIL),
		hasHyperdriveBinding: Boolean(env.POSTGRES),
		bindings: createBindingsSummary(env),
		lastSmokeResult,
		lastQueueJobs,
		lastQueueEmails,
		lastScheduledRun
	}
}

function authorizeSmokeRequest(request: Request, env: TestingEnv): { ok: true } | { ok: false; status: number; error: string } {
	if (!env.SMOKE_KEY) {
		return {
			ok: false,
			status: 503,
			error: 'SMOKE_KEY secret is not configured for this deployment'
		}
	}

	const provided = request.headers.get('x-devflare-smoke-key')
		?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

	if (provided !== env.SMOKE_KEY) {
		return {
			ok: false,
			status: 401,
			error: 'Missing or invalid X-Devflare-Smoke-Key header'
		}
	}

	return { ok: true }
}

async function settle<T>(operation: Promise<T>): Promise<SmokeCheckResult<T>> {
	try {
		return {
			ok: true,
			data: await operation
		}
	} catch (error) {
		return {
			ok: false,
			error: formatError(error)
		}
	}
}

async function smokeKv(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	const cacheKey = `smoke:${runId}:cache`
	const sessionKey = `smoke:${runId}:session`

	await env.CACHE.put(cacheKey, runId)
	await env.SESSIONS.put(sessionKey, `session-${runId}`)

	return {
		cacheKey,
		cacheValue: await env.CACHE.get(cacheKey),
		sessionValue: await env.SESSIONS.get(sessionKey)
	}
}

async function runD1HealthCheck(database: D1Database): Promise<boolean> {
	const result = await database.prepare('select 1 as ok').first<{ ok: number }>()
	return result?.ok === 1
}

async function smokeD1(env: TestingEnv): Promise<Record<string, unknown>> {
	return {
		primary: await runD1HealthCheck(env.PRIMARY_DB),
		audit: await runD1HealthCheck(env.AUDIT_DB),
		legacy: await runD1HealthCheck(env.LEGACY_DB)
	}
}

async function smokeR2(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	const assetKey = `smoke/${runId}/asset.txt`
	const archiveKey = `smoke/${runId}/archive.txt`

	await env.ASSETS.put(assetKey, runId)
	await env.ARCHIVE.put(archiveKey, runId)

	const assetValue = await env.ASSETS.get(assetKey)
	const archiveValue = await env.ARCHIVE.get(archiveKey)

	await env.ASSETS.delete(assetKey)
	await env.ARCHIVE.delete(archiveKey)

	return {
		assetValue: assetValue ? await assetValue.text() : null,
		archiveValue: archiveValue ? await archiveValue.text() : null
	}
}

async function smokeDurableObjects(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	const room = env.SESSION_ROOM.getByName('smoke-room')
	const collaboration = env.COLLABORATION_STATE.getByName('smoke-room')
	const lock = env.CROSS_WORKER_LOCK.getByName('smoke-lock')

	return {
		roomTouch: await room.touchMember(runId),
		roomSummary: await room.getSummary(),
		collaborationUpdate: await collaboration.recordChange({
			actor: 'smoke-runner',
			kind: 'verification',
			target: runId
		}),
		collaborationSummary: await collaboration.getSummary(),
		lockAcquire: await lock.acquire(runId),
		lockStatus: await lock.status()
	}
}

async function smokeQueues(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	await env.JOBS.send({
		runId,
		type: 'job-smoke',
		queuedAt: new Date().toISOString()
	})

	await env.EMAILS.send({
		runId,
		type: 'email-smoke',
		queuedAt: new Date().toISOString()
	})

	return {
		enqueuedQueues: ['JOBS', 'EMAILS']
	}
}

async function smokeServices(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	const [authInfo, token, adminHealth, diagnostics, searchInfo, searchResult] = await Promise.all([
		Promise.resolve(env.AUTH_SERVICE.getServiceInfo()),
		Promise.resolve(env.AUTH_SERVICE.issueServiceToken(runId)),
		env.ADMIN_RPC.getHealth(),
		env.ADMIN_RPC.runDiagnostics?.() ?? null,
		Promise.resolve(env.SEARCH_SERVICE.getServiceInfo()),
		Promise.resolve(env.SEARCH_SERVICE.search('devflare smoke'))
	])

	return {
		authInfo,
		token,
		adminHealth,
		diagnostics,
		searchInfo,
		searchResult
	}
}

async function smokeAi(env: TestingEnv): Promise<Record<string, unknown>> {
	const aiResult = await env.AI.run(env.AI_MODEL ?? '@cf/meta/llama-3.1-8b-instruct', {
		messages: [
			{ role: 'system', content: 'Reply with OK only.' },
			{ role: 'user', content: 'Confirm the testing smoke endpoint is online.' }
		],
		max_tokens: 4
	})

	return {
		preview: truncatePreview(aiResult)
	}
}

async function smokeVectorize(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	const vector = Array.from({ length: 32 }, (_, index) => Number(((index + 1) / 100).toFixed(2)))

	return {
		documentIndex: await env.DOCUMENT_INDEX.describe?.(),
		searchIndex: await env.SEARCH_INDEX.describe?.(),
		documentUpsert: await env.DOCUMENT_INDEX.upsert?.([
			{
				id: `document-${runId}`,
				values: vector,
				metadata: { runId, kind: 'document' }
			}
		]),
		searchUpsert: await env.SEARCH_INDEX.upsert?.([
			{
				id: `search-${runId}`,
				values: vector,
				metadata: { runId, kind: 'search' }
			}
		]),
		query: await env.SEARCH_INDEX.query?.(vector, {
			topK: 1,
			returnMetadata: true
		})
	}
}

async function smokeHyperdrive(env: TestingEnv): Promise<Record<string, unknown>> {
	if (!env.POSTGRES) {
		throw new Error('POSTGRES binding is missing')
	}

	if (typeof env.POSTGRES.query === 'function') {
		return {
			mode: 'query',
			result: await env.POSTGRES.query('select 1 as ok')
		}
	}

	if (typeof env.POSTGRES.connect === 'function') {
		const socket = env.POSTGRES.connect()

		try {
			const opened = await socket.opened
		return {
				mode: 'socket',
				hasConnectionString: Boolean(env.POSTGRES.connectionString),
				remoteAddress: opened.remoteAddress ?? null,
				localAddress: opened.localAddress ?? null,
				host: env.POSTGRES.host ?? null,
				port: env.POSTGRES.port ?? null,
				database: env.POSTGRES.database ?? null
			}
		} finally {
			await socket.close().catch(() => undefined)
		}
	}

	throw new Error('Hyperdrive binding does not expose query() or connect()')
}

async function smokeBrowser(env: TestingEnv): Promise<Record<string, unknown>> {
	if (!env.BROWSER) {
		throw new Error('BROWSER binding is missing')
	}

	if (typeof env.BROWSER.fetch !== 'function') {
		throw new Error('Browser binding does not expose fetch()')
	}

	const response = await env.BROWSER.fetch(new Request(env.BROWSER_TARGET_URL ?? 'https://example.com/'))
	return {
		mode: 'fetch',
		status: response.status,
		ok: response.ok
	}
}

async function smokeAnalytics(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	env.APP_ANALYTICS.writeDataPoint({
		indexes: [env.APP_NAME],
		blobs: [runId]
	})

	env.SEARCH_ANALYTICS.writeDataPoint({
		indexes: ['search'],
		blobs: ['devflare smoke']
	})

	return {
		appAnalytics: true,
		searchAnalytics: true
	}
}

async function smokeSendEmail(env: TestingEnv, runId: string): Promise<Record<string, unknown>> {
	const from = env.MAIL_FROM ?? 'noreply@example.com'
	const opsEmail = env.OPS_EMAIL ?? 'ops@example.com'
	const supportEmail = env.SUPPORT_EMAIL_ADDRESS ?? 'support@example.com'

	await env.TRANSACTIONAL_EMAIL.send({
		from,
		to: opsEmail,
		subject: `${env.APP_NAME} smoke run ${runId}`,
		text: `Transactional smoke run ${runId}`
	})

	await env.SUPPORT_EMAIL.send({
		from,
		to: supportEmail,
		subject: `${env.APP_NAME} support smoke`,
		text: `Support smoke run ${runId}`
	})

	return {
		transactionalTo: opsEmail,
		supportTo: supportEmail
	}
}

async function runSmoke(env: TestingEnv): Promise<StoredSmokeResult> {
	const runId = crypto.randomUUID()
	const startedAt = new Date().toISOString()

	const checks = {
		kv: smokeKv(env, runId),
		d1: smokeD1(env),
		r2: smokeR2(env, runId),
		durableObjects: smokeDurableObjects(env, runId),
		queues: smokeQueues(env, runId),
		services: smokeServices(env, runId),
		ai: smokeAi(env),
		vectorize: smokeVectorize(env, runId),
		hyperdrive: smokeHyperdrive(env),
		browser: smokeBrowser(env),
		analytics: smokeAnalytics(env, runId),
		sendEmail: smokeSendEmail(env, runId)
	}

	const results = Object.fromEntries(
		await Promise.all(
			Object.entries(checks).map(async ([name, operation]) => [name, await settle(operation)] as const)
		)
	)

	const smokeResult: StoredSmokeResult = {
		runId,
		startedAt,
		completedAt: new Date().toISOString(),
		ok: Object.values(results).every((result) => result.ok),
		results
	}

	await writeJson(env.SESSIONS, stateKeys.smokeResult, smokeResult)
	return smokeResult
}

export async function fetch(request: Request, env: TestingEnv): Promise<Response> {
	const url = new URL(request.url)

	if (url.pathname === '/' || url.pathname === '/status') {
		return Response.json(await buildStatusResponse(env))
	}

	if (url.pathname === '/health') {
		return Response.json({
			ok: true,
			appName: env.APP_NAME,
			deploymentChannel: env.DEPLOYMENT_CHANNEL ?? 'development'
		})
	}

	if (url.pathname === '/smoke' && request.method === 'POST') {
		const authorization = authorizeSmokeRequest(request, env)
		if (!authorization.ok) {
			return Response.json({
				ok: false,
				error: authorization.error,
				smokeEnabled: Boolean(env.SMOKE_KEY)
			}, {
				status: authorization.status
			})
		}

		const smokeResult = await runSmoke(env)
		return Response.json({
			appName: env.APP_NAME,
			deploymentChannel: env.DEPLOYMENT_CHANNEL ?? 'development',
			...smokeResult
		})
	}

	return Response.json({
		ok: false,
		error: 'Not found'
	}, {
		status: 404
	})
}