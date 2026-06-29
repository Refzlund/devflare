# Cloudflare Coverage — Gap Ledger

This is the living record of every Cloudflare-infrastructure coverage gap found in
devflare, and exactly how each is being covered. It is grounded in an
evidence-based analysis against the installed `wrangler@4.85.0`
(`config-schema.json`), `miniflare@4.20260424.0` (`WorkerOptions`), and
`@cloudflare/workers-types@4.20260426.1` type definitions.

Coverage is held to devflare's core mission: **local-first** (run/emulate without
touching Cloudflare), **testable** (offline fixtures + deterministic mocks),
**`env`-importable from anywhere** (the unified request→bridge proxy), and
**simplification through architecture** (one schema, mirror existing patterns,
no new escape hatches where a first-class model fits).

Status legend: ⬜ planned · 🔧 in progress · ✅ done (shipped) · ⛔ inherent boundary (signal, don't fake).

The dimensions each gap is measured on: **schema** (modeled+typed) · **deploy**
(emitted to wrangler config) · **local-dev** (wired into Miniflare) · **test**
(offline fixture/mock) · **docs** (matrix/handbook accurate).

---

## Batch CF-1 — `remote` flag + preview/jurisdiction/migration on core bindings

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| `remote?: boolean` missing on KV / D1 / R2 / queue-producers / services | schema, deploy | Add `remote?` to the object input forms (mirror the AI/Vectorize/dispatch pattern: `…(normalized.remote !== undefined && { remote })`). R2 & queue-producers currently `Record<string,string>` → widen to `string \| { …, remote? }` union (string still shorthand) so existing configs keep working and `remote` is first-class + IDE-discoverable. | ✅ |
| KV `preview_id`, D1 `preview_database_id`/`migrations_table`/`migrations_dir`, R2 `preview_bucket_name`/`jurisdiction` unmodeled | schema, deploy | Add the optional fields to the KV/D1/R2 object inputs and emit them (reuse the proven Hyperdrive `previewId` pattern). Preview-scoped ids stop silently pointing at prod. | ✅ |
| Stale: AI binding accepts a `remote` that wrangler's schema rejects (silently ignored) | schema, docs | Re-check AI/AISearch/Vectorize `remote` against `config-schema.json`; keep where wrangler accepts it, drop/`@deprecated`-document where it doesn't. No silent no-op fields. | ✅ |

How covered (CF-1):
- `remote?` added to KV/D1/R2/queue-producer/service object input forms; R2 (`R2BindingInput`) and queue producers (`QueueProducerInput`) widened to `string | { … }` unions (string shorthand preserved), normalized via new `normalizeR2Binding`/`normalizeQueueProducer`, emitted with the `…(x !== undefined && { … })` pattern in `compiler/bindings.ts`.
- Preview/migration/jurisdiction fields: KV `previewId`→`preview_id`; D1 `previewDatabaseId`/`migrationsTable`/`migrationsDir`→`preview_database_id`/`migrations_table`/`migrations_dir`; R2 `previewBucketName`/`jurisdiction`→`preview_bucket_name`/`jurisdiction`.
- Stale AI check: wrangler 4.85 `config-schema.json` explicitly lists `remote: boolean` on the `ai`, `ai_search_namespaces`, `ai_search`, and `vectorize` blocks (even with `additionalProperties:false`), so all three are accepted — no `@deprecated` needed; the prior "silently ignored" flag was a false alarm.

## Batch CF-2 — net-new bindings: Stream, VPC, Flagship

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Cloudflare **Stream** binding (`stream`) unmodeled | schema, deploy, local-dev, test, docs | Add `streamBindingSchema` (mirror `images`/`media`: `{ binding, remote? }`), compile to `stream`, wire local-dev where Miniflare supports it, offline fixture, matrix row. | ✅ Stream covered: schema + compile to `stream`, local mock (`createMockStreamBinding`) plus Miniflare-backed dev/offline wiring, docs + matrix row. |
| **VPC** `vpc_services` / `vpc_networks` unmodeled (Miniflare has VPC plugins) | schema, deploy, local-dev, test, docs | First-class `vpcServices`/`vpcNetworks` schemas; emit arrays; wire Miniflare `vpcServices`/`vpcNetworks` for dev parity; offline fixture; matrix rows. | ✅ VPC covered: `vpcServices`/`vpcNetworks` schemas emit `vpc_services`/`vpc_networks`; remote-boundary surface tested via a custom-fake injected through `createMockEnv({ custom })`; docs + matrix rows. |
| **Flagship** feature-flag binding (`flagship`) unmodeled | schema, deploy, local-dev, test, docs | `flagshipBindingSchema` (`{ binding, appId, remote? }`), emit (`app_id`), Miniflare wiring, offline fixture, matrix row. | ✅ Flagship covered: schema + compile to `flagship` (`app_id`), pure mock (`createMockFlagshipBinding`) for app-flow tests, docs + matrix row. |

## Batch CF-3 — local-dev wiring for deploy-modeled-only bindings

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| **Analytics Engine** not wired into local Miniflare (`writeDataPoint()` unbound in dev) | local-dev | `buildAnalyticsEngineConfig()` → thread → `analyticsEngineDatasets` on the Miniflare worker (Miniflare's write-only stub prevents the dev crash). | ✅ `buildAnalyticsEngineConfig()` in `dev-server/miniflare-bindings.ts` maps `bindings.analyticsEngine` → `{ [binding]: { dataset } }`; threaded through `miniflare-dev-config.ts` → `miniflare-worker-config.ts` (`analyticsEngineDatasets` on the worker) and mirrored in the bridge (`bridge/miniflare.ts`) + test context (`test/simple-context-mfconfig.ts`). Write-only no-op stub; the dev crash is gone. |
| **Tail consumers** delivery not wired locally (handler testing works; live local delivery doesn't) | local-dev, docs | Thread `tailConsumers` → Miniflare worker `tails`. Document that handler testing is full, live local delivery is the wired addition. | ✅ `buildTailConsumersConfig()` maps the top-level `tailConsumers` → Miniflare `tails` (array of consumer service names) on the dev-server worker, the bridge, and the test context. Cross-Worker delivery works when the consumer Worker is also present locally; otherwise it degrades cleanly (the designator resolves to nothing — same contract as service bindings). The tail *handler* remains fully testable via `cf.tail.trigger()`. Support matrix updated. |
| Stale: mTLS binding silently drops `remote` flag locally (kept on deploy) | local-dev | Preserve/forward `remote` in `buildMtlsCertificatesConfig`. | ✅ `buildMtlsCertificatesConfig()` (and the bridge + test-context mTLS mappings) now forward `remote` alongside `certificate_id`, so deploy and local dev agree on the binding shape. (Miniflare's mTLS option is `{ certificate_id, remoteProxyConnectionString? }`, schema `"strip"`, so the extra `remote` key is harmless locally.) |

## Batch CF-4 — test/offline DX

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| No `createMockVectorize` (aiSearch has mocks; vectors are deterministically mockable) | test | In-memory `Map<id, vector+metadata>` + cosine `query()` + insert/upsert/delete/getByIds; `vectorize?` on `OfflineBindingFixtures`; export; reclassify matrix → offline-fixture. | ✅ |
| No `createMockAnalyticsEngine` (write-only recording stub) | test | Recording stub like `createMockQueue`; `analyticsEngine?` on `MockEnvOptions`; export; matrix entry. | ✅ |
| No `cf.alarm.trigger()` DO-alarm test helper (alarm event modeled, trigger missing) | test | `src/test/alarm.ts` `cf.alarm.trigger(state?, env?, opts?)` mirroring `cf.scheduled`; export from `cf.ts`/`index.ts`. | ✅ |
| `createOfflineBindings()` doesn't auto-wire KV/D1/R2/queues (mocks exist; land in `missingFixtures`) | test | Auto-create the existing mocks when the binding is in config and no fixture is given (mirror `addImagesBindings`). | ✅ |

How covered (CF-4):
- **`createMockVectorize`** (`src/test/utilities/vectorize.ts`): in-memory `Map<id, VectorizeVector>` implementing the workers-types beta `VectorizeIndex` — `insert` (throws on duplicate id), `upsert` (replaces), `deleteByIds` (+ a `delete()` alias), `getByIds`, `describe`, and a real cosine-similarity `query()` honoring `topK`, `returnValues`, `returnMetadata`, `namespace`, and the metadata `filter` grammar (`$eq/$ne/$lt/$lte/$gt/$gte/$in/$nin`); deterministic score-desc, id-asc ordering. Vector storage + cosine query are deterministic (a real mock); hosted indexing/ANN ranking/scale stay remote.
- **`createMockAnalyticsEngine`** (`src/test/utilities/analytics-engine.ts`): write-only recording stub mirroring `createMockQueue`; `writeDataPoint()` deep-snapshots each point into the inspectable `.writtenDataPoints` (alias `.points`) with a `clear()`. Honest: Analytics Engine has no in-worker read API, so it records writes and offers no query.
- **`cf.alarm.trigger(instance, { state?, env? })`** (`src/test/alarm.ts`): fires a DO instance's `alarm()` under a `durable-object-alarm` event installed via `runWithEventContext(createDurableObjectAlarmEvent(env, state), …)` — exactly how the DO transform wrapper invokes it — returning `{ success, error? }`; wired into `cf` (`src/test/cf.ts`) and exported (standalone `alarm`) from `src/test/index.ts`. No simple-context registration needed (it operates on a constructed DO instance, not a handler file).
- **Auto-wire**: `createOfflineBindings()` now auto-creates `createMockKV/D1/R2/Queue` (plus the new Vectorize/Analytics Engine mocks) for declared bindings; explicit `fixtures.{kv,d1,r2,queues,vectorize,analyticsEngine}` override. `OfflineBindingFixtures` gained those fields; `kv/d1/r2/queues` no longer land in `missingFixtures` (only `durableObjects`/`services` remain, as they require Miniflare). `MockEnvOptions` gained `vectorize`/`analyticsEngine`. Vectorize matrix reclassified `remote-boundary` → `offline-fixture` and a new `analyticsEngine` `offline-fixture` entry added.

## Batch CF-5 — stale/inaccurate coverage corrections

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Matrix mis-classifies **Durable Objects & Services** as `remote-boundary` (they work under `createTestContext()`) | docs/test | `SUPPORT_MATRIX` entries pointing at `createTestContext()`; fix `describeOfflineSupport()`. | ✅ |
| **Vectorize** matrix `remote-boundary` once a mock exists | docs/test | Reclassify to `offline-fixture` after CF-4. | ✅ (done in CF-4: `createMockVectorize` + matrix reclassified `offline-fixture`) |
| Stale: AI binding `remote` flag silently ignored (wrangler schema check) | docs | Re-confirm `remote` is on the `ai` block in `config-schema.json`; ensure no doc claims it is ignored. | ✅ |
| **Containers** notableGaps wording implies a missing binding (there is none — DO-attached `Container` is a runtime interface) | docs | Correct the wording; confirm containers config compiles. | ✅ |

How covered (CF-5):
- **Durable Objects & Services** were `remote-boundary` only because they had **no** `SUPPORT_MATRIX` entry, so `describeOfflineSupport()` fell through to its default ("No offline support classification exists" → `remote-boundary`) — which is false. Both run **fully locally** under `createTestContext()`: Miniflare executes the DO class (`src/test/simple-context-durable-objects.ts` discovers/bundles/registers it) and resolves service bindings worker-to-worker (`src/test/resolve-service-bindings.ts`). Added honest `offline-native` entries to `SUPPORT_MATRIX` (`src/test/offline-bindings.ts`) for both, with the accurate caveat that there is **no pure in-memory `createMockEnv()` mock** (a real DO/service binding needs the Miniflare runtime) — `createTestContext()` is the local path. `describeOfflineSupport('durableObjects')`/`('services')` no longer return the "No offline support classification exists" default. (The `missingFixtures` report for `createOfflineBindings()` is unchanged and stays correct: the **pure-offline** `createOfflineBindings()` cannot create them, so it still flags them with a "use createTestContext()" reason — distinct from the support-tier classification.)
- **AI `remote` flag**: re-confirmed against `wrangler@4.85.0` `config-schema.json` — the `ai` block lists properties `['binding', 'remote', 'staging']`, so devflare emitting `remote` on AI is accepted by wrangler (not silently ignored). No doc claims AI `remote` is ignored; no change needed (already resolved by CF-1, see line above).
- **Containers** wording: the original "missing `buildContainersConfig`/missing container binding" concern is stale. There is **no** separate `containers` env binding to model — the runtime `Container` is a Durable-Object-attached facet interface (`@cloudflare/containers` `Container` extends a DO; `getContainer(env.MY_DO, id)` reaches it through the **DO** binding). devflare compiles the top-level `containers` **config** for deploy via `compileContainers()` (`src/config/compiler/core-helpers.ts:51`, called at `src/config/compiler.ts:158`), mapping each entry to the wrangler `containers[]` shape (`class_name`/`image`/`max_instances`/`instance_type`/`image_build_context`/…). Local container testing is the existing `DEVFLARE_CONTAINER_TESTS` Docker/Podman path. All shipped docs/content already describe this accurately (`docs/CLOUDFLARE_SUPPORT_MATRIX.md` "Containers (offline-first)"; docs-site compact guide `categoryDescription`/`envType` = "Container class config plus a Durable Object container binding"; support level `containers: 'Full'`) — no shipped wording implies a missing binding, so no content edit was required.

## Batch CF-6 — CLI / deploy lifecycle parity

Split into **CF-6a** (deploy/CLI lifecycle — gradual deploy + `devflare tail`, shipped)
and **CF-6b** (build-time lint + cron validation + secrets hint, shipped).

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| **Gradual / percentage deployments** are read-only (deploy sends only config/message/tag) | deploy | A `--percentage <n>` (+ optional `--version <id>`) rollout that uploads an inactive version and splits traffic via the right `wrangler versions deploy` call. | ✅ |
| No `devflare tail` production log-streaming command | cli | `src/cli/commands/tail.ts` streaming via the Workers Trace (tail) API; route + `COMMANDS`. | ✅ |
| 2-arg fetch handler style is a runtime-only check (no build-time lint) | build | Build/dev worker-load check on the resolved fetch export (`length===2` without the style marker) → actionable error. | ✅ |
| Cron expressions unvalidated (`cf.scheduled.trigger('typo')` passes) | schema/test | Validate a 5-field cron grammar in the schema + in `scheduled.ts`. | ✅ |
| Remote secret management is local-only (intentional) but unsignaled at deploy | cli/docs | Post-deploy hint pointing to `wrangler secret put`/dashboard; link from `secrets --help`. | ✅ |

How covered (CF-6a):
- **Gradual / percentage deployments** — `devflare deploy --prod --percentage <n>` performs a Cloudflare *gradual deployment* faithfully on Wrangler's version-based model: Devflare runs `wrangler versions upload` (uploads the new code as an **inactive** version — no traffic shift; `wrangler deploy` has no percentage flag and would go straight to 100%), resolves the new version id (structured output, then the existing version/deployment fallbacks), then runs `wrangler versions deploy <new-version-id>@<n> --name <worker> [--message …] --yes` to route **n%** of production traffic to it (`--yes` accepts the non-interactive defaults for CI). The traffic split uses Wrangler's positional `<version-id>@<percentage>` shorthand (verified against the installed `wrangler@4.85.0` `versions deploy` command: *"Shorthand notation to deploy Worker Version(s) [<version-id>@<percentage>..]"* + the `--yes`/`--message`/`--name` flags). `--version <current-version-id>` keeps the remaining `100−n%` on a specific live version (`<old>@<rest>`); otherwise only the new version is named and Wrangler distributes the rest. **Covered:** initiating a rollout at a chosen percentage in one command (incl. a fully-specified two-version split) + a `--dry-run` description. **Needs raw wrangler:** *advancing* an existing rollout (10% → 50% → 100%) without re-uploading is a pure `wrangler versions deploy <id>@<pct>` and is documented as such (re-running `devflare deploy --percentage` uploads a fresh version each time). The pure arg/percentage logic lives in `src/cli/gradual-deploy.ts` (`parseDeployPercentage`, `buildVersionSpecs`, `buildGradualDeployInvocation`); the two-step orchestration is wired in `src/cli/commands/deploy.ts`. `--percentage` is production-only (rejected with `--preview`).
- **`devflare tail`** — `src/cli/commands/tail.ts` (registered in `src/cli/index.ts` + `COMMANDS`) streams live logs from a **deployed** Worker via Cloudflare's Workers Trace (tail) API: it authenticates with the existing token resolution (`getApiToken`, i.e. `devflare login` / `CLOUDFLARE_API_TOKEN`), resolves the worker name (arg → `--worker` → config `name`) and account (`--account` → config `accountId` → resolved default), `POST`s `…/workers/scripts/{script}/tails` to mint a short-lived WebSocket endpoint, connects with the `trace-v1` sub-protocol + `Authorization: Bearer` header (via the existing `ws` dependency), and prints each trace event (timestamp, trigger, outcome, logs, exceptions) in `--format pretty` (default) or `--format json`. On Ctrl-C / stream end it `DELETE`s the tail session and closes the socket. This is **inherently remote** (an operate-deployed-Worker command, stated in `--help`); the offline tail-*handler* test path remains `cf.tail.trigger()`. Auth-missing / worker-not-found / account-unresolved surface clear errors (no swallowing).

How covered (CF-6b):
- **Cron-expression validation** — a standalone Cloudflare 5-field cron grammar validator lives in `src/config/cron.ts` (`isValidCronExpression` / `assertValidCronExpression` / `formatInvalidCronMessage`). It accepts `*`, numbers, ranges (`1-5`), lists (`1,3,5`), steps (`*/5`, `1-30/5`, `5/15`) and the 3-letter month (`JAN`-`DEC`) / weekday (`SUN`-`SAT`) names with the correct per-field ranges (minute 0-59, hour 0-23, day-of-month 1-31, month 1-12, day-of-week 0-7 where 0 and 7 = Sunday), and rejects wrong field counts (no seconds/year), out-of-range values, zero/empty steps, backwards ranges, and bad names. It is wired as a `.superRefine()` on `triggers.crons` in `src/config/schema-runtime.ts` (per-entry, with the bad expression named and a `['crons', index]` path) so a typo fails at config-parse time before deploy, and `cf.scheduled.trigger(cron)` (`src/test/scheduled.ts`) now calls `assertValidCronExpression` on an explicitly-passed cron so a bad cron in a test rejects with the same helpful message (an omitted cron still defaults to the always-valid `* * * * *`). Thorough valid/invalid unit matrix in `tests/unit/config/cron.test.ts` (incl. `*/15 * * * *`, `0 0 1 * *`, `0 9 * * MON-FRI`, `5,35 * * * *` accepted; `* * * *`, `60 * * * *`, `*/0`, `abc`, `0 9 * * FUNDAY` rejected). All historically-valid fixtures (`0 * * * *`, `0 0 * * *`, `0 */6 * * *`) stay valid.
- **Build/dev-time 2-arg fetch-handler check** — `validateFetchHandlerStyle()` (`src/worker-entry/validate-fetch-style.ts`) is called inside `prepareComposedWorkerEntrypoint()` (`src/worker-entry/composed-worker.ts`), which is the **shared worker-load chokepoint** for dev start (`dev-server/server.ts`), `devflare build` (`cli/commands/build-artifacts.ts`), and the Vite plugin (`vite/plugin-context.ts`). It imports the fetch surface module devflare already resolved, runs `resolveFetchHandler()` + the **exact same** `assertExplicit2ArgStyle()` as the request-time check (now exported from `runtime/middleware.ts`), and throws the **same actionable message** (pointing at `defineFetchHandler({ style })`) — so an unmarked 2-arg handler fails at dev start / build instead of on the first request. Zero false positives by construction: it reuses devflare's own resolver + own style markers, so it only fires for the precise case the runtime fires for; it is a no-op for 1-arg handlers, 3-arg worker handlers, `defineFetchHandler({style})`-marked handlers, `sequence(...)` compositions, idiomatic 3-arg `export default { fetch }` worker objects, and modules with no fetch export; and it never invents a violation from source text — if the module can't be imported (framework build-artifact path, unrelated import-time error) it skips silently and the runtime check remains the backstop. Fire + no-false-positive matrix in `tests/unit/worker-entry/validate-fetch-style.test.ts`.
- **Remote-secrets hint** — after a successful **production** deploy (not preview, not `--dry-run`), `src/cli/commands/deploy.ts` prints a one-line dimmed hint that production runtime secrets are set with `wrangler secret put` or the Cloudflare dashboard (devflare manages local secret values via `devflare secrets --local` and emits Secrets Store references only — it never sends secret values to Cloudflare). The same pointer is added to the `secrets` command help notes (`src/cli/help-pages/pages/core.ts`). The hint is gated on `!preview && !isBranchScopedPreviewDeployment` (so neither a bare `--preview` upload nor a named/branch-scoped preview triggers it) and the dry-run path returns before the success block, so it shows only on a real production deploy. Tested in `tests/integration/cli/deploy-secrets-hint.test.ts` (shows on prod; absent on bare preview, named/branch-scoped preview, and dry-run).

## Batch CF-7 — boundaries + documentation

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| DO **WebSocket Hibernation** (`acceptWebSocket`/`getWebSockets`/`serializeAttachment`) — claimed "not in DO context/bridge" | local-dev/test/docs | **Stale claim corrected.** Hibernation already works locally; document it precisely with the worked example and the one cross-process-bridge nuance. | ✅ |
| `unsafe` bindings/metadata are passthrough-only, undocumented | docs | A matrix section (like the Python Workers one) stating unsafe is passthrough-only, no local wiring. | ✅ |
| Legacy `wasm_modules`/`text_blobs`/`data_blobs` superseded by `rules`, undocumented for porters | docs | A short note that these are passthrough-reachable and `rules` is the modern path. | ✅ |
| Email Routing **rules** are a dashboard service (not wrangler) — set expectations | docs | A note that `send_email` + the email handler are full; inbound routing rules live in the CF dashboard. | ✅ |

How covered (CF-7), all in `docs/CLOUDFLARE_SUPPORT_MATRIX.md`:
- **DO WebSocket Hibernation** — the original gap statement ("not in DO context/bridge") was a **stale claim**: hibernation works locally because Miniflare runs the DO class in real `workerd`, so `state.acceptWebSocket`/`getWebSockets`/`getTags`/`setWebSocketAutoResponse` + `ws.serializeAttachment`/`deserializeAttachment` all function, and Devflare's DO wrapper (`src/transform/durable-object.ts`) relays the `webSocketMessage`/`webSocketClose`/`webSocketError` handlers under the normal event context. Verified by `cases/case18`'s `ChatRoom` DO (full hibernation API) whose bridge test (`tests/integration/bridge/case18-do.test.ts`) drives the hibernation-backed `getWebSockets()` count through the cross-process bridge. Added a **### Durable Object WebSocket Hibernation** subsection documenting this plus the single nuance: a WebSocket opened to a DO *from another process* via `stub.connect()` is a live relay across the bridge, while the DO's own hibernation state lives in real local Miniflare and behaves normally.
- **`unsafe` bindings/metadata** — added a **## Passthrough-only** section: the binding schema is `.strict()` (so `unsafe` cannot be a normal binding) and Miniflare has no `unsafe` plugin, so there is **no local emulation**; it is reachable for deploy through `wrangler.passthrough` (verified merge point: `src/config/compiler.ts:164` `Object.assign(result, mergedConfig.wrangler.passthrough)`), typed by the user and faked via `createMockEnv({ custom })`.
- **Legacy `wasm_modules`/`text_blobs`/`data_blobs`** — documented in the same section: the modern first-class path is Devflare's `rules` (`CompiledWasm`/`Text`/`Data` module-rule types Devflare already models) plus ES-module imports; the legacy global form is `wrangler.passthrough`-reachable for deploy with no local wiring.
- **Email Routing rules** — extended the Send Email bullet: the outbound `send_email` binding and the inbound email handler (`cf.email.trigger()`) are fully covered; Email Routing **rules** (which addresses route inbound mail to the Worker) are a Cloudflare **dashboard** service, not a Wrangler config field, and stay in the dashboard.

## Batch CF-8 — re-investigate

After CF-1..7 ship, re-run the grounded gap analysis. Append any newly-surfaced
gaps as a new batch and repeat until the analysis returns zero real gaps. Each
loop is recorded below.

### Re-investigation log
- **First pass** (grounded in `wrangler@4.85.0`, `miniflare@4.20260424.0`,
  `@cloudflare/workers-types@4.20260426.1`): surfaced **13 distinct confirmed
  real gaps** — **2 medium**, **11 low**. These are implemented in **Batch CF-9**
  below (12 features + the legacy `site` docs note).
  - **Correctly-triaged rejected candidates** (not real gaps):
    - **Already covered via documented `wrangler.passthrough`** — `build`,
      `tsconfig`, `logfwdr`, `first_party_worker`, `legacy_env`,
      `python_modules`, `preview_urls`. Each is reachable verbatim through the
      passthrough escape hatch (the same path documented for Python Workers /
      `unsafe` / legacy globals).
    - **Inherent bundling boundary (documented passthrough boundary)** — **all**
      of Wrangler's esbuild bundling-step flags, such as `minify`, `define`,
      `alias`, `no_bundle`, `keep_names`, `jsx_factory`, and `jsx_fragment` (the
      list is open-ended — any esbuild bundling flag Wrangler adds belongs to this
      class). These belong to Wrangler's own bundling step, which sits outside
      Devflare's schema; they are the documented passthrough boundary, not a model
      gap. Devflare's native bundling control is `config.rolldown`.
    - **Not applicable** — `unsafeEphemeralDurableObjects` and the
      queue-consumer `type` const. Neither corresponds to a real Devflare-modeled
      behavior to add.
- **Second pass** (after CF-9 shipped, same dependency grounding): **6 of 8
  survey areas returned zero candidates** — strong convergence. Only **2 low**
  gaps surfaced, both documentation/DX on already-working backends (no missing
  capability, no inherent boundary): the `productions deployments` history
  subcommand and the undocumented `observability` config tier. Both are
  implemented in **Batch CF-11** below. No rejected candidates this pass.
- **Third pass** (after CF-11 shipped, same dependency grounding): **7 of 8
  survey areas returned zero candidates**. Only **1 medium** gap surfaced — the
  `sendEmail` binding was the one mockable family with a pure local mock that was
  not auto-wired into the pure-offline `createOfflineEnv()` path (nor classified
  in the offline `SUPPORT_MATRIX`). Implemented in **Batch CF-13** below. No
  rejected candidates this pass.
- **Fourth pass** (after CF-13 shipped, same dependency grounding): only **2 low**
  gaps surfaced, both the same class — unthreaded Miniflare `CoreSharedOptions`
  local-dev knobs (`server.liveReload`, `server.cf`), direct siblings of the
  `server.https`/`inspectorPort`/`upstream` added in CF-9. Implemented in **Batch
  CF-15** below. Rejected (correctly): top-level `cloudchamber` (rides
  `wrangler.passthrough`) and queue-consumer `type` (already dispositioned as
  not-applicable). One survey area (binding-subfields) did not return a result
  this pass (a survey agent aborted); it was fully addressed in CF-9 and returned
  zero in the second and third passes, and is re-covered in the next pass.
- **Fifth pass** (after CF-15 shipped, same dependency grounding; binding-subfields
  re-covered → zero): **7 of 8** survey areas returned zero. **1 medium**
  correctness defect surfaced — a regression introduced by CF-9: the
  `streamingTailConsumers` object form carried an `environment` field (copied from
  `tailConsumers`), but wrangler's `StreamingTailConsumer` is `service`-only
  (`additionalProperties: false`), so a config setting it would validate locally
  yet fail at deploy. Fixed in **Batch CF-17** below. Rejected (correctly):
  Browser Rendering "no local mock/wiring" (already fully wired —
  `src/browser-shim/*` + `offline-native` tier, like DO/services/containers).
- **Sixth pass** (after CF-17 shipped, same dependency grounding): **7 of 8**
  survey areas returned zero. **1 low** gap — the Durable Objects binding did not
  model wrangler's optional `environment` sub-field (the service-environment of a
  cross-worker `scriptName`); since the DO predicate isn't `.strict()`, a
  user-set `environment` was silently dropped before deploy (validate-locally ≢
  deploy-valid, the mirror of CF-17). Fixed in **Batch CF-19** below. No rejected
  candidates this pass.
- **Seventh pass** (after CF-19 shipped, same dependency grounding): **7 of 8**
  survey areas returned zero. **1 medium** correctness gap — the **service**
  binding emitted a separate `environment` field, but wrangler's `services` item
  is `additionalProperties:false` (it addresses an environment via the service
  *name*), so a config setting it produced deploy-invalid output. Fixed in **Batch
  CF-21** below (fold into the name). This also corrected the stale CF-19 claim
  that services carry `environment`. Rejected (correctly): D1
  `database_internal_env` (inherent boundary — internal-use wrangler field),
  queue-consumer `type` const (not-applicable, already dispositioned). The
  contested service-vs-DO `environment` fact was settled by reading wrangler
  4.85.0's `config-schema.json` directly (services: no; DO/dispatch/tail: yes).
- **Eighth pass** (after CF-21 shipped, same dependency grounding): **7 of 8**
  survey areas returned zero; the lone finding was **documentation-completeness
  only** — the bundling-boundary enumeration above was a *closed* four-item list
  (`minify`/`define`/`alias`/`no_bundle`) that omitted same-class esbuild flags
  (`jsx_factory`/`jsx_fragment`/`keep_names`), all already passthrough-reachable
  with no missing capability. Fixed in **Batch CF-23** by making that boundary
  enumeration **open-ended** (covering all current and future esbuild flags in one
  stroke). Rejected (correctly): `send_metrics` and Browser Rendering (both
  already-covered). No capability/correctness gap surfaced.
- **Ninth pass** (after CF-23 shipped, same dependency grounding): **3 gaps** (1
  medium, 2 low). MEDIUM — another field-on-wrong-subtype leak from CF-9: route
  `enabled`/`previews_enabled` were emitted on **any** route, but wrangler's
  `ZoneIdRoute`/`ZoneNameRoute` are `additionalProperties:false` (only
  `CustomDomainRoute` accepts them) → deploy-invalid. LOW — the last two unthreaded
  `CoreSharedOptions` local-dev knobs (`inspectorHost`, `verbose`; plus
  `logRequests` added proactively to close the class). All fixed in **Batch CF-25**
  below; the full `CoreSharedOptions` set was enumerated and the remaining fields
  (rootPath, raw httpsKey/Cert, log/handle*/structuredWorkerdLogs, unsafe*,
  defaultPersistRoot, telemetry/deviceId) deliberately left unmodeled as
  internal/Devflare-managed. Rejected (correctly): queue-consumer `type` and the
  wrangler `dev` sub-fields (both already-covered).

## Batch CF-9 — CF-8 confirmed gaps (implemented)

The 13 confirmed gaps from the CF-8 first pass, shipped. Each is covered the
devflare-way: **deploy-only** (compiled into the Wrangler config, no local
Miniflare analogue), **local-wired** (compiled **and** threaded into the dev/test
Miniflare worker), **dev-only** (a local-runtime knob with no Wrangler field), or
**docs** (passthrough-reachable, documented).

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Queue consumer `visibilityTimeoutMs` unmodeled | schema, deploy | **Deploy-only.** Emit `visibilityTimeoutMs` → `visibility_timeout_ms`. Miniflare has no local consumer-visibility option, so it is compiled for deploy with no local effect. | ✅ |
| Top-level `complianceRegion` unmodeled | schema, deploy | **Deploy-only.** `complianceRegion` (`'public'` \| `'fedramp_high'`) → `compliance_region`. Account/region metadata, no local-runtime analogue. | ✅ |
| `workersDev` hardcoded `true` (no toggle) | schema, deploy | **Deploy-only.** `workersDev` → `workers_dev` is now a toggle (still defaults `true`). Controls the `*.workers.dev` edge route; no local effect. | ✅ |
| Custom-domain route `enabled` / `previewsEnabled` unmodeled | schema, deploy | **Deploy-only.** Route `enabled` → `enabled`, `previewsEnabled` → `previews_enabled` route metadata. Governs Cloudflare routing/preview; no local effect. | ✅ |
| Queue producer `deliveryDelay` unmodeled | schema, deploy, local-dev | **Local-wired.** `deliveryDelay` → `delivery_delay` for deploy **and** threaded into Miniflare `QueueProducerOptions.deliveryDelay`, so delayed delivery is exercised locally. | ✅ |
| Service binding `props` unmodeled | schema, deploy, local-dev | **Local-wired.** Accept + emit `props` (read via `ctx.props`) **and** thread it into Miniflare `serviceBindings`, so cross-service `props` delivery is testable in dev/test. | ✅ |
| `streamingTailConsumers` unmodeled | schema, deploy, local-dev, docs | **Local-wired** (like `tailConsumers` but **service-only** — see CF-17). Compile to `streaming_tail_consumers` for deploy **and** thread into Miniflare `streamingTails`; cross-Worker delivery works when the consumer Worker is present locally, degrades cleanly otherwise. | ✅ |
| `server` config missing `https`/`inspectorPort`/`upstream` | schema, local-dev | **Local-wired (dev-runtime).** `server` now also accepts `https`/`httpsKeyPath`/`httpsCertPath`/`inspectorPort`/`upstream`, threaded into Miniflare `CoreSharedOptions` — local HTTPS dev, custom inspector port, custom upstream. No deploy effect. | ✅ |
| Cache API contents don't persist across dev-server restarts | local-dev | **Local-wired (dev-runtime).** `cachePersist` persists the Cache API (`caches` global, on by default) across restarts, alongside the sibling kv/r2/d1/DO persist options. | ✅ |
| No local outbound-fetch routing to a named service | local-dev | **Dev-only.** New `outboundService` (not a Wrangler field) routes a Worker's outbound `fetch()` to a named service for local cross-service testing. No deploy analogue. | ✅ |
| `send_email` `remote` flag unmodeled | schema, deploy, docs | **Deploy-only (honest nuance).** Accept a `remote?` flag on the `sendEmail` binding and emit it into the Wrangler config for deploy. Miniflare's local `send_email` has **no** `remote` field (only an internal remote-proxy connection string, exactly like mTLS), so the flag is a **deploy-time directive stripped locally** — no local remote behavior is claimed. | ✅ |
| Legacy Worker **`site`** (static assets) undocumented | docs | **Docs.** Legacy `site` is superseded by `assets`; passthrough-reachable via `wrangler.passthrough` for verbatim porting (deploy-only, no local wiring). Documented in the matrix "Passthrough-only / legacy module globals" section alongside `wasm_modules`/`text_blobs`/`data_blobs` (CF-8 gap #8). | ✅ |

How covered (CF-9):
- **Deploy-only (compiled into the Wrangler config, no local Miniflare effect):**
  queue consumer `visibilityTimeoutMs` → `visibility_timeout_ms` (Miniflare has
  no local consumer-visibility option); top-level `complianceRegion` →
  `compliance_region`; top-level `workersDev` → `workers_dev` (was hardcoded
  `true`, now a toggle that still defaults `true`); custom-domain route `enabled`
  + `previewsEnabled` → `enabled` / `previews_enabled`.
- **Local-wired (compiled **and** wired into dev/test Miniflare):** queue
  producer `deliveryDelay` → `delivery_delay` (Miniflare
  `QueueProducerOptions.deliveryDelay`); service binding `props` (object, exposed
  via `ctx.props`) — accepted, emitted, and wired to Miniflare `serviceBindings`;
  `streamingTailConsumers` → `streaming_tail_consumers`, wired to Miniflare
  `streamingTails` (like the existing `tailConsumers`, but service-only — see
  CF-17 for the `environment`-asymmetry correction); the `server`
  config's `https`/`httpsKeyPath`/`httpsCertPath`/`inspectorPort`/`upstream`,
  threaded into Miniflare `CoreSharedOptions`; `cachePersist`, which persists the
  Cache API across dev-server restarts alongside the sibling kv/r2/d1/DO persist
  options.
- **Dev-only (a local-runtime knob, not a Wrangler field):** `outboundService`
  routes a Worker's outbound `fetch()` to a named service for local cross-service
  testing.
- **Honest nuance — `send_email` `remote`:** devflare accepts a `remote?` flag on
  the `sendEmail` binding and emits it for deploy, but Miniflare's local
  `send_email` has no `remote` field (only an internal remote-proxy connection
  string, exactly like mTLS), so the flag is a deploy-time directive and is
  stripped locally — **no local remote `send_email` behavior is claimed.**
- **Docs — legacy `site`:** added to the matrix "Passthrough-only / legacy module
  globals" section: `site` is superseded by `assets` and passthrough-reachable
  via `wrangler.passthrough` for verbatim porting (deploy-only, no local wiring).

## Batch CF-11 — CF-10 convergence gaps (implemented)

The 2 low gaps from the CF-8 second pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Full deployment history not surfaced as a CLI command | deploy-cli | Add a read-only `devflare productions deployments` subcommand rendering the existing `account.workerDeployments` history (no new API/write surface). | ✅ |
| `observability` (and `placement` / `limits`) config tier missing from the support matrix | docs | Add deploy-only rows to the matrix "Platform config" table. | ✅ |

How covered (CF-11):
- **`productions deployments` subcommand** — `src/cli/commands/productions.ts` now
  lists the full chronological deployment history (Deployed · Deployment id ·
  Strategy · Traffic split `pct% → versionId` · Source · Triggered by · Message)
  via the already-wired `account.workerDeployments` read API — the same
  account-resolution path `list`/`versions` use, kept strictly read-only. Help
  page + unit test added. (`list` still shows the latest deployment summary;
  `versions` lists per-version; `deployments` adds the full multi-deployment
  history with strategy/split/message/triggeredBy that was previously unexposed.)
- **`observability` / `placement` / `limits` matrix rows** — these three
  first-class top-level keys are modeled, typed, and compiled for deploy but had
  no local Miniflare analogue and were missing from the matrix's deploy-only
  table; added as deploy-only rows so their support tier is discoverable
  (mirroring the CF-9 `complianceRegion`/`workersDev`/route-flag rows).

## Batch CF-13 — CF-12 convergence gap (implemented)

The 1 medium gap from the CF-8 third pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| `sendEmail` had a pure local mock but was not auto-wired into the pure-offline test path | test/docs | Auto-wire it into `createOfflineEnv()` / `createMockEnv` and classify it in the offline `SUPPORT_MATRIX`, at parity with every other mockable binding. | ✅ |

How covered (CF-13):
- **`sendEmail` offline parity** — new public `createMockSendEmail()` (a recording
  SendEmail mock that captures dispatched mail into `.sentEmails` while enforcing
  the configured sender/destination allow-lists), auto-wired in
  `createOfflineBindings()` right after `analyticsEngine` so `createOfflineEnv()`
  / `createMockEnv({ sendEmail })` expose a working `env.MY_EMAIL.send(...)`
  without Miniflare; a `SUPPORT_MATRIX.sendEmail` entry classified
  **`offline-native`** (send-only with a complete local mock, like `pipelines`),
  so `describeOfflineSupport('sendEmail')` no longer falls through to the false
  `remote-boundary`; `createMockSendEmail` + the underlying
  `createLocalSendEmailBinding` are re-exported from `devflare/test`. This closes
  the last DX inconsistency — every mockable binding is now both auto-wired offline
  and classified.

## Batch CF-15 — CF-14 convergence gaps (implemented)

The 2 low gaps from the CF-8 fourth pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| `server.liveReload` not modeled/wired for local dev | local-dev | Add `server.liveReload` to the dev-server config, threaded into Miniflare `CoreSharedOptions`. | ✅ |
| `server.cf` not modeled/wired for local dev | local-dev | Add `server.cf` (`boolean \| string \| object`) to the dev-server config, threaded into Miniflare `CoreSharedOptions`. | ✅ |

How covered (CF-15): both are pure local-dev Miniflare `CoreSharedOptions` knobs,
direct siblings of the `server.https`/`inspectorPort`/`upstream` added in CF-9 —
added to `serverConfigSchema` + `ServerConfigInput` and threaded into the dev
Miniflare `sharedOptions` (`miniflare-dev-config.ts`) with the same
`serverConfig?.x !== undefined && { x }` pattern. `liveReload` injects Miniflare's
in-browser auto-reload (complementing Devflare's source watcher); `cf` overrides
the local `request.cf` (`false` to omit, a JSON file path, or an object injecting
colo/country/TLS/bot-management). Deploy-inert; tested in
`miniflare-dev-config.test.ts`.

## Batch CF-17 — CF-16 correctness fix (implemented)

The 1 medium defect from the CF-8 fifth pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| `streamingTailConsumers` accepted an `environment` field that wrangler rejects at deploy | schema, compiler, docs | Remove `environment` from the streaming-tail schema/types/compiler so it is rejected at config-parse time — keeping validate-locally ≡ deploy-valid. | ✅ |

How covered (CF-17): a CF-9 regression — `streamingTailConsumers` was modeled as a
"full twin of `tailConsumers`" including an optional `environment`, but wrangler's
`StreamingTailConsumer` is **`service`-only** (`additionalProperties: false`,
deliberately asymmetric from `TailConsumer`). A config setting `environment`
validated locally but would fail at deploy. Fixed by dropping `environment` from
`streamingTailConsumerSchema`, `StreamingTailConsumerObjectConfigInput`, the
compiler output type, and the compiler emit, so it is now **rejected at
config-parse time** with a clear error (validate-locally ≡ deploy-valid). The
docs' "full twin" wording is corrected to "service-only." A new
`runtime-config.ts` test asserts `environment` is rejected; the compiler test
asserts service-only output.

This is the convergence loop's first **correctness** finding (vs. coverage) — a
self-introduced regression caught by the same grounded re-investigation. A
**sixth** pass after CF-17 is the next convergence check; the loop ends when a
pass returns zero real gaps.

## Batch CF-19 — CF-18 convergence gap (implemented)

The 1 low gap from the CF-8 sixth pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Durable Objects binding did not model wrangler's `environment` sub-field (cross-worker DOs) | schema, normalization, compiler, docs | Model `environment?` on the DO binding, thread it through normalization, and emit it for cross-worker DOs (`script_name` present) — mirroring how service bindings carry `environment`. | ✅ |

How covered (CF-19): added `environment?: string` to `DurableObjectBindingInput`
and `NormalizedDOBinding`, carried it through `normalizeDOBinding`, and emitted it
in `compiler/bindings.ts` **only when `script_name` is present** (a local DO drops
it, since `environment` is the service-environment of a cross-worker target).
Deploy-only (no local-dev analogue), mirroring the existing service-binding /
dispatch-namespace `environment` support. This closes the validate-locally ≢
deploy-valid leak (the field was silently dropped before, the mirror of CF-17's
fix). Compiler tests assert the cross-worker round-trip and the local-DO drop.
This aligns DO `environment` with wrangler. (Note: the parenthetical here
originally claimed service bindings carry a separate `environment` field — that
was wrong and is corrected in **CF-21**: wrangler's `services` item is
`additionalProperties:false` and addresses an environment via the service *name*,
so devflare folds it into the name rather than emitting a separate field. Verified
directly against wrangler 4.85.0: `DurableObjectBindings.items` and
`dispatch_namespaces.outbound` and `tail_consumers` DO carry `environment`;
`services` and `streaming_tail_consumers` do NOT.)

A **seventh** pass after CF-19 is the next convergence check; the loop ends when a
pass returns zero real gaps.

## Batch CF-21 — CF-20 correctness fix (implemented)

The 1 medium defect from the CF-8 seventh pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Service binding emitted a separate `environment` field that wrangler rejects | schema, compiler, docs | wrangler addresses a service environment via the **name**, so fold `environment` into the emitted `service` (`<service>-<environment>`) and stop emitting a separate field — keeping the ergonomic input AND producing deploy-valid output. | ✅ |

How covered (CF-21): verified directly against wrangler 4.85.0's
`config-schema.json` that the `services` item is `additionalProperties:false` with
no `environment` property, and that its `service` description says to address an
environment via `<worker_name>-<environment_name>`. The compiler now folds
`config.environment` into the emitted `service` name (rather than emitting the
unsupported separate field), the `environment` compiler-output type is removed,
and the input `environment` field is **kept** (backward-compatible, ergonomic)
with a clarified doc. Local Miniflare wiring already used the base service name
(environments are a deploy concept), so no local change was needed. This is the
mirror of CF-17 but resolved by *transforming* rather than *dropping* — the field
keeps working and the output is deploy-valid. Per-binding `environment` now
matches wrangler exactly: DO / dispatch-outbound / tail-consumers emit it as a
field; services fold it into the name; streaming-tail-consumers reject it.

This was the convergence loop's second **correctness** finding and required
settling a contested cross-pass fact (does wrangler accept service `environment`?)
by reading the installed schema directly. An **eighth** pass after CF-21 is the
next convergence check; the loop ends when a pass returns zero real gaps.

## Batch CF-23 — CF-22 documentation-completeness fix (implemented)

The 1 low, documentation-only finding from the CF-8 eighth pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| The bundling-boundary enumeration was a closed list omitting same-class esbuild flags (`jsx_factory`/`jsx_fragment`/`keep_names`) | docs | Make the boundary enumeration **open-ended** (all esbuild bundling flags), not a closed four-item list; add a matrix subsection. | ✅ |

How covered (CF-23): no capability was missing — every esbuild bundling flag is
already passthrough-reachable (`wrangler.passthrough` → `compiler.ts` merge) and
Devflare's native bundling control is `config.rolldown`. The only gap was that the
"inherent bundling boundary" bullet named exactly four flags as a *closed* list,
so a JSX-Worker porter had no documented landing spot. Generalized the bullet to
cover **all** esbuild bundling-step flags (naming `minify`/`define`/`alias`/
`no_bundle`/`keep_names`/`jsx_factory`/`jsx_fragment` as examples, explicitly
open-ended) and added an "esbuild bundling flags" subsection to the matrix's
passthrough section. This closes the whole class, not just the two named flags.

A **ninth** pass after CF-23 is the next convergence check; the loop ends when a
pass returns zero real gaps.

## Batch CF-25 — CF-24 confirmed gaps (implemented)

The 3 gaps from the CF-8 ninth pass, shipped.

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Route `enabled`/`previews_enabled` emitted on non-custom-domain routes (deploy-invalid) | schema, compiler, docs | Reject at config-parse time on `zone_id`/`zone_name` routes (superRefine) + emit only for custom-domain routes. | ✅ |
| `server.inspectorHost` not modeled/wired | local-dev | Add to `serverConfigSchema`/`ServerConfigInput` + thread to Miniflare `CoreSharedOptions`. | ✅ |
| `server.verbose` / `server.logRequests` not modeled/wired | local-dev | Same — thread the remaining log knobs. | ✅ |

How covered (CF-25):
- **Route flags (medium, correctness)** — the third field-on-wrong-subtype leak
  of the CF-17/19/21 class: wrangler's `ZoneIdRoute`/`ZoneNameRoute` are
  `additionalProperties:false` and reject `enabled`/`previews_enabled` (only
  `CustomDomainRoute` accepts them). `routeConfigSchema.superRefine` now rejects
  those flags when `custom_domain` is not set (validate-locally ≡ deploy-valid),
  and the compiler emits them only for custom-domain routes. Verified by direct
  `safeParse` probes (reject on zone routes, accept on custom-domain/plain-zone).
- **`server.inspectorHost` / `server.verbose` / `server.logRequests`** — the last
  user-facing Miniflare `CoreSharedOptions` local-dev knobs, added to the `server`
  config and threaded into the dev `sharedOptions` (siblings of the CF-9/CF-15
  `https`/`inspectorPort`/`upstream`/`liveReload`/`cf` set). The full
  `CoreSharedOptions` list was enumerated to **close the class**: the remaining
  fields (`rootPath`, raw `httpsKey`/`httpsCert`, `log`/`handleRuntimeStdio`/
  `handleStructuredLogs`/`structuredWorkerdLogs`, the `unsafe*`/dev-registry
  options, `defaultPersistRoot`, `telemetry`/`deviceId`) are deliberately left
  unmodeled as internal / Devflare-managed (CLI `--verbose`/`--debug` already
  drives the Miniflare `log` level; persist roots are managed by Devflare).

A **tenth** pass after CF-25 is the next convergence check; the loop ends when a
pass returns zero real gaps.

---

⛔ **Inherent boundaries — confirmed correctly signaled (NOT gaps; do not fake):**
Workers AI inference · Vectorize indexing/ranking · AI Gateway · Cloudflare
Builds (CI/CD) · Hyperdrive raw `connect()` · hosted Images API · dispatch-namespace
dynamic dispatch · pipelines ingestion · in-worker Secrets Store CRUD · mTLS
handshake/validation · Email Routing inbound *rules* · DO WebSocket `onError`
detail · Logpush job provisioning. devflare throws clear documented errors or
matrix-flags these `remote-boundary` rather than returning fake data.
