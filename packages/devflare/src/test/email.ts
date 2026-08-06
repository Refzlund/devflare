// =============================================================================
// Email Test Helper — Test email handlers in Bun tests
// =============================================================================
// Usage:
//   import { email } from 'devflare/test'
//
//   // Send a raw email through the helper (INBOUND — invokes src/email.ts)
//   await email.send({
//     from: 'sender@example.com',
//     to: 'recipient@example.com',
//     subject: 'Test Email',
//     body: 'Hello, world!'
//   })
//
//   // Assert on OUTBOUND mail the worker sent through a sendEmail binding
//   expect(email.outbox).toHaveLength(1)
//   expect(email.outbox[0].message.cc).toEqual(['ops@example.com'])
//   expect(email.outbox[0].raw).toContain('Reply-To: support@example.com')
//
//   // Observe forward()/reply() calls made by an inbound handler
//   const unsub = email.onReceive((msg) => {
//     console.log('Received:', msg)
//   })
// =============================================================================

import { join } from 'path'
import { postInboundEmail } from '../email/inbound'
import {
	clearOutbox,
	getOutbox,
	getSentMessages,
	onOutboxEntry,
	resetOutbox
} from '../email/outbox'
import type { OutboxListener, SentEmailRecord } from '../email/outbox'
import { createEmailEvent, runWithEventContext } from '../runtime'
import { clearEmailDeliverySink } from '../utils/email-delivery'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EmailSendOptions {
	/** Sender email address */
	from: string
	/** Recipient email address */
	to: string
	/** Email subject */
	subject?: string
	/** Email body (text or HTML) */
	body?: string
	/** Raw email content (overrides subject/body) */
	raw?: string
	/** Additional headers */
	headers?: Record<string, string>
}

export interface ReceivedEmail {
	/** Email type: 'send', 'forward', or 'reply' */
	type: 'send' | 'forward' | 'reply'
	/** Sender email address */
	from: string
	/** Recipient email address */
	to: string
	/** Raw email content path (local file in dev) */
	rawPath?: string
	/** Raw email content */
	raw?: string
	/** Message ID if available */
	messageId?: string
	/** Timestamp */
	timestamp: Date
}

export type EmailReceiveCallback = (email: ReceivedEmail) => void

// -----------------------------------------------------------------------------
// Global State
// -----------------------------------------------------------------------------

let miniflarePort = 8787
let emailListeners: EmailReceiveCallback[] = []
let sentEmails: ReceivedEmail[] = []
let emailHandlerPath: string | null = null
let configDir: string | null = null
let testEnvGetter: (() => Record<string, unknown>) | null = null

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/**
 * Configure the email test helper
 * @internal
 */
export function configureEmail(
	options: {
		port?: number
		handlerPath?: string | null
		configDir?: string
		getEnv?: () => Record<string, unknown>
	} = {}
): void {
	if (options.port) {
		miniflarePort = options.port
	}

	emailHandlerPath = options.handlerPath ?? emailHandlerPath
	configDir = options.configDir ?? configDir
	testEnvGetter = options.getEnv ?? testEnvGetter
}

// -----------------------------------------------------------------------------
// Email Builder
// -----------------------------------------------------------------------------

/**
 * Build a raw email string from options
 */
function buildRawEmail(options: EmailSendOptions): string {
	if (options.raw) {
		return options.raw
	}

	const lines: string[] = []
	const messageId = `<${Date.now()}-${Math.random().toString(36).slice(2)}@devflare.dev>`
	const date = new Date().toUTCString()

	lines.push(`From: ${options.from}`)
	lines.push(`To: ${options.to}`)
	lines.push(`Date: ${date}`)
	lines.push(`Message-ID: ${messageId}`)

	if (options.subject) {
		lines.push(`Subject: ${options.subject}`)
	}

	if (options.headers) {
		for (const [key, value] of Object.entries(options.headers)) {
			lines.push(`${key}: ${value}`)
		}
	}

	lines.push('MIME-Version: 1.0')
	lines.push('Content-Type: text/plain; charset=UTF-8')
	lines.push('') // Empty line separates headers from body
	lines.push(options.body ?? '')

	return lines.join('\r\n')
}

function createEmailHeaders(rawEmail: string): Headers {
	const headers = new Headers()
	const lines = rawEmail.split(/\r?\n/)

	for (const line of lines) {
		if (!line.trim()) {
			break
		}

		const colonIndex = line.indexOf(':')
		if (colonIndex <= 0) {
			continue
		}

		headers.append(line.slice(0, colonIndex).trim(), line.slice(colonIndex + 1).trim())
	}

	return headers
}

function createRawEmailStream(rawEmail: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(rawEmail))
			controller.close()
		}
	})
}

function resolveEmailHandler(
	module: Record<string, unknown>
): ((event: unknown) => Promise<unknown> | unknown) | null {
	if (typeof module.default === 'function') {
		return module.default as (event: unknown) => Promise<unknown> | unknown
	}

	if (module.default && typeof (module.default as Record<string, unknown>).email === 'function') {
		return (
			(module.default as Record<string, unknown>).email as (
				event: unknown
			) => Promise<unknown> | unknown
		).bind(module.default) as (event: unknown) => Promise<unknown> | unknown
	}

	if (typeof module.email === 'function') {
		return module.email as (event: unknown) => Promise<unknown> | unknown
	}

	return null
}

function getRecordedRawContent(raw: unknown): string | undefined {
	if (typeof raw === 'string') {
		return raw
	}

	return undefined
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Send an incoming email through the email test helper.
 *
 * When `createTestContext()` has configured an email handler, this imports and
 * invokes that handler directly and waits for queued `waitUntil()` work.
 * Otherwise it attempts the local `/cdn-cgi/handler/email` endpoint exposed by
 * compatible local runtimes.
 */
async function send(options: EmailSendOptions): Promise<Response> {
	const raw = buildRawEmail(options)

	if (emailHandlerPath && configDir && testEnvGetter) {
		const absolutePath = join(configDir, emailHandlerPath)
		const handlerModule = await import(absolutePath)
		const emailHandler = resolveEmailHandler(handlerModule)

		if (!emailHandler) {
			throw new Error(
				`Email handler at "${emailHandlerPath}" must export a default function or named "email" export.\n` +
					`Expected: export async function email(message) { ... }`
			)
		}

		const waitUntilPromises: Promise<unknown>[] = []
		const ctx: ExecutionContext = {
			waitUntil(promise: Promise<unknown>) {
				waitUntilPromises.push(promise)
			},
			passThroughOnException() {},
			props: {}
		}

		const runtimeEnv = testEnvGetter()
		const timestamp = new Date()
		const message = {
			from: options.from,
			to: options.to,
			headers: createEmailHeaders(raw),
			raw: createRawEmailStream(raw),
			rawSize: raw.length,
			setReject(reason: string) {
				throw new Error(`Email rejected: ${reason}`)
			},
			async forward(rcptTo: string) {
				recordSentEmail({
					type: 'forward',
					from: options.from,
					to: rcptTo,
					raw,
					timestamp
				})
			},
			async reply(message: { from?: string; to?: string; raw?: unknown }) {
				recordSentEmail({
					type: 'reply',
					from: message.from ?? options.to,
					to: message.to ?? options.from,
					raw: getRecordedRawContent(message.raw),
					timestamp
				})
			}
		} as unknown as ForwardableEmailMessage

		const emailEvent = createEmailEvent(message, runtimeEnv, ctx)

		await runWithEventContext(emailEvent, () => emailHandler(emailEvent))

		await Promise.all(waitUntilPromises)

		return new Response(JSON.stringify({ ok: true, from: options.from, to: options.to }), {
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return postInboundEmail(`http://localhost:${miniflarePort}`, {
		from: options.from,
		to: options.to,
		raw
	})
}

/**
 * Register a callback for outgoing emails.
 *
 * This only fires when the surrounding runtime wiring records outgoing emails.
 * @returns Unsubscribe function
 */
function onReceive(callback: EmailReceiveCallback): () => void {
	emailListeners.push(callback)
	return () => {
		emailListeners = emailListeners.filter((cb) => cb !== callback)
	}
}

/**
 * Get all recorded outgoing emails since test context was created
 */
function getSentEmails(): ReceivedEmail[] {
	return [...sentEmails]
}

/**
 * Clear recorded outgoing email history
 */
function clearSentEmails(): void {
	sentEmails = []
}

/**
 * Add a sent email to the history
 * @internal Called by helper paths that explicitly record outgoing email
 * (currently direct `forward()`/`reply()` test flows).
 */
export function recordSentEmail(email: ReceivedEmail): void {
	sentEmails.push(email)
	for (const listener of emailListeners) {
		try {
			listener(email)
		} catch (error) {
			console.error('[devflare/test] Email listener error:', error)
		}
	}
}

/**
 * Reset email state
 * @internal Called when test context is disposed
 */
export function resetEmailState(): void {
	miniflarePort = 8787
	emailHandlerPath = null
	configDir = null
	testEnvGetter = null
	emailListeners = []
	sentEmails = []
	resetOutbox()
	clearEmailDeliverySink()
}

// -----------------------------------------------------------------------------
// Outbound mail — the outbox
// -----------------------------------------------------------------------------

/**
 * Every message the worker sent through a `sendEmail` binding, in order.
 *
 * Each entry carries the structured message AND the raw MIME: a claim about
 * `cc`, `bcc`, or `replyTo` reads best off `message`, while anything about
 * generated headers or total size (Cloudflare caps a send at 5 MiB) can only be
 * made against `raw`.
 */
function outbox(): readonly SentEmailRecord[] {
	return getOutbox()
}

/**
 * A mutable copy of the outbox.
 *
 * @returns The recorded messages, safe to sort or filter in place.
 */
function sent(): SentEmailRecord[] {
	return getSentMessages()
}

/**
 * Observe each message as it is dispatched.
 *
 * @param listener - Called synchronously with every new outbox entry.
 * @returns Unsubscribe function.
 */
function onOutbound(listener: OutboxListener): () => void {
	return onOutboxEntry(listener)
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export type { SentEmailRecord, OutboxListener }

export const email = {
	send,
	onReceive,
	getSentEmails,
	clearSentEmails,
	/** @see {@link outbox} */
	get outbox(): readonly SentEmailRecord[] {
		return outbox()
	},
	sent,
	/** Drop every recorded outbound message. */
	clearOutbox,
	onOutbound
}
