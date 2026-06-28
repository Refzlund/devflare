// =============================================================================
// Bridge Transport v2 — Wire Vocabulary  (RPC envelope, stream/ws control,
// binary frame format, ID counters)
// =============================================================================
// JSON control messages (rpc.call/rpc.ok/rpc.err, stream.*, ws.*, event,
// http.transfer) and the 10-byte binary frame header used by every devflare
// bridge transport. Sits below the codec layer (see codec.ts) which adds the
// hello/welcome handshake and the body-stream registry on top of these
// primitives.
//
// Inline-vs-HTTP fallback rule:
// Body bytes below `HTTP_TRANSFER_THRESHOLD` (512 KB) ride inline as binary WS
// frames over the same WebSocket carrying the RPC control plane. Above that
// threshold the bridge switches to an out-of-band HTTP transfer because
// workerd enforces a ~1 MB per-WebSocket-message limit, so a single oversized
// inline frame would be rejected by the runtime before reaching the peer.
// The transport choice is per-payload (decided when each body is serialized),
// not per-connection: the WS stays open for the RPC envelope and the body
// bytes simply travel via an HTTP fetch instead of a WS frame.
// =============================================================================

// -----------------------------------------------------------------------------
// Control Plane (JSON text frames)
// -----------------------------------------------------------------------------

/** RPC call from client to worker */
export interface RpcCall {
	t: 'rpc.call'
	id: string
	method: string
	params: unknown[]
}

/** Successful RPC response */
export interface RpcOk {
	t: 'rpc.ok'
	id: string
	result: unknown
}

/** Error RPC response */
export interface RpcErr {
	t: 'rpc.err'
	id: string
	error: {
		code: string
		message: string
		details?: unknown
	}
}

/**
 * Out-of-band structured error frame (B5-frame).
 *
 * Sent for failures that are not scoped to a single in-flight RPC: malformed
 * incoming frames, transport-level violations, stream/ws aborts that need a
 * typed cause, and gateway-side bookkeeping errors. Replaces the prior
 * silent-`catch {}` fallthroughs in client/server/codec so a structured cause
 * surfaces back to the peer instead of being logged-only.
 *
 * `scope` lets the peer route the frame: 'rpc' for an RPC-related failure
 * the server could not pin to a call id, 'stream'/'ws' for a body-stream or
 * websocket-proxy failure, or 'transport' for protocol-level violations.
 * `refId` optionally pins the error to a known stream/ws/rpc id.
 */
export interface WireError {
	t: 'error'
	scope: 'transport' | 'rpc' | 'stream' | 'ws'
	error: {
		code: string
		message: string
		details?: unknown
	}
	refId?: string | number
}

/** Event notification (worker → client) */
export interface EventMsg {
	t: 'event'
	topic: string
	data: unknown
}

/** Open a new stream */
export interface StreamOpen {
	t: 'stream.open'
	sid: number
	meta?: {
		contentType?: string
		length?: number
	}
}

/** Request bytes from stream (pull-based backpressure) */
export interface StreamPull {
	t: 'stream.pull'
	sid: number
	creditBytes: number
}

/** Stream completed successfully */
export interface StreamEnd {
	t: 'stream.end'
	sid: number
}

/** Stream aborted with error */
export interface StreamAbort {
	t: 'stream.abort'
	sid: number
	error?: string
}

/** Open WebSocket proxy connection */
export interface WsOpen {
	t: 'ws.open'
	wid: number
	target: {
		binding: string
		id: string
		url: string
		headers?: [string, string][]
	}
}

/** WebSocket proxy opened successfully */
export interface WsOpened {
	t: 'ws.opened'
	wid: number
}

/** Close WebSocket proxy */
export interface WsClose {
	t: 'ws.close'
	wid: number
	code?: number
	reason?: string
}

/** HTTP upload/download for large files */
export interface HttpTransfer {
	t: 'http.transfer'
	id: string
	url: string
	direction: 'upload' | 'download'
}

/** Union of all JSON message types */
export type JsonMsg =
	| RpcCall
	| RpcOk
	| RpcErr
	| WireError
	| EventMsg
	| StreamOpen
	| StreamPull
	| StreamEnd
	| StreamAbort
	| WsOpen
	| WsOpened
	| WsClose
	| HttpTransfer

// -----------------------------------------------------------------------------
// Data Plane (Binary frames)
// -----------------------------------------------------------------------------

/** Binary frame kinds */
export const BinaryKind = {
	StreamChunk: 1,
	WsData: 2
} as const

export type BinaryKind = (typeof BinaryKind)[keyof typeof BinaryKind]

/** Binary frame flags */
export const BinaryFlags = {
	FIN: 0b0001, // Last chunk/frame
	TEXT: 0b0010 // Text vs binary (for WS data)
} as const

/**
 * Binary frame header structure:
 * - kind: u8 (1 = stream chunk, 2 = ws data)
 * - id: u32 (stream id or websocket id)
 * - seq: u32 (sequence number for ordering)
 * - flags: u8 (FIN, TEXT/BINARY)
 * - payload: remaining bytes
 *
 * Total header size: 10 bytes
 */
export const BINARY_HEADER_SIZE = 10

/** Encode a binary frame */
export function encodeBinaryFrame(
	kind: BinaryKind,
	id: number,
	seq: number,
	flags: number,
	payload: Uint8Array
): Uint8Array {
	const frame = new Uint8Array(BINARY_HEADER_SIZE + payload.byteLength)
	const view = new DataView(frame.buffer)

	view.setUint8(0, kind)
	view.setUint32(1, id, true) // little-endian
	view.setUint32(5, seq, true)
	view.setUint8(9, flags)

	frame.set(payload, BINARY_HEADER_SIZE)

	return frame
}

/** Decoded binary frame */
export interface DecodedBinaryFrame {
	kind: BinaryKind
	id: number
	seq: number
	flags: number
	payload: Uint8Array
}

/** Decode a binary frame */
export function decodeBinaryFrame(frame: Uint8Array): DecodedBinaryFrame {
	if (frame.byteLength < BINARY_HEADER_SIZE) {
		throw new Error(`Invalid binary frame: too short (${frame.byteLength} bytes)`)
	}

	const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)

	return {
		kind: view.getUint8(0) as BinaryKind,
		id: view.getUint32(1, true),
		seq: view.getUint32(5, true),
		flags: view.getUint8(9),
		payload: frame.subarray(BINARY_HEADER_SIZE)
	}
}

/** Check if FIN flag is set */
export function isFin(flags: number): boolean {
	return (flags & BinaryFlags.FIN) !== 0
}

/** Check if TEXT flag is set (vs binary) */
export function isText(flags: number): boolean {
	return (flags & BinaryFlags.TEXT) !== 0
}

// -----------------------------------------------------------------------------
// Message Parsing
// -----------------------------------------------------------------------------

/** Parse a JSON message from string */
export function parseJsonMsg(data: string): JsonMsg {
	const msg = JSON.parse(data) as JsonMsg

	// Basic validation
	if (typeof msg !== 'object' || msg === null || !('t' in msg)) {
		throw new Error('Invalid message: missing type field')
	}

	return msg
}

/** Stringify a JSON message */
export function stringifyJsonMsg(msg: JsonMsg): string {
	return JSON.stringify(msg)
}

// -----------------------------------------------------------------------------
// ID Generators
// -----------------------------------------------------------------------------

let rpcIdCounter = 0
let streamIdCounter = 0
let wsIdCounter = 0

/** Generate unique RPC call ID */
export function nextRpcId(): string {
	return `rpc_${++rpcIdCounter}`
}

/** Generate unique stream ID */
export function nextStreamId(): number {
	return ++streamIdCounter
}

/** Generate unique WebSocket proxy ID */
export function nextWsId(): number {
	return ++wsIdCounter
}

/** Reset ID counters (for testing) */
export function resetIdCounters(): void {
	rpcIdCounter = 0
	streamIdCounter = 0
	wsIdCounter = 0
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default chunk size for streaming (256 KB) */
export const DEFAULT_CHUNK_SIZE = 256 * 1024

/** Threshold for switching to HTTP transfer (512 KB — workerd ~1MB WS message limit). */
export const HTTP_TRANSFER_THRESHOLD = 512 * 1024

/** Default WebSocket port for bridge */
export const DEFAULT_BRIDGE_PORT = 8686

/** Default HTTP port for large transfers */
export const DEFAULT_HTTP_PORT = 8687
