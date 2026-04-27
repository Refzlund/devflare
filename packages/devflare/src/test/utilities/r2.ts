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
		async put(
			key: string,
			value: string | ArrayBuffer | ReadableStream | Blob | null,
			options?: unknown
		) {
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
				writeHttpMetadata(headers: Headers) {}
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
