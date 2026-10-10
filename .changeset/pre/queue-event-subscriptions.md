---
'devflare': minor
---

`eventSubscriptions` — declare which platform events Cloudflare publishes onto which Queue, and
reconcile them at deploy.

```ts
eventSubscriptions: [
	{
		queue: 'email-events',
		source: { type: 'email.sending', zone_id: 'ZONE_ID', domain: 'example.com' },
		events: ['message.delivered', 'message.bounced']
	}
]
```

The queue is named rather than identified and Devflare resolves the id; declare it in
`bindings.queues` and the same deploy provisions it first, because a subscription cannot create its
own and Cloudflare offers no create-if-missing.

**Matched on (source, queue), never on name.** A name is cosmetic, and one created by hand in the
dashboard will not carry the name Devflare would have written — matching on it would add a second
subscription beside the working one, and both would deliver, doubling every event onto the queue.
Source objects are compared with their keys sorted, because Cloudflare is under no obligation to
echo fields in the order they were sent and a raw JSON comparison would create a duplicate on every
deploy. Nothing is deleted or updated: a subscription is a live delivery path, and changing which
events it carries is a decision rather than a reconciliation.

**`source` is a passthrough, deliberately.** Cloudflare publishes eight source types in its API
schema and ships ten in wrangler, and Email Sending — generally available and documented since July
2026 — appears in neither. A modelled union would reject sources that work, so the object is
forwarded verbatim.

That leaves the question of what to put in it for an undocumented source, and the honest answer is
that guessing is not safe: the sample event payloads use camelCase while every verified request
shape uses snake_case, so `zoneId` and `zone_id` are a coin flip that fails at deploy time inside a
tool whose whole promise is that the config is correct. So Devflare does not guess and does not ask
you to either — when a declared subscription matches nothing, it prints the `source` of every
subscription the account already has, exactly as Cloudflare stores it. Create one in the dashboard,
deploy once, and copy the field names out of the output.

Two things that are easy to get wrong and are called out in the docs: `events` takes the SHORT form
(`message.delivered`), not the `cf.email.sending.message.delivered` that arrives ON the queue — the
prefixed form subscribes to nothing, silently. And preview deploys provision no subscriptions, for
the same reason they provision no zone resources: a subscription is account-wide and would outlive
the branch that made it.
