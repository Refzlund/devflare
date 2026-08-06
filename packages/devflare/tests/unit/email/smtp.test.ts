import { afterEach, describe, expect, test } from 'bun:test'
import { type Server, connect, createServer } from 'node:net'
import { parseSmtpUrl, sendSmtpMessage } from '../../../src/email/smtp'

/** One SMTP conversation, as the fake server saw it. */
interface Transcript {
	/** Every command line the client sent, in order. */
	commands: string[]
	/** The DATA payload, without its terminating dot. */
	data: string
}

let server: Server | null = null

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server?.close(() => resolve()))
		server = null
	}
})

/**
 * Start a fake SMTP server that records the conversation.
 *
 * @param options.capabilities - EHLO continuation lines, e.g. `AUTH LOGIN`.
 * @param options.rejectRecipient - Address to answer `RCPT TO` with `550`.
 * @returns The port it listens on and the transcript it fills in.
 */
async function startFakeSmtp(
	options: { capabilities?: string[]; rejectRecipient?: string } = {}
): Promise<{ port: number; transcript: Transcript }> {
	const transcript: Transcript = { commands: [], data: '' }

	server = createServer((socket) => {
		let buffer = ''
		let inData = false

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
						socket.write('250 2.0.0 Ok: queued as FAKE123\r\n')
						continue
					}
					transcript.data += `${line}\r\n`
					continue
				}

				transcript.commands.push(line)

				if (line.startsWith('EHLO')) {
					const capabilities = options.capabilities ?? ['AUTH PLAIN LOGIN']
					for (const capability of capabilities) {
						socket.write(`250-${capability}\r\n`)
					}
					socket.write('250 SIZE 5242880\r\n')
				} else if (line.startsWith('AUTH LOGIN')) {
					socket.write('334 VXNlcm5hbWU6\r\n')
				} else if (line.startsWith('AUTH PLAIN')) {
					socket.write('235 2.7.0 Authentication successful\r\n')
				} else if (line.startsWith('MAIL FROM')) {
					socket.write('250 2.1.0 Ok\r\n')
				} else if (line.startsWith('RCPT TO')) {
					socket.write(
						options.rejectRecipient && line.includes(options.rejectRecipient)
							? '550 5.1.1 No such user\r\n'
							: '250 2.1.5 Ok\r\n'
					)
				} else if (line === 'DATA') {
					inData = true
					socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
				} else if (line === 'QUIT') {
					socket.write('221 2.0.0 Bye\r\n')
					socket.end()
				} else if (/^(?:[A-Za-z0-9+/=]+)$/.test(line)) {
					// A base64 line from the AUTH LOGIN exchange.
					socket.write(
						transcript.commands.filter((entry) => /^[A-Za-z0-9+/=]+$/.test(entry)).length >= 2
							? '235 2.7.0 Authentication successful\r\n'
							: '334 UGFzc3dvcmQ6\r\n'
					)
				} else {
					socket.write('502 5.5.2 Not implemented\r\n')
				}
			}
		})
	})

	const port = await new Promise<number>((resolve, reject) => {
		server?.once('error', reject)
		server?.listen(0, '127.0.0.1', () => {
			const address = server?.address()
			if (address && typeof address !== 'string') {
				resolve(address.port)
			} else {
				reject(new Error('fake SMTP server did not report a port'))
			}
		})
	})

	return { port, transcript }
}

/** Plain-TCP socket factory, standing in for the implicit-TLS connector. */
function plainSocket(): Parameters<typeof sendSmtpMessage>[2] {
	return (endpoint) =>
		new Promise((resolve, reject) => {
			const socket = connect(endpoint.port, endpoint.host, () => resolve(socket))
			socket.once('error', reject)
		})
}

describe('parseSmtpUrl', () => {
	test('reads host, port, and percent-decoded credentials', () => {
		expect(parseSmtpUrl('smtps://api%40key:p%40ss%2Fword@smtp.example.com:2465', true)).toEqual({
			host: 'smtp.example.com',
			port: 2465,
			username: 'api@key',
			password: 'p@ss/word',
			rejectUnauthorized: true
		})
	})

	test('defaults to the implicit-TLS submission port', () => {
		expect(parseSmtpUrl('smtps://smtp.example.com', true).port).toBe(465)
	})

	test('refuses a scheme that is not SMTP', () => {
		expect(() => parseSmtpUrl('https://smtp.example.com', true)).toThrow('Unsupported SMTP scheme')
	})

	test('refuses a malformed URL rather than half-parsing it', () => {
		expect(() => parseSmtpUrl('not a url', true)).toThrow('Invalid SMTP URL')
	})
})

describe('sendSmtpMessage', () => {
	test('runs a complete submission and returns the accepted recipients', async () => {
		const { port, transcript } = await startFakeSmtp()

		const result = await sendSmtpMessage(
			{ host: '127.0.0.1', port, username: 'user', password: 'pass', rejectUnauthorized: false },
			{
				from: 'a@example.com',
				to: ['dev-inbox@example.com'],
				raw: 'Subject: Hi\r\n\r\nbody'
			},
			plainSocket()
		)

		expect(result.accepted).toEqual(['dev-inbox@example.com'])
		expect(result.response).toContain('queued as FAKE123')

		expect(transcript.commands[0]).toBe('EHLO devflare.local')
		expect(transcript.commands).toContain('MAIL FROM:<a@example.com>')
		expect(transcript.commands).toContain('RCPT TO:<dev-inbox@example.com>')
		expect(transcript.commands).toContain('DATA')
		expect(transcript.data).toContain('Subject: Hi')
		expect(transcript.data).toContain('body')
	})

	test('authenticates with AUTH PLAIN using the SASL frame', async () => {
		const { port, transcript } = await startFakeSmtp()

		await sendSmtpMessage(
			{ host: '127.0.0.1', port, username: 'user', password: 'pass', rejectUnauthorized: false },
			{ from: 'a@example.com', to: ['b@example.com'], raw: 'Subject: s\r\n\r\nb' },
			plainSocket()
		)

		const auth = transcript.commands.find((line) => line.startsWith('AUTH PLAIN '))
		expect(auth).toBeDefined()
		expect(Buffer.from(auth?.slice('AUTH PLAIN '.length) ?? '', 'base64').toString()).toBe(
			'\0user\0pass'
		)
	})

	test('falls back to AUTH LOGIN when PLAIN is not advertised', async () => {
		const { port, transcript } = await startFakeSmtp({ capabilities: ['AUTH LOGIN'] })

		await sendSmtpMessage(
			{ host: '127.0.0.1', port, username: 'user', password: 'pass', rejectUnauthorized: false },
			{ from: 'a@example.com', to: ['b@example.com'], raw: 'Subject: s\r\n\r\nb' },
			plainSocket()
		)

		expect(transcript.commands).toContain('AUTH LOGIN')
		expect(transcript.commands).toContain(Buffer.from('user').toString('base64'))
		expect(transcript.commands).toContain(Buffer.from('pass').toString('base64'))
	})

	test('skips authentication entirely when no credentials are configured', async () => {
		const { port, transcript } = await startFakeSmtp()

		await sendSmtpMessage(
			{ host: '127.0.0.1', port, rejectUnauthorized: false },
			{ from: 'a@example.com', to: ['b@example.com'], raw: 'Subject: s\r\n\r\nb' },
			plainSocket()
		)

		expect(transcript.commands.some((line) => line.startsWith('AUTH'))).toBe(false)
	})

	test('dot-stuffs a body line that would otherwise end the message early', async () => {
		const { port, transcript } = await startFakeSmtp()

		await sendSmtpMessage(
			{ host: '127.0.0.1', port, rejectUnauthorized: false },
			{
				from: 'a@example.com',
				to: ['b@example.com'],
				raw: 'Subject: s\r\n\r\nline one\r\n.\r\nline two'
			},
			plainSocket()
		)

		// The server un-stuffs nothing, so it sees the doubled dot; what matters
		// is that the transaction did NOT stop at the lone dot.
		expect(transcript.data).toContain('..')
		expect(transcript.data).toContain('line two')
	})

	test('refuses an envelope address that could forge a command, before connecting', async () => {
		// No angle bracket needed: a bare CRLF already desynchronises the reply
		// stream, so `accepted` would stop describing what the server did.
		const { port, transcript } = await startFakeSmtp()

		await expect(
			sendSmtpMessage(
				{ host: '127.0.0.1', port, rejectUnauthorized: false },
				{
					from: 'a@example.com',
					to: ['pinned@example.com\r\nRCPT TO:victim@evil.com'],
					raw: 'Subject: s\r\n\r\nb'
				},
				plainSocket()
			)
		).rejects.toThrow('could forge a command')

		expect(transcript.commands).toEqual([])
	})

	test('a rejected recipient surfaces rather than being reported as sent', async () => {
		const { port } = await startFakeSmtp({ rejectRecipient: 'blocked@example.com' })

		await expect(
			sendSmtpMessage(
				{ host: '127.0.0.1', port, rejectUnauthorized: false },
				{ from: 'a@example.com', to: ['blocked@example.com'], raw: 'Subject: s\r\n\r\nb' },
				plainSocket()
			)
		).rejects.toThrow('SMTP server rejected the command')
	})
})
