---
'devflare': minor
---

New top-level `zones` config: Email Routing rules and DNS records, declared per domain and
reconciled at deploy. These are the first ZONE-scoped resources Devflare provisions — everything
until now lived under `/accounts/{id}`, while a zone is a different identifier reached by a
different lookup and gated by a different token scope.

```ts
zones: {
	'example.com': {
		emailRouting: {
			enable: true,
			rules: [{ to: 'support@example.com', worker: 'example-api' }],
			catchAll: { drop: true }
		},
		dns: [{ type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none' }]
	}
}
```

**Keyed by domain, not by zone id**, because a domain is what an author knows. Devflare walks the
labels up to the apex, so `mail.example.com` is configured under its own name and its records land
in the `example.com` zone. A relative record name resolves against the DOMAIN it was declared under
rather than the zone apex — for a subdomain those differ, and the apex is the wrong place.

**Reconciled, not replayed.** Rules match on the address they claim and records on type and name, so
deploying twice is a no-op rather than a pile of duplicates. Nothing is ever deleted: a zone almost
always carries rules and records the config never mentioned. A rule that exists but points somewhere
else is REPORTED rather than rewritten — a live mail route edited by hand is more likely deliberate
than stale. A declared DNS record is the opposite: it is rewritten to match, because that is what
makes a staged DMARC rollout a config edit instead of a dashboard visit. Do not declare a record
another system writes.

**Enabling Email Routing is never inferred.** It rewrites the zone MX records, changing where all
mail for the domain is delivered — too large a side effect to follow from someone adding a
forwarding rule. `enable: true` is the authorization; without it, a zone with routing off fails the
deploy and says what to do.

`--dry-run` substitutes every zone mutation, enabling included, while the reads still happen — so
the plan reflects the real mix of what exists and what does not, without a single write. Two other
gaps closed alongside it: the dry-run plan was omitting Vectorize and Hyperdrive from its
`Would create:` list, and `schema-types-email.ts` was never added to the type-documentation gate, so
the most recent authoring mirror shipped unenforced.

No permission work is needed: the token patterns Devflare already mints against cover zone-scoped
DNS and Email Routing.
