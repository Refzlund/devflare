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
and **CF-6b** (build-time lint + cron validation + secrets hint, pending).

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| **Gradual / percentage deployments** are read-only (deploy sends only config/message/tag) | deploy | A `--percentage <n>` (+ optional `--version <id>`) rollout that uploads an inactive version and splits traffic via the right `wrangler versions deploy` call. | ✅ |
| No `devflare tail` production log-streaming command | cli | `src/cli/commands/tail.ts` streaming via the Workers Trace (tail) API; route + `COMMANDS`. | ✅ |
| 2-arg fetch handler style is a runtime-only check (no build-time lint) | build | Vite/rolldown build-time check on the resolved fetch export (`length===2` without the style marker) → actionable error. | ⬜ (CF-6b) |
| Cron expressions unvalidated (`cf.scheduled.trigger('typo')` passes) | schema/test | `.refine()` a 5-field cron regex in the schema + validate in `scheduled.ts`. | ⬜ (CF-6b) |
| Remote secret management is local-only (intentional) but unsignaled at deploy | cli/docs | Post-deploy hint pointing to `wrangler secret put`/dashboard; link from `secrets --help`. | ⬜ (CF-6b) |

How covered (CF-6a):
- **Gradual / percentage deployments** — `devflare deploy --prod --percentage <n>` performs a Cloudflare *gradual deployment* faithfully on Wrangler's version-based model: Devflare runs `wrangler versions upload` (uploads the new code as an **inactive** version — no traffic shift; `wrangler deploy` has no percentage flag and would go straight to 100%), resolves the new version id (structured output, then the existing version/deployment fallbacks), then runs `wrangler versions deploy <new-version-id>@<n> --name <worker> [--message …] --yes` to route **n%** of production traffic to it (`--yes` accepts the non-interactive defaults for CI). The traffic split uses Wrangler's positional `<version-id>@<percentage>` shorthand (verified against the installed `wrangler@4.85.0` `versions deploy` command: *"Shorthand notation to deploy Worker Version(s) [<version-id>@<percentage>..]"* + the `--yes`/`--message`/`--name` flags). `--version <current-version-id>` keeps the remaining `100−n%` on a specific live version (`<old>@<rest>`); otherwise only the new version is named and Wrangler distributes the rest. **Covered:** initiating a rollout at a chosen percentage in one command (incl. a fully-specified two-version split) + a `--dry-run` description. **Needs raw wrangler:** *advancing* an existing rollout (10% → 50% → 100%) without re-uploading is a pure `wrangler versions deploy <id>@<pct>` and is documented as such (re-running `devflare deploy --percentage` uploads a fresh version each time). The pure arg/percentage logic lives in `src/cli/gradual-deploy.ts` (`parseDeployPercentage`, `buildVersionSpecs`, `buildGradualDeployInvocation`); the two-step orchestration is wired in `src/cli/commands/deploy.ts`. `--percentage` is production-only (rejected with `--preview`).
- **`devflare tail`** — `src/cli/commands/tail.ts` (registered in `src/cli/index.ts` + `COMMANDS`) streams live logs from a **deployed** Worker via Cloudflare's Workers Trace (tail) API: it authenticates with the existing token resolution (`getApiToken`, i.e. `devflare login` / `CLOUDFLARE_API_TOKEN`), resolves the worker name (arg → `--worker` → config `name`) and account (`--account` → config `accountId` → resolved default), `POST`s `…/workers/scripts/{script}/tails` to mint a short-lived WebSocket endpoint, connects with the `trace-v1` sub-protocol + `Authorization: Bearer` header (via the existing `ws` dependency), and prints each trace event (timestamp, trigger, outcome, logs, exceptions) in `--format pretty` (default) or `--format json`. On Ctrl-C / stream end it `DELETE`s the tail session and closes the socket. This is **inherently remote** (an operate-deployed-Worker command, stated in `--help`); the offline tail-*handler* test path remains `cf.tail.trigger()`. Auth-missing / worker-not-found / account-unresolved surface clear errors (no swallowing).

## Batch CF-7 — boundaries + documentation

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| DO **WebSocket Hibernation** (`acceptWebSocket`/`getWebSockets`/`serializeAttachment`) not in DO context/bridge | local-dev/test/docs | Extend the DO event context + bridge relay to carry the hibernation surface, or document precisely that hibernation needs direct state access outside the bridge. | ⬜ |
| `unsafe` bindings/metadata/capnp are passthrough-only, undocumented | docs | A matrix section (like the Python Workers one) stating unsafe is passthrough-only, no local wiring. | ⬜ |
| Legacy `wasm_modules`/`text_blobs`/`data_blobs` superseded by `rules`, undocumented for porters | docs | A short note that these are passthrough-reachable and `rules` is the modern path. | ⬜ |
| Email Routing **rules** are a dashboard service (not wrangler) — set expectations | docs | A note that `send_email` + the email handler are full; inbound routing rules live in the CF dashboard. | ⬜ |

## Batch CF-8 — re-investigate

After CF-1..7 ship, re-run the grounded gap analysis. Append any newly-surfaced
gaps as a new batch and repeat until the analysis returns zero real gaps. Each
loop is recorded below.

### Re-investigation log
- (pending first pass)

---

⛔ **Inherent boundaries — confirmed correctly signaled (NOT gaps; do not fake):**
Workers AI inference · Vectorize indexing/ranking · AI Gateway · Cloudflare
Builds (CI/CD) · Hyperdrive raw `connect()` · hosted Images API · dispatch-namespace
dynamic dispatch · pipelines ingestion · in-worker Secrets Store CRUD · mTLS
handshake/validation · Email Routing inbound *rules* · DO WebSocket `onError`
detail · Logpush job provisioning. devflare throws clear documented errors or
matrix-flags these `remote-boundary` rather than returning fake data.
