---
"devflare": minor
---

Wire deploy-modeled-only bindings into local development. Analytics Engine now
binds in local dev (Miniflare's write-only no-op stub, so `writeDataPoint()` no
longer throws), tail consumers are delivered locally when the consumer Worker is
present in the same dev instance (the tail handler was already testable via
`cf.tail.trigger()`), and the mTLS `remote` flag is forwarded to the local
binding so deploy and local dev agree on the binding shape. Wired consistently
across the dev server, the cross-process bridge, and the test context.
