# devflare

## 1.0.0-next.35

### Patch Changes

- e7b82e3: Packaging & release hygiene:

  - Ship a real MIT `LICENSE` file (the manifest declared `"license": "MIT"` but no
    license text was distributed) and populate the previously-empty `author` field.
  - Add a `SECURITY.md` vulnerability-reporting policy.
  - Fix the published CLI to run on Node: the `bin` shebang was `#!/usr/bin/env bun`
    while `engines` declared Node ≥20 support — a Node-only global install couldn't
    start. The built `dist` uses no Bun-only runtime APIs (verified running under
    Node), so the shebang is now `#!/usr/bin/env node` and both runtimes are honored.
  - Add the `"./package.json"` subpath export so resolver/metadata tooling can read
    it (the `exports` map otherwise blocks `require('devflare/package.json')`).
  - Declare `"sideEffects": false` to let consumer bundlers tree-shake devflare
    (the public modules carry no load-bearing import side effects).

## 1.0.0-next.34

### Patch Changes

- 3f9f0d7: Phase F — architecture & docs close-out. Documentation now correctly describes
  `files.tail` as a public config key (auto-discovers `src/tail.ts` when unset,
  accepts a custom path, or `false` to disable) alongside the other handler
  surfaces, and the watched dev-reload root lists include tail. Adds a clarifying
  note that the phased `resolveResources({ phase })` seam is the canonical
  resource-resolution path and the remaining env-overlay-only callers are by
  design. Removes a stale test-helper reference in the binding-hints comment.

  Internal: the lint gate no longer fights `changeset version` over `package.json`
  (its JSON writer multi-lines arrays that biome's formatter would re-collapse), so
  CI stays green on the commit after every release bump.

## 1.0.0-next.33

### Patch Changes

- e27dd17: Fix default service-binding RPC worker discovery: `resolveServiceBindings` /
  `findDefaultServiceWorkerEntrypoint` now also resolve a package's root-level
  `worker.{ts,js}` (not only `src/worker.{ts,js}`), so a referenced worker that
  keeps its entrypoint at the package root exposes its default RPC surface in
  local tests and dev. (Also: internal quality gates — biome lint is now enforced
  on the published package and releases are gated on typecheck + unit tests.)

## 1.0.0-next.32

### Patch Changes

- 38f576f: Clarify the Cloudflare permission-group display-name fallback warning: it now
  points maintainers at `refresh-permission-groups` (which regenerates the verified
  ids) instead of asking them to hand-edit the generated id map. Also adds a deploy
  & secrets maturity guide (auto-provisioning matrix, partial-deploy orphan
  behavior, secrets boundary, per-environment scoping, permission-group refresh).

## 1.0.0-next.31

### Minor Changes

- dcc56e7: Add three first-class top-level Cloudflare deploy-policy config options: `logpush`, `uploadSourceMaps`, and `keepVars` (all `boolean`).

  - `logpush` — send Trace Events from this Worker to Workers Logpush (does not create a Logpush job). Compiles to the Wrangler `logpush` key.
  - `uploadSourceMaps` — include source maps when uploading this Worker. Compiles to the Wrangler `upload_source_maps` key.
  - `keepVars` — keep dashboard-managed vars when Wrangler deploys this Worker (default `false`). Compiles to the Wrangler `keep_vars` key.

  All three are per-environment overridable like other deploy-surface scalars. They previously required `wrangler.passthrough`.

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
