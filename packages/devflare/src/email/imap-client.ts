// =============================================================================
// IMAP client — implicit TLS, just enough to read a mailbox
// =============================================================================
// Fetch unseen messages and optionally mark them read. No IDLE, no partial
// fetches, no MIME parsing: the raw document is exactly what Email Routing
// would hand `src/email.ts`, so it is passed through untouched.
//
// → GOTCHA: a tagged completion is only accepted when it starts a line AND the
//   line was CRLF-terminated. Matching `<tag> OK` anywhere in the stream reads
//   message BODY text that happens to contain it as the end of the command, and
//   the failure is intermittent — it depends on where TCP split the buffer.
// → KEY: UIDs, not sequence numbers. A concurrent expunge renumbers sequences
//   mid-session, so a fetch could read a different message than the search found.
// =============================================================================

import type { Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

/** Where and how to reach a mailbox. */
export interface ImapEndpoint {
	/** IMAP server hostname. */
	host: string
	/** IMAP port. */
	port: number
	/** Account username. */
	username: string
	/** Account password (or app password). */
	password: string
	/** Verify the server's certificate chain. */
	rejectUnauthorized: boolean
}

/**
 * How the transport socket is opened.
 *
 * Exists so the protocol can be exercised against a local fake server without
 * a certificate authority; production always uses the TLS connector below.
 */
export type ImapSocketFactory = (endpoint: ImapEndpoint) => Promise<Socket>

/** One message read from a mailbox. */
export interface ImapMessage {
	/** The mailbox-unique id, stable across the session. */
	uid: number
	/** The complete MIME document. */
	raw: string
}

const IMAP_TIMEOUT_MS = 60_000

/**
 * Parse an IMAP endpoint URL.
 *
 * @param url - e.g. `imaps://user:pass@imap.example.com:993`. Credentials are
 *   percent-decoded, so an address-shaped username survives the round trip.
 * @param rejectUnauthorized - Whether to verify the certificate chain.
 * @returns The parsed endpoint.
 * @throws When the scheme is not `imaps:`, or host/credentials are missing.
 */
export function parseImapUrl(url: string, rejectUnauthorized: boolean): ImapEndpoint {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		throw new Error(`Invalid IMAP URL: ${url}`)
	}

	if (parsed.protocol !== 'imaps:') {
		throw new Error(
			`Unsupported IMAP scheme "${parsed.protocol}" — Devflare polls over implicit TLS only, so the URL must start with imaps://`
		)
	}

	if (!parsed.hostname) {
		throw new Error(`IMAP URL is missing a host: ${url}`)
	}

	if (!parsed.username || !parsed.password) {
		throw new Error(`IMAP URL is missing credentials: ${parsed.protocol}//…@${parsed.hostname}`)
	}

	return {
		host: parsed.hostname,
		port: parsed.port ? Number(parsed.port) : 993,
		username: decodeURIComponent(parsed.username),
		password: decodeURIComponent(parsed.password),
		rejectUnauthorized
	}
}

/** Wrap a value as an IMAP quoted string. */
function quote(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * A byte-accurate, line-buffered view of one IMAP connection.
 *
 * Reads are expressed as "one CRLF line" or "exactly N bytes" because IMAP
 * literals (`{1234}`) are byte-counted and may contain CRLF themselves.
 */
class ImapConnection {
	private buffer = Buffer.alloc(0)
	private waiter: { resolve: () => void } | null = null
	private failure: Error | null = null
	private tagCounter = 0

	constructor(private readonly socket: Socket) {
		socket.on('data', (chunk: Buffer) => {
			this.buffer = Buffer.concat([this.buffer, chunk])
			this.wake()
		})
		socket.on('error', (error: Error) => {
			this.failure = error
			this.wake()
		})
		socket.on('close', () => {
			this.failure ??= new Error('IMAP connection closed unexpectedly')
			this.wake()
		})
	}

	private wake(): void {
		const waiter = this.waiter
		this.waiter = null
		waiter?.resolve()
	}

	private waitForData(): Promise<void> {
		return new Promise((resolve) => {
			this.waiter = { resolve }
		})
	}

	/** Read one CRLF-terminated line, without its terminator. */
	async readLine(): Promise<string> {
		for (;;) {
			const index = this.buffer.indexOf('\r\n')
			if (index !== -1) {
				const line = this.buffer.subarray(0, index).toString('utf8')
				this.buffer = this.buffer.subarray(index + 2)
				return line
			}

			if (this.failure) {
				throw this.failure
			}

			await this.waitForData()
		}
	}

	/** Read exactly `length` bytes — an IMAP literal. */
	async readBytes(length: number): Promise<Buffer> {
		for (;;) {
			if (this.buffer.length >= length) {
				const bytes = this.buffer.subarray(0, length)
				this.buffer = this.buffer.subarray(length)
				return bytes
			}

			if (this.failure) {
				throw this.failure
			}

			await this.waitForData()
		}
	}

	/**
	 * Run one command and collect its untagged responses.
	 *
	 * @param command - The command text, without a tag.
	 * @param onUntagged - Called for each untagged (`*`) line. It may call
	 *   {@link readBytes} to consume a literal the line announced.
	 * @returns The tagged completion line.
	 * @throws When the server answers `NO` or `BAD`.
	 */
	async run(command: string, onUntagged?: (line: string) => Promise<void> | void): Promise<string> {
		this.tagCounter += 1
		const tag = `d${this.tagCounter}`
		this.socket.write(`${tag} ${command}\r\n`)

		for (;;) {
			const line = await this.readLine()

			// Only a line that STARTS with the tag ends the command — see the
			// framing gotcha at the top of this file.
			if (line.startsWith(`${tag} `)) {
				const status = line.slice(tag.length + 1).trim()
				if (!/^OK\b/i.test(status)) {
					throw new Error(`IMAP command failed: ${command} → ${status}`)
				}
				return line
			}

			await onUntagged?.(line)
		}
	}

	/** Read the server greeting. */
	async readGreeting(): Promise<void> {
		const line = await this.readLine()
		if (!/^\* (OK|PREAUTH)\b/i.test(line)) {
			throw new Error(`IMAP server refused the connection: ${line}`)
		}
	}

	/** Close the socket. */
	end(): void {
		this.socket.removeAllListeners('close')
		this.socket.end()
		this.socket.destroy()
	}
}

/** Open an implicit-TLS connection — the only factory production uses. */
export function openImapTlsSocket(endpoint: ImapEndpoint): Promise<Socket> {
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

		socket.setTimeout(IMAP_TIMEOUT_MS, () => {
			socket.destroy(new Error(`IMAP connection to ${endpoint.host} timed out`))
		})
		socket.once('error', reject)
	})
}

/** What one poll pass should read. */
export interface ImapFetchOptions {
	/** Mailbox to select. */
	mailbox: string
	/** IMAP search key, e.g. `UNSEEN`. */
	search: string
	/** Mark each returned message `\Seen`. */
	markSeen: boolean
	/** UIDs to leave alone — already handled in an earlier pass. */
	skipUids?: ReadonlySet<number>
}

/**
 * Connect, read the matching messages, and disconnect.
 *
 * One connection per poll rather than a long-lived session: a poller that holds
 * a socket open for hours has to handle every way a server can drop it, and the
 * poll interval makes reconnecting free.
 *
 * @param endpoint - Server and credentials.
 * @param options - Mailbox, search, and whether to mark messages read.
 * @param connect - Socket factory. Defaults to implicit TLS; overridden only by
 *   Devflare's own protocol tests.
 * @returns Every matching message, oldest UID first.
 * @throws On connection, authentication, or protocol failure.
 */
export async function fetchImapMessages(
	endpoint: ImapEndpoint,
	options: ImapFetchOptions,
	connect: ImapSocketFactory = openImapTlsSocket
): Promise<ImapMessage[]> {
	const socket = await connect(endpoint)
	const connection = new ImapConnection(socket)

	try {
		await connection.readGreeting()
		await connection.run(`LOGIN ${quote(endpoint.username)} ${quote(endpoint.password)}`)
		await connection.run(`SELECT ${quote(options.mailbox)}`)

		const uids: number[] = []
		await connection.run(`UID SEARCH ${options.search}`, (line) => {
			const match = line.match(/^\* SEARCH(.*)$/i)
			if (!match) {
				return
			}
			for (const token of match[1].trim().split(/\s+/)) {
				const uid = Number(token)
				if (Number.isInteger(uid) && uid > 0) {
					uids.push(uid)
				}
			}
		})

		const wanted = uids.filter((uid) => !options.skipUids?.has(uid)).sort((a, b) => a - b)
		const messages: ImapMessage[] = []

		for (const uid of wanted) {
			const chunks: Buffer[] = []

			await connection.run(`UID FETCH ${uid} (BODY.PEEK[])`, async (line) => {
				const literal = line.match(/\{(\d+)\}$/)
				if (literal) {
					chunks.push(await connection.readBytes(Number(literal[1])))
				}
			})

			// A UID the search returned but the fetch found no body for was
			// expunged between the two commands. Nothing to hand on.
			if (chunks.length === 0) {
				continue
			}

			messages.push({ uid, raw: Buffer.concat(chunks).toString('utf8') })

			if (options.markSeen) {
				await connection.run(`UID STORE ${uid} +FLAGS (\\Seen)`)
			}
		}

		// No LOGOUT: many servers answer it by closing the socket rather than
		// with a tagged reply, which would surface as a spurious read error on
		// work that is already complete. The finally block closes it cleanly.
		return messages
	} finally {
		connection.end()
	}
}
