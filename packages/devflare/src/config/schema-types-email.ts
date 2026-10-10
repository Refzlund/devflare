// =============================================================================
// Authoring input types — local email behaviour
// =============================================================================
// Hand-written mirror of `schema-email.ts`, kept beside the other authoring
// types so `defineConfig()` shows documentation and completions for the `email`
// namespace. Re-exported from `schema-types-runtime.ts` for import stability.
// =============================================================================

/**
 * What Devflare does with a message a worker sends locally.
 *
 * - `'capture'` — record it; nothing leaves the machine. **Default.**
 * - `'relay'` — record it, rewrite every recipient to `relay.to`, then deliver
 *   over SMTP from the host process.
 * - `'live'` — stand aside; the runtime's own binding performs the send.
 */
export type EmailModeInput = 'capture' | 'relay' | 'live'

/** SMTP relay settings used by `mode: 'relay'`. */
export interface EmailRelayConfigInput {
	/**
	 * SMTP endpoint as a URL. Implicit TLS only (port 465).
	 *
	 * @example
	 * ```ts
	 * url: 'smtps://apikey:secret@smtp.example.com:465'
	 * ```
	 */
	url: string

	/**
	 * The single address every relayed message is delivered to.
	 *
	 * Every entry in `to`, `cc`, and `bcc` is rewritten to this address at the
	 * binding boundary, before transport, so worker code cannot address a real
	 * recipient however it is written.
	 *
	 * @example
	 * ```ts
	 * to: 'dev-inbox@example.com'
	 * ```
	 */
	to: string

	/**
	 * Envelope sender for the SMTP transaction.
	 *
	 * @default The message's own `from`.
	 *
	 * @example
	 * ```ts
	 * from: 'dev-relay@example.com'
	 * ```
	 */
	from?: string

	/**
	 * Marker header stamped on every relayed message, and skipped by the
	 * inbound poller so relayed mail is never fed back into the worker.
	 *
	 * @default `'X-Devflare-Dev-Relay'`
	 *
	 * @example
	 * ```ts
	 * header: 'X-Uidini-Dev-Relay'
	 * ```
	 */
	header?: string

	/**
	 * Verify the SMTP server's certificate chain.
	 *
	 * @default `true`
	 *
	 * @example
	 * ```ts
	 * rejectUnauthorized: false
	 * ```
	 */
	rejectUnauthorized?: boolean
}

/** IMAP poller settings that feed a real mailbox into `src/email.ts`. */
export interface EmailInboundConfigInput {
	/**
	 * Start the poller. Off unless set — it reads (and by default marks) real
	 * mail, so it never starts implicitly.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * enabled: true
	 * ```
	 */
	enabled?: boolean

	/**
	 * IMAP endpoint as a URL. Implicit TLS only (port 993).
	 *
	 * @example
	 * ```ts
	 * url: 'imaps://dev@example.com:app-password@imap.example.com:993'
	 * ```
	 */
	url: string

	/**
	 * Mailbox to watch.
	 *
	 * @default `'INBOX'`
	 *
	 * @example
	 * ```ts
	 * mailbox: 'INBOX/support'
	 * ```
	 */
	mailbox?: string

	/**
	 * Milliseconds between polls.
	 *
	 * @default `15000`
	 *
	 * @example
	 * ```ts
	 * intervalMs: 5000
	 * ```
	 */
	intervalMs?: number

	/**
	 * Recipient reported to the worker as `message.to`.
	 *
	 * @default The polled mailbox's own address.
	 *
	 * @example
	 * ```ts
	 * to: 'support@example.com'
	 * ```
	 */
	to?: string

	/**
	 * Mark a message `\Seen` once the worker has handled it.
	 *
	 * @default `true`
	 *
	 * @example
	 * ```ts
	 * markSeen: false
	 * ```
	 */
	markSeen?: boolean
}

/**
 * Local email behaviour for `devflare dev` and `createTestContext()`.
 *
 * Development-only: nothing here reaches compiled Wrangler output.
 */
export interface EmailConfigInput {
	/**
	 * What happens to a message a worker sends.
	 *
	 * Never inferred from credentials — a populated `relay.url` on a machine
	 * running a test suite leaves that suite in `capture`.
	 *
	 * @default `'capture'`
	 *
	 * @example
	 * ```ts
	 * email: { mode: 'relay' }
	 * ```
	 */
	mode?: EmailModeInput

	/**
	 * SMTP relay settings. Required when `mode` is `'relay'`.
	 *
	 * @example
	 * ```ts
	 * relay: { url: 'smtps://user:pass@smtp.example.com:465', to: 'dev@example.com' }
	 * ```
	 */
	relay?: EmailRelayConfigInput

	/**
	 * IMAP inbound poller settings.
	 *
	 * @example
	 * ```ts
	 * inbound: { enabled: true, url: 'imaps://user:pass@imap.example.com:993' }
	 * ```
	 */
	inbound?: EmailInboundConfigInput
}
