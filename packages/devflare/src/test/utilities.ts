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
	const store = new Map<string, string>(Object.entries(initialData))
	const metadata = new Map<string, unknown>()

	return {
		async get(key: string, options?: KVGetOptions | string): Promise<string | null | unknown> {
			const value = store.get(key)
			if (value === null || value === undefined) return null

			const type = typeof options === 'string' ? options : options?.type ?? 'text'

			switch (type) {
				case 'json':
					return JSON.parse(value)
				case 'arrayBuffer':
					return new TextEncoder().encode(value).buffer
				case 'stream':
					return new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode(value))
							controller.close()
						}
					})
				default:
					return value
			}
		},

		async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: unknown): Promise<void> {
			if (typeof value === 'string') {
				store.set(key, value)
			} else if (value instanceof ArrayBuffer) {
				store.set(key, new TextDecoder().decode(value))
			} else {
				// ReadableStream
				const reader = value.getReader()
				const chunks: Uint8Array[] = []
				let done = false
				while (!done) {
					const result = await reader.read()
					done = result.done
					if (result.value) chunks.push(result.value)
				}
				const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0))
				let offset = 0
				for (const chunk of chunks) {
					combined.set(chunk, offset)
					offset += chunk.length
				}
				store.set(key, new TextDecoder().decode(combined))
			}
		},

		async delete(key: string): Promise<void> {
			store.delete(key)
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

		async getWithMetadata(key: string, options?: unknown): Promise<{ value: string | null; metadata: unknown }> {
			return {
				value: store.get(key) ?? null,
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

/**
 * Creates a mock D1Database for testing
 *
 * @example
 * ```ts
 * const d1 = createMockD1([
 *   { id: 1, name: 'Alice' }
 * ])
 * const result = await d1.prepare('SELECT * FROM users').all()
 * ```
 */
export function createMockD1(mockResults: unknown[] = []): D1Database {
	let boundValues: unknown[] = []
	let currentResults = [...mockResults]

	const createStatement = (): D1PreparedStatement => ({
		bind(...values: unknown[]) {
			boundValues = values
			return this
		},

		async first<T>(column?: string): Promise<T | null> {
			const row = currentResults[0] as Record<string, unknown> | undefined
			if (!row) return null
			if (column) return row[column] as T
			return row as T
		},

		async all<T>(): Promise<D1Result<T>> {
			return {
				results: currentResults as T[],
				success: true,
				meta: { duration: 0, changes: 0, last_row_id: 0 }
			}
		},

		async run(): Promise<D1Result> {
			return {
				results: [],
				success: true,
				meta: { duration: 0, changes: 1, last_row_id: 1 }
			}
		},

		async raw<T>(options?: { columnNames?: boolean }): Promise<T[]> {
			return currentResults.map((row) =>
				Object.values(row as Record<string, unknown>)
			) as T[]
		}
	})

	return {
		prepare(query: string): D1PreparedStatement {
			return createStatement()
		},

		async exec(query: string): Promise<D1Result> {
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

		withSession(constraintOrBookmark?: string) {
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
