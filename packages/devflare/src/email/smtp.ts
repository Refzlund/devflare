// =============================================================================
// SMTP client — implicit TLS submission from the host process
// =============================================================================
// Deliberately small: one message, one connection, no pooling, no pipelining.
// It exists so `devflare dev` can put a real message in a real inbox, not to be
// a mail transfer agent. Anything beyond that belongs to the SMTP provider.
//
// → KEY: implicit TLS only (`smtps:`, port 465). TLS from the first byte means
//   there is no cleartext window and no STARTTLS-stripping downgrade to guard
//   against, which is the whole reason not to support the alternative here.
// → GOTCHA: this MUST run in the host process. workerd has no raw sockets, so
//   the composed worker posts the message out to the dev server instead.
// =============================================================================

import type { Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

/** Where and how to submit a message. */
export interface SmtpEndpoint {
	/** SMTP server hostname. */
	host: string
	/** SMTP port. */
	port: number
	/** SASL username, when the server requires authentication. */
	username?: string
	/** SASL password. */
	password?: string
	/** Verify the server's certificate chain. */
	rejectUnauthorized: boolean
}

/** One message to submit. */
export interface SmtpMessage {
	/** Envelope sender for `MAIL FROM`. */
	from: string
	/** Envelope recipients for `RCPT TO`. */
	to: string[]
	/** The complete MIME document. */
	raw: string
}

/**
 * How the transport socket is opened.
 *
 * Exists so the protocol can be exercised against a local fake server without
 * a certificate authority; production always uses the TLS connector below, and
 * there is no configuration path that swaps it.
 */
export type SmtpSocketFactory = (endpoint: SmtpEndpoint) => Promise<Socket>

/** What the server said once the message was accepted. */
export interface SmtpDeliveryResult {
	/** The server's reply to the terminating dot, verbatim. */
	response: string
	/** Recipients the server accepted. */
	accepted: string[]
}

const SMTP_TIMEOUT_MS = 30_000

/**
 * Parse an SMTP endpoint URL.
 *
 * @param url - e.g. `smtps://user:pass@smtp.example.com:465`. Credentials are
 *   percent-decoded, so a password containing `@` or `/` survives the round trip.
 * @param rejectUnauthorized - Whether to verify the certificate chain.
 * @returns The parsed endpoint.
 * @throws When the scheme is not `smtps:`, or the host is missing.
 */
export function parseSmtpUrl(url: string, rejectUnauthorized: boolean): SmtpEndpoint {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		throw new Error(`Invalid SMTP URL: ${url}`)
	}

	if (parsed.protocol !== 'smtps:') {
		throw new Error(
			`Unsupported SMTP scheme "${parsed.protocol}" — Devflare relays over implicit TLS only, so the URL must start with smtps://`
		)
	}

	if (!parsed.hostname) {
		throw new Error(`SMTP URL is missing a host: ${url}`)
	}

	return {
		host: parsed.hostname,
		port: parsed.port ? Number(parsed.port) : 465,
		...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
		...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
		rejectUnauthorized
	}
}

/**
 * A line-buffered view of one SMTP connection.
 *
 * SMTP replies arrive as `NNN-continued` lines terminated by a single
 * `NNN final`, and TCP is free to split them anywhere, so responses are
 * assembled here rather than read per-chunk at the call sites.
 */
class SmtpConnection {
	private buffer = ''
	private pending: ((line: string) => void) | null = null
	private failure: Error | null = null
	private closed = false

	constructor(private readonly socket: Socket) {
		socket.setEncoding('utf8')
		socket.on('data', (chunk: string) => this.consume(chunk))
		socket.on('error', (error: Error) => this.fail(error))
		socket.on('close', () => {
			this.closed = true
			this.fail(new Error('SMTP connection closed unexpectedly'))
		})
	}

	private consume(chunk: string): void {
		this.buffer += chunk
		this.drain()
	}

	private drain(): void {
		while (this.pending) {
			const index = this.buffer.indexOf('\r\n')
			if (index === -1) {
				return
			}

			const line = this.buffer.slice(0, index)
			this.buffer = this.buffer.slice(index + 2)
			const resolve = this.pending
			this.pending = null
			resolve(line)
		}
	}

	private fail(error: Error): void {
		this.failure = error
		const resolve = this.pending
		this.pending = null
		// A waiter resolves with a sentinel the reader turns back into the real
		// error; rejecting here would race the `close` that follows `error`.
		resolve?.('')
	}

	private readLine(): Promise<string> {
		if (this.failure) {
			throw this.failure
		}

		return new Promise<string>((resolve) => {
			this.pending = resolve
			this.drain()
		})
	}

	/**
	 * Read one complete reply, following continuation lines.
	 *
	 * @param expected - Status codes that mean success.
	 * @returns The full reply text, newline-joined.
	 * @throws When the server replies with any other code, or the connection dies.
	 */
	async expect(expected: number[]): Promise<string> {
		const lines: string[] = []

		for (;;) {
			const line = await this.readLine()
			if (this.failure) {
				throw this.failure
			}

			lines.push(line)
			// `250-EXTENSION` continues; `250 OK` terminates.
			if (line.charAt(3) !== '-') {
				break
			}
		}

		const reply = lines.join('\n')
		const code = Number(reply.slice(0, 3))

		if (!expected.includes(code)) {
			throw new Error(`SMTP server rejected the command: ${reply}`)
		}

		return reply
	}

	/** Write one command line. */
	write(command: string): void {
		if (this.closed) {
			throw new Error('SMTP connection closed unexpectedly')
		}
		this.socket.write(`${command}\r\n`)
	}

	/** Write a pre-terminated payload (the DATA body). */
	writeRaw(payload: string): void {
		if (this.closed) {
			throw new Error('SMTP connection closed unexpectedly')
		}
		this.socket.write(payload)
	}

	/**
	 * Close the socket, letting a pending QUIT flush first.
	 *
	 * `end()` half-closes after the write queue drains; destroying immediately
	 * would discard the QUIT. The timer is the backstop for a server that never
	 * closes its side, and is unref'd so it cannot hold the process open.
	 */
	end(): void {
		this.socket.removeAllListeners('close')
		this.socket.end()

		const reaper = setTimeout(() => this.socket.destroy(), 1000)
		reaper.unref?.()
		this.socket.once('close', () => clearTimeout(reaper))
	}
}

/**
 * Dot-stuff a MIME document for the DATA command.
 *
 * A body line starting with `.` would otherwise be read as the end-of-data
 * marker and truncate the message.
 */
function encodeDataPayload(raw: string): string {
	const normalized = raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
	const stuffed = normalized.replace(/(^|\r\n)\./g, '$1..')
	// A document that already ends in CRLF must not gain a blank line.
	return stuffed.endsWith('\r\n') ? `${stuffed}.\r\n` : `${stuffed}\r\n.\r\n`
}

/**
 * Refuse an envelope address that could forge an SMTP command.
 *
 * The envelope values are written straight into `MAIL FROM:`/`RCPT TO:`. A CR
 * or LF desynchronises the reply stream and can smuggle an extra recipient
 * past the relay's pin; `<`/`>` break the bracketed form. Upstream already
 * strips CR/LF when composing, so reaching this throw means something bypassed
 * the composer — which is exactly when failing loudly matters.
 *
 * @param label - Which envelope field is being checked, for the message.
 * @param address - The address about to be written.
 * @throws When the address contains a character that could end the command.
 */
function assertEnvelopeAddress(label: string, address: string): void {
	if (/[\r\n<>]/.test(address)) {
		throw new Error(
			`Refusing to send: SMTP ${label} address contains a character that could forge a command (${JSON.stringify(address)})`
		)
	}
}

/** Open an implicit-TLS connection — the only factory production uses. */
export function openSmtpTlsSocket(endpoint: SmtpEndpoint): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = tlsConnect(
			{
				host: endpoint.host,
				port: endpoint.port,
				servername: endpoint.host,
				rejectUnauthorized: endpoint.rejectUnauthorized
			},
			() => resolve(socket)
		)

		socket.setTimeout(SMTP_TIMEOUT_MS, () => {
			socket.destroy(new Error(`SMTP connection to ${endpoint.host} timed out`))
		})
		socket.once('error', reject)
	})
}

/**
 * Authenticate, preferring `AUTH PLAIN` and falling back to `AUTH LOGIN`.
 *
 * @param connection - An SMTP connection that has completed EHLO.
 * @param endpoint - Credentials to present.
 * @param capabilities - The EHLO reply, scanned for advertised mechanisms.
 */
async function authenticate(
	connection: SmtpConnection,
	endpoint: SmtpEndpoint,
	capabilities: string
): Promise<void> {
	if (!endpoint.username || !endpoint.password) {
		return
	}

	// Match on the AUTH line only: an unrelated capability whose name happens to
	// contain PLAIN would otherwise select a mechanism the server never offered.
	const authLine =
		capabilities
			.toUpperCase()
			.split(/\r?\n/)
			.find((line) => /^\d{3}[- ]AUTH\b/.test(line)) ?? ''
	const advertised = authLine.replace(/^\d{3}[- ]AUTH/, '')

	if (!authLine || /\bPLAIN\b/.test(advertised)) {
		const token = Buffer.from(`\0${endpoint.username}\0${endpoint.password}`, 'utf8').toString(
			'base64'
		)
		connection.write(`AUTH PLAIN ${token}`)
		await connection.expect([235])
		return
	}

	if (/\bLOGIN\b/.test(advertised)) {
		connection.write('AUTH LOGIN')
		await connection.expect([334])
		connection.write(Buffer.from(endpoint.username, 'utf8').toString('base64'))
		await connection.expect([334])
		connection.write(Buffer.from(endpoint.password, 'utf8').toString('base64'))
		await connection.expect([235])
		return
	}

	throw new Error(
		`SMTP server ${endpoint.host} advertises no supported AUTH mechanism (PLAIN or LOGIN): ${capabilities}`
	)
}

/**
 * Submit one message over implicit TLS.
 *
 * @param endpoint - Server, port, and credentials.
 * @param message - Envelope plus the MIME document to send.
 * @param connect - Socket factory. Defaults to implicit TLS; overridden only by
 *   Devflare's own protocol tests.
 * @returns The server's final reply and the accepted recipients.
 * @throws On connection failure, authentication failure, or any rejecting
 *   status code. A relay that quietly dropped a message would be worse than one
 *   that never ran.
 */
export async function sendSmtpMessage(
	endpoint: SmtpEndpoint,
	message: SmtpMessage,
	connect: SmtpSocketFactory = openSmtpTlsSocket
): Promise<SmtpDeliveryResult> {
	// Validated before a socket exists: a refused message must not leave a
	// half-finished transaction on a server that already processed part of it.
	assertEnvelopeAddress('MAIL FROM', message.from)
	for (const recipient of message.to) {
		assertEnvelopeAddress('RCPT TO', recipient)
	}

	const socket = await connect(endpoint)
	const connection = new SmtpConnection(socket)

	try {
		await connection.expect([220])

		connection.write('EHLO devflare.local')
		const capabilities = await connection.expect([250])

		await authenticate(connection, endpoint, capabilities)

		connection.write(`MAIL FROM:<${message.from}>`)
		await connection.expect([250])

		const accepted: string[] = []
		for (const recipient of message.to) {
			connection.write(`RCPT TO:<${recipient}>`)
			await connection.expect([250, 251])
			accepted.push(recipient)
		}

		connection.write('DATA')
		await connection.expect([354])

		connection.writeRaw(encodeDataPayload(message.raw))
		const response = await connection.expect([250])

		connection.write('QUIT')

		return { response, accepted }
	} finally {
		connection.end()
	}
}
