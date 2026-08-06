// =============================================================================
// Relay — pin every recipient, stamp the marker, then transmit
// =============================================================================
// This is a SAFETY mechanism first and a convenience second. A developer laptop
// running against a production sending token, with a loop bug in a notification
// path, must not be able to mail a real user. So the pin is applied here — at
// the binding boundary, on the assembled document, after worker code has had
// its last say — and not as a check worker code could route around.
//
// The marker header exists for the other half of the loop: `email.inbound`
// polls a mailbox that is very often the pin target, and a relayed message read
// back in would re-enter the worker, auto-reply, relay again, forever.
// =============================================================================

import type { EmailDelivery } from '../utils/email-delivery'
import { rewriteHeaders } from './mime-headers'
import type { ResolvedEmailRelay } from './runtime-config'
import { RELAY_HEADER_VALUE } from './runtime-config'
import { type SmtpSocketFactory, parseSmtpUrl, sendSmtpMessage } from './smtp'

/** A delivery rewritten for relay: pinned recipients, marked document. */
export interface PinnedDelivery {
	/** The MIME document as it will travel. */
	raw: string
	/** Envelope sender for the SMTP transaction. */
	from: string
	/** Envelope recipients — always exactly the pinned address. */
	to: string[]
}

/**
 * Rewrite a delivery so it can only reach the pinned address.
 *
 * Every `to`, `cc`, and `bcc` — in the envelope AND in the document's own
 * headers — collapses to `relay.to`. The originals are preserved as
 * `X-Devflare-Original-*` headers so the pinned inbox still shows who the
 * message was meant for.
 *
 * @param delivery - The accepted message.
 * @param relay - Resolved relay settings, including the pinned address.
 * @returns The document and envelope to hand to SMTP.
 */
export function applyRecipientPin(
	delivery: EmailDelivery,
	relay: ResolvedEmailRelay
): PinnedDelivery {
	const original = delivery.message

	const raw = rewriteHeaders(delivery.raw, {
		To: relay.to,
		Cc: null,
		Bcc: null,
		[relay.header]: RELAY_HEADER_VALUE,
		'X-Devflare-Original-To': original.toHeader || original.to.join(', '),
		...(original.cc.length > 0 ? { 'X-Devflare-Original-Cc': original.cc.join(', ') } : {}),
		...(original.bcc.length > 0 ? { 'X-Devflare-Original-Bcc': original.bcc.join(', ') } : {}),
		'X-Devflare-Binding': delivery.binding || 'sendEmail'
	})

	return {
		raw,
		from: relay.from ?? original.from,
		to: [relay.to]
	}
}

/**
 * Pin a message and deliver it over SMTP.
 *
 * @param delivery - The accepted message.
 * @param relay - Resolved relay settings.
 * @param connect - Socket factory. Defaults to implicit TLS; overridden only by
 *   Devflare's own tests, so the pin can be proven against a server that
 *   records what it was actually asked to deliver rather than in isolation.
 * @returns The recipients the server accepted — always the pinned address, and
 *   recorded on the outbox entry so a test can prove the pin held.
 * @throws When the SMTP transaction fails at any step.
 */
export async function relayDelivery(
	delivery: EmailDelivery,
	relay: ResolvedEmailRelay,
	connect?: SmtpSocketFactory
): Promise<{ deliveredTo: string[] }> {
	const pinned = applyRecipientPin(delivery, relay)
	const endpoint = parseSmtpUrl(relay.url, relay.rejectUnauthorized)

	const result = await sendSmtpMessage(
		endpoint,
		{
			from: pinned.from,
			to: pinned.to,
			raw: pinned.raw
		},
		connect
	)

	return { deliveredTo: result.accepted }
}
