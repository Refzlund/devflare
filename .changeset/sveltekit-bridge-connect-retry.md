---
"devflare": patch
---

Ride out a transient bridge outage when creating the SvelteKit dev platform, so a
worker reload no longer 500s in-flight requests with a missing binding.

`createDevflarePlatform` connected to the bridge with a single attempt: the moment
the bridge socket was refused — which happens for a fraction of a second on every
HMR worker reload, config change, or brief coordinator restart — `connect()`
rejected, the SvelteKit handle caught it and fell through **without** setting
`event.platform`, and the request 500s with "`<BINDING>` (D1/KV/R2) binding is
missing". Because the platform isn't cached when an app uses local binding shims
(e.g. an R2 binding), this hit essentially every request that landed in a reload
window, making the errors feel constant during development.

The connect now retries for a short bounded window (`connectBridgeWithRetry`,
default ~3s at 150ms intervals) so the reconnect lands and the request proceeds
with its bindings intact. A bridge that is genuinely down still surfaces the error
promptly once the budget is spent, so a real misconfiguration fails fast rather
than hanging every request.
