---
'devflare': patch
---

Stop the outbound-email loopback listener from holding `devflare dev` open at shutdown.

Its `close()` called only `server.close()`, which refuses NEW connections and then waits out every
socket still open. The composed worker posts its deliveries to that listener over a keep-alive
connection, and `disposeDevServerState()` awaits this close — so one connection still open at
teardown stalled the dev server's exit for as long as that socket happened to live.

The open connections are now dropped first, the same fix the runtime-status listener took: a send
cut off at shutdown beats a dev server that will not exit.

Two things about bun the fix has to know, both measured here. `closeAllConnections()` has to come
BEFORE `close()` — Node honours either order, bun's `node:http` only the first, and called after it
still waits the full socket lifetime (1ms against 2973ms). And bun's version takes the listener down
with the connections, so the `close()` that follows reports `ERR_SERVER_NOT_RUNNING`; that code is
the outcome this asked for rather than a failure, and is read as success.

Covered by a test that MEASURES the close against a request holding the socket, because the defect
never failed a close — it finished, seconds late.
