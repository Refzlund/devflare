// =============================================================================
// Inbound email — feed a real mailbox into `src/email.ts`
// =============================================================================
// Cloudflare Email Routing delivers an inbound message to a Worker's `email`
// handler. Locally there is no MX record pointing at your laptop, so the poller
// stands in for one: it reads a mailbox over IMAP and hands each new message to
// the same local endpoint `cf.email.send()` uses, unchanged.
//
// → GOTCHA: it MUST refuse anything the relay sent. Relay mode pins every
//   outbound message to one inbox, and that inbox is usually the one being
//   polled — so without the marker check a locally-sent message is re-ingested,
//   a support-ticket flow auto-replies to it, and the loop never terminates.
// =============================================================================

import { hasHeader, readHeader } from './mime-headers'

/** The path Devflare's local runtimes expose for an inbound message. */
export const INBOUND_EMAIL_PATH = '/cdn-cgi/handler/email'

/** One message to hand to the worker's `email` handler. */
export interface InboundEmailMessage {
	/** Envelope sender. */
	from: string
	/** Envelope recipient — what the handler sees as `message.to`. */
	to: string
	/** The complete MIME document. */
	raw: string
}

/**
 * Should this message be kept out of the worker?
 *
 * @param raw - The MIME document as read from the mailbox.
 * @param skipHeaders - Header names that mark a message as Devflare's own.
 * @returns `true` when the message carries any of those headers.
 */
export function shouldSkipInboundMessage(raw: string, skipHeaders: readonly string[]): boolean {
	return skipHeaders.some((header) => hasHeader(raw, header))
}

/**
 * Post a raw message to a local runtime's inbound-email endpoint.
 *
 * This is the path `cf.email.send()` falls back to when no test context has
 * wired a handler directly, and the only one available from another process —
 * which is why the poller uses it rather than importing the handler itself.
 *
 * @param origin - Origin of the local runtime, e.g. `http://localhost:8787`.
 * @param message - Envelope and document to deliver.
 * @returns The runtime's response, for the caller to inspect or assert on.
 */
export async function postInboundEmail(
	origin: string,
	message: InboundEmailMessage
): Promise<Response> {
	const url = new URL(INBOUND_EMAIL_PATH, origin)
	url.searchParams.set('from', message.from)
	url.searchParams.set('to', message.to)

	return fetch(url.toString(), {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain' },
		body: message.raw
	})
}

/**
 * Read the envelope sender out of a document, for the poller's `from`.
 *
 * @param raw - The MIME document.
 * @returns The bare address from `From:`, or a placeholder when there is none —
 *   Email Routing always supplies one, so a missing header means a malformed
 *   message rather than an anonymous sender.
 */
export function readEnvelopeSender(raw: string): string {
	const value = readAddressHeader(raw, 'From')
	return value ?? 'unknown@example.com'
}

/**
 * Read the envelope recipient out of a document, for the poller's `to`.
 *
 * @param raw - The MIME document.
 * @returns The bare address from `Delivered-To`, then `To:`, or `undefined`.
 *   `Delivered-To` is checked first because it survives a forwarded message
 *   whose `To:` still names the original recipient.
 */
export function readEnvelopeRecipient(raw: string): string | undefined {
	return readAddressHeader(raw, 'Delivered-To') ?? readAddressHeader(raw, 'To')
}

function readAddressHeader(raw: string, name: string): string | undefined {
	const value = readHeader(raw, name)
	if (!value) {
		return undefined
	}

	const first = value.split(',')[0]?.trim() ?? ''
	const angled = first.match(/<([^>]*)>/)
	const address = (angled ? angled[1] : first).trim()
	return address || undefined
}
