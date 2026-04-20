// =============================================================================
// Bridge Serialization — Special Value Round-Trip Tests
// =============================================================================

import { describe, test, expect } from 'bun:test'
import {
	serializeValue,
	deserializeValue,
	serializeRequest,
	deserializeRequest,
	serializeResponse,
	deserializeResponse,
	serializeDOId,
	deserializeDOId,
	DO_ID_TYPE
} from '../../../src/bridge/v2/value-serialization'

async function roundTrip<T>(value: T): Promise<unknown> {
	const { value: encoded } = await serializeValue(value)
	// Simulate a JSON transport round-trip
	const transported = JSON.parse(JSON.stringify(encoded))
	return deserializeValue(transported)
}

describe('serializeValue / deserializeValue — special objects', () => {
	test('round-trips Date', async () => {
		const original = new Date('2025-01-02T03:04:05.678Z')
		const result = await roundTrip(original)
		expect(result).toBeInstanceOf(Date)
		expect((result as Date).toISOString()).toBe(original.toISOString())
	})

	test('round-trips URL via .href', async () => {
		const original = new URL('https://example.com/path?q=1#frag')
		const result = await roundTrip(original)
		expect(result).toBeInstanceOf(URL)
		expect((result as URL).href).toBe(original.href)
	})

	test('round-trips Error preserving name/message/stack', async () => {
		const original = new TypeError('boom')
		const result = await roundTrip(original)
		expect(result).toBeInstanceOf(Error)
		expect((result as Error).name).toBe('TypeError')
		expect((result as Error).message).toBe('boom')
		expect(typeof (result as Error).stack).toBe('string')
	})

	test('round-trips Map with nested special values', async () => {
		const original = new Map<string, URL>([
			['home', new URL('https://example.com/')],
			['docs', new URL('https://example.com/docs')]
		])
		const result = await roundTrip(original)
		expect(result).toBeInstanceOf(Map)
		const resMap = result as Map<string, URL>
		expect(resMap.size).toBe(2)
		expect(resMap.get('home')).toBeInstanceOf(URL)
		expect(resMap.get('home')?.href).toBe('https://example.com/')
		expect(resMap.get('docs')?.href).toBe('https://example.com/docs')
	})

	test('round-trips Set with nested special values', async () => {
		const d1 = new Date('2025-05-05T00:00:00.000Z')
		const d2 = new Date('2026-06-06T00:00:00.000Z')
		const original = new Set<Date>([d1, d2])
		const result = await roundTrip(original)
		expect(result).toBeInstanceOf(Set)
		const resSet = result as Set<Date>
		expect(resSet.size).toBe(2)
		const isoValues = Array.from(resSet).map((d) => d.toISOString()).sort()
		expect(isoValues).toEqual([d1.toISOString(), d2.toISOString()])
	})

	test('round-trips deeply nested mixed structure', async () => {
		const original = {
			when: new Date('2025-07-08T09:10:11.000Z'),
			tags: new Set(['alpha', 'beta']),
			meta: new Map<string, URL>([['root', new URL('https://devflare.dev/')]]),
			cause: new Error('kapow')
		}

		const result = (await roundTrip(original)) as typeof original

		expect(result.when).toBeInstanceOf(Date)
		expect(result.when.toISOString()).toBe(original.when.toISOString())

		expect(result.tags).toBeInstanceOf(Set)
		expect(Array.from(result.tags).sort()).toEqual(['alpha', 'beta'])

		expect(result.meta).toBeInstanceOf(Map)
		expect(result.meta.get('root')).toBeInstanceOf(URL)
		expect(result.meta.get('root')?.href).toBe('https://devflare.dev/')

		expect(result.cause).toBeInstanceOf(Error)
		expect(result.cause.message).toBe('kapow')
	})
})

describe('serializeValue / deserializeValue — primitives & plain containers', () => {
	test('round-trips primitives', async () => {
		expect(await roundTrip(42)).toBe(42)
		expect(await roundTrip('hello')).toBe('hello')
		expect(await roundTrip(true)).toBe(true)
		expect(await roundTrip(false)).toBe(false)
		expect(await roundTrip(null)).toBe(null)
	})

	test('preserves undefined at top level', async () => {
		const { value: encoded } = await serializeValue(undefined)
		expect(encoded).toBeUndefined()
		expect(deserializeValue(encoded)).toBeUndefined()
	})

	test('round-trips plain arrays', async () => {
		const original = [1, 'two', true, null, [3, 4]]
		const result = await roundTrip(original)
		expect(result).toEqual(original)
	})

	test('round-trips plain objects', async () => {
		const original = { a: 1, b: 'two', c: { d: [5, 6] } }
		const result = await roundTrip(original)
		expect(result).toEqual(original)
	})
})

describe('serializeRequest / serializeResponse \u2014 body transport', () => {
	test('inline Request body round-trips through bytes branch', async () => {
		const original = new Request('https://example.com/api', {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: 'hello world'
		})

		const { serialized } = await serializeRequest(original)
		expect(serialized.body?.type).toBe('bytes')

		const transported = JSON.parse(JSON.stringify(serialized))
		const restored = deserializeRequest(transported)
		expect(await restored.text()).toBe('hello world')
	})

	test('inline Response body round-trips through bytes branch', async () => {
		const original = new Response('payload', { status: 201, headers: { 'X-Test': '1' } })

		const { serialized } = await serializeResponse(original)
		expect(serialized.body?.type).toBe('bytes')

		const transported = JSON.parse(JSON.stringify(serialized))
		const restored = deserializeResponse(transported)
		expect(restored.status).toBe(201)
		expect(restored.headers.get('X-Test')).toBe('1')
		expect(await restored.text()).toBe('payload')
	})

	test('serializeRequest throws for bodies above the http threshold', async () => {
		const big = new Uint8Array(32)
		const original = new Request('https://example.com/upload', { method: 'POST', body: big })

		await expect(serializeRequest(original, { httpThreshold: 16 })).rejects.toThrow(
			/http body transfer not implemented/
		)
	})

	test('serializeResponse throws for bodies above the http threshold', async () => {
		const original = new Response(new Uint8Array(32))

		await expect(serializeResponse(original, { httpThreshold: 16 })).rejects.toThrow(
			/http body transfer not implemented/
		)
	})
})

describe('serializeDOId / deserializeDOId \u2014 canonical wire shape', () => {
	test('emits the canonical { __type: DOId, hex } wire shape', () => {
		const fakeId = { toString: () => 'deadbeef' } as unknown as DurableObjectId
		const serialized = serializeDOId(fakeId)
		expect(serialized).toEqual({ __type: DO_ID_TYPE, hex: 'deadbeef' })
		expect(serialized.__type).toBe('DOId')
	})

	test('deserializeDOId round-trips through a DurableObjectNamespace.idFromString', () => {
		const fakeId = { toString: () => 'cafef00d' } as unknown as DurableObjectId
		const received: string[] = []
		const ns = {
			idFromString: (hex: string) => {
				received.push(hex)
				return fakeId
			}
		} as unknown as DurableObjectNamespace

		const serialized = serializeDOId(fakeId)
		const restored = deserializeDOId(serialized, ns)
		expect(restored).toBe(fakeId)
		expect(received).toEqual(['cafef00d'])
	})

	test('deserializeDOId rejects unknown shapes', () => {
		const ns = { idFromString: () => { throw new Error('should not be called') } } as unknown as DurableObjectNamespace
		expect(() => deserializeDOId({ type: 'do-id', hexId: 'x' } as never, ns)).toThrow(/Invalid DOId format/)
	})
})
