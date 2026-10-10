---
'devflare': patch
---

Fix `platform.env` in a SvelteKit app under `devflare dev` and `devflare workspace dev`: a var
declared as `env.NAME` now arrives as its value, and the app's `.dev.vars` is applied. The
SvelteKit handle in the Vite child read the config without resolving it, so such a var reached
the app as devflare's internal descriptor object instead of the string a worker gets, and
`.dev.vars` entries were missing altogether.

The handle now reads the config through the same step as the dev coordinator, the workspace
coordinator, Miniflare started from a config, and the test contexts, so a var has the same value
on every one of them. A required `env.NAME` var with no value now fails the request with
`EnvVarResolutionError`, naming the variable. Before, the app received the descriptor object.
Once `.env` supplies the value, the next request reads it; no restart is needed.
