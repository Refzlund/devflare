// =============================================================================
// Outbox — what the local runtime actually sent
// =============================================================================
// Cloudflare's Email Sending has no read-back API, so the only honest record of
// an outbound message is the one the local runtime keeps as it dispatches. Each
// entry carries BOTH representations on purpose: the structured message is what
// a test asserts against, and the raw MIME is the only place total size and
// generated headers can be measured.
// =============================================================================

import type { EmailMode } from '../config/schema-email'
import type { NormalizedEmailMessage } from '../utils/email-message'

/** One message the local runtime accepted, as it left the binding. */
export interface SentEmailRecord {
	/** Name of the `sendEmail` binding the worker called, e.g. `MAILER`. */
	binding: string
	/** Structured view of the message — addresses, subject, bodies, headers. */
	message: NormalizedEmailMessage
	/**
	 * The full MIME document.
	 *
	 * Assertions about headers or total message size have to be made here:
	 * the structured view intentionally omits attachment bytes.
	 */
	raw: string
	/** Byte length of {@link raw}. Compare against `EMAIL_MAX_MESSAGE_BYTES` (5 MiB). */
	size: number
	/** `Message-ID` on the MIME, and the id `send()` returned to worker code. */
	messageId: string
	/** The mode in force when the message was dispatched. */
	mode: EmailMode
	/** Whether the message was actually handed to an SMTP server. */
	relayed: boolean
	/**
	 * Recipients the relay delivered to, after the pin rewrote them.
	 *
	 * Empty in `capture` mode. In `relay` mode this is the pinned address, and
	 * comparing it against `message.to` is how a test proves the pin held.
	 */
	deliveredTo: string[]
	/** When the message was accepted. */
	timestamp: Date
}

/** Notified for each newly recorded message. */
export type OutboxListener = (record: SentEmailRecord) => void

/**
 * How many messages the outbox keeps.
 *
 * Each entry holds a full MIME document, which Cloudflare allows to be 5 MiB.
 * A dev server left running for days — or one send loop gone wrong, which is
 * exactly what the relay pin exists to survive — would otherwise grow without
 * limit. Well above anything a test suite asserts on.
 */
export const OUTBOX_CAPACITY = 1000

let records: SentEmailRecord[] = []
let listeners: OutboxListener[] = []

/**
 * Record a dispatched message and notify listeners.
 *
 * @param record - The entry to append. The oldest entry is dropped once
 *   {@link OUTBOX_CAPACITY} is reached.
 * @throws Whatever a listener throws — a broken assertion inside a subscriber
 *   is a test failure, not something to log and continue past.
 */
export function recordOutboxEntry(record: SentEmailRecord): void {
	records.push(record)
	if (records.length > OUTBOX_CAPACITY) {
		records.splice(0, records.length - OUTBOX_CAPACITY)
	}

	for (const listener of [...listeners]) {
		listener(record)
	}
}

/** Every recorded message, in dispatch order. */
export function getOutbox(): readonly SentEmailRecord[] {
	return records
}

/** A mutable copy of the outbox, safe to sort or splice. */
export function getSentMessages(): SentEmailRecord[] {
	return [...records]
}

/** Drop every recorded message. Listeners stay subscribed. */
export function clearOutbox(): void {
	records = []
}

/**
 * Subscribe to newly dispatched messages.
 *
 * @param listener - Called synchronously as each message is recorded.
 * @returns Unsubscribe function.
 */
export function onOutboxEntry(listener: OutboxListener): () => void {
	listeners.push(listener)
	return () => {
		listeners = listeners.filter((candidate) => candidate !== listener)
	}
}

/** Drop records and listeners. Called when a test context is disposed. */
export function resetOutbox(): void {
	records = []
	listeners = []
}
