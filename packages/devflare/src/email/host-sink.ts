// =============================================================================
// Host delivery sink — record, then act on the mode
// =============================================================================
// The host end of the delivery seam. Whatever produced the message — a binding
// living in this process (`createTestContext()`), or the composed worker
// posting over loopback (`devflare dev`) — it arrives here, gets recorded, and
// then the mode decides whether anything transmits.
// =============================================================================

import type { EmailDelivery, EmailDeliverySink } from '../utils/email-delivery'
import { recordOutboxEntry } from './outbox'
import { relayDelivery } from './relay'
import type { ResolvedEmailRuntime } from './runtime-config'
import type { SmtpSocketFactory } from './smtp'

/**
 * Handle one accepted message according to the resolved mode.
 *
 * The outbox entry is filled in BEFORE it is published, so a subscriber sees
 * the settled outcome — `relayed` and `deliveredTo` included — rather than a
 * snapshot taken before transport. A relay failure still leaves the message
 * recorded, because a send you cannot see is indistinguishable from one that
 * never happened.
 *
 * @param delivery - The accepted message, already composed.
 * @param runtime - The resolved email runtime for this run.
 * @param connect - Socket factory for the relay. Devflare's own tests only.
 * @returns The message id to report back to worker code.
 * @throws Whatever the relay throws. A failed relay surfaces in the worker that
 *   asked for the send.
 */
export async function handleHostDelivery(
	delivery: EmailDelivery,
	runtime: ResolvedEmailRuntime,
	connect?: SmtpSocketFactory
): Promise<EmailSendResult> {
	const record = {
		binding: delivery.binding,
		message: delivery.message,
		raw: delivery.raw,
		size: delivery.size,
		messageId: delivery.messageId,
		mode: runtime.mode,
		relayed: false,
		deliveredTo: [] as string[],
		timestamp: new Date()
	}

	try {
		if (runtime.mode === 'relay' && runtime.relay) {
			const { deliveredTo } = await relayDelivery(delivery, runtime.relay, connect)
			record.relayed = true
			record.deliveredTo = deliveredTo
		}
	} finally {
		// Recorded whatever happened: the message a relay rejected is exactly the
		// one a developer needs to look at.
		recordOutboxEntry(record)
	}

	return { messageId: delivery.messageId }
}

/**
 * Build the sink to install with `setEmailDeliverySink()`.
 *
 * @param getRuntime - Read lazily so a config reload during `devflare dev`
 *   changes behaviour without re-installing the sink.
 * @param connect - Socket factory for the relay. Devflare's own tests only.
 * @returns A sink that records every message and relays when the mode says to.
 */
export function createHostEmailDeliverySink(
	getRuntime: () => ResolvedEmailRuntime,
	connect?: SmtpSocketFactory
): EmailDeliverySink {
	return (delivery: EmailDelivery) => handleHostDelivery(delivery, getRuntime(), connect)
}
