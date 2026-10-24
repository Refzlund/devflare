---
"devflare": minor
---

Add build-time safety checks and cron validation. Cron expressions are now
validated against Cloudflare's 5-field grammar (`src/config/cron.ts`) at
config-parse time (a `.superRefine()` on `triggers.crons`) and in
`cf.scheduled.trigger(cron)`, so a typo like `cf.scheduled.trigger('* * *')`
fails with an actionable message instead of silently passing. The explicit
2-arg fetch-handler style requirement is now also checked at dev-start / `build`
time (`validateFetchHandlerStyle()` in the shared worker-load chokepoint),
reusing the exact same resolver and style markers as the request-time check —
zero false positives, with the runtime check kept as the backstop. Finally, a
successful **production** deploy prints a one-line hint that runtime secrets are
set via `wrangler secret put` / the dashboard (devflare never sends secret
values to Cloudflare); the hint never fires on preview or dry-run deploys.
