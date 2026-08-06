// =============================================================================
// End-to-end relay — what the SMTP server was ACTUALLY asked to deliver
// =============================================================================
// The pin's unit tests assert on `applyRecipientPin()` in isolation, which
// cannot see whether the transmit path uses its result. These drive the whole
// path — `binding.send()` → sink → relay → SMTP — against a fake server that
// records the raw command stream, so the assertions are about what a real MTA
// would have received.
// =============================================================================

import { afterEach, describe, expect, test } from 'bun:test'
import { type Server, connect, createServer } from 'node:net'
import { createHostEmailDeliverySink } from '../../../src/email/host-sink'
import { getOutbox, resetOutbox } from '../../../src/email/outbox'
import type { ResolvedEmailRuntime } from '../../../src/email/runtime-config'
import type { SmtpSocketFactory } from '../../../src/email/smtp'
import { clearEmailDeliverySink, setEmailDeliverySink } from '../../../src/utils/email-delivery'
import { createLocalSendEmailBinding } from '../../../src/utils/send-email'

/** Everything the fake MTA was told, at the protocol level. */
interface Transcript {
	/** Every command line, in order, across every transaction on the connection. */
	commands: string[]
	/** Each completed `MAIL FROM` / `RCPT TO` / DATA transaction. */
	transactions: Array<{ from: string; rcpts: string[]; data: string }>
}

let server: Server | null = null

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server?.close(() => resolve()))
		server = null
	}
	clearEmailDeliverySink()
	resetOutbox()
})

/**
 * Start a permissive fake MTA.
 *
 * Deliberately lenient — it accepts a bracket-less `RCPT TO:` and starts a new
 * transaction on every `MAIL FROM` — because a strict server would mask a
 * command injection rather than reveal it.
 */
async function startFakeSmtp(): Promise<{ port: number; transcript: Transcript }> {
	const transcript: Transcript = { commands: [], transactions: [] }

	server = createServer((socket) => {
		let buffer = ''
		let inData = false
		let current: { from: string; rcpts: string[]; data: string } | null = null

		socket.setEncoding('utf8')
		socket.write('220 fake.devflare.local ESMTP\r\n')

		socket.on('data', (chunk: string) => {
			buffer += chunk

			for (;;) {
				const index = buffer.indexOf('\r\n')
				if (index === -1) {
					return
				}

				const line = buffer.slice(0, index)
				buffer = buffer.slice(index + 2)

				if (inData) {
					if (line === '.') {
						inData = false
						if (current) {
							transcript.transactions.push(current)
							current = null
						}
						socket.write('250 2.0.0 Ok: queued\r\n')
						continue
					}
					if (current) {
						current.data += `${line}\r\n`
					}
					continue
				}

				transcript.commands.push(line)

				if (line.startsWith('EHLO')) {
					socket.write('250-AUTH PLAIN LOGIN\r\n')
					socket.write('250 SIZE 5242880\r\n')
				} else if (line.startsWith('AUTH PLAIN')) {
					socket.write('235 2.7.0 Authentication successful\r\n')
				} else if (line.startsWith('MAIL FROM')) {
					current = { from: line.slice('MAIL FROM:'.length), rcpts: [], data: '' }
					socket.write('250 2.1.0 Ok\r\n')
				} else if (line.startsWith('RCPT TO')) {
					current?.rcpts.push(line.slice('RCPT TO:'.length))
					socket.write('250 2.1.5 Ok\r\n')
				} else if (line === 'DATA') {
					inData = true
					socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
				} else if (line === 'QUIT') {
					socket.write('221 2.0.0 Bye\r\n')
					socket.end()
				} else {
					socket.write('250 2.0.0 Ok\r\n')
				}
			}
		})
	})

	const port = await new Promise<number>((resolve) => {
		server?.listen(0, '127.0.0.1', () => {
			const address = server?.address()
			resolve(address && typeof address !== 'string' ? address.port : 0)
		})
	})

	return { port, transcript }
}

/** Plain-TCP socket factory, standing in for the implicit-TLS connector. */
const plainSocket: SmtpSocketFactory = (endpoint) =>
	new Promise((resolve, reject) => {
		const socket = connect(endpoint.port, endpoint.host, () => resolve(socket))
		socket.once('error', reject)
	})

function relayRuntime(port: number): ResolvedEmailRuntime {
	return {
		mode: 'relay',
		relay: {
			url: `smtps://user:pass@127.0.0.1:${port}`,
			to: 'dev-inbox@example.com',
			header: 'X-Devflare-Dev-Relay',
			rejectUnauthorized: false
		},
		inbound: null
	}
}

async function relaySend(port: number, message: unknown): Promise<void> {
	setEmailDeliverySink(createHostEmailDeliverySink(() => relayRuntime(port), plainSocket))
	const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })
	await binding.send(message as Parameters<SendEmail['send']>[0])
}

describe('relay transport', () => {
	test('the server is only ever asked to deliver to the pinned address', async () => {
		const { port, transcript } = await startFakeSmtp()

		await relaySend(port, {
			from: 'noreply@example.com',
			to: ['real-user@customer.com', 'second@customer.com'],
			cc: 'cc@customer.com',
			bcc: 'bcc@customer.com',
			subject: 'Your invoice',
			text: 'body'
		})

		expect(transcript.transactions).toHaveLength(1)
		expect(transcript.transactions[0].rcpts).toEqual(['<dev-inbox@example.com>'])
		expect(transcript.commands.filter((line) => line.startsWith('RCPT TO'))).toEqual([
			'RCPT TO:<dev-inbox@example.com>'
		])

		// The document the MTA received names nobody real in a deliverable field.
		const headerBlock = transcript.transactions[0].data.split('\r\n\r\n')[0]
		expect(headerBlock).toContain('To: dev-inbox@example.com')
		expect(headerBlock).not.toMatch(/^Cc:/m)
		expect(headerBlock).not.toMatch(/^Bcc:/m)
		expect(headerBlock).toContain('X-Devflare-Dev-Relay: 1')

		expect(getOutbox()[0].relayed).toBe(true)
		expect(getOutbox()[0].deliveredTo).toEqual(['dev-inbox@example.com'])
		// The outbox keeps what the worker ASKED for; the pin is a transport fact.
		expect(getOutbox()[0].message.to).toEqual(['real-user@customer.com', 'second@customer.com'])
	})

	test('a CRLF in `from` cannot smuggle a second recipient past the pin', async () => {
		// Envelope values are written straight into MAIL FROM / RCPT TO. Without a
		// guard, worker code closes the bracket and appends its own commands, and
		// a lenient MTA queues mail for a real customer while `accepted` still
		// reports only the pinned address.
		const { port, transcript } = await startFakeSmtp()
		const injected = [
			'attacker@example.com>',
			'RCPT TO:victim@real-customer.com',
			'DATA',
			'Subject: smuggled',
			'.',
			'MAIL FROM:throwaway@example.com'
		].join('\r\n')

		await expect(
			relaySend(port, {
				from: injected,
				to: 'someone@customer.com',
				subject: 'legit',
				text: 'body'
			})
		).rejects.toThrow('could forge a command')

		// Refused before a transaction was opened, so the server saw nothing.
		expect(transcript.transactions).toHaveLength(0)
		expect(transcript.commands.join('\n')).not.toContain('victim@real-customer.com')

		// Still recorded, so the developer can see what the worker attempted.
		expect(getOutbox()).toHaveLength(1)
		expect(getOutbox()[0].relayed).toBe(false)
	})

	test('a CRLF in `cc` cannot forge a live Bcc past the pin scrub', async () => {
		// The relay copies the original recipients into X-Devflare-Original-Cc. A
		// newline there would close that header and start a real one.
		const { port, transcript } = await startFakeSmtp()

		await relaySend(port, {
			from: 'noreply@example.com',
			to: 'someone@customer.com',
			cc: 'ops@example.com\r\nBcc: forged@real-customer.com',
			subject: 'legit',
			text: 'body'
		})

		const headerBlock = transcript.transactions[0].data.split('\r\n\r\n')[0]
		expect(headerBlock).not.toMatch(/^Bcc:/m)
		expect(transcript.transactions[0].rcpts).toEqual(['<dev-inbox@example.com>'])
	})

	test('a CRLFCRLF in `cc` cannot push the relay marker into the body', async () => {
		// Ending the header block early would leave the marker as body text, and
		// the inbound poller would stop recognising Devflare's own mail — which is
		// the shared pin-and-poll loop the marker exists to break.
		const { port, transcript } = await startFakeSmtp()

		await relaySend(port, {
			from: 'noreply@example.com',
			to: 'someone@customer.com',
			// Pre-place the header so the relay REPLACES it high in the block
			// rather than appending it after the marker.
			headers: { 'X-Devflare-Original-Cc': 'placeholder' },
			cc: 'ops@example.com\r\n\r\nnot a header',
			subject: 'legit',
			text: 'body'
		})

		const headerBlock = transcript.transactions[0].data.split('\r\n\r\n')[0]
		expect(headerBlock).toContain('X-Devflare-Dev-Relay: 1')
	})

	test('a relay failure reaches the worker and the message is still recorded', async () => {
		const { port } = await startFakeSmtp()
		await new Promise<void>((resolve) => server?.close(() => resolve()))
		server = null

		setEmailDeliverySink(createHostEmailDeliverySink(() => relayRuntime(port), plainSocket))
		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		await expect(
			binding.send({
				from: 'a@example.com',
				to: 'b@example.com',
				subject: 's',
				text: 't'
			} as Parameters<SendEmail['send']>[0])
		).rejects.toThrow()

		expect(getOutbox()).toHaveLength(1)
		expect(getOutbox()[0].relayed).toBe(false)
	})
})
