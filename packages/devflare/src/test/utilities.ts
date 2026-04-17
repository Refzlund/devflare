// =============================================================================
// Test Utilities — Helpers for testing Cloudflare Worker handlers
// =============================================================================
// Provides mock bindings and context helpers for unit testing
// =============================================================================

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

	return {
		async send(message: unknown, options?: unknown): Promise<void> {
			messages.push({ body: message, options })
		},

		async sendBatch(batch: Array<{ body: unknown; options?: unknown }>): Promise<void> {
			messages.push(...batch)
		},

		// Test helper to inspect sent messages
		_getMessages() {
			return messages
		}
	} as Queue & { _getMessages(): Array<{ body: unknown; options?: unknown }> }
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
