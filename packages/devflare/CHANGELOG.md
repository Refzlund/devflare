# devflare

## 1.0.0-next.48

### Minor Changes

- 49aad79: Add deploy-lifecycle parity. `devflare deploy --prod --percentage <n>` performs a
  gradual/canary rollout (uploads a new version with `wrangler versions upload`,
  then shifts `<n>%` of traffic to it via `wrangler versions deploy <id>@<n>`, with
  an optional `--version` to pin the version keeping the remainder) — production
  only, never shifting traffic on preview/dry-run. New `devflare tail` command
  streams a deployed worker's live logs over Cloudflare's tail API (`--format
pretty|json`, clean teardown on exit).

## 1.0.0-next.47

### Patch Changes

- e267951: Correct stale offline-support classifications. Durable Objects and Service
  bindings are no longer mislabelled "no offline support" — they run fully locally
  under `createTestContext()` (Miniflare executes the DO class / resolves the
  service binding), classified honestly as offline-native with the caveat that
  there is no pure in-memory `createMockEnv()` mock for them. (Vectorize was
  reclassified to an offline fixture in the previous release.)

## 1.0.0-next.46

### Minor Changes

- b3f6771: Close the test/offline DX gaps. New `createMockVectorize()` (in-memory vector
  store with cosine `query`, metadata filters, insert/upsert/delete/getByIds) and
  `createMockAnalyticsEngine()` (write-only recording stub) let you unit-test those
  bindings offline; Vectorize is reclassified to an offline fixture. New
  `cf.alarm.trigger()` fires a Durable Object `alarm()` handler in tests, the same
  way the runtime does. And `createOfflineBindings()` now auto-wires the KV/D1/R2/
  queues mocks when those bindings are declared without an explicit fixture, so
  `env.MY_KV` is bound offline instead of undefined (an explicit fixture still
  overrides).

## 1.0.0-next.45

### Minor Changes

- 54f4566: Wire deploy-modeled-only bindings into local development. Analytics Engine now
  binds in local dev (Miniflare's write-only no-op stub, so `writeDataPoint()` no
  longer throws), tail consumers are delivered locally when the consumer Worker is
  present in the same dev instance (the tail handler was already testable via
  `cf.tail.trigger()`), and the mTLS `remote` flag is forwarded to the local
  binding so deploy and local dev agree on the binding shape. Wired consistently
  across the dev server, the cross-process bridge, and the test context.

## 1.0.0-next.44

### Minor Changes

- 81b4c63: Add first-class support for three more Cloudflare bindings: **Stream**
  (`bindings.stream`), **VPC** (`bindings.vpcServices` / `bindings.vpcNetworks`),
  and **Flagship** (`bindings.flagship`). Each is schema-validated, compiled to the
  matching wrangler keys (`stream`, `vpc_services`, `vpc_networks`, `flagship`),
  typed on the generated `env`, and documented in the support matrix. Stream runs
  locally through Miniflare with a deterministic pure mock (`createMockStreamBinding`)
  for hosted operations; Flagship has a configured-value pure mock
  (`createMockFlagshipBinding`) — its local Miniflare plugin returns call defaults,
  not evaluated flags; VPC services/networks are a remote boundary (Miniflare only
  proxies them) testable via a custom fake injected through `createMockEnv`.

## 1.0.0-next.43

### Minor Changes

- feab91d: Model the `remote` flag and preview/jurisdiction/migration fields on the core
  resource bindings. KV, D1, R2, queue producers, and service bindings now accept
  `remote?: boolean` (use the real remote resource during local dev), and KV
  (`previewId`), D1 (`previewDatabaseId`, `migrationsTable`, `migrationsDir`), and
  R2 (`previewBucketName`, `jurisdiction`) accept their preview/jurisdiction/
  migration fields — all compiled to the matching wrangler keys. R2 buckets and
  queue producers now accept an object form (`{ bucketName | queue, remote, … }`)
  in addition to the existing string shorthand, which keeps working unchanged.

## 1.0.0-next.42

### Patch Changes

- 6fab0de: Resolve a dependency's `package.json` without going through its `exports` map.
  The CLI's type generation (and other package-specifier resolution, e.g. for
  cross-package Durable Objects) read `<package>/package.json` via export-enforcing
  resolution, which throws `ERR_PACKAGE_PATH_NOT_EXPORTED` for any package that
  doesn't list `./package.json` in its `exports`. It now finds the package's own
  `package.json` via a `node_modules` directory walk first, so such packages
  resolve correctly.

## 1.0.0-next.41

### Patch Changes

- db98dd9: Declare `typescript` as a runtime dependency. The `devflare/test` and
  `devflare/vite` entrypoints (and the CLI's worker transforms) import the
  TypeScript compiler at runtime, but it was only listed under `devDependencies`,
  so a real consumer install resolved it only by accident inside this monorepo and
  failed (`Cannot find package 'typescript'`) elsewhere. The dist verifier now
  also asserts every package the bundle imports is a declared dependency, so this
  class of gap is caught before publish.

## 1.0.0-next.40

### Patch Changes

- d08f0c4: Fix unimportable published bundles. The JS build is now produced by rolldown
  instead of `bun build`, whose bundler miscompiled the package's re-export
  barrels (it emitted `export { x }` with no binding, so importing `devflare`,
  `devflare/runtime`, `devflare/test`, and other entrypoints threw
  `Export 'x' is not defined in module` under node). Declaration files now also
  carry explicit relative-import extensions so the types resolve under
  `node16`/`nodenext`, not only `bundler`. A new post-build step loads every
  published entrypoint under node before publishing, so an unimportable bundle can
  never ship again.

## 1.0.0-next.39

### Patch Changes

- bef00b5: Test & CI quality hardening:

  - Fix a user-facing `NaN` in four test-helper error messages: a stray unary `+`
    before a template literal made `defineXHandler`-not-found errors print
    `...\nNaN` instead of the expected-signature hint (`src/test/scheduled.ts`,
    `email.ts`, `queue.ts`, `tail.ts`).
  - Promote four structural lint rules from warning to error now that the codebase
    is clean of them (`noBannedTypes`, `noAssignInExpressions`,
    `noShadowRestrictedNames`, `noImplicitAnyLet`) — guarding against regressions
    like an accidental `any` `let` or a global-shadowing name. (`useConst` stays a
    warning: its three remaining hits are deferred-assignment values captured by a
    closure before assignment, where `const` is unsafe.)
  - The container integration test no longer reports a silent green pass when no
    container engine is present — it now properly skips, so green never implies the
    real-engine path ran.
  - Add focused unit tests for the dev-server reload queue (debounce/coalescing,
    error isolation) and the test-context binding-hint extractor.
  - Clearer signals for known limitations: the off-Bun service/DO bundling fallback
    now names the affected worker and the consequence; the mock queue consumer's
    unreachable `failed` path is accurately documented; and the integration
    port-allocation helper no longer hands the same ephemeral port to two
    back-to-back callers in one process.

## 1.0.0-next.38

### Patch Changes

- c813821: Make the Cloudflare support documentation accurate and surface offline-binding gaps:

  - Reconcile the docs-site support labels with the authoritative support matrix:
    Hyperdrive, Browser Rendering, Worker Loaders, Images, Media Transformations,
    and Analytics Engine are now marked **Limited** (each has a code-backed local
    gap — e.g. Hyperdrive `connect()` and Worker Loaders `getDurableObjectClass()`
    throw) instead of overstating them as Full.
  - Correct the matrix's Analytics Engine classification: it is **not** an inherent
    remote-only boundary — it is simply not yet wired into the local Miniflare
    worker (Miniflare's native plugin is a write-shape-only no-op).
  - Document that Static Assets (`assets`) and cross-worker Tail consumers
    (`tailConsumers`) are compiled for deploy but not served/delivered locally, and
    that Cron triggers' scheduled handlers are locally invokable via the test layer
    (distinct from the wired `files.tail` handler surface).
  - `createOfflineEnv()` / `createOfflineBindings()` now report core storage
    bindings (KV/D1/R2/Queues/Durable Objects/Services) that are present in config
    but only available via `createTestContext()` as explicit `missingFixtures`
    entries, instead of leaving `env.X` silently `undefined`.

## 1.0.0-next.37

### Patch Changes

- cd82c4e: Fix the Durable Object WebSocket relay through the live dev gateway, and harden
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

## 1.0.0-next.36

### Patch Changes

- 0b47000: Docs & contract-honesty fixes:

  - The README `devflare/config` row listed ~40 names that the lightweight config
    entry never exported; it now lists the real surface (`defineConfig`, `env`,
    `preview`, `ref`). The doc-integrity guard that should have caught this was
    validating the wrong module (`src/config` instead of `src/config-entry`) — now
    fixed, plus a new reverse guard asserts the exhaustively-listed entrypoints
    document every public export, and a guard checks every README `/docs/` link
    resolves to a real slug.
  - Document the previously-undocumented `vars` export (and the config error
    classes) on the `devflare` row; note that `devflare/vite` re-exports Vite's
    types (so type-checking it needs `vite` installed); fix two broken README
    `/docs/` links; add `files.tail` to the full config examples.
  - Align `DEFAULT_BRIDGE_PORT`/`DEFAULT_HTTP_PORT` to the real dev runtime ports
    (8787/8788) — the bare bridge-client auto-connect fallback pointed at a dead
    8686 port.
  - Remove the contradictory orphan `event` control-message shape from the v2 aux
    vocabulary before the wire surface freezes (the live consumer uses the
    `EventMsg { topic, data }` shape); drop stale "to be implemented" comments from
    the CLI dispatcher; clarify that `test:coverage` is unit-only.

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
