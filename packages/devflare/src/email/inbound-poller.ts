// =============================================================================
// Inbound poller — an IMAP mailbox standing in for Email Routing
// =============================================================================
// Opt-in, host-process only. Each pass reads unseen mail, drops anything the
// relay sent (see `./inbound`), and posts the rest at the local runtime's
// inbound-email endpoint.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import { type ImapSocketFactory, fetchImapMessages, parseImapUrl } from './imap-client'
import {
	postInboundEmail,
	readEnvelopeRecipient,
	readEnvelopeSender,
	shouldSkipInboundMessage
} from './inbound'
import type { ResolvedEmailInbound } from './runtime-config'

/**
 * How many already-handled UIDs the poller remembers.
 *
 * Only consulted with `markSeen: false`, where the server keeps offering the
 * same messages. Far above any realistic unread backlog.
 */
const HANDLED_UID_CAPACITY = 5000

/** What one poll pass did. */
export interface InboundPollResult {
	/** Messages the mailbox returned. */
	fetched: number
	/** Messages skipped because they carried the relay marker. */
	skipped: number
	/** Messages handed to the worker's `email` handler. */
	delivered: number
}

/** A running poller. */
export interface InboundEmailPoller {
	/** Run one pass immediately, outside the interval. Useful in a test. */
	poll(): Promise<InboundPollResult>
	/** Stop polling. Safe to call more than once. */
	stop(): Promise<void>
}

/** How to reach the mailbox and where to deliver what it holds. */
export interface StartInboundEmailPollerOptions {
	/** Resolved poller settings. */
	inbound: ResolvedEmailInbound
	/** Origin of the local runtime, e.g. `http://127.0.0.1:8787`. */
	runtimeOrigin: string
	/** Verify the IMAP server's certificate chain. @default true */
	rejectUnauthorized?: boolean
	/**
	 * Socket factory. Defaults to implicit TLS; overridden only by Devflare's
	 * own protocol tests, which run against a local fake server.
	 */
	connect?: ImapSocketFactory
	/** Where poll activity is reported. */
	logger?: ConsolaInstance
}

/**
 * Run one poll pass.
 *
 * @param options - The same options the poller was started with.
 * @param handled - UIDs already delivered, so a mailbox left unmarked
 *   (`markSeen: false`) does not replay its contents on every pass.
 * @returns What the pass did.
 * @throws On IMAP failure. The caller decides whether one bad pass should stop
 *   the poller — a message that silently failed to arrive is the whole problem
 *   the poller exists to avoid.
 */
export async function runInboundPoll(
	options: StartInboundEmailPollerOptions,
	handled: Set<number>
): Promise<InboundPollResult> {
	const endpoint = parseImapUrl(options.inbound.url, options.rejectUnauthorized ?? true)

	const messages = await fetchImapMessages(
		endpoint,
		{
			mailbox: options.inbound.mailbox,
			search: 'UNSEEN',
			markSeen: options.inbound.markSeen,
			skipUids: handled
		},
		options.connect
	)

	const result: InboundPollResult = { fetched: messages.length, skipped: 0, delivered: 0 }

	for (const message of messages) {
		handled.add(message.uid)
		// Only relevant with `markSeen: false`, where the mailbox keeps returning
		// the same UIDs. Bounded so a long-lived dev server on a busy mailbox does
		// not grow the set for the life of the process; UIDs ascend, so dropping
		// the lowest drops the oldest.
		if (handled.size > HANDLED_UID_CAPACITY) {
			const oldest = [...handled]
				.sort((a, b) => a - b)
				.slice(0, handled.size - HANDLED_UID_CAPACITY)
			for (const uid of oldest) {
				handled.delete(uid)
			}
		}

		if (shouldSkipInboundMessage(message.raw, options.inbound.skipHeaders)) {
			result.skipped += 1
			options.logger?.debug(
				`[devflare:email] skipped relayed message uid=${message.uid} (carries ${options.inbound.skipHeaders.join(' or ')})`
			)
			continue
		}

		const from = readEnvelopeSender(message.raw)
		const to = options.inbound.to ?? readEnvelopeRecipient(message.raw) ?? endpoint.username

		const response = await postInboundEmail(options.runtimeOrigin, { from, to, raw: message.raw })
		if (!response.ok) {
			throw new Error(
				`Devflare could not deliver inbound email uid=${message.uid} to ${options.runtimeOrigin}: ${response.status} ${await response.text()}`
			)
		}

		result.delivered += 1
		options.logger?.info(`[devflare:email] inbound ${from} → ${to} (uid=${message.uid})`)
	}

	return result
}

/**
 * Start polling a mailbox into the local worker's `email` handler.
 *
 * The first pass runs immediately so a message already sitting in the mailbox
 * does not wait out a full interval.
 *
 * @param options - Mailbox settings, runtime origin, and logger.
 * @returns Handles to poll on demand and to stop.
 */
export function startInboundEmailPoller(
	options: StartInboundEmailPollerOptions
): InboundEmailPoller {
	const handled = new Set<number>()
	let stopped = false
	let inFlight: Promise<unknown> = Promise.resolve()
	let timer: ReturnType<typeof setTimeout> | null = null

	const poll = (): Promise<InboundPollResult> => runInboundPoll(options, handled)

	// A transient IMAP failure is reported and retried on the next tick rather
	// than killing the dev server — but it is ALWAYS reported. `logger` is
	// optional on the programmatic API, so console is the floor: a poller that
	// silently stops delivering mail is indistinguishable from an empty mailbox.
	const report = (error: unknown): void => {
		if (options.logger) {
			options.logger.error('[devflare:email] inbound poll failed', error)
			return
		}
		console.error('[devflare:email] inbound poll failed', error)
	}

	const schedule = (): void => {
		if (stopped) {
			return
		}

		timer = setTimeout(() => {
			// One pass at a time: a slow mailbox must not stack overlapping
			// sessions that would each deliver the same message.
			inFlight = poll().catch(report).finally(schedule)
		}, options.inbound.intervalMs)
	}

	inFlight = poll().catch(report).finally(schedule)

	return {
		poll,
		async stop(): Promise<void> {
			stopped = true
			if (timer) {
				clearTimeout(timer)
				timer = null
			}
			await inFlight
		}
	}
}
