// =============================================================================
// Transport v2 — Value codec round-trip tests
// =============================================================================
// Mirrors `tests/unit/bridge/serialization.test.ts` for the v2 value codec.
// JSON-friendly special values (Date/URL/Error/Map/Set/Uint8Array/ArrayBuffer/
// R2 stubs) round-trip without involving any codec — only stream-bearing
// values (Request/Response/ReadableStream) require a live codec.
// =============================================================================

import { describe, test, expect } from 'bun:test'
import {
	serializeTransportV2Value,
	deserializeTransportV2Value,
	serializeTransportV2DOId,
	deserializeTransportV2DOId,
	TRANSPORT_V2_DO_ID_TYPE,
	base64Encode,
	base64Decode,
	serializeR2Object,
	serializeR2ObjectBody
} from '../../../../src/bridge/v2/value-codec'

async function jsonRoundTrip<T>(value: T): Promise<unknown> {
	const encoded = await serializeTransportV2Value(value)
	const transported = JSON.parse(JSON.stringify(encoded))
	return deserializeTransportV2Value(transported)
}

describe('v2 value codec — special values', () => {
	test('round-trips Date', async () => {
		const original = new Date('2025-01-02T03:04:05.678Z')
		const result = (await jsonRoundTrip(original)) as Date
		expect(result).toBeInstanceOf(Date)
		expect(result.toISOString()).toBe(original.toISOString())
	})

	test('round-trips URL', async () => {
		const original = new URL('https://example.com/path?q=1#frag')
		const result = (await jsonRoundTrip(original)) as URL
		expect(result).toBeInstanceOf(URL)
		expect(result.href).toBe(original.href)
	})

	test('round-trips Error preserving name/message/stack', async () => {
		const original = new TypeError('boom')
		const result = (await jsonRoundTrip(original)) as Error
		expect(result).toBeInstanceOf(Error)
		expect(result.name).toBe('TypeError')
		expect(result.message).toBe('boom')
		expect(typeof result.stack).toBe('string')
	})

	test('round-trips Map with nested URLs', async () => {
		const original = new Map<string, URL>([
			['home', new URL('https://example.com/')],
			['docs', new URL('https://example.com/docs')]
		])
		const result = (await jsonRoundTrip(original)) as Map<string, URL>
		expect(result).toBeInstanceOf(Map)
		expect(result.size).toBe(2)
		expect(result.get('home')?.href).toBe('https://example.com/')
		expect(result.get('docs')?.href).toBe('https://example.com/docs')
	})

	test('round-trips Set with nested Dates', async () => {
		const d1 = new Date('2025-05-05T00:00:00.000Z')
		const d2 = new Date('2026-06-06T00:00:00.000Z')
		const result = (await jsonRoundTrip(new Set<Date>([d1, d2]))) as Set<Date>
		expect(result).toBeInstanceOf(Set)
		expect(result.size).toBe(2)
		const isos = Array.from(result).map((d) => d.toISOString()).sort()
		expect(isos).toEqual([d1.toISOString(), d2.toISOString()])
	})

	test('round-trips Uint8Array via base64', async () => {
		const original = new Uint8Array([1, 2, 3, 0, 255, 7])
		const result = (await jsonRoundTrip(original)) as Uint8Array
		expect(result).toBeInstanceOf(Uint8Array)
		expect(Array.from(result)).toEqual(Array.from(original))
	})

	test('round-trips ArrayBuffer via base64', async () => {
		const bytes = new Uint8Array([10, 20, 30])
		const result = (await jsonRoundTrip(bytes.buffer)) as ArrayBuffer
		expect(result).toBeInstanceOf(ArrayBuffer)
		expect(Array.from(new Uint8Array(result))).toEqual([10, 20, 30])
	})

	test('round-trips deeply nested mixed structure', async () => {
		const original = {
			when: new Date('2025-07-08T09:10:11.000Z'),
			tags: new Set(['alpha', 'beta']),
			meta: new Map<string, URL>([['root', new URL('https://devflare.dev/')]]),
			cause: new Error('kapow')
		}
		const result = (await jsonRoundTrip(original)) as typeof original
		expect(result.when).toBeInstanceOf(Date)
		expect(result.when.toISOString()).toBe(original.when.toISOString())
		expect(result.tags).toBeInstanceOf(Set)
		expect(Array.from(result.tags).sort()).toEqual(['alpha', 'beta'])
		expect(result.meta.get('root')?.href).toBe('https://devflare.dev/')
		expect(result.cause).toBeInstanceOf(Error)
		expect(result.cause.message).toBe('kapow')
	})

	test('passes through primitives & plain containers untouched', async () => {
		expect(await jsonRoundTrip(null)).toBe(null)
		expect(await jsonRoundTrip(42)).toBe(42)
		expect(await jsonRoundTrip('hello')).toBe('hello')
		expect(await jsonRoundTrip([1, 2, 'three'])).toEqual([1, 2, 'three'])
		expect(await jsonRoundTrip({ a: 1, b: 'two', c: [3] })).toEqual({ a: 1, b: 'two', c: [3] })
	})
})

describe('v2 value codec — DurableObjectId helpers', () => {
	test('serializeTransportV2DOId emits the canonical wire shape', () => {
		const fakeId = { toString: () => 'abc123' } as DurableObjectId
		const wire = serializeTransportV2DOId(fakeId)
		expect(wire).toEqual({ __type: TRANSPORT_V2_DO_ID_TYPE, hex: 'abc123' })
	})

	test('deserializeTransportV2DOId calls ns.idFromString with the hex', () => {
		const calls: string[] = []
		const ns = {
			idFromString: (hex: string) => {
				calls.push(hex)
				return { hex } as unknown as DurableObjectId
			}
		} as unknown as DurableObjectNamespace
		const out = deserializeTransportV2DOId({ __type: TRANSPORT_V2_DO_ID_TYPE, hex: 'deadbeef' }, ns)
		expect(calls).toEqual(['deadbeef'])
		expect(out).toEqual({ hex: 'deadbeef' } as unknown as DurableObjectId)
	})

	test('deserializeTransportV2DOId rejects unknown shapes', () => {
		const ns = { idFromString: () => null } as unknown as DurableObjectNamespace
		expect(() => deserializeTransportV2DOId({ __type: 'wrong', hex: 'x' } as unknown as { __type: typeof TRANSPORT_V2_DO_ID_TYPE; hex: string }, ns)).toThrow('Invalid DOId format')
	})
})

describe('v2 value codec — base64 helpers', () => {
	test('encode/decode round-trips arbitrary bytes', () => {
		const bytes = new Uint8Array(256)
		for (let i = 0; i < 256; i++) bytes[i] = i
		const decoded = base64Decode(base64Encode(bytes))
		expect(Array.from(decoded)).toEqual(Array.from(bytes))
	})

	test('encodes empty input as empty string', () => {
		expect(base64Encode(new Uint8Array(0))).toBe('')
		expect(base64Decode('').byteLength).toBe(0)
	})
})

describe('v2 value codec — R2 helpers', () => {
	test('serializeR2Object emits the metadata-only wire shape', () => {
		const obj = {
			key: 'k',
			version: 'v',
			size: 3,
			etag: 'e',
			httpEtag: 'he',
			checksums: {} as R2Checksums,
			uploaded: new Date('2025-01-01T00:00:00Z'),
			httpMetadata: { contentType: 'text/plain' } as R2HTTPMetadata,
			customMetadata: { a: '1' },
			range: undefined,
			storageClass: 'Standard'
		} as unknown as R2Object
		const wire = serializeR2Object(obj) as Record<string, unknown>
		expect(wire.__type).toBe('R2Object')
		expect(wire.key).toBe('k')
		expect(wire.uploaded).toBe('2025-01-01T00:00:00.000Z')
	})

	test('serializeR2Object returns null for null input', () => {
		expect(serializeR2Object(null)).toBe(null)
	})

	test('serializeR2ObjectBody embeds bodyData as base64', async () => {
		const body = new TextEncoder().encode('hello world')
		const obj = {
			key: 'k',
			version: 'v',
			size: body.byteLength,
			etag: 'e',
			httpEtag: 'he',
			checksums: {} as R2Checksums,
			uploaded: new Date('2025-01-01T00:00:00Z'),
			httpMetadata: undefined,
			customMetadata: undefined,
			range: undefined,
			storageClass: 'Standard',
			body: new ReadableStream(),
			arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
		} as unknown as R2ObjectBody
		const wire = (await serializeR2ObjectBody(obj)) as Record<string, unknown>
		expect(wire.__type).toBe('R2ObjectBody')
		expect(wire.bodyData).toBe(base64Encode(body))
	})

	test('jsonRoundTrip rebuilds R2Object metadata + R2ObjectBody methods', async () => {
		const body = new TextEncoder().encode('hi')
		const wire = await serializeR2ObjectBody({
			key: 'k',
			version: 'v',
			size: body.byteLength,
			etag: 'e',
			httpEtag: 'he',
			checksums: {} as R2Checksums,
			uploaded: new Date('2025-01-01T00:00:00Z'),
			httpMetadata: { contentType: 'text/plain' } as R2HTTPMetadata,
			customMetadata: undefined,
			range: undefined,
			storageClass: 'Standard',
			body: new ReadableStream(),
			arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
		} as unknown as R2ObjectBody)

		const transported = JSON.parse(JSON.stringify(wire))
		const decoded = deserializeTransportV2Value(transported) as R2ObjectBody
		expect(decoded.key).toBe('k')
		expect(await decoded.text()).toBe('hi')
	})
})
