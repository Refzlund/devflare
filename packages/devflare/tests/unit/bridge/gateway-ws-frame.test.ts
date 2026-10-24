import { describe, expect, test } from 'bun:test'
import { GATEWAY_RUNTIME_JS } from '../../../src/bridge/gateway-runtime'
import {
	BinaryFlags,
	BinaryKind,
	decodeBinaryFrame,
	encodeBinaryFrame
} from '../../../src/bridge/v2/wire'

// Extract the inlined WsData codec from the gateway worker template so we can
// assert it agrees byte-for-byte with wire.ts. The live bug this guards: the
// gateway and the bridge client diverged on the WS-data wire format, silently
// dropping every payload (including the TEXT flag).
const gateway = new Function(
	`${GATEWAY_RUNTIME_JS}\nreturn { encodeWsDataFrame, decodeWsDataFrame }`
)() as {
	encodeWsDataFrame: (wid: number, flags: number, payload: Uint8Array) => Uint8Array
	decodeWsDataFrame: (
		buffer: ArrayBuffer | Uint8Array
	) => { kind: number; id: number; flags: number; payload: Uint8Array } | null
}

describe('gateway WsData frame codec agrees with wire.ts', () => {
	test('gateway-encoded binary frame decodes via wire.ts (kind/id/flags/payload)', () => {
		const payload = new Uint8Array([1, 2, 3, 4, 250])
		const frame = gateway.encodeWsDataFrame(7, 0, payload)
		const decoded = decodeBinaryFrame(frame)

		expect(decoded.kind).toBe(BinaryKind.WsData)
		expect(decoded.id).toBe(7)
		expect(decoded.flags & BinaryFlags.TEXT).toBe(0)
		expect([...decoded.payload]).toEqual([1, 2, 3, 4, 250])
	})

	test('gateway-encoded TEXT frame preserves the TEXT flag through wire.ts', () => {
		const payload = new TextEncoder().encode('hello')
		const frame = gateway.encodeWsDataFrame(9, BinaryFlags.TEXT, payload)
		const decoded = decodeBinaryFrame(frame)

		expect(decoded.kind).toBe(BinaryKind.WsData)
		expect(decoded.id).toBe(9)
		expect(decoded.flags & BinaryFlags.TEXT).not.toBe(0)
		expect(new TextDecoder().decode(decoded.payload)).toBe('hello')
	})

	test('wire.ts-encoded frame decodes via the gateway codec (both flags)', () => {
		for (const flags of [0, BinaryFlags.TEXT]) {
			const payload = new Uint8Array([9, 8, 7])
			const frame = encodeBinaryFrame(BinaryKind.WsData, 42, 0, flags, payload)
			const decoded = gateway.decodeWsDataFrame(frame)

			expect(decoded).not.toBeNull()
			expect(decoded?.kind).toBe(2) // BinaryKind.WsData
			expect(decoded?.id).toBe(42)
			expect(decoded?.flags).toBe(flags)
			expect([...(decoded?.payload ?? [])]).toEqual([9, 8, 7])
		}
	})

	test('gateway codec rejects a frame shorter than the 10-byte header', () => {
		expect(gateway.decodeWsDataFrame(new Uint8Array([1, 2, 3]))).toBeNull()
	})
})
