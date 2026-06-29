---
"devflare": minor
---

Fix route flags being emitted on the wrong route type, and add the remaining
local-dev `server` knobs.

- **Route `enabled` / `previews_enabled`** are valid only on a **custom-domain**
  route — wrangler's `zone_id` / `zone_name` route shapes are
  `additionalProperties: false` and reject them. Devflare now rejects them at
  config-parse time on non-custom-domain routes (with a clear error) and emits
  them only for custom-domain routes, so a config that validates locally is
  deploy-valid (previously `{ pattern, zone_id, enabled: true }` parsed but
  failed at deploy).
- **`server.inspectorHost`**, **`server.verbose`**, and **`server.logRequests`**
  are now accepted on the dev `server` config and threaded into Miniflare's
  shared options — the remaining user-facing local-dev knobs alongside
  `https`/`inspectorPort`/`upstream`/`liveReload`/`cf`. Local-dev only, no deploy
  effect.
