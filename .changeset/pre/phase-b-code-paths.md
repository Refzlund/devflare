---
"devflare": minor
---

Phase B — close the unfinished bridge/shim code paths:

- **Large response bodies over the bridge**: oversized Response bodies (>512 KB)
  now stream over the binary channel chunked into ≤512 KB frames (under
  workerd's ~1 MB WebSocket message limit) and round-trip byte-identically,
  including bodies over 2 MB. Oversized request bodies throw a clear, actionable
  error (the local gateway has no streamed-request-body consumer).
- **Durable Object `namespace.jurisdiction()`** now threads the jurisdiction
  through to the wire instead of silently dropping it.
- **Bridge event subscriptions**: `client.on(topic, cb)` registry is wired
  (consumer side; no gateway emits `event` frames yet).
- **R2 multipart upload** is now fully implemented in the test mock
  (`createMultipartUpload`/`uploadPart`/`complete`/`abort`), composing parts into
  the object store so `r2.get()` resolves the completed object.
- **Documented local limitations** (clear errors, not silent failures): Worker
  Loader dynamic Durable Object classes (injectable stub), `startTls()` on the
  DO WebSocket proxy, and Hyperdrive raw `connect()` (use `connectionString`).
  The two Hyperdrive shims are de-duplicated into `src/shims/local-hyperdrive.ts`.
