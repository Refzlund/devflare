import { afterEach, describe, expect, test } from 'bun:test'
import { createHostEmailDeliverySink } from '../../../src/email/host-sink'
import { getOutbox, resetOutbox } from '../../../src/email/outbox'
import type { ResolvedEmailRuntime } from '../../../src/email/runtime-config'
import { clearEmailDeliverySink, setEmailDeliverySink } from '../../../src/utils/email-delivery'
import { EMAIL_MAX_MESSAGE_BYTES } from '../../../src/utils/email-message'
import { createLocalSendEmailBinding } from '../../../src/utils/send-email'

const capture: ResolvedEmailRuntime = { mode: 'capture', relay: null, inbound: null }

afterEach(() => {
	clearEmailDeliverySink()
	resetOutbox()
})

function installCapture(): void {
	setEmailDeliverySink(createHostEmailDeliverySink(() => capture))
}

describe('outbox', () => {
	test('records both representations of what the worker sent', async () => {
		installCapture()
		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		await binding.send({
			from: { email: 'noreply@example.com', name: 'My App' },
			to: 'user@example.com',
			cc: ['ops@example.com'],
			bcc: 'audit@example.com',
			replyTo: 'support@example.com',
			subject: 'Welcome',
			html: '<p>hi</p>',
			text: 'hi'
		} as Parameters<SendEmail['send']>[0])

		expect(getOutbox()).toHaveLength(1)
		const entry = getOutbox()[0]

		expect(entry.binding).toBe('MAILER')
		expect(entry.mode).toBe('capture')
		expect(entry.relayed).toBe(false)
		expect(entry.deliveredTo).toEqual([])

		// Structured — the shape assertions read off.
		expect(entry.message.to).toEqual(['user@example.com'])
		expect(entry.message.cc).toEqual(['ops@example.com'])
		expect(entry.message.bcc).toEqual(['audit@example.com'])
		expect(entry.message.replyTo).toBe('support@example.com')
		expect(entry.message.subject).toBe('Welcome')

		// Raw — the only place headers and total size can be checked.
		expect(entry.raw).toContain('Cc: ops@example.com')
		expect(entry.raw).toContain('Bcc: audit@example.com')
		expect(entry.size).toBe(new TextEncoder().encode(entry.raw).length)
		expect(entry.size).toBeLessThan(EMAIL_MAX_MESSAGE_BYTES)
	})

	test('capture never transmits, whatever the message says', async () => {
		installCapture()
		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		await binding.send({
			from: 'a@example.com',
			to: 'real-user@customer.com',
			subject: 's',
			text: 't'
		} as Parameters<SendEmail['send']>[0])

		expect(getOutbox()[0].relayed).toBe(false)
		expect(getOutbox()[0].deliveredTo).toEqual([])
	})

	test('the id send() returns is the one stamped on the MIME', async () => {
		installCapture()
		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		const result = await binding.send({
			from: 'a@example.com',
			to: 'b@example.com',
			subject: 's',
			text: 't'
		} as Parameters<SendEmail['send']>[0])

		expect(typeof result.messageId).toBe('string')
		expect(result.messageId).not.toBe('')
		expect(getOutbox()[0].raw).toContain(`Message-ID: ${result.messageId}`)
	})

	test('records a message the caller composed as raw MIME', async () => {
		installCapture()
		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })
		const raw = [
			'From: a@example.com',
			'To: b@example.com',
			'Subject: hand-rolled',
			'Message-ID: <hand@devflare.dev>',
			'',
			'body'
		].join('\r\n')

		await binding.send({ from: 'a@example.com', to: 'b@example.com', raw } as unknown as Parameters<
			SendEmail['send']
		>[0])

		expect(getOutbox()[0].raw).toBe(raw)
		expect(getOutbox()[0].message.subject).toBe('hand-rolled')
		expect(getOutbox()[0].messageId).toBe('<hand@devflare.dev>')
	})

	test('a rejected message is never recorded', async () => {
		installCapture()
		const binding = createLocalSendEmailBinding(
			{ destinationAddress: 'allowed@example.com' },
			{ binding: 'MAILER' }
		)

		await expect(
			binding.send({
				from: 'a@example.com',
				to: 'stranger@example.com',
				subject: 's',
				text: 't'
			} as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('not allowed')

		expect(getOutbox()).toHaveLength(0)
	})

	test('allow-lists still apply when addresses arrive as objects', async () => {
		installCapture()
		const binding = createLocalSendEmailBinding(
			{ destinationAddress: 'allowed@example.com', allowedSenderAddresses: ['a@example.com'] },
			{ binding: 'MAILER' }
		)

		await expect(
			binding.send({
				from: { email: 'a@example.com', name: 'Ada' },
				to: { email: 'stranger@example.com', name: 'Stranger' },
				subject: 's',
				text: 't'
			} as unknown as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('email to stranger@example.com not allowed')

		await binding.send({
			from: { email: 'a@example.com', name: 'Ada' },
			to: { email: 'allowed@example.com' },
			subject: 's',
			text: 't'
		} as unknown as Parameters<SendEmail['send']>[0])

		expect(getOutbox()).toHaveLength(1)
	})

	test('with no sink installed nothing is recorded and nothing throws', async () => {
		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		const result = await binding.send({
			from: 'a@example.com',
			to: 'b@example.com',
			subject: 's',
			text: 't'
		} as Parameters<SendEmail['send']>[0])

		expect(result.messageId).not.toBe('')
		expect(getOutbox()).toHaveLength(0)
	})
})

describe('relay mode', () => {
	test('records first, then hands the pinned message to the transport', async () => {
		const transmitted: Array<{ to: string[]; raw: string }> = []

		// Stand in for the SMTP transport so the mode decision can be observed
		// without a socket; the pin itself is covered in relay-pin.test.ts.
		setEmailDeliverySink(async (delivery) => {
			const { handleHostDelivery } = await import('../../../src/email/host-sink')
			const { applyRecipientPin } = await import('../../../src/email/relay')
			const relay = {
				url: 'smtps://user:pass@smtp.example.com:465',
				to: 'dev-inbox@example.com',
				header: 'X-Devflare-Dev-Relay',
				rejectUnauthorized: true
			}
			const pinned = applyRecipientPin(delivery, relay)
			transmitted.push({ to: pinned.to, raw: pinned.raw })
			return handleHostDelivery(delivery, { mode: 'capture', relay: null, inbound: null })
		})

		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })
		await binding.send({
			from: 'a@example.com',
			to: 'real-user@customer.com',
			subject: 's',
			text: 't'
		} as Parameters<SendEmail['send']>[0])

		expect(transmitted).toHaveLength(1)
		expect(transmitted[0].to).toEqual(['dev-inbox@example.com'])
		expect(getOutbox()).toHaveLength(1)
		// The outbox keeps what the worker ASKED for; the pin is a transport fact.
		expect(getOutbox()[0].message.to).toEqual(['real-user@customer.com'])
	})

	test('a transport failure reaches the caller instead of being swallowed', async () => {
		setEmailDeliverySink(
			createHostEmailDeliverySink(() => ({
				mode: 'relay',
				relay: {
					url: 'not-a-url',
					to: 'dev@example.com',
					header: 'X-Devflare-Dev-Relay',
					rejectUnauthorized: true
				},
				inbound: null
			}))
		)

		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		await expect(
			binding.send({
				from: 'a@example.com',
				to: 'b@example.com',
				subject: 's',
				text: 't'
			} as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('Invalid SMTP URL')

		// Recorded before the attempt, so a failed relay is still inspectable.
		expect(getOutbox()).toHaveLength(1)
	})
})
