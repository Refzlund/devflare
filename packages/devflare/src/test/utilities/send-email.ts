// =============================================================================
// Mock SendEmail Binding
// =============================================================================
// Recording wrapper around the pure `createLocalSendEmailBinding()` simulator,
// mirroring `createMockQueue`/`createMockAnalyticsEngine`. `send()` runs the
// same allow-list/sender validation the local binding enforces, then records
// every accepted (normalized) message into an inspectable array so tests can
// assert what application code dispatched — without any remote Email Routing
// setup.
//
// Honesty: Cloudflare Email Routing only *sends* (there is no read-back API),
// so this mock records sends — it does not pretend to deliver or query.
// =============================================================================

import {
	type LocalSendEmailBindingConfig,
	createLocalSendEmailBinding
} from '../../utils/send-email'

// Re-export the pure local SendEmail simulator as part of the public test layer
// (parity with the other `createMock*` binding helpers).
export { createLocalSendEmailBinding, type LocalSendEmailBindingConfig }

type SentEmail = Parameters<SendEmail['send']>[0]

export type MockSendEmailBinding = SendEmail & {
	/** Every message accepted by `send()`, in call order. */
	readonly sentEmails: SentEmail[]
	/** Alias for {@link sentEmails} (parity with other record-only mocks). */
	readonly messages: SentEmail[]
	/** Clear the recorded messages. */
	clear(): void
}

/**
 * Creates a recording SendEmail binding for pure unit tests.
 *
 * Delegates `from`/destination allow-list enforcement to
 * {@link createLocalSendEmailBinding} (so disallowed senders/recipients throw
 * exactly as they would locally), and records each accepted message.
 *
 * @example
 * ```ts
 * const email = createMockSendEmail()
 * await email.send(new EmailMessage('from@a.com', 'to@b.com', '...'))
 * expect(email.sentEmails).toHaveLength(1)
 * ```
 */
export function createMockSendEmail(
	config: LocalSendEmailBindingConfig = {}
): MockSendEmailBinding {
	const sentEmails: SentEmail[] = []

	const binding = createLocalSendEmailBinding(config, {
		onSend(message) {
			sentEmails.push(message)
		}
	})

	return {
		send(message: SentEmail): ReturnType<SendEmail['send']> {
			return binding.send(message)
		},
		get sentEmails(): SentEmail[] {
			return sentEmails
		},
		get messages(): SentEmail[] {
			return sentEmails
		},
		clear(): void {
			sentEmails.length = 0
		}
	} as MockSendEmailBinding
}
