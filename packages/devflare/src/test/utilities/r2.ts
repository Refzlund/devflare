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
// Normalises any R2-acceptable value to a string using the same lossy
// text-oriented coercion the rest of createMockR2 relies on. Binary that is
// not valid UTF-8 is mangled by TextDecoder — acceptable for this mock, which
// only ever round-trips text (mirrors put()'s own coercion).
async function coerceToString(
	value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob | null
): Promise<string> {
	if (typeof value === 'string') {
		return value
	}
	if (value === null) {
		return ''
	}
	if (value instanceof ArrayBuffer) {
		return new TextDecoder().decode(value)
	}
	if (ArrayBuffer.isView(value)) {
		return new TextDecoder().decode(value)
	}
	if (value instanceof Blob) {
		return await value.text()
	}

	// ReadableStream
	const reader = (value as ReadableStream<Uint8Array>).getReader()
	const chunks: string[] = []
	let done = false
	while (!done) {
		const result = await reader.read()
		done = result.done
		if (result.value) {
			chunks.push(new TextDecoder().decode(result.value))
		}
	}
	return chunks.join('')
}

export function createMockR2(): R2Bucket {
	const store = new Map<string, { content: string; metadata?: Record<string, string> }>()

	// In-flight multipart uploads, keyed by uploadId. Parts are kept as decoded
	// strings (lossy for non-UTF-8 binary, exactly as the rest of this mock).
	const uploads = new Map<
		string,
		{ key: string; parts: Map<number, string>; options?: R2MultipartOptions }
	>()

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
			value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob | null,
			options?: unknown
		) {
			const content = await coerceToString(value)

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

		async createMultipartUpload(key: string, options?: R2MultipartOptions) {
			const uploadId = crypto.randomUUID()
			uploads.set(uploadId, { key, parts: new Map(), options })
			return createMultipart(key, uploadId)
		},

		resumeMultipartUpload(key: string, uploadId: string) {
			// Lenient, like real R2: resuming an upload created elsewhere this
			// session is allowed, so materialise an empty entry if unknown.
			if (!uploads.has(uploadId)) {
				uploads.set(uploadId, { key, parts: new Map() })
			}
			return createMultipart(key, uploadId)
		}
	} as unknown as R2Bucket

	// A view over the in-flight upload registry implementing R2MultipartUpload.
	// etags/checksums are deterministic fakes and R2UploadPartOptions.ssecKey is
	// ignored — same fidelity as the rest of this mock.
	function createMultipart(key: string, uploadId: string): R2MultipartUpload {
		const requireEntry = () => {
			const entry = uploads.get(uploadId)
			if (!entry) {
				throw new Error(
					`Mock R2 multipart upload "${uploadId}" for key "${key}" is not active (it was aborted or completed).`
				)
			}
			return entry
		}

		return {
			key,
			uploadId,
			async uploadPart(
				partNumber: number,
				value: ReadableStream | (ArrayBuffer | ArrayBufferView) | string | Blob,
				_options?: R2UploadPartOptions
			): Promise<R2UploadedPart> {
				const entry = requireEntry()
				const str = await coerceToString(value)
				entry.parts.set(partNumber, str)
				return { partNumber, etag: `"${key}-part-${partNumber}-etag"` }
			},
			async abort(): Promise<void> {
				uploads.delete(uploadId)
			},
			async complete(uploadedParts: R2UploadedPart[]): Promise<R2Object> {
				const entry = requireEntry()
				const ordered = [...uploadedParts].sort((a, b) => a.partNumber - b.partNumber)
				const content = ordered
					.map((part) => {
						const chunk = entry.parts.get(part.partNumber)
						if (chunk === undefined) {
							throw new Error(
								`Mock R2 multipart complete() references part ${part.partNumber} that was never uploaded for upload "${uploadId}".`
							)
						}
						return chunk
					})
					.join('')

				const metadata = entry.options?.customMetadata
				store.set(key, { content, metadata })
				uploads.delete(uploadId)
				return createR2Object(key, content, metadata) as unknown as R2Object
			}
		}
	}
}
