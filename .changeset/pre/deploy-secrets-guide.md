---
"devflare": patch
---

Clarify the Cloudflare permission-group display-name fallback warning: it now
points maintainers at `refresh-permission-groups` (which regenerates the verified
ids) instead of asking them to hand-edit the generated id map. Also adds a deploy
& secrets maturity guide (auto-provisioning matrix, partial-deploy orphan
behavior, secrets boundary, per-environment scoping, permission-group refresh).
