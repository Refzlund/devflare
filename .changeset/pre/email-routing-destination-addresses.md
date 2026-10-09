---
'devflare': patch
---

Create Email Routing DESTINATION ADDRESSES before the rules that forward to them — which is what
sends the verification email somebody has to click.

Creating a forwarding rule does not create the address it points at. Cloudflare accepts the rule
against an address it has never heard of and then silently drops every message: no error, no bounce,
no log. And because adding the ADDRESS is what triggers the verification mail, a deploy that created
only the rule left the operator waiting for a link that could not arrive — which is exactly what
happened.

A deploy now ensures every address named by `emailRouting.rules[].forward` or
`emailRouting.catchAll.forward` exists as a destination on the account, before creating any rule.
Adding one is reported and warned about, because the rule is live and dropping mail until the click
happens. An address that already exists but is UNVERIFIED warns too, rather than failing: the click
belongs to whoever owns that mailbox and may be days away, and failing there would make a correct
configuration unshippable until somebody read their email.

Stubbed under `--dry-run` like every other zone mutation.
