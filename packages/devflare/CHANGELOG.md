# devflare

## 1.0.0-next.30

### Minor Changes

- 3cd03ab: Phase B — close the unfinished bridge/shim code paths:

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

## 1.0.0-next.29

### Minor Changes

- db83da3: Remove the `@deprecated ContextUnavailableError` alias. Its rich
  `nodejs_compat`-mentioning message is now produced by the canonical
  `ContextAccessError` via the new `ContextAccessError.contextUnavailable()`
  factory, and the per-surface getters / `getContext()` throw that instead.

  Breaking removal (pre-1.0): code that imported `ContextUnavailableError` from
  `devflare/runtime` must switch to `ContextAccessError`. Code that caught
  `ContextAccessError` is unaffected — the removed alias was already a subclass,
  so the thrown instances are still `instanceof ContextAccessError`.

## 1.0.0-next.28

### Minor Changes

- 2303d83: Add `server` config option to set the `devflare dev` runtime instance host and port. Configure `server: { host, port }` in `devflare.config.ts` to control the address the local Miniflare runtime binds to. CLI flags (`--runtime-port`, `--runtime-host`) and environment variables (`DEVFLARE_RUNTIME_PORT`, `DEVFLARE_RUNTIME_HOST`) take precedence over the config value, which in turn overrides the `127.0.0.1:8787` default.
