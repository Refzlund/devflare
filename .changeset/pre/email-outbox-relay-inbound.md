---
"devflare": minor
---

Close the local email loop: an outbox to assert against, a real SMTP relay, a
recipient pin, and an IMAP poller that feeds `src/email.ts`.

**Outbox.** Every message a worker dispatches through a `sendEmail` binding is
recorded and readable from `devflare/test`: `cf.email.outbox` (in dispatch
order), `cf.email.sent()` (a mutable copy), `cf.email.clearOutbox()`, and
`cf.email.onOutbound(cb)`. Each entry carries **both** representations — a
structured `message` (`from`/`to`/`cc`/`bcc`/`replyTo`/`subject`/`text`/`html`/
`headers`/attachment metadata) and the full `raw` MIME with its `size`, because
assertions about generated headers or Cloudflare's 5 MiB cap can only be made
against the document that actually travels.

**Message builder parity.** `send()` now handles the whole Workers builder
shape. An address may be a bare string, a `{ email, name }` object, or a list
mixing both, in `from`, `to`, `cc`, `bcc`, and `replyTo`; `attachments` become
`multipart/mixed` parts; the MIME is built exactly once so the recorded bytes
are the delivered bytes. A named address previously reached the wire as
`[object Object]`, and `attachments` were dropped entirely.

**`send()` returns `{ messageId }`.** The local binding previously resolved
`undefined`, contradicting its own `Promise<EmailSendResult>` type. The id it
returns is the `Message-ID` stamped on the MIME. A test asserting
`.resolves.toBeUndefined()` on a local send needs updating.

**New top-level `email` config (local only, never compiled into Wrangler
output).** `email.mode` selects what happens to a locally sent message:

- `capture` (**default**) — recorded, nothing leaves the machine.
- `relay` — recorded, then pinned and delivered over SMTP from the host process.
- `live` — Devflare stands aside; the runtime binding performs the send.

**The mode is never inferred from credentials.** A populated `email.relay.url`
or `DEVFLARE_EMAIL_RELAY_URL` is inert until something explicitly selects
`relay`, so a suite that happens to run on a machine with real mail settings
cannot start sending real mail.

**Relay + recipient pin.** `email.relay` takes an implicit-TLS SMTP URL
(`smtps://user:pass@host:465`) and a required `relay.to`. Every address in
`to`, `cc`, and `bcc` is rewritten to that one address at the binding boundary,
on the assembled MIME — so worker code that hand-rolls its own document is
pinned exactly like one that used the builder, and a developer laptop holding a
production token still cannot reach a real user. The originals are preserved as
`X-Devflare-Original-To`/`-Cc`/`-Bcc`, and every relayed message is stamped
`X-Devflare-Dev-Relay: 1` (renameable via `relay.header`). The SMTP client runs
in the host process; under `devflare dev` the composed worker posts each message
to a loopback listener on 127.0.0.1, because workerd has no raw sockets.

**Inbound poller.** `email.inbound` (opt-in, off by default) watches a real
mailbox over IMAP (`imaps://user:pass@host:993`) and posts each new message at
the same local endpoint `cf.email.send()` uses, so `src/email.ts` receives it
exactly as Email Routing would. It **skips any message carrying the relay
marker**, which is what stops a shared pin-and-poll mailbox from feeding every
locally sent message back into the worker and looping forever.

Every `email` field has an environment override:
`DEVFLARE_EMAIL_MODE`, `DEVFLARE_EMAIL_RELAY_URL`, `DEVFLARE_EMAIL_RELAY_TO`,
`DEVFLARE_EMAIL_RELAY_FROM`, `DEVFLARE_EMAIL_RELAY_HEADER`,
`DEVFLARE_EMAIL_RELAY_REJECT_UNAUTHORIZED`, `DEVFLARE_EMAIL_INBOUND`,
`DEVFLARE_EMAIL_INBOUND_URL`, `DEVFLARE_EMAIL_INBOUND_MAILBOX`,
`DEVFLARE_EMAIL_INBOUND_INTERVAL_MS`, `DEVFLARE_EMAIL_INBOUND_TO`,
`DEVFLARE_EMAIL_INBOUND_MARK_SEEN`. Only `DEVFLARE_EMAIL_MODE` changes what
happens; the rest supply settings the selected mode needs.

**Injection is closed at the shared writers.** Devflare composes headers and
SMTP commands by concatenation, so caller text that reaches a header — subject,
display name, custom header value, attachment filename, and every value the
relay writes — is stripped of CR/LF, and an envelope address carrying CR, LF,
`<` or `>` is refused before a socket is opened. Without that, a newline in a
subject forges a `Bcc:`, a newline in `cc` pushes the relay marker out of the
header block (breaking the inbound loop guard), and a newline in `from` smuggles
a second `RCPT TO` past the recipient pin.

`devflare/runtime` additionally exports `setEmailDeliverySink`,
`clearEmailDeliverySink`, `createHttpEmailDeliverySink`, `buildEmailMessage`,
and `EMAIL_MAX_MESSAGE_BYTES`. No existing export was removed or renamed, and an
existing `bindings.sendEmail` config keeps working untouched.
