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
| No `createMockVectorize` (aiSearch has mocks; vectors are deterministically mockable) | test | In-memory `Map<id, vector+metadata>` + cosine `query()` + insert/upsert/delete/getByIds; `vectorize?` on `OfflineBindingFixtures`; export; reclassify matrix → offline-fixture. | ⬜ |
| No `createMockAnalyticsEngine` (write-only recording stub) | test | Recording stub like `createMockQueue`; `analyticsEngine?` on `MockEnvOptions`; export; matrix entry. | ⬜ |
| No `cf.alarm.trigger()` DO-alarm test helper (alarm event modeled, trigger missing) | test | `src/test/alarm.ts` `cf.alarm.trigger(state?, env?, opts?)` mirroring `cf.scheduled`; export from `cf.ts`/`index.ts`. | ⬜ |
| `createOfflineBindings()` doesn't auto-wire KV/D1/R2/queues (mocks exist; land in `missingFixtures`) | test | Auto-create the existing mocks when the binding is in config and no fixture is given (mirror `addImagesBindings`). | ⬜ |

## Batch CF-5 — stale/inaccurate coverage corrections

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| Matrix mis-classifies **Durable Objects & Services** as `remote-boundary` (they work under `createTestContext()`) | docs/test | `SUPPORT_MATRIX` `offline-fixture` entries pointing at `createTestContext()`; fix `describeOfflineSupport()`. | ⬜ |
| **Vectorize** matrix `remote-boundary` once a mock exists | docs/test | Reclassify to `offline-fixture` after CF-4. | ⬜ |
| **Containers** notableGaps wording implies a missing binding (there is none — DO-attached `Container` is a runtime interface) | docs | Correct the wording; confirm containers config compiles. | ⬜ |

## Batch CF-6 — CLI / deploy lifecycle parity

| Gap | Dimensions | The devflare-way fix | Status |
| --- | --- | --- | --- |
| **Gradual / percentage deployments** are read-only (deploy sends only config/message/tag) | deploy | A deployment-strategy config + `--percentage` rollout compiling to the right wrangler versions-deploy call. | ⬜ |
| No `devflare tail` production log-streaming command | cli | `src/cli/commands/tail.ts` streaming via the Workers Trace API; route + `COMMANDS`. | ⬜ |
| 2-arg fetch handler style is a runtime-only check (no build-time lint) | build | Vite/rolldown build-time check on the resolved fetch export (`length===2` without the style marker) → actionable error. | ⬜ |
| Cron expressions unvalidated (`cf.scheduled.trigger('typo')` passes) | schema/test | `.refine()` a 5-field cron regex in the schema + validate in `scheduled.ts`. | ⬜ |
| Remote secret management is local-only (intentional) but unsignaled at deploy | cli/docs | Post-deploy hint pointing to `wrangler secret put`/dashboard; link from `secrets --help`. | ⬜ |

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
