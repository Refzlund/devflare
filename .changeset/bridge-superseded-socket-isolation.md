---
"devflare": patch
---

Stop a retried bridge connect from tearing down the connection it just established,
and stop the SvelteKit handle from blaming a request's own error on the platform.

**`BridgeClient` — a superseded socket could dismantle the live connection.** A refused
socket rejects on `error` but stays alive until its `close` arrives, so a caller that
retries in between replaces `this.ws` while the old socket is still wired to its
handlers. Those handlers were unconditional: the abandoned socket's `close` ran
`handleDisconnect()` — clearing `isConnected`, dropping the codec and rejecting every
in-flight call on the connection that had just replaced it — while a late `open`
installed a second codec over the live one, and either could clear another attempt's
in-flight marker. The connect timeout, too, closed whichever socket was current rather
than the one that attempt opened. Every handler now acts only while its own socket is
still the client's, and settles its own attempt. Overlapping attempts were rare when a
request connected once; `connectBridgeWithRetry` (added in the previous release) retries
~20 times inside a single request, which makes them routine — so a bridge that blinked
during an HMR reload could leave the client wedged rather than reconnected.

**`devflare/sveltekit` — the platform fallback caught the whole request.** The `try` in
`handle`/`createHandle` spanned both `createDevflarePlatform()` and `resolve(event)`, so
an error thrown anywhere downstream was logged as `[devflare] Failed to create platform`
— hiding the real cause behind a wrong diagnosis — and the request was then re-run via
the fallback. That re-run repeated every side effect the first pass had already
performed, and ran outside the request context devflare had established for it, so
`getContext()`/`env()` throw during the retry. The fallback is now scoped to building the
platform: a request that fails on its own merits propagates, once. A genuine platform
failure still falls through to an unbridged `resolve()` exactly as before.
