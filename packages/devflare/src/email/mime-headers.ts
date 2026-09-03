// =============================================================================
// MIME header surgery — rewrite an assembled document's header block
// =============================================================================
// The relay has to change a message AFTER it was composed: recipients are
// pinned and a marker header is stamped on the document that actually travels.
// Doing that on the raw MIME (rather than re-composing from the structured
// message) is what makes the pin unbypassable — it applies to a caller-supplied
// raw MIME exactly as it does to one Devflare built.
// =============================================================================

import { sanitizeHeaderValue } from '../utils/email-message'

/** Split a document into its header block and everything after it. */
function splitDocument(raw: string): { headers: string; separator: string; body: string } {
	const match = raw.match(/\r?\n\r?\n/)

	if (!match || match.index === undefined) {
		// A document with no blank line is all headers; give it a proper one.
		return { headers: raw, separator: '\r\n\r\n', body: '' }
	}

	return {
		headers: raw.slice(0, match.index),
		separator: '\r\n\r\n',
		body: raw.slice(match.index + match[0].length)
	}
}

/**
 * Group a header block into whole fields, keeping folded continuations attached.
 *
 * @param headers - The raw header block.
 * @returns One entry per field: its lowercase name and its full text.
 */
function toFields(headers: string): Array<{ name: string; text: string }> {
	const fields: Array<{ name: string; text: string }> = []

	for (const line of headers.split(/\r?\n/)) {
		// A leading space or tab continues the previous field (RFC 5322 folding).
		if (/^[ \t]/.test(line) && fields.length > 0) {
			fields[fields.length - 1].text += `\r\n${line}`
			continue
		}

		const colonIndex = line.indexOf(':')
		if (colonIndex <= 0) {
			continue
		}

		fields.push({ name: line.slice(0, colonIndex).trim().toLowerCase(), text: line })
	}

	return fields
}

/**
 * Read one header's value from a document.
 *
 * @param raw - The MIME document.
 * @param name - Header name, matched case-insensitively.
 * @returns The unfolded value, or `undefined` when the header is absent.
 */
export function readHeader(raw: string, name: string): string | undefined {
	const target = name.toLowerCase()
	const field = toFields(splitDocument(raw).headers).find((entry) => entry.name === target)
	if (!field) {
		return undefined
	}

	const colonIndex = field.text.indexOf(':')
	return field.text
		.slice(colonIndex + 1)
		.replace(/\r?\n[ \t]+/g, ' ')
		.trim()
}

/**
 * Does the document carry this header at all?
 *
 * @param raw - The MIME document.
 * @param name - Header name, matched case-insensitively.
 * @returns `true` when the header is present, whatever its value.
 */
export function hasHeader(raw: string, name: string): boolean {
	const target = name.toLowerCase()
	return toFields(splitDocument(raw).headers).some((entry) => entry.name === target)
}

/**
 * Replace, add, and remove headers on an assembled document.
 *
 * → GOTCHA: names and values are stripped of CR/LF here, not by the callers.
 *   The relay writes recipient lists it read off a caller's message into
 *   `X-Devflare-Original-*`; a newline in one of those would forge a live
 *   `Bcc:` past the pin's scrub, or end the header block above the relay
 *   marker so the inbound poller stops recognising Devflare's own mail.
 *
 * @param raw - The MIME document.
 * @param changes - Header name → new value, or `null` to remove the header.
 *   A name that is absent from the document and given a value is appended.
 * @returns The rewritten document. The body is untouched.
 */
export function rewriteHeaders(raw: string, changes: Record<string, string | null>): string {
	const { headers, separator, body } = splitDocument(raw)
	const normalized = new Map<string, string | null>(
		Object.entries(changes).map(([name, value]) => [name.toLowerCase(), value])
	)
	const applied = new Set<string>()

	const kept: string[] = []
	for (const field of toFields(headers)) {
		if (!normalized.has(field.name)) {
			kept.push(field.text)
			continue
		}

		const value = normalized.get(field.name)
		applied.add(field.name)

		if (value === null || value === undefined) {
			continue
		}

		// Reuse the document's own spelling of the name so a rewritten `To:`
		// does not suddenly read `to:`.
		const original = field.text.slice(0, field.text.indexOf(':'))
		kept.push(`${original}: ${sanitizeHeaderValue(value)}`)
	}

	for (const [name, value] of Object.entries(changes)) {
		if (value !== null && !applied.has(name.toLowerCase())) {
			kept.push(`${sanitizeHeaderValue(name)}: ${sanitizeHeaderValue(value)}`)
		}
	}

	return `${kept.join('\r\n')}${separator}${body}`
}
