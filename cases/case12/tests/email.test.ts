// =============================================================================
// Case 12: Email Handlers — Tests
// =============================================================================
// Tests for email handling using devflare/test email helper.
// These assertions cover direct handler delivery under createTestContext(),
// plus the recorded reply/forward side effects exposed by the helper.
// =============================================================================

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { createTestContext, email } from 'devflare/test'
import { env } from 'devflare'
import type { ReceivedEmail } from 'devflare/test'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function listEmailLogKeys(): Promise<string[]> {
	const result = await env.EMAIL_LOG.list({ prefix: 'email:' })
	return result.keys.map((key) => key.name)
}

async function getLoggedEmail(beforeKeys: string[]): Promise<{
	id: string
	from: string
	to: string
	subject?: string
	receivedAt: string
	bodyPreview: string
}> {
	const afterKeys = await listEmailLogKeys()
	const newKey = afterKeys.find((key) => !beforeKeys.includes(key))
	expect(newKey).toBeDefined()

	const stored = await env.EMAIL_LOG.get(newKey!)
	expect(stored).not.toBeNull()

	return JSON.parse(stored!) as {
		id: string
		from: string
		to: string
		subject?: string
		receivedAt: string
		bodyPreview: string
	}
}

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(async () => {
	await createTestContext()
})

afterAll(async () => {
	await env.dispose()
})

beforeEach(() => {
	email.clearSentEmails()
})

// -----------------------------------------------------------------------------
// Email Handler Tests
// -----------------------------------------------------------------------------

describe('Email Handler', () => {
	test('email.send() delivers to src/email.ts and records reply/forward side effects', async () => {
		const beforeKeys = await listEmailLogKeys()

		const response = await email.send({
			from: 'sender@example.com',
			to: 'recipient@example.com',
			subject: 'Hello from devflare',
			body: 'This is a test email sent via the email helper.'
		})

		expect(response.ok).toBe(true)

		const loggedEmail = await getLoggedEmail(beforeKeys)
		expect(loggedEmail.from).toBe('sender@example.com')
		expect(loggedEmail.to).toBe('recipient@example.com')
		expect(loggedEmail.subject).toBe('Hello from devflare')
		expect(loggedEmail.bodyPreview).toContain('This is a test email')

		const sentEmails = email.getSentEmails()
		expect(sentEmails).toHaveLength(2)
		expect(sentEmails.some((msg) => msg.type === 'reply' && msg.to === 'sender@example.com')).toBe(true)
		expect(sentEmails.some((msg) => msg.type === 'forward' && msg.to === 'admin@example.com')).toBe(true)
	})

	test('email.send() accepts raw email content and still reaches the handler', async () => {
		const beforeKeys = await listEmailLogKeys()
		const rawEmail = [
			'From: raw@example.com',
			'To: recipient@example.com',
			'Subject: Raw Email Test',
			'Date: ' + new Date().toUTCString(),
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=UTF-8',
			'',
			'This is raw email content.'
		].join('\r\n')

		const response = await email.send({
			from: 'raw@example.com',
			to: 'recipient@example.com',
			raw: rawEmail
		})

		expect(response.ok).toBe(true)

		const loggedEmail = await getLoggedEmail(beforeKeys)
		expect(loggedEmail.from).toBe('raw@example.com')
		expect(loggedEmail.subject).toBe('Raw Email Test')
	})
})

// -----------------------------------------------------------------------------
// Email Listener Tests
// -----------------------------------------------------------------------------

describe('Email Listeners', () => {
	test('onReceive() observes outgoing reply/forward emails', async () => {
		const received: ReceivedEmail[] = []

		const unsubscribe = email.onReceive((msg) => {
			received.push(msg)
		})

		await email.send({
			from: 'listener@example.com',
			to: 'recipient@example.com',
			subject: 'Listener test',
			body: 'Trigger outgoing email observers'
		})

		unsubscribe()

		expect(received).toHaveLength(2)
		expect(received.some((msg) => msg.type === 'reply')).toBe(true)
		expect(received.some((msg) => msg.type === 'forward')).toBe(true)
	})

	test('should clear sent emails history', () => {
		email.onReceive(() => { })()
		email.clearSentEmails()
		const sentEmails = email.getSentEmails()
		expect(sentEmails.length).toBe(0)
	})
})

// -----------------------------------------------------------------------------
// KV Integration Tests (requires proper binding configuration)
// -----------------------------------------------------------------------------

describe('KV Integration', () => {
	test('should have EMAIL_LOG KV namespace available', () => {
		expect(env.EMAIL_LOG).toBeDefined()
	})
})

// -----------------------------------------------------------------------------
// Vars Tests
// -----------------------------------------------------------------------------

describe('Environment Variables', () => {
	test('should have FORWARD_ADDRESS var available', () => {
		expect(env.FORWARD_ADDRESS).toBe('admin@example.com')
	})
})

