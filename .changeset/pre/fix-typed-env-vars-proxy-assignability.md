---
"devflare": patch
---

Fix the typed `env` and `vars` runtime proxies so they are assignable to an
augmented `DevflareEnv` / `DevflareVars`. The proxy factory inferred its type
parameter from the internal getter (`Record<string, unknown>`) instead of the
exported type, so any consumer that declared `vars` (giving `DevflareEnv` /
`DevflareVars` required keys) hit a type error when importing `env` / `vars`
from `devflare/runtime`. The proxies now carry their declared types explicitly.
