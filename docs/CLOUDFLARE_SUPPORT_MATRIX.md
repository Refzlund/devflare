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
on Cloudflare's GPUs, Vectorize indexes live in Cloudflare's vector store, AI
Gateway routing and logs are account resources, and Cloudflare Builds is CI/CD
orchestration rather than a Worker runtime binding. There is no code Devflare
could run on your machine that would reproduce them, so those bindings are
remote-only by nature.

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
  Gateway, Vectorize, and Cloudflare Builds are true no-local-fixture boundaries.
  Media Transformations, mTLS Certificates, Artifacts, and AI Search are
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
| Durable Objects | `durableObjects` | ✅ Full | Miniflare runs DO classes locally; string or `{ className, scriptName }`. | Provisioned via migrations, not a create API. |
| Service bindings | `services` | ✅ Full | Worker-to-worker RPC; `{ service, environment?, entrypoint? }`. | No — the target Worker is deployed separately. |

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
| Browser Rendering | `browser` | Browser Run is locally simulatable through Cloudflare/Wrangler's browser local dev. | Live view, human-in-the-loop, recordings, and external CDP remain hosted features that need remote tests. | No — exactly one browser binding allowed per Worker (a Wrangler limit). |

### Remote-only — no local simulation (🌐)

| Feature | Config key | Reason | Auto-provisions on deploy? |
| --- | --- | --- | --- |
| Workers AI | `ai` | Inference has no local simulation in Cloudflare local development. Use remote mode or inject a custom fake. | Not a provisioned resource (model inference). |
| AI Gateway | reached via the `ai` binding (no own key) | Gateway routing and logs are Cloudflare account resources reached through the Workers AI binding. Remote-mode helpers only. | Not a provisioned resource. |
| Vectorize | `vectorize` | Cloudflare lists Vectorize with no local simulation. Use remote mode for real indexes or inject a fake. | **Resolve-only.** Devflare can only auto-provision *preview-scoped* indexes by cloning a base index; for normal deploys, create the index first. A missing index errors. |
| Cloudflare Builds | not a binding (CI/CD service) | Git-connected Workers / Builds are CI/CD orchestration, not a Worker runtime binding. Run Devflare in your own CI. | Not a runtime binding. |

### Modeled but offline-classification undocumented

`analyticsEngine` (`{ dataset }`) and `sendEmail` (Email Routing send binding)
are modeled in the config schema but have **no entry** in Devflare's internal
offline support matrix. They fall through to the default classification: treated
as a remote Cloudflare boundary until Devflare documents a local simulator or
fixture. Neither auto-provisions on deploy.

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

## Cross-reference: two "remote-only" classifications

The key nuance for reading this page: `media`, `mtls_certificates`, `artifacts`,
and `ai_search` are remote-only for **running their integration tests**, but they
are **not** remote-only as bindings — they have local fixtures/mocks for
app-level (call-shape and routing) tests. Only Workers AI, AI Gateway, Vectorize,
and Cloudflare Builds are true no-local-fixture boundaries.

| Service | In the test-execution gate? | Binding offline tier |
| --- | --- | --- |
| Workers AI | Yes | Remote boundary |
| AI Search | Yes | Has an in-memory mock (app-level testable) |
| AI Gateway | Yes | Remote boundary |
| Media Transformations | Yes | Low-fidelity local mock |
| mTLS Certificates | Yes | Fixture-backed |
| Artifacts | Yes | Fixture-backed |
| Cloudflare Builds | Yes | Remote boundary |
| Vectorize | Yes | Remote boundary |
| Browser Rendering | No | Local mock, with hosted-feature gaps |
| Hyperdrive | No | Local, with the `connect()` gap |
