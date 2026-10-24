---
"devflare": minor
---

Add three first-class top-level Cloudflare deploy-policy config options: `logpush`, `uploadSourceMaps`, and `keepVars` (all `boolean`).

- `logpush` — send Trace Events from this Worker to Workers Logpush (does not create a Logpush job). Compiles to the Wrangler `logpush` key.
- `uploadSourceMaps` — include source maps when uploading this Worker. Compiles to the Wrangler `upload_source_maps` key.
- `keepVars` — keep dashboard-managed vars when Wrangler deploys this Worker (default `false`). Compiles to the Wrangler `keep_vars` key.

All three are per-environment overridable like other deploy-surface scalars. They previously required `wrangler.passthrough`.
