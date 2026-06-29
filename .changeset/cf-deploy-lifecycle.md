---
"devflare": minor
---

Add deploy-lifecycle parity. `devflare deploy --prod --percentage <n>` performs a
gradual/canary rollout (uploads a new version with `wrangler versions upload`,
then shifts `<n>%` of traffic to it via `wrangler versions deploy <id>@<n>`, with
an optional `--version` to pin the version keeping the remainder) — production
only, never shifting traffic on preview/dry-run. New `devflare tail` command
streams a deployed worker's live logs over Cloudflare's tail API (`--format
pretty|json`, clean teardown on exit).
