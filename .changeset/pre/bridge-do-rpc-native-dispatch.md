---
'devflare': patch
---

Fix `devflare dev`: bridge Durable Object RPC **method** calls (e.g.
`stub.push(arg)`, `stub.pull(since)`) when the DO also defines a custom `fetch()`
handler.

The local dev gateway routed every DO method call through the DO's `fetch()`
using an internal `_rpc` convention. A DO that `extends DurableObject` and
overrides `fetch()` — for example a websocket-only handler that returns `426`
for non-upgrade requests — received that probe on its own `fetch()`, returned a
non-JSON body, and the call failed with a bogus `... is not valid JSON` error.

The gateway now dispatches method calls natively (`stub[method](...args)`) —
exactly as on real Cloudflare, and matching what `devflare/test` already did —
and only falls back to the `_rpc` fetch convention for Durable Objects that are
not RPC-enabled. The `.fetch()`/WebSocket bridge paths are unchanged and still
reach the user handler.
