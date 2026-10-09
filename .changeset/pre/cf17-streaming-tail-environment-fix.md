---
"devflare": patch
---

Fix `streamingTailConsumers` rejecting `environment` at config-parse time.
Wrangler's `StreamingTailConsumer` accepts only `service` (`additionalProperties:
false`) — unlike `tailConsumers`, it has no `environment` field. The object form
previously modeled an optional `environment` (mirrored from `tailConsumers`),
which devflare accepted and compiled into the Wrangler config, so a config that
set it validated locally but failed at deploy. `environment` is now removed from
the streaming-tail schema, input type, and compiler output, so it is rejected up
front with a clear error — keeping local validation equivalent to a deploy-valid
config. (The regular `tailConsumers` `environment` field is unchanged.)
