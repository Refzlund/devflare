// =============================================================================
// Bridge Transport v2 — Public Surface
// =============================================================================
//
// Phase 2/3 of the F09/F11 program landed the codec, body streams, in-memory
// transport pair, and streaming request/response serialization. None of this
// is wired into the existing `BridgeServer` / `BridgeClient` /
// `gateway-runtime.ts` modules yet — see `../TRANSPORT_V2.md` for the
// migration plan.
// =============================================================================

export type {
	TransportV2BodyWriterIo,
	TransportV2BodyWriterOptions
} from './body-streams'
export {
	TRANSPORT_V2_DEFAULT_BODY_CHUNK_SIZE,
	TransportV2BodyReaderRegistry,
	writeTransportV2Body
} from './body-streams'
export type {
	TransportV2CodecOptions,
	TransportV2HandshakeOk,
	TransportV2RpcCall,
	TransportV2RpcErr,
	TransportV2RpcMsg,
	TransportV2RpcOk,
	TransportV2WireError
} from './codec'
export { TransportV2Codec } from './codec'
export type {
	TransportV2BodyAbort,
	TransportV2BodyEnd,
	TransportV2BodyKind,
	TransportV2BodyOpen,
	TransportV2ControlMsg,
	TransportV2DecodedBinaryFrame,
	TransportV2Hello,
	TransportV2Welcome
} from './frames'
export {
	decodeTransportV2BinaryFrame,
	encodeTransportV2BinaryFrame,
	negotiateTransportV2Capabilities,
	parseTransportV2ControlMsg,
	stringifyTransportV2ControlMsg,
	TRANSPORT_V2_BINARY_HEADER_SIZE,
	TRANSPORT_V2_PROTOCOL_VERSION,
	TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE,
	TransportV2BinaryFlags,
	TransportV2BinaryKind,
	transportV2IsAbort,
	transportV2IsFin,
	transportV2IsText
} from './frames'
export type {
	TransportV2BodyRef,
	TransportV2SerializedRequest,
	TransportV2SerializedResponse
} from './serialization'
export {
	deserializeRequestV2,
	deserializeResponseV2,
	serializeRequestV2,
	serializeResponseV2
} from './serialization'
export type {
	TransportV2InMemoryPair,
	WebSocketLike,
	WebSocketLikeCloseEvent,
	WebSocketLikeMessageEvent
} from './transport'
export { createTransportV2Pair } from './transport'
