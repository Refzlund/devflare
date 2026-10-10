---
"devflare": patch
---

Phase F — architecture & docs close-out. Documentation now correctly describes
`files.tail` as a public config key (auto-discovers `src/tail.ts` when unset,
accepts a custom path, or `false` to disable) alongside the other handler
surfaces, and the watched dev-reload root lists include tail. Adds a clarifying
note that the phased `resolveResources({ phase })` seam is the canonical
resource-resolution path and the remaining env-overlay-only callers are by
design. Removes a stale test-helper reference in the binding-hints comment.

Internal: the lint gate no longer fights `changeset version` over `package.json`
(its JSON writer multi-lines arrays that biome's formatter would re-collapse), so
CI stays green on the commit after every release bump.
