---
'devflare': patch
---

A worker's `console.warn` now shows in the `devflare dev` log as a warning instead of an error. The
dev servers routed workerd's `warn` and `error` lines alike to the logger's `error`, so every
warning printed with an ` ERROR ` badge. `warn` lines now go to the logger's `warn` (or
`console.warn` when the logger has none); `error` lines are unchanged.
