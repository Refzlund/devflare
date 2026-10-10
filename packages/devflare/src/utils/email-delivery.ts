// =============================================================================
// Email delivery sink — the one seam every local `send()` funnels through
// =============================================================================
// A local `sendEmail` binding validates a message and then has to decide what
// to actually DO with it. That decision (record it, relay it over SMTP, hand it
// to a real binding) depends on host-only capabilities, but the binding itself
// runs in two very different places:
//
//   • `createTestContext()` — the binding lives in the Bun test process, so the
//     sink is installed directly and runs in-process.
//   • `devflare dev` — the binding is bundled INTO the composed worker, so the
//     sink is an HTTP shim that posts the delivery back out to the dev server.
//
// Both install through {@link setEmailDeliverySink}, so everything downstream
// of a send sees one shape regardless of which side of workerd it came from.
//
// → KEY: worker-safe. No `node:*`, no filesystem — `fetch` only.
// =============================================================================

import type { NormalizedEmailMessage } from './email-message'

/** A message that a local `sendEmail` binding accepted and is ready to hand on. */
export interface EmailDelivery {
	/** Name of the `sendEmail` binding the worker called, e.g. `MAILER`. */
	binding: string
	/** The structured view of the message. */
	message: NormalizedEmailMessage
	/** The full MIME document that would travel. */
	raw: string
	/** Byte length of {@link raw}. */
	size: number
	/** `Message-ID` stamped on the MIME; also the value `send()` returns. */
	messageId: string
}

/**
 * What happens to an accepted message.
 *
 * A sink may return an `EmailSendResult` to override the message id reported
 * back to worker code — a relay does this so the id is the one the receiving
 * MTA assigned. Returning nothing keeps the generated id.
 */
export type EmailDeliverySink = (
	delivery: EmailDelivery
) => Promise<EmailSendResult | undefined> | EmailSendResult | undefined

let deliverySink: EmailDeliverySink | null = null

/**
 * Install the process-wide delivery sink.
 *
 * Last writer wins; there is deliberately no stacking, because two sinks would
 * mean a message is recorded (or worse, relayed) twice and neither caller could
 * tell which one produced the returned id.
 *
 * @param sink - The sink to install, or `null` to remove the current one.
 */
export function setEmailDeliverySink(sink: EmailDeliverySink | null): void {
	deliverySink = sink
}

/** Remove the installed sink, restoring capture-and-drop behaviour. */
export function clearEmailDeliverySink(): void {
	deliverySink = null
}

/** The installed sink, or `null` when nothing is listening. */
export function getEmailDeliverySink(): EmailDeliverySink | null {
	return deliverySink
}

/**
 * Build a sink that posts each delivery to a Devflare dev-server endpoint.
 *
 * This is the workerd half of the bridge: the composed worker cannot open an
 * SMTP socket, so it hands the fully-built message to the host process over
 * loopback HTTP and reports back whatever the host decided.
 *
 * @param endpoint - Absolute URL of the dev server's outbound-email endpoint.
 * @returns A sink suitable for {@link setEmailDeliverySink}.
 * @throws When the host responds with a non-2xx status — a relay failure must
 *   surface in the worker that asked for the send, not be swallowed here.
 */
export function createHttpEmailDeliverySink(endpoint: string): EmailDeliverySink {
	return async (delivery) => {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(delivery)
		})

		if (!response.ok) {
			throw new Error(
				`Devflare email delivery failed (${response.status}): ${await response.text()}`
			)
		}

		const result = (await response.json()) as { messageId?: unknown }
		return typeof result?.messageId === 'string'
			? ({ messageId: result.messageId } as EmailSendResult)
			: undefined
	}
}
