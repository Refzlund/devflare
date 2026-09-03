# Cloudflare Support Matrix

This page is the single reference for **which Cloudflare bindings and platform
features Devflare models**, how far each one runs **locally** (without touching
Cloudflare), the **precise reason** for any limitation, and whether Devflare
**auto-provisions** the underlying resource when you deploy.

Support symbols used throughout:

| Symbol | Meaning |
| --- | --- |
| ✅ | **Full local** — runs locally through Miniflare and/or a deterministic in-process mock; no Cloudflare account required to develop or test the binding's behavior. |
| 🟡 | **Partial** — most of the call shape works locally, but a specific part needs real Cloudflare (or a real driver/engine). The exact gap is named in each row. |
| 🌐 | **Remote-only** — no local simulation exists. You must run against real Cloudflare (`devflare remote enable` / `DEVFLARE_REMOTE=1`) or inject your own fake for pure tests. |

## Why some features are remote-only

A 🌐 or 🟡 mark is almost always an **inherent Cloudflare platform boundary**,
not a missing Devflare feature.

Cloudflare's local development runtime (`workerd` via Miniflare) faithfully
emulates the storage and edge primitives — KV, D1, R2, Queues, Durable Objects,
service bindings — so Devflare can run those entirely offline. But some products
are **hosted services with no local implementation**: Workers AI inference runs
on Cloudflare's GPUs, AI Gateway routing and logs are account resources, and
Cloudflare Builds is CI/CD orchestration rather than a Worker runtime binding.
There is no code Devflare could run on your machine that would reproduce them, so
those bindings are remote-only by nature. (Vectorize is a partial case: vector
storage and cosine-similarity query are deterministically mockable offline via
`createMockVectorize`, while Cloudflare's hosted indexing, ANN ranking, and scale
stay remote.)

A second category is **partial**: the binding's call shape is local-testable, but
one capability is genuinely hosted. Hyperdrive exposes connection fields locally
yet the raw `cloudflare:sockets` `connect()` is only materialized inside the
runtime; Images can transform and inspect locally but its hosted image-storage
API lives on Cloudflare; Media Transformations runs through local wiring but real
codec fidelity is remote. In each case Devflare gives you the most faithful local
path it can and tells you exactly where the boundary is — rather than silently
returning fake data that would pass tests and then break in production.

Because of this, Devflare keeps **two distinct lists** and this page is careful
not to conflate them:

- **Test-execution gate** — a small set of services whose *integration tests* are
  skipped unless you opt into remote mode: Workers AI, AI Search, AI Gateway,
  Media Transformations, mTLS Certificates, Artifacts, Cloudflare Builds, and
  Vectorize.
- **Binding offline tier** — the *per-binding* boundary. Only Workers AI, AI
  Gateway, and Cloudflare Builds are true no-local-fixture boundaries.
  Media Transformations, mTLS Certificates, Artifacts, AI Search, and Vectorize are
  remote-only for *running their integration tests* but still have local
  fixtures/mocks you can use for app-level (call-shape and routing) tests.

See the [cross-reference table](#cross-reference-two-remote-only-classifications)
at the end for the exact split.

## Baseline bindings (full local, Miniflare-emulated)

These are the core storage and wiring primitives. Miniflare runs them locally
with high fidelity, so they are not even listed in Devflare's internal support
matrix — they are the offline baseline.

| Binding | Config key | Local support | Notes | Auto-provisions on deploy? |
| --- | --- | --- | --- | --- |
| KV | `kv` | ✅ Full | Miniflare-emulated namespace. | **Yes** — created if missing; name→id resolved. |
| D1 | `d1` | ✅ Full | Miniflare-emulated SQLite database. | **Yes** — created if missing. |
| R2 | `r2` | ✅ Full | Miniflare-emulated bucket. | **Yes** — created if missing. |
| Queues | `queues` | ✅ Full | Producers + consumers via Miniflare. | **Yes** — created if missing (collects producer, consumer, and dead-letter-queue names). |
| Durable Objects | `durableObjects` | ✅ Full | Miniflare runs DO classes locally; string or `{ className, scriptName, environment? }`. A cross-worker binding (`scriptName` set) may also carry `environment` — the deploy-only service-environment of the target script (compiled to `durable_objects.bindings[].environment`, no local-dev effect). | Provisioned via migrations, not a create API. |
| Service bindings | `services` | ✅ Full | Worker-to-worker RPC; `{ service, environment?, entrypoint?, props? }`. `environment` is an ergonomic input that is folded into the emitted service **name** (`<service>-<environment>`) — wrangler addresses an environment by name and rejects a separate `environment` field. | No — the target Worker is deployed separately. |

**Queue producer/consumer options.** Queue **producers** support
`deliveryDelay` (→ `delivery_delay`), which is wired **locally** into Miniflare's
`QueueProducerOptions.deliveryDelay` so delayed delivery is exercised in dev/test.
Queue **consumers** support `visibilityTimeoutMs` (→ `visibility_timeout_ms`),
which is **deploy-only** — Miniflare exposes no local consumer-visibility option,
so the field is compiled for deploy but has no local effect. One caveat for the
**cross-process bridge** (`devflare/test` across processes / SvelteKit
`platform.env`): that path registers queue producers by queue name without
per-producer `deliveryDelay`, so delivery-delay fidelity applies to `devflare dev`
and the in-process test context; the field is always compiled for deploy.

**Service binding `props`.** A service binding may carry a `props` object (→ the
Wrangler `props` field) that the target Worker reads via `ctx.props`. This is
wired **locally** into Miniflare's `serviceBindings`, so cross-service `props`
delivery is testable in dev/test.

**Bridge response-size limit (cross-process access only).** When a Durable
Object or service binding is reached *through the bridge* — i.e. from
`devflare/test` or SvelteKit `platform.env` running in a separate process, not
from inside the Worker — the proxied `fetch()` response body is delivered inline
over the bridge WebSocket and is capped at **512 KB** (workerd's ~1 MB
per-message limit minus base64/framing overhead). A larger response throws a
clear error rather than being silently truncated. Large R2 objects are exempt —
they use a dedicated HTTP transfer side-channel. DO WebSocket relaying
(`stub.connect()`) is unaffected. Inside the Worker (the normal runtime path)
there is no such cap.

### Durable Object WebSocket Hibernation

The DO **WebSocket Hibernation** API works locally. Because Miniflare runs your
DO classes in real `workerd`, the hibernation surface on `DurableObjectState` is
present and functional inside a Devflare-managed DO:

- `state.acceptWebSocket(ws, tags?)`, `state.getWebSockets(tag?)`,
  `state.getTags(ws)`, and `state.setWebSocketAutoResponse(...)` /
  `getWebSocketAutoResponse()`, plus the per-socket
  `ws.serializeAttachment(...)` / `ws.deserializeAttachment()`, all run locally.
- The hibernation **handlers** — `webSocketMessage`, `webSocketClose`, and
  `webSocketError` — are relayed by Devflare's DO wrapper under the normal event
  context, exactly like `fetch`/`alarm`, so they fire locally.

Worked example: `cases/case18` ships a `ChatRoom` DO that uses `acceptWebSocket`
+ `serializeAttachment` + `getWebSockets` + `webSocketMessage`/`webSocketClose`,
and its bridge integration test (`tests/integration/bridge/case18-do.test.ts`)
drives that DO — including the hibernation-backed `getWebSockets()` count —
through the cross-process bridge.

One nuance for the **cross-process bridge** only: when you open a WebSocket to a
DO *from another process* (e.g. `stub.connect()` from `devflare/test`), the
socket is a live relay across the bridge for the lifetime of the connection. The
DO's own hibernation state (accepted sockets, attachments, auto-response) lives
in the real local Miniflare runtime and behaves normally — the relay only
carries frames. Inside the Worker (the normal runtime path) there is nothing
special to account for.

## Edge and product bindings

Columns: the binding, its config key in `defineConfig`, the local support level,
the precise reason for any boundary, and whether deploy auto-provisions the
resource.

### Full local (✅)

| Binding | Config key | Reason it works locally | Auto-provisions on deploy? |
| --- | --- | --- | --- |
| Rate Limits | `rateLimits` | Miniflare and the test layer can simulate fixed-window RateLimit bindings locally (`createMockRateLimit` / `createOfflineEnv`). | No — `namespace_id` is account-scoped and user-supplied. |
| Version Metadata | `versionMetadata` | Version metadata can be made deterministic in tests without Cloudflare state (`createMockVersionMetadata`). | No. |
| Secrets Store | `secretsStore` | The binding shape is local-testable with local secret-store values or fixed fixtures. | No — the store is account-level and created out of band. |
| Workflows (binding) | `workflows` | Workflow binding calls run through Miniflare or a deterministic local Workflow mock. | Not a create-on-deploy resource. |
| Pipelines | `pipelines` | Pipeline sends are recorded locally; Cloudflare owns production batching and sinks (`createMockPipeline`, record-only). | No. |

**Secrets Store caveat:** a `get()` for a name with no local value throws
*"Offline Secrets Store binding has no value. Pass `fixtures.secretsStore.<name>`
or use the local secrets command."* Provide the value via a fixture or your local
secrets store.

### Partial — works locally except for one named gap (🟡)

| Binding | Config key | Works locally | The gap (needs Cloudflare / a real driver) | Auto-provisions on deploy? |
| --- | --- | --- | --- | --- |
| Hyperdrive | `hyperdrive` | Connection fields (`connectionString`, or `host`/`port`/`user`/`password`/`database`) are populated; usable with a Node DB driver or a Miniflare-backed test. | The raw `cloudflare:sockets` `connect()` is **not** implemented in the local shim and throws — Miniflare establishes real Hyperdrive sockets only inside a `createTestContext()` run. | **No** — resolve-only. Cloudflare exposes no create-from-name API, so create the Hyperdrive config first or set an explicit id; a missing config errors. |
| Worker Loaders | `workerLoaders` | The `fetch` entrypoint runs the loaded Worker in a per-Worker Miniflare instance, optionally with explicit Worker stubs. | `getDurableObjectClass()` throws — it returns an opaque facet-spawning reference that `workerd` only exposes inside the runtime. Use `createTestContext()` or `createMockWorkerLoader({ stub })`. A non-JavaScript main module also throws. | Not a create-on-deploy resource. |
| Images | `images` | `info()` returns a deterministic 1×1 PNG stub; `input().transform().output()` returns passthrough bytes — a low-fidelity deterministic pure mock. | The hosted storage API (`hosted.image()` / `.upload()` / `.list()`) throws *"local Images hosted API is not implemented"*. Real transform fidelity is remote. | No — one Images binding per Worker maximum. |
| Media Transformations | `media` | Runs through Miniflare wiring locally; a deterministic pure mock supports app-level chain tests (`input().transform().output()` returns the same bytes, default `video/mp4`). | Codec and output fidelity is remote (the mock is passthrough). **Test execution is remote-only gated.** | No — one Media binding per Worker maximum. |
| mTLS Certificates | `mtlsCertificates` | Fetcher call paths are testable locally; pass `fixtures.mtlsCertificates` handlers. | Real certificate presentation is Cloudflare/Wrangler remote behavior. **Test execution is remote-only gated.** | No — the cert is uploaded out of band; the id is a UUID. |
| Dispatch Namespaces (Workers for Platforms) | `dispatchNamespaces` | Tenant dispatch can be backed by explicit test fetchers; pass `fixtures.dispatchNamespaces` workers for deterministic tenant routing. | Namespace uploads and lifecycle are Cloudflare-managed. | No — the namespace is platform-managed. |
| Artifacts | `artifacts` | Repo metadata and token flows can be modeled in memory (`createMockArtifacts`). | The Git protocol and namespace access are Cloudflare-managed remotes. **Test execution is remote-only gated.** | No. |
| AI Search (instance) | `aiSearch` | Application flows can use deterministic in-memory instances and namespaces (`createMockAISearchInstance`). | Indexing, ranking, and crawling are hosted Cloudflare behavior. **Test execution is remote-only gated.** | No. |
| AI Search (namespace) | `aiSearchNamespaces` | Namespace management can be backed by an explicit in-memory instance registry (`fixtures.aiSearchNamespaces`). | Same hosted indexing/ranking boundary as the instance. | No. |
| Vectorize | `vectorize` | `createMockVectorize()` (and `createMockEnv({ vectorize })` / `createOfflineEnv()`) is a deterministic in-memory index — `insert`/`upsert`/`delete`/`getByIds` plus a real cosine-ranked `query()` honoring `topK`, `returnValues`, `returnMetadata`, `namespace`, and metadata `filter`. | Cloudflare's hosted indexing, ANN ranking, and scale are remote; the mock models storage + cosine math, not production relevance. **Test execution is remote-only gated** (`shouldSkip.vectorize`). | **Resolve-only.** Devflare can only auto-provision *preview-scoped* indexes by cloning a base index; for normal deploys, create the index first. A missing index errors. |
| Browser Rendering | `browser` | Browser Run is locally simulatable through Cloudflare/Wrangler's browser local dev. | Live view, human-in-the-loop, recordings, and external CDP remain hosted features that need remote tests. | No — exactly one browser binding allowed per Worker (a Wrangler limit). |

### Remote-only — no local simulation (🌐)

| Feature | Config key | Reason | Auto-provisions on deploy? |
| --- | --- | --- | --- |
| Workers AI | `ai` | Inference has no local simulation in Cloudflare local development. Use remote mode or inject a custom fake. | Not a provisioned resource (model inference). |
| AI Gateway | reached via the `ai` binding (no own key) | Gateway routing and logs are Cloudflare account resources reached through the Workers AI binding. Remote-mode helpers only. | Not a provisioned resource. |
| Cloudflare Builds | not a binding (CI/CD service) | Git-connected Workers / Builds are CI/CD orchestration, not a Worker runtime binding. Run Devflare in your own CI. | Not a runtime binding. |

### Analytics Engine and Send Email

`analyticsEngine` (`{ dataset }`) and `sendEmail` (Email Routing send binding)
are modeled in the config schema and compiled for deploy
(`analytics_engine_datasets` / `send_email`). Neither auto-provisions on deploy.
They have no entry in Devflare's internal *offline-fixture* support matrix, but
their local situations differ and neither is an inherent remote boundary:

- **Send Email** — wired into the dev/test Miniflare worker config (the compiled
  `send_email` list is passed to Miniflare's per-worker `email` option), so the
  binding shape runs locally. It is also a **pure-offline** binding: `createOfflineEnv()`
  / `createMockEnv({ sendEmail })` auto-wire a deterministic `createMockSendEmail()`
  that records every dispatched message into `.sentEmails` while enforcing the
  configured sender/destination allow-lists (so `env.MY_EMAIL.send(...)` is
  assertable without Miniflare); `describeOfflineSupport('sendEmail')` reports
  `offline-native`. The **inbound** email handler is also fully wired
  and locally testable via `cf.email.trigger()`. Note the boundary: Email Routing
  **rules** — which addresses on your domain route inbound mail to the Worker —
  are a Cloudflare **dashboard** service, not a Wrangler config field, so they
  are not expressed in `defineConfig`. Devflare covers both the outbound
  `send_email` binding and the inbound email handler; the routing-rule
  provisioning itself stays in the dashboard. A `remote?` flag on the `sendEmail`
  binding is **accepted and emitted into the Wrangler config for deploy**, but it
  is a **deploy-time directive only**: Miniflare's local `send_email` has no
  `remote` field (only an internal remote-proxy connection string, exactly like
  mTLS), so the flag is **stripped locally** and does not change local behavior.
  Do not rely on local remote `send_email` behavior.
- **Analytics Engine** — **not** an inherent remote-only boundary, and now
  **wired into the dev/test Miniflare config as a write-only no-op stub**.
  Devflare compiles `analytics_engine_datasets` for deploy and also passes
  `analyticsEngineDatasets` to the local Miniflare worker. Miniflare 4 ships a
  **native Analytics Engine plugin that is a write-shape-only no-op**
  (`writeDataPoint()` records nothing), so the local path validates the call
  shape and no longer crashes (`env.<DATASET>.writeDataPoint()` is bound in
  dev), but it does not persist or query data points. For `writeDataPoint()`
  argument assertions, use **`createMockAnalyticsEngine()`** (or
  `createMockEnv({ analyticsEngine })` / `createOfflineEnv()`) — a write-only
  recording stub that captures every data point into `.writtenDataPoints` so you
  can assert exactly what the worker emitted. It records writes and (honestly)
  offers no query, because Analytics Engine has no in-worker read API.
  Production ingestion and querying remain hosted.

## Platform config (not bindings): deploy-only vs locally wired

Some top-level config keys are not Cloudflare *bindings* but still have a local
support story worth stating exactly. The compiler emits each into the Wrangler
config for deploy; what differs is whether it is also wired into the dev/test
Miniflare worker. Deploy-only rows are real Cloudflare config that simply has no
local-runtime analogue (account/region/edge-routing metadata).

| Config key | Compiled for deploy | Wired into local dev/test Miniflare? | Notes |
| --- | --- | --- | --- |
| Static Assets | `assets` | **No** — deploy-only locally | The `assets` config compiles into the Wrangler config (directory/binding/routing) for deploy, but it is **not** wired into the dev Miniflare worker — there is no Miniflare `assets` plugin wiring and no local `ASSETS` fetcher. Static assets are not served by the local dev runtime; serve them through your own dev tooling (e.g. Vite) until local asset serving is wired. |
| Tail consumers | `tailConsumers` → `tail_consumers` | **Yes** (when the consumer Worker is present locally) | The `tailConsumers` config compiles to `tail_consumers` for deploy **and** is now passed to Miniflare's per-worker `tails` (an array of consumer service names). A tail consumer references **another** Worker by service name, so local cross-Worker tail-consumer *delivery* works **when that consumer Worker is also run in the same local Miniflare instance**; when it is absent the designator resolves to nothing and the local runtime degrades cleanly (no crash). This is distinct from `files.tail` — the tail *handler* surface on the Worker itself **is** fully wired and locally testable regardless (see `cf.tail.trigger()`); this change adds the cross-Worker *delivery* path where the consumer Worker is available locally. |
| Cron triggers | `triggers.crons` | **Yes** (handler invocation) | `triggers.crons` is passed to Miniflare's per-worker `triggers` in dev, and the scheduled handler can be invoked locally through the test layer (`cf.scheduled.trigger(cron?)` / the `scheduled()` helper). Devflare does not run the cron *schedule* on a wall clock locally — you invoke `scheduled()` explicitly — so cron-driven code is locally testable while real timed delivery remains a Cloudflare behavior. |
| Durable Object alarms | `durableObjects` (`@durableObject({ alarms: true })`) | **Yes** (handler invocation) | A DO's `alarm()` handler is locally testable via `cf.alarm.trigger(instance, { state?, env? })`, which fires the handler under a `durable-object-alarm` event context exactly as the runtime DO wrapper does and returns `{ success, error? }`. As with cron, Devflare does not run the alarm *clock* locally — you invoke `cf.alarm.trigger()` explicitly; real timed alarm delivery remains a Cloudflare behavior. |
| Streaming tail consumers | `streamingTailConsumers` → `streaming_tail_consumers` | **Yes** (when the consumer Worker is present locally) | Like `tailConsumers` but **service-only**: wrangler's `StreamingTailConsumer` accepts only `service` (no `environment`), so the object form is `{ service }` and `environment` is rejected at config-parse time to stay deploy-valid. Compiles to `streaming_tail_consumers` for deploy **and** is passed to Miniflare's per-worker `streamingTails`. Cross-Worker streaming-tail delivery works **when the consumer Worker is also run in the same local Miniflare instance**; when it is absent the designator resolves to nothing and the local runtime degrades cleanly (no crash). |
| Compliance region | `complianceRegion` → `compliance_region` | **No** — deploy-only | `complianceRegion` (`'public'` \| `'fedramp_high'`) compiles into the Wrangler config for deploy. It is account/region metadata with no local Miniflare effect, so it is not wired into the dev/test runtime. |
| `workers.dev` toggle | `workersDev` → `workers_dev` | **No** — deploy-only | `workersDev` compiles to `workers_dev` for deploy (still defaults to `true`; previously hardcoded `true`, now a toggle). It controls the `*.workers.dev` route on Cloudflare's edge and has no local Miniflare effect. |
| Custom-domain route flags | route `enabled` / `previews_enabled` | **No** — deploy-only | `enabled` and `previews_enabled` are valid **only on a custom-domain route** (`custom_domain: true`) — wrangler's `zone_id`/`zone_name` route shapes reject them, so Devflare rejects them at config-parse time on non-custom-domain routes and emits them only for custom-domain routes. They govern Cloudflare's routing/preview behavior and have no local Miniflare effect. |
| Observability | `observability` | **No** — deploy-only | `observability` (`enabled` / `head_sampling_rate` plus nested `logs` and `traces`) compiles into the Wrangler config for deploy. It configures Cloudflare's Workers Logs/Traces ingestion and sampling — a hosted edge feature with no local Miniflare analogue. |
| Smart Placement | `placement` | **No** — deploy-only | `placement` (`mode: 'off' \| 'smart'`, optional `hint`) compiles for deploy. Smart Placement is a Cloudflare edge-scheduling decision with no local-runtime effect. |
| Resource limits | `limits` | **No** — deploy-only | `limits` (`cpu_ms`) compiles for deploy. The CPU-time limit is enforced by Cloudflare's runtime, not the local Miniflare worker. |

## Dev server (`server`) and local-runtime options

These knobs shape the **local** dev/test runtime rather than the deployed Worker.

- **`server` options** — beyond `host`/`port`, the `server` config also accepts
  `https`, `httpsKeyPath`, `httpsCertPath`, `inspectorPort`, `inspectorHost`,
  `upstream`, `liveReload`, `cf`, `verbose`, `logRequests`, and `publicUrl`, all
  threaded into Miniflare's `CoreSharedOptions`. This enables local **HTTPS** dev
  (with your own key/cert), a custom **inspector port/host** for the
  DevTools/debugger, a custom **upstream** host, Miniflare's in-browser
  **live-reload** script (`liveReload: true`, complementing Devflare's own source
  watcher), a dev-time **`request.cf` override** (`cf: false` to omit it, a JSON
  file path, or an object injecting colo/country/TLS/bot-management metadata),
  runtime-log controls (`verbose`, `logRequests`), and a **public-URL** the local
  runtime advertises for itself (`publicUrl`, for when dev sits behind a reverse
  proxy/tunnel/custom domain — served on Miniflare's `/core/public-url` loopback).
  They have no deploy effect — they configure the local runtime only. (Devflare's
  own internal Miniflare knobs — log level via the CLI `--verbose`/`--debug`,
  persist roots, telemetry, unsafe/dev-registry options — are managed by Devflare
  and intentionally not surfaced as `server` config.)
- **Cache API (`caches` global)** — works **locally by default** through
  Miniflare (no binding to declare; `caches.default` and `caches.open(...)` are
  available in dev/test). Cache contents now **persist across dev-server
  restarts** when you set `cachePersist`, alongside the sibling
  `kvPersist`/`r2Persist`/`d1Persist`/`durableObjectsPersist` options.
- **`outboundService`** — a **dev/test-only** option (not a Wrangler config
  field) that routes a Worker's outbound `fetch()` to a named service, so you can
  exercise cross-service calls locally. It has no deploy analogue.

## Containers (offline-first)

Container tests are skipped unless `DEVFLARE_CONTAINER_TESTS=1` (or `true`/`yes`),
because they launch local Docker or Podman containers. They also require a
reachable engine (`docker info`, then `podman info`).

The container workflow is **offline-first**: `start()` defaults to
`offline: true`, so a remote image that is not present locally throws — *"Container
image is not present locally. Devflare container tests are offline-first;
pull/build the image ahead of time or pass `offline: false`."* Local Dockerfile
builds pass an offline pull argument so the build never reaches out for the base
image unexpectedly.

In the support matrix, containers are classified ✅ full local: Devflare can
launch local Docker/Podman containers in explicit tests when an engine and cached
images are available.

## How deploy auto-provisioning works

When you deploy, Devflare materializes the resources your bindings reference. The
behavior differs by resource:

- **Created if missing** (a usable create API exists): KV namespaces, D1
  databases, R2 buckets, and Queues (producers, consumers, and dead-letter
  queues). Devflare creates any that do not already exist and resolves names to
  ids.
- **Resolve-only, never created** (no create-from-name API): Hyperdrive and
  Vectorize. If the named resource is missing, the deploy errors with a precise
  message telling you to create it first (or, for Vectorize, that only
  preview-scoped indexes can be cloned from a base index).
- **Everything else** (rate limits, version metadata, secrets store, worker
  loaders, workflows, pipelines, images, media, mTLS, dispatch namespaces,
  artifacts, browser, AI, analytics engine, send-email) is **not** auto-provisioned
  — deploy only ever touches kv/d1/r2/queues/hyperdrive/vectorize.

Three safety properties hold during provisioning:

1. **Resolve-only first.** Hyperdrive and Vectorize are resolved before any
   side-effecting create call, so a "create it yourself first" failure happens
   before any KV/D1/R2/Queue is created — no orphans from a half-finished run.
2. **No auto-delete.** Created resources are never deleted on a later failure;
   the error is decorated with the exact list of what was created so you can clean
   up manually.
3. **Describe-only dry run.** In dry-run mode the create APIs return
   `<would-create:NAME>` placeholders, while existing-resource resolution still
   runs for real.

## Running a Python Worker

Devflare's module-rule schema intentionally models only the stable JavaScript and
asset rule types (`ESModule`, `CommonJS`, `CompiledWasm`, `Text`, `Data`). The
Python-specific rule type Wrangler exposes while Python Workers are in beta is
deliberately **not** modeled — Devflare keeps it behind the `wrangler.passthrough`
escape hatch until the local Python Worker toolchain has a stable Devflare
integration point.

`wrangler.passthrough` is an unvalidated record that the compiler merges over the
generated Wrangler config as the **last** step, so its keys win over anything
Devflare emitted. That makes it the right place to inject the Python `main`,
`rules`, and any flags Devflare does not model.

### Recipe

```ts
// devflare.config.ts
import { defineConfig } from 'devflare'

export default defineConfig({
  name: 'my-python-worker',
  compatibilityDate: '2024-01-01',

  // Python Workers require the python_workers compatibility flag. This is a
  // native field — the compiler emits compatibility_flags from it.
  compatibilityFlags: ['python_workers'],

  wrangler: {
    passthrough: {
      // Point the entry at the Python module. (You could instead set
      // files.fetch, but routing the Python entry through passthrough keeps it
      // decoupled from Devflare's JS-oriented files.fetch typing.)
      main: 'src/entry.py',

      // Inject the Python module rule that the module-rule schema intentionally
      // does not model. passthrough is raw, so the Python rule type is allowed.
      rules: [
        { type: '<python-module-rule-type>', globs: ['**/*.py'], fallthrough: true }
      ]
    }
  }
})
```

Steps:

1. Write the Python Worker (`src/entry.py`) exporting a handler per Cloudflare's
   Python Workers contract.
2. Add `compatibilityFlags: ['python_workers']` (native — the compiler emits
   `compatibility_flags`). Equivalently you can place `compatibility_flags` inside
   `passthrough`.
3. Set `main: 'src/entry.py'` in `wrangler.passthrough` (or use `files.fetch`).
4. Put the Python module `rules` array inside `wrangler.passthrough`. This is the
   load-bearing step: the module-rule schema rejects the Python rule type, but
   `passthrough` accepts any record.
5. Devflare compiles a Wrangler config where the passthrough keys are merged last
   and win; `devflare dev` / `devflare deploy` then hand it to Wrangler, which
   runs its Python (Pyodide) toolchain.

### Caveats

- **Unvalidated path.** `passthrough` bypasses all of Devflare's schema
  validation, so a typo in a key passes straight through to Wrangler with no
  error from Devflare.
- **No Python-aware local dev.** Devflare has no Python integration — local
  execution fidelity is entirely Wrangler/`workerd`'s Pyodide, not Devflare's
  Miniflare wiring.
- **Bindings still work, but type generation is JS/TS-oriented.** Your bindings
  compile into the same Wrangler config and run, but binding *type generation* and
  the offline test helpers (`createOfflineEnv`, etc.) target JavaScript/TypeScript
  and will not generate Python types.

## Passthrough-only: `unsafe` bindings and legacy module globals

Two more Wrangler surfaces are intentionally **not** modeled in `defineConfig`
and are reachable only through the same `wrangler.passthrough` escape hatch used
for Python Workers above. Both are deploy-time passthroughs with **no local
Miniflare wiring** — Devflare merges them into the emitted Wrangler config as the
last step and Wrangler/`workerd` handle them.

### `unsafe` bindings and metadata

Wrangler's `unsafe.bindings` / `unsafe.metadata` exist for Cloudflare products
that ship before they have a stable, first-class binding type. Devflare does not
model them (the binding schema is `.strict()`, so an `unsafe` binding cannot be
declared as a normal binding), and Miniflare has no `unsafe` plugin, so there is
**no local emulation** — an `unsafe` binding will not exist on `env` during
`devflare dev` or in the offline test layer. To deploy one, put it in
`wrangler.passthrough`:

```ts
export default defineConfig({
  name: 'my-worker',
  compatibilityDate: '2024-01-01',
  wrangler: {
    passthrough: {
      unsafe: {
        bindings: [{ name: 'MY_BETA', type: 'some_beta_type' }],
        metadata: { /* arbitrary upload metadata */ }
      }
    }
  }
})
```

The generated `env` types will not include it; reference it with your own typing
and test it with a custom fake injected through `createMockEnv({ custom })`.

### Legacy `wasm_modules` / `text_blobs` / `data_blobs`

These are Wrangler's **legacy** global module bindings. The modern, first-class
path is Devflare's `rules` (the `CompiledWasm`, `Text`, and `Data` module-rule
types Devflare already models) together with normal ES-module `import`s — prefer
those. If you must use the legacy global form (for example, porting an old Worker
verbatim), it is passthrough-reachable:

```ts
wrangler: {
  passthrough: {
    wasm_modules: { MY_MODULE: 'src/lib/add.wasm' },
    text_blobs: { MY_TEXT: 'src/data/config.txt' },
    data_blobs: { MY_DATA: 'src/data/blob.bin' }
  }
}
```

As with all passthrough, there is no local Miniflare wiring or type generation
for these — they are merged into the Wrangler config for deploy only.

### Legacy `site` (Workers Sites static assets)

Wrangler's legacy **`site`** (Workers Sites) is the predecessor to the modern
**`assets`** field — prefer `assets` for static assets. Devflare does not model
`site`; if you must use it (for example, porting an old Worker verbatim), it is
passthrough-reachable for deploy with no local wiring:

```ts
wrangler: {
  passthrough: {
    site: { bucket: './public' }
  }
}
```

As with the other legacy globals, there is no local Miniflare wiring or type
generation — it is merged into the Wrangler config for deploy only.

### esbuild bundling flags (`minify` / `define` / `alias` / `jsx_factory` / …)

Wrangler's esbuild bundling-step flags — `minify`, `define`, `alias`,
`no_bundle`, `keep_names`, `jsx_factory`, `jsx_fragment`, and any others Wrangler
adds — are **not** modeled in `defineConfig`: they govern Wrangler's own bundler,
which sits outside Devflare's schema. Devflare's native bundling control is
`config.rolldown`. If you need a Wrangler bundling flag specifically, it is
passthrough-reachable for deploy (no local effect):

```ts
wrangler: {
  passthrough: {
    jsx_factory: 'h',
    jsx_fragment: 'Fragment'
  }
}
```

## Cross-reference: two "remote-only" classifications

The key nuance for reading this page: `media`, `mtls_certificates`, `artifacts`,
`ai_search`, and `vectorize` are remote-only for **running their integration
tests**, but they are **not** remote-only as bindings — they have local
fixtures/mocks for app-level (call-shape and routing) tests. Only Workers AI, AI
Gateway, and Cloudflare Builds are true no-local-fixture boundaries.

| Service | In the test-execution gate? | Binding offline tier |
| --- | --- | --- |
| Workers AI | Yes | Remote boundary |
| AI Search | Yes | Has an in-memory mock (app-level testable) |
| AI Gateway | Yes | Remote boundary |
| Media Transformations | Yes | Low-fidelity local mock |
| mTLS Certificates | Yes | Fixture-backed |
| Artifacts | Yes | Fixture-backed |
| Cloudflare Builds | Yes | Remote boundary |
| Vectorize | Yes | Has an in-memory mock (`createMockVectorize`, app-level testable) |
| Browser Rendering | No | Local mock, with hosted-feature gaps |
| Hyperdrive | No | Local, with the `connect()` gap |
