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

export {
	TRANSPORT_V2_PROTOCOL_VERSION,
	TRANSPORT_V2_UNSUPPORTED_VERSION_CLOSE_CODE,
	TRANSPORT_V2_BINARY_HEADER_SIZE,
	TransportV2BinaryKind,
	TransportV2BinaryFlags,
	encodeTransportV2BinaryFrame,
	decodeTransportV2BinaryFrame,
	transportV2IsFin,
	transportV2IsText,
	transportV2IsAbort,
	parseTransportV2ControlMsg,
	stringifyTransportV2ControlMsg,
	negotiateTransportV2Capabilities
} from './frames'
export type {
	TransportV2Hello,
	TransportV2Welcome,
	TransportV2BodyKind,
	TransportV2BodyOpen,
	TransportV2BodyEnd,
	TransportV2BodyAbort,
	TransportV2ControlMsg,
	TransportV2DecodedBinaryFrame
} from './frames'

export {
	TRANSPORT_V2_DEFAULT_BODY_CHUNK_SIZE,
	TransportV2BodyReaderRegistry,
	writeTransportV2Body
} from './body-streams'
export type {
	TransportV2BodyWriterIo,
	TransportV2BodyWriterOptions
} from './body-streams'

export { TransportV2Codec } from './codec'
export type {
	TransportV2CodecOptions,
	TransportV2HandshakeOk,
	TransportV2RpcCall,
	TransportV2RpcErr,
	TransportV2RpcMsg,
	TransportV2RpcOk,
	TransportV2WireError
} from './codec'

export { createTransportV2Pair } from './transport'
export type {
	TransportV2InMemoryPair,
	WebSocketLike,
	WebSocketLikeCloseEvent,
	WebSocketLikeMessageEvent
} from './transport'

export {
	deserializeRequestV2,
	deserializeResponseV2,
	serializeRequestV2,
	serializeResponseV2
} from './serialization'
export type {
	TransportV2BodyRef,
	TransportV2SerializedRequest,
	TransportV2SerializedResponse
} from './serialization'
