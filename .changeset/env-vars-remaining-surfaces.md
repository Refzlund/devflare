---
'devflare': patch
---

Resolve `env.NAME` vars on the dev and test surfaces that still handed them over as devflare's
internal descriptor object.

- **A worker reached through a service binding** (`ref()`), under `devflare dev`, `devflare
  workspace dev`, `createTestContext()` and the Vite plugin. Its `env.NAME` vars are now resolved,
  and the `.dev.vars` beside its own config is applied, as wrangler does for each worker. Before,
  the descriptor object was handed to Miniflare as the binding's value. A required var with no
  value now fails with `EnvVarResolutionError`, naming the worker and its config.
- **`createOfflineEnv()` and `createOfflineBindings()`** now resolve `env.NAME` vars from
  `process.env` in dev mode. `.dev()`, `.default()`, `.optional()` and `.parse()` apply, and no
  `.env` or `.dev.vars` file is read. Before, the env held the descriptor object. A required var
  that is unset now throws `EnvVarResolutionError`, naming it.
