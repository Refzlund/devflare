// =============================================================================
// Bridge Transport v2 — Body Stream Reader / Writer
// =============================================================================
//
// Turns a Web `ReadableStream<Uint8Array>` body into a sequence of
// `body.open` + `BodyChunk` frames + `body.end` (writer side), and the inverse
// (reader side) — collecting incoming chunk frames into a `ReadableStream`
// that callers can attach to a `Request` / `Response`.
//
// SCOPE: pure transport concerns. The codec module owns frame I/O and stream
// id allocation. This module owns chunking, FIN/ABORT handling, and the
// reader-side queue.
// =============================================================================

import {
	TransportV2BinaryFlags,
	TransportV2BinaryKind,
	encodeTransportV2BinaryFrame,
	stringifyTransportV2ControlMsg,
	transportV2IsAbort,
	transportV2IsFin
} from './frames'
import type {
	TransportV2BodyAbort,
	TransportV2BodyEnd,
	TransportV2BodyKind,
	TransportV2BodyOpen,
	TransportV2DecodedBinaryFrame
} from './frames'

/** Default maximum payload size per body chunk frame (256 KiB). */
export const TRANSPORT_V2_DEFAULT_BODY_CHUNK_SIZE = 256 * 1024

export interface TransportV2BodyWriterOptions {
	/** Maximum payload bytes per `BodyChunk` frame. Defaults to 256 KiB. */
	chunkSize?: number
	/** Optional content-length hint to include in `body.open`. */
	contentLength?: number
	/** Optional content-type hint to include in `body.open`. */
	contentType?: string
}

export interface TransportV2BodyWriterIo {
	sendText(message: string): void
	sendBinary(frame: Uint8Array): void
}

/**
 * Stream a `ReadableStream<Uint8Array>` over the v2 wire as `body.open` +
 * `BodyChunk` frames + `body.end`. Returns once the source stream is
 * exhausted or has been cancelled by the writer.
 *
 * The returned promise rejects if either the source stream errors or one of
 * the I/O calls throws; in both cases a `body.abort` frame is emitted before
 * the promise rejects so the reader side can release resources.
 */
export async function writeTransportV2Body(
	source: ReadableStream<Uint8Array>,
	options: {
		bid: number
		kind: TransportV2BodyKind
		rpcId: string
		io: TransportV2BodyWriterIo
		writerOptions?: TransportV2BodyWriterOptions
	}
): Promise<void> {
	const { bid, kind, rpcId, io, writerOptions } = options
	const chunkSize = writerOptions?.chunkSize ?? TRANSPORT_V2_DEFAULT_BODY_CHUNK_SIZE
	if (chunkSize <= 0) {
		throw new RangeError(`v2 body writer chunk size must be > 0 (got ${chunkSize})`)
	}

	const open: TransportV2BodyOpen = {
		t: 'body.open',
		bid,
		kind,
		rpcId,
		...(writerOptions?.contentType !== undefined ? { contentType: writerOptions.contentType } : {}),
		...(writerOptions?.contentLength !== undefined ? { contentLength: writerOptions.contentLength } : {})
	}
	io.sendText(stringifyTransportV2ControlMsg(open))

	const reader = source.getReader()
	let seq = 0

	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			if (value === undefined) continue

			let offset = 0
			while (offset < value.byteLength) {
				const end = Math.min(offset + chunkSize, value.byteLength)
				const slice = value.subarray(offset, end)
				io.sendBinary(
					encodeTransportV2BinaryFrame(
						TransportV2BinaryKind.BodyChunk,
						bid,
						seq,
						0,
						slice
					)
				)
				seq += 1
				offset = end
			}
		}

		// Final FIN-only frame so the reader's queue closes deterministically
		// even when the source stream produced zero bytes total.
		io.sendBinary(
			encodeTransportV2BinaryFrame(
				TransportV2BinaryKind.BodyChunk,
				bid,
				seq,
				TransportV2BinaryFlags.FIN,
				new Uint8Array(0)
			)
		)
		const end: TransportV2BodyEnd = { t: 'body.end', bid, kind }
		io.sendText(stringifyTransportV2ControlMsg(end))
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const abort: TransportV2BodyAbort = { t: 'body.abort', bid, kind, error: message }
		try {
			io.sendBinary(
				encodeTransportV2BinaryFrame(
					TransportV2BinaryKind.BodyChunk,
					bid,
					seq,
					TransportV2BinaryFlags.ABORT,
					new Uint8Array(0)
				)
			)
			io.sendText(stringifyTransportV2ControlMsg(abort))
		} catch {
			// Swallow secondary I/O errors — the original failure is what callers care about.
		}
		throw error
	} finally {
		reader.releaseLock()
	}
}

interface BodyReaderState {
	controller: ReadableStreamDefaultController<Uint8Array> | null
	stream: ReadableStream<Uint8Array>
	closed: boolean
}

/**
 * Tracks in-flight v2 body streams on the reader side. The codec routes
 * incoming `body.open` / `body.end` / `body.abort` control messages and
 * `BodyChunk` binary frames here; consumers of v2 RPC results obtain a
 * `ReadableStream<Uint8Array>` to attach to a `Request` / `Response`.
 */
export class TransportV2BodyReaderRegistry {
	#streams = new Map<number, BodyReaderState>()

	/** Register a new body stream and return the reader-side `ReadableStream`. Idempotent: returns the existing stream if `bid` is already registered. */
	getOrOpen(bid: number): ReadableStream<Uint8Array> {
		const existing = this.#streams.get(bid)
		if (existing !== undefined) return existing.stream
		return this.open(bid)
	}

	/** Register a new body stream and return the reader-side `ReadableStream`. Throws if `bid` is already registered. */
	open(bid: number): ReadableStream<Uint8Array> {
		if (this.#streams.has(bid)) {
			throw new Error(`v2 body reader already registered for bid ${bid}`)
		}
		const state: BodyReaderState = {
			controller: null,
			stream: null as unknown as ReadableStream<Uint8Array>,
			closed: false
		}
		state.stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				state.controller = controller
			},
			cancel: () => {
				state.closed = true
				this.#streams.delete(bid)
			}
		})
		this.#streams.set(bid, state)
		return state.stream
	}

	/** Push a decoded BodyChunk frame to the matching reader. */
	pushChunk(frame: TransportV2DecodedBinaryFrame): void {
		if (frame.kind !== TransportV2BinaryKind.BodyChunk) {
			throw new Error(`v2 body reader received non-BodyChunk frame (kind=${frame.kind})`)
		}
		const state = this.#streams.get(frame.id)
		if (state === undefined || state.closed) return

		const isFin = transportV2IsFin(frame.flags)
		const isAbort = transportV2IsAbort(frame.flags)

		if (isAbort) {
			state.closed = true
			state.controller?.error(new Error(`v2 body stream ${frame.id} aborted by writer`))
			this.#streams.delete(frame.id)
			return
		}

		if (frame.payload.byteLength > 0) {
			// Copy the payload because the underlying buffer may be reused by
			// the codec for subsequent frames.
			state.controller?.enqueue(new Uint8Array(frame.payload))
		}

		if (isFin) {
			state.closed = true
			state.controller?.close()
			this.#streams.delete(frame.id)
		}
	}

	/** Handle a `body.end` control message (writer signalled clean end). */
	end(bid: number): void {
		const state = this.#streams.get(bid)
		if (state === undefined || state.closed) return
		state.closed = true
		state.controller?.close()
		this.#streams.delete(bid)
	}

	/** Handle a `body.abort` control message. */
	abort(bid: number, reason?: string): void {
		const state = this.#streams.get(bid)
		if (state === undefined || state.closed) return
		state.closed = true
		state.controller?.error(new Error(reason ?? `v2 body stream ${bid} aborted`))
		this.#streams.delete(bid)
	}

	/** Number of currently open reader-side body streams (for tests/diagnostics). */
	get size(): number {
		return this.#streams.size
	}
}
