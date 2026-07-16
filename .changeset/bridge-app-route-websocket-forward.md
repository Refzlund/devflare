---
'devflare': patch
---

Fix `devflare dev`: forward app-route WebSocket upgrades to the app worker.

In worker mode the dev gateway runs as the entry worker (`routes: ['*']`) with
the app (e.g. SvelteKit) worker as a service binding. A browser opening
`new WebSocket('/api/doc/:id/subscribe')` — whose handler does
`return stub.fetch(clientUpgradeRequest)` and returns the Durable Object's `101`
— never reached that handler: the gateway hijacked **every** unmatched WebSocket
upgrade into its in-worker bridge RPC socket. The socket appeared to upgrade
(`101`), but the app route never ran, so a DO's hibernation broadcast never
crossed tabs and a second concurrent connection could not share the DO instance.

This is distinct from the programmatic `stub.connect()` path fixed in the prior
release; it is the path a Worker/SvelteKit route takes when it forwards a client
WebSocket upgrade to a DO.

The gateway now forwards an unmatched WebSocket upgrade to the app worker and
passes its response through when the app answers with a genuine upgrade
(`101` + a `webSocket`), so `stub.fetch(clientUpgradeRequest)` reaches the DO and
its client socket streams back to the browser — two tabs then share one DO
instance and `ctx.getWebSockets()` broadcasts (and `webSocketClose` leave frames)
work. It falls back to the bridge RPC socket only when the app does not answer
with an upgrade (the bridge client path, which exists only when there is no app
worker). The `/_devflare/do-ws` connect() path, configured `wsRoutes`, and the
native DO RPC path are unchanged.
