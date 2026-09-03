// =============================================================================
// Case 12: Email Handlers — Email Handler
// =============================================================================
// Handles incoming emails with ForwardableEmailMessage API
// Demonstrates: parsing, replying, forwarding, and logging emails
// =============================================================================

import * as PostalMime from 'postal-mime'
import { createMimeMessage } from 'mimetext'
import { env } from 'devflare'
import type { ForwardableEmailMessage, EmailMessage } from '@cloudflare/workers-types'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

// Parsed email structure from postal-mime
interface ParsedEmail {
	headers: Array<{ key: string; value: string }>
	from?: { address: string; name: string }
	to?: Array<{ address: string; name: string }>
	replyTo?: Array<{ address: string; name: string }>
	subject?: string
	messageId?: string
	date?: string
	html?: string
	text?: string
	attachments: Array<{
		filename?: string
		mimeType?: string
		disposition?: string
		content: ArrayBuffer
	}>
}

// -----------------------------------------------------------------------------
// Email Handler
// -----------------------------------------------------------------------------

/**
 * Create an auto-reply message
 */
function createAutoReply(
	original: ForwardableEmailMessage,
	parsed: ParsedEmail,
	ticketId: string
): EmailMessage {
	const msg = createMimeMessage()

	msg.setSender({
		name: 'Auto-Reply System',
		addr: original.to
	})
	msg.setRecipient(original.from)

	// Set In-Reply-To header for threading
	const originalMessageId = original.headers.get('Message-ID')
	if (originalMessageId) {
		msg.setHeader('In-Reply-To', originalMessageId)
	}

	msg.setSubject(`Re: ${parsed.subject || 'Your message'}`)

	msg.addMessage({
		contentType: 'text/plain',
		data: `Thank you for your email.

We have received your message and created ticket #${ticketId}.

Your original message:
Subject: ${parsed.subject || '(no subject)'}
Received: ${new Date().toISOString()}

We will respond as soon as possible.

---
This is an automated response.`
	})

	// Create EmailMessage (simplified for local dev)
	return {
		from: original.to,
		to: original.from,
		raw: msg.asRaw()
	} as unknown as EmailMessage
}

/**
 * Email handler - processes incoming emails
 */
export async function email(message: ForwardableEmailMessage): Promise<void> {
	// Parse the incoming email
	const parser = new PostalMime.default()
	const rawEmail = new Response(message.raw as unknown as ReadableStream)
	const parsed = await parser.parse(await rawEmail.arrayBuffer()) as ParsedEmail

	// Log the email to KV
	const emailId = crypto.randomUUID()
	await env.EMAIL_LOG.put(
		`email:${emailId}`,
		JSON.stringify({
			id: emailId,
			from: message.from,
			to: message.to,
			subject: parsed.subject,
			receivedAt: new Date().toISOString(),
			bodyPreview: (parsed.text || parsed.html || '').slice(0, 200)
		}),
		{ expirationTtl: 86400 } // 24 hours
	)

	// Auto-reply to sender
	const replyMessage = createAutoReply(message, parsed, emailId)
	await message.reply(replyMessage)

	// Forward to admin
	if (env.FORWARD_ADDRESS) {
		await message.forward(env.FORWARD_ADDRESS)
	}
}
