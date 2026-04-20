// =============================================================================
// Bridge Transport v2 — Streaming Request/Response Serialization
// =============================================================================
//
// The v2 counterpart to `../serialization.ts`. Bodies are NEVER buffered:
// every non-empty `Request` / `Response` body is emitted as a v2 body stream
// (body.open + BodyChunk... + body.end), and the wire shape only carries the
// body id, not the bytes. This is the key delta from v1 buffered transport.
//
// Empty bodies still skip the stream entirely so trivial messages don't pay
// the per-stream control-frame cost.
// =============================================================================

import { writeTransportV2Body } from './body-streams'
import type { TransportV2Codec } from './codec'

/** Wire-shape body reference for v2: either absent, an empty marker, or a stream id. */
export type TransportV2BodyRef =
	| { type: 'empty' }
	| { type: 'stream'; bid: number; contentType?: string; contentLength?: number }

export interface TransportV2SerializedRequest {
	url: string
	method: string
	headers: [string, string][]
	body: TransportV2BodyRef | null
	redirect?: 'follow' | 'error' | 'manual'
}

export interface TransportV2SerializedResponse {
	status: number
	statusText?: string
	headers: [string, string][]
	body: TransportV2BodyRef | null
}

/**
 * Serialize a `Request` for v2 transport. If the request has a non-empty
 * body, allocates a body id from the codec, returns a body-stream reference
 * in the serialized payload, and immediately starts streaming the body
 * frames in the background. The returned `bodyStreamPromise` resolves once
 * the body has been fully written (or rejects on body source error).
 */
export function serializeRequestV2(
	request: Request,
	codec: TransportV2Codec,
	rpcId: string
): { serialized: TransportV2SerializedRequest; bodyStreamPromise: Promise<void> } {
	const headers: [string, string][] = []
	request.headers.forEach((value, key) => {
		headers.push([key, value])
	})

	const result = streamBodyIfPresent(request.body, request.headers, codec, rpcId, 'request')

	return {
		serialized: {
			url: request.url,
			method: request.method,
			headers,
			body: result.ref,
			redirect: request.redirect as 'follow' | 'error' | 'manual'
		},
		bodyStreamPromise: result.streamPromise
	}
}

/**
 * Deserialize a v2-wire `Request`. If the payload references a body stream,
 * the matching `ReadableStream<Uint8Array>` from the codec's body-reader
 * registry is attached as the request body.
 */
export function deserializeRequestV2(
	serialized: TransportV2SerializedRequest,
	codec: TransportV2Codec
): Request {
	const body = bodyFromRef(serialized.body, codec)
	return new Request(serialized.url, {
		method: serialized.method,
		headers: serialized.headers,
		body,
		redirect: serialized.redirect
	})
}

/** Serialize a `Response` for v2 transport. See `serializeRequestV2`. */
export function serializeResponseV2(
	response: Response,
	codec: TransportV2Codec,
	rpcId: string
): { serialized: TransportV2SerializedResponse; bodyStreamPromise: Promise<void> } {
	const headers: [string, string][] = []
	response.headers.forEach((value, key) => {
		headers.push([key, value])
	})

	const result = streamBodyIfPresent(response.body, response.headers, codec, rpcId, 'response')

	return {
		serialized: {
			status: response.status,
			statusText: response.statusText,
			headers,
			body: result.ref
		},
		bodyStreamPromise: result.streamPromise
	}
}

/** Deserialize a v2-wire `Response`. */
export function deserializeResponseV2(
	serialized: TransportV2SerializedResponse,
	codec: TransportV2Codec
): Response {
	const body = bodyFromRef(serialized.body, codec)
	return new Response(body, {
		status: serialized.status,
		statusText: serialized.statusText,
		headers: serialized.headers
	})
}

function streamBodyIfPresent(
	body: ReadableStream<Uint8Array> | null,
	headers: Headers,
	codec: TransportV2Codec,
	rpcId: string,
	kind: 'request' | 'response'
): { ref: TransportV2BodyRef | null; streamPromise: Promise<void> } {
	if (body === null) {
		return { ref: null, streamPromise: Promise.resolve() }
	}

	const bid = codec.allocateBid()
	const contentType = headers.get('content-type') ?? undefined
	const contentLengthHeader = headers.get('content-length')
	const contentLength = contentLengthHeader !== null ? Number(contentLengthHeader) : undefined
	const ref: TransportV2BodyRef = {
		type: 'stream',
		bid,
		...(contentType !== undefined ? { contentType } : {}),
		...(contentLength !== undefined && Number.isFinite(contentLength) ? { contentLength } : {})
	}

	const streamPromise = writeTransportV2Body(body, {
		bid,
		kind,
		rpcId,
		io: {
			sendText: (message) => codec.sendText(message),
			sendBinary: (frame) => codec.sendBinary(frame)
		},
		writerOptions: {
			...(contentType !== undefined ? { contentType } : {}),
			...(contentLength !== undefined && Number.isFinite(contentLength) ? { contentLength } : {})
		}
	})

	return { ref, streamPromise }
}

function bodyFromRef(
	ref: TransportV2BodyRef | null,
	codec: TransportV2Codec
): BodyInit | null {
	if (ref === null || ref.type === 'empty') return null
	return codec.openBodyReader(ref.bid) as unknown as BodyInit
}
