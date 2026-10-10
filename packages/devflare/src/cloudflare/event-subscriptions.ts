import { type APIClientOptions, apiGetAll, apiPost } from './api'

/*
	──────────────────────────────────────────────────────────────────────────────
	                   Queue event subscriptions
	──────────────────────────────────────────────────────────────────────────────
	A subscription tells Cloudflare to publish a platform's events onto one of
	your Queues — R2 object writes, Workers Builds results, Email Sending delivery
	outcomes.

	→ KEY: the ENVELOPE here is verified against Cloudflare's OpenAPI schema, the
	  generated `cloudflare` SDK and wrangler's own implementation, all three of
	  which agree. The `source` OBJECT is NOT, for every source, which is why it is
	  typed as a passthrough rather than a union — see {@link EventSubscriptionSource}.
	→ GOTCHA: the `events` array takes the SHORT form (`message.delivered`), not
	  the `cf.`-prefixed string that arrives ON the queue
	  (`cf.email.sending.message.delivered`). Wrangler passes `--events` through
	  verbatim, so the short form is what the wire actually carries; using the
	  prefixed one silently subscribes to nothing.
	→ NOTE: the queue must already exist. `destination.queue_id` is required and
	  there is no create-if-missing path, so a subscription is reconciled AFTER
	  the queues a deploy provisions.
*/

/**
 * Which platform's events to subscribe to.
 *
 * A passthrough object rather than a union, and deliberately so. Cloudflare's published schema lists
 * eight source types, wrangler ships ten, and Email Sending — announced 2026-07-15 — appears in
 * NEITHER, despite being generally available and documented. Its sample payload carries `zoneId` and
 * `domain`, but a payload is not a request schema, and every source whose request shape IS verified
 * uses snake_case where its payload used camelCase (`modelName` becomes `model_name`). Guessing
 * between `zoneId` and `zone_id` would fail at deploy time inside a tool whose whole promise is that
 * the config is correct.
 *
 * So the object is forwarded verbatim. To learn the exact shape for a source Cloudflare has not
 * documented, create one subscription by hand and read it back — a deploy prints the `source` of
 * every subscription it finds, and the list endpoint returns it as stored.
 */
export interface EventSubscriptionSource {
	/** The source type, e.g. `r2`, `workersBuilds.worker`, `email.sending`. */
	type: string
	/** Whatever else that source requires. Forwarded to Cloudflare unchanged. */
	[field: string]: unknown
}

/** Where the events are delivered. Queues are the only destination Cloudflare offers. */
export interface EventSubscriptionDestination {
	/** Always `queues.queue`; both fields are required by the API. */
	type: 'queues.queue'
	/** The queue's id, not its name. */
	queue_id: string
}

/** One event subscription, as Cloudflare stores it. */
export interface EventSubscription {
	/** Cloudflare's id. Absent when creating. */
	id?: string
	/** A human label. Wrangler defaults it to `<queue> <sourceType>`. */
	name?: string
	/** Whether the subscription is live. */
	enabled?: boolean
	/** Short-form event names. At least one. */
	events: string[]
	/** Which platform's events. */
	source: EventSubscriptionSource
	/** Which queue receives them. */
	destination: EventSubscriptionDestination
}

/**
 * @description List every event subscription on an account.
 *
 * @param accountId - the account.
 * @param options - API client options.
 * @returns every subscription, with `source` exactly as Cloudflare stores it.
 *
 * → NOTE: this is also how you discover an undocumented source shape. The transport is plain JSON
 *   and nothing strips an unmodelled `source`, so a subscription created in the dashboard comes back
 *   with its real field names intact.
 */
export async function listEventSubscriptions(
	accountId: string,
	options?: APIClientOptions
): Promise<EventSubscription[]> {
	return apiGetAll<EventSubscription>(
		`/accounts/${accountId}/event_subscriptions/subscriptions`,
		options
	)
}

/**
 * @description Create one event subscription.
 *
 * @param accountId - the account.
 * @param subscription - the subscription. `events` must be non-empty and the queue must exist.
 * @param options - API client options.
 * @returns the created subscription, carrying its id.
 */
export async function createEventSubscription(
	accountId: string,
	subscription: EventSubscription,
	options?: APIClientOptions
): Promise<EventSubscription> {
	return apiPost<EventSubscription>(
		`/accounts/${accountId}/event_subscriptions/subscriptions`,
		subscription,
		options
	)
}
