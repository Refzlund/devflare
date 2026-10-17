import { describe, expect, test } from 'bun:test'
import {
	DEFAULT_RELAY_HEADER,
	resolveEmailMode,
	resolveEmailRuntime
} from '../../../src/email/runtime-config'

describe('email mode selection', () => {
	test('defaults to capture when nothing asks otherwise', () => {
		expect(resolveEmailMode(undefined, {})).toBe('capture')
		expect(resolveEmailRuntime(undefined, {})).toEqual({
			mode: 'capture',
			relay: null,
			inbound: null
		})
	})

	test('CREDENTIALS ALONE NEVER SELECT A MODE', () => {
		// The failure this guards against does damage rather than erroring: a
		// suite of hundreds of unattended round-trips, on a machine whose .env
		// happens to hold real SMTP settings, must not start sending mail.
		const runtime = resolveEmailRuntime(undefined, {
			DEVFLARE_EMAIL_RELAY_URL: 'smtps://user:pass@smtp.example.com:465',
			DEVFLARE_EMAIL_RELAY_TO: 'dev@example.com',
			DEVFLARE_EMAIL_INBOUND_URL: 'imaps://user:pass@imap.example.com:993'
		})

		expect(runtime.mode).toBe('capture')
		expect(runtime.relay).toBeNull()
		expect(runtime.inbound).toBeNull()
	})

	test('a configured relay block without a mode is equally inert', () => {
		const runtime = resolveEmailRuntime(
			{ relay: { url: 'smtps://user:pass@smtp.example.com:465', to: 'dev@example.com' } },
			{}
		)

		expect(runtime.mode).toBe('capture')
		expect(runtime.relay).toBeNull()
	})

	test('config selects the mode', () => {
		expect(
			resolveEmailMode({ mode: 'relay', relay: { url: 'smtps://h:465', to: 'd@e.f' } }, {})
		).toBe('relay')
		expect(resolveEmailMode({ mode: 'live' }, {})).toBe('live')
	})

	test('the environment overrides config', () => {
		expect(resolveEmailMode({ mode: 'relay' }, { DEVFLARE_EMAIL_MODE: 'capture' })).toBe('capture')
	})

	test('an unrecognised mode fails loudly instead of degrading', () => {
		expect(() => resolveEmailMode(undefined, { DEVFLARE_EMAIL_MODE: 'send' })).toThrow(
			"DEVFLARE_EMAIL_MODE must be 'capture', 'relay', or 'live'"
		)
	})
})

describe('relay resolution', () => {
	test('fills the defaults and keeps the pin', () => {
		const runtime = resolveEmailRuntime(
			{
				mode: 'relay',
				relay: { url: 'smtps://user:pass@smtp.example.com:465', to: 'dev@example.com' }
			},
			{}
		)

		expect(runtime.relay).toEqual({
			url: 'smtps://user:pass@smtp.example.com:465',
			to: 'dev@example.com',
			header: DEFAULT_RELAY_HEADER,
			rejectUnauthorized: true
		})
	})

	test('relay mode without a pinned recipient refuses to start', () => {
		expect(() =>
			resolveEmailRuntime(undefined, {
				DEVFLARE_EMAIL_MODE: 'relay',
				DEVFLARE_EMAIL_RELAY_URL: 'smtps://user:pass@smtp.example.com:465'
			})
		).toThrow('needs a pinned recipient')
	})

	test('relay mode without an endpoint refuses to start', () => {
		expect(() => resolveEmailRuntime({ mode: 'relay' }, {})).toThrow('needs an SMTP endpoint')
	})

	test('the environment can override every relay field', () => {
		const runtime = resolveEmailRuntime(
			{ mode: 'relay', relay: { url: 'smtps://config:465', to: 'config@example.com' } },
			{
				DEVFLARE_EMAIL_RELAY_URL: 'smtps://env:465',
				DEVFLARE_EMAIL_RELAY_TO: 'env@example.com',
				DEVFLARE_EMAIL_RELAY_FROM: 'sender@example.com',
				DEVFLARE_EMAIL_RELAY_HEADER: 'X-Uidini-Dev-Relay',
				DEVFLARE_EMAIL_RELAY_REJECT_UNAUTHORIZED: 'false'
			}
		)

		expect(runtime.relay).toEqual({
			url: 'smtps://env:465',
			to: 'env@example.com',
			from: 'sender@example.com',
			header: 'X-Uidini-Dev-Relay',
			rejectUnauthorized: false
		})
	})
})

describe('inbound resolution', () => {
	test('stays off until it is explicitly enabled', () => {
		expect(
			resolveEmailRuntime({ inbound: { url: 'imaps://user:pass@imap.example.com:993' } }, {})
				.inbound
		).toBeNull()
	})

	test('fills the defaults once enabled', () => {
		const runtime = resolveEmailRuntime(
			{ inbound: { enabled: true, url: 'imaps://user:pass@imap.example.com:993' } },
			{}
		)

		expect(runtime.inbound).toEqual({
			url: 'imaps://user:pass@imap.example.com:993',
			mailbox: 'INBOX',
			intervalMs: 15_000,
			markSeen: true,
			skipHeaders: [DEFAULT_RELAY_HEADER]
		})
	})

	test('skips the custom relay header AND the default one', () => {
		// A mailbox can still hold mail relayed before the header was renamed;
		// re-ingesting it would restart exactly the loop the marker prevents.
		const runtime = resolveEmailRuntime(
			{
				mode: 'relay',
				relay: {
					url: 'smtps://h:465',
					to: 'dev@example.com',
					header: 'X-Uidini-Dev-Relay'
				},
				inbound: { enabled: true, url: 'imaps://user:pass@imap.example.com:993' }
			},
			{}
		)

		expect(runtime.inbound?.skipHeaders).toEqual(['X-Uidini-Dev-Relay', DEFAULT_RELAY_HEADER])
	})

	test('enabling without an endpoint refuses to start', () => {
		expect(() => resolveEmailRuntime(undefined, { DEVFLARE_EMAIL_INBOUND: '1' })).toThrow(
			'no IMAP endpoint'
		)
	})

	test('an interval below one second is rejected', () => {
		expect(() =>
			resolveEmailRuntime(
				{ inbound: { enabled: true, url: 'imaps://u:p@h:993', intervalMs: 10 } },
				{}
			)
		).toThrow('>= 1000')
	})

	test('a non-boolean toggle fails loudly', () => {
		expect(() => resolveEmailRuntime(undefined, { DEVFLARE_EMAIL_INBOUND: 'maybe' })).toThrow(
			'Expected a boolean value'
		)
	})
})
