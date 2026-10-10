// =============================================================================
// Authoring input types — queue event subscriptions
// =============================================================================
// Hand-written mirror of `schema-subscriptions.ts`, kept beside the other
// authoring types so `defineConfig()` shows documentation and completions.
// =============================================================================

/**
 * Which platform's events to subscribe to. Forwarded to Cloudflare unchanged.
 *
 * Deliberately a passthrough rather than a union of known sources. Cloudflare's published schema
 * lags its own API — eight source types documented, ten shipping in wrangler, and Email Sending in
 * neither despite being generally available — so a union would reject sources that work. Supply the
 * object the API expects; to learn the exact shape for one Cloudflare has not documented, create a
 * subscription by hand and read it back, which a deploy prints for you.
 */
export interface EventSubscriptionSourceInput {
	/**
	 * The source type.
	 *
	 * @example
	 * ```ts
	 * type: 'email.sending'
	 * ```
	 */
	type: string

	/** Whatever else that source requires — a zone, a domain, a model name. */
	[field: string]: unknown
}

/** One subscription: a source, a queue, and the events carried between them. */
export interface EventSubscriptionInput {
	/**
	 * The queue that receives the events, BY NAME — Devflare resolves the id.
	 *
	 * The queue must exist. Declare it in `bindings.queues` and the same deploy will have created it
	 * by the time subscriptions are reconciled.
	 *
	 * @example
	 * ```ts
	 * queue: 'email-events'
	 * ```
	 */
	queue: string

	/**
	 * Which platform's events.
	 *
	 * @example
	 * ```ts
	 * source: { type: 'r2' }
	 * ```
	 */
	source: EventSubscriptionSourceInput

	/**
	 * The event names, in Cloudflare's SHORT form.
	 *
	 * → GOTCHA: `message.delivered`, not the `cf.email.sending.message.delivered` that arrives ON the
	 * queue. The prefixed form is what a consumer reads off the message; a subscription that asks for
	 * it subscribes to nothing, and does so silently.
	 *
	 * @example
	 * ```ts
	 * events: ['message.delivered', 'message.bounced']
	 * ```
	 */
	events: string[]

	/**
	 * A human label, shown in the Cloudflare dashboard.
	 *
	 * @default A Devflare-authored label naming the queue and the source.
	 *
	 * @example
	 * ```ts
	 * name: 'email delivery events'
	 * ```
	 */
	name?: string

	/**
	 * Create it but leave it switched off.
	 *
	 * @default `true`
	 *
	 * @example
	 * ```ts
	 * enabled: false
	 * ```
	 */
	enabled?: boolean
}

/**
 * Queue event subscriptions, reconciled at deploy.
 *
 * Matched on the pair of (source, queue) rather than on name, so one created by hand in the
 * dashboard is recognised as the subscription a config declares instead of being duplicated
 * alongside it.
 */
export type EventSubscriptionsConfigInput = EventSubscriptionInput[]
