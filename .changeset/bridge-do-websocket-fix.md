---
"devflare": patch
---

Fix the Durable Object WebSocket relay through the live dev gateway, and harden
proxied-response limits:

- **DO WebSocket `stub.connect()` was broken in both directions.** The live
  gateway (`gateway-runtime.ts`) and the bridge client disagreed on the WS-data
  wire format: the client sent/expected binary `WsData` frames while the gateway
  only read string frames inbound and emitted a JSON `ws.data` envelope outbound,
  so every payload was silently dropped. The gateway now speaks the same binary
  `WsData` frame format as the client (matching `wire.ts`/`server.ts`) in both
  directions, honoring the TEXT flag. Added an end-to-end integration test that
  round-trips binary (both directions) and a text frame through the real gateway.
- **Oversized proxied responses now throw a clear error** instead of being
  silently truncated. DO and service-binding `fetch()` responses reached through
  the bridge are delivered inline over the WebSocket and are capped at 512 KB
  (workerd's ~1 MB message limit); a larger body now throws, with the boundary
  documented in the Cloudflare support matrix. Large R2 objects remain exempt
  (HTTP transfer side-channel).
- The gateway handshake now advertises only the capabilities it actually
  implements end-to-end (`ws-relay`, `http-transfer`); `streams` is no longer
  advertised since proxied responses are inlined, not streamed.
