---
"devflare": minor
---

Remove the `@deprecated ContextUnavailableError` alias. Its rich
`nodejs_compat`-mentioning message is now produced by the canonical
`ContextAccessError` via the new `ContextAccessError.contextUnavailable()`
factory, and the per-surface getters / `getContext()` throw that instead.

Breaking removal (pre-1.0): code that imported `ContextUnavailableError` from
`devflare/runtime` must switch to `ContextAccessError`. Code that caught
`ContextAccessError` is unaffected — the removed alias was already a subclass,
so the thrown instances are still `instanceof ContextAccessError`.
