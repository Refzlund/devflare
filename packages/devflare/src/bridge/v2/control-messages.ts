// =============================================================================
// Transport v2 — Auxiliary control vocabulary
// =============================================================================
// The v2 codec only owns rpc.{call,ok,err} + body.* + hello/welcome/error.
// Everything else (WS relay envelopes, HTTP transfer notifications) rides on
// the codec's `onUnknownControl` hook. This module is the single source of
// truth for those shapes. (Fire-and-forget pub/sub `event` frames use the
// `EventMsg { topic, data }` shape in `wire.ts` — the live consumer path.)
// =============================================================================

export interface TransportV2WsOpenMsg {
	t: 'ws.open'
	id: string
	binding: string
	path: string
	headers: Record<string, string>
	doId?: string
	doName?: string
}

export interface TransportV2WsOpenedMsg {
	t: 'ws.opened'
	id: string
	subprotocol?: string
}

export interface TransportV2WsOpenErrMsg {
	t: 'ws.openerr'
	id: string
	error: { message: string; code?: string }
}

export interface TransportV2WsTextMsg {
	t: 'ws.text'
	id: string
	data: string
}

export interface TransportV2WsCloseMsg {
	t: 'ws.close'
	id: string
	code?: number
	reason?: string
}

export interface TransportV2HttpTransferMsg {
	t: 'http.transfer'
	id: string
	url: string
	method: 'GET' | 'PUT'
	headers?: Record<string, string>
	bytes: number
}

export type TransportV2AuxMsg =
	| TransportV2WsOpenMsg
	| TransportV2WsOpenedMsg
	| TransportV2WsOpenErrMsg
	| TransportV2WsTextMsg
	| TransportV2WsCloseMsg
	| TransportV2HttpTransferMsg

const TRANSPORT_V2_AUX_TAGS = new Set([
	'ws.open',
	'ws.opened',
	'ws.openerr',
	'ws.text',
	'ws.close',
	'http.transfer'
])

export function isTransportV2AuxMsg(value: unknown): value is TransportV2AuxMsg {
	if (!value || typeof value !== 'object') return false
	const tag = (value as { t?: unknown }).t
	return typeof tag === 'string' && TRANSPORT_V2_AUX_TAGS.has(tag)
}

export function parseTransportV2AuxMsg(text: string): TransportV2AuxMsg | null {
	try {
		const parsed = JSON.parse(text) as unknown
		return isTransportV2AuxMsg(parsed) ? parsed : null
	} catch {
		return null
	}
}

export function stringifyTransportV2AuxMsg(msg: TransportV2AuxMsg): string {
	return JSON.stringify(msg)
}
