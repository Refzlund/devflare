// =============================================================================
// Local email behaviour — mode, SMTP relay, IMAP inbound
// =============================================================================
// Development-only configuration: none of it is emitted to Wrangler output, the
// same way `server` is dev-only. It answers one question — what should happen to
// a message a worker sends, and where should inbound mail come from — for the
// local runtime only.
//
// → GOTCHA: `mode` is the ONLY thing that decides whether mail leaves the
//   machine, and it is never inferred. Populating `relay.url` (or the matching
//   env var) on a machine that also runs a test suite must not turn that suite
//   into a mail sender, so a relay URL without `mode: 'relay'` is inert.
// =============================================================================

import { z } from 'zod'

/**
 * What Devflare does with a message a worker hands to a `sendEmail` binding.
 *
 * - `capture` — record it and stop. Nothing leaves the machine. The default.
 * - `relay` — record it, rewrite every recipient to `relay.to`, and deliver it
 *   over SMTP from the host process.
 * - `live` — stand aside. The runtime's own binding performs the send, which
 *   means real Cloudflare delivery when the binding is `remote: true`.
 */
export const emailModeSchema = z.enum(['capture', 'relay', 'live'])

export const emailRelayConfigSchema = z
	.object({
		/**
		 * SMTP endpoint as a URL, e.g. `smtps://user:pass@smtp.example.com:465`.
		 * Only implicit TLS (`smtps:`) is supported — port 465, TLS from the first
		 * byte, no STARTTLS upgrade dance.
		 */
		url: z.string().min(1),
		/**
		 * The single address every relayed message is delivered to.
		 *
		 * Required, because the whole point of relay mode is that a developer
		 * laptop holding a production token still cannot reach a real user.
		 */
		to: z.string().min(1),
		/** Envelope sender used for the SMTP transaction, when it must differ from the message's own `from`. */
		from: z.string().min(1).optional(),
		/**
		 * Header stamped on every relayed message so the inbound poller can
		 * recognise Devflare's own mail and refuse to feed it back in.
		 *
		 * @default 'X-Devflare-Dev-Relay'
		 */
		header: z.string().min(1).optional(),
		/**
		 * Verify the SMTP server's certificate chain.
		 *
		 * @default true
		 */
		rejectUnauthorized: z.boolean().optional()
	})
	.strict()

export const emailInboundConfigSchema = z
	.object({
		/**
		 * Poll the mailbox. Off unless explicitly enabled — an inbound poller
		 * reads (and by default marks) real mail, so it never starts by accident.
		 *
		 * @default false
		 */
		enabled: z.boolean().optional(),
		/** IMAP endpoint as a URL, e.g. `imaps://user:pass@imap.example.com:993`. Implicit TLS only. */
		url: z.string().min(1),
		/** Mailbox to watch. @default 'INBOX' */
		mailbox: z.string().min(1).optional(),
		/** Milliseconds between polls. @default 15000 */
		intervalMs: z.number().int().min(1000).optional(),
		/**
		 * Recipient reported to the worker as `message.to`.
		 *
		 * Email Routing delivers to the routed address, which is rarely the
		 * mailbox being polled; set this when the worker branches on it.
		 */
		to: z.string().min(1).optional(),
		/**
		 * Mark a message `\Seen` once it has been handed to the worker.
		 *
		 * @default true
		 */
		markSeen: z.boolean().optional()
	})
	.strict()

/**
 * Local email behaviour for `devflare dev` and `createTestContext()`.
 *
 * Validated eagerly: `mode: 'relay'` without a `relay` block is a config error
 * rather than a silent downgrade to capture, because a developer who asked for
 * relay and got silence would reasonably conclude the mail was sent.
 */
export const emailConfigSchema = z
	.object({
		/** @default 'capture' */
		mode: emailModeSchema.optional(),
		/** SMTP relay settings. Required when `mode` is `'relay'`. */
		relay: emailRelayConfigSchema.optional(),
		/** IMAP inbound-poller settings. */
		inbound: emailInboundConfigSchema.optional()
	})
	.strict()
	.superRefine((email, ctx) => {
		if (email.mode === 'relay' && !email.relay) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['relay'],
				message:
					"email.mode 'relay' requires an email.relay block (url + to), or set DEVFLARE_EMAIL_RELAY_URL and DEVFLARE_EMAIL_RELAY_TO"
			})
		}

		if (email.inbound?.enabled && !email.inbound.url) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['inbound', 'url'],
				message: 'email.inbound.enabled requires email.inbound.url'
			})
		}
	})
	.optional()

export type EmailMode = z.infer<typeof emailModeSchema>
export type EmailRelayConfig = z.infer<typeof emailRelayConfigSchema>
export type EmailInboundConfig = z.infer<typeof emailInboundConfigSchema>
export type EmailConfig = z.infer<typeof emailConfigSchema>
