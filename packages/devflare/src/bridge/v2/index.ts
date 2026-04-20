// =============================================================================
// Bridge Transport v2 — Public Surface (foundation)
// =============================================================================
//
// Re-exports the v2 frame vocabulary. Nothing in this barrel wires v2 into
// the existing transport — see `../TRANSPORT_V2.md` for the migration plan.
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
