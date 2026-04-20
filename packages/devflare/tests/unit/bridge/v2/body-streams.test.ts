// =============================================================================
// Bridge Transport v2 — Body Stream Reader/Writer Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	TRANSPORT_V2_BINARY_HEADER_SIZE,
	TransportV2BinaryFlags,
	TransportV2BinaryKind,
	TransportV2BodyReaderRegistry,
	decodeTransportV2BinaryFrame,
	parseTransportV2ControlMsg,
	writeTransportV2Body
} from '../../../../src/bridge/v2'

function readableStreamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	let index = 0
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index >= chunks.length) {
				controller.close()
				return
			}
			controller.enqueue(chunks[index])
			index += 1
		}
	})
}

interface CapturedFrames {
	text: string[]
	binary: Uint8Array[]
}

function captureIo() {
	const captured: CapturedFrames = { text: [], binary: [] }
	return {
		captured,
		io: {
			sendText: (m: string) => captured.text.push(m),
			sendBinary: (f: Uint8Array) => captured.binary.push(f)
		}
	}
}

describe('writeTransportV2Body', () => {
	test('emits body.open + chunked BodyChunk frames + FIN + body.end', async () => {
		const { captured, io } = captureIo()
		const payload = new Uint8Array(700)
		for (let i = 0; i < payload.length; i++) payload[i] = i % 256
		const source = readableStreamFromChunks([payload])

		await writeTransportV2Body(source, {
			bid: 1,
			kind: 'request',
			rpcId: 'rpc_x',
			io,
			writerOptions: { chunkSize: 256, contentType: 'application/octet-stream', contentLength: 700 }
		})

		expect(captured.text).toHaveLength(2)
		const open = parseTransportV2ControlMsg(captured.text[0]!)
		const end = parseTransportV2ControlMsg(captured.text[1]!)
		expect(open).toEqual({
			t: 'body.open',
			bid: 1,
			kind: 'request',
			rpcId: 'rpc_x',
			contentType: 'application/octet-stream',
			contentLength: 700
		})
		expect(end).toEqual({ t: 'body.end', bid: 1, kind: 'request' })

		// 700 bytes / 256 chunk size → 3 data frames + 1 trailing FIN frame.
		expect(captured.binary).toHaveLength(4)
		const decoded = captured.binary.map((b) => decodeTransportV2BinaryFrame(b))
		expect(decoded[0]!.payload.byteLength).toBe(256)
		expect(decoded[1]!.payload.byteLength).toBe(256)
		expect(decoded[2]!.payload.byteLength).toBe(700 - 512)
		expect(decoded[3]!.payload.byteLength).toBe(0)
		expect(decoded[3]!.flags).toBe(TransportV2BinaryFlags.FIN)
		expect(decoded.map((f) => f.kind)).toEqual([
			TransportV2BinaryKind.BodyChunk,
			TransportV2BinaryKind.BodyChunk,
			TransportV2BinaryKind.BodyChunk,
			TransportV2BinaryKind.BodyChunk
		])
		expect(decoded.map((f) => f.seq)).toEqual([0, 1, 2, 3])
	})

	test('emits a single FIN frame + body.end for an empty source', async () => {
		const { captured, io } = captureIo()
		const source = readableStreamFromChunks([])

		await writeTransportV2Body(source, { bid: 9, kind: 'response', rpcId: 'r', io })

		expect(captured.text).toHaveLength(2)
		expect(captured.binary).toHaveLength(1)
		const frame = decodeTransportV2BinaryFrame(captured.binary[0]!)
		expect(frame.flags).toBe(TransportV2BinaryFlags.FIN)
		expect(frame.payload.byteLength).toBe(0)
	})

	test('rejects non-positive chunk size', async () => {
		const { io } = captureIo()
		await expect(
			writeTransportV2Body(readableStreamFromChunks([]), {
				bid: 1,
				kind: 'request',
				rpcId: 'r',
				io,
				writerOptions: { chunkSize: 0 }
			})
		).rejects.toThrow(/chunk size must be > 0/)
	})

	test('emits body.abort + ABORT-flagged frame when the source errors', async () => {
		const { captured, io } = captureIo()
		const source = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.error(new Error('source exploded'))
			}
		})

		await expect(
			writeTransportV2Body(source, { bid: 3, kind: 'request', rpcId: 'r', io })
		).rejects.toThrow(/source exploded/)

		// At minimum: body.open + body.abort on the text channel; one ABORT-flagged frame on the binary channel.
		expect(captured.text.length).toBeGreaterThanOrEqual(2)
		const abortMsg = parseTransportV2ControlMsg(captured.text[captured.text.length - 1]!)
		expect(abortMsg.t).toBe('body.abort')

		const lastBinary = captured.binary[captured.binary.length - 1]!
		const decoded = decodeTransportV2BinaryFrame(lastBinary)
		expect(decoded.flags & TransportV2BinaryFlags.ABORT).toBe(TransportV2BinaryFlags.ABORT)
	})
})

describe('TransportV2BodyReaderRegistry', () => {
	test('open/getOrOpen/end deliver chunks then close the stream', async () => {
		const registry = new TransportV2BodyReaderRegistry()
		const stream = registry.getOrOpen(7)

		registry.pushChunk({
			kind: TransportV2BinaryKind.BodyChunk,
			id: 7,
			seq: 0,
			flags: 0,
			payload: new Uint8Array([1, 2, 3])
		})
		registry.pushChunk({
			kind: TransportV2BinaryKind.BodyChunk,
			id: 7,
			seq: 1,
			flags: TransportV2BinaryFlags.FIN,
			payload: new Uint8Array(0)
		})

		const reader = stream.getReader()
		const first = await reader.read()
		expect(first.done).toBe(false)
		expect([...(first.value ?? [])]).toEqual([1, 2, 3])
		const second = await reader.read()
		expect(second.done).toBe(true)
		// After FIN the bid is no longer tracked.
		expect(registry.size).toBe(0)
	})

	test('getOrOpen is idempotent', () => {
		const registry = new TransportV2BodyReaderRegistry()
		const a = registry.getOrOpen(11)
		const b = registry.getOrOpen(11)
		expect(a).toBe(b)
	})

	test('open() throws if bid is already registered', () => {
		const registry = new TransportV2BodyReaderRegistry()
		registry.open(99)
		expect(() => registry.open(99)).toThrow(/already registered for bid 99/)
	})

	test('abort() errors the stream', async () => {
		const registry = new TransportV2BodyReaderRegistry()
		const stream = registry.open(2)
		registry.abort(2, 'peer cancelled')
		const reader = stream.getReader()
		await expect(reader.read()).rejects.toThrow(/peer cancelled/)
	})

	test('ABORT flag in a chunk frame errors the stream', async () => {
		const registry = new TransportV2BodyReaderRegistry()
		const stream = registry.open(4)
		registry.pushChunk({
			kind: TransportV2BinaryKind.BodyChunk,
			id: 4,
			seq: 0,
			flags: TransportV2BinaryFlags.ABORT,
			payload: new Uint8Array(0)
		})
		const reader = stream.getReader()
		await expect(reader.read()).rejects.toThrow(/aborted by writer/)
	})

	test('rejects non-BodyChunk frames in pushChunk', () => {
		const registry = new TransportV2BodyReaderRegistry()
		registry.open(5)
		expect(() =>
			registry.pushChunk({
				kind: TransportV2BinaryKind.WsData,
				id: 5,
				seq: 0,
				flags: 0,
				payload: new Uint8Array(0)
			})
		).toThrow(/non-BodyChunk frame/)
	})

	test('chunks copied so pushed buffers can be reused', async () => {
		const registry = new TransportV2BodyReaderRegistry()
		const stream = registry.open(13)
		const sourceBuffer = new Uint8Array([10, 20, 30])
		registry.pushChunk({
			kind: TransportV2BinaryKind.BodyChunk,
			id: 13,
			seq: 0,
			flags: TransportV2BinaryFlags.FIN,
			payload: sourceBuffer
		})
		// Mutate the source buffer after push.
		sourceBuffer.fill(0)
		const reader = stream.getReader()
		const result = await reader.read()
		expect([...(result.value ?? [])]).toEqual([10, 20, 30])
	})
})

describe('TRANSPORT_V2_BINARY_HEADER_SIZE invariant', () => {
	test('writer emits frames whose header length matches the constant', async () => {
		const { captured, io } = captureIo()
		await writeTransportV2Body(readableStreamFromChunks([new Uint8Array([7])]), {
			bid: 1,
			kind: 'request',
			rpcId: 'r',
			io
		})
		for (const frame of captured.binary) {
			expect(frame.byteLength).toBeGreaterThanOrEqual(TRANSPORT_V2_BINARY_HEADER_SIZE)
		}
	})
})
