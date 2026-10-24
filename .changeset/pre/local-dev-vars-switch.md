---
'devflare': minor
---

`DEVFLARE_LOCAL_DEV_VARS=off` turns the local-vars overlay off. In dev, Devflare lays the app
directory's `.dev.vars` (`.dev.vars.<env>` when `CLOUDFLARE_ENV` names one), or without it
wrangler's `.env` fallback, over a config's `vars`. That beats whatever the config computed from the
environment, so a launcher that decides those values itself had no way to hold them. A test harness
pointing a server at its own instance is the motivating case: a stray `.dev.vars` in the app
directory could point it somewhere else.

With the switch off, `applyLocalDevVarsToConfig` returns the config unchanged and reads none of those
files, so `vars` are exactly what the config and its `env.NAME` descriptors resolved to. It covers
every path that resolves through `resolveDevConfig`: the dev server, a workspace app, Miniflare
started from a config, the test contexts and the SvelteKit `platform.env`. It does not reach
wrangler's own read, so an app that hands `getPluginContext().cloudflareConfig` to
`@cloudflare/vite-plugin` still gets `.dev.vars` in that plugin's worker.

It is read from `process.env` at resolution time, so a Vite child inherits it from `devflare dev`. In
`workspace dev` it is set on the coordinator, since a manifest's per-app `env` cannot carry a
`DEVFLARE_` key. `0`, `false`, `no` and `off` turn it off; `1`, `true`, `yes`, `on`, empty or unset
keep the overlay. Any other value is refused with an error naming it, because a launcher sets this
to keep the overlay off and a misspelling would otherwise leave it on. The ancestor `.env` walk that
feeds `env.NAME` descriptors is not affected.

The variable's name is exported from the root entry, and from the worker-safe browser entry, as
`LOCAL_DEV_VARS_ENV`, so a launcher and a test asserting it can name the same variable.
