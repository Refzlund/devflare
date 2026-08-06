import { afterEach, describe, expect, test } from 'bun:test'
import { type Server, connect, createServer } from 'node:net'
import { fetchImapMessages, parseImapUrl } from '../../../src/email/imap-client'

let server: Server | null = null

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server?.close(() => resolve()))
		server = null
	}
})

/** A message the fake mailbox holds. */
interface FakeMessage {
	uid: number
	raw: string
}

/**
 * Start a fake IMAP server holding a fixed set of unseen messages.
 *
 * @param messages - What `UID SEARCH UNSEEN` returns, in mailbox order.
 * @returns The port, and the commands the client issued.
 */
async function startFakeImap(
	messages: FakeMessage[]
): Promise<{ port: number; commands: string[] }> {
	const commands: string[] = []

	server = createServer((socket) => {
		let buffer = ''
		socket.setEncoding('utf8')
		socket.write('* OK fake.devflare.local IMAP4rev1 ready\r\n')

		socket.on('data', (chunk: string) => {
			buffer += chunk

			for (;;) {
				const index = buffer.indexOf('\r\n')
				if (index === -1) {
					return
				}

				const line = buffer.slice(0, index)
				buffer = buffer.slice(index + 2)
				commands.push(line)

				const [tag, ...rest] = line.split(' ')
				const command = rest.join(' ')

				if (/^LOGIN /i.test(command)) {
					socket.write(`${tag} OK LOGIN completed\r\n`)
				} else if (/^SELECT /i.test(command)) {
					socket.write(`* ${messages.length} EXISTS\r\n`)
					socket.write(`${tag} OK [READ-WRITE] SELECT completed\r\n`)
				} else if (/^UID SEARCH /i.test(command)) {
					socket.write(`* SEARCH ${messages.map((message) => message.uid).join(' ')}\r\n`)
					socket.write(`${tag} OK SEARCH completed\r\n`)
				} else if (/^UID FETCH /i.test(command)) {
					const uid = Number(command.split(' ')[2])
					const message = messages.find((candidate) => candidate.uid === uid)
					if (message) {
						socket.write(`* 1 FETCH (UID ${uid} BODY[] {${message.raw.length}}\r\n`)
						socket.write(message.raw)
						socket.write(')\r\n')
					}
					socket.write(`${tag} OK FETCH completed\r\n`)
				} else if (/^UID STORE /i.test(command)) {
					socket.write(`${tag} OK STORE completed\r\n`)
				} else {
					socket.write(`${tag} BAD Unknown command\r\n`)
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
				reject(new Error('fake IMAP server did not report a port'))
			}
		})
	})

	return { port, commands }
}

/** Plain-TCP socket factory, standing in for the implicit-TLS connector. */
function plainSocket(): Parameters<typeof fetchImapMessages>[2] {
	return (endpoint) =>
		new Promise((resolve, reject) => {
			const socket = connect(endpoint.port, endpoint.host, () => resolve(socket))
			socket.once('error', reject)
		})
}

const message = (uid: number, subject: string, extraHeader = ''): FakeMessage => ({
	uid,
	raw: [
		'From: sender@customer.com',
		'To: support@example.com',
		`Subject: ${subject}`,
		...(extraHeader ? [extraHeader] : []),
		'',
		`body of ${subject}`
	].join('\r\n')
})

describe('parseImapUrl', () => {
	test('reads host, port, and percent-decoded credentials', () => {
		expect(parseImapUrl('imaps://dev%40example.com:p%40ss@imap.example.com:1993', true)).toEqual({
			host: 'imap.example.com',
			port: 1993,
			username: 'dev@example.com',
			password: 'p@ss',
			rejectUnauthorized: true
		})
	})

	test('defaults to the implicit-TLS IMAP port', () => {
		expect(parseImapUrl('imaps://u:p@imap.example.com', true).port).toBe(993)
	})

	test('refuses a URL with no credentials', () => {
		expect(() => parseImapUrl('imaps://imap.example.com', true)).toThrow('missing credentials')
	})

	test('refuses a scheme that is not IMAP', () => {
		expect(() => parseImapUrl('https://imap.example.com', true)).toThrow('Unsupported IMAP scheme')
	})
})

describe('fetchImapMessages', () => {
	test('reads every unseen message and marks it read', async () => {
		const { port, commands } = await startFakeImap([message(11, 'first'), message(12, 'second')])

		const messages = await fetchImapMessages(
			{ host: '127.0.0.1', port, username: 'u', password: 'p', rejectUnauthorized: false },
			{ mailbox: 'INBOX', search: 'UNSEEN', markSeen: true },
			plainSocket()
		)

		expect(messages.map((entry) => entry.uid)).toEqual([11, 12])
		expect(messages[0].raw).toContain('Subject: first')
		expect(messages[1].raw).toContain('body of second')

		expect(commands.some((line) => line.includes('UID SEARCH UNSEEN'))).toBe(true)
		expect(commands.some((line) => line.includes('UID STORE 11 +FLAGS (\\Seen)'))).toBe(true)
		expect(commands.some((line) => line.includes('UID STORE 12 +FLAGS (\\Seen)'))).toBe(true)
	})

	test('leaves messages unread when markSeen is off', async () => {
		const { port, commands } = await startFakeImap([message(11, 'first')])

		await fetchImapMessages(
			{ host: '127.0.0.1', port, username: 'u', password: 'p', rejectUnauthorized: false },
			{ mailbox: 'INBOX', search: 'UNSEEN', markSeen: false },
			plainSocket()
		)

		expect(commands.some((line) => line.includes('UID STORE'))).toBe(false)
	})

	test('skips UIDs an earlier pass already handled', async () => {
		const { port } = await startFakeImap([message(11, 'first'), message(12, 'second')])

		const messages = await fetchImapMessages(
			{ host: '127.0.0.1', port, username: 'u', password: 'p', rejectUnauthorized: false },
			{ mailbox: 'INBOX', search: 'UNSEEN', markSeen: false, skipUids: new Set([11]) },
			plainSocket()
		)

		expect(messages.map((entry) => entry.uid)).toEqual([12])
	})

	test('a body containing a tagged-completion lookalike does not truncate the read', async () => {
		// Literal framing is byte-counted; matching `<tag> OK` anywhere in the
		// stream would read this body as the end of the FETCH.
		const decoy = {
			uid: 20,
			raw: ['From: a@b.c', 'To: d@e.f', 'Subject: decoy', '', 'd3 OK not really', 'tail'].join(
				'\r\n'
			)
		}
		const { port } = await startFakeImap([decoy])

		const messages = await fetchImapMessages(
			{ host: '127.0.0.1', port, username: 'u', password: 'p', rejectUnauthorized: false },
			{ mailbox: 'INBOX', search: 'UNSEEN', markSeen: false },
			plainSocket()
		)

		expect(messages).toHaveLength(1)
		expect(messages[0].raw).toBe(decoy.raw)
		expect(messages[0].raw).toContain('tail')
	})

	test('quotes a mailbox name that contains a space', async () => {
		const { port, commands } = await startFakeImap([])

		await fetchImapMessages(
			{ host: '127.0.0.1', port, username: 'u', password: 'p', rejectUnauthorized: false },
			{ mailbox: 'INBOX/Customer Support', search: 'UNSEEN', markSeen: false },
			plainSocket()
		)

		expect(commands.some((line) => line.includes('SELECT "INBOX/Customer Support"'))).toBe(true)
	})

	test('a failed login surfaces rather than returning an empty mailbox', async () => {
		server = createServer((socket) => {
			socket.setEncoding('utf8')
			socket.write('* OK ready\r\n')
			socket.on('data', (chunk: string) => {
				const tag = chunk.split(' ')[0]
				socket.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`)
			})
		})

		const port = await new Promise<number>((resolve) => {
			server?.listen(0, '127.0.0.1', () => {
				const address = server?.address()
				resolve(address && typeof address !== 'string' ? address.port : 0)
			})
		})

		await expect(
			fetchImapMessages(
				{ host: '127.0.0.1', port, username: 'u', password: 'bad', rejectUnauthorized: false },
				{ mailbox: 'INBOX', search: 'UNSEEN', markSeen: false },
				plainSocket()
			)
		).rejects.toThrow('IMAP command failed')
	})
})
