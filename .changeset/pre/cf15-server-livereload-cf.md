---
"devflare": minor
---

Add two more local-dev `server` options, threaded into Miniflare's
`CoreSharedOptions` alongside the existing `https`/`inspectorPort`/`upstream`:

- `server.liveReload` — inject Miniflare's in-browser live-reload script so the
  page auto-refreshes when the dev runtime reloads (complements Devflare's own
  source watcher).
- `server.cf` — override the local `request.cf` (`IncomingRequestCfProperties`):
  `false` omits it, a string is a path to a JSON file, and an object injects
  custom cf metadata (colo, country, TLS, bot management, …) for testing cf-aware
  code under `devflare dev` without Cloudflare.

Both are local-dev only with no deploy effect.
