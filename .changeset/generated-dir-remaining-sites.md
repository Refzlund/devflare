---
'devflare': patch
---

Finish the `DEVFLARE_DIR` override — it was ignored on the path that actually runs.

`1.0.0-next.71` routed the generated root through one resolver, but seven sites still built
`.devflare` themselves, and one of them (`vite/plugin-context.ts`) is the dev-time writer — so
setting `DEVFLARE_DIR` changed nothing observable: `wrangler.jsonc` and `vite.config.mjs` still
landed in `.devflare`. Also fixed: the Vite plugin's log lines (which named `.devflare` while
writing elsewhere), the workflow entrypoints, the DO bundles, the Miniflare persist directory, the
workspace persist directory, and the adapter's `vite-build-output` staging directory.

A test now enumerates every source file that builds a path from a hardcoded `.devflare` and fails
on any that is not a documented exception (home caches, and `secrets.local.json`, which is authored
input rather than generated output and must stay findable). That test is what caught the seven —
an eyeball inventory had not.
