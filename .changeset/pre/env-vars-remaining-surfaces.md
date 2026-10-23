---
'devflare': patch
---

Resolve `env.NAME` vars on the dev and test surfaces that still handed them over as devflare's
internal descriptor object, and read each config's own `.env` before another config's.

- **A worker reached through a service binding** (`ref()`), under `devflare dev`, `devflare
  workspace dev` and `createTestContext()`. Its `env.NAME` vars are now resolved, and the
  `.dev.vars` beside its own config is applied, as wrangler does for each worker. Before, the
  descriptor object was handed to Miniflare as the binding's value, and `devflare dev` failed to
  start with a `ZodError` ("expected string, received object"). A required var with no value now
  fails with `EnvVarResolutionError`, naming the worker and its config, and `devflare dev` waits
  for the `.env` beside that worker's config to change, as it already did for the main config.
- **A config's own `.env` now outranks a value devflare copied in from another config's.**
  `loadConfig` copies each config's `.env` into `process.env`, so the second app of a workspace
  read the first app's value for a name both files set (and a referenced worker would have read
  the gateway's). The environment the process was started with still outranks every `.env` file,
  and a copied value still fills a name the config's own files do not set. A workspace SvelteKit
  app's Vite child is not covered: it inherits the copied values as its environment.
- **`createOfflineEnv()` and `createOfflineBindings()`** now resolve `env.NAME` vars from
  `process.env` in dev mode. `.dev()`, `.default()`, `.optional()` and `.parse()` apply, and no
  `.env` or `.dev.vars` file is read. Before, the env held the descriptor object.

  **Behaviour change:** these now throw `EnvVarResolutionError` where they used to return. A test
  whose config declares a required `env.NAME` var must set it in `process.env`, or give the
  descriptor a `.dev()` or `.default()` value.
