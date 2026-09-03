// =============================================================================
// Bridge Module — Exports
// =============================================================================

// Protocol & Message Types
export {
	type JsonMsg,
	type RpcCall,
	type RpcOk,
	type RpcErr,
	type StreamPull,
	type StreamOpen,
	type StreamEnd,
	type StreamAbort,
	type WsOpen,
	type WsOpened,
	type WsClose,
	type EventMsg,
	type HttpTransfer,
	type DecodedBinaryFrame,
	BinaryKind,
	BinaryFlags,
	BINARY_HEADER_SIZE,
	encodeBinaryFrame,
	decodeBinaryFrame,
	isFin,
	isText,
	parseJsonMsg,
	stringifyJsonMsg,
	nextRpcId,
	nextStreamId,
	nextWsId,
	resetIdCounters,
	DEFAULT_CHUNK_SIZE,
	HTTP_TRANSFER_THRESHOLD,
	DEFAULT_BRIDGE_PORT,
	DEFAULT_HTTP_PORT
} from './v2/wire'

// Serialization
export {
	type SerializedRequest,
	type SerializedResponse,
	type BodyRef,
	serializeRequest,
	deserializeRequest,
	serializeResponse,
	deserializeResponse,
	serializeValue,
	deserializeValue,
	serializeDOId
} from './v2/value-serialization'

// Client
export {
	type BridgeClientOptions,
	type PendingCall,
	BridgeClient,
	getClient
} from './client'

// Proxy
export {
	type EnvProxyOptions,
	type BindingHints,
	createEnvProxy,
	bridgeEnv,
	initEnv,
	setBindingHints
} from './proxy'

// Miniflare Orchestration
export {
	startMiniflare,
	startMiniflareFromConfig,
	getMiniflare,
	stopMiniflare,
	type MiniflareInstance,
	type MiniflareOptions
} from './miniflare'

// Gateway Worker (Server-side)
export { default as gateway } from './server'
