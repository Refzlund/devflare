---
'devflare': minor
---

`loadConfig` takes `dotenv: false`, and `compileBuildConfig` is exported from `devflare`.

`loadConfig({ cwd, dotenv: false })` skips the dotenv layer and nothing else. No `.env.public`,
`.env.dev` or `.env` is copied into `process.env`. c12's file resolution and `extends` layers, the
schema, `ref()` resolution and the framework providers all run as before. (Bun's own `.env` loading
happens before any script runs, so a process that must not see those files is started with
`bun --no-env-file`.) `compileBuildConfig(config, 'production')` is the offline compile `devflare
build` uses: the environment's overrides merged in and `wrangler.passthrough` applied last. A binding
configured by name stays a name, where `compileConfig` refuses it until `loadResolvedConfig` has
looked its id up.

A predeploy check grading a config under a controlled environment needed both. Before this, it
could either run the dotenv layer, letting an untracked file decide the answer, or import the
config module itself and read only its top-level `vars`. The second misses `env.production`,
`extends`, `wrangler.passthrough.vars` and a sibling `devflare.config.js`, which c12 loads ahead of
the `.ts`. The compiled `vars` are still not everything a deploy ships: an `env.X` descriptor stays a
descriptor until a deploy resolves it, and preview-scoped names read `DEVFLARE_PREVIEW_*`, which
`deploy --prod` clears. The docs say so. `loadConfig` still runs the layer by default.
