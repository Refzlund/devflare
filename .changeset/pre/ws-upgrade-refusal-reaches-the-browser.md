---
'devflare': patch
---

Return the app worker's answer to a WebSocket upgrade verbatim, so a route that REFUSES one refuses
it to the browser instead of handing the browser devflare's internal bridge socket.

In worker mode the gateway forwards an unmatched WS upgrade to the app worker, and it kept the
answer only when that answer was `101` with a `webSocket`. Everything else — the 401 from an expired
token, the 403, the 404, the 500 — was discarded on the floor, and the request fell through to
`handleBridgeWebSocket`, devflare's own RPC socket. So the browser was told `101`: it believed it
had reached its own route, opened, and spoke its own protocol at devflare's bridge dispatcher, which
answered every frame with

```
ERROR  [Gateway] Error: SyntaxError: Unexpected token 'p', "ping" is not valid JSON
```

once per liveness probe, roughly every 11-15s, while the real refusal never arrived anywhere. A
client cannot retry, re-authenticate or report an error it was never given, and the log named
`JSON.parse` rather than either party.

The fallback is now gone rather than special-cased, because it could never have been right: the
bridge socket belongs to the Node-side bridge client, and that client cannot coexist with an app
worker. `APP_SERVICE_BINDING` is non-null only when `shouldRunMainWorker` is true, which requires
`!enableVite`, while the Node bridge client IS the Vite/SvelteKit dev handle dialing
`ws://localhost:<bridgePort>`. Worker mode has no bridge client to serve. That also holds
per-gateway inside a workspace, where each app builds its own. Two things follow: an app that
serves its own WebSocket at any path — `/` included — now keeps it, and a gateway built with an app
binding miniflare did not bind answers 500 and says so rather than quietly upgrading the caller
into the bridge.

The dispatcher no longer reports the residual case as a raw `SyntaxError` either. A text frame that
is not JSON is not a bridge frame, which means the peer is not a devflare client; it now says that,
with a truncated preview of the frame, and keeps the `SyntaxError` as the `cause`. Nothing is
swallowed — the diagnostic just names the situation instead of reading like a devflare
serialization bug.

Covered by two tests alongside the pass-through they are the other half of: one asserts the app's
own 401 (body included) reaches a caller carrying the upgrade header, the other that a real browser
socket to a refused route fails its handshake rather than opening. Both fail against the previous
gateway — the first read 400, the second opened — and the happy path, where two tabs share one DO
through the app route, is unchanged.
