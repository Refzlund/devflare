import { afterEach, describe, expect, test } from 'bun:test'
import {
	OUTBOX_CAPACITY,
	clearOutbox,
	getOutbox,
	getSentMessages,
	onOutboxEntry,
	recordOutboxEntry,
	resetOutbox
} from '../../../src/email/outbox'
import type { SentEmailRecord } from '../../../src/email/outbox'

afterEach(() => {
	resetOutbox()
})

const entry = (subject: string): SentEmailRecord => ({
	binding: 'MAILER',
	message: {
		from: 'a@example.com',
		fromHeader: 'a@example.com',
		to: ['b@example.com'],
		toHeader: 'b@example.com',
		cc: [],
		bcc: [],
		subject,
		headers: {},
		attachments: [],
		messageId: `<${subject}@devflare.dev>`
	},
	raw: `Subject: ${subject}\r\n\r\nbody`,
	size: 24,
	messageId: `<${subject}@devflare.dev>`,
	mode: 'capture',
	relayed: false,
	deliveredTo: [],
	timestamp: new Date()
})

describe('outbox', () => {
	test('keeps dispatch order', () => {
		recordOutboxEntry(entry('one'))
		recordOutboxEntry(entry('two'))

		expect(getOutbox().map((record) => record.message.subject)).toEqual(['one', 'two'])
	})

	test('sent() hands back a copy the caller may mutate', () => {
		recordOutboxEntry(entry('one'))
		const copy = getSentMessages()
		copy.length = 0

		expect(getOutbox()).toHaveLength(1)
	})

	test('clearOutbox() empties the records but keeps listeners subscribed', () => {
		const seen: string[] = []
		onOutboxEntry((record) => seen.push(record.message.subject ?? ''))

		recordOutboxEntry(entry('one'))
		clearOutbox()
		recordOutboxEntry(entry('two'))

		expect(getOutbox()).toHaveLength(1)
		expect(seen).toEqual(['one', 'two'])
	})

	test('unsubscribing stops the callbacks', () => {
		const seen: string[] = []
		const unsubscribe = onOutboxEntry((record) => seen.push(record.message.subject ?? ''))

		recordOutboxEntry(entry('one'))
		unsubscribe()
		recordOutboxEntry(entry('two'))

		expect(seen).toEqual(['one'])
	})

	test('a listener that throws is not swallowed', () => {
		onOutboxEntry(() => {
			throw new Error('assertion inside a subscriber')
		})

		expect(() => recordOutboxEntry(entry('one'))).toThrow('assertion inside a subscriber')
	})

	test('drops the oldest entries past the capacity rather than growing forever', () => {
		for (let index = 0; index < OUTBOX_CAPACITY + 5; index += 1) {
			recordOutboxEntry(entry(`message-${index}`))
		}

		expect(getOutbox()).toHaveLength(OUTBOX_CAPACITY)
		expect(getOutbox()[0].message.subject).toBe('message-5')
		expect(getOutbox().at(-1)?.message.subject).toBe(`message-${OUTBOX_CAPACITY + 4}`)
	})
})
