---
'devflare': patch
---

Carry `namespaceId` through to Miniflare, so a config declaring `bindings.rateLimits` can start a
local runtime at all.

Miniflare's rate-limit option grew a required `namespace_id` in 4.20260730.0 — counters are keyed by
the namespace rather than by the binding name, so two bindings on one namespace share a limit and
one binding name pointing at different namespaces stays isolated. Devflare kept emitting the older
`{ simple: { limit, period } }` and dropped the authored `namespaceId` on the floor. That is not a
limiter that behaves oddly: options are validated in the constructor, so the whole session died at
boot with `Unexpected options passed to new Miniflare() constructor` naming
`namespace_id: undefined`, taking every other binding down with it. Any `devflare dev` or
`createTestContext()` on a config with a rate limiter was unusable.

The wrangler compiler was never wrong — it has always mapped `namespaceId` → `namespace_id` and
emitted the `ratelimits` array correctly. Only the Miniflare-options side dropped it, and it dropped
it in THREE places, because the same eight-line mapping had been copy-pasted into the dev server,
the bridge, and the test harness. Fixing one would have left the other two, so they now all call the
one `buildRateLimitsConfig`. That asymmetry is also why it shipped: a consumer verified the emitted
wrangler config, and nothing on either side of the review had ever booted a local runtime with a
rate limiter in it.

**The dependency floor stays at `^4.20260424.0`.** The range spans both schema generations, so the
question is whether emitting `namespace_id` breaks the older one — and it does not: that schema is a
plain non-strict `z.object`, which strips the unknown key. Verified against the installed dists
rather than assumed — 4.20260424.0 and 4.20260625.0 both parse the field away and boot, 4.20260730.0
requires it. Emitting it is therefore correct across the whole declared range, and raising the floor
would fix nothing while forcing a second miniflare and a second workerd alongside the copy wrangler
pins exactly. One caveat worth knowing: below 4.20260730.0 Miniflare keys its counters by BINDING
NAME, so two bindings sharing a namespace do not share a limit locally on those versions. Deployed
behaviour is unaffected — that has always come from the wrangler config.

Covered two ways, because on the pinned floor those two are not the same test. A unit assertion pins
the built options to the authored `namespaceId` (including two bindings on a shared namespace) and
fails without the fix; an integration test boots `createTestContext()` on a config with two rate
limiters and asserts the limiter actually enforces — which is the boot that was missing, and which
starts catching the omission itself the moment this repo's own miniflare floats past 4.20260730.0.
Worth naming as the deeper cause: the lockfile here pins 4.20260424.0 while `^4.20260424.0` floats
every fresh consumer install onto the newer schema, so devflare's suite was not running what its
users run.
