// =============================================================================
// Binding Hints — config-section → hint-kind mapping tests
// =============================================================================
// Pins `extractBindingHints()`: each binding section maps every binding name to
// the correct hint kind (kv/r2/d1/do/service/queue/ai/sendEmail/workflow), and
// an empty or section-less config yields no hints.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import type { DevflareConfig } from '../../../src/config'
import { extractBindingHints } from '../../../src/test/binding-hints'

/** Build a DevflareConfig with only the `bindings` section populated. */
function configWithBindings(bindings: unknown): DevflareConfig {
	return { bindings } as unknown as DevflareConfig
}

describe('extractBindingHints', () => {
	test('returns {} for a config with no bindings section', () => {
		expect(extractBindingHints({} as DevflareConfig)).toEqual({})
	})

	test('returns {} for an empty bindings object', () => {
		expect(extractBindingHints(configWithBindings({}))).toEqual({})
	})

	test('maps KV bindings to the "kv" hint', () => {
		const hints = extractBindingHints(configWithBindings({ kv: { CACHE: {}, SESSIONS: {} } }))
		expect(hints).toEqual({ CACHE: 'kv', SESSIONS: 'kv' })
	})

	test('maps R2 bindings to the "r2" hint', () => {
		const hints = extractBindingHints(configWithBindings({ r2: { ASSETS: 'assets-bucket' } }))
		expect(hints).toEqual({ ASSETS: 'r2' })
	})

	test('maps D1 bindings to the "d1" hint', () => {
		const hints = extractBindingHints(configWithBindings({ d1: { DB: {} } }))
		expect(hints).toEqual({ DB: 'd1' })
	})

	test('maps Durable Object bindings to the "do" hint', () => {
		const hints = extractBindingHints(
			configWithBindings({ durableObjects: { COUNTER: { className: 'Counter' } } })
		)
		expect(hints).toEqual({ COUNTER: 'do' })
	})

	test('maps service bindings to the "service" hint', () => {
		const hints = extractBindingHints(
			configWithBindings({ services: { AUTH: { service: 'auth-worker' } } })
		)
		expect(hints).toEqual({ AUTH: 'service' })
	})

	test('maps queue consumers (keyed by the queue name) to the "queue" hint', () => {
		const hints = extractBindingHints(
			configWithBindings({
				queues: { consumers: [{ queue: 'jobs' }, { queue: 'emails' }] }
			})
		)
		expect(hints).toEqual({ jobs: 'queue', emails: 'queue' })
	})

	test('maps queue producers (keyed by the binding name) to the "queue" hint', () => {
		const hints = extractBindingHints(
			configWithBindings({ queues: { producers: { JOB_QUEUE: 'jobs' } } })
		)
		expect(hints).toEqual({ JOB_QUEUE: 'queue' })
	})

	test('maps the AI binding (keyed by its binding name) to the "ai" hint', () => {
		const hints = extractBindingHints(configWithBindings({ ai: { binding: 'AI' } }))
		expect(hints).toEqual({ AI: 'ai' })
	})

	test('maps sendEmail bindings to the "sendEmail" hint', () => {
		const hints = extractBindingHints(
			configWithBindings({ sendEmail: { NOTIFY: { destination_address: 'a@b.com' } } })
		)
		expect(hints).toEqual({ NOTIFY: 'sendEmail' })
	})

	test('maps workflow bindings to the "workflow" hint', () => {
		const hints = extractBindingHints(
			configWithBindings({ workflows: { ORDERS: { name: 'orders', className: 'OrdersFlow' } } })
		)
		expect(hints).toEqual({ ORDERS: 'workflow' })
	})

	test('maps a mixed config so every binding kind is represented', () => {
		const hints = extractBindingHints(
			configWithBindings({
				kv: { CACHE: {} },
				r2: { ASSETS: 'assets' },
				d1: { DB: {} },
				durableObjects: { COUNTER: { className: 'Counter' } },
				services: { AUTH: { service: 'auth' } },
				queues: {
					consumers: [{ queue: 'jobs' }],
					producers: { OUTBOX: 'outbox' }
				},
				ai: { binding: 'AI' },
				sendEmail: { NOTIFY: {} },
				workflows: { ORDERS: { name: 'orders', className: 'OrdersFlow' } }
			})
		)

		expect(hints).toEqual({
			CACHE: 'kv',
			ASSETS: 'r2',
			DB: 'd1',
			COUNTER: 'do',
			AUTH: 'service',
			jobs: 'queue',
			OUTBOX: 'queue',
			AI: 'ai',
			NOTIFY: 'sendEmail',
			ORDERS: 'workflow'
		})
	})
})
