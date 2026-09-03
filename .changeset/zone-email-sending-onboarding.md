---
'devflare': minor
---

`zones['<domain>'].emailSending` — check, and optionally perform, Email Sending onboarding at deploy.

Email Sending is a different Cloudflare product from Email Routing that happens to share a zone.
Routing is INBOUND: what happens to mail arriving for the domain. Sending is OUTBOUND: whether a
Worker's `send_email` binding may send from an address there. A domain that does both is onboarded
to both, separately — and a subdomain gets its own DKIM key rather than inheriting the apex one.

```ts
zones: {
	'example.com': { emailSending: { enable: true } }
}
```

Declaring it makes every deploy CHECK: the domain must be onboarded and enabled, or the deploy fails
and names both ways to fix it (`enable: true`, or `wrangler email sending enable <domain>`). That
turns the failure mode from a silent one into a loud one — a binding that is fine in config and
rejected at send time, on a domain nobody remembered to onboard.

`enable: true` performs the onboarding. It is opt-in for the same reason `emailRouting.enable` is:
Cloudflare writes AND LOCKS a set of DNS records in the zone — the `MX` and SPF `TXT` on
`cf-bounce.<domain>`, a DKIM key at `cf-bounce._domainkey.<domain>`, and a DMARC policy at
`_dmarc.<domain>`. Two consequences worth knowing: a record you declare under `dns` that collides
with one of those is fighting Cloudflare for it, and a DMARC record may already exist and not be
yours.

DNS readiness is REPORTED, never waited on. Cloudflare writes the records at onboarding but they
take minutes to propagate, so a fresh domain is legitimately unready for a while and failing there
would fail a deploy that did everything right. A status of `ready` or `unlocked` passes — `unlocked`
means the records are correct and only a managed lock was cleared — while `unconfigured` and
`misconfigured` become a warning carrying Cloudflare's own error codes (`dkim.missing`,
`spf.multiple`, and so on), because a sender whose DKIM never landed otherwise looks provisioned
while every message fails authentication.

Onboarding is stubbed under `--dry-run` like every other zone mutation. One caveat, stated plainly:
Cloudflare's API schema declares key-based auth for these endpoints and omits API tokens, unlike the
sibling send endpoints. If a token-authenticated onboarding is refused, the error says so and points
at the `wrangler` command, which needs running only once.
