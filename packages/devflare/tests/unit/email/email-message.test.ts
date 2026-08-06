import { describe, expect, test } from 'bun:test'
import {
	EMAIL_MAX_MESSAGE_BYTES,
	buildEmailMessage,
	formatAddressHeader,
	parseEmailMessage,
	toBareAddressList
} from '../../../src/utils/email-message'

describe('address handling', () => {
	test('accepts every form Cloudflare accepts', () => {
		expect(formatAddressHeader('a@example.com')).toBe('a@example.com')
		expect(formatAddressHeader({ email: 'a@example.com', name: 'Ada' })).toBe(
			'"Ada" <a@example.com>'
		)
		expect(formatAddressHeader({ email: 'a@example.com' } as EmailAddress)).toBe('a@example.com')
		expect(formatAddressHeader(['a@example.com', { email: 'b@example.com', name: 'Bea' }])).toBe(
			'a@example.com, "Bea" <b@example.com>'
		)
	})

	test('quotes a display name that would otherwise split the header', () => {
		expect(formatAddressHeader({ email: 'a@example.com', name: 'Doe, Jane' })).toBe(
			'"Doe, Jane" <a@example.com>'
		)
		expect(formatAddressHeader({ email: 'a@example.com', name: 'He said "hi"' })).toBe(
			'"He said \\"hi\\"" <a@example.com>'
		)
	})

	test('reduces every form to the bare envelope address', () => {
		expect(
			toBareAddressList([
				'a@example.com',
				{ email: 'b@example.com', name: 'Bea' },
				'"Cy" <c@example.com>'
			])
		).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
	})

	test('strips CR/LF from an envelope address', () => {
		// This value ends up in an SMTP MAIL FROM / RCPT TO command, not only in a
		// header, so a newline here is command injection rather than header forgery.
		expect(toBareAddressList('a@example.com\r\nRCPT TO:victim@evil.com')).toEqual([
			'a@example.com RCPT TO:victim@evil.com'
		])
		expect(toBareAddressList({ email: 'b@example.com\r\nx', name: 'n' } as EmailAddress)).toEqual([
			'b@example.com x'
		])
	})

	test('drops empty entries rather than inventing a recipient', () => {
		expect(toBareAddressList(undefined)).toEqual([])
		expect(toBareAddressList(['', '  '])).toEqual([])
	})
})

describe('buildEmailMessage', () => {
	test('round-trips the full builder shape into structure and MIME', () => {
		const { message, raw } = buildEmailMessage({
			from: { email: 'noreply@example.com', name: 'My App' },
			to: ['user@example.com', { email: 'other@example.com', name: 'Other' }],
			cc: 'ops@example.com',
			bcc: ['audit@example.com'],
			replyTo: { email: 'support@example.com', name: 'Support' },
			subject: 'Hello',
			text: 'plain',
			html: '<p>rich</p>',
			headers: { 'X-Trace': 'abc123' }
		})

		// Structured view — bare addresses for the envelope, header form beside it.
		expect(message.from).toBe('noreply@example.com')
		expect(message.fromHeader).toBe('"My App" <noreply@example.com>')
		expect(message.to).toEqual(['user@example.com', 'other@example.com'])
		expect(message.cc).toEqual(['ops@example.com'])
		expect(message.bcc).toEqual(['audit@example.com'])
		expect(message.replyTo).toBe('support@example.com')
		expect(message.subject).toBe('Hello')
		expect(message.headers).toEqual({ 'X-Trace': 'abc123' })

		// MIME — every field actually reaches the wire.
		expect(raw).toContain('From: "My App" <noreply@example.com>')
		expect(raw).toContain('To: user@example.com, "Other" <other@example.com>')
		expect(raw).toContain('Cc: ops@example.com')
		expect(raw).toContain('Bcc: audit@example.com')
		expect(raw).toContain('Reply-To: "Support" <support@example.com>')
		expect(raw).toContain('Subject: Hello')
		expect(raw).toContain('X-Trace: abc123')
		expect(raw).toContain(`Message-ID: ${message.messageId}`)
		expect(raw).toContain('Content-Type: multipart/alternative;')
		expect(raw).toContain('plain')
		expect(raw).toContain('<p>rich</p>')
	})

	test('an object address never reaches the wire as [object Object]', () => {
		const { raw, message } = buildEmailMessage({
			from: { email: 'a@example.com', name: 'Ada' },
			to: { email: 'b@example.com', name: 'Bea' },
			replyTo: { email: 'c@example.com', name: 'Cy' },
			subject: 's',
			text: 't'
		})

		expect(raw).not.toContain('[object Object]')
		expect(message.to).toEqual(['b@example.com'])
	})

	test('a single body part is not wrapped in multipart', () => {
		const html = buildEmailMessage({ from: 'a@b.c', to: 'd@e.f', subject: 's', html: '<b>x</b>' })
		expect(html.raw).toContain('Content-Type: text/html; charset=UTF-8')
		expect(html.raw).not.toContain('multipart')

		const text = buildEmailMessage({ from: 'a@b.c', to: 'd@e.f', subject: 's', text: 'x' })
		expect(text.raw).toContain('Content-Type: text/plain; charset=UTF-8')
	})

	test('attachments become multipart/mixed parts with base64 content', () => {
		const { message, raw, size } = buildEmailMessage({
			from: 'a@b.c',
			to: 'd@e.f',
			subject: 'Invoice',
			text: 'See attached',
			attachments: [
				{
					disposition: 'attachment',
					filename: 'invoice.txt',
					type: 'text/plain',
					content: 'hello attachment'
				},
				{
					disposition: 'inline',
					contentId: 'logo',
					filename: 'logo.png',
					type: 'image/png',
					content: new Uint8Array([1, 2, 3, 4]).buffer
				}
			]
		})

		expect(raw).toContain('Content-Type: multipart/mixed;')
		expect(raw).toContain('Content-Disposition: attachment; filename="invoice.txt"')
		expect(raw).toContain('Content-Disposition: inline; filename="logo.png"')
		expect(raw).toContain('Content-ID: <logo>')
		expect(raw).toContain(btoa('hello attachment'))

		// The summary carries metadata; the bytes live only in the MIME, so an
		// outbox holding a hundred messages does not hold two copies of each.
		expect(message.attachments).toEqual([
			{
				filename: 'invoice.txt',
				type: 'text/plain',
				disposition: 'attachment',
				size: 16
			},
			{
				filename: 'logo.png',
				type: 'image/png',
				disposition: 'inline',
				contentId: 'logo',
				size: 4
			}
		])

		expect(size).toBe(new TextEncoder().encode(raw).length)
		expect(size).toBeLessThan(EMAIL_MAX_MESSAGE_BYTES)
	})

	test('bodies are CRLF-normalized so a bare LF cannot corrupt the document', () => {
		const { raw } = buildEmailMessage({
			from: 'a@b.c',
			to: 'd@e.f',
			subject: 's',
			text: 'one\ntwo'
		})

		expect(raw).toContain('one\r\ntwo')
		expect(raw.includes('one\ntwo')).toBe(false)
	})

	test('CRLF in caller text cannot forge a header', () => {
		// Devflare composes headers by concatenation, so a newline in a subject, a
		// display name, or a custom header value is header injection: it would forge
		// a recipient, or end the header block and spill the rest into the body.
		const { raw } = buildEmailMessage({
			from: { email: 'a@example.com', name: 'Ada\r\nBcc: forged-name@evil.com' },
			to: 'b@example.com',
			subject: 'Hi\r\nBcc: forged-subject@evil.com',
			headers: { 'X-Trace': 'abc\r\nBcc: forged-header@evil.com' },
			text: 'body'
		})

		const headerBlock = raw.split('\r\n\r\n')[0]
		expect(headerBlock).not.toMatch(/^Bcc:/m)
		expect(headerBlock.split('\r\n').filter((line) => line.startsWith('Subject:'))).toHaveLength(1)
		expect(raw).not.toContain('\r\nBcc:')
	})

	test('an attachment filename cannot break out of its own part headers', () => {
		const { raw, message } = buildEmailMessage({
			from: 'a@example.com',
			to: 'b@example.com',
			subject: 's',
			text: 't',
			attachments: [
				{
					disposition: 'attachment',
					filename: 'in"voice\r\nX-Forged: 1.txt',
					type: 'text/plain',
					content: 'x'
				}
			]
		})

		expect(raw).not.toContain('\r\nX-Forged: 1')
		expect(message.attachments[0].filename).toBe('invoice X-Forged: 1.txt')
	})

	test('a supplied Message-ID is reused rather than regenerated', () => {
		const { message, raw } = buildEmailMessage(
			{ from: 'a@b.c', to: 'd@e.f', subject: 's', text: 't' },
			{ messageId: '<fixed@devflare.dev>' }
		)

		expect(message.messageId).toBe('<fixed@devflare.dev>')
		expect(raw).toContain('Message-ID: <fixed@devflare.dev>')
	})
})

describe('parseEmailMessage', () => {
	test('recovers the envelope from a document Devflare built', () => {
		const { raw, message } = buildEmailMessage({
			from: { email: 'a@example.com', name: 'Ada' },
			to: ['b@example.com', 'c@example.com'],
			cc: 'ops@example.com',
			replyTo: 'support@example.com',
			subject: 'Round trip',
			text: 'body'
		})

		const parsed = parseEmailMessage(raw)

		expect(parsed.from).toBe('a@example.com')
		expect(parsed.to).toEqual(['b@example.com', 'c@example.com'])
		expect(parsed.cc).toEqual(['ops@example.com'])
		expect(parsed.replyTo).toBe('support@example.com')
		expect(parsed.subject).toBe('Round trip')
		expect(parsed.messageId).toBe(message.messageId)
	})

	test('unfolds a continued header', () => {
		const raw = ['To: a@example.com,', ' b@example.com', 'Subject: folded', '', 'body'].join('\r\n')

		expect(parseEmailMessage(raw).to).toEqual(['a@example.com', 'b@example.com'])
	})

	test('falls back to the envelope the caller supplied', () => {
		const parsed = parseEmailMessage('Subject: no addresses\r\n\r\nbody', {
			from: 'a@example.com',
			to: ['b@example.com']
		})

		expect(parsed.from).toBe('a@example.com')
		expect(parsed.to).toEqual(['b@example.com'])
	})
})

describe('address-list parsing', () => {
	test('a comma inside a quoted display name does not split the address', () => {
		const raw = [
			'From: a@example.com',
			'To: "Doe, John" <john@example.com>, jane@example.com',
			'Subject: s',
			'',
			'body'
		].join('\r\n')

		expect(parseEmailMessage(raw).to).toEqual(['john@example.com', 'jane@example.com'])
	})
})
