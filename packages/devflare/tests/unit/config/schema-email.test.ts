// =============================================================================
// Config Schema — local email behaviour
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { compileConfig } from '../../../src/config/compiler'
import { configSchema } from '../../../src/config/schema'

const base = { name: 'my-worker', compatibilityDate: '2025-01-07' }

describe('sendEmail binding restrictions', () => {
	test('accepts a binding with no destination restriction at all', () => {
		// Cloudflare permits any recipient once a sending domain is onboarded, so
		// a binding that names neither destinationAddress nor
		// allowedDestinationAddresses is valid and must survive validation intact.
		const result = configSchema.safeParse({ ...base, bindings: { sendEmail: { MAILER: {} } } })

		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.bindings?.sendEmail?.MAILER).toEqual({})
		}
	})

	test('compiles that binding to a Wrangler entry carrying only its name', () => {
		const compiled = compileConfig({ ...base, bindings: { sendEmail: { MAILER: {} } } })

		expect(compiled.send_email).toEqual([{ name: 'MAILER' }])
		expect(JSON.stringify(compiled.send_email)).toBe('[{"name":"MAILER"}]')
	})
})

describe('email config', () => {
	test('is optional and absent by default', () => {
		const result = configSchema.safeParse(base)

		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.email).toBeUndefined()
		}
	})

	test('accepts a full relay + inbound block', () => {
		const result = configSchema.safeParse({
			...base,
			email: {
				mode: 'relay',
				relay: {
					url: 'smtps://user:pass@smtp.example.com:465',
					to: 'dev-inbox@example.com',
					from: 'relay@example.com',
					header: 'X-Uidini-Dev-Relay',
					rejectUnauthorized: false
				},
				inbound: {
					enabled: true,
					url: 'imaps://dev%40example.com:pass@imap.example.com:993',
					mailbox: 'INBOX/support',
					intervalMs: 5000,
					to: 'support@example.com',
					markSeen: false
				}
			}
		})

		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.email?.mode).toBe('relay')
			expect(result.data.email?.relay?.to).toBe('dev-inbox@example.com')
			expect(result.data.email?.inbound?.mailbox).toBe('INBOX/support')
		}
	})

	test('rejects relay mode with no relay block', () => {
		const result = configSchema.safeParse({ ...base, email: { mode: 'relay' } })

		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('requires an email.relay block')
		}
	})

	test('rejects a relay block with no pinned recipient', () => {
		const result = configSchema.safeParse({
			...base,
			email: { mode: 'relay', relay: { url: 'smtps://smtp.example.com:465' } }
		})

		expect(result.success).toBe(false)
	})

	test('rejects an unknown mode', () => {
		expect(configSchema.safeParse({ ...base, email: { mode: 'send' } }).success).toBe(false)
	})

	test('rejects an unknown key rather than silently ignoring a typo', () => {
		expect(
			configSchema.safeParse({ ...base, email: { mode: 'capture', relayy: {} } }).success
		).toBe(false)
	})

	test('never reaches the compiled Wrangler output', () => {
		// Local-only, exactly like `server`. A machine-local SMTP URL in a
		// deployable artifact would be both useless and a credential leak.
		const compiled = compileConfig({
			...base,
			email: {
				mode: 'relay',
				relay: { url: 'smtps://user:pass@smtp.example.com:465', to: 'dev@example.com' }
			}
		}) as Record<string, unknown>

		expect(JSON.stringify(compiled)).not.toContain('smtp.example.com')
		expect(compiled.email).toBeUndefined()
	})
})
