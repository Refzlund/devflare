# Shared bindings in local dev — design

> **Status:** design + feasibility (no implementation shipped).
> **Verdict:** **Feasible — MODERATE.** The mechanism is proven in Miniflare and
> devflare already has 90% of the machinery. The work is orchestration, not new
> runtime plumbing.
> **Recommendation:** a **workspace coordinator** — one `devflare workspace dev`
> process that runs **one** Miniflare instance hosting the union of every app's
> workers, exposing each app on its **own** browser-reachable port via Miniflare
> `unsafeDirectSockets`. Vite apps attach as bridge clients to that one instance.

---

## 1. The problem (proven)

A monorepo runs two apps, each as its own `devflare dev` process (orchestrated by
`portless`):

- **`apps/web`** — a SvelteKit app served by **Vite**. devflare is *not* in the
  web request path; it provides Cloudflare bindings to the Vite-served SvelteKit
  via `devflare/sveltekit`'s handle + a **WS-RPC bridge** into a Miniflare
  instance.
- **`apps/api`** — a pure Cloudflare **Worker** that devflare runs *inside*
  Miniflare (routes under `/api`, a `DocRoom` Durable Object).

Both bind the **same** logical resources. Confirmed from the two configs and
devflare's generated `wrangler.jsonc`:

| Binding | Name | Local identifier | api | web |
| --- | --- | --- | --- | --- |
| D1 | `PLATFORM_DB` | `uidini-platform` (database_name; no id) | ✅ | ✅ |
| R2 | `MEDIA` | `uidini-media` (bucket_name) | ✅ | ✅ |
| DO | `DOC_ROOM` → `DocRoom` | — | ✅ | ✗ (moved to api in F-360) |

In **production** both workers bind one managed Cloudflare D1/R2, so a write by
the api is visible to the web. In **dev** they are two separate `devflare dev`
processes → two separate Miniflare instances → **two separate `workerd`
processes**, each with its own `.devflare/data` SQLite tree. A write by one is
invisible to the other.

### What was already tried (and why it failed)

Two approaches were attempted before this design (see
`ui-dreamer/specs/F-367-cross-origin-session-api/STATUS.md`):

1. **Shared persist dir / shared SQLite file** (`--persist` + a filesystem
   junction; and later the `DEVFLARE_PERSIST_DIR` override shipped in
   `next.65`). Two `workerd` processes pointed at one SQLite file:
   - Each process keeps its **own in-memory D1 snapshot** and never observes the
     other's writes (the reported `XREAD-…` failure), and
   - Under concurrent access they throw **`SQLITE_BUSY_SNAPSHOT`** — workerd's
     DO-backed D1 assumes single-process ownership and sets no `busy_timeout`.

   **This is a fundamental Miniflare limitation, not a devflare bug**
   (see §3.2). `DEVFLARE_PERSIST_DIR` co-locates the *files*; it cannot make two
   processes share *live* state.

2. **Single-Miniflare co-location** (devflare's existing `ref()`, §3.4). This
   *does* share bindings — but the co-hosted worker is reachable only as an
   in-instance **service binding**; it gets **no browser-reachable port**, which
   loses the **cross-origin** property (`ui.localhost` ↔ `api.ui.localhost`) that
   the whole feature exists to test. It was therefore rejected.

The goal: a "truer-to-prod" local env where multiple workers/apps share **live**
binding state — a write by one is immediately visible to the others — **without**
collapsing the two origins and **without** two processes fighting over one SQLite
file. This must generalize to KV, R2 and Durable Objects, not just D1.

---

## 2. TL;DR of the mechanism

- **Sharing requires one instance.** Miniflare shares D1/KV/R2/DO **live** across
  the workers *inside a single `Miniflare` instance*, keyed by binding
  **id/name**. There is **no** cross-process live sharing of storage — even
  Miniflare's own cross-process dev registry only bridges *service bindings and
  Durable Objects*, never D1/KV/R2.
- **One instance can still expose N origins.** Miniflare's per-worker
  `unsafeDirectSockets` gives each co-hosted worker its **own** `host:port`. This
  is the missing capability that makes co-location viable — it defeats the exact
  objection ("no browser-reachable port") that killed the earlier attempt.
- **devflare already co-hosts.** `buildMiniflareDevConfig` already assembles a
  *multi-worker* Miniflare per app (`workers: [gateway, mainApp, …DOs, …shims]`),
  and `ref()` already co-hosts a *referenced* app's worker with shared bindings.
  The feature composes these existing pieces across apps and adds a per-app port.

---

## 3. Confirmed Miniflare capability (with citations)

Versions in this repo: `miniflare@4.20260424.0`. Line numbers below are into
`packages/devflare/node_modules/miniflare/dist/src/index.js`.

### 3.1 One instance shares storage across its workers, keyed by id/name

When Miniflare assembles its runtime config it iterates **every worker** and asks
each plugin for that worker's *bindings*, then for the instance-level *services*,
collecting services into a **Map deduplicated by service name**:

```js
// index.js ~87543 (loop over allWorkerOpts) … ~87645
for (const service of pluginServices) {
    if (service.name !== void 0 && !services.has(service.name)) {
        services.set(service.name, service)   // first worker wins; rest reuse
    }
}
```

The service **name is derived from the binding identifier**, not the worker:

```js
// index.js 58578
function getUserBindingServiceName(scope, identifier /*, remote */) {
    return `${scope}:${identifier}`   // e.g. d1:db:uidini-platform
}
```

- **D1** (`index.js` 80832–80960): each worker's D1 binding is a *wrapped*
  binding whose inner `fetcher` points at the service
  `d1:db:<id>` (`D1_DATABASE_SERVICE_PREFIX = "d1:db"`), and there is a single
  instance-level `D1DatabaseObject` Durable Object (`uniqueKey =
  "miniflare-D1DatabaseObject"`) that owns the SQLite storage. Two workers with
  the same `<id>` ⇒ the same `d1:db:<id>` service ⇒ the **same** DO instance ⇒
  **one** SQLite database. Live-shared.
- **KV** (`KV_STORAGE_SERVICE_NAME = "kv:storage"`, keyed by namespace id).
- **R2** (`R2_BUCKET_SERVICE_PREFIX = "r2:bucket"`, keyed by bucket name).
- **Durable Objects** keyed by `uniqueKey` (`${scriptName}-${className}`),
  instance-level. `idFromName("x")` in either worker resolves to the same
  instance.

All of this happens in **one** `#assembleConfig` → **one** `workerd` process
(`index.js` 87488). So: **workers sharing a binding id, in one Miniflare instance,
share live storage.**

For ui-dreamer this is already satisfied at the *identifier* level — both apps
resolve D1 → `d1:db:uidini-platform` and R2 → `r2:bucket:uidini-media`
(devflare's `getLocalD1DatabaseIdentifier` = `databaseId ?? name`,
`packages/devflare/src/config/schema-normalization.ts:576-587`). They just aren't
in the same instance.

### 3.2 Separate instances never share storage (why the persist-dir hack fails)

Miniflare's cross-process mechanism is the **dev registry**, and it is explicitly
scoped:

```js
// index.js 77121
// Enable auto service / durable objects discovery with the dev registry
unsafeDevRegistryPath: external_exports.string().optional(),
```

The dev registry (used by `wrangler dev` for multi-process multi-worker) bridges
**service bindings and Durable Objects** across processes — it does **not** make
two processes share a D1/KV/R2 store. There is no code path in Miniflare that
live-syncs storage plugins across instances. Two instances on one persist dir each
hold their own SQLite connection/snapshot (the observed `XREAD-…` staleness) and
contend for the file (`SQLITE_BUSY_SNAPSHOT`). **Confirmed: co-hosting in one
instance is the only way.**

### 3.3 One instance, many browser-reachable ports — `unsafeDirectSockets`

Each worker may declare direct sockets, and Miniflare exposes a dedicated
`host:port` per worker/entrypoint:

```js
// index.js 77005 — per-worker CoreOption (77035: unsafeDirectSockets: […].array().optional())
var UnsafeDirectSocketSchema = external_exports.object({
    host: external_exports.ostring(),
    port: external_exports.onumber(),
    serviceName: external_exports.ostring(),
    entrypoint: external_exports.ostring(),
    proxy: external_exports.oboolean()
});

// index.js 88076
async unsafeGetDirectURL(workerName, entrypoint = "default") { … }
// → new URL(`http://${host}:${port}`) for that worker's direct socket
```

A direct socket targets a worker **directly**, bypassing the entry socket's route
table. So one Miniflare instance can serve worker A on `:8789` and worker B's
bridge on `:8788` while both share storage. **This is the capability that makes
the earlier "single-miniflare loses the port" objection obsolete.**

### 3.4 devflare already builds multi-worker configs and already co-hosts

- **Per-app multi-worker.** `buildMiniflareDevConfig`
  (`src/dev-server/miniflare-dev-config.ts:369-378`) returns
  `{ …sharedOptions, workers: [gateway, mainApp, …DOs, …binding-shims,
  …serviceBindingResolution.workers] }`. Every worker gets the **same** binding
  identifiers (`src/dev-server/miniflare-worker-config.ts:220-240`), which is
  precisely why gateway + app + DO workers already share storage *today* within
  one app.
- **The bridge is an in-Miniflare worker.** The "bridge" the web connects to is
  the **gateway worker** running inside Miniflare; its `fetch` handles the WS-RPC
  against `env` (which holds the bindings) —
  `src/dev-server/gateway-script.ts:47-113` → `handleBridgeWebSocket(request,
  env, ctx)`. The SvelteKit client dials `ws://localhost:${DEVFLARE_BRIDGE_PORT ??
  8787}` (`src/sveltekit/platform.ts:147`). **The bridge URL is already
  configurable** — point it at a shared instance and the web reads/writes that
  instance's bindings.
- **Cross-app co-hosting already exists.** `ref(() =>
  import('../other/devflare.config'))` (`src/config/ref.ts`) +
  `resolveServiceBindings` (`src/test/resolve-service-bindings.ts`) bundle a
  *referenced* app's worker and inject it into the **same** `workers[]` array,
  with the **same** binding ids
  (`buildReferencedWorkerRuntimeConfig`, `:270-277` maps identical
  `d1Databases`/`r2Buckets`/`kvNamespaces`). **Co-hosting + binding-sharing is
  therefore already implemented and battle-tested for the service/DO/test case.**

  Two reasons `ref()` alone does **not** solve this case:
  1. It bundles the referenced app's `worker.{ts,js}` **RPC surface**, *not* its
     `files.fetch` HTTP app (explicit at
     `resolve-service-bindings.ts:202-208`). The api's browser surface is
     `src/fetch.ts` + `src/routes` (`/api`), which `ref()` does not co-host.
  2. The co-hosted worker gets **no direct socket / browser port**.

The feature = generalize (1) to co-host each app's **full** dev runtime (as
`buildMiniflareDevConfig` already does per app) and add (2) a per-app direct
socket.

---

## 4. Options evaluated

The three shapes from the brief map onto two real designs; (a) and (c) are the
same mechanism (one Miniflare, many workers) with different orchestration.

### (a)/(c) — One coordinator Miniflare hosting all apps' workers ✅ recommended

One process instantiates **one** Miniflare with the **union** of every app's
workers; each app's HTTP surface is exposed on its own direct socket; Vite apps
attach as bridge clients.

- **Sharing:** automatic and live (§3.1) — same instance, same binding ids.
- **Cross-origin:** preserved via `unsafeDirectSockets` (§3.3).
- **Fit with devflare:** reuses `buildMiniflareDevConfig` per app; matches how
  `wrangler dev` handles one config with many workers.
- **Cost:** new orchestration (manifest loader, merged-config builder, direct
  sockets, spawn Vite children, run-migrations-once). Worker-name namespacing and
  a shared persist dir. No changes to the runtime, the bridge, or the consuming
  apps' bindings.

### (b) — Standalone Miniflare "storage server" both processes RPC into ❌

A separate process owns the storage; each app RPCs into it.

- **Fatal flaw for pure workers:** the api worker runs *inside* `workerd` and
  calls `env.PLATFORM_DB.prepare(...)` **natively**. You cannot transparently
  redirect a native D1 binding to another process without either (i) co-hosting
  the api worker in the storage server (→ this *is* option (a)), or (ii)
  replacing the D1 binding with a bespoke D1-over-RPC shim inside the worker —
  fragile, and it re-implements exactly what the SvelteKit bridge already does
  for the *Node* side only.
- **Only viable** if *every* member app is a Vite/Node bridge client (no pure
  workers). Not this monorepo. **Rejected** as the general design; noted as a
  narrow special case.

### Alternative — Leader/attach (keep per-app `devflare dev`)

Keep `portless` spawning `devflare dev` per app; the first to start becomes the
**leader** hosting the merged Miniflare (built from a shared manifest), later
processes **attach** (discover the leader via a lockfile/registry, skip starting
their own Miniflare, and — for Vite apps — start Vite pointed at the leader).

- **Fit with portless:** *best* — zero change to `portless.json` or per-app dev
  scripts.
- **Cost:** genuine distributed-systems complexity — leader election + races
  (two starting at once), liveness/failover (leader dies), teardown ordering, and
  the leader must know **all** apps' configs up front anyway. Given the F-367
  SQLite saga, this fragility is not worth it as the first cut.

**Chosen:** the explicit **coordinator** (a/c). Deterministic, no election races,
mirrors `wrangler dev`. Leader/attach is a possible v2 for teams that refuse to
change how dev is launched.

---

## 5. Recommended architecture

**One `devflare workspace dev` process → one Miniflare instance → union of all
apps' workers, each app on its own direct-socket port; Vite apps spawned as
children pointed at the shared instance's bridge.**

### 5.1 Topology (ui-dreamer)

```
                       ┌───────────────────────────────────────────────┐
                       │  devflare workspace dev  (one process)         │
                       │                                                │
  browser              │   ┌─────────────  ONE Miniflare  ───────────┐  │
  ui.localhost ───────────┼─▶ (Vite :5173, spawned child) ──bridge──┐ │  │
                       │   │                                        ▼ │  │
                       │   │  gateway-web  ─┐                         │  │
  browser              │   │  gateway-api ──┼─ env: PLATFORM_DB ──────┤  │
  api.ui.localhost ──direct socket :8789 ─▶ │  uidini-api worker (/api)│  │
                       │   │  do-doc_room ──┘   DocRoom DO             │  │
                       │   │                                          │  │
                       │   │   D1 d1:db:uidini-platform   ◀── ONE ─────┘  │
                       │   │   R2 r2:bucket:uidini-media   shared store   │
                       │   └──────────────────────────────────────────┘  │
                       └───────────────────────────────────────────────┘
              persist: ONE  .devflare/workspace-data   (no cross-process file contention)
```

- `gateway-web` holds the union of bindings and serves the **WS-RPC bridge +
  R2 presign** for the web on a direct socket (e.g. `:8788`). The web's Vite still
  runs on `:5173` (its own origin) and dials the bridge there.
- `gateway-api` + `uidini-api` main worker + `do-doc_room` are exposed on the
  api's direct socket (e.g. `:8789`) — `api.ui.localhost` browser traffic lands
  here.
- Both gateways' `PLATFORM_DB`/`MEDIA` resolve to `d1:db:uidini-platform` /
  `r2:bucket:uidini-media` in the **same** instance ⇒ live-shared. `portless`
  proxies `ui.localhost → 5173`, `api.ui.localhost → 8789` exactly as today, only
  now those ports are two direct sockets of one `workerd`.

### 5.2 How the merged config is built

Reuse the existing per-app assembly, then merge:

1. For each member app, run the existing pipeline (config load → route discovery →
   DO bundling → `buildMiniflareDevConfig`) to get its
   `{ sharedOptions, workers[] }`.
2. **Merge `workers[]`** into one array. **Namespace worker names** per app
   (`web/gateway`, `api/gateway`, `api/uidini-api`, `api/do-doc_room`, …) so names
   are unique; rewrite intra-app `serviceBindings`/`durableObjects.scriptName`
   references to the namespaced names.
3. **Drop `routes: ['*']`** from each co-hosted gateway (two `*` entries would
   contend for the single entry socket). Instead attach a **direct socket** to
   each app's entry/gateway worker: `unsafeDirectSockets: [{ host: '127.0.0.1',
   port: <app port> }]`.
4. **Storage services dedupe automatically** by id (§3.1) — no explicit merge
   needed; matching ids share, differing ids stay separate (correct: they're
   different resources, just like prod).
5. **One shared-options block** for the instance: one persist dir
   (`.devflare/workspace-data`), one presign secret (with a per-app presign
   *origin* injected per worker — a minor detail, §7).
6. **Run D1 migrations once** against the shared DB after ready; run each app's
   seed hook (e.g. `DOC_API_DEV_SEED`) once.
7. **Spawn Vite children** for Vite apps with
   `DEVFLARE_DEV=true` + `DEVFLARE_BRIDGE_PORT=<that app's gateway port>`.

Everything below the merge (the gateway runtime, the bridge protocol, the D1
migration endpoint, presign, DO bundling) is **unchanged**.

---

## 6. Opt-in surface (config + CLI sketch)

Illustrative, not final. Names follow existing devflare conventions
(`defineConfig` lives in `src/config/define.ts`; a `workspace` command slots into
the `switch` in `src/cli/index.ts:164`).

### A workspace manifest — `devflare.workspace.ts` (repo root)

```ts
import { defineWorkspace } from 'devflare'

export default defineWorkspace({
	apps: [
		{
			// pure worker → its direct socket IS its browser origin
			config: './apps/api/devflare.config.ts',
			port: 8789,
			env: { DOC_API_DEV_SEED: '1' }
		},
		{
			// Vite app → devflare spawns Vite; the port is the bridge/runtime port
			config: './apps/web/devflare.config.ts',
			vite: true,
			vitePort: 5173,
			bridgePort: 8788
		}
	],

	// Optional: assert intended sharing so a mismatch is a loud error, not a
	// silently-separate store. Sharing itself is automatic by binding id.
	shared: {
		d1: ['PLATFORM_DB'],
		r2: ['MEDIA']
	},

	// One persist dir for the whole workspace (default shown).
	persist: '.devflare/workspace-data'
})
```

### Command

```bash
devflare workspace dev            # one Miniflare, all apps, shared bindings
devflare workspace dev --no-persist
```

Internally `runWorkspaceDevCommand` does §5.2 and reuses `createDevServer`'s
building blocks (it already owns Miniflare lifecycle, DO hot-reload via
`setOptions`, migrations, and Vite spawning — see
`src/dev-server/server.ts`). The cleanest implementation extracts the
merge+lifecycle into a `createWorkspaceDevServer` sibling to `createDevServer`,
rather than bolting multi-app onto the single-app path.

### Zero-config alternative — reuse `ref()`

Because `ref()` already co-hosts and shares bindings (§3.4), a lighter first
iteration could skip the manifest: the web config does

```ts
const api = ref(() => import('../api/devflare.config'))
// … and a new flag marks it a "peer" (co-host its full fetch app + give it a port)
```

and devflare co-hosts the api's **full** runtime (not just its RPC surface) on a
declared port. This reuses the resolver but needs (1) bundling `files.fetch` +
routes instead of `worker.ts`, and (2) a direct socket. The explicit
`defineWorkspace` manifest is preferred because it's symmetric (no app is
"primary"), makes ports/seeds first-class, and reads better for N apps.

---

## 7. Fit with portless, per-app configs, and the SvelteKit bridge

- **Per-app `devflare.config.ts` — unchanged.** The apps already declare matching
  binding ids; nothing in `apps/*/devflare.config.ts` changes. Each app's config
  remains the single source of truth for its own bindings/DOs/routes.
- **SvelteKit bridge — unchanged, just repointed.** `hooks.server.ts` still does
  `export { handle } from 'devflare/sveltekit'`. The coordinator sets
  `DEVFLARE_BRIDGE_PORT` for the web's Vite child to the shared instance's
  web-gateway port. The bridge client already honors that env
  (`src/sveltekit/platform.ts:147`). No consumer code change.
- **portless.** `portless` proxies `name.localhost → port` and spawns a command
  per app. The coordinator exposes **fixed** ports (like the e2e config already
  pins 5173/8788/8789), so `portless` can keep host-proxying with **pinned
  `appPort`s** and no dynamic assignment. Two integration shapes:
  - **Preferred:** root `dev` = `devflare workspace dev` (owns Miniflare + spawns
    the web Vite); `portless` runs alongside for hostname proxying to the fixed
    ports (and to keep `apps/landing`). The two "shared" apps stop spawning their
    own `devflare dev`.
  - **Least-invasive:** keep `portless` spawning per app, but the shared apps'
    dev scripts become thin shims (the leader/attach alternative, §4) — more
    fragile.
- **e2e (Playwright).** Today it launches two `devflare dev` (`--runtime-port
  8788` web, `8789` api) and `test.fixme`s 7 cross-origin tests that only fail on
  binding isolation. With the coordinator, e2e launches one `devflare workspace
  dev` with those same ports; the fixme'd tests can be un-skipped. This is the
  concrete payoff.

---

## 8. Migration & backward compatibility

- **Default behavior is unchanged.** Per-app `devflare dev` keeps starting one
  isolated Miniflare exactly as today. The workspace path is **strictly opt-in**
  (a new manifest + `devflare workspace dev`). No behavior change for any app that
  doesn't adopt it.
- **`DEVFLARE_PERSIST_DIR` (next.65) stays** but should be **documented as
  file-colocation only — it does not provide live cross-process sharing** (§3.2),
  to stop teams reaching for it expecting shared state. The workspace command is
  the supported way to share live state.
- **No API removed/renamed.** `defineWorkspace`/`workspace` are additive.
- **`ref()` semantics unchanged** — the workspace builder reuses the resolver's
  binding-mapping helpers but does not alter `ref()`'s service/DO behavior.

---

## 9. Feasibility verdict — MODERATE (clean mechanism, moderate orchestration)

**The mechanism is proven and already used inside devflare; the risk is entirely
in orchestration ergonomics, not in whether it can work.**

Why not "clean": it's a new multi-app lifecycle (spawn/monitor Vite children, run
migrations/seeds once, teardown ordering) plus the portless-integration decision.
Why not "hard": no new runtime, no bridge-protocol change, no consumer change; the
two load-bearing capabilities (multi-worker shared storage; per-worker ports) are
first-class Miniflare features, and the per-app config assembly is fully reused.

### Main risks / open questions

1. **Worker-name collisions on merge.** Two apps both have a `gateway` and may
   share DO/shim worker names. Mitigation: namespace every worker name per app and
   rewrite intra-app `serviceBindings`/`durableObjects.scriptName` references.
   *Straightforward but must be exhaustive.*
2. **`unsafeDirectSockets` is an `unsafe*` API.** It's what `wrangler` uses
   internally and is stable in practice, but it's not covered by Miniflare's
   semver surface. Pin the Miniflare version; add a smoke test asserting
   `unsafeGetDirectURL(app)` resolves.
3. **Entry-socket routing.** Dropping `routes: ['*']` from co-hosted gateways and
   relying on direct sockets is required (two `*` routes would contend). Verify no
   code path depends on the shared entry socket; give it a 404 default.
4. **R2 presign origin per app.** The presign secret is per-instance (fine, one
   instance) but the *origin* used to mint URLs differs per app
   (`src/dev-server/miniflare-dev-config.ts:213-223`). Inject a per-worker presign
   origin so each app mints against its own origin.
5. **Migrations / seeds run-once.** Against the shared DB, run each migration set
   once (the gateway's migration ledger already dedupes by filename+sha256 —
   `gateway-script.ts:129-203`), and run app seed hooks once, not per app.
6. **Hot reload within a shared instance.** `setOptions` rebuilds the whole
   instance (`server.ts:114-132`); a change in one app reloads all workers. Fine
   for correctness (bindings persist), but reload latency scales with app count —
   acceptable, worth noting.
7. **Bun requirement for `ref()`-style bundling.** The existing referenced-worker
   bundler needs the Bun runtime (`resolve-service-bindings.ts:587-595`). The
   workspace builder should reuse the *normal* per-app rolldown bundling
   (`bundleWorkerEntry`, already used by `createDevServer`), which does not have
   that constraint — another reason to build on `buildMiniflareDevConfig`, not on
   `ref()`'s test-oriented bundler.
8. **portless spawn model.** Deciding between "root runs the coordinator" vs
   "portless spawns it" is an ergonomics call (§7); both work, neither is blocked.

### A genuinely small proof-of-concept

Before building the full command, one ~30-line script proves the whole thesis
end-to-end with **no** devflare changes:

> Instantiate one `Miniflare` with two trivial workers `A` and `B`, **both**
> declaring `d1Databases: { DB: 'shared' }`, each with `unsafeDirectSockets: [{
> port: 0 }]`. `await mf.ready`; write via `(await
> mf.getD1Database('DB'))` bound to A; read the same row through B's direct URL;
> assert `unsafeGetDirectURL('A') !== unsafeGetDirectURL('B')` (distinct ports)
> and that the row is visible through both. Green ⇒ shared storage + distinct
> origins from one instance is real. (This mirrors §3.1 + §3.3 and is worth
> landing as a devflare test fixture regardless.)

---

## 10. Bottom line

- **Sharing live D1/KV/R2/DO across two dev apps is only possible by co-hosting
  their workers in one Miniflare instance** — proven by Miniflare's
  service-dedup-by-id + single-`workerd` model, and by the fact that even
  Miniflare's own dev registry refuses to share storage across processes. The
  shipped `DEVFLARE_PERSIST_DIR` cannot and will not achieve this.
- **The cross-origin objection that killed the earlier co-location attempt is
  solved by `unsafeDirectSockets`**, which gives each co-hosted worker its own
  browser-reachable port.
- **Recommended:** a `devflare workspace dev` coordinator that merges each app's
  existing `buildMiniflareDevConfig` worker set into one instance, one per-app
  direct socket each, Vite apps attached via the (already-configurable) bridge.
  **Default unchanged; opt-in via a `defineWorkspace` manifest.**
- **Verdict: feasible, MODERATE effort** — orchestration on top of machinery
  devflare already ships.
```