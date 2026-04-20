// =============================================================================
// Transport v2 — Generic value codec
// =============================================================================
// Pure JSON-friendly serialization for arbitrary RPC params/results.
// Special objects (Date/Map/Set/URL/Error/Uint8Array/ArrayBuffer/Request/
// Response/ReadableStream/DurableObjectId/R2Object/R2ObjectBody) are encoded
// as tagged POJOs so a JSON.stringify round-trip preserves identity. Bodies
// that exceed the JSON envelope travel as v2 body streams; the serialized
// form references them by `bid`.
// =============================================================================

import { writeTransportV2Body } from './body-streams'
import {
	serializeRequestV2,
	deserializeRequestV2,
	serializeResponseV2,
	deserializeResponseV2
} from './serialization'
import type { TransportV2SerializedRequest, TransportV2SerializedResponse } from './serialization'
import type { TransportV2Codec } from './codec'

// -----------------------------------------------------------------------------
// Tagged shapes
// -----------------------------------------------------------------------------

export const TRANSPORT_V2_DO_ID_TYPE = 'DOId' as const

export interface TransportV2SerializedDOId {
	__type: typeof TRANSPORT_V2_DO_ID_TYPE
	hex: string
}

export type TransportV2SerializedSpecial =
	| { __devflare: 'date'; iso: string }
	| { __devflare: 'map'; entries: [unknown, unknown][] }
	| { __devflare: 'set'; values: unknown[] }
	| { __devflare: 'url'; href: string }
	| { __devflare: 'error'; name: string; message: string; stack?: string }

export interface TransportV2SerializedR2Object {
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
	bodyData?: string
}

export interface TransportV2BodyStreamRef {
	__type: 'BodyStream'
	bid: number
}

// -----------------------------------------------------------------------------
// base64 helpers (Node/Bun fast path + browser fallback)
// -----------------------------------------------------------------------------

export function base64Encode(bytes: Uint8Array): string {
	if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
	let binary = ''
	for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
	return btoa(binary)
}

export function base64Decode(str: string): Uint8Array {
	if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'))
	const binary = atob(str)
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
	return out
}

// -----------------------------------------------------------------------------
// DurableObjectId helpers
// -----------------------------------------------------------------------------

export function serializeTransportV2DOId(id: DurableObjectId): TransportV2SerializedDOId {
	return { __type: TRANSPORT_V2_DO_ID_TYPE, hex: id.toString() }
}

export function deserializeTransportV2DOId(
	serialized: TransportV2SerializedDOId | { __type?: unknown; hex?: unknown },
	ns: DurableObjectNamespace
): DurableObjectId {
	if (serialized && (serialized as TransportV2SerializedDOId).__type === TRANSPORT_V2_DO_ID_TYPE) {
		return ns.idFromString((serialized as TransportV2SerializedDOId).hex)
	}
	throw new Error('Invalid DOId format')
}

// -----------------------------------------------------------------------------
// Generic value codec
// -----------------------------------------------------------------------------

export interface TransportV2ValueCtx {
	codec?: TransportV2Codec
	conversationId?: string
	bodyStreamPromises?: Promise<void>[]
	bodyKind?: 'request' | 'response' | 'value'
}

export async function serializeTransportV2Value(
	value: unknown,
	ctx: TransportV2ValueCtx = {}
): Promise<unknown> {
	return serializeInternal(value, ctx)
}

export function deserializeTransportV2Value(
	value: unknown,
	ctx: TransportV2ValueCtx = {}
): unknown {
	return deserializeInternal(value, ctx)
}

async function serializeInternal(value: unknown, ctx: TransportV2ValueCtx): Promise<unknown> {
	if (value === null || value === undefined) return value

	if (value instanceof Request) {
		if (!ctx.codec) throw new Error('serializeTransportV2Value: Request requires ctx.codec')
		const result = serializeRequestV2(value, ctx.codec, ctx.conversationId ?? '')
		ctx.bodyStreamPromises?.push(result.bodyStreamPromise)
		return { __type: 'Request', ...result.serialized }
	}

	if (value instanceof Response) {
		if (!ctx.codec) throw new Error('serializeTransportV2Value: Response requires ctx.codec')
		const result = serializeResponseV2(value, ctx.codec, ctx.conversationId ?? '')
		ctx.bodyStreamPromises?.push(result.bodyStreamPromise)
		return { __type: 'Response', ...result.serialized }
	}

	if (value instanceof ReadableStream) {
		if (!ctx.codec) throw new Error('serializeTransportV2Value: ReadableStream requires ctx.codec')
		const codec = ctx.codec
		const bid = codec.allocateBid()
		const promise = writeTransportV2Body(value as ReadableStream<Uint8Array>, {
			bid,
			kind: ctx.bodyKind ?? 'value',
			rpcId: ctx.conversationId ?? '',
			io: {
				sendText: (m) => codec.sendText(m),
				sendBinary: (f) => codec.sendBinary(f)
			}
		})
		ctx.bodyStreamPromises?.push(promise)
		return { __type: 'BodyStream', bid } satisfies TransportV2BodyStreamRef
	}

	if (value instanceof Uint8Array) {
		return { __type: 'Uint8Array', data: base64Encode(value) }
	}

	if (value instanceof ArrayBuffer) {
		return { __type: 'ArrayBuffer', data: base64Encode(new Uint8Array(value)) }
	}

	if (value instanceof Date) {
		return { __devflare: 'date', iso: value.toISOString() } satisfies TransportV2SerializedSpecial
	}

	if (value instanceof URL) {
		return { __devflare: 'url', href: value.href } satisfies TransportV2SerializedSpecial
	}

	if (value instanceof Error) {
		const encoded: TransportV2SerializedSpecial = {
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
			entries.push([await serializeInternal(k, ctx), await serializeInternal(v, ctx)])
		}
		return { __devflare: 'map', entries } satisfies TransportV2SerializedSpecial
	}

	if (value instanceof Set) {
		const values: unknown[] = []
		for (const v of value.values()) values.push(await serializeInternal(v, ctx))
		return { __devflare: 'set', values } satisfies TransportV2SerializedSpecial
	}

	if (Array.isArray(value)) {
		return Promise.all(value.map((v) => serializeInternal(v, ctx)))
	}

	if (typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) out[k] = await serializeInternal(v, ctx)
		return out
	}

	return value
}

function deserializeInternal(value: unknown, ctx: TransportV2ValueCtx): unknown {
	if (value === null || value === undefined) return value
	if (typeof value !== 'object') return value

	if (Array.isArray(value)) {
		return value.map((v) => deserializeInternal(v, ctx))
	}

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
					map.set(deserializeInternal(k, ctx), deserializeInternal(v, ctx))
				}
				return map
			}
			case 'set': {
				const values = (obj.values as unknown[]) ?? []
				const set = new Set<unknown>()
				for (const v of values) set.add(deserializeInternal(v, ctx))
				return set
			}
		}
	}

	if (obj.__type === 'Request') {
		if (!ctx.codec) throw new Error('deserializeTransportV2Value: Request requires ctx.codec')
		return deserializeRequestV2(obj as unknown as TransportV2SerializedRequest, ctx.codec)
	}

	if (obj.__type === 'Response') {
		if (!ctx.codec) throw new Error('deserializeTransportV2Value: Response requires ctx.codec')
		return deserializeResponseV2(obj as unknown as TransportV2SerializedResponse, ctx.codec)
	}

	if (obj.__type === 'BodyStream') {
		if (!ctx.codec) throw new Error('deserializeTransportV2Value: BodyStream requires ctx.codec')
		return ctx.codec.openBodyReader(obj.bid as number)
	}

	if (obj.__type === 'Uint8Array') {
		return base64Decode(obj.data as string)
	}

	if (obj.__type === 'ArrayBuffer') {
		return base64Decode(obj.data as string).buffer
	}

	if (obj.__type === 'R2Object') return deserializeR2Object(obj)
	if (obj.__type === 'R2ObjectBody') return deserializeR2ObjectBody(obj)

	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(obj)) out[k] = deserializeInternal(v, ctx)
	return out
}

// -----------------------------------------------------------------------------
// R2 helpers (mirror v1 wire shape)
// -----------------------------------------------------------------------------

export function serializeR2Object(obj: R2Object | null): unknown {
	if (!obj) return null
	return {
		__type: 'R2Object',
		key: obj.key,
		version: obj.version,
		size: obj.size,
		etag: obj.etag,
		httpEtag: obj.httpEtag,
		checksums: obj.checksums,
		uploaded: obj.uploaded?.toISOString(),
		httpMetadata: obj.httpMetadata,
		customMetadata: obj.customMetadata,
		range: obj.range,
		storageClass: obj.storageClass
	}
}

export async function serializeR2ObjectBody(obj: R2ObjectBody | R2Object | null): Promise<unknown> {
	if (!obj) return null

	const hasBody = 'body' in obj || 'arrayBuffer' in obj
	if (!hasBody) return serializeR2Object(obj as R2Object)

	const body = obj as R2ObjectBody
	const arrayBuffer = await body.arrayBuffer()
	const bodyData = base64Encode(new Uint8Array(arrayBuffer))

	return {
		__type: 'R2ObjectBody',
		key: body.key,
		version: body.version,
		size: body.size,
		etag: body.etag,
		httpEtag: body.httpEtag,
		checksums: body.checksums,
		uploaded: body.uploaded?.toISOString(),
		httpMetadata: body.httpMetadata,
		customMetadata: body.customMetadata,
		range: body.range,
		storageClass: body.storageClass,
		bodyData
	}
}

function applySerializedHttpMetadata(headers: Headers, httpMetadata?: R2HTTPMetadata): void {
	if (httpMetadata?.contentType) headers.set('Content-Type', httpMetadata.contentType)
	if (httpMetadata?.contentLanguage) headers.set('Content-Language', httpMetadata.contentLanguage)
	if (httpMetadata?.contentDisposition) headers.set('Content-Disposition', httpMetadata.contentDisposition)
	if (httpMetadata?.contentEncoding) headers.set('Content-Encoding', httpMetadata.contentEncoding)
	if (httpMetadata?.cacheControl) headers.set('Cache-Control', httpMetadata.cacheControl)
	if (httpMetadata?.cacheExpiry) headers.set('Expires', new Date(httpMetadata.cacheExpiry).toUTCString())
}

function createSerializedR2Metadata(serialized: TransportV2SerializedR2Object) {
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
		storageClass: serialized.storageClass as R2Object['storageClass'],
		writeHttpMetadata(headers: Headers): void {
			applySerializedHttpMetadata(headers, serialized.httpMetadata)
		}
	}
}

function deserializeR2Object(obj: Record<string, unknown>): R2Object {
	const serialized = obj as unknown as TransportV2SerializedR2Object
	return { ...createSerializedR2Metadata(serialized) } as R2Object
}

function deserializeR2ObjectBody(obj: Record<string, unknown>): R2ObjectBody {
	const serialized = obj as unknown as TransportV2SerializedR2Object
	const bodyBytes = serialized.bodyData ? base64Decode(serialized.bodyData) : new Uint8Array(0)

	const r2ObjectBody = {
		...createSerializedR2Metadata(serialized),
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bodyBytes)
				controller.close()
			}
		}),
		bodyUsed: false,
		async arrayBuffer(): Promise<ArrayBuffer> {
			const copy = new Uint8Array(bodyBytes.byteLength)
			copy.set(bodyBytes)
			return copy.buffer
		},
		async text(): Promise<string> {
			return new TextDecoder().decode(bodyBytes)
		},
		async json<T>(): Promise<T> {
			return JSON.parse(new TextDecoder().decode(bodyBytes))
		},
		async blob(): Promise<Blob> {
			const contentType = serialized.httpMetadata?.contentType || 'application/octet-stream'
			const buffer = bodyBytes.buffer.slice(
				bodyBytes.byteOffset,
				bodyBytes.byteOffset + bodyBytes.byteLength
			) as ArrayBuffer
			return new Blob([buffer], { type: contentType })
		}
	}

	return r2ObjectBody as unknown as R2ObjectBody
}
