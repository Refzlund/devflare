// =============================================================================
// Transport — SvelteKit signature
// =============================================================================
// This file ONLY contains the transport object with encode/decode definitions.
// Classes are imported from ./models/ and this works "under the hood" via
// the `transport` config option in devflare.config.ts.
// =============================================================================

import {
	ChatMessage,
	UserPresence,
	PdfRequest,
	PdfResult,
	type ChatMessageData,
	type UserPresenceData,
	type PdfRequestData,
	type PdfResultData
} from './lib/models'

export const transport = {
	ChatMessage: {
		encode: (v: unknown): ChatMessageData | false =>
			v instanceof ChatMessage && {
				id: v.id,
				userId: v.userId,
				username: v.username,
				content: v.content,
				timestamp: v.timestamp,
				roomId: v.roomId
			},
		decode: (v: ChatMessageData) => new ChatMessage(v)
	},
	UserPresence: {
		encode: (v: unknown): UserPresenceData | false =>
			v instanceof UserPresence && {
				id: v.id,
				username: v.username,
				status: v.status,
				lastSeen: v.lastSeen
			},
		decode: (v: UserPresenceData) => new UserPresence(v)
	},
	PdfRequest: {
		encode: (v: unknown): PdfRequestData | false =>
			v instanceof PdfRequest && {
				id: v.id,
				url: v.url,
				options: v.options,
				createdAt: v.createdAt
			},
		decode: (v: PdfRequestData) => new PdfRequest(v)
	},
	PdfResult: {
		encode: (v: unknown): PdfResultData | false =>
			v instanceof PdfResult && {
				requestId: v.requestId,
				success: v.success,
				pdfBase64: v.pdfBase64,
				error: v.error,
				generatedAt: v.generatedAt,
				durationMs: v.durationMs
			},
		decode: (v: PdfResultData) => new PdfResult(v)
	}
}
