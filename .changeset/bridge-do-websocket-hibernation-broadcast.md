---
'devflare': patch
---

Fix `devflare dev`: relay a Durable Object's WebSocket-hibernation cross-socket
broadcast.

Two WebSocket clients connecting to the SAME DO instance
(`env.DOC_ROOM.getByName(id)` twice) could not see each other's messages when the
DO used the hibernation API (`ctx.acceptWebSocket()` with the runtime-dispatched
`webSocketMessage`/`webSocketClose` handlers and a `ctx.getWebSockets()`
broadcast). The upgrade succeeded (`101`) and both sockets landed on one instance
(`ctx.getWebSockets().length` reached 2), but `webSocketMessage` never fired, so
a frame sent by one client was never delivered to the other.

Root cause: the bridge gateway pumped the DO's WebSocket **in-process** (it called
`stub.fetch(upgrade)` and drove the returned client socket with
`accept()`/`send()`). An in-process-pumped partner socket does not trigger
workerd's hibernation dispatch — only a genuine inbound connection does. The
`devflare/test` gateway had no DO WebSocket handler at all, so `stub.connect()`
hung there.

Durable Object `connect()` now opens a real pass-through WebSocket to a new
`/_devflare/do-ws` gateway endpoint, which forwards the upgrade to the DO and
returns its `101` response verbatim (the same pattern the browser WebSocket routes
already use). miniflare then wires the inbound connection to the DO's client
socket, so the runtime dispatches the hibernation handlers and delivers
`ctx.getWebSockets()` broadcasts across every connected client — exactly as on
real Cloudflare. Both the `devflare dev` and `devflare/test` gateways are covered.
The single-socket WebSocket path, the legacy in-process relay (`createWsProxy`),
and the native DO RPC path are unchanged.
