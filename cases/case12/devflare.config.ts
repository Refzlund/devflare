import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case12-email-handlers',
	compatibilityDate: '2026-04-26',

	bindings: {
		// KV for storing processed emails
		kv: {
			EMAIL_LOG: 'email-log-kv-id'
		},

		// Send email binding example for outgoing emails.
		// Devflare models this through config compilation, env types, and local runtime flows.
		sendEmail: {
			EMAIL: {}
		}
	},

	vars: {
		// Forward emails to this address
		FORWARD_ADDRESS: 'admin@example.com'
	}
})
