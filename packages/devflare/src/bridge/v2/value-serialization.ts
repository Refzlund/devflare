// =============================================================================
// Bridge Transport v2 — Value Serialization  (Request/Response/special types)
// =============================================================================
// Converts Web API objects (Request, Response, ReadableStream, Date, Map,
// Set, URL, Error, Uint8Array, ArrayBuffer, R2Object, R2ObjectBody) and
// `DurableObjectId` to/from serializable POJOs for transport across the
// bridge. Tagged-POJO format is the canonical wire shape used by every
// gateway runtime variant.
// =============================================================================

import { HTTP_TRANSFER_THRESHOLD, nextStreamId } from './wire'

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
	| { type: 'bytes'; data: string } // base64 for JSON transport
	| { type: 'stream'; sid: number }

/**
 * Canonical wire discriminator for a serialized `DurableObjectId`.
 *
 * Kept as a shared constant so the TypeScript serializers in `server.ts` and
 * the stringified gateway runtime (`gateway-runtime.ts`) agree on a single
 * shape. DO NOT change without coordinating both sides of the bridge.
 */
export const DO_ID_TYPE = 'DOId' as const

/** Serialized DurableObjectId — matches the wire shape emitted by every gateway variant. */
export interface SerializedDOId {
	__type: typeof DO_ID_TYPE
	hex: string
}

// -----------------------------------------------------------------------------
// Header Serialization
// -----------------------------------------------------------------------------

/**
 * Read every `Set-Cookie` header value as a SEPARATE string.
 *
 * `Headers.forEach`/`entries()`/`get()` fold multiple `Set-Cookie` headers into
 * one comma-joined value (the Fetch spec's sort-and-combine), which corrupts
 * cookies: the second cookie's attributes bleed into the first. Only the
 * dedicated accessors keep them apart — the standard `getSetCookie()` (Bun,
 * Node, and workerd on a compatibility date ≥ 2023-08-01) or workerd's legacy
 * `getAll('set-cookie')` (present on older compat dates that predate
 * `getSetCookie`).
 *
 * @param headers - The header set to read.
 * @returns Each `Set-Cookie` value in insertion order, or `null` when the
 *   runtime exposes neither accessor — the caller then keeps the combined value
 *   rather than dropping the header.
 */
export function readSetCookieValues(headers: Headers): string[] | null {
	const accessors = headers as Headers & {
		getSetCookie?: () => string[]
		getAll?: (name: string) => string[]
	}
	if (typeof accessors.getSetCookie === 'function') {
		const values = accessors.getSetCookie()
		return Array.isArray(values) ? values : null
	}
	if (typeof accessors.getAll === 'function') {
		try {
			const values = accessors.getAll('set-cookie')
			return Array.isArray(values) ? values : null
		} catch {
			return null
		}
	}
	return null
}

/**
 * Flatten a `Headers` set to `[name, value]` pairs WITHOUT collapsing multiple
 * `Set-Cookie` headers into one, so a response setting several cookies survives
 * the bridge round-trip byte-faithfully.
 *
 * Non-cookie headers are emitted via `forEach` as before. `Set-Cookie` is
 * enumerated separately (see `readSetCookieValues`) and appended as its own pair
 * per cookie, so the reconstructing `new Headers(pairs)` re-`append`s each one.
 * When the runtime can split neither (no `getSetCookie`/`getAll`), the combined
 * `forEach` value is kept verbatim — graceful degradation, never a dropped
 * header.
 *
 * @param headers - The header set to flatten.
 * @returns `[name, value]` pairs safe to round-trip; each `Set-Cookie` is a
 *   distinct pair.
 */
export function serializeHeaders(headers: Headers): [string, string][] {
	const setCookies = readSetCookieValues(headers)
	const pairs: [string, string][] = []
	headers.forEach((value, key) => {
		// Drop the (possibly combined) Set-Cookie value here; the individual
		// cookies are appended below. Only drop it when we actually recovered
		// them, otherwise keep the verbatim value so nothing is lost.
		if (setCookies !== null && key.toLowerCase() === 'set-cookie') return
		pairs.push([key, value])
	})
	if (setCookies) {
		for (const cookie of setCookies) {
			pairs.push(['set-cookie', cookie])
		}
	}
	return pairs
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
	const threshold = options?.httpThreshold ?? HTTP_TRANSFER_THRESHOLD

	const headers = serializeHeaders(request.headers)

	let body: BodyRef | null = null

	if (request.body) {
		// Always read the body as bytes for reliability
		// Stream handling is complex and often unreliable across RPC
		const bytes = await request.arrayBuffer()

		if (bytes.byteLength > threshold) {
			// A request body above the inline threshold would have to ride as a
			// stream from client → gateway, but the real dev gateway does not yet
			// consume streamed request bodies (it has no stream.* handlers). Fail
			// loudly rather than silently dropping the body. (Oversized responses
			// are likewise capped: the inlined dev gateway-runtime throws above the
			// threshold; the typed reference `server.ts` path streams them.)
			throw new Error(
				'Request body exceeds the bridge inline limit (~512 KB) and large request-body streaming is not yet supported over the local bridge. ' +
					'Send the payload in smaller chunks or via an R2 binding for now.'
			)
		}
		if (bytes.byteLength > 0) {
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
	const threshold = options?.httpThreshold ?? HTTP_TRANSFER_THRESHOLD

	const headers = serializeHeaders(response.headers)

	let body: BodyRef | null = null

	if (response.body) {
		// Always read the body as bytes for reliability
		// Stream handling is complex and often unreliable across RPC
		const bytes = await response.arrayBuffer()

		if (bytes.byteLength > threshold) {
			// Oversized response body → ride as a binary StreamChunk stream
			// (the workerd ~1 MB per-WebSocket-message limit makes a single
			// inline frame unsafe above the threshold). A one-shot ReadableStream
			// carries the already-buffered bytes; the gateway registers it from
			// the returned `streams` and pumps it on stream.pull, and the client
			// reassembles it via getStream(sid). Fully wired gateway → client.
			const sid = nextStreamId()
			const payload = new Uint8Array(bytes)
			// Slice the buffered body into frames no larger than the inline
			// threshold (~512 KB) so no single StreamChunk frame exceeds workerd's
			// ~1 MB per-WebSocket-message limit. The pump forwards each enqueued
			// chunk as one frame without re-chunking, so a one-shot enqueue of the
			// whole payload would re-introduce the oversized-frame failure for
			// responses larger than ~1 MB.
			const frameSize = HTTP_TRANSFER_THRESHOLD
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					for (let offset = 0; offset < payload.byteLength; offset += frameSize) {
						controller.enqueue(
							payload.slice(offset, Math.min(offset + frameSize, payload.byteLength))
						)
					}
					controller.close()
				}
			})
			streams.push({ sid, stream })
			body = { type: 'stream', sid }
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

/** Serialize a DurableObjectId to the canonical wire shape. */
export function serializeDOId(id: DurableObjectId): SerializedDOId {
	return { __type: DO_ID_TYPE, hex: id.toString() }
}

/** Deserialize a canonical `SerializedDOId` back into a `DurableObjectId` bound to `ns`. */
export function deserializeDOId(
	serialized: SerializedDOId | { __type?: unknown; hex?: unknown },
	ns: DurableObjectNamespace
): DurableObjectId {
	if (serialized && (serialized as SerializedDOId).__type === DO_ID_TYPE) {
		return ns.idFromString((serialized as SerializedDOId).hex)
	}
	throw new Error('Invalid DOId format')
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
	if (value instanceof Date) return true
	if (value instanceof Map) return true
	if (value instanceof Set) return true
	if (value instanceof URL) return true
	if (value instanceof Error) return true
	return false
}

/** Discriminator tag for structurally-encoded special values */
export type SerializedSpecial =
	| { __devflare: 'date'; iso: string }
	| { __devflare: 'map'; entries: [unknown, unknown][] }
	| { __devflare: 'set'; values: unknown[] }
	| { __devflare: 'url'; href: string }
	| { __devflare: 'error'; name: string; message: string; stack?: string }

/** Serialize a value that may contain special types */
export async function serializeValue(
	value: unknown,
	options?: { httpThreshold?: number }
): Promise<{
	value: unknown
	streams: StreamRef[]
}> {
	const streams: StreamRef[] = []

	const result = await serializeValueInternal(value, streams, options)

	return { value: result, streams }
}

async function serializeValueInternal(
	value: unknown,
	streams: StreamRef[],
	options?: { httpThreshold?: number }
): Promise<unknown> {
	if (value === null || value === undefined) {
		return value
	}

	if (value instanceof Request) {
		const { serialized, streams: reqStreams } = await serializeRequest(value, options)
		streams.push(...reqStreams)
		return { __type: 'Request', ...serialized }
	}

	if (value instanceof Response) {
		const { serialized, streams: resStreams } = await serializeResponse(value, options)
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

	if (value instanceof Date) {
		return { __devflare: 'date', iso: value.toISOString() } satisfies SerializedSpecial
	}

	if (value instanceof URL) {
		return { __devflare: 'url', href: value.href } satisfies SerializedSpecial
	}

	if (value instanceof Error) {
		const encoded: SerializedSpecial = {
			__devflare: 'error',
			name: value.name,
			message: value.message
		}
		if (value.stack) encoded.stack = value.stack
		return encoded
	}

	if (value instanceof Map) {
		const entries: [unknown, unknown][] = []
		for (const [k, v] of value.entries()) {
			entries.push([
				await serializeValueInternal(k, streams, options),
				await serializeValueInternal(v, streams, options)
			])
		}
		return { __devflare: 'map', entries } satisfies SerializedSpecial
	}

	if (value instanceof Set) {
		const values: unknown[] = []
		for (const v of value.values()) {
			values.push(await serializeValueInternal(v, streams, options))
		}
		return { __devflare: 'set', values } satisfies SerializedSpecial
	}

	if (Array.isArray(value)) {
		return Promise.all(value.map((v) => serializeValueInternal(v, streams, options)))
	}

	if (typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = await serializeValueInternal(v, streams, options)
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

		if (typeof obj.__devflare === 'string') {
			switch (obj.__devflare) {
				case 'date':
					return new Date(obj.iso as string)
				case 'url':
					return new URL(obj.href as string)
				case 'error': {
					const err = new Error(obj.message as string)
					if (typeof obj.name === 'string') err.name = obj.name
					if (typeof obj.stack === 'string') err.stack = obj.stack
					return err
				}
				case 'map': {
					const entries = (obj.entries as [unknown, unknown][]) ?? []
					const map = new Map<unknown, unknown>()
					for (const [k, v] of entries) {
						map.set(deserializeValue(k, getStream), deserializeValue(v, getStream))
					}
					return map
				}
				case 'set': {
					const values = (obj.values as unknown[]) ?? []
					const set = new Set<unknown>()
					for (const v of values) {
						set.add(deserializeValue(v, getStream))
					}
					return set
				}
			}
		}

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
	bodyData?: string // Base64-encoded body (only for R2ObjectBody)
}

function applySerializedHttpMetadata(headers: Headers, httpMetadata?: R2HTTPMetadata): void {
	if (httpMetadata?.contentType) {
		headers.set('Content-Type', httpMetadata.contentType)
	}
	if (httpMetadata?.contentLanguage) {
		headers.set('Content-Language', httpMetadata.contentLanguage)
	}
	if (httpMetadata?.contentDisposition) {
		headers.set('Content-Disposition', httpMetadata.contentDisposition)
	}
	if (httpMetadata?.contentEncoding) {
		headers.set('Content-Encoding', httpMetadata.contentEncoding)
	}
	if (httpMetadata?.cacheControl) {
		headers.set('Cache-Control', httpMetadata.cacheControl)
	}
	if (httpMetadata?.cacheExpiry) {
		headers.set('Expires', new Date(httpMetadata.cacheExpiry).toUTCString())
	}
}

function createSerializedR2Metadata(serialized: SerializedR2Object) {
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
			applySerializedHttpMetadata(headers, serialized.httpMetadata)
		}
	}
}

/** Deserialize R2Object (metadata only) */
function deserializeR2Object(obj: Record<string, unknown>): R2Object {
	const serialized = obj as unknown as SerializedR2Object
	return {
		...createSerializedR2Metadata(serialized)
	} as R2Object
}

/** Deserialize R2ObjectBody (with body data) */
function deserializeR2ObjectBody(obj: Record<string, unknown>): R2ObjectBody {
	const serialized = obj as unknown as SerializedR2Object
	const bodyBytes = serialized.bodyData ? base64Decode(serialized.bodyData) : new Uint8Array(0)

	// Create a fake R2ObjectBody with working methods
	const r2ObjectBody = {
		...createSerializedR2Metadata(serialized),
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
			const buffer = bodyBytes.buffer.slice(
				bodyBytes.byteOffset,
				bodyBytes.byteOffset + bodyBytes.byteLength
			) as ArrayBuffer
			return new Blob([buffer], { type: contentType })
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
