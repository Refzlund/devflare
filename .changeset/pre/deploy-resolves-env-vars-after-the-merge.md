---
'devflare': patch
---

`devflare deploy` now resolves `env.X` descriptors after it merges the target environment. `devflare build` and `deploy --dry-run` already worked this way.

Before this, a deploy resolved only the base `vars` and merged `env.<name>` afterwards. A descriptor in `env.production.vars` (or in `env.preview.vars` for `--preview`) therefore reached the Worker unresolved: the var held the object `{"__devflareEnvDescriptor":true,…}` instead of its string, while the dry run printed the right value. A deploy also demanded a required base descriptor that the environment replaces. Build, dry run and deploy now resolve through one call, so a deploy ships the values its dry run prints.

The same ordering caused two other symptoms, and both are fixed:

- Every deploy of a config with an `env` section for its target warned "source config changed since build" about the artefact it had just built.
- The dry run's "Resolved view" showed `env.<name>.vars` descriptors unresolved.
