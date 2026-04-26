// =============================================================================
// Test Utilities — Helpers for testing Cloudflare Worker handlers
// =============================================================================
// Provides mock bindings and context helpers for unit testing
// =============================================================================

import type { Pipeline, PipelineRecord } from 'cloudflare:pipelines'
import { runWithContext, type RequestContext } from '../runtime/context'

// =============================================================================
// Types
// =============================================================================

export interface TestContextOptions<TEnv = Record<string, unknown>> {
	env?: TEnv
	request?: Request | null
	type?: 'fetch' | 'scheduled' | 'queue' | 'email' | 'tail'
}

export interface TestContext<TEnv = Record<string, unknown>> {
	env: TEnv
	ctx: ExecutionContext
	request: Request | null
	waitUntilPromises: Promise<unknown>[]
}

export interface MockEnvOptions {
	kv?: string[]
	d1?: string[]
	r2?: string[]
	queues?: string[]
	rateLimits?: Record<string, MockRateLimitOptions>
	versionMetadata?: string
	workerLoaders?: string[] | Record<string, MockWorkerLoaderOptions>
	mtlsCertificates?: string[] | Record<string, MockFetcherHandler>
	dispatchNamespaces?: string[] | Record<string, MockDispatchNamespaceOptions>
	workflows?: string[] | Record<string, MockWorkflowOptions | Workflow>
	pipelines?: string[] | Record<string, Pipeline>
	images?: string | ImagesBinding
	media?: string | MediaBinding
	artifacts?: string[] | Record<string, MockArtifactsOptions | Artifacts>
	secretsStore?: Record<string, string>
	durableObjects?: string[]
	vars?: Record<string, string>
	secrets?: Record<string, string>
	custom?: Record<string, unknown>
}

// =============================================================================
// Test Context
// =============================================================================

/**
 * Creates a test context with mock ExecutionContext
 *
 * @example
 * ```ts
 * const ctx = createTestContext({
 *   env: { API_KEY: 'test' },
 *   request: new Request('https://test.com')
 * })
 * ```
 */
export function createMockTestContext<TEnv = Record<string, unknown>>(
	options: TestContextOptions<TEnv> = {}
): TestContext<TEnv> {
	const waitUntilPromises: Promise<unknown>[] = []

	const ctx = {
		waitUntil(promise: Promise<unknown>) {
			waitUntilPromises.push(promise)
		},
		passThroughOnException() {
			// No-op in tests
		},
		props: {}
	} as ExecutionContext

	return {
		env: (options.env ?? {}) as TEnv,
		ctx,
		request: options.request ?? null,
		waitUntilPromises
	}
}

/**
 * Runs a function within a test context
 *
 * @example
 * ```ts
 * const response = await withTestContext(
 *   { env: { DB: mockD1 } },
 *   async () => {
 *     // env, ctx, locals all work here
 *     return handler.fetch(new Request('https://test.com'))
 *   }
 * )
 * ```
 */
export async function withTestContext<T, TEnv = Record<string, unknown>>(
	options: TestContextOptions<TEnv>,
	handler: () => Promise<T>
): Promise<T> {
	const testCtx = createMockTestContext(options)

	return runWithContext(
		testCtx.env as Record<string, unknown>,
		testCtx.ctx,
		options.request ?? null,
		handler,
		options.type ?? 'fetch'
	)
}

// =============================================================================
// Mock KV
// =============================================================================

interface KVGetOptions {
	type?: 'text' | 'json' | 'arrayBuffer' | 'stream'
	cacheTtl?: number
}

interface KVListOptions {
	prefix?: string
	limit?: number
	cursor?: string
}

interface KVListResult {
	keys: Array<{ name: string; expiration?: number; metadata?: unknown }>
	list_complete: boolean
	cursor?: string
}

/**
 * Creates a mock KVNamespace for testing
 *
 * @example
 * ```ts
 * const kv = createMockKV({ 'key': 'value' })
 * await kv.get('key') // 'value'
 * ```
 */
export function createMockKV(
	initialData: Record<string, string> = {}
): KVNamespace {
	const store = new Map<string, Uint8Array>()
	const metadata = new Map<string, unknown>()

	const encoder = new TextEncoder()
	const decoder = new TextDecoder()

	for (const [key, value] of Object.entries(initialData)) {
		store.set(key, encoder.encode(value))
	}

	const toBytes = async (
		value: string | ArrayBuffer | ArrayBufferView | ReadableStream
	): Promise<Uint8Array> => {
		if (typeof value === 'string') {
			return encoder.encode(value)
		}
		if (value instanceof ArrayBuffer) {
			return new Uint8Array(value.slice(0))
		}
		if (ArrayBuffer.isView(value)) {
			const view = value as ArrayBufferView
			const copy = new Uint8Array(view.byteLength)
			copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
			return copy
		}
		const reader = (value as ReadableStream<Uint8Array>).getReader()
		const chunks: Uint8Array[] = []
		let total = 0
		while (true) {
			const result = await reader.read()
			if (result.done) break
			if (result.value) {
				const chunk =
					result.value instanceof Uint8Array
						? result.value
						: new Uint8Array(result.value as ArrayBufferLike)
				chunks.push(chunk)
				total += chunk.length
			}
		}
		const combined = new Uint8Array(total)
		let offset = 0
		for (const chunk of chunks) {
			combined.set(chunk, offset)
			offset += chunk.length
		}
		return combined
	}

	const decodeBytes = (
		bytes: Uint8Array,
		type: 'text' | 'json' | 'arrayBuffer' | 'stream'
	): unknown => {
		switch (type) {
			case 'json':
				return JSON.parse(decoder.decode(bytes))
			case 'arrayBuffer': {
				const copy = new Uint8Array(bytes.length)
				copy.set(bytes)
				return copy.buffer
			}
			case 'stream': {
				const copy = new Uint8Array(bytes.length)
				copy.set(bytes)
				return new ReadableStream({
					start(controller) {
						controller.enqueue(copy)
						controller.close()
					}
				})
			}
			default:
				return decoder.decode(bytes)
		}
	}

	const resolveType = (
		options?: KVGetOptions | string
	): 'text' | 'json' | 'arrayBuffer' | 'stream' => {
		const type = typeof options === 'string' ? options : options?.type ?? 'text'
		return type as 'text' | 'json' | 'arrayBuffer' | 'stream'
	}

	return {
		async get(key: string, options?: KVGetOptions | string): Promise<string | null | unknown> {
			const bytes = store.get(key)
			if (bytes === undefined) return null
			return decodeBytes(bytes, resolveType(options))
		},

		async put(
			key: string,
			value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
			_options?: unknown
		): Promise<void> {
			const bytes = await toBytes(value)
			store.set(key, bytes)
		},

		async delete(key: string): Promise<void> {
			store.delete(key)
			metadata.delete(key)
		},

		async list(options?: KVListOptions): Promise<KVListResult> {
			const prefix = options?.prefix ?? ''
			const limit = options?.limit ?? 1000

			const keys = Array.from(store.keys())
				.filter((key) => key.startsWith(prefix))
				.slice(0, limit)
				.map((name) => ({ name }))

			return {
				keys,
				list_complete: keys.length < limit,
				cursor: undefined
			}
		},

		async getWithMetadata(key: string, options?: KVGetOptions | string): Promise<{ value: unknown; metadata: unknown }> {
			const bytes = store.get(key)
			return {
				value: bytes === undefined ? null : decodeBytes(bytes, resolveType(options)),
				metadata: metadata.get(key) ?? null
			}
		}
	} as KVNamespace
}

// =============================================================================
// Mock D1
// =============================================================================

interface D1Result<T = unknown> {
	results: T[]
	success: boolean
	meta: { duration: number; changes: number; last_row_id: number }
}

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement
	first<T = unknown>(column?: string): Promise<T | null>
	all<T = unknown>(): Promise<D1Result<T>>
	run(): Promise<D1Result>
	raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>
}

export interface MockD1Options {
	/** Per-table fixtures, keyed by table name. Matched against INSERT/SELECT/UPDATE/DELETE FROM <table> */
	fixtures?: Record<string, unknown[]>
	/** Fallback results returned when no fixture matches */
	results?: unknown[]
}

const TABLE_NAME_RE =
	/(?:from|into|update)\s+["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/i

const extractTable = (sql: string): string | null => {
	const match = TABLE_NAME_RE.exec(sql)
	return match ? match[1] : null
}

type SqlOp = 'select' | 'insert' | 'update' | 'delete' | 'other'

const detectOp = (sql: string): SqlOp => {
	const trimmed = sql.trimStart().toLowerCase()
	if (trimmed.startsWith('select')) return 'select'
	if (trimmed.startsWith('insert')) return 'insert'
	if (trimmed.startsWith('update')) return 'update'
	if (trimmed.startsWith('delete')) return 'delete'
	return 'other'
}

/**
 * Creates a mock D1Database for testing
 *
 * @example
 * ```ts
 * // Legacy: fixed results for all queries
 * const d1 = createMockD1([{ id: 1, name: 'Alice' }])
 *
 * // Preferred: per-table fixtures
 * const d1 = createMockD1({ fixtures: { users: [{ id: 1, name: 'Alice' }] } })
 * await d1.prepare('SELECT * FROM users').all() // returns users fixture
 * ```
 */
export function createMockD1(
	mockResultsOrOptions: unknown[] | MockD1Options = []
): D1Database {
	const options: MockD1Options = Array.isArray(mockResultsOrOptions)
		? { results: mockResultsOrOptions }
		: mockResultsOrOptions

	// Per-instance mutable table storage, seeded with fixtures
	const tables = new Map<string, unknown[]>()
	for (const [name, rows] of Object.entries(options.fixtures ?? {})) {
		tables.set(name, [...rows])
	}
	const fallback = options.results ?? []

	const resolveRows = (sql: string): { rows: unknown[]; op: SqlOp; table: string | null } => {
		const op = detectOp(sql)
		const table = extractTable(sql)
		if (table && tables.has(table)) {
			return { rows: tables.get(table) ?? [], op, table }
		}
		return { rows: [...fallback], op, table }
	}

	const createStatement = (sql: string): D1PreparedStatement => {
		let boundValues: unknown[] = []
		const statement: D1PreparedStatement = {
			bind(...values: unknown[]) {
				boundValues = values
				return statement
			},

			async first<T>(column?: string): Promise<T | null> {
				const { rows } = resolveRows(sql)
				const row = rows[0] as Record<string, unknown> | undefined
				if (!row) return null
				if (column) return row[column] as T
				return row as T
			},

			async all<T>(): Promise<D1Result<T>> {
				const { rows } = resolveRows(sql)
				return {
					results: rows as T[],
					success: true,
					meta: { duration: 0, changes: 0, last_row_id: 0 }
				}
			},

			async run(): Promise<D1Result> {
				const { op, table } = resolveRows(sql)
				let changes = 0
				let lastRowId = 0
				if (op === 'insert' && table) {
					const rows = tables.get(table) ?? []
					const bound = boundValues.length > 0
						? Object.fromEntries(boundValues.map((v, i) => [`col${i}`, v]))
						: {}
					rows.push(bound)
					tables.set(table, rows)
					changes = 1
					lastRowId = rows.length
				} else if (op === 'delete' && table) {
					const rows = tables.get(table) ?? []
					changes = rows.length
					tables.set(table, [])
				} else if (op === 'update' && table) {
					changes = (tables.get(table) ?? []).length
				}
				return {
					results: [],
					success: true,
					meta: { duration: 0, changes, last_row_id: lastRowId }
				}
			},

			async raw<T>(_options?: { columnNames?: boolean }): Promise<T[]> {
				const { rows } = resolveRows(sql)
				return rows.map((row) =>
					Object.values(row as Record<string, unknown>)
				) as T[]
			}
		}
		return statement
	}

	return {
		prepare(query: string): D1PreparedStatement {
			return createStatement(query)
		},

		async exec(_query: string): Promise<D1Result> {
			return {
				results: [],
				success: true,
				meta: { duration: 0, changes: 0, last_row_id: 0 }
			}
		},

		async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
			return statements.map(() => ({
				results: [] as T[],
				success: true,
				meta: { duration: 0, changes: 0, last_row_id: 0 }
			}))
		},

		async dump(): Promise<ArrayBuffer> {
			return new ArrayBuffer(0)
		},

		withSession(_constraintOrBookmark?: string) {
			return this
		}
	} as unknown as D1Database
}

// =============================================================================
// Mock R2
// =============================================================================

// Using native Cloudflare R2 types from @cloudflare/workers-types

/**
 * Creates a mock R2Bucket for testing
 *
 * @example
 * ```ts
 * const r2 = createMockR2()
 * await r2.put('file.txt', 'content')
 * const obj = await r2.get('file.txt')
 * ```
 */
export function createMockR2(): R2Bucket {
	const store = new Map<string, { content: string; metadata?: Record<string, string> }>()

	const createR2Object = (key: string, content: string, metadata?: Record<string, string>) => {
		const encoder = new TextEncoder()
		const data = encoder.encode(content)

		return {
			key,
			version: '1',
			size: data.length,
			etag: `"${key}-etag"`,
			httpEtag: `"${key}-etag"`,
			uploaded: new Date(),
			httpMetadata: metadata ?? {},
			customMetadata: {},
			checksums: {},
			storageClass: 'Standard',
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(data)
					controller.close()
				}
			}),
			bodyUsed: false,
			async arrayBuffer() {
				return new Uint8Array(data).buffer as ArrayBuffer
			},
			async text() {
				return content
			},
			async json<T>() {
				return JSON.parse(content) as T
			},
			async blob() {
				return new Blob([data])
			},
			writeHttpMetadata(headers: Headers) {
				// No-op
			}
		}
	}

	return {
		async put(key: string, value: string | ArrayBuffer | ReadableStream | Blob | null, options?: unknown) {
			let content: string
			if (typeof value === 'string') {
				content = value
			} else if (value instanceof ArrayBuffer) {
				content = new TextDecoder().decode(value)
			} else if (value instanceof Blob) {
				content = await value.text()
			} else if (value === null) {
				content = ''
			} else {
				// ReadableStream
				const reader = value.getReader()
				const chunks: string[] = []
				let done = false
				while (!done) {
					const result = await reader.read()
					done = result.done
					if (result.value) {
						chunks.push(new TextDecoder().decode(result.value))
					}
				}
				content = chunks.join('')
			}

			store.set(key, { content })
			return createR2Object(key, content)
		},

		async get(key: string, options?: unknown) {
			const item = store.get(key)
			if (!item) return null
			return createR2Object(key, item.content, item.metadata)
		},

		async head(key: string) {
			const item = store.get(key)
			if (!item) return null
			return {
				key,
				version: '1',
				size: new TextEncoder().encode(item.content).length,
				etag: `"${key}-etag"`,
				httpEtag: `"${key}-etag"`,
				uploaded: new Date(),
				httpMetadata: item.metadata ?? {},
				customMetadata: {},
				checksums: {},
				storageClass: 'Standard',
				writeHttpMetadata(headers: Headers) { }
			}
		},

		async delete(keys: string | string[]) {
			const keyArray = Array.isArray(keys) ? keys : [keys]
			for (const key of keyArray) {
				store.delete(key)
			}
		},

		async list(options?: unknown) {
			const objects = Array.from(store.entries()).map(([key, { content, metadata }]) =>
				createR2Object(key, content, metadata)
			)

			return {
				objects,
				truncated: false,
				delimitedPrefixes: []
			}
		},

		async createMultipartUpload(key: string, options?: unknown) {
			throw new Error('Multipart upload not implemented in mock')
		},

		async resumeMultipartUpload(key: string, uploadId: string) {
			throw new Error('Multipart upload not implemented in mock')
		}
	} as unknown as R2Bucket
}

// =============================================================================
// Mock Queue
// =============================================================================

/**
 * Creates a mock Queue for testing
 */
export function createMockQueue(): Queue {
	const messages: Array<{ body: unknown; options?: unknown }> = []
	const metrics: QueueMetrics = {
		backlogCount: 0,
		backlogBytes: 0
	}
	const response = { metadata: { metrics } }

	return {
		async metrics(): Promise<QueueMetrics> {
			return metrics
		},

		async send(message: unknown, options?: QueueSendOptions): Promise<QueueSendResponse> {
			messages.push({ body: message, options })
			return response
		},

		async sendBatch(batch: Iterable<MessageSendRequest>, options?: QueueSendBatchOptions): Promise<QueueSendBatchResponse> {
			for (const message of batch) {
				messages.push({
					body: message.body,
					options: {
						contentType: message.contentType,
						delaySeconds: message.delaySeconds ?? options?.delaySeconds
					}
				})
			}
			return response
		},

		// Test helper to inspect sent messages
		_getMessages() {
			return messages
		}
	} as Queue & { _getMessages(): Array<{ body: unknown; options?: unknown }> }
}

// =============================================================================
// Mock Rate Limit
// =============================================================================

export interface MockRateLimitOptions {
	limit?: number
	period?: 10 | 60
}

/**
 * Creates a local fixed-window RateLimit binding for testing.
 */
export function createMockRateLimit(options: MockRateLimitOptions = {}): RateLimit {
	const limit = options.limit ?? Number.MAX_SAFE_INTEGER
	const periodMs = (options.period ?? 60) * 1000
	const windows = new Map<string, { count: number; resetAt: number }>()

	return {
		async limit({ key }: RateLimitOptions): Promise<RateLimitOutcome> {
			const now = Date.now()
			const existing = windows.get(key)
			if (!existing || existing.resetAt <= now) {
				windows.set(key, { count: 1, resetAt: now + periodMs })
				return { success: limit >= 1 }
			}

			existing.count += 1
			return { success: existing.count <= limit }
		}
	} as RateLimit
}

// =============================================================================
// Mock Version Metadata
// =============================================================================

export function createMockVersionMetadata(
	metadata: Partial<WorkerVersionMetadata> = {}
): WorkerVersionMetadata {
	return {
		id: metadata.id ?? 'devflare-local-version',
		tag: metadata.tag ?? 'local',
		timestamp: metadata.timestamp ?? '1970-01-01T00:00:00.000Z'
	}
}

// =============================================================================
// Mock Secrets Store Secret
// =============================================================================

/**
 * Creates a Secrets Store binding whose get() method returns a fixed value.
 */
export function createMockSecretsStoreSecret(value: string): SecretsStoreSecret {
	return {
		async get(): Promise<string> {
			return value
		}
	} as SecretsStoreSecret
}

// =============================================================================
// Mock Worker Loader
// =============================================================================

export interface MockWorkerLoaderOptions {
	stub?: WorkerStub
}

function createDefaultWorkerStub(): WorkerStub {
	return {
		getEntrypoint() {
			throw new Error('Mock WorkerLoader stub has no entrypoint. Pass createMockWorkerLoader({ stub }) for behavior.')
		},
		getDurableObjectClass() {
			throw new Error('Mock WorkerLoader stub has no Durable Object class. Pass createMockWorkerLoader({ stub }) for behavior.')
		}
	} as unknown as WorkerStub
}

/**
 * Creates a Worker Loader binding for pure unit tests.
 */
export function createMockWorkerLoader(options: MockWorkerLoaderOptions = {}): WorkerLoader {
	const stub = options.stub ?? createDefaultWorkerStub()

	return {
		get(
			_name: string | null,
			_getCode: () => WorkerLoaderWorkerCode | Promise<WorkerLoaderWorkerCode>
		): WorkerStub {
			return stub
		},
		load(_code: WorkerLoaderWorkerCode): WorkerStub {
			return stub
		}
	} as WorkerLoader
}

// =============================================================================
// Mock mTLS Certificate
// =============================================================================

export type MockFetchInput = string | Request | URL
export type MockFetcherHandler = (input: MockFetchInput, init?: RequestInit) => Response | Promise<Response>

function defaultMTLSCertificateHandler(): never {
	throw new Error('Mock mTLS Certificate Fetcher has no handler. Pass createMockMTLSCertificate(handler) for behavior.')
}

/**
 * Creates an mTLS certificate binding fetcher for pure unit tests.
 */
export function createMockMTLSCertificate(
	handler: MockFetcherHandler = defaultMTLSCertificateHandler
): Fetcher {
	return {
		async fetch(input: MockFetchInput, init?: RequestInit): Promise<Response> {
			return handler(input, init)
		}
	} as unknown as Fetcher
}

// =============================================================================
// Mock Dispatch Namespace
// =============================================================================

export interface MockDispatchNamespaceOptions {
	workers?: Record<string, MockFetcherHandler | Fetcher>
}

/**
 * Creates a Dispatch Namespace binding for pure unit tests.
 */
export function createMockDispatchNamespace(
	options: MockDispatchNamespaceOptions = {}
): DispatchNamespace {
	return {
		get(name: string): Fetcher {
			const worker = options.workers?.[name]
			if (!worker) {
				throw new Error(`Mock DispatchNamespace has no worker named "${name}".`)
			}

			return typeof worker === 'function'
				? createMockMTLSCertificate(worker)
				: worker
		}
	} as DispatchNamespace
}

// =============================================================================
// Mock Workflow
// =============================================================================

type MockWorkflowStatus =
	| 'queued'
	| 'running'
	| 'paused'
	| 'errored'
	| 'terminated'
	| 'complete'
	| 'waiting'
	| 'waitingForPause'
	| 'unknown'

export interface MockWorkflowInstanceOptions {
	status?: MockWorkflowStatus
	output?: unknown
	error?: { name: string; message: string }
}

export interface MockWorkflowOptions {
	instances?: Record<string, MockWorkflowInstanceOptions>
}

function createMockWorkflowInstance(
	id: string,
	options: MockWorkflowInstanceOptions = {}
): WorkflowInstance {
	let status: MockWorkflowStatus = options.status ?? 'queued'
	let output = options.output
	let error = options.error

	return {
		id,
		async pause(): Promise<void> {
			status = 'paused'
		},
		async resume(): Promise<void> {
			status = 'running'
		},
		async terminate(): Promise<void> {
			status = 'terminated'
		},
		async restart(): Promise<void> {
			status = 'queued'
			error = undefined
			output = undefined
		},
		async status() {
			return {
				status,
				...(error && { error }),
				...(output !== undefined && { output })
			}
		},
		async sendEvent(_event: { type: string; payload: unknown }): Promise<void> {
			// No-op; pure unit tests can assert their own side effects around the mock.
		}
	} as WorkflowInstance
}

/**
 * Creates a Workflow binding for pure unit tests.
 */
export function createMockWorkflow<PARAMS = unknown>(
	options: MockWorkflowOptions = {}
): Workflow<PARAMS> {
	const instances = new Map<string, WorkflowInstance>()
	let sequence = 0

	for (const [id, instanceOptions] of Object.entries(options.instances ?? {})) {
		instances.set(id, createMockWorkflowInstance(id, instanceOptions))
	}

	const createInstance = (id: string): WorkflowInstance => {
		if (instances.has(id)) {
			throw new Error(`Mock Workflow already has an instance named "${id}".`)
		}

		const instance = createMockWorkflowInstance(id)
		instances.set(id, instance)
		return instance
	}

	return {
		async get(id: string): Promise<WorkflowInstance> {
			const instance = instances.get(id)
			if (!instance) {
				throw new Error(`Mock Workflow has no instance named "${id}".`)
			}
			return instance
		},
		async create(options?: WorkflowInstanceCreateOptions<PARAMS>): Promise<WorkflowInstance> {
			const id = options?.id ?? `mock-workflow-${++sequence}`
			return createInstance(id)
		},
		async createBatch(
			batch: WorkflowInstanceCreateOptions<PARAMS>[]
		): Promise<WorkflowInstance[]> {
			return batch.map((options) => {
				const id = options.id ?? `mock-workflow-${++sequence}`
				return createInstance(id)
			})
		}
	} as Workflow<PARAMS>
}

// =============================================================================
// Mock Pipeline
// =============================================================================

export type MockPipeline<T extends PipelineRecord = PipelineRecord> = Pipeline<T> & {
	_getRecords(): T[]
}

/**
 * Creates a Pipeline binding for pure unit tests.
 */
export function createMockPipeline<T extends PipelineRecord = PipelineRecord>(): MockPipeline<T> {
	const records: T[] = []

	return {
		async send(batch: T[]): Promise<void> {
			records.push(...batch)
		},
		_getRecords(): T[] {
			return [...records]
		}
	}
}

// =============================================================================
// Mock Images Binding
// =============================================================================

export interface MockImagesBindingOptions {
	info?: ImageInfoResponse
	response?: Response
}

function createEmptyImageStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.close()
		}
	})
}

function createMockImageTransformationResult(response: Response): ImageTransformationResult {
	return {
		response(): Response {
			return response.clone()
		},
		contentType(): string {
			return response.headers.get('Content-Type') ?? 'image/png'
		},
		image(): ReadableStream<Uint8Array> {
			const cloned = response.clone()
			return cloned.body ?? createEmptyImageStream()
		}
	} as ImageTransformationResult
}

function createMockImageTransformer(response: Response): ImageTransformer {
	const transformer: ImageTransformer = {
		transform(_transform: ImageTransform): ImageTransformer {
			return transformer
		},
		draw(
			_image: ReadableStream<Uint8Array> | ImageTransformer,
			_options?: ImageDrawOptions
		): ImageTransformer {
			return transformer
		},
		async output(_options: ImageOutputOptions): Promise<ImageTransformationResult> {
			return createMockImageTransformationResult(response)
		}
	}

	return transformer
}

function createMockHostedImagesBinding(): HostedImagesBinding {
	const unsupported = () => {
		throw new Error('Mock Images hosted API is not implemented. Pass a custom ImagesBinding through createMockEnv({ images }) if your test needs hosted image behavior.')
	}

	return {
		image(_imageId: string): ImageHandle {
			return {
				details: unsupported,
				bytes: unsupported,
				update: unsupported,
				delete: unsupported
			} as ImageHandle
		},
		upload: unsupported,
		list: unsupported
	} as HostedImagesBinding
}

/**
 * Creates an Images binding for pure unit tests.
 */
export function createMockImagesBinding(
	options: MockImagesBindingOptions = {}
): ImagesBinding {
	const response = options.response ?? new Response('', {
		headers: { 'Content-Type': 'image/png' }
	})
	const info = options.info ?? {
		format: response.headers.get('Content-Type') ?? 'image/png',
		fileSize: 0,
		width: 0,
		height: 0
	}

	return {
		async info(
			_stream: ReadableStream<Uint8Array>,
			_options?: ImageInputOptions
		): Promise<ImageInfoResponse> {
			return info
		},
		input(
			_stream: ReadableStream<Uint8Array>,
			_options?: ImageInputOptions
		): ImageTransformer {
			return createMockImageTransformer(response)
		},
		hosted: createMockHostedImagesBinding()
	} as ImagesBinding
}

// =============================================================================
// Mock Media Transformations Binding
// =============================================================================

export interface MockMediaBindingOptions {
	response?: Response
}

function createEmptyMediaStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.close()
		}
	})
}

function createMockMediaTransformationResult(response: Response): MediaTransformationResult {
	return {
		async media(): Promise<ReadableStream<Uint8Array>> {
			const cloned = response.clone()
			return cloned.body ?? createEmptyMediaStream()
		},
		async response(): Promise<Response> {
			return response.clone()
		},
		async contentType(): Promise<string> {
			return response.headers.get('Content-Type') ?? 'video/mp4'
		}
	} as MediaTransformationResult
}

function createMockMediaTransformer(response: Response): MediaTransformer {
	const transformer: MediaTransformer = {
		transform(_transform?: MediaTransformationInputOptions): MediaTransformationGenerator {
			return {
				output(_output?: MediaTransformationOutputOptions): MediaTransformationResult {
					return createMockMediaTransformationResult(response)
				}
			}
		},
		output(_output?: MediaTransformationOutputOptions): MediaTransformationResult {
			return createMockMediaTransformationResult(response)
		}
	}

	return transformer
}

/**
 * Creates a Media Transformations binding for pure unit tests.
 */
export function createMockMediaBinding(
	options: MockMediaBindingOptions = {}
): MediaBinding {
	const response = options.response ?? new Response('', {
		headers: { 'Content-Type': 'video/mp4' }
	})

	return {
		input(_media: ReadableStream<Uint8Array>): MediaTransformer {
			return createMockMediaTransformer(response)
		}
	} as MediaBinding
}

// =============================================================================
// Mock Artifacts
// =============================================================================

export interface MockArtifactsOptions {
	repos?: Array<Partial<ArtifactsRepoInfo> & { name: string }>
}

function createArtifactTimestamp(): string {
	return new Date('2026-04-26T00:00:00.000Z').toISOString()
}

function createArtifactsRepoInfo(
	name: string,
	options: {
		description?: string | null
		readOnly?: boolean
		defaultBranch?: string
		source?: string | null
	} = {}
): ArtifactsRepoInfo {
	const now = createArtifactTimestamp()
	return {
		id: `repo-${name}`,
		name,
		description: options.description ?? null,
		defaultBranch: options.defaultBranch ?? 'main',
		createdAt: now,
		updatedAt: now,
		lastPushAt: null,
		source: options.source ?? null,
		readOnly: options.readOnly ?? false,
		remote: `https://example.com/artifacts/default/${name}.git`
	}
}

function isArtifactsBinding(value: MockArtifactsOptions | Artifacts): value is Artifacts {
	return typeof (value as { create?: unknown }).create === 'function'
}

/**
 * Creates an in-memory Artifacts binding for pure unit tests.
 */
export function createMockArtifacts(options: MockArtifactsOptions = {}): Artifacts {
	const repos = new Map<string, ArtifactsRepoInfo>()
	const tokens = new Map<string, ArtifactsTokenInfo[]>()

	const addRepo = (info: ArtifactsRepoInfo) => {
		repos.set(info.name, info)
		if (!tokens.has(info.name)) {
			tokens.set(info.name, [])
		}
	}

	for (const repo of options.repos ?? []) {
		addRepo({
			...createArtifactsRepoInfo(repo.name),
			...repo
		})
	}

	const createToken = (
		repoName: string,
		scope: 'write' | 'read' = 'write',
		ttl = 86400
	): ArtifactsCreateTokenResult => {
		const existing = tokens.get(repoName) ?? []
		const id = `token-${repoName}-${existing.length + 1}`
		const expiresAt = new Date(Date.parse(createArtifactTimestamp()) + ttl * 1000).toISOString()
		const token: ArtifactsTokenInfo = {
			id,
			scope,
			state: 'active',
			createdAt: createArtifactTimestamp(),
			expiresAt
		}
		tokens.set(repoName, [...existing, token])
		return {
			id,
			plaintext: `${id}-plaintext`,
			scope,
			expiresAt
		}
	}

	const createRepoHandle = (info: ArtifactsRepoInfo): ArtifactsRepo => ({
		...info,
		async createToken(scope?: 'write' | 'read', ttl?: number): Promise<ArtifactsCreateTokenResult> {
			return createToken(info.name, scope, ttl)
		},
		async listTokens(): Promise<ArtifactsTokenListResult> {
			const repoTokens = tokens.get(info.name) ?? []
			return {
				tokens: repoTokens,
				total: repoTokens.length
			}
		},
		async revokeToken(tokenOrId: string): Promise<boolean> {
			const repoTokens = tokens.get(info.name) ?? []
			const index = repoTokens.findIndex((token) => token.id === tokenOrId)
			if (index === -1) {
				return false
			}

			repoTokens[index] = {
				...repoTokens[index],
				state: 'revoked'
			}
			tokens.set(info.name, repoTokens)
			return true
		},
		async fork(
			name: string,
			forkOptions?: { description?: string; readOnly?: boolean; defaultBranchOnly?: boolean }
		): Promise<ArtifactsCreateRepoResult> {
			return createRepo(name, {
				description: forkOptions?.description ?? info.description ?? undefined,
				readOnly: forkOptions?.readOnly ?? info.readOnly,
				setDefaultBranch: info.defaultBranch,
				source: `artifacts:default/${info.name}`
			})
		}
	} as ArtifactsRepo)

	const createRepo = async (
		name: string,
		createOptions: {
			readOnly?: boolean
			description?: string
			setDefaultBranch?: string
			source?: string | null
		} = {}
	): Promise<ArtifactsCreateRepoResult> => {
		const info = createArtifactsRepoInfo(name, {
			description: createOptions.description,
			readOnly: createOptions.readOnly,
			defaultBranch: createOptions.setDefaultBranch,
			source: createOptions.source
		})
		addRepo(info)
		const token = createToken(name)
		return {
			id: info.id,
			name: info.name,
			description: info.description,
			defaultBranch: info.defaultBranch,
			remote: info.remote,
			token: token.plaintext,
			tokenExpiresAt: token.expiresAt
		}
	}

	return {
		create: createRepo,
		async get(name: string): Promise<ArtifactsRepo | null> {
			const repo = repos.get(name)
			return repo ? createRepoHandle(repo) : null
		},
		async import(params: {
			source: { url: string; branch?: string; depth?: number }
			target: { name: string; opts?: { description?: string; readOnly?: boolean } }
		}): Promise<ArtifactsCreateRepoResult> {
			return createRepo(params.target.name, {
				description: params.target.opts?.description,
				readOnly: params.target.opts?.readOnly,
				source: params.source.url
			})
		},
		async list(opts?: { limit?: number; cursor?: string }): Promise<ArtifactsRepoListResult> {
			const limit = opts?.limit ?? 50
			const repoList = Array.from(repos.values()).slice(0, limit).map((repo) => {
				const { remote: _remote, ...rest } = repo
				return rest
			})

			return {
				repos: repoList,
				total: repos.size,
				...(repos.size > repoList.length && { cursor: String(repoList.length) })
			}
		},
		async delete(name: string): Promise<boolean> {
			tokens.delete(name)
			return repos.delete(name)
		}
	} as unknown as Artifacts
}

// =============================================================================
// Mock Env Factory
// =============================================================================

/**
 * Creates a complete mock environment with specified bindings
 *
 * @example
 * ```ts
 * const env = createMockEnv({
 *   kv: ['CACHE'],
 *   d1: ['DB'],
 *   vars: { API_KEY: 'secret' }
 * })
 * ```
 */
export function createMockEnv(options: MockEnvOptions = {}): Record<string, unknown> {
	const env: Record<string, unknown> = {}

	// Add KV bindings
	if (options.kv) {
		for (const name of options.kv) {
			env[name] = createMockKV()
		}
	}

	// Add D1 bindings
	if (options.d1) {
		for (const name of options.d1) {
			env[name] = createMockD1()
		}
	}

	// Add R2 bindings
	if (options.r2) {
		for (const name of options.r2) {
			env[name] = createMockR2()
		}
	}

	// Add Queue bindings
	if (options.queues) {
		for (const name of options.queues) {
			env[name] = createMockQueue()
		}
	}

	// Add Rate Limiting bindings
	if (options.rateLimits) {
		for (const [name, rateLimitOptions] of Object.entries(options.rateLimits)) {
			env[name] = createMockRateLimit(rateLimitOptions)
		}
	}

	// Add Version Metadata binding
	if (options.versionMetadata) {
		env[options.versionMetadata] = createMockVersionMetadata()
	}

	// Add Worker Loader bindings
	if (Array.isArray(options.workerLoaders)) {
		for (const name of options.workerLoaders) {
			env[name] = createMockWorkerLoader()
		}
	} else if (options.workerLoaders) {
		for (const [name, workerLoaderOptions] of Object.entries(options.workerLoaders)) {
			env[name] = createMockWorkerLoader(workerLoaderOptions)
		}
	}

	// Add mTLS Certificate bindings
	if (Array.isArray(options.mtlsCertificates)) {
		for (const name of options.mtlsCertificates) {
			env[name] = createMockMTLSCertificate()
		}
	} else if (options.mtlsCertificates) {
		for (const [name, handler] of Object.entries(options.mtlsCertificates)) {
			env[name] = createMockMTLSCertificate(handler)
		}
	}

	// Add Dispatch Namespace bindings
	if (Array.isArray(options.dispatchNamespaces)) {
		for (const name of options.dispatchNamespaces) {
			env[name] = createMockDispatchNamespace()
		}
	} else if (options.dispatchNamespaces) {
		for (const [name, dispatchNamespaceOptions] of Object.entries(options.dispatchNamespaces)) {
			env[name] = createMockDispatchNamespace(dispatchNamespaceOptions)
		}
	}

	// Add Workflow bindings
	if (Array.isArray(options.workflows)) {
		for (const name of options.workflows) {
			env[name] = createMockWorkflow()
		}
	} else if (options.workflows) {
		for (const [name, workflowOptions] of Object.entries(options.workflows)) {
			env[name] = 'create' in workflowOptions
				? workflowOptions
				: createMockWorkflow(workflowOptions)
		}
	}

	// Add Pipeline bindings
	if (Array.isArray(options.pipelines)) {
		for (const name of options.pipelines) {
			env[name] = createMockPipeline()
		}
	} else if (options.pipelines) {
		for (const [name, pipeline] of Object.entries(options.pipelines)) {
			env[name] = pipeline
		}
	}

	// Add Images binding
	if (typeof options.images === 'string') {
		env[options.images] = createMockImagesBinding()
	} else if (options.images) {
		env.IMAGES = options.images
	}

	// Add Media Transformations binding
	if (typeof options.media === 'string') {
		env[options.media] = createMockMediaBinding()
	} else if (options.media) {
		env.MEDIA = options.media
	}

	// Add Artifacts bindings
	if (Array.isArray(options.artifacts)) {
		for (const name of options.artifacts) {
			env[name] = createMockArtifacts()
		}
	} else if (options.artifacts) {
		for (const [name, artifactsOptions] of Object.entries(options.artifacts)) {
			env[name] = isArtifactsBinding(artifactsOptions)
				? artifactsOptions
				: createMockArtifacts(artifactsOptions)
		}
	}

	// Add Secrets Store bindings
	if (options.secretsStore) {
		for (const [name, value] of Object.entries(options.secretsStore)) {
			env[name] = createMockSecretsStoreSecret(value)
		}
	}

	// Add vars
	if (options.vars) {
		Object.assign(env, options.vars)
	}

	// Add secrets (same as vars for testing)
	if (options.secrets) {
		Object.assign(env, options.secrets)
	}

	// Add custom bindings
	if (options.custom) {
		Object.assign(env, options.custom)
	}

	return env
}
