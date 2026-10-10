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
export function createMockKV(initialData: Record<string, string> = {}): KVNamespace {
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
		const type = typeof options === 'string' ? options : (options?.type ?? 'text')
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

		async getWithMetadata(
			key: string,
			options?: KVGetOptions | string
		): Promise<{ value: unknown; metadata: unknown }> {
			const bytes = store.get(key)
			return {
				value: bytes === undefined ? null : decodeBytes(bytes, resolveType(options)),
				metadata: metadata.get(key) ?? null
			}
		}
	} as KVNamespace
}
