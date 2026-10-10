---
"devflare": patch
---

Say so when Cloudflare owns a declared DNS record, instead of failing with its error code.

Enabling Email Routing or onboarding a sending domain makes Cloudflare write AND LOCK records of its
own, and one of them lands on a name a config legitimately wants: the DMARC policy at
`_dmarc.<domain>` sits at the zone apex, not under the `cf-bounce` subdomain the rest of the managed
set uses. So a perfectly reasonable `dns: [{ type: 'TXT', name: '_dmarc', … }]` beside
`emailSending.enable` collides with Cloudflare for the record — and a write to a locked record
answers HTTP 400 code 1046, which reached the operator as a bare Cloudflare error naming neither the
record nor the remedy.

A deploy now reads the record's `meta` and, when Cloudflare owns it, reports what is actually live
versus what the config declared and stops there. It does not throw, and the asymmetry with the
ambiguous-record-set error beside it is deliberate: that one throws because guessing could DESTROY
an unrelated record, while this one destroys nothing — it only means a value the config claims to
control is not in effect, which must not block shipping the worker the deploy is about.

For DMARC the warning says the part that is easy to miss: without your own `rua=`, aggregate reports
go nowhere, so there is never any evidence on which to tighten the policy — and that is invisible by
construction, because a domain with a working `p=none` looks exactly like one that is collecting.

A locked record whose content already MATCHES the declaration stays an ordinary converged result
rather than a warning; `meta` is opaque in Cloudflare's published schema and these keys are observed
rather than documented, so a record that says nothing about itself is treated as ordinary.
