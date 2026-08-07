// =============================================================================
// Queue event subscriptions
// =============================================================================
// Declares which platform events Cloudflare should publish onto which of your
// Queues. Account-scoped, and reconciled after the queues a deploy provisions,
// because a subscription needs its queue to already exist.
//
// → GOTCHA: `events` takes the SHORT form (`message.delivered`), not the
//   `cf.`-prefixed string that arrives on the queue. Using the prefixed one
//   subscribes to nothing, silently.
// =============================================================================

import { z } from 'zod'

/**
 * Which platform's events. A passthrough, forwarded to Cloudflare unchanged.
 *
 * Cloudflare's published schema lags its own API — eight source types documented, ten in wrangler,
 * and Email Sending in neither despite being generally available. So this is not modelled as a
 * union: a config author supplies the object the API expects, and Devflare does not stand between
 * them and a source Cloudflare shipped last week.
 */
export const eventSubscriptionSourceSchema = z
	.object({
		/** The source type, e.g. `r2`, `workersBuilds.worker`, `email.sending`. */
		type: z.string().min(1)
	})
	.catchall(z.unknown())

/** One subscription: a source, a queue, and the events to carry between them. */
export const eventSubscriptionConfigSchema = z
	.object({
		/**
		 * The queue that receives the events, BY NAME.
		 *
		 * Devflare resolves it to the id Cloudflare wants. The queue must exist — declare it in
		 * `bindings.queues` and the same deploy will have created it by the time this runs.
		 */
		queue: z.string().min(1),
		/** Which platform's events. Forwarded verbatim. */
		source: eventSubscriptionSourceSchema,
		/** Short-form event names. At least one, or the subscription would carry nothing. */
		events: z.array(z.string().min(1)).min(1),
		/** A human label. Devflare writes a deterministic one when omitted. */
		name: z.string().min(1).optional(),
		/** Create it but leave it switched off. @default true */
		enabled: z.boolean().optional()
	})
	.strict()

/**
 * Queue event subscriptions.
 *
 * Reconciled on (source, queue) rather than on name, so a subscription created in the dashboard is
 * recognised as the one a config declares instead of being duplicated beside it.
 */
export const eventSubscriptionsConfigSchema = z.array(eventSubscriptionConfigSchema).optional()
