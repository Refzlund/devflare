/*
	──────────────────────────────────────────────────────────────────────────────
	            Reconciling queue event subscriptions at deploy
	──────────────────────────────────────────────────────────────────────────────
	→ KEY: matched on (source, queue), NOT on name. A name is cosmetic and a
	  dashboard-created subscription will not have the one Devflare would write —
	  so matching on it would create a second subscription beside the working one,
	  and both would deliver, doubling every event onto the queue.
	→ NOTE: nothing is ever deleted or updated. A subscription is a live delivery
	  path; changing which events it carries is a decision, not a reconciliation.
	→ NOTE: runs AFTER queues are provisioned, because `destination.queue_id`
	  requires the queue to already exist and Cloudflare offers no create-if-missing.
*/

import type { EventSubscription, EventSubscriptionSource } from '../cloudflare/event-subscriptions'
import type { QueueInfo } from '../cloudflare/types'
import type { DevflareConfig } from './schema'

/** The Cloudflare calls this module makes, injected so tests and dry-run can replace them. */
export interface SubscriptionProvisionApi {
	/** Every subscription already on the account. */
	listEventSubscriptions: (accountId: string) => Promise<EventSubscription[]>
	/** Create one. */
	createEventSubscription: (
		accountId: string,
		subscription: EventSubscription
	) => Promise<EventSubscription>
	/** The account's queues, for resolving a declared name to the id Cloudflare wants. */
	listQueues: (accountId: string) => Promise<QueueInfo[]>
}

/** Raised when a subscription cannot be reconciled as declared, with the fix in the message. */
export class SubscriptionProvisionError extends Error {
	override name = 'SubscriptionProvisionError'
}

/** What a reconciliation pass did. */
export interface SubscriptionProvisionResult {
	/** Subscriptions this pass created. */
	created: string[]
	/** Subscriptions already present. */
	existing: string[]
	/** Things worth saying that are not failures. */
	warnings: string[]
}

/**
 * A stable string for a source object, so two of them can be compared.
 *
 * Keys are sorted because JSON key order is not meaningful and Cloudflare is under no obligation to
 * return them as they were sent — comparing raw `JSON.stringify` output would report a subscription
 * as missing purely because the server echoed its fields in a different order, and a deploy would
 * then create a duplicate on every run.
 */
function sourceKey(source: EventSubscriptionSource): string {
	return JSON.stringify(
		Object.fromEntries(Object.entries(source).sort(([left], [right]) => left.localeCompare(right)))
	)
}

/** A one-line description of a subscription's source, for a message a human reads. */
function describeSource(source: EventSubscriptionSource): string {
	const detail = Object.entries(source)
		.filter(([field]) => field !== 'type')
		.map(([field, value]) => `${field}: ${JSON.stringify(value)}`)
	return detail.length > 0 ? `${source.type} (${detail.join(', ')})` : source.type
}

/**
 * @description Reconcile declared event subscriptions against the account.
 *
 * @param subscriptions - the config's `eventSubscriptions`. Absent or empty does no work.
 * @param accountId - the account.
 * @param api - the injected Cloudflare calls; dry-run passes a stub for the create.
 * @param result - the caller's accumulator, appended to IN PLACE so a throw still reports progress.
 * @throws {SubscriptionProvisionError} when a declared queue does not exist on the account.
 *
 * → NOTE: when a declared subscription is missing AND the account already has others, their sources
 *   are reported. That is the intended way to discover the field names for a source Cloudflare has
 *   not documented — create one in the dashboard, deploy, and read the shape back out of the output
 *   rather than guessing between `zoneId` and `zone_id`.
 */
export async function provisionEventSubscriptions(
	subscriptions: DevflareConfig['eventSubscriptions'],
	accountId: string,
	api: SubscriptionProvisionApi,
	result: SubscriptionProvisionResult
): Promise<void> {
	if (!subscriptions || subscriptions.length === 0) return

	const live = await api.listEventSubscriptions(accountId)
	const queues = await api.listQueues(accountId)
	const queueIdByName = new Map(queues.map((queue) => [queue.name, queue.id]))

	// Keyed by source AND queue: one source may legitimately feed two different queues, and one queue
	// may legitimately carry two different sources. Only the pair identifies a subscription.
	const present = new Set(
		live.map(
			(subscription) => `${sourceKey(subscription.source)}|${subscription.destination.queue_id}`
		)
	)

	for (const declared of subscriptions) {
		const queueId = queueIdByName.get(declared.queue)
		if (!queueId) {
			throw new SubscriptionProvisionError(
				`Event subscription for "${describeSource(declared.source)}" names the queue "${declared.queue}", which does not exist on this account. ` +
					'A subscription cannot create its own queue — declare it in `bindings.queues` so the same deploy provisions it first, or correct the name.'
			)
		}

		const key = `${sourceKey(declared.source)}|${queueId}`
		if (present.has(key)) {
			result.existing.push(`Subscription ${describeSource(declared.source)} → ${declared.queue}`)
			continue
		}

		// Reported BEFORE the create, so it is on record even if Cloudflare rejects the source shape —
		// which is the likely failure for a source its own schema does not document.
		if (live.length > 0) {
			result.warnings.push(
				`No existing subscription matches "${describeSource(declared.source)}" → ${declared.queue}. ` +
					`The account's current subscription sources are: ${live.map((subscription) => describeSource(subscription.source)).join('; ')}. ` +
					'If one of those is the subscription you meant, copy its source fields verbatim into your config — ' +
					'Cloudflare does not publish the request shape for every source, and the list above is the authoritative one.'
			)
		}

		await api.createEventSubscription(accountId, {
			name: declared.name ?? `devflare: ${declared.queue} ${declared.source.type}`,
			enabled: declared.enabled ?? true,
			events: declared.events,
			source: declared.source,
			destination: { type: 'queues.queue', queue_id: queueId }
		})
		result.created.push(`Subscription ${describeSource(declared.source)} → ${declared.queue}`)
		present.add(key)
	}
}
