---
'devflare': patch
---

Fix a Vite app's `platform.env` reading another config's `.env` over its own.

`devflare dev` and `devflare workspace dev` copy each config's `.env` into their own process
environment as they load it: every workspace app's, and every worker a config references. When
devflare resolves a config's `env.NAME` vars it ranks those copies below that config's own `.env`
files. A Vite app's Vite child inherited the same values as ordinary environment, though, and there
they outranked the app's own `.env`. So when two configs' `.env` files set one name, the app's
workers read the app's own value, and `platform.env` read the other config's.

The coordinator now tells the Vite child which of the values it inherits were copied from a `.env`
file, in a new variable, `DEVFLARE_COPIED_DOTENV_NAMES`. It carries the names only, never values.
devflare's SvelteKit `handle` ranks those values as the coordinator does. A copied value still fills
a name the app's own `.env` files lack, and a value from the shell that started the coordinator
still outranks every `.env` file.

**Behaviour change:** in that case, `platform.env` (and SvelteKit 3's `cloudflare:workers` `env`)
now serve the app's own `.env` value, which its workers already had. Nothing else changes:

- The Vite child's `process.env` holds the same values as before, so app code and `vite.config.ts`
  see the same environment.
- A workspace app's manifest `env` still wins, as documented.
- A copied value for a name devflare sets itself on the Vite child (`DEVFLARE_*`, `FORCE_COLOR`)
  is not ranked as a copy, since devflare may have replaced it there. It ranks as before.

The workspace manifest's documentation of `env` now also says that a var a config computes from a
manifest-only value differs between the Vite child and the app's workers, as bindings already did.
