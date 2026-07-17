# devflare

## 1.0.0-next.67

### Patch Changes

- cd794ad: Fix `devflare workspace dev` crashing at startup for any app that owns a Durable Object.

  The workspace coordinator namespaces every co-hosted worker as
  `${appName}/${workerName}` to keep two apps' `gateway`/main/DO workers distinct in
  the one shared instance. workerd tolerates `/` in plain service/worker names, but
  a Durable Object whose host-worker (script) name contains `/` makes the runtime
  abort at `miniflare.ready` with an uncatchable `*** std::terminate() called with
no exception` — so a workspace containing any DO app (very common: a SvelteKit +
  Worker monorepo whose Worker owns a DO) never booted.

  The namespace separator is now `-` (the canonical Cloudflare worker-name
  character, safe in every workerd context — service names, DO script names, DO
  uniqueKeys, and the persist paths derived from them). Because worker/app names are
  charset-unrestricted, a new guard in the merge turns the (now theoretically
  possible) rare name collision into a loud, actionable error instead of a silently
  half-wired instance. Added unit coverage (no `/` in any namespaced name; the
  collision guard) and an integration test that boots a DO-owning app in a workspace
  and calls the DO through its direct socket.

## 1.0.0-next.66

### Minor Changes

- 69a9d38: Add `devflare workspace dev` — run several apps in ONE Miniflare with live-shared bindings.

  Two apps that bind the same D1/KV/R2/Durable Object id share one managed resource
  in production, but under per-app `devflare dev` each app gets its own Miniflare
  (its own `workerd` process), so a write by one is invisible to the other — and a
  shared persist dir cannot fix it (each process keeps its own storage snapshot and
  they contend for the SQLite file). Sharing **live** state requires co-hosting the
  workers in a single instance.

  `devflare workspace dev` does exactly that. It reads a new opt-in
  `devflare.workspace.ts` manifest, prepares each app with the same pipeline
  `devflare dev` uses, and merges their `buildMiniflareDevConfig` worker sets into
  **one** Miniflare instance. Workers that bind the same id then resolve to one live
  store (Miniflare dedupes storage services by binding id). Each app keeps its own
  browser origin via a per-app Miniflare direct socket (`unsafeDirectSockets`), so
  the cross-origin split (e.g. `ui.localhost` ↔ `api.ui.localhost`) is preserved;
  Vite apps are spawned as children pointed at the shared instance's bridge.

  ```ts
  // devflare.workspace.ts
  import { defineWorkspace } from "devflare";

  export default defineWorkspace({
    apps: [
      {
        config: "./apps/api/devflare.config.ts",
        port: 8789,
        env: { DOC_API_DEV_SEED: "1" },
      },
      {
        config: "./apps/web/devflare.config.ts",
        vite: true,
        vitePort: 5173,
        bridgePort: 8788,
      },
    ],
    shared: { d1: ["PLATFORM_DB"], r2: ["MEDIA"] },
  });
  ```

  ```bash
  devflare workspace dev            # one Miniflare, all apps, shared bindings
  devflare workspace dev --no-persist
  ```

  New public API: `defineWorkspace()` (plus `WorkspaceManifest`/`WorkspaceManifestInput`/`WorkspaceApp`
  types). D1 migrations run once per app against the shared store (the migration
  ledger dedupes shared files); an optional `shared` block asserts the intended
  binding ids match across apps and errors loudly if they don't.

  This is strictly additive: the per-app `devflare dev` path is byte-for-byte
  unchanged, and `DEVFLARE_PERSIST_DIR` remains file-colocation only. Worker/DO hot
  reload inside the shared instance is not wired yet (restart to pick up worker
  source changes); Vite children keep their own HMR.

## 1.0.0-next.65

### Patch Changes

- 844e4e1: feat: DEVFLARE_PERSIST_DIR env override for the dev-server persist directory (share one persist dir across multiple workers in local multi-worker dev)

## 1.0.0-next.64

### Patch Changes

- 03d550c: Fix multi-`Set-Cookie` corruption when a response is relayed through the dev
  bridge.

  When a Durable Object or service-binding `fetch()` response set **more than one**
  cookie (e.g. a session cookie plus a CSRF cookie), the bridge flattened the
  response headers with `Headers.entries()`/`forEach()`. Per the Fetch spec's
  sort-and-combine, those APIs fold multiple `Set-Cookie` headers into a single
  comma-joined value, so the browser received one corrupted
  `Set-Cookie: a=1; Path=/; SameSite=Lax, b=2; Path=/; HttpOnly` — the second
  cookie was lost and the first mangled. This bit any response relayed via a
  service-binding or DO `fetch` through the local bridge whenever the gateway ran
  under a compatibility date before `2023-08-01` (where workerd still combines
  `Set-Cookie` and has no `getSetCookie()`).

  The bridge now enumerates `Set-Cookie` separately and carries each value as its
  own entry through serialize → deserialize (reconstructed with `append`, never a
  join), so every cookie survives byte-faithfully with all attributes intact. It
  reads cookies via the standard `Headers.getSetCookie()` and falls back to
  workerd's legacy `getAll('set-cookie')`; when a runtime exposes neither, the
  combined value is preserved verbatim rather than dropped. Both the workerd
  gateway (`GATEWAY_RUNTIME_JS`) and the host-side (`server.ts`) serialization
  paths are fixed, for `Request` and `Response` alike. Single-cookie and
  non-cookie headers are unchanged.

## 1.0.0-next.63

### Patch Changes

- e8cd40f: Fix `devflare dev`: forward app-route WebSocket upgrades to the app worker.

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

## 1.0.0-next.62

### Patch Changes

- 4477cc9: Fix `devflare dev`: relay a Durable Object's WebSocket-hibernation cross-socket
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

## 1.0.0-next.61

### Patch Changes

- 50c14ab: Fix `devflare dev`: bridge Durable Object RPC **method** calls (e.g.
  `stub.push(arg)`, `stub.pull(since)`) when the DO also defines a custom `fetch()`
  handler.

  The local dev gateway routed every DO method call through the DO's `fetch()`
  using an internal `_rpc` convention. A DO that `extends DurableObject` and
  overrides `fetch()` — for example a websocket-only handler that returns `426`
  for non-upgrade requests — received that probe on its own `fetch()`, returned a
  non-JSON body, and the call failed with a bogus `... is not valid JSON` error.

  The gateway now dispatches method calls natively (`stub[method](...args)`) —
  exactly as on real Cloudflare, and matching what `devflare/test` already did —
  and only falls back to the `_rpc` fetch convention for Durable Objects that are
  not RPC-enabled. The `.fetch()`/WebSocket bridge paths are unchanged and still
  reach the user handler.

## 1.0.0-next.60

### Minor Changes

- 3e27fa5: R2 presigned PUT/GET URLs with full dev/prod symmetry: `presignR2Put(env, binding, key, options)` and `presignR2Get(env, binding, key, options)` (exported from `devflare/runtime`, worker-safe).

  - **Production**: mints a real S3 SigV4 presigned URL against `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>` (via `aws4fetch`), reading R2 S3 credentials from `env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — set them as Worker secrets) or from `options.credentials`. The bucket name behind a binding resolves automatically from the new `DEVFLARE_R2_BUCKETS` var that `compileConfig` injects at deploy time from `bindings.r2` (explicit user var of the same name wins; `options.bucketName`/`options.jurisdiction` override per call).
  - **Local dev + test harness**: mints a URL against a new signed gateway endpoint (`/_devflare/r2/presigned/<binding>/<key>`) served by every devflare gateway (dev server, `startMiniflare`, `createTestContext`). A per-boot HMAC secret is wired automatically (`DEVFLARE_R2_PRESIGN_SECRET`/`DEVFLARE_R2_PRESIGN_ORIGIN` env vars — injected into the Vite process, all Miniflare workers, and the test env). The endpoint enforces the same guarantees a real presign gives — signature, expiry, method, content type, exact `contentLength`, and `maxSizeBytes` — plus permissive CORS, so browser uploads and quota logic behave identically in dev, test, and prod.
  - `MiniflareInstance` (from `startMiniflare`) gains `r2Presign: { origin, secret } | null` for programmatic/test presigning.
  - Enforcement notes: `contentType` and `contentLength` are cryptographically enforced in both environments; `maxSizeBytes` is enforced locally but real R2 presigned PUTs cannot enforce an upper bound — pass `contentLength` when the size is known and confirm with a server-side `head()` before committing quota.

## 1.0.0-next.59

### Patch Changes

- cd9efe6: Add the `server.publicUrl` local-dev knob.

  `publicUrl` is the public-facing URL the local dev runtime advertises for itself
  (served on Miniflare's `/core/public-url` loopback; otherwise the runtime entry
  URL) — set it when the dev runtime sits behind a reverse proxy, tunnel, or custom
  domain so the Worker reports the externally-visible origin. It maps to Miniflare's
  `publicUrl` and is the final user-facing `CoreSharedOptions` knob, a sibling of the
  already-wired `upstream`/`cf`/`liveReload`. Local-dev only — no deploy effect (no
  wrangler analogue).

## 1.0.0-next.58

### Minor Changes

- 0ad0536: Fix route flags being emitted on the wrong route type, and add the remaining
  local-dev `server` knobs.

  - **Route `enabled` / `previews_enabled`** are valid only on a **custom-domain**
    route — wrangler's `zone_id` / `zone_name` route shapes are
    `additionalProperties: false` and reject them. Devflare now rejects them at
    config-parse time on non-custom-domain routes (with a clear error) and emits
    them only for custom-domain routes, so a config that validates locally is
    deploy-valid (previously `{ pattern, zone_id, enabled: true }` parsed but
    failed at deploy).
  - **`server.inspectorHost`**, **`server.verbose`**, and **`server.logRequests`**
    are now accepted on the dev `server` config and threaded into Miniflare's
    shared options — the remaining user-facing local-dev knobs alongside
    `https`/`inspectorPort`/`upstream`/`liveReload`/`cf`. Local-dev only, no deploy
    effect.

## 1.0.0-next.57

### Patch Changes

- 95b548f: Fix service bindings emitting an unsupported `environment` field. Wrangler's
  `services` config item is `additionalProperties: false` and addresses a target
  environment via the service **name** (`<worker_name>-<environment_name>`), not a
  separate `environment` field — so a config that set `environment` on a service
  binding compiled to a wrangler config that fails deploy validation. The
  ergonomic `environment` input is kept, but it is now **folded into the emitted
  `service` name** (`<service>-<environment>`) instead of emitted as a separate
  field, so local validation once again matches a deploy-valid config. (Local
  Miniflare wiring already used the base service name — environments are a deploy
  concept.)

## 1.0.0-next.56

### Minor Changes

- 50a2474: Model the Durable Objects binding `environment` sub-field. A cross-worker DO
  binding (`scriptName` set) may now carry `environment` — the service-environment
  of the target script — which compiles to wrangler's
  `durable_objects.bindings[].environment`. Previously the field was unmodeled and,
  because the DO binding predicate is not strict, a user-supplied `environment` was
  silently dropped before deploy (validate-locally ≠ deploy-valid). It is now
  threaded through normalization and emitted for cross-worker DOs only (a local DO
  without `scriptName` drops it). This brings per-binding `environment` support in
  line with wrangler across every binding type that accepts it (service bindings,
  dispatch-namespace outbound, and now Durable Objects).

## 1.0.0-next.55

### Patch Changes

- 0ba2da4: Fix `streamingTailConsumers` rejecting `environment` at config-parse time.
  Wrangler's `StreamingTailConsumer` accepts only `service` (`additionalProperties:
false`) — unlike `tailConsumers`, it has no `environment` field. The object form
  previously modeled an optional `environment` (mirrored from `tailConsumers`),
  which devflare accepted and compiled into the Wrangler config, so a config that
  set it validated locally but failed at deploy. `environment` is now removed from
  the streaming-tail schema, input type, and compiler output, so it is rejected up
  front with a clear error — keeping local validation equivalent to a deploy-valid
  config. (The regular `tailConsumers` `environment` field is unchanged.)

## 1.0.0-next.54

### Minor Changes

- 23650d8: Add two more local-dev `server` options, threaded into Miniflare's
  `CoreSharedOptions` alongside the existing `https`/`inspectorPort`/`upstream`:

  - `server.liveReload` — inject Miniflare's in-browser live-reload script so the
    page auto-refreshes when the dev runtime reloads (complements Devflare's own
    source watcher).
  - `server.cf` — override the local `request.cf` (`IncomingRequestCfProperties`):
    `false` omits it, a string is a path to a JSON file, and an object injects
    custom cf metadata (colo, country, TLS, bot management, …) for testing cf-aware
    code under `devflare dev` without Cloudflare.

  Both are local-dev only with no deploy effect.

## 1.0.0-next.53

### Minor Changes

- fb5dff4: Bring the `sendEmail` binding to full pure-offline test parity. `createOfflineEnv()`
  and `createMockEnv({ sendEmail })` now auto-wire a deterministic
  `createMockSendEmail()` — a recording SendEmail mock that captures every
  dispatched message into `.sentEmails` while enforcing the configured
  sender/destination allow-lists — so `env.MY_EMAIL.send(...)` is assertable in
  pure unit tests without Miniflare. `describeOfflineSupport('sendEmail')` is now
  classified `offline-native` (previously it fell through to a false
  `remote-boundary`). `createMockSendEmail` and the underlying
  `createLocalSendEmailBinding` are exported from `devflare/test`. This was the last
  mockable binding without offline auto-wiring; every binding family is now both
  auto-wired offline and classified in the support matrix.

## 1.0.0-next.52

### Minor Changes

- 848e41f: Add a read-only `devflare productions deployments` subcommand that lists a
  Worker's full chronological deployment history (deployed-at, deployment id,
  strategy, per-version traffic split, source, triggered-by, and message) via the
  already-wired account API — the same read path `productions list` / `versions`
  use, with no new write surface. Previously only the latest deployment summary
  (`list`) and per-version timestamps (`versions`) were exposed.

  Also documents the deploy-only `observability`, `placement`, and `limits`
  top-level config keys in the Cloudflare support matrix (they were already
  modeled and compiled; only their support tier was undocumented).

## 1.0.0-next.51

### Minor Changes

- 804bc79: Close the remaining Cloudflare config-coverage gaps found by a fresh
  dependency-grounded re-investigation (wrangler 4.85.0 / miniflare 4.20260424.0 /
  workers-types 4.20260426.1). Each field mirrors an existing sibling and stays
  backward-compatible.

  Locally wired into dev/test Miniflare:

  - Queue producer `deliveryDelay` (→ `delivery_delay`).
  - Service binding `props` (object exposed to the target Worker via `ctx.props`).
  - `streamingTailConsumers` (→ `streaming_tail_consumers`, wired to Miniflare
    `streamingTails`, a full twin of `tailConsumers`).
  - `server` config now also accepts `https` / `httpsKeyPath` / `httpsCertPath` /
    `inspectorPort` / `upstream` (local HTTPS dev, custom inspector port, upstream).
  - Cache API contents now persist across dev-server restarts (`cachePersist`).
  - New dev/test-only `outboundService` option to route a Worker's outbound
    `fetch()` to a named service for local cross-service testing.

  Compiled for deploy:

  - Queue consumer `visibilityTimeoutMs` (→ `visibility_timeout_ms`).
  - Top-level `complianceRegion` (`'public' | 'fedramp_high'`).
  - Top-level `workersDev` toggle (was hardcoded `true`; still defaults to `true`).
  - Custom-domain route `enabled` / `previewsEnabled`.
  - `sendEmail` binding `remote` flag — emitted for deploy; Miniflare has no local
    `remote` for `send_email`, so it is a deploy-time directive (stripped locally,
    same as mTLS).

  Legacy Worker `site` (static assets) is documented as passthrough-reachable via
  `wrangler.passthrough` (superseded by `assets`).

## 1.0.0-next.50

### Patch Changes

- f1209e4: Fix the typed `env` and `vars` runtime proxies so they are assignable to an
  augmented `DevflareEnv` / `DevflareVars`. The proxy factory inferred its type
  parameter from the internal getter (`Record<string, unknown>`) instead of the
  exported type, so any consumer that declared `vars` (giving `DevflareEnv` /
  `DevflareVars` required keys) hit a type error when importing `env` / `vars`
  from `devflare/runtime`. The proxies now carry their declared types explicitly.

## 1.0.0-next.49

### Minor Changes

- 15fed0f: Add build-time safety checks and cron validation. Cron expressions are now
  validated against Cloudflare's 5-field grammar (`src/config/cron.ts`) at
  config-parse time (a `.superRefine()` on `triggers.crons`) and in
  `cf.scheduled.trigger(cron)`, so a typo like `cf.scheduled.trigger('* * *')`
  fails with an actionable message instead of silently passing. The explicit
  2-arg fetch-handler style requirement is now also checked at dev-start / `build`
  time (`validateFetchHandlerStyle()` in the shared worker-load chokepoint),
  reusing the exact same resolver and style markers as the request-time check —
  zero false positives, with the runtime check kept as the backstop. Finally, a
  successful **production** deploy prints a one-line hint that runtime secrets are
  set via `wrangler secret put` / the dashboard (devflare never sends secret
  values to Cloudflare); the hint never fires on preview or dry-run deploys.

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
