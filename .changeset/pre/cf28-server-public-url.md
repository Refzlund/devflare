---
"devflare": patch
---

Add the `server.publicUrl` local-dev knob.

`publicUrl` is the public-facing URL the local dev runtime advertises for itself
(served on Miniflare's `/core/public-url` loopback; otherwise the runtime entry
URL) — set it when the dev runtime sits behind a reverse proxy, tunnel, or custom
domain so the Worker reports the externally-visible origin. It maps to Miniflare's
`publicUrl` and is the final user-facing `CoreSharedOptions` knob, a sibling of the
already-wired `upstream`/`cf`/`liveReload`. Local-dev only — no deploy effect (no
wrangler analogue).
