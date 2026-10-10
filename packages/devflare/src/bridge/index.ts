// =============================================================================
// Bridge Module — Exports
// =============================================================================

// Protocol & Message Types

export {
	BINARY_HEADER_SIZE,
	BinaryFlags,
	BinaryKind,
	DEFAULT_BRIDGE_PORT,
	DEFAULT_CHUNK_SIZE,
	DEFAULT_HTTP_PORT,
	type DecodedBinaryFrame,
	decodeBinaryFrame,
	type EventMsg,
	encodeBinaryFrame,
	HTTP_TRANSFER_THRESHOLD,
	type HttpTransfer,
	isFin,
	isText,
	type JsonMsg,
	nextRpcId,
	nextStreamId,
	nextWsId,
	parseJsonMsg,
	type RpcCall,
	type RpcErr,
	type RpcOk,
	resetIdCounters,
	type StreamAbort,
	type StreamEnd,
	type StreamOpen,
	type StreamPull,
	stringifyJsonMsg,
	type WsClose,
	type WsOpen,
	type WsOpened
} from './v2/wire'

// Serialization

export {
	type BodyRef,
	deserializeRequest,
	deserializeResponse,
	deserializeValue,
	type SerializedRequest,
	type SerializedResponse,
	serializeDOId,
	serializeRequest,
	serializeResponse,
	serializeValue
} from './v2/value-serialization'

// Client

export {
	BridgeClient,
	type BridgeClientOptions,
	getClient,
	type PendingCall
} from './client'

// Proxy

export {
	type BindingHints,
	bridgeEnv,
	createEnvProxy,
	type EnvProxyOptions,
	initEnv,
	setBindingHints
} from './proxy'

// Miniflare Orchestration

export {
	getMiniflare,
	type MiniflareInstance,
	type MiniflareOptions,
	startMiniflare,
	startMiniflareFromConfig,
	stopMiniflare
} from './miniflare'

// Gateway Worker (Server-side)

export { default as gateway } from './server'
