---
'devflare': patch
---

Fix `platform.env` in a SvelteKit app under `devflare dev` and `devflare workspace dev`: a var
declared as `env.NAME` now arrives as its value, and the app's `.dev.vars` is applied. The
SvelteKit handle in the Vite child read the config without resolving it, so such a var reached
the app as devflare's internal descriptor object instead of the string a worker gets, and
`.dev.vars` entries were missing altogether.

The handle now resolves the config through the same step as the dev coordinator, the workspace
coordinator, Miniflare started from a config, and the test contexts. A required `env.NAME` var
with no value no longer reaches the app as the descriptor object: on that request every binding
read throws `EnvVarResolutionError`, naming the variable. Once `.env` supplies the value, the
next request reads it without a restart.
