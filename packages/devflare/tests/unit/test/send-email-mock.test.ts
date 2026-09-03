import { describe, expect, test } from 'bun:test'
import { createMockEnv, createMockSendEmail } from '../../../src/test'

type ComposedMessage = {
	from: string
	to: string | string[]
	subject?: string
	text?: string
}

const message = (overrides: Partial<ComposedMessage> = {}): ComposedMessage => ({
	from: 'sender@example.com',
	to: 'recipient@example.com',
	subject: 'Hello',
	text: 'Sent locally',
	...overrides
})

describe('createMockSendEmail', () => {
	test('records messages passed to send', async () => {
		const email = createMockSendEmail()

		await email.send(message() as Parameters<SendEmail['send']>[0])
		await email.send(message({ to: 'second@example.com' }) as Parameters<SendEmail['send']>[0])

		expect(email.sentEmails).toHaveLength(2)
		expect(email.sentEmails[0].from).toBe('sender@example.com')
		expect(email.sentEmails[0].to).toBe('recipient@example.com')
		expect(email.sentEmails[1].to).toBe('second@example.com')
		// `messages` is an alias of `sentEmails`.
		expect(email.messages).toBe(email.sentEmails)
	})

	test('enforces the configured destination allow-list before recording', async () => {
		const email = createMockSendEmail({ destinationAddress: 'recipient@example.com' })

		await email.send(message() as Parameters<SendEmail['send']>[0])
		await expect(
			email.send(message({ to: 'stranger@example.com' }) as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('not allowed')

		// Only the accepted message is recorded.
		expect(email.sentEmails).toHaveLength(1)
		expect(email.sentEmails[0].to).toBe('recipient@example.com')
	})

	test('enforces the configured sender allow-list', async () => {
		const email = createMockSendEmail({ allowedSenderAddresses: ['sender@example.com'] })

		await expect(
			email.send(message({ from: 'imposter@example.com' }) as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('not allowed')
		expect(email.sentEmails).toHaveLength(0)
	})

	test('clear() empties the recorded messages', async () => {
		const email = createMockSendEmail()
		await email.send(message() as Parameters<SendEmail['send']>[0])
		email.clear()
		expect(email.sentEmails).toEqual([])
	})

	test('createMockEnv wires sendEmail bindings from a name list', async () => {
		const env = createMockEnv({ sendEmail: ['EMAIL'] }) as {
			EMAIL: ReturnType<typeof createMockSendEmail>
		}

		await env.EMAIL.send(message() as Parameters<SendEmail['send']>[0])
		expect(env.EMAIL.sentEmails).toHaveLength(1)
		expect(env.EMAIL.sentEmails[0].to).toBe('recipient@example.com')
	})

	test('createMockEnv wires sendEmail bindings from a config record', async () => {
		const env = createMockEnv({
			sendEmail: { EMAIL: { destinationAddress: 'recipient@example.com' } }
		}) as { EMAIL: ReturnType<typeof createMockSendEmail> }

		await expect(
			env.EMAIL.send(message({ to: 'stranger@example.com' }) as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('not allowed')
	})

	test('createMockEnv accepts a custom SendEmail override', async () => {
		const custom = createMockSendEmail()
		const env = createMockEnv({ sendEmail: { EMAIL: custom } }) as { EMAIL: typeof custom }

		expect(env.EMAIL).toBe(custom)
	})
})
