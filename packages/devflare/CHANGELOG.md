# devflare

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
