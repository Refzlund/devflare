import { afterEach, describe, expect, test } from 'bun:test'
import { type Server as HttpServer, createServer as createHttpServer } from 'node:http'
import { type Server, connect, createServer } from 'node:net'
import {
	INBOUND_EMAIL_PATH,
	readEnvelopeRecipient,
	readEnvelopeSender,
	shouldSkipInboundMessage
} from '../../../src/email/inbound'
import { runInboundPoll } from '../../../src/email/inbound-poller'
import { applyRecipientPin } from '../../../src/email/relay'
import { DEFAULT_RELAY_HEADER } from '../../../src/email/runtime-config'
import { buildEmailMessage } from '../../../src/utils/email-message'

let imapServer: Server | null = null
let runtimeServer: HttpServer | null = null

afterEach(async () => {
	if (imapServer) {
		await new Promise<void>((resolve) => imapServer?.close(() => resolve()))
		imapServer = null
	}
	if (runtimeServer) {
		await new Promise<void>((resolve) => runtimeServer?.close(() => resolve()))
		runtimeServer = null
	}
})

/** What the fake local runtime was handed. */
interface DeliveredEmail {
	from: string
	to: string
	raw: string
}

/** Start a fake IMAP server serving a fixed mailbox. */
async function startFakeImap(messages: Array<{ uid: number; raw: string }>): Promise<number> {
	imapServer = createServer((socket) => {
		let buffer = ''
		socket.setEncoding('utf8')
		socket.write('* OK ready\r\n')

		socket.on('data', (chunk: string) => {
			buffer += chunk
			for (;;) {
				const index = buffer.indexOf('\r\n')
				if (index === -1) {
					return
				}
				const line = buffer.slice(0, index)
				buffer = buffer.slice(index + 2)
				const [tag, ...rest] = line.split(' ')
				const command = rest.join(' ')

				if (/^UID SEARCH /i.test(command)) {
					socket.write(`* SEARCH ${messages.map((entry) => entry.uid).join(' ')}\r\n`)
					socket.write(`${tag} OK done\r\n`)
				} else if (/^UID FETCH /i.test(command)) {
					const uid = Number(command.split(' ')[2])
					const found = messages.find((entry) => entry.uid === uid)
					if (found) {
						socket.write(`* 1 FETCH (UID ${uid} BODY[] {${found.raw.length}}\r\n`)
						socket.write(found.raw)
						socket.write(')\r\n')
					}
					socket.write(`${tag} OK done\r\n`)
				} else {
					socket.write(`${tag} OK done\r\n`)
				}
			}
		})
	})

	return new Promise<number>((resolve) => {
		imapServer?.listen(0, '127.0.0.1', () => {
			const address = imapServer?.address()
			resolve(address && typeof address !== 'string' ? address.port : 0)
		})
	})
}

/** Start a fake local runtime that records what the poller delivered. */
async function startFakeRuntime(delivered: DeliveredEmail[]): Promise<string> {
	runtimeServer = createHttpServer((request, response) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1')
		let body = ''
		request.setEncoding('utf8')
		request.on('data', (chunk: string) => {
			body += chunk
		})
		request.on('end', () => {
			if (url.pathname === INBOUND_EMAIL_PATH) {
				delivered.push({
					from: url.searchParams.get('from') ?? '',
					to: url.searchParams.get('to') ?? '',
					raw: body
				})
				response.writeHead(200, { 'content-type': 'application/json' })
				response.end(JSON.stringify({ ok: true }))
				return
			}
			response.writeHead(404)
			response.end()
		})
	})

	return new Promise<string>((resolve) => {
		runtimeServer?.listen(0, '127.0.0.1', () => {
			const address = runtimeServer?.address()
			resolve(`http://127.0.0.1:${address && typeof address !== 'string' ? address.port : 0}`)
		})
	})
}

/** Plain-TCP socket factory, standing in for the implicit-TLS connector. */
const plainSocket = (endpoint: { host: string; port: number }) =>
	new Promise<import('node:net').Socket>((resolve, reject) => {
		const socket = connect(endpoint.port, endpoint.host, () => resolve(socket))
		socket.once('error', reject)
	})

function inboundOptions(port: number, runtimeOrigin: string) {
	return {
		inbound: {
			url: `imaps://dev%40example.com:pass@127.0.0.1:${port}`,
			mailbox: 'INBOX',
			intervalMs: 15_000,
			markSeen: false,
			skipHeaders: [DEFAULT_RELAY_HEADER]
		},
		runtimeOrigin,
		rejectUnauthorized: false
	}
}

const customerMail = [
	'From: "Jo" <jo@customer.com>',
	'To: support@example.com',
	'Subject: Help please',
	'',
	'my thing is broken'
].join('\r\n')

describe('envelope extraction', () => {
	test('reads the sender and recipient out of the document', () => {
		expect(readEnvelopeSender(customerMail)).toBe('jo@customer.com')
		expect(readEnvelopeRecipient(customerMail)).toBe('support@example.com')
	})

	test('prefers Delivered-To, which survives forwarding', () => {
		const forwarded = `Delivered-To: routed@example.com\r\n${customerMail}`
		expect(readEnvelopeRecipient(forwarded)).toBe('routed@example.com')
	})
})

describe('relay loop guard', () => {
	test('a message the relay sent carries the marker and is skipped', () => {
		const built = buildEmailMessage({
			from: 'noreply@example.com',
			to: 'real-user@customer.com',
			subject: 'Ticket received',
			text: 'auto-reply'
		})

		const pinned = applyRecipientPin(
			{
				binding: 'MAILER',
				message: built.message,
				raw: built.raw,
				size: built.size,
				messageId: built.message.messageId
			},
			{
				url: 'smtps://h:465',
				to: 'dev-inbox@example.com',
				header: DEFAULT_RELAY_HEADER,
				rejectUnauthorized: true
			}
		)

		expect(shouldSkipInboundMessage(pinned.raw, [DEFAULT_RELAY_HEADER])).toBe(true)
		expect(shouldSkipInboundMessage(customerMail, [DEFAULT_RELAY_HEADER])).toBe(false)
	})
})

describe('runInboundPoll', () => {
	test('delivers real mail to the local runtime', async () => {
		const delivered: DeliveredEmail[] = []
		const origin = await startFakeRuntime(delivered)
		const port = await startFakeImap([{ uid: 1, raw: customerMail }])

		const result = await runInboundPoll(
			{ ...inboundOptions(port, origin), connect: plainSocket },
			new Set()
		)

		expect(result).toEqual({ fetched: 1, skipped: 0, delivered: 1 })
		expect(delivered).toHaveLength(1)
		expect(delivered[0].from).toBe('jo@customer.com')
		expect(delivered[0].to).toBe('support@example.com')
		expect(delivered[0].raw).toContain('my thing is broken')
	})

	test('refuses to feed a relayed message back into the worker', async () => {
		// Outbound pin and inbound poller usually share one mailbox. Without this
		// skip, every locally sent message is re-ingested, a support flow
		// auto-replies to it, and the loop never terminates.
		const delivered: DeliveredEmail[] = []
		const origin = await startFakeRuntime(delivered)
		const relayed = `${DEFAULT_RELAY_HEADER}: 1\r\n${customerMail}`
		const port = await startFakeImap([
			{ uid: 1, raw: relayed },
			{ uid: 2, raw: customerMail }
		])

		const result = await runInboundPoll(
			{ ...inboundOptions(port, origin), connect: plainSocket },
			new Set()
		)

		expect(result).toEqual({ fetched: 2, skipped: 1, delivered: 1 })
		expect(delivered).toHaveLength(1)
		expect(delivered[0].raw).not.toContain(DEFAULT_RELAY_HEADER)
	})

	test('does not replay a message an earlier pass already handled', async () => {
		const delivered: DeliveredEmail[] = []
		const origin = await startFakeRuntime(delivered)
		const port = await startFakeImap([{ uid: 1, raw: customerMail }])
		const handled = new Set<number>()

		await runInboundPoll({ ...inboundOptions(port, origin), connect: plainSocket }, handled)
		const second = await runInboundPoll(
			{ ...inboundOptions(port, origin), connect: plainSocket },
			handled
		)

		expect(second.delivered).toBe(0)
		expect(delivered).toHaveLength(1)
	})

	test('a configured recipient overrides what the document says', async () => {
		const delivered: DeliveredEmail[] = []
		const origin = await startFakeRuntime(delivered)
		const port = await startFakeImap([{ uid: 1, raw: customerMail }])
		const options = inboundOptions(port, origin)

		await runInboundPoll(
			{
				...options,
				inbound: { ...options.inbound, to: 'routed@example.com' },
				connect: plainSocket
			},
			new Set()
		)

		expect(delivered[0].to).toBe('routed@example.com')
	})

	test('a runtime that rejects the message fails the pass rather than losing it', async () => {
		runtimeServer = createHttpServer((_request, response) => {
			response.writeHead(500)
			response.end('boom')
		})
		const origin = await new Promise<string>((resolve) => {
			runtimeServer?.listen(0, '127.0.0.1', () => {
				const address = runtimeServer?.address()
				resolve(`http://127.0.0.1:${address && typeof address !== 'string' ? address.port : 0}`)
			})
		})
		const port = await startFakeImap([{ uid: 1, raw: customerMail }])

		await expect(
			runInboundPoll({ ...inboundOptions(port, origin), connect: plainSocket }, new Set())
		).rejects.toThrow('could not deliver inbound email')
	})
})
