import { describe, expect, test } from 'bun:test'
import { hasHeader, readHeader, rewriteHeaders } from '../../../src/email/mime-headers'

const document = [
	'From: a@example.com',
	'To: b@example.com,',
	'\tc@example.com',
	'Subject: Hello',
	'',
	'Body line one',
	'To: not-a-header@example.com'
].join('\r\n')

describe('readHeader', () => {
	test('is case-insensitive and unfolds continuations', () => {
		expect(readHeader(document, 'to')).toBe('b@example.com, c@example.com')
		expect(readHeader(document, 'SUBJECT')).toBe('Hello')
	})

	test('never reads the body', () => {
		// `To:` also appears as body text; only the header block counts.
		expect(readHeader(document, 'To')).not.toContain('not-a-header')
	})

	test('reports an absent header as undefined', () => {
		expect(readHeader(document, 'Cc')).toBeUndefined()
		expect(hasHeader(document, 'Cc')).toBe(false)
		expect(hasHeader(document, 'from')).toBe(true)
	})
})

describe('rewriteHeaders', () => {
	test('replaces a value while keeping the document spelling of the name', () => {
		const rewritten = rewriteHeaders(document, { To: 'pinned@example.com' })

		expect(rewritten).toContain('To: pinned@example.com')
		expect(rewritten).not.toContain('c@example.com')
	})

	test('removes a header with null and appends an absent one', () => {
		const rewritten = rewriteHeaders(document, { Subject: null, 'X-Marker': '1' })

		expect(hasHeader(rewritten, 'Subject')).toBe(false)
		expect(readHeader(rewritten, 'X-Marker')).toBe('1')
	})

	test('leaves the body untouched', () => {
		const rewritten = rewriteHeaders(document, { To: 'pinned@example.com' })

		expect(rewritten.split('\r\n\r\n').slice(1).join('\r\n\r\n')).toBe(
			'Body line one\r\nTo: not-a-header@example.com'
		)
	})

	test('a header-only document gains a body separator rather than losing its last field', () => {
		const rewritten = rewriteHeaders('From: a@example.com', { 'X-Marker': '1' })

		expect(readHeader(rewritten, 'From')).toBe('a@example.com')
		expect(readHeader(rewritten, 'X-Marker')).toBe('1')
	})
})

describe('rewriteHeaders sanitisation', () => {
	test('a CRLF in a value cannot forge an extra header', () => {
		// The relay copies caller-supplied recipient lists into
		// X-Devflare-Original-*; a newline there would close that field and open a
		// real Bcc, or end the header block above the relay marker.
		const rewritten = rewriteHeaders(document, {
			'X-Devflare-Original-Cc': 'ops@example.com\r\nBcc: forged@evil.com'
		})

		expect(hasHeader(rewritten, 'Bcc')).toBe(false)
		expect(readHeader(rewritten, 'X-Devflare-Original-Cc')).toBe(
			'ops@example.com Bcc: forged@evil.com'
		)
	})

	test('a CRLFCRLF in a value cannot end the header block early', () => {
		const rewritten = rewriteHeaders(document, {
			'X-First': 'value\r\n\r\nnot a header',
			'X-Last': 'still a header'
		})

		expect(readHeader(rewritten, 'X-Last')).toBe('still a header')
	})

	test('a CRLF in a replaced value is stripped too', () => {
		const rewritten = rewriteHeaders(document, { To: 'pinned@example.com\r\nBcc: forged@evil.com' })

		expect(hasHeader(rewritten, 'Bcc')).toBe(false)
	})
})
