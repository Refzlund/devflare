---
'devflare': patch
---

Fix `devflare workspace dev` dropping a Vite app's per-app `env`.

A manifest accepted `env` on a `vite: true` app (a SvelteKit app, say) and gave it only to that
app's workers in the shared instance. A Vite app is not served by those workers: its Vite child
reads the app's config itself and builds `platform.env` in its own process. So the values never
arrived there, and a config reading `process.env.API_ORIGIN` answered with its own default.

For a Vite app, `env` now also reaches the Vite child:

- **Its process environment.** Each entry is set there, over anything inherited from the shell, so
  the app's `devflare.config.ts`, which the child evaluates, reads it from `process.env`. The child
  still inherits the coordinator's environment as before, except `DEVFLARE_INJECTED_VARS`, which
  devflare now sets per child.
- **`platform.env`.** devflare's SvelteKit `handle` layers the entries over the config's `vars`,
  as the workspace already did on the app's workers. That covers `event.platform.env` and, on
  SvelteKit 3, the `cloudflare:workers` `env`.

The coordinator's own read of the config, which decides the bindings each app gets in the shared
instance, still does not see `env` in `process.env`. So do not make the bindings a config declares
depend on a value only the manifest's `env` sets: the coordinator and the Vite child would disagree
about them. And the layering over `vars` is the `handle`'s alone: the custom `createHandle()`,
which never serves config `vars`, and the `wrangler.jsonc` the Vite plugin generates carry only
what the config itself puts in `vars`.

**A manifest that sets a `DEVFLARE_*` key in any app's `env`, or `FORCE_COLOR` in a Vite app's,
now fails to load.** Those names are devflare's own. It injects `DEVFLARE_*` values into an app's
workers (the R2 presign secret and origin, when the app binds R2), and until now a manifest key of
the same name silently replaced devflare's, which broke its own wiring. It also sets `DEVFLARE_*` values and `FORCE_COLOR`
on the Vite child (bridge port, config path, …), which now receives `env` too. The error names
the app and the key; rename the key. A worker app may still set `FORCE_COLOR`.
