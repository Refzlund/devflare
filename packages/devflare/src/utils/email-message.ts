// =============================================================================
// Email message normalization — builder shape → structured message + raw MIME
// =============================================================================
// Cloudflare's `sendEmail` binding accepts two message shapes: the legacy
// raw-MIME `EmailMessage` from `cloudflare:email`, and the higher-level
// "message builder" object (`{ to, from, subject, html, text, cc, bcc,
// replyTo, headers, attachments }`). This module turns the builder shape into
// the two representations every Devflare email path needs:
//
//   • a NormalizedEmailMessage — structured, cheap to assert on in a test
//   • a raw RFC 5322 MIME string — what actually travels, and the only place
//     total message size and generated headers can be measured
//
// → KEY: worker-safe. Runs inside workerd as part of the composed worker, so
//   nothing here may import `node:*` or touch the filesystem.
// =============================================================================

/** An address as `send()` accepts it: bare string, named object, or a list of either. */
export type EmailAddressInput = string | EmailAddress | Array<string | EmailAddress>

/**
 * A message in the higher-level builder shape Cloudflare's binding accepts.
 *
 * Every field is optional here (rather than mirroring Cloudflare's stricter
 * types) because this shape is also used to describe messages arriving from
 * untyped callers — validation happens where the message is dispatched, not
 * where it is described.
 */
export interface ComposedEmailMessage {
	/** Envelope sender. Cloudflare requires a verified sending domain. */
	from: EmailAddressInput
	/** Envelope recipients. Cloudflare accepts at most 50. */
	to: EmailAddressInput
	/** `Subject:` header. */
	subject?: string
	/** Address a reply should be directed to, when it differs from `from`. */
	replyTo?: EmailAddressInput
	/** Carbon-copy recipients — visible to every other recipient. */
	cc?: EmailAddressInput
	/** Blind-carbon-copy recipients — stripped from the delivered headers by real MTAs. */
	bcc?: EmailAddressInput
	/** Extra headers merged verbatim into the generated MIME. */
	headers?: Record<string, string>
	/** Plain-text alternative body. */
	text?: string
	/** HTML body. Paired with `text` it becomes a `multipart/alternative`. */
	html?: string
	/** File attachments. Their presence promotes the message to `multipart/mixed`. */
	attachments?: EmailAttachment[]
	/** Pre-built MIME, when the caller composed the message itself. */
	raw?: unknown
}

/**
 * What an attachment contributes to an outbox record.
 *
 * The bytes themselves are deliberately absent: they already live (base64
 * encoded) in the raw MIME, and duplicating a multi-megabyte payload into an
 * in-memory outbox is how a test suite runs out of heap.
 */
export interface EmailAttachmentSummary {
	/** Filename offered to the recipient's mail client. */
	filename: string
	/** MIME type declared for the part (`EmailAttachment.type`). */
	type: string
	/** `inline` parts are referenced from the HTML body by `contentId`. */
	disposition: 'inline' | 'attachment'
	/** `Content-ID` for an inline part, so HTML can reference it via `cid:`. */
	contentId?: string
	/** Decoded byte length of the attachment content. */
	size: number
}

/**
 * A builder message resolved to the exact values that reach the wire.
 *
 * Addresses appear twice on purpose: the bare form (`from`, `to`, …) is what
 * the envelope and every allow-list check use, while the `*Header` form keeps
 * the display name so a test can assert what the recipient will actually see.
 */
export interface NormalizedEmailMessage {
	/** Envelope sender — bare address, matching Cloudflare's `EmailMessage.from`. */
	from: string
	/** `From:` header value, including a display name when one was supplied. */
	fromHeader: string
	/** Envelope recipients — bare addresses, flattened from every accepted form. */
	to: string[]
	/** `To:` header value as written into the MIME. */
	toHeader: string
	/** Carbon-copy recipients — bare addresses. */
	cc: string[]
	/** Blind-carbon-copy recipients — bare addresses. */
	bcc: string[]
	/** Reply-to address — bare address, when one was supplied. */
	replyTo?: string
	/** `Subject:` header, absent when the caller sent none. */
	subject?: string
	/** Plain-text body. */
	text?: string
	/** HTML body. */
	html?: string
	/** Caller-supplied headers, verbatim. Generated headers are not included. */
	headers: Record<string, string>
	/** Attachment metadata — see {@link EmailAttachmentSummary} for why bytes are excluded. */
	attachments: EmailAttachmentSummary[]
	/** `Message-ID` stamped on the MIME and returned as `EmailSendResult.messageId`. */
	messageId: string
}

/** A normalized message paired with the MIME document generated from it. */
export interface BuiltEmailMessage {
	/** The structured view — cheap to assert on. */
	message: NormalizedEmailMessage
	/** The full RFC 5322 document, CRLF-delimited. */
	raw: string
	/** Byte length of {@link raw}, for comparison against {@link EMAIL_MAX_MESSAGE_BYTES}. */
	size: number
}

/**
 * Cloudflare's hard cap on a single outbound message, attachments included.
 *
 * Devflare does not enforce it — a local send that Cloudflare would reject
 * should still be inspectable — but it records `size` on every outbox entry so
 * a test can assert the budget before production does it for you.
 */
export const EMAIL_MAX_MESSAGE_BYTES = 5 * 1024 * 1024

/** Property key the runtime uses to carry pre-built MIME on a binding message. */
export const RAW_EMAIL_KEY = 'EmailMessage::raw'

// -----------------------------------------------------------------------------
// Address handling
// -----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isEmailAddressObject(value: unknown): value is EmailAddress {
	return isRecord(value) && typeof value.email === 'string'
}

/**
 * Strip anything that could end a header field early.
 *
 * A CR or LF inside a subject, a display name, or a custom header value is
 * header injection: `Subject: hi\r\nBcc: someone@else` forges a recipient, and
 * a bare `\r\n\r\n` ends the header block and pushes the rest into the body.
 * Devflare composes headers by string concatenation, so this has to happen
 * wherever caller-supplied text reaches a header.
 *
 * @param value - Caller-supplied text destined for a header field.
 * @returns The text with CR/LF collapsed to a single space.
 */
export function sanitizeHeaderValue(value: string): string {
	return value.replace(/[\r\n]+/g, ' ')
}

/**
 * Quote a display name so a comma or quote in it cannot split the header.
 *
 * @param name - Raw display name as the caller wrote it.
 * @returns The name wrapped in an RFC 5322 quoted-string.
 */
function quoteDisplayName(name: string): string {
	return `"${sanitizeHeaderValue(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Render one address in its header form (`"Name" <a@b.com>` or `a@b.com`).
 *
 * @param value - A bare address or a `{ email, name }` object.
 * @returns The address as it should appear in a header field.
 */
function formatAddress(value: string | EmailAddress): string {
	if (typeof value === 'string') {
		return sanitizeHeaderValue(value)
	}

	const name = typeof value.name === 'string' ? value.name.trim() : ''
	const email = sanitizeHeaderValue(value.email)
	return name ? `${quoteDisplayName(name)} <${email}>` : email
}

/**
 * Reduce one address to the bare mailbox used by the envelope and allow-lists.
 *
 * → GOTCHA: this value ends up in an SMTP `MAIL FROM:`/`RCPT TO:` command, not
 *   only in a header. A CR or LF here is command injection — it desynchronises
 *   the reply stream and can smuggle a second `RCPT TO:` past the recipient
 *   pin. Every envelope value derives from here, so the strip belongs here
 *   rather than at each of the places that writes one.
 *
 * @param value - A bare address or a `{ email, name }` object.
 * @returns The bare address, with any `<…>` wrapper and any CR/LF removed.
 */
function toBareAddress(value: string | EmailAddress): string {
	const raw = typeof value === 'string' ? value : value.email
	const angled = raw.match(/<([^>]*)>/)
	return sanitizeHeaderValue(angled ? angled[1] : raw).trim()
}

/**
 * Flatten any accepted address input into a list of single addresses.
 *
 * @param value - String, `EmailAddress`, or an array mixing both. `undefined`
 *   and empty strings yield an empty list rather than a phantom recipient.
 * @returns Every address in source order.
 */
function toAddressList(value: EmailAddressInput | undefined): Array<string | EmailAddress> {
	if (value === undefined || value === null) {
		return []
	}

	const values = Array.isArray(value) ? value : [value]
	return values.filter((entry) => {
		if (typeof entry === 'string') {
			return entry.trim() !== ''
		}
		return isEmailAddressObject(entry)
	})
}

/**
 * Render an address input as a comma-separated header value.
 *
 * @param value - Any accepted address input.
 * @returns The joined header value, or `undefined` when there is nothing to write.
 */
export function formatAddressHeader(value: EmailAddressInput | undefined): string | undefined {
	const list = toAddressList(value)
	return list.length > 0 ? list.map(formatAddress).join(', ') : undefined
}

/**
 * Reduce an address input to bare addresses.
 *
 * @param value - Any accepted address input.
 * @returns Bare addresses in source order; empty when nothing was supplied.
 */
export function toBareAddressList(value: EmailAddressInput | undefined): string[] {
	return toAddressList(value).map(toBareAddress)
}

// -----------------------------------------------------------------------------
// Body + attachment encoding
// -----------------------------------------------------------------------------

/** Bare-LF bodies are legal input but illegal on the wire; MIME wants CRLF. */
function normalizeBodyText(value: string): string {
	return value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

/**
 * Base64-encode attachment content of any accepted type.
 *
 * @param content - String (encoded as UTF-8), `ArrayBuffer`, or any view over one.
 * @returns The base64 payload plus the decoded byte length, which is what the
 *   5 MiB budget is actually measured against once the transport re-decodes it.
 */
function encodeAttachmentContent(content: EmailAttachment['content']): {
	base64: string
	size: number
} {
	const bytes =
		typeof content === 'string'
			? new TextEncoder().encode(content)
			: content instanceof ArrayBuffer
				? new Uint8Array(content)
				: new Uint8Array(content.buffer, content.byteOffset, content.byteLength)

	// btoa() takes a binary string; chunk the conversion so a large attachment
	// cannot blow the argument limit of String.fromCharCode(...spread).
	let binary = ''
	const chunkSize = 0x8000
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
	}

	return { base64: btoa(binary), size: bytes.length }
}

/** Split base64 into 76-column lines, as `Content-Transfer-Encoding: base64` requires. */
function wrapBase64(value: string): string {
	const lines: string[] = []
	for (let offset = 0; offset < value.length; offset += 76) {
		lines.push(value.slice(offset, offset + 76))
	}
	return lines.join('\r\n')
}

function randomBoundary(prefix: string): string {
	return `devflare-${prefix}-${crypto.randomUUID()}`
}

/**
 * Build the `multipart/alternative` (or single-part) body carrying text + HTML.
 *
 * @param message - The composed message, read for `text` and `html` only.
 * @returns The body lines plus the `Content-Type` header that describes them.
 */
function buildBodyPart(message: ComposedEmailMessage): { contentType: string; body: string } {
	if (message.text && message.html) {
		const boundary = randomBoundary('alt')
		const parts = [
			`--${boundary}`,
			'Content-Type: text/plain; charset=UTF-8',
			'',
			normalizeBodyText(message.text),
			`--${boundary}`,
			'Content-Type: text/html; charset=UTF-8',
			'',
			normalizeBodyText(message.html),
			`--${boundary}--`
		]
		return {
			contentType: `multipart/alternative; boundary="${boundary}"`,
			body: parts.join('\r\n')
		}
	}

	return {
		contentType: `${message.html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
		body: normalizeBodyText(message.html ?? message.text ?? '')
	}
}

/**
 * Render one attachment as a MIME part.
 *
 * @param attachment - The attachment as the caller supplied it.
 * @param boundary - The enclosing `multipart/mixed` boundary.
 * @returns The part text and the summary recorded on the outbox entry.
 */
function buildAttachmentPart(
	attachment: EmailAttachment,
	boundary: string
): { part: string; summary: EmailAttachmentSummary } {
	const { base64, size } = encodeAttachmentContent(attachment.content)
	const disposition = attachment.disposition === 'inline' ? 'inline' : 'attachment'
	// A quote or CRLF in a filename would break out of the parameter and forge
	// the rest of the part's headers, the same way a subject can.
	const filename = sanitizeHeaderValue(attachment.filename).replace(/"/g, '')
	const type = sanitizeHeaderValue(attachment.type).replace(/[";]/g, '')
	const lines = [
		`--${boundary}`,
		`Content-Type: ${type}; name="${filename}"`,
		'Content-Transfer-Encoding: base64',
		`Content-Disposition: ${disposition}; filename="${filename}"`
	]

	if (disposition === 'inline' && attachment.contentId) {
		lines.push(`Content-ID: <${sanitizeHeaderValue(attachment.contentId).replace(/[<>]/g, '')}>`)
	}

	lines.push('', wrapBase64(base64))

	return {
		part: lines.join('\r\n'),
		summary: {
			filename,
			type,
			disposition,
			...(disposition === 'inline' && attachment.contentId
				? { contentId: attachment.contentId }
				: {}),
			size
		}
	}
}

// -----------------------------------------------------------------------------
// Public builder
// -----------------------------------------------------------------------------

/** Generate a `Message-ID` in the form Cloudflare returns from `send()`. */
export function createMessageId(): string {
	return `<${Date.now()}-${Math.random().toString(36).slice(2)}@devflare.dev>`
}

/**
 * Emit every header line that precedes the `Content-Type` of the body.
 *
 * @param message - The composed message, read for `subject`, `cc`, and `bcc`.
 * @param resolved - Values the caller already computed, so the header block and
 *   the structured view cannot disagree about what was written.
 * @returns The header lines, ending with `MIME-Version`.
 */
function buildHeaderLines(
	message: ComposedEmailMessage,
	resolved: {
		messageId: string
		date: Date
		fromHeader: string
		toHeader: string
		replyToHeader: string | undefined
		headers: Record<string, string>
	}
): string[] {
	const lines: string[] = [
		`From: ${resolved.fromHeader}`,
		`To: ${resolved.toHeader}`,
		`Date: ${resolved.date.toUTCString()}`,
		`Message-ID: ${resolved.messageId}`
	]

	const optional: Array<[string, string | undefined]> = [
		['Subject', message.subject],
		['Reply-To', resolved.replyToHeader],
		['Cc', formatAddressHeader(message.cc)],
		['Bcc', formatAddressHeader(message.bcc)]
	]

	for (const [name, value] of optional) {
		if (value) {
			lines.push(`${name}: ${sanitizeHeaderValue(value)}`)
		}
	}

	for (const [key, value] of Object.entries(resolved.headers)) {
		lines.push(`${sanitizeHeaderValue(key)}: ${sanitizeHeaderValue(value)}`)
	}

	lines.push('MIME-Version: 1.0')
	return lines
}

/**
 * Turn a builder-shaped message into its structured and MIME representations.
 *
 * Address fields accept every form Cloudflare's binding does — bare string,
 * `{ email, name }`, or an array mixing the two — and are recorded twice: bare
 * for the envelope, header-formatted for the wire.
 *
 * @param message - The message in builder shape.
 * @param options.messageId - Reuse an existing `Message-ID` instead of minting
 *   one, so the value stamped on the MIME matches what `send()` already returned.
 * @param options.date - Fix the `Date:` header. Intended for deterministic tests.
 * @returns The normalized message, its MIME document, and that document's size.
 */
export function buildEmailMessage(
	message: ComposedEmailMessage,
	options: { messageId?: string; date?: Date } = {}
): BuiltEmailMessage {
	const messageId = options.messageId ?? createMessageId()
	const fromHeader = formatAddressHeader(message.from) ?? ''
	const toHeader = formatAddressHeader(message.to) ?? ''
	const replyToHeader = formatAddressHeader(message.replyTo)
	const headers = { ...(message.headers ?? {}) }

	const lines = buildHeaderLines(message, {
		messageId,
		date: options.date ?? new Date(),
		fromHeader,
		toHeader,
		replyToHeader,
		headers
	})

	const attachments = message.attachments ?? []
	const bodyPart = buildBodyPart(message)
	const summaries: EmailAttachmentSummary[] = []

	if (attachments.length > 0) {
		const mixedBoundary = randomBoundary('mixed')
		lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
		lines.push('')
		lines.push(`--${mixedBoundary}`)
		lines.push(`Content-Type: ${bodyPart.contentType}`)
		lines.push('')
		lines.push(bodyPart.body)

		for (const attachment of attachments) {
			const { part, summary } = buildAttachmentPart(attachment, mixedBoundary)
			lines.push(part)
			summaries.push(summary)
		}

		lines.push(`--${mixedBoundary}--`)
	} else {
		lines.push(`Content-Type: ${bodyPart.contentType}`)
		lines.push('')
		lines.push(bodyPart.body)
	}

	const raw = lines.join('\r\n')

	return {
		message: {
			from: toBareAddressList(message.from)[0] ?? '',
			fromHeader,
			to: toBareAddressList(message.to),
			toHeader,
			cc: toBareAddressList(message.cc),
			bcc: toBareAddressList(message.bcc),
			...(replyToHeader ? { replyTo: toBareAddressList(message.replyTo)[0] } : {}),
			// Sanitized, so the structured view and the MIME never disagree — and
			// they disagree for exactly the inputs a reader most needs to see.
			...(message.subject ? { subject: sanitizeHeaderValue(message.subject) } : {}),
			...(message.text !== undefined ? { text: message.text } : {}),
			...(message.html !== undefined ? { html: message.html } : {}),
			headers: Object.fromEntries(
				Object.entries(headers).map(([key, value]) => [
					sanitizeHeaderValue(key),
					sanitizeHeaderValue(value)
				])
			),
			attachments: summaries,
			messageId
		},
		raw,
		size: new TextEncoder().encode(raw).length
	}
}

/**
 * Split an address-list header on the separators that actually separate.
 *
 * A naive `split(',')` cuts `"Doe, John" <j@d.com>` in half and yields two junk
 * addresses, so commas inside a quoted display name (and inside `<…>`) are
 * skipped.
 *
 * @param value - An unfolded header value such as a `To:` line.
 * @returns One entry per address, trimmed, empties dropped.
 */
function splitAddressList(value: string): string[] {
	const entries: string[] = []
	let current = ''
	let quoted = false
	let angled = false

	for (const char of value) {
		if (char === '"') {
			quoted = !quoted
		} else if (!quoted && char === '<') {
			angled = true
		} else if (!quoted && char === '>') {
			angled = false
		} else if (char === ',' && !quoted && !angled) {
			entries.push(current.trim())
			current = ''
			continue
		}

		current += char
	}

	entries.push(current.trim())
	return entries.filter(Boolean)
}

/**
 * Parse an existing MIME document back into the structured shape.
 *
 * Used when a caller supplies pre-built `raw` MIME (or when a relayed message
 * is read back) so an outbox entry looks the same whichever way it was made.
 * Only the envelope-relevant headers are recovered — the body is left in `raw`.
 *
 * @param raw - A complete RFC 5322 document.
 * @param fallback.from - Envelope sender to use when the document has no `From:`.
 * @param fallback.to - Envelope recipients to use when the document has no `To:`.
 * @returns The structured view of the document's headers.
 */
export function parseEmailMessage(
	raw: string,
	fallback: { from?: string; to?: string[] } = {}
): NormalizedEmailMessage {
	const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0] ?? ''
	const headers: Record<string, string> = {}

	// Unfold RFC 5322 continuation lines before splitting on the first colon.
	for (const line of headerBlock.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
		const colonIndex = line.indexOf(':')
		if (colonIndex > 0) {
			headers[line.slice(0, colonIndex).trim()] = line.slice(colonIndex + 1).trim()
		}
	}

	const headerValue = (name: string): string | undefined => {
		const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name)
		return key ? headers[key] : undefined
	}

	const splitAddresses = (value: string | undefined): string[] =>
		value
			? splitAddressList(value)
					.map((entry) => toBareAddress(entry))
					.filter(Boolean)
			: []

	const fromHeader = headerValue('from') ?? fallback.from ?? ''
	const toHeader = headerValue('to') ?? (fallback.to ?? []).join(', ')
	const replyTo = splitAddresses(headerValue('reply-to'))[0]

	return {
		from: splitAddresses(fromHeader)[0] ?? fallback.from ?? '',
		fromHeader,
		to: splitAddresses(toHeader).length > 0 ? splitAddresses(toHeader) : (fallback.to ?? []),
		toHeader,
		cc: splitAddresses(headerValue('cc')),
		bcc: splitAddresses(headerValue('bcc')),
		...(replyTo ? { replyTo } : {}),
		...(headerValue('subject') ? { subject: headerValue('subject') } : {}),
		headers,
		attachments: [],
		messageId: headerValue('message-id') ?? ''
	}
}
