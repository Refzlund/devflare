---
"devflare": patch
---

Rebuild the local runtime when it dies, instead of serving every request against a runtime that is gone.

Miniflare runs the worker in a workerd child process, and that child can die on its own — devflare
never initiates it, and nothing was watching for it. When it happened the dev server carried on as if
nothing had: the coordinator stayed up, Vite kept serving, and every request failed to reach the
bridge. SvelteKit apps surfaced this as `[devflare] Failed to create platform: WebSocket connection
failed` followed by a spurious "`<BINDING>` (D1/KV/R2) binding is missing" — each request first
burning the bridge-connect retry budget, so the app got slower as well as broken. Nothing in the log
said the runtime had gone, and the only way back was to restart `devflare dev`.

`devflare dev` now probes the runtime for liveness (a plain TCP connect, every 2s; the measured
downtime of a legitimate `setOptions` reload is ~150ms, well inside the ~4s it takes three consecutive
failures to accumulate). A death is rebuilt through the same queue that serves config- and
worker-driven reloads, so a rebuild can never race one, and the schema is re-applied afterwards
because a rebuilt runtime starts empty unless storage is persisted. A runtime that will not come back
is retried a bounded number of times and then reported plainly, so the underlying error stays visible
instead of being buried under restart noise.

Reloading is also no longer able to talk to a corpse: `setOptions` is only used when the runtime
answers, and a runtime that does not is discarded and rebuilt.

`devflare workspace dev` builds its shared Miniflare on a separate path and is NOT covered by this —
it has the same exposure, and wiring the same watchdog in is a follow-up.
