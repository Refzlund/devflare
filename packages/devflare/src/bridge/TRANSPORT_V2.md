# Bridge Transport v2 — Architecture Note

> Status: **Foundation / design draft.** No callers wired yet.
> Tracking: `F09` (true streaming bodies) + `F11` (one canonical transport source for server / client / gateway).

This document captures the target shape for the next-major-version bridge transport. The current ("v1") transport in [`packages/devflare/src/bridge`](./) is intentionally untouched by the v2 foundation work — both must be able to coexist until v2 reaches feature parity and the test suite has been migrated.

## Why v2 exists

Two architectural problems in v1 cannot be fixed by maintenance patches:

1. **F09 — buffered bodies.** [`serializeRequest`](./serialization.ts) currently calls `request.arrayBuffer()` and inlines the bytes (base64) or throws, so request/response bodies cross the bridge as one contiguous payload. There is no frame-level streaming for HTTP bodies, only for the lower-level `stream.*` control messages, which means large or slow bodies cannot be true-streamed end-to-end through the bridge.
2. **F11 — duplicated transport implementations.** [`server.ts`](./server.ts), [`client.ts`](./client.ts), and [`proxy.ts`](./proxy.ts) own the richer TypeScript implementation, while [`gateway-runtime.ts`](./gateway-runtime.ts) inlines a hand-maintained JS string consumed by [`miniflare.ts`](./miniflare.ts). Today they only stay in sync by convention and tests; there is no construction-level guarantee that the gateway runtime speaks exactly the same protocol vocabulary as the server.

## Goals

- **Frame-by-frame body streaming** for both requests and responses, with backpressure and cancellation.
- **One canonical transport implementation** in TypeScript, consumed by server / client / proxy directly and by the gateway runtime via codegen or build-time bundling.
- **Strict, versioned wire format** with explicit handshake so v1 and v2 endpoints can fail fast when paired incorrectly.
- **Backward compatibility window** — v1 transport keeps working unchanged until v2 reaches parity and tests are migrated.

## Non-goals

- Replacing the WebSocket transport with HTTP/2 or QUIC. v2 still rides on a single WebSocket connection per bridge with an out-of-band HTTP channel for very large transfers, just like v1.
- Changing the public Devflare API surface. v2 is a transport-internal concern; consumers of `BridgeServer`, `BridgeClient`, and the gateway helpers should not need to change call sites.
- Solving the codegen pipeline for the gateway runtime in the foundation pass. F11's codegen mechanism is deferred to a follow-up commit (see "Open questions").

## Frame vocabulary

v2 splits the wire into two planes, mirroring v1 but with body streaming first-class:

### Control plane (JSON text frames)

Reuses the existing `protocol.ts` JSON message kinds (`rpc.call`, `rpc.ok`, `rpc.err`, `event`, `stream.open`, `stream.pull`, `stream.end`, `stream.abort`, `ws.*`). v2 adds:

- `body.open` — declares a streaming body for an in-flight request or response, carrying the stream id, content type, and optional content length.
- `body.end` — signals that a body stream has finished cleanly (mirrors `stream.end` but carries explicit `kind: 'request' | 'response'`).
- `body.abort` — signals that a body stream was cancelled or errored (mirrors `stream.abort`).
- `hello` — initial handshake from the side that opens the WebSocket. Carries `{ protocolVersion: 2, capabilities: string[] }`.
- `welcome` — handshake reply. Carries the negotiated `protocolVersion` and the intersection of supported capabilities.

### Data plane (binary frames)

Extends the v1 binary header with a `kind` slot for body streams:

```
u8  kind      — 1 = stream chunk, 2 = ws data, 3 = body chunk
u32 id        — stream / ws / body id (little-endian)
u32 seq       — sequence number for ordering
u8  flags     — FIN (0b0001), TEXT (0b0010), ABORT (0b0100)
…   payload  — opaque bytes
```

`ABORT` is a new flag in v2 that lets the data plane signal cancellation without requiring a control-plane round trip when the writer has already started pushing chunks.

## Stream lifecycle

A v2 body stream goes through the following states from the writer's perspective:

```
opening → open → flushing → ended
                       ↘ aborted
```

- `opening`: writer has sent `body.open` but has not yet emitted the first data frame.
- `open`: at least one data frame has been emitted; reader has acknowledged at least one credit window.
- `flushing`: writer has sent the final data frame (FIN set) but has not yet observed the reader's acknowledgement.
- `ended`: reader has acknowledged FIN; resources can be released.
- `aborted`: either side sent `body.abort` or set the ABORT flag; resources must be released without further data frames.

Backpressure uses the existing pull-credit model from v1's `stream.pull`, scoped per body id. Default initial credit is `DEFAULT_CHUNK_SIZE` (256 KiB), matching v1.

## Handshake and version negotiation

Every v2 endpoint sends `hello { protocolVersion: 2, capabilities: [...] }` immediately after the WebSocket opens, before any RPC call. The peer replies with `welcome { protocolVersion, capabilities }`. If either side receives a `protocolVersion` it does not support, it MUST close the socket with code `4001` ("unsupported transport version") and a human-readable reason. v1 endpoints will not recognize the `hello` frame and will reject it with their existing JSON validation, so accidental v1 ↔ v2 pairings fail at connection time rather than mid-call.

## Migration strategy

1. **Foundation (commit `69e5d89`).** Architecture note + frame vocabulary types + 21 frame encoder/decoder unit tests. Nothing wired into `server.ts` / `client.ts` / `proxy.ts` / `gateway-runtime.ts`.
2. **Codec + in-memory transport pair (landed).** [`v2/codec.ts`](./v2/codec.ts) attaches to a [`WebSocketLike`](./v2/transport.ts), owns the handshake state machine, demultiplexes incoming control + binary frames, runs the RPC pending-call table, and exposes `setRpcCallHandler()` / `call()` / `respondOk()` / `respondErr()`. [`createTransportV2Pair()`](./v2/transport.ts) yields two linked in-memory transports for tests; nothing networked.
3. **Body streaming on v2 (landed).** [`v2/body-streams.ts`](./v2/body-streams.ts) provides `writeTransportV2Body()` (turns a `ReadableStream<Uint8Array>` into `body.open` + `BodyChunk` frames + `body.end`, with abort propagation) and a reader-side `TransportV2BodyReaderRegistry`. [`v2/serialization.ts`](./v2/serialization.ts) provides `serializeRequestV2` / `deserializeRequestV2` / `serializeResponseV2` / `deserializeResponseV2` that NEVER buffer bodies — every non-empty body crosses as a stream. End-to-end tests cover handshake, RPC ok/err, RPC rejection on close, and full streaming `Request` + `Response` round-trips through the in-memory pair.
4. **Gateway codegen.** Pick the codegen mechanism (see "Open questions") and emit `gateway-runtime.ts` from the canonical TS source.
5. **Flip default.** In a major release, switch the default to `v2` and migrate the remaining tests. Keep v1 importable for one major version, then remove.

## Test gates

Each phase has a hard regression gate before it can land:

- Foundation: `bun test packages/devflare/tests/unit/bridge/v2/frames.test.ts` is green; the existing `bun test packages/devflare/tests/unit/bridge/` count is unchanged. **Status: passing (21 tests).**
- Codec + body streaming: `bun test packages/devflare/tests/unit/bridge/v2/` is green; full unit suite count grows by exactly the new tests with zero v1 regressions. **Status: passing (43 v2 tests; 617 total unit tests pass / 0 fail / 2 skip).**
- Gateway codegen: the generated `gateway-runtime.ts` byte-equals the previous hand-maintained file when run on the canonical source (or the diff is reviewed and accepted).
- Default flip: every existing bridge integration test still passes after switching to `v2` end-to-end.

## Open questions

- **Codegen mechanism for `gateway-runtime.ts` (F11).** Options: (a) a small `scripts/generate-gateway-runtime.ts` that imports the canonical TS module and emits the inlined string at build time, (b) reuse the existing `tsup` / Rolldown setup to bundle a TS entry into a string export, (c) keep the file hand-maintained but add a TS source-of-truth module that the gateway runtime imports type-only and a CI check that asserts they stay in sync. Pick during the dual-mode phase, after the v2 vocabulary is frozen.
- **Backpressure tuning.** v1's `DEFAULT_CHUNK_SIZE` (256 KiB) was picked empirically. v2 may need to expose this per-stream once we have real streaming traffic to measure.
- **Cancellation semantics.** Whether `body.abort` from the reader side should cancel an in-flight `fetch()` on the writer side, or just discard buffered chunks. v1 has no precedent here; revisit during the body-streaming phase.
