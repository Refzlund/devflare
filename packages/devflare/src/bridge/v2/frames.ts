// =============================================================================
// Bridge Transport v2 — Frame Vocabulary
// =============================================================================
//
// Foundation module for the F09/F11 transport-v2 program. See
// `../TRANSPORT_V2.md` for the architecture note this implements.
//
// SCOPE: This file defines the wire vocabulary (control-plane JSON kinds,
// extended binary frame header, handshake payloads) and pure encoder/decoder
// helpers. It is intentionally NOT imported by the existing `server.ts`,
// `client.ts`, `proxy.ts`, or `miniflare.ts` modules. Wiring is deferred to
// the dual-mode phase so v1 transport behavior stays bit-identical until v2
// reaches feature parity.
// =============================================================================

// -----------------------------------------------------------------------------
// Protocol version
// -----------------------------------------------------------------------------

/** Wire protocol version emitted in `hello` / `welcome` handshakes. */
export const TRANSPORT_V2_PROTOCOL_VERSION = 2 as const

/** WebSocket close code used when v2 ↔ v1 mismatch is detected at handshake. */
export const TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE = 4001 as const

// -----------------------------------------------------------------------------
// Control plane — handshake
// -----------------------------------------------------------------------------

/** Initial handshake sent by the side that opens the WebSocket. */
export interface TransportV2Hello {
	t: 'hello'
	protocolVersion: typeof TRANSPORT_V2_PROTOCOL_VERSION
	capabilities: string[]
}

/** Handshake reply with the negotiated capability intersection. */
export interface TransportV2Welcome {
	t: 'welcome'
	protocolVersion: typeof TRANSPORT_V2_PROTOCOL_VERSION
	capabilities: string[]
}

// -----------------------------------------------------------------------------
// Control plane — body streams
// -----------------------------------------------------------------------------

/** Side that owns a body stream. `'value'` is used for free-standing
 * ReadableStream parameters/results that are not tied to a Request/Response. */
export type TransportV2BodyKind = 'request' | 'response' | 'value'

/** Declares a streaming body for an in-flight request or response. */
export interface TransportV2BodyOpen {
	t: 'body.open'
	bid: number
	kind: TransportV2BodyKind
	rpcId: string
	contentType?: string
	contentLength?: number
}

/** Signals that a body stream has finished cleanly. */
export interface TransportV2BodyEnd {
	t: 'body.end'
	bid: number
	kind: TransportV2BodyKind
}

/** Signals that a body stream was cancelled or errored. */
export interface TransportV2BodyAbort {
	t: 'body.abort'
	bid: number
	kind: TransportV2BodyKind
	error?: string
}

/** Union of v2-specific JSON control messages. */
export type TransportV2ControlMsg =
	| TransportV2Hello
	| TransportV2Welcome
	| TransportV2BodyOpen
	| TransportV2BodyEnd
	| TransportV2BodyAbort

// -----------------------------------------------------------------------------
// Data plane — extended binary frame
// -----------------------------------------------------------------------------

/**
 * Binary frame kinds for v2. Values 1 (StreamChunk) and 2 (WsData) are
 * deliberately stable with v1 so a future shared decoder can route either
 * version's frames. Value 3 (BodyChunk) is new in v2 for HTTP body streams.
 */
export const TransportV2BinaryKind = {
	StreamChunk: 1,
	WsData: 2,
	BodyChunk: 3
} as const

export type TransportV2BinaryKind =
	(typeof TransportV2BinaryKind)[keyof typeof TransportV2BinaryKind]

/** Binary frame flags for v2. */
export const TransportV2BinaryFlags = {
	FIN: 0b0001,
	TEXT: 0b0010,
	ABORT: 0b0100
} as const

/**
 * Binary frame header layout (10 bytes, identical to v1 so wire shape stays
 * compatible at the byte level for shared frame kinds):
 *
 *   u8  kind      — TransportV2BinaryKind
 *   u32 id        — stream / ws / body id (little-endian)
 *   u32 seq       — sequence number for ordering
 *   u8  flags     — TransportV2BinaryFlags bitset
 *   …   payload  — opaque bytes
 */
export const TRANSPORT_V2_BINARY_HEADER_SIZE = 10

/** A decoded v2 binary frame. */
export interface TransportV2DecodedBinaryFrame {
	kind: TransportV2BinaryKind
	id: number
	seq: number
	flags: number
	payload: Uint8Array
}

/** Encode a v2 binary frame. Pure; allocates a single Uint8Array. */
export function encodeTransportV2BinaryFrame(
	kind: TransportV2BinaryKind,
	id: number,
	seq: number,
	flags: number,
	payload: Uint8Array
): Uint8Array {
	if (id < 0 || id > 0xffffffff) {
		throw new RangeError(`Transport v2 frame id out of range: ${id}`)
	}
	if (seq < 0 || seq > 0xffffffff) {
		throw new RangeError(`Transport v2 frame seq out of range: ${seq}`)
	}
	if (flags < 0 || flags > 0xff) {
		throw new RangeError(`Transport v2 frame flags out of range: ${flags}`)
	}

	const frame = new Uint8Array(TRANSPORT_V2_BINARY_HEADER_SIZE + payload.byteLength)
	const view = new DataView(frame.buffer)

	view.setUint8(0, kind)
	view.setUint32(1, id, true)
	view.setUint32(5, seq, true)
	view.setUint8(9, flags)

	frame.set(payload, TRANSPORT_V2_BINARY_HEADER_SIZE)

	return frame
}

/** Decode a v2 binary frame. Pure; returns a view that aliases the input bytes. */
export function decodeTransportV2BinaryFrame(frame: Uint8Array): TransportV2DecodedBinaryFrame {
	if (frame.byteLength < TRANSPORT_V2_BINARY_HEADER_SIZE) {
		throw new Error(
			`Invalid transport v2 binary frame: too short (${frame.byteLength} bytes, need at least ${TRANSPORT_V2_BINARY_HEADER_SIZE})`
		)
	}

	const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
	const kind = view.getUint8(0)

	if (
		kind !== TransportV2BinaryKind.StreamChunk &&
		kind !== TransportV2BinaryKind.WsData &&
		kind !== TransportV2BinaryKind.BodyChunk
	) {
		throw new Error(`Invalid transport v2 binary frame: unknown kind ${kind}`)
	}

	return {
		kind: kind as TransportV2BinaryKind,
		id: view.getUint32(1, true),
		seq: view.getUint32(5, true),
		flags: view.getUint8(9),
		payload: frame.subarray(TRANSPORT_V2_BINARY_HEADER_SIZE)
	}
}

/** True when the FIN flag is set on a v2 binary frame. */
export function transportV2IsFin(flags: number): boolean {
	return (flags & TransportV2BinaryFlags.FIN) !== 0
}

/** True when the TEXT flag is set on a v2 binary frame. */
export function transportV2IsText(flags: number): boolean {
	return (flags & TransportV2BinaryFlags.TEXT) !== 0
}

/** True when the ABORT flag is set on a v2 binary frame. */
export function transportV2IsAbort(flags: number): boolean {
	return (flags & TransportV2BinaryFlags.ABORT) !== 0
}

// -----------------------------------------------------------------------------
// Control plane — parse / stringify
// -----------------------------------------------------------------------------

const KNOWN_V2_CONTROL_TYPES = new Set(['hello', 'welcome', 'body.open', 'body.end', 'body.abort'])

/**
 * Parse a JSON string as a v2-specific control message. Returns the typed
 * message or throws if the payload is not a recognised v2 control type.
 *
 * Callers that need to multiplex v1 `JsonMsg` and v2 control messages should
 * inspect the `t` field first and dispatch accordingly; this helper is
 * deliberately strict so that v2-only code paths never silently accept v1
 * payloads.
 */
export function parseTransportV2ControlMsg(data: string): TransportV2ControlMsg {
	const msg = JSON.parse(data) as TransportV2ControlMsg

	if (typeof msg !== 'object' || msg === null || !('t' in msg)) {
		throw new Error('Invalid transport v2 control message: missing type field')
	}
	if (!KNOWN_V2_CONTROL_TYPES.has(msg.t)) {
		throw new Error(`Invalid transport v2 control message: unknown type "${msg.t}"`)
	}

	if (msg.t === 'hello' || msg.t === 'welcome') {
		if (msg.protocolVersion !== TRANSPORT_V2_PROTOCOL_VERSION) {
			throw new Error(
				`Invalid transport v2 ${msg.t}: protocolVersion ${msg.protocolVersion} != ${TRANSPORT_V2_PROTOCOL_VERSION}`
			)
		}
		if (!Array.isArray(msg.capabilities)) {
			throw new Error(`Invalid transport v2 ${msg.t}: capabilities must be an array`)
		}
	}

	return msg
}

/** Stringify a v2 control message. Pure. */
export function stringifyTransportV2ControlMsg(msg: TransportV2ControlMsg): string {
	return JSON.stringify(msg)
}

// -----------------------------------------------------------------------------
// Capability negotiation
// -----------------------------------------------------------------------------

/**
 * Compute the capability intersection a server should announce in its
 * `welcome` reply, given its own supported set and the client's `hello`
 * advertisement. Order is deterministic (sorted) so the wire output is
 * reproducible across runs.
 */
export function negotiateTransportV2Capabilities(
	supported: readonly string[],
	advertised: readonly string[]
): string[] {
	const supportedSet = new Set(supported)
	const intersection = advertised.filter((cap) => supportedSet.has(cap))
	return [...new Set(intersection)].sort()
}
