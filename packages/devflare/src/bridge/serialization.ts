// =============================================================================
// Bridge Serialization — Request/Response/Stream Conversion
// =============================================================================
// Converts Web API objects to/from serializable POJOs for RPC transport
// =============================================================================

import { nextStreamId } from './protocol'

// -----------------------------------------------------------------------------
// Serialized Types
// -----------------------------------------------------------------------------

/** Serialized HTTP Request */
export interface SerializedRequest {
	url: string
	method: string
	headers: [string, string][]
	body?: BodyRef | null
	redirect?: 'follow' | 'error' | 'manual'
	cf?: unknown
}

/** Serialized HTTP Response */
export interface SerializedResponse {
	status: number
	statusText?: string
	headers: [string, string][]
	body?: BodyRef | null
	webSocket?: { wid: number }
}

/** Reference to a body - either inline bytes or stream */
export type BodyRef =
	| { type: 'bytes'; data: string }  // base64 for JSON transport
	| { type: 'stream'; sid: number }
	| { type: 'http'; transferId: string }  // Large file via HTTP

/** Serialized DurableObjectId */
export interface SerializedDOId {
	type: 'do-id'
	name?: string
	hexId?: string
}

/** Serialized DurableObjectStub */
export interface SerializedDOStub {
	type: 'do-stub'
	binding: string
	id: SerializedDOId
}

// -----------------------------------------------------------------------------
// Request Serialization
// -----------------------------------------------------------------------------

/** Serialize a Request to a POJO */
export async function serializeRequest(
	request: Request,
	options?: { httpThreshold?: number }
): Promise<{ serialized: SerializedRequest; streams: StreamRef[] }> {
	const streams: StreamRef[] = []
	const threshold = options?.httpThreshold ?? 10 * 1024 * 1024

	const headers: [string, string][] = []
	request.headers.forEach((value, key) => {
		headers.push([key, value])
	})

	let body: BodyRef | null = null

	if (request.body) {
		// Always read the body as bytes for reliability
		// Stream handling is complex and often unreliable across RPC
		const bytes = await request.arrayBuffer()
		
		if (bytes.byteLength > threshold) {
			// Large body → HTTP transfer
			body = { type: 'http', transferId: crypto.randomUUID() }
		} else if (bytes.byteLength > 0) {
			// Body has content → inline bytes (base64)
			body = { type: 'bytes', data: base64Encode(new Uint8Array(bytes)) }
		}
		// Empty body (0 bytes) → body stays null
	}

	return {
		serialized: {
			url: request.url,
			method: request.method,
			headers,
			body,
			redirect: request.redirect as 'follow' | 'error' | 'manual'
		},
		streams
	}
}

/** Deserialize a Request from a POJO */
export function deserializeRequest(
	serialized: SerializedRequest,
	getStream?: (sid: number) => ReadableStream<Uint8Array> | null
): Request {
	let body: BodyInit | null = null

	if (serialized.body) {
		switch (serialized.body.type) {
			case 'bytes':
				// Cast needed for TypeScript strict mode (Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer>)
				body = base64Decode(serialized.body.data) as unknown as BodyInit
				break
			case 'stream':
				if (getStream) {
					body = getStream(serialized.body.sid) ?? null
				}
				break
			case 'http':
				// HTTP transfer handled separately
				throw new Error('HTTP transfer body must be handled externally')
		}
	}

	return new Request(serialized.url, {
		method: serialized.method,
		headers: serialized.headers,
		body,
		redirect: serialized.redirect
	})
}

// -----------------------------------------------------------------------------
// Response Serialization
// -----------------------------------------------------------------------------

/** Serialize a Response to a POJO */
export async function serializeResponse(
	response: Response,
	options?: { httpThreshold?: number }
): Promise<{ serialized: SerializedResponse; streams: StreamRef[] }> {
	const streams: StreamRef[] = []
	const threshold = options?.httpThreshold ?? 10 * 1024 * 1024

	const headers: [string, string][] = []
	response.headers.forEach((value, key) => {
		headers.push([key, value])
	})

	let body: BodyRef | null = null

	if (response.body) {
		// Always read the body as bytes for reliability
		// Stream handling is complex and often unreliable across RPC
		const bytes = await response.arrayBuffer()
		
		if (bytes.byteLength > threshold) {
			// Large body → HTTP transfer
			body = { type: 'http', transferId: crypto.randomUUID() }
		} else if (bytes.byteLength > 0) {
			// Body has content → inline bytes (base64)
			body = { type: 'bytes', data: base64Encode(new Uint8Array(bytes)) }
		}
		// Empty body (0 bytes) → body stays null
	}

	return {
		serialized: {
			status: response.status,
			statusText: response.statusText,
			headers,
			body
		},
		streams
	}
}

/** Deserialize a Response from a POJO */
export function deserializeResponse(
	serialized: SerializedResponse,
	getStream?: (sid: number) => ReadableStream<Uint8Array> | null
): Response {
	let body: BodyInit | null = null

	if (serialized.body) {
		switch (serialized.body.type) {
			case 'bytes':
				// Cast needed for TypeScript strict mode (Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer>)
				body = base64Decode(serialized.body.data) as unknown as BodyInit
				break
			case 'stream':
				if (getStream) {
					body = getStream(serialized.body.sid) ?? null
				}
				break
			case 'http':
				throw new Error('HTTP transfer body must be handled externally')
		}
	}

	return new Response(body, {
		status: serialized.status,
		statusText: serialized.statusText,
		headers: serialized.headers
	})
}

// -----------------------------------------------------------------------------
// Stream References
// -----------------------------------------------------------------------------

/** Reference to a stream that needs to be sent separately */
export interface StreamRef {
	sid: number
	stream: ReadableStream<Uint8Array>
}

// -----------------------------------------------------------------------------
// Durable Object Serialization
// -----------------------------------------------------------------------------

/** Serialize a DurableObjectId */
export function serializeDOId(id: DurableObjectId): SerializedDOId {
	return {
		type: 'do-id',
		hexId: id.toString()
	}
}

/** Serialize a DurableObjectStub reference */
export function serializeDOStub(binding: string, id: DurableObjectId): SerializedDOStub {
	return {
		type: 'do-stub',
		binding,
		id: serializeDOId(id)
	}
}

// -----------------------------------------------------------------------------
// Value Serialization (generic)
// -----------------------------------------------------------------------------

/** Check if a value needs special serialization */
export function needsSpecialSerialization(value: unknown): boolean {
	if (value === null || value === undefined) return false
	if (value instanceof Request) return true
	if (value instanceof Response) return true
	if (value instanceof ReadableStream) return true
	if (value instanceof Uint8Array) return true
	if (value instanceof ArrayBuffer) return true
	return false
}

/** Serialize a value that may contain special types */
export async function serializeValue(value: unknown): Promise<{
	value: unknown
	streams: StreamRef[]
}> {
	const streams: StreamRef[] = []

	const result = await serializeValueInternal(value, streams)

	return { value: result, streams }
}

async function serializeValueInternal(
	value: unknown,
	streams: StreamRef[]
): Promise<unknown> {
	if (value === null || value === undefined) {
		return value
	}

	if (value instanceof Request) {
		const { serialized, streams: reqStreams } = await serializeRequest(value)
		streams.push(...reqStreams)
		return { __type: 'Request', ...serialized }
	}

	if (value instanceof Response) {
		const { serialized, streams: resStreams } = await serializeResponse(value)
		streams.push(...resStreams)
		return { __type: 'Response', ...serialized }
	}

	if (value instanceof ReadableStream) {
		const sid = nextStreamId()
		streams.push({ sid, stream: value })
		return { __type: 'ReadableStream', sid }
	}

	if (value instanceof Uint8Array) {
		return { __type: 'Uint8Array', data: base64Encode(value) }
	}

	if (value instanceof ArrayBuffer) {
		return { __type: 'ArrayBuffer', data: base64Encode(new Uint8Array(value)) }
	}

	if (Array.isArray(value)) {
		return Promise.all(value.map((v) => serializeValueInternal(v, streams)))
	}

	if (typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = await serializeValueInternal(v, streams)
		}
		return result
	}

	return value
}

/** Deserialize a value that may contain special types */
export function deserializeValue(
	value: unknown,
	getStream?: (sid: number) => ReadableStream<Uint8Array> | null
): unknown {
	if (value === null || value === undefined) {
		return value
	}

	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>

		if (obj.__type === 'Request') {
			return deserializeRequest(obj as unknown as SerializedRequest, getStream)
		}

		if (obj.__type === 'Response') {
			return deserializeResponse(obj as unknown as SerializedResponse, getStream)
		}

		if (obj.__type === 'ReadableStream') {
			const sid = obj.sid as number
			return getStream?.(sid) ?? null
		}

		if (obj.__type === 'Uint8Array') {
			return base64Decode(obj.data as string)
		}

		if (obj.__type === 'ArrayBuffer') {
			return base64Decode(obj.data as string).buffer
		}

		// R2Object (metadata only)
		if (obj.__type === 'R2Object') {
			return deserializeR2Object(obj)
		}

		// R2ObjectBody (with body data)
		if (obj.__type === 'R2ObjectBody') {
			return deserializeR2ObjectBody(obj)
		}

		if (Array.isArray(value)) {
			return value.map((v) => deserializeValue(v, getStream))
		}

		const result: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(obj)) {
			result[k] = deserializeValue(v, getStream)
		}
		return result
	}

	return value
}

// -----------------------------------------------------------------------------
// R2 Object Helpers
// -----------------------------------------------------------------------------

/** Serialized R2 object metadata */
interface SerializedR2Object {
	__type: 'R2Object' | 'R2ObjectBody'
	key: string
	version: string
	size: number
	etag: string
	httpEtag: string
	checksums: R2Checksums
	uploaded?: string
	httpMetadata?: R2HTTPMetadata
	customMetadata?: Record<string, string>
	range?: R2Range
	storageClass?: string
	bodyData?: string  // Base64-encoded body (only for R2ObjectBody)
}

/** Deserialize R2Object (metadata only) */
function deserializeR2Object(obj: Record<string, unknown>): R2Object {
	const serialized = obj as unknown as SerializedR2Object
	return {
		key: serialized.key,
		version: serialized.version,
		size: serialized.size,
		etag: serialized.etag,
		httpEtag: serialized.httpEtag,
		checksums: serialized.checksums,
		uploaded: serialized.uploaded ? new Date(serialized.uploaded) : new Date(),
		httpMetadata: serialized.httpMetadata,
		customMetadata: serialized.customMetadata,
		range: serialized.range,
		storageClass: serialized.storageClass as any,
		writeHttpMetadata(headers: Headers): void {
			if (serialized.httpMetadata?.contentType) {
				headers.set('Content-Type', serialized.httpMetadata.contentType)
			}
			if (serialized.httpMetadata?.contentLanguage) {
				headers.set('Content-Language', serialized.httpMetadata.contentLanguage)
			}
			if (serialized.httpMetadata?.contentDisposition) {
				headers.set('Content-Disposition', serialized.httpMetadata.contentDisposition)
			}
			if (serialized.httpMetadata?.contentEncoding) {
				headers.set('Content-Encoding', serialized.httpMetadata.contentEncoding)
			}
			if (serialized.httpMetadata?.cacheControl) {
				headers.set('Cache-Control', serialized.httpMetadata.cacheControl)
			}
			if (serialized.httpMetadata?.cacheExpiry) {
				headers.set('Expires', new Date(serialized.httpMetadata.cacheExpiry).toUTCString())
			}
		}
	} as R2Object
}

/** Deserialize R2ObjectBody (with body data) */
function deserializeR2ObjectBody(obj: Record<string, unknown>): R2ObjectBody {
	const serialized = obj as unknown as SerializedR2Object
	const bodyBytes = serialized.bodyData ? base64Decode(serialized.bodyData) : new Uint8Array(0)

	// Create a fake R2ObjectBody with working methods
	const r2ObjectBody = {
		key: serialized.key,
		version: serialized.version,
		size: serialized.size,
		etag: serialized.etag,
		httpEtag: serialized.httpEtag,
		checksums: serialized.checksums,
		uploaded: serialized.uploaded ? new Date(serialized.uploaded) : new Date(),
		httpMetadata: serialized.httpMetadata,
		customMetadata: serialized.customMetadata,
		range: serialized.range,
		storageClass: serialized.storageClass as any,
		// Body as ReadableStream
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bodyBytes)
				controller.close()
			}
		}),
		// Whether body has been consumed
		bodyUsed: false,
		// Methods to read body
		async arrayBuffer(): Promise<ArrayBuffer> {
			// Copy the relevant portion to a new ArrayBuffer
			// This ensures we return a proper ArrayBuffer, not SharedArrayBuffer
			const copy = new Uint8Array(bodyBytes.byteLength)
			copy.set(bodyBytes)
			return copy.buffer
		},
		async text(): Promise<string> {
			return new TextDecoder().decode(bodyBytes)
		},
		async json<T>(): Promise<T> {
			const text = new TextDecoder().decode(bodyBytes)
			return JSON.parse(text)
		},
		async blob(): Promise<Blob> {
			const contentType = serialized.httpMetadata?.contentType || 'application/octet-stream'
			// Convert to ArrayBuffer for wider compatibility
			const buffer = bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength) as ArrayBuffer
			return new Blob([buffer], { type: contentType })
		},
		writeHttpMetadata(headers: Headers): void {
			if (serialized.httpMetadata?.contentType) {
				headers.set('Content-Type', serialized.httpMetadata.contentType)
			}
			if (serialized.httpMetadata?.contentLanguage) {
				headers.set('Content-Language', serialized.httpMetadata.contentLanguage)
			}
			if (serialized.httpMetadata?.contentDisposition) {
				headers.set('Content-Disposition', serialized.httpMetadata.contentDisposition)
			}
			if (serialized.httpMetadata?.contentEncoding) {
				headers.set('Content-Encoding', serialized.httpMetadata.contentEncoding)
			}
			if (serialized.httpMetadata?.cacheControl) {
				headers.set('Cache-Control', serialized.httpMetadata.cacheControl)
			}
			if (serialized.httpMetadata?.cacheExpiry) {
				headers.set('Expires', new Date(serialized.httpMetadata.cacheExpiry).toUTCString())
			}
		}
	}

	return r2ObjectBody as R2ObjectBody
}

// -----------------------------------------------------------------------------
// Base64 Utilities
// -----------------------------------------------------------------------------

/** Encode Uint8Array to base64 string */
export function base64Encode(bytes: Uint8Array): string {
	// Use Buffer in Node.js/Bun for performance
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(bytes).toString('base64')
	}
	// Fallback for browser/worker environments
	let binary = ''
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

/** Decode base64 string to Uint8Array */
export function base64Decode(str: string): Uint8Array {
	// Use Buffer in Node.js/Bun for performance
	if (typeof Buffer !== 'undefined') {
		return new Uint8Array(Buffer.from(str, 'base64'))
	}
	// Fallback for browser/worker environments
	const binary = atob(str)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}
