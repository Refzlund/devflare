---
'devflare': minor
---

`resolveConfigEnvVarsFromSources` is exported from `devflare`: the `env.X` descriptor resolution
`devflare build` and `devflare deploy` run, from values the caller passes, reporting a missing
required variable instead of throwing.

`resolveConfigEnvVarsFromSources(config, { environment, sources, mode })` merges the environment's
`env.<name>` section over the base and then resolves every descriptor in the merged `vars`, in that
order, as a build does. `mode` defaults to `build`, where `.dev()` and `.absentInDev()` do not
apply. A descriptor reads `sources` and nothing else: no `.env` file, and `process.env` only if
that is what is passed (as a plain object, such as `{ ...process.env }`). Preview-scoped names are
materialised as a build materialises them, from `DEVFLARE_PREVIEW_*` in `process.env`. It returns
`{ config, missing }`. A required variable with no value is listed in `missing`, with its path
under `vars`, and left out of `config.vars`; a parser that refuses a value still throws, with
`code: 'ENV_VAR_PARSE_FAILED'`. The returned `config` has no `env` sections, so compiling it
again for the environment cannot merge an unresolved descriptor back in. Compile the result with
`compileBuildConfig(config, undefined, { alreadyResolved: true })`, as `deploy --dry-run` does.

A predeploy check needed this to see what a `.default()` ships. `loadConfig({ dotenv: false })` and
`compileBuildConfig` left each descriptor as an object, so a check reading `vars` as strings passed
`env.SHARE_ORIGIN.default('http://localhost:5991')` while a deploy shipped the localhost address.
The internal resolvers were no substitute: they read the dotenv files, and in build mode they throw
on a required variable with no value, which fails a correct config that nobody has provisioned in
the check's environment. Those resolvers stay internal and now share this one's core, so all of
them resolve in the same order.
