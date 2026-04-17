import { describe, expect, test } from 'bun:test'
import { createMockKV } from '../../../src/test/utilities'

const BINARY = new Uint8Array([0xff, 0xfe, 0xfd, 0x00, 0xaa])

const expectBytesEqual = (actual: Uint8Array, expected: Uint8Array) => {
	expect(actual.length).toBe(expected.length)
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]).toBe(expected[i])
	}
}

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
	const reader = stream.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	while (true) {
		const result = await reader.read()
		if (result.done) break
		if (result.value) {
			chunks.push(result.value)
			total += result.value.length
		}
	}
	const out = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.length
	}
	return out
}

describe('createMockKV', () => {
	test('round-trips non-UTF-8 ArrayBuffer via put(ArrayBuffer) + get(arrayBuffer)', async () => {
		const kv = createMockKV()
		const input = new Uint8Array(BINARY)
		await kv.put('bin', input.buffer)

		const out = (await kv.get('bin', 'arrayBuffer')) as ArrayBuffer
		expect(out).toBeInstanceOf(ArrayBuffer)
		expectBytesEqual(new Uint8Array(out), BINARY)
	})

	test('arrayBuffer result is independent of stored bytes', async () => {
		const kv = createMockKV()
		await kv.put('bin', new Uint8Array(BINARY).buffer)

		const first = (await kv.get('bin', 'arrayBuffer')) as ArrayBuffer
		new Uint8Array(first).fill(0)

		const second = (await kv.get('bin', 'arrayBuffer')) as ArrayBuffer
		expectBytesEqual(new Uint8Array(second), BINARY)
	})

	test('round-trips bytes put via multi-chunk ReadableStream', async () => {
		const kv = createMockKV()
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([0xff, 0xfe]))
				controller.enqueue(new Uint8Array([0xfd]))
				controller.enqueue(new Uint8Array([0x00, 0xaa]))
				controller.close()
			}
		})

		await kv.put('bin', stream)

		const out = (await kv.get('bin', 'arrayBuffer')) as ArrayBuffer
		expectBytesEqual(new Uint8Array(out), BINARY)
	})

	test('get(type: stream) emits bytes equal to stored payload', async () => {
		const kv = createMockKV()
		await kv.put('bin', new Uint8Array(BINARY).buffer)

		const stream = (await kv.get('bin', 'stream')) as ReadableStream<Uint8Array>
		expect(stream).toBeInstanceOf(ReadableStream)
		const collected = await readAll(stream)
		expectBytesEqual(collected, BINARY)
	})

	test('default text put/get still works', async () => {
		const kv = createMockKV()
		await kv.put('greeting', 'hello world')

		expect(await kv.get('greeting')).toBe('hello world')
		expect(await kv.get('greeting', 'text')).toBe('hello world')
	})

	test('get(type: json) parses JSON strings', async () => {
		const kv = createMockKV()
		const payload = { a: 1, b: [true, 'x'] }
		await kv.put('obj', JSON.stringify(payload))

		const parsed = (await kv.get('obj', 'json')) as typeof payload
		expect(parsed).toEqual(payload)
	})

	test('list returns stored key names', async () => {
		const kv = createMockKV({ alpha: '1' })
		await kv.put('beta', 'two')
		await kv.put('gamma', new Uint8Array([0xff]).buffer)

		const result = await kv.list()
		const names = result.keys.map((k) => k.name).sort()
		expect(names).toEqual(['alpha', 'beta', 'gamma'])
	})

	test('get returns null for missing key', async () => {
		const kv = createMockKV()
		expect(await kv.get('missing')).toBeNull()
	})

	test('delete removes entries', async () => {
		const kv = createMockKV({ a: '1' })
		await kv.delete('a')
		expect(await kv.get('a')).toBeNull()
		const result = await kv.list()
		expect(result.keys).toEqual([])
	})

	test('getWithMetadata returns binary-safe ArrayBuffer when requested', async () => {
		const kv = createMockKV()
		await kv.put('bin', new Uint8Array(BINARY).buffer)

		const result = await kv.getWithMetadata('bin', { type: 'arrayBuffer' })
		expect(result.value).toBeInstanceOf(ArrayBuffer)
		expectBytesEqual(new Uint8Array(result.value as ArrayBuffer), BINARY)
	})

	test('getWithMetadata returns ReadableStream when type is stream', async () => {
		const kv = createMockKV()
		await kv.put('bin', new Uint8Array(BINARY).buffer)

		const result = await kv.getWithMetadata('bin', { type: 'stream' })
		expect(result.value).toBeInstanceOf(ReadableStream)
		const collected = await readAll(result.value as ReadableStream<Uint8Array>)
		expectBytesEqual(collected, BINARY)
	})

	test('getWithMetadata parses JSON when type is json', async () => {
		const kv = createMockKV()
		const payload = { ok: true, n: 42 }
		await kv.put('obj', JSON.stringify(payload))

		const result = await kv.getWithMetadata('obj', { type: 'json' })
		expect(result.value).toEqual(payload)
	})
})
