// =============================================================================
// Bridge Transport v2 — Frame Vocabulary Tests
// =============================================================================
//
// Unit tests for the foundation frame encoders/decoders, handshake parsing,
// and capability negotiation. Pure logic only; nothing here touches the v1
// transport.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	TRANSPORT_V2_BINARY_HEADER_SIZE,
	TRANSPORT_V2_PROTOCOL_VERSION,
	TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE,
	TransportV2BinaryFlags,
	TransportV2BinaryKind,
	decodeTransportV2BinaryFrame,
	encodeTransportV2BinaryFrame,
	negotiateTransportV2Capabilities,
	parseTransportV2ControlMsg,
	stringifyTransportV2ControlMsg,
	transportV2IsAbort,
	transportV2IsFin,
	transportV2IsText
} from '../../../../src/bridge/v2'
import type { TransportV2ControlMsg } from '../../../../src/bridge/v2'

describe('transport v2 — protocol constants', () => {
	test('protocol version is pinned at 2', () => {
		expect(TRANSPORT_V2_PROTOCOL_VERSION).toBe(2)
	})

	test('binary header size is 10 bytes (matches v1 byte layout)', () => {
		expect(TRANSPORT_V2_BINARY_HEADER_SIZE).toBe(10)
	})

	test('unsupported-version close code is in the reserved private range', () => {
		expect(TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE).toBe(4001)
	})

	test('binary kinds 1 and 2 are stable with v1; kind 3 is new for body chunks', () => {
		expect(TransportV2BinaryKind.StreamChunk).toBe(1)
		expect(TransportV2BinaryKind.WsData).toBe(2)
		expect(TransportV2BinaryKind.BodyChunk).toBe(3)
	})

	test('binary flags use disjoint bits', () => {
		expect(TransportV2BinaryFlags.FIN).toBe(0b0001)
		expect(TransportV2BinaryFlags.TEXT).toBe(0b0010)
		expect(TransportV2BinaryFlags.ABORT).toBe(0b0100)
	})
})

describe('transport v2 — binary frame encoder/decoder', () => {
	test('round-trips a body chunk frame with FIN flag set', () => {
		const payload = new Uint8Array([1, 2, 3, 4, 5])
		const encoded = encodeTransportV2BinaryFrame(
			TransportV2BinaryKind.BodyChunk,
			42,
			7,
			TransportV2BinaryFlags.FIN,
			payload
		)

		expect(encoded.byteLength).toBe(TRANSPORT_V2_BINARY_HEADER_SIZE + payload.byteLength)

		const decoded = decodeTransportV2BinaryFrame(encoded)

		expect(decoded.kind).toBe(TransportV2BinaryKind.BodyChunk)
		expect(decoded.id).toBe(42)
		expect(decoded.seq).toBe(7)
		expect(decoded.flags).toBe(TransportV2BinaryFlags.FIN)
		expect([...decoded.payload]).toEqual([1, 2, 3, 4, 5])
		expect(transportV2IsFin(decoded.flags)).toBe(true)
		expect(transportV2IsText(decoded.flags)).toBe(false)
		expect(transportV2IsAbort(decoded.flags)).toBe(false)
	})

	test('round-trips a ws data frame with TEXT and ABORT flags combined', () => {
		const payload = new TextEncoder().encode('aborted text frame')
		const flags = TransportV2BinaryFlags.TEXT | TransportV2BinaryFlags.ABORT
		const encoded = encodeTransportV2BinaryFrame(TransportV2BinaryKind.WsData, 1, 0, flags, payload)
		const decoded = decodeTransportV2BinaryFrame(encoded)

		expect(decoded.kind).toBe(TransportV2BinaryKind.WsData)
		expect(transportV2IsText(decoded.flags)).toBe(true)
		expect(transportV2IsAbort(decoded.flags)).toBe(true)
		expect(transportV2IsFin(decoded.flags)).toBe(false)
		expect(new TextDecoder().decode(decoded.payload)).toBe('aborted text frame')
	})

	test('encodes ids in little-endian byte order', () => {
		const encoded = encodeTransportV2BinaryFrame(
			TransportV2BinaryKind.BodyChunk,
			0x01020304,
			0x05060708,
			0,
			new Uint8Array(0)
		)

		// kind=3 at byte 0; id (LE) at bytes 1..4; seq (LE) at bytes 5..8; flags at byte 9
		expect(encoded[0]).toBe(3)
		expect([...encoded.slice(1, 5)]).toEqual([0x04, 0x03, 0x02, 0x01])
		expect([...encoded.slice(5, 9)]).toEqual([0x08, 0x07, 0x06, 0x05])
		expect(encoded[9]).toBe(0)
	})

	test('rejects out-of-range ids, seq, and flags', () => {
		const empty = new Uint8Array(0)
		expect(() =>
			encodeTransportV2BinaryFrame(TransportV2BinaryKind.BodyChunk, -1, 0, 0, empty)
		).toThrow(RangeError)
		expect(() =>
			encodeTransportV2BinaryFrame(TransportV2BinaryKind.BodyChunk, 0, 0xffffffff + 1, 0, empty)
		).toThrow(RangeError)
		expect(() =>
			encodeTransportV2BinaryFrame(TransportV2BinaryKind.BodyChunk, 0, 0, 0x100, empty)
		).toThrow(RangeError)
	})

	test('rejects under-length frames during decode', () => {
		expect(() => decodeTransportV2BinaryFrame(new Uint8Array(5))).toThrow(/too short/)
	})

	test('rejects unknown binary kinds during decode', () => {
		const buf = new Uint8Array(TRANSPORT_V2_BINARY_HEADER_SIZE)
		buf[0] = 99
		expect(() => decodeTransportV2BinaryFrame(buf)).toThrow(/unknown kind 99/)
	})
})

describe('transport v2 — control message parser', () => {
	test('round-trips a hello frame', () => {
		const msg: TransportV2ControlMsg = {
			t: 'hello',
			protocolVersion: TRANSPORT_V2_PROTOCOL_VERSION,
			capabilities: ['streaming-bodies', 'codegen-gateway']
		}

		const wire = stringifyTransportV2ControlMsg(msg)
		const parsed = parseTransportV2ControlMsg(wire)

		expect(parsed).toEqual(msg)
	})

	test('round-trips body.open / body.end / body.abort frames', () => {
		const open: TransportV2ControlMsg = {
			t: 'body.open',
			bid: 5,
			kind: 'request',
			rpcId: 'rpc_42',
			contentType: 'application/octet-stream',
			contentLength: 1024
		}
		const end: TransportV2ControlMsg = { t: 'body.end', bid: 5, kind: 'request' }
		const abort: TransportV2ControlMsg = {
			t: 'body.abort',
			bid: 5,
			kind: 'response',
			error: 'reader cancelled'
		}

		expect(parseTransportV2ControlMsg(stringifyTransportV2ControlMsg(open))).toEqual(open)
		expect(parseTransportV2ControlMsg(stringifyTransportV2ControlMsg(end))).toEqual(end)
		expect(parseTransportV2ControlMsg(stringifyTransportV2ControlMsg(abort))).toEqual(abort)
	})

	test('rejects payloads missing the type field', () => {
		expect(() => parseTransportV2ControlMsg('{}')).toThrow(/missing type field/)
	})

	test('rejects unknown control types (including v1 message kinds)', () => {
		expect(() =>
			parseTransportV2ControlMsg('{"t":"rpc.call","id":"x","method":"m","params":[]}')
		).toThrow(/unknown type "rpc\.call"/)
	})

	test('rejects hello/welcome with the wrong protocolVersion', () => {
		expect(() =>
			parseTransportV2ControlMsg('{"t":"hello","protocolVersion":1,"capabilities":[]}')
		).toThrow(/protocolVersion 1 != 2/)
	})

	test('rejects hello/welcome with non-array capabilities', () => {
		expect(() =>
			parseTransportV2ControlMsg('{"t":"welcome","protocolVersion":2,"capabilities":"all"}')
		).toThrow(/capabilities must be an array/)
	})
})

describe('transport v2 — capability negotiation', () => {
	test('returns the sorted intersection of supported and advertised capabilities', () => {
		const result = negotiateTransportV2Capabilities(
			['streaming-bodies', 'codegen-gateway', 'experimental'],
			['codegen-gateway', 'streaming-bodies', 'unknown']
		)
		expect(result).toEqual(['codegen-gateway', 'streaming-bodies'])
	})

	test('returns an empty array when there is no overlap', () => {
		expect(negotiateTransportV2Capabilities(['a', 'b'], ['c', 'd'])).toEqual([])
	})

	test('is deterministic regardless of input order', () => {
		const a = negotiateTransportV2Capabilities(['x', 'y', 'z'], ['z', 'y', 'x'])
		const b = negotiateTransportV2Capabilities(['z', 'y', 'x'], ['x', 'y', 'z'])
		expect(a).toEqual(b)
		expect(a).toEqual(['x', 'y', 'z'])
	})

	test('deduplicates repeated capabilities', () => {
		const result = negotiateTransportV2Capabilities(['a', 'a', 'b'], ['a', 'b', 'a', 'b'])
		expect(result).toEqual(['a', 'b'])
	})
})
