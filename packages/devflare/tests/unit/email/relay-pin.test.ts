import { describe, expect, test } from 'bun:test'
import { readHeader } from '../../../src/email/mime-headers'
import { applyRecipientPin } from '../../../src/email/relay'
import type { ResolvedEmailRelay } from '../../../src/email/runtime-config'
import type { EmailDelivery } from '../../../src/utils/email-delivery'
import { buildEmailMessage } from '../../../src/utils/email-message'

const relay: ResolvedEmailRelay = {
	url: 'smtps://user:pass@smtp.example.com:465',
	to: 'dev-inbox@example.com',
	header: 'X-Devflare-Dev-Relay',
	rejectUnauthorized: true
}

function delivery(overrides: Partial<Parameters<typeof buildEmailMessage>[0]> = {}): EmailDelivery {
	const built = buildEmailMessage({
		from: 'noreply@example.com',
		to: ['real-user@customer.com', 'second@customer.com'],
		cc: 'cc@customer.com',
		bcc: 'bcc@customer.com',
		subject: 'Your invoice',
		text: 'body',
		...overrides
	})

	return {
		binding: 'MAILER',
		message: built.message,
		raw: built.raw,
		size: built.size,
		messageId: built.message.messageId
	}
}

describe('recipient pin', () => {
	test('every recipient collapses to the pinned address', () => {
		const pinned = applyRecipientPin(delivery(), relay)

		expect(pinned.to).toEqual(['dev-inbox@example.com'])
		expect(readHeader(pinned.raw, 'To')).toBe('dev-inbox@example.com')
		expect(readHeader(pinned.raw, 'Cc')).toBeUndefined()
		expect(readHeader(pinned.raw, 'Bcc')).toBeUndefined()
	})

	test('no real recipient survives in a header a mail server would deliver to', () => {
		// The originals are deliberately preserved on X-Devflare-Original-*, which
		// is why this asserts on the deliverable fields rather than on substrings.
		const pinned = applyRecipientPin(delivery(), relay)

		for (const field of ['To', 'Cc', 'Bcc'] as const) {
			const value = readHeader(pinned.raw, field)
			expect(value === undefined || value === 'dev-inbox@example.com').toBe(true)
		}

		expect(pinned.to).toEqual(['dev-inbox@example.com'])
	})

	test('the marker header is stamped on everything the relay sends', () => {
		const pinned = applyRecipientPin(delivery(), relay)
		expect(readHeader(pinned.raw, 'X-Devflare-Dev-Relay')).toBe('1')
	})

	test('a custom marker name is honoured', () => {
		const pinned = applyRecipientPin(delivery(), {
			...relay,
			header: 'X-Uidini-Dev-Relay'
		})

		expect(readHeader(pinned.raw, 'X-Uidini-Dev-Relay')).toBe('1')
	})

	test('the intended recipients are preserved for the developer reading the pinned inbox', () => {
		const pinned = applyRecipientPin(delivery(), relay)

		expect(readHeader(pinned.raw, 'X-Devflare-Original-To')).toBe(
			'real-user@customer.com, second@customer.com'
		)
		expect(readHeader(pinned.raw, 'X-Devflare-Original-Cc')).toBe('cc@customer.com')
		expect(readHeader(pinned.raw, 'X-Devflare-Original-Bcc')).toBe('bcc@customer.com')
		expect(readHeader(pinned.raw, 'X-Devflare-Binding')).toBe('MAILER')
	})

	test('the pin cannot be bypassed by composing the MIME yourself', () => {
		// Worker code that hands the binding a hand-built document still gets
		// pinned, because the rewrite happens on the assembled document.
		const raw = [
			'From: noreply@example.com',
			'To: real-user@customer.com',
			'Cc: sneaky@customer.com',
			'Subject: hand-rolled',
			'',
			'body'
		].join('\r\n')

		const pinned = applyRecipientPin(
			{
				binding: 'MAILER',
				message: {
					from: 'noreply@example.com',
					fromHeader: 'noreply@example.com',
					to: ['real-user@customer.com'],
					toHeader: 'real-user@customer.com',
					cc: ['sneaky@customer.com'],
					bcc: [],
					headers: {},
					attachments: [],
					messageId: '<x@devflare.dev>'
				},
				raw,
				size: raw.length,
				messageId: '<x@devflare.dev>'
			},
			relay
		)

		expect(pinned.to).toEqual(['dev-inbox@example.com'])
		expect(readHeader(pinned.raw, 'To')).toBe('dev-inbox@example.com')
		expect(readHeader(pinned.raw, 'Cc')).toBeUndefined()
		expect(pinned.raw).toContain('body')
	})

	test('the envelope sender can be overridden without touching the document', () => {
		const withOverride = applyRecipientPin(delivery(), {
			...relay,
			from: 'relay@example.com'
		})

		expect(withOverride.from).toBe('relay@example.com')
		expect(readHeader(withOverride.raw, 'From')).toBe('noreply@example.com')
		expect(applyRecipientPin(delivery(), relay).from).toBe('noreply@example.com')
	})
})
