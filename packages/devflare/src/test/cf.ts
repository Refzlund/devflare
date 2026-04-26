// =============================================================================
// Cloudflare Test Helpers — Unified API for testing all handler types
// =============================================================================
// Usage:
//   import { cf } from 'devflare/test'
//
//   // Email handlers
//   await cf.email.send({ from: '...', to: '...', subject: '...', body: '...' })
//   cf.email.onReceive((msg) => console.log('Sent:', msg))
//
//   // Queue handlers
//   await cf.queue.trigger([{ type: 'process', data: {} }])
//   await cf.queue.send({ type: 'cleanup' })
//
//   // Scheduled handlers
//   await cf.scheduled.trigger('0 */6 * * *')
//
//   // Worker (fetch) handlers
//   const response = await cf.worker.fetch(new Request('http://localhost/'))
//   const response = await cf.worker.get('/api/users')
//   const response = await cf.worker.post('/api/users', { name: 'Alice' })
//
//   // Tail handlers
//   await cf.tail.trigger([{ scriptName: 'my-worker', logs: [...] }])
// =============================================================================

import { email } from './email'
import { queue } from './queue'
import { scheduled } from './scheduled'
import { worker } from './worker'
import { tail } from './tail'

// Re-export individual helpers for tree-shaking
export { email } from './email'
export { queue } from './queue'
export { scheduled } from './scheduled'
export { worker } from './worker'
export { tail } from './tail'

// Re-export types
export type { EmailSendOptions, ReceivedEmail, EmailReceiveCallback } from './email'
export type { QueueMessageOptions, QueueTriggerResult } from './queue'
export type { ScheduledTriggerOptions, ScheduledTriggerResult } from './scheduled'
export type { WorkerFetchOptions } from './worker'
export type { TraceItemOptions, TailTriggerResult } from './tail'

/**
 * Unified Cloudflare test helpers.
 *
 * Provides a consistent API for triggering the main Cloudflare Worker handler surfaces:
	 * - `cf.email` — Email helper surface with a direct-handler path and a best-effort local endpoint fallback
 * - `cf.queue` — Queue consumer testing
 * - `cf.scheduled` — Cron/scheduled handler testing
 * - `cf.worker` — Fetch handler testing
 * - `cf.tail` — Tail helper surface (uses `files.tail`, or auto-detects `src/tail.ts` when present)
 *
 * The helpers use the real Miniflare-backed bindings created by `createTestContext()`,
 * but several helper surfaces still synthesize event/controller objects around those
 * bindings rather than replaying the full Cloudflare runtime dispatch path.
 * They still install the active Devflare event into AsyncLocalStorage before
 * invoking user code, so getters such as `getFetchEvent()` and `getQueueEvent()`
 * work inside the triggered handler.
 *
 * @example
 * ```ts
 * import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
 * import { createTestContext, cf } from 'devflare/test'
 * import { env } from 'devflare'
 *
 * beforeAll(() => createTestContext())
 * afterAll(() => env.dispose())
 *
 * describe('My Worker', () => {
 *   test('fetch handler', async () => {
 *     const response = await cf.worker.get('/api/health')
 *     expect(response.status).toBe(200)
 *   })
 *
 *   test('queue handler', async () => {
 *     // Trigger queue handler with messages
 *     const result = await cf.queue.trigger([
 *       { type: 'process', data: { id: 1 } }
 *     ])
 *     expect(result.acked).toHaveLength(1)
 *
 *     // Verify side effects in real KV
 *     const stored = await env.RESULTS.get('result:1')
 *     expect(stored).toBeDefined()
 *   })
 *
 *   test('scheduled handler', async () => {
 *     await cf.scheduled.trigger('0 0 * * 1')  // Weekly Monday cron
 *
 *     // Verify scheduled job ran
 *     const report = await env.RESULTS.get('report:weekly')
 *     expect(report).toBeDefined()
 *   })
 * })
 * ```
 */
export const cf = {
	/**
	 * Email helper surface.
	 *
	 * - `cf.email.send(options)` — Send a raw email through the helper
	 * - `cf.email.onReceive(callback)` — Observe outgoing emails when runtime wiring records them
	 * - `cf.email.getSentEmails()` — Read recorded outgoing emails
	 * - `cf.email.clearSentEmails()` — Clear recorded outgoing email history
	 *
	 * When `createTestContext()` has configured an email handler, this invokes it directly.
	 * Otherwise it attempts the local `/cdn-cgi/handler/email` endpoint when the
	 * runtime exposes it.
	 */
	email,

	/**
	 * Queue consumer testing.
	 *
	 * - `cf.queue.trigger(messages)` — Trigger queue handler with message batch
	 * - `cf.queue.send(message)` — Convenience for single message
	 *
	 * Returns result with `acked`, `retried`, `failed` message IDs.
	 */
	queue,

	/**
	 * Scheduled (cron) handler testing.
	 *
	 * - `cf.scheduled.trigger(cron?)` — Trigger scheduled handler
	 *
	 * Pass a cron expression to test cron-specific logic:
	 * @example
	 * await cf.scheduled.trigger('0 *​/6 * * *')  // Every 6 hours
	 * await cf.scheduled.trigger('0 0 * * 1')    // Weekly Monday
	 */
	scheduled,

	/**
	 * Fetch (HTTP) handler testing.
	 *
	 * - `cf.worker.fetch(request, options)` — Full fetch with Request object
	 * - `cf.worker.get(path, headers)` — GET shorthand
	 * - `cf.worker.post(path, body, headers)` — POST shorthand
	 * - `cf.worker.put(path, body, headers)` — PUT shorthand
	 * - `cf.worker.patch(path, body, headers)` — PATCH shorthand
	 * - `cf.worker.delete(path, headers)` — DELETE shorthand
	 *
	 * `cf.worker` dispatches through both `src/fetch.ts` and built-in
	 * `src/routes/**` file routes when they are present.
	 */
	worker,

	/**
	 * Tail helper surface.
	 *
	 * - `cf.tail.trigger(events)` — Trigger tail handler with trace items
	 * - `cf.tail.create(options)` — Create a TraceItem with defaults
	 *
	 * When `createTestContext()` finds `files.tail` or `src/tail.ts`,
	 * `cf.tail.trigger()` is wired automatically.
	 */
	tail
}
