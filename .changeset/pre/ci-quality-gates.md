---
"devflare": patch
---

Fix default service-binding RPC worker discovery: `resolveServiceBindings` /
`findDefaultServiceWorkerEntrypoint` now also resolve a package's root-level
`worker.{ts,js}` (not only `src/worker.{ts,js}`), so a referenced worker that
keeps its entrypoint at the package root exposes its default RPC surface in
local tests and dev. (Also: internal quality gates — biome lint is now enforced
on the published package and releases are gated on typecheck + unit tests.)
