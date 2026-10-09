---
"devflare": patch
---

Make the Cloudflare support documentation accurate and surface offline-binding gaps:

- Reconcile the docs-site support labels with the authoritative support matrix:
  Hyperdrive, Browser Rendering, Worker Loaders, Images, Media Transformations,
  and Analytics Engine are now marked **Limited** (each has a code-backed local
  gap — e.g. Hyperdrive `connect()` and Worker Loaders `getDurableObjectClass()`
  throw) instead of overstating them as Full.
- Correct the matrix's Analytics Engine classification: it is **not** an inherent
  remote-only boundary — it is simply not yet wired into the local Miniflare
  worker (Miniflare's native plugin is a write-shape-only no-op).
- Document that Static Assets (`assets`) and cross-worker Tail consumers
  (`tailConsumers`) are compiled for deploy but not served/delivered locally, and
  that Cron triggers' scheduled handlers are locally invokable via the test layer
  (distinct from the wired `files.tail` handler surface).
- `createOfflineEnv()` / `createOfflineBindings()` now report core storage
  bindings (KV/D1/R2/Queues/Durable Objects/Services) that are present in config
  but only available via `createTestContext()` as explicit `missingFixtures`
  entries, instead of leaving `env.X` silently `undefined`.
