---
'devflare': patch
---

Fix a workspace Vite app's `platform.env` reading another app's `.env` over its own.

`devflare workspace dev` copies each app's `.env` into its own process environment as it loads
that app's config. When devflare resolves a config's `env.NAME` vars it ranks those copies below
that config's own `.env` files. A Vite app's Vite child inherited the same values as ordinary
environment, though, and there they outranked the app's own `.env`. So when two apps' `.env` files
set one name, the app's workers read the app's own value, and `platform.env` read the other app's.

The coordinator now tells the Vite child which of the values it inherits were copied from a `.env`
file, in a new variable, `DEVFLARE_COPIED_DOTENV_NAMES`. It carries the names only, never values.
devflare's SvelteKit `handle` ranks those values as the coordinator does. A copied value still fills
a name the app's own `.env` files lack, and a value from the shell that started the coordinator
still outranks every `.env` file.

**Behaviour change:** in that case, `platform.env` (and SvelteKit 3's `cloudflare:workers` `env`)
now serve the app's own `.env` value, which its workers already had. The same holds when something
in the Vite child, `vite.config.ts` say, writes one of those names into `process.env` before the
first request: the handle records the written value as the copy, so `platform.env` reads the app's
own `.env` value where it used to read the written one. Otherwise nothing changes:

- The Vite child's `process.env` holds the same values as before, so app code and `vite.config.ts`
  see the same environment.
- A workspace app's manifest `env` still wins, as documented.
- A copied value for a name devflare sets itself on the Vite child (`DEVFLARE_*`, `FORCE_COLOR`)
  is not ranked as a copy, since devflare may have replaced it there. It ranks as before.
- The Vite plugin resolves the config while `vite.config.ts` is evaluated, before the handle
  records anything. Its context, `.devflare/wrangler.jsonc` and the workers it binds still rank
  those values as before; none of that reaches `platform.env`.
- The coordinator resolves each app before it copies the `.env` of the apps listed after it, while
  the Vite child inherits every app's. So an optional or `.dev()` `env.NAME` that an app's own files
  lack still reads a later app's value in `platform.env` and its fallback in the workers. A required
  one fails in the coordinator.

The workspace manifest's documentation of `env` now also says that a var a config computes from a
manifest key, or declares as `env.NAME` with one as NAME, differs between the Vite child and the
app's workers, as bindings already did.
