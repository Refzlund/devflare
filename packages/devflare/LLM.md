# Devflare documentation markdown export

This file is generated from the structured documentation model in `apps/documentation/src/lib/docs/content*.ts` during the documentation build and deploy pipeline.

It is meant to read like a proper markdown handbook rather than a second source of truth, so the docs site and the `LLM.md` export stay aligned.

## How to use this export

- Read the documentation map first to find the relevant page and route quickly.
- Each page includes a short summary, metadata, key takeaways, and the fully expanded sections from the docs source.
- Links use the same `/docs/...` routes as the documentation site.

## Documentation map
This export covers 83 pages across 5 top-level groups.

### Quickstart
See why Devflare exists, build the smallest safe first worker, and keep the documentation contract nearby before you branch into the deeper toolkit.

- **Documentation contract** — See how the former split package handbook coverage now lives directly in the task-focused site pages and the published `packages/devflare/LLM.md` handbook.
  - [Contract map](/docs/documentation-contract) — The documentation site now owns the authored docs model, while `packages/devflare/LLM.md` remains the generated one-file export shipped with the package.

- **Foundations** — Start with the mental model, the smallest safe worker, and one real test before you branch into app-specific setup.
  - [Why Devflare](/docs/what-devflare-is) — Devflare gives you one clearer story for config, worker compilation, local development, runtime helpers, testing, and deploy flows so a Worker app can stay small at the start and still stay coherent as it grows.
  - [Your first worker](/docs/first-worker) — Start with one config file, one fetch handler, and generated types before you branch into routes, bindings, frameworks, or a deeper test setup.
  - [Your first unit test](/docs/first-unit-test) — Take the same starter worker from the previous page and add one request test through `createTestContext()` so the first check uses the same runtime shape the worker will actually run.
  - [Your first bindings](/docs/first-bindings) — Take the same starter worker, split it into routes and helpers, then add one binding-backed route at a time so `src/fetch.ts` can stay small.
  - [Deploy and Preview](/docs/deploy-and-preview) — Take the same starter worker and ship one named preview on purpose, then remove that same preview scope cleanly when you are done.

### Devflare
Keep the day-to-day Devflare surfaces easy to scan: runtime model, HTTP split, authored config rules, CLI workflow, helpers, testing, and framework lanes all live here instead of being scattered across deploy-only docs.
- [CLI](/docs/devflare-cli) — Start at `devflare --help`: the root page already maps local dev, inspection, deploy intent, account inventory, preview lifecycle, production control, token management, AI pricing, and remote-mode operations in one place.
- [Project Architecture](/docs/project-architecture) — This is the practical answer to “what does a real Devflare project look like on disk?” — from a small worker package, to a multi-surface app, to a hosted SvelteKit package, to a Bun monorepo with several deployable workers.
- [Routing](/docs/http-routing) — Use `src/fetch.ts` for request-wide behavior, `src/routes/**` for leaf handlers, and `files.routes` when you need a custom root, prefix, or route-only app.

- **Configuration** — Keep authored config readable, stable, and clearly separated from generated output.
  - [Config basics](/docs/config-basics) — Write `devflare.config.ts` for humans first, let Devflare merge environments and resolve names later, and treat generated Wrangler-facing files as outputs rather than authoring surfaces.
  - [Full config](/docs/full-config) — See one canonical `devflare.config.ts` that touches the main current config lanes in a single file, with hover coverage on every property shown in the example.
  - [Project shape](/docs/project-shape) — Start with one fetch file, then add routes, background handlers, Durable Objects, assets, and transport rules only when the project genuinely needs them.
  - [Worker surfaces](/docs/worker-surfaces) — Devflare can compose or wrap several Worker surfaces into one generated entrypoint, but the authored source of truth should stay in explicit files such as `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, and `src/email.ts`.
  - [Generated types](/docs/generated-types) — `devflare types` turns config, discovered Durable Objects, named entrypoints, and cross-worker references into one generated TypeScript contract instead of a pile of hand-maintained env guesswork.
  - [Environments](/docs/config-environments) — Keep one base config, layer environment-specific overrides with `config.env`, and let Devflare resolve preview or production details only in the commands that actually need them.
  - [Previews](/docs/config-previews) — Use `preview.scope()` for bindings that should belong to one preview scope. Devflare materializes names like `notes-db-next`, provisions or reuses the preview-only resources it can manage, and lets you clean them up by the same scope later without touching production resources.
  - [Runtime & deploy settings](/docs/runtime-deploy-settings) — Use config for account context, compatibility posture, assets, deployment routes, WebSocket proxy rules, migrations, observability, limits, and preview cron behavior instead of rediscovering those settings in scripts later.

- **Runtime** — Keep the reusable runtime primitives nearby: AsyncLocalStorage-backed context, request-wide middleware composition, bridge transport, and other worker-wide helper surfaces belong here.
  - [Runtime context](/docs/runtime-context) — Devflare-managed entrypoints create a rich surface event, store `env`, `ctx`, `request`, `locals`, `type`, and the original event in `AsyncLocalStorage`, then expose that state through helpers such as `getFetchEvent()`, `getQueueEvent()`, `getContext()`, and the `env`, `ctx`, `event`, and `locals` runtime proxies inside the same handler trail.
  - [sequence(...)](/docs/sequence-middleware) — Use `sequence(...)` from `devflare/runtime` when broad HTTP concerns must wrap route resolution or another fetch handler in a clear top-to-bottom order.
  - [transport.ts](/docs/transport-file) — Most workers do not need a transport file. Add one when Devflare’s local RPC-style bridge must encode and decode custom values, especially across Durable Object method calls in tests.

- **Testing** — Start with why the testing experience feels different, use the testing map and built-in harness for runtime-shaped checks, and jump to binding-specific guides when the test story changes by binding.
  - [Why tests feel native](/docs/why-testing-feels-native) — Devflare’s standout testing trick is that the same config, bindings, env surface, runtime helpers, and even direct Durable Object method calls can stay available in Bun tests without a hand-built fake layer in the middle.
  - [Testing overview](/docs/testing-overview) — Devflare’s testing story is layered on purpose: start with one real unit test, use `createTestContext()` and `cf.*` for the runtime-shaped harness, then jump to binding-specific guides or CI-focused pages only when the question changes.
  - [createTestContext()](/docs/create-test-context) — Start tests with `createTestContext()` so the same config, bindings, routes, and handler surfaces the app uses in real runtime flows are available in Bun tests.
  - [Binding testing](/docs/binding-testing-guides) — Every binding overview page already links a hidden testing guide. This page collects those guides in one place so you can jump straight to the right harness, caveats, and escalation path for the binding that changed.

- **Frameworks** — Choose the right host lane for worker-rendered Svelte, standalone Vite apps, and full SvelteKit shells without losing the worker-first mental model.
  - [Svelte in workers](/docs/svelte-with-rolldown) — When a worker-only fetch surface or Durable Object imports `.svelte`, add the Svelte compiler to `rolldown.options.plugins`. That compilation belongs to Devflare’s worker bundler, not the main Vite plugin chain.
  - [Vite standalone](/docs/vite-standalone) — An effective Vite config is what opts the package into Vite-backed flows: a local `vite.config.*`, a non-empty `config.vite`, or both together. Use `devflare/vite` when the package really is a Vite app and you want Devflare to keep Worker config, Durable Objects, and generated Wrangler output aligned underneath it.
  - [SvelteKit](/docs/sveltekit-with-devflare) — Point Devflare at SvelteKit’s Cloudflare worker output—often via `files.fetch`, but sometimes by handing `wrangler.passthrough.main` the adapter worker directly—keep `sveltekit()` in `vite.config.ts`, and compose `devflare/sveltekit` into `src/hooks.server.ts` so local platform bindings line up with the Worker runtime Devflare manages.

### Ship & operate
Deploy explicitly, choose the right preview model, manage preview lifecycle cleanly, and keep CI/CD plus verification honest.

- **CI/CD** — Use small GitHub workflows that keep triggers, permissions, impact checks, deploy intent, and feedback easy to review.
  - [GitHub workflows](/docs/github-workflows) — This repository keeps GitHub workflows small on purpose: one shared preview workflow owns branch and PR preview lifecycles, while reusable Devflare actions handle impact checks, shared workspace setup, deploy execution, and feedback publishing.

- **Deploy targets** — Move from local build output to production or preview deploys without guessing which destination you are about to hit.
  - [Production deploys](/docs/production-deploys) — Devflare keeps build and deploy flows inspectable, but deploys are intentionally explicit: production uses `--prod` or `--production`, while preview is either a same-worker upload with plain `--preview` or a named preview scope with `--preview <name>`.
  - [Monorepos & Turborepo](/docs/monorepo-turborepo) — In a Bun monorepo, Turborepo should own task orchestration, caching, and impact-aware validation, while `devflare` still runs from the package that owns the Worker or app you are deploying.
  - [Preview strategies](/docs/preview-strategies) — Devflare supports both same-worker preview uploads and named preview scopes, but Durable Object-heavy apps often need a branch-scoped worker-family strategy instead of relying on preview URLs alone.

- **Operations** — Choose account context, inspect live production, manage Worker names and tokens, gate paid remote tests deliberately, and reuse the public Cloudflare helper API when automation needs the same rules.
  - [Control-plane operations](/docs/control-plane-operations) — Devflare’s deeper CLI families exist so account selection, live production inspection, Worker renames, token lifecycle, and remote paid-test gates stay documented instead of dissolving into ad-hoc command snippets.
  - [devflare/cloudflare](/docs/cloudflare-api) — The `devflare/cloudflare` subpath exposes the same account-aware building blocks the CLI uses for auth, resource inventory, usage and limits, preview registry access, preferences, and managed token workflows.

- **Preview lifecycle** — Inspect, reconcile, retire, and clean up preview scopes after they exist so preview infrastructure does not sprawl.
  - [Preview operations](/docs/preview-operations) — The preview registry is D1-backed and gives Devflare a durable record of preview, alias, and deployment state so cleanup and reconciliation do not have to depend on fragile one-off scripts.

- **Verification** — Use runtime-shaped tests and keep automation observable enough to trust during releases.
  - [Testing & automation](/docs/testing-and-automation) — Keep local harness detail on the dedicated testing pages, then promote only the right runtime-shaped checks into thin, observable automation.

### Guides
Use cross-cutting guides to choose the right storage, state, async, file-delivery, and worker-composition patterns before you dive into one binding reference page.

- **Guides** — Choose the right architecture and product boundary first, then let the specific binding pages own the exact authoring and runtime mechanics.
  - [Storage strategy](/docs/storage-bindings) — Use this page to choose between KV, D1, R2, and Hyperdrive. Once the shape is clear, open the binding-specific guide for authoring, testing, and examples instead of reading several smaller pages that all repeat the same decision badly.
  - [R2 uploads & delivery](/docs/r2-uploads-and-delivery) — Use presigned `PUT` URLs for direct uploads, public buckets on custom domains for truly public assets, and private buckets plus Worker auth for protected files. Keep `r2.dev` out of production, and when a preview or environment needs its own bucket, scope it intentionally instead of borrowing production storage.
  - [State & async patterns](/docs/durable-objects-and-queues) — Use Durable Objects when one identity should own state or coordination. Use queues when work should happen later, in batches, or with retries. Then open the specific binding guide once the pattern is clear.
  - [Worker composition](/docs/multi-workers) — Use this page for the architecture question: when a separate worker boundary is justified, how `ref()` and service bindings keep it explicit, and where local tests and release checks should prove the wiring.

### Bindings
Use the per-binding guides for the exact authoring, runtime, testing, preview, and example details once the guide pages have already helped you choose the right pattern.

- **KV** — Fast lookup state, cache-like reads, and lightweight shared data with strong local support.
  - [KV](/docs/kv-binding) — KV bindings are first-class in Devflare: author stable names in config, keep env typed, and run real get or put flows locally.
  - [KV internals](/docs/kv-internals) — KV goes through the full Devflare pipeline: normalize authoring, resolve names when needed, then compile to Wrangler output.
  - [Testing KV](/docs/kv-testing) — Use the default test harness first. KV is one of the bindings Devflare supports best in local tests.
  - [KV example](/docs/kv-example) — This example keeps KV boring on purpose: one binding, one fetch handler, one assertion.

- **D1** — SQLite-style relational queries with a strong local harness and id or name-based authoring.
  - [D1](/docs/d1-binding) — D1 gets the same stable-name authoring story as KV, but the runtime shape is relational: `prepare`, `batch`, `exec`, and prepared statements.
  - [D1 internals](/docs/d1-internals) — D1 uses the same normalize-then-resolve pattern as KV, but compiles to Wrangler `d1_databases` and exposes a relational local runtime surface.
  - [Testing D1](/docs/d1-testing) — D1 is one of the easiest bindings to test meaningfully with Devflare because the local runtime already speaks the same database API your worker uses.
  - [D1 example](/docs/d1-example) — This starter example keeps D1 focused on one job: answer a single query and prove the binding works locally.

- **R2** — Object storage bindings with strong local support and one important rule: do not assume a browser URL contract.
  - [R2](/docs/r2-binding) — R2 is straightforward in config and well-supported locally, but browser-facing delivery should usually go through a Worker route instead of assuming bucket URLs.
  - [R2 internals](/docs/r2-internals) — R2 is simpler than KV or D1 because the authored value is already the bucket name, so there is no name-versus-id resolution dance.
  - [Testing R2](/docs/r2-testing) — R2 is local-friendly, which means you can test real object operations without inventing a storage adapter just to get off the ground.
  - [R2 example](/docs/r2-example) — This example uses one private bucket and one route, which is still the cleanest default shape for many real apps.

- **Durable Objects** — Stateful coordination primitives with strong local support, cross-worker wiring, and important preview caveats.
  - [Durable Objects](/docs/durable-object-binding) — Devflare treats Durable Objects as a real first-class surface in config, local runtime, and tests, not as an awkward plugin hanging off the side of the worker.
  - [Durable Objects internals](/docs/durable-object-internals) — Durable Object bindings normalize into a stable binding shape, compile into Wrangler `durable_objects.bindings`, and participate in Devflare’s own DO bundling path.
  - [Testing Durable Objects](/docs/durable-object-testing) — Durable Objects are well-supported in the default Devflare harness, which means you can test real object behavior without hand-building a fake namespace first.
  - [Durable Objects example](/docs/durable-object-example) — This example uses a tiny counter object because the shape is easy to understand and still proves the important DO wiring.

- **Queues** — Producer and consumer bindings for background work with a strong local trigger story.
  - [Queues](/docs/queue-binding) — Devflare models Queue producers and consumers explicitly, which makes local tests and preview naming much easier to reason about.
  - [Queues internals](/docs/queue-internals) — Queue config is compiled into explicit producer and consumer blocks, with preview resource materialization available for both queue names and DLQs.
  - [Testing Queues](/docs/queue-testing) — Queue testing is one of the places where Devflare’s helper surface feels especially good because the queue trigger already knows how to drive the real handler shape.
  - [Queues example](/docs/queue-example) — This starter example wires one producer, one consumer, and one stored result so you can see the whole queue loop without ceremony.

- **AI** — Workers AI bindings for remote inference, with a deliberately remote-oriented testing story.
  - [AI](/docs/ai-binding) — AI is a supported binding in Devflare, but it is intentionally treated as remote-oriented because real model inference lives on Cloudflare infrastructure.
  - [AI internals](/docs/ai-internals) — AI has a smaller compiler story than storage bindings, but a more explicit auth and remote-runtime story.
  - [Testing AI](/docs/ai-testing) — The right AI test strategy is selective: use remote mode when you mean to test inference, and skip cleanly when the environment is not allowed to do that.
  - [AI example](/docs/ai-example) — This example keeps the AI path tiny: one binding, one inference call, one JSON response.

- **Vectorize** — Vector similarity indexes with explicit remote testing and preview-aware index naming.
  - [Vectorize](/docs/vectorize-binding) — Vectorize is fully modeled in Devflare config and preview naming, but meaningful tests are still remote-oriented because the index lives on Cloudflare infrastructure.
  - [Vectorize internals](/docs/vectorize-internals) — Vectorize compiles cleanly into Wrangler output and participates in preview resource lifecycle, but the runtime value of the binding mostly lives in remote infrastructure.
  - [Testing Vectorize](/docs/vectorize-testing) — The right Vectorize tests are targeted remote checks: a small insert or query, a clear skip condition, and a real index behind the binding.
  - [Vectorize example](/docs/vectorize-example) — This example keeps Vectorize honest: one index binding, one upsert, and one query against the same worker path.

- **Hyperdrive** — PostgreSQL-oriented bindings with schema support, name resolution, and a narrower proven local story than D1 or KV.
  - [Hyperdrive](/docs/hyperdrive-binding) — Hyperdrive is modeled in Devflare config and compile flows like other name-based resources, but its tested local ergonomics are thinner than D1 or KV.
  - [Hyperdrive internals](/docs/hyperdrive-internals) — Hyperdrive uses the same normalize-and-resolve pattern as KV and D1, but preview lifecycle includes a fallback path instead of guaranteed preview cloning.
  - [Testing Hyperdrive](/docs/hyperdrive-testing) — Hyperdrive testing should start smaller and more cautiously than D1 testing: prove the binding exists, then add targeted integration where the real database path matters.
  - [Hyperdrive example](/docs/hyperdrive-example) — This example keeps Hyperdrive focused on one thing: prove the binding exists and expose the connection information your app will need next.

- **Browser Rendering** — Headless browser support with an explicit single-binding limit and a stronger dev-server story than test-helper story.
  - [Browser Rendering](/docs/browser-binding) — Devflare supports Browser Rendering, but the docs should say the quiet part out loud: there is exactly one browser binding today, and the best-supported local story lives in dev-server and integration flows.
  - [Browser Rendering internals](/docs/browser-internals) — Browser Rendering support in Devflare is more than a config pass-through: the dev server starts a browser shim and a binding worker that line up with Cloudflare and puppeteer expectations.
  - [Testing Browser Rendering](/docs/browser-testing) — Browser tests should usually be integration-flavored: either drive the worker in dev or exercise a thin smoke path that proves the binding can launch and fetch.
  - [Browser Rendering example](/docs/browser-example) — This example shows the real browser shape most people care about: launch a browser, read one page title, close the browser cleanly.

- **Analytics Engine** — Dataset bindings for writeDataPoint-style event recording with schema support and lighter local testing guidance.
  - [Analytics Engine](/docs/analytics-engine-binding) — Analytics Engine is modeled cleanly in Devflare config and generated types, but the repo evidence points to a lighter local story than the first-class storage bindings.
  - [Analytics Engine internals](/docs/analytics-engine-internals) — Analytics Engine has a straightforward compiler story, plus a preview note that matters because datasets are auto-created on first write instead of provisioned like buckets or databases.
  - [Testing Analytics Engine](/docs/analytics-engine-testing) — Analytics Engine tests should stay thin: verify that the worker writes a data point, not that you can recreate Cloudflare analytics locally.
  - [Analytics Engine example](/docs/analytics-engine-example) — This example writes one analytics event from one route, which is usually all you need to teach the binding shape clearly.

- **Send Email** — Outbound email bindings with real local support, plus an important distinction from inbound email event handlers.
  - [Send Email](/docs/send-email-binding) — Send Email is a real binding surface in Devflare, and it is worth documenting separately from inbound `src/email.ts` handlers so the two flows do not get blurred together.
  - [Send Email internals](/docs/send-email-internals) — Send Email compiles into Wrangler output, normalizes message input at runtime, and supports local address restrictions instead of treating email as an unbounded free-for-all.
  - [Testing Send Email](/docs/send-email-testing) — Send Email is stronger locally than many platform-service bindings because outbound email can be exercised in the default harness, while inbound email has its own related helper surface.
  - [Send Email example](/docs/send-email-example) — This example keeps outbound email explicit: one binding, one recipient rule, one worker path that sends one message.

## Full documentation

### See how the site model and published `LLM.md` stay aligned

> The documentation site now owns the authored docs model, while `packages/devflare/LLM.md` remains the generated one-file export shipped with the package.

| Field | Value |
| --- | --- |
| Route | [`/docs/documentation-contract`](/docs/documentation-contract) |
| Group | Quickstart |
| Navigation title | Contract map |
| Eyebrow | Docs model |

The older split handbook content has been folded into `apps/documentation/src/lib/docs/content*.ts`. The site now carries that material as smaller task-focused routes, and the published `packages/devflare/LLM.md` file is generated from the same model when you want one flattened handbook export.

#### At a glance

| Fact | Value |
| --- | --- |
| Authoritative authoring layer | `apps/documentation/src/lib/docs/content*.ts` |
| Primary reading surfaces | Task-focused `/docs/*` routes plus `/llm.md` and `/llm.txt` exports |
| Refresh commands | `bun run llm:generate` from `apps/documentation`, or the same command from `packages/devflare` when you also want the packaged copy refreshed |

#### Know which layer is authoritative now

The structured documentation model in `apps/documentation/src/lib/docs/content*.ts` is now the source of truth for the authored Devflare handbook. The older split package docs have been folded into that model so the site and exported handbook stay aligned.

The site breaks that material into smaller task-focused routes, while the generated handbook turns the same model into one-file exports for search, review, and package shipping.

The generated `/llm.md` export is the fuller one-file handbook, while `/llm.txt` is the stricter text-oriented subset from the same model and intentionally omits handbook-only sections such as the documentation contract. The published `packages/devflare/LLM.md` file is copied from `/llm.md` before packaging, and none of those exports are meant to be hand-edited source authoring.

##### Highlights

- **Structured docs model** — `apps/documentation/src/lib/docs/content*.ts` now holds the authored handbook copy, page structure, examples, and task-first route organization.
- **Task-focused site routes** — The site favors smaller routes aimed at one job to be done instead of mirroring the old handbook structure page for page.
- **Published handbook export** — Use `/llm.md` for the fuller generated handbook, `/llm.txt` for the stricter text-oriented subset, and remember that `packages/devflare/LLM.md` is copied from `/llm.md` before publish time.

> **Important — The safest drift rule**
>
> If handbook coverage changes, update the matching site pages first, then regenerate the package handbook. If `packages/devflare/LLM.md` says something the site model does not back up, fix the site model and regenerate instead of patching the handbook by hand.

#### See where the same docs model shows up

The site and handbook outputs are different reading surfaces backed by one model, not separate sources of truth.

##### Reference table

| Surface | Best when | Backed by |
| --- | --- | --- |
| /docs/* routes | You are reading one topic in the site and want navigation, context, and examples inline. | `apps/documentation/src/lib/docs/content*.ts` |
| /llm.md and /llm.txt | You want the generated handbook as one file: `/llm.md` for the fuller export, `/llm.txt` for the stricter text-oriented subset that omits handbook-only sections such as the documentation contract. | Generated from the same docs model. |
| `packages/devflare/LLM.md` | You want the published one-file handbook that ships with the package. | Copied from the generated docs export before packaging. |

#### Use the site for tasks and the handbook for one-file reading

##### Steps

1. Start from the task-focused site page when you need to build, review, or debug one specific part of Devflare.
2. Use `/llm.md` when you want the fullest one-file handbook, `/llm.txt` when you want the stricter text-oriented subset, or the published `packages/devflare/LLM.md` file when you want the package copy that ships.
3. Run `bun run llm:generate` from `apps/documentation` when you are editing the site model, or from `packages/devflare` when you need the packaged `LLM.md` copy refreshed too.
4. Let build and prepare hooks regenerate the handbook outputs instead of hand-editing `LLM.md`.

> **Tip — The intended reading pattern**
>
> Read the site by job to be done, and use the package-level `LLM.md` when you want the same material in one file.

#### A good docs drift check is small and specific

##### Key points

- Update the site pages first, then regenerate the handbook outputs.
- If the site and `packages/devflare/LLM.md` disagree, fix `apps/documentation/src/lib/docs/content*.ts` and regenerate instead of patching the export by hand.
- If a concept stops fitting the current site structure, add or split a page instead of hiding the change in generated output.
- Never hand-edit generated `packages/devflare/LLM.md`; regenerate it from the site model after you update the underlying docs.

---

### Why Devflare feels better than stitching Cloudflare Worker workflows together by hand

> Devflare gives you one clearer story for config, worker compilation, local development, runtime helpers, testing, and deploy flows so a Worker app can stay small at the start and still stay coherent as it grows.

| Field | Value |
| --- | --- |
| Route | [`/docs/what-devflare-is`](/docs/what-devflare-is) |
| Group | Quickstart |
| Navigation title | Why Devflare |
| Eyebrow | Why it helps |

The goal is not to hide Cloudflare. The goal is to keep authored code split by responsibility, let generated output and Rolldown-backed worker compilation stay in their own lane, and give you a smoother path from one worker to routing, bindings, frameworks, previews, and automation.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Teams that want Cloudflare power without accumulating setup glue |
| Architecture shape | Config, runtime, tests, framework integration, and Cloudflare ops stay split on purpose |
| Build lane | Rolldown composes worker and Durable Object artifacts; Vite stays optional |
| Still true | Cloudflare limits and Wrangler-compatible output still matter |

#### Why teams reach for Devflare in the first place

Most people do not adopt Devflare because they want more abstraction. They adopt it because raw Worker projects can accumulate too many small decisions in too many places.

Without some structure, config lives in one file, generated artifacts in another, tests invent their own fake runtime, and preview or deploy behavior becomes whichever shell snippet the team last copied forward.

Devflare gives those pieces one authored story: readable config, worker-shaped runtime helpers, generated worker composition, a bridge-backed local loop, and deploy or preview flows that stay explicit instead of magical.

##### Highlights

- **Less glue code** — Keep stable intent in authored config instead of scattering worker names, resource ids, and generated file edits across the repo.
- **Split by responsibility** — Config authoring, runtime helpers, tests, framework hooks, and Cloudflare operations live in separate lanes instead of one catch-all surface.
- **Worker-aware compilation** — Author routes, surfaces, and Durable Objects as app code, then let Devflare and Rolldown compose the runtime-facing artifacts.
- **Cleaner local and framework loop** — Use one worker-aware development story that can stay worker-only or plug into Vite and SvelteKit when the package actually needs them.
- **Tests that resemble production** — Reach for the built-in runtime-shaped test harness before custom mocks drift away from how the Worker actually behaves.

#### Why the codebase stays coherent as the app grows

The implementation is split by environment and lifecycle on purpose so the worker story can grow without collapsing into one giant tool blob.

`devflare/config` is for authored config, `devflare/runtime` is for worker code, `devflare/test` is for harnesses, and `devflare/vite` or `devflare/sveltekit` only join the picture when the package grows into a real app host. That split is one of the package's quiet strengths.

The build and local-dev story stays honest too. Rolldown is the worker builder, generated entrypoints keep worker surfaces explicit, and Vite or SvelteKit can sit outside the worker runtime instead of swallowing it.

##### Highlights

- **Split package surfaces** — Different public entrypoints exist because config authoring, runtime code, tests, framework hosting, and Cloudflare operations are different jobs.
- **Rolldown owns worker artifacts** — Worker and Durable Object bundles are composed and validated for Cloudflare compatibility instead of being treated as generic JavaScript output.
- **Bridge-backed framework dev** — When a package uses Vite or SvelteKit, Devflare keeps Miniflare or workerd on one side, the app host on the other, and bridges bindings back into the framework dev server.
- **Framework endpoints can still reach worker bindings** — In local dev, the framework lane can read Cloudflare-shaped bindings through the bridge-backed platform surface instead of needing a second fake environment.

> **Important — Vite is additive here**
>
> Vite and SvelteKit are optional outer hosts. The worker runtime, routes, bindings, and generated artifacts remain the core story.
>
> Want support for your framework of choice? [Open an issue](https://github.com/Refzlund/devflare/issues)

#### What Devflare already supports across a real application

Hover a label to see what it means for config, local runtime, tests, previews, and operational guidance.

##### Highlights

- **Fetch, routes, and middleware** — Worker fetch entrypoints, file routing, and `sequence(...)` middleware are first-class Devflare surfaces with strong local runtime support and clean request-scoped helpers. ([link](/docs/http-routing))
- **KV, D1, and R2** — Devflare gives the main storage bindings a strong local-first story: readable config, generated env typing, local runtime behavior, and realistic tests without losing the Cloudflare shape. ([link](/docs/storage-bindings))
- **Durable Objects and queues** — Stateful objects and deferred work are treated as real worker surfaces, with config discovery, local runtime wrappers, and test helpers that match the application boundary. ([link](/docs/durable-objects-and-queues))
- **Service bindings and worker composition** — Service bindings and `ref()` let worker-to-worker dependencies stay explicit enough for local multi-worker runtime, generated types, and real tests through the same env surface the app uses. ([link](/docs/multi-workers))
- **Hyperdrive** — Hyperdrive is modeled cleanly in config and generated output, but the local and preview ergonomics are more constrained than KV, D1, or R2 because the real database and credentials stay remote. ([link](/docs/hyperdrive-binding))
- **Workers AI** — The AI binding is supported in config, types, and deployment flows, but meaningful tests are remote-oriented because real inference still lives on Cloudflare infrastructure. ([link](/docs/ai-binding))
- **Vectorize** — Vectorize is fully modeled in config and preview-aware naming, but real inserts and similarity queries still need remote infrastructure and honest remote-mode tests. ([link](/docs/vectorize-binding))
- **Browser Rendering** — Browser Rendering is fully supported through Devflare's bridge-backed local dev story, config model, generated typing, and runtime integration. The main platform caveat is still the Cloudflare one: exactly one browser binding. ([link](/docs/browser-binding))

#### What Devflare adds on top of raw Cloudflare workflows

These are the parts that feel distinctly like Devflare rather than just a thinner wrapper around Wrangler. They are implemented features in their own right, and each one has deeper docs when you want the full story.

##### Highlights

- **AsyncLocalStorage-backed context** — Devflare stores the active event, env, ctx, request, and locals so helper code can recover the current Worker context without threading it through every function call. ([link](/docs/runtime-context))
- **`sequence(...)` middleware** — Request-wide middleware becomes a first-class pattern instead of something every app reinvents in a slightly different fetch wrapper. ([link](/docs/sequence-middleware))
- **Runtime-shaped unit testing and the smart bridge** — The default test harness boots a real worker-shaped environment and uses the bridge so tests can talk to workers, bindings, queues, services, and other surfaces without inventing a second fake runtime. ([link](/docs/create-test-context))
- **`transport.ts`** — Custom bridge-backed values can round-trip as real classes instead of collapsing into plain JSON when the worker boundary needs richer types. ([link](/docs/transport-file))
- **Multi-worker config references** — `ref()` and service bindings let one worker depend on another explicitly so config, generated types, local tests, and compiled output all follow the same relationship. ([link](/docs/multi-workers))
- **Preview scopes and preview bindings** — Preview environments can get their own scoped bindings and disposable infrastructure instead of borrowing production resources and hoping everyone remembers that later. ([link](/docs/config-previews))
- **Generated types** — Generate `env.d.ts` and typed service contracts from the config so the worker surface, bindings, and entrypoints stay aligned with the app you actually run. ([link](/docs/generated-types))
- **Binding-aware deploys** — Build, preview, and production commands compile the same binding-aware config into Wrangler-compatible output instead of making you maintain a second deploy-only definition. ([link](/docs/production-deploys))
- **`.env` config-time variables** — Devflare reads `.env` while evaluating `devflare.config.*`, which keeps build-time inputs available without blurring them together with runtime `vars` and `secrets`. ([link](/docs/config-basics))
- **Full Vite support** — If the package is genuinely a Vite app, Devflare plugs into Vite as the outer host while still keeping worker-aware config, bindings, and generated Cloudflare output aligned underneath it. ([link](/docs/vite-standalone))

> **Tip — This is the real distinction**
>
> Cloudflare gives you the platform primitives. Devflare adds the authored config model, runtime helpers, bridge-backed local dev, test harnesses, typed generation, and preview-aware workflows that make those primitives feel like one coherent application story.

> **Important — Composable infrastructure is intentional**
>
> Devflare is designed around small, explicit files and runtime surfaces: `src/fetch.ts`, `src/queue.ts`, `src/do/**/*.ts`, route modules, and runtime APIs that let those pieces compose cleanly instead of collapsing into one monolithic worker file.
>
> That same shape works for a tiny project and for a larger enterprise repo. You can keep responsibilities split by surface, file, and package without losing the thread of one coherent Cloudflare application.
>
> Want to see the package and repo shape Devflare is optimized for? [Open the project architecture guide](/docs/project-architecture)

#### What you get on day one

##### Steps

1. Author one readable `devflare.config.ts` instead of reverse-engineering a generated deployment shape.
2. Point `files.fetch` at one small handler and let Devflare manage the worker-oriented plumbing around it.
3. Generate `env.d.ts` so bindings and helper surfaces stay typed without hand-maintained drift.
4. Use the built-in test harness so your first tests look like the runtime you will actually ship.
5. Add routes, bindings, frameworks, or preview flows only when the package truly needs them.

> **Tip — The point is fast confidence, not more ceremony**
>
> If Devflare is helping, your first win should be a small Worker you can understand, run, and test quickly — not a larger setup burden.

##### Example — The smallest Devflare project still looks like a real project

Two authored files teach the whole loop, while generated pieces stay visible without becoming your source of truth.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})
```

###### File — src/fetch.ts

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(url.pathname === '/' ? 'Hello from Devflare' : url.pathname)
}
```

#### Where it keeps paying off later

##### Key points

- The package surface stays split by job as the app grows, so config authoring, runtime code, tests, framework hooks, and Cloudflare operations do not collapse into one file or one import path.
- Rolldown keeps owning worker and Durable Object compilation, which is why the app can grow new surfaces without hand-maintaining a giant entrypoint.
- If the package later needs Vite or SvelteKit, Devflare layers that in as an outer host and uses the bridge-backed platform surface so framework endpoints can still interact with worker bindings in local dev.
- Preview scopes, cleanup flows, production operations, and testing helpers stay connected to the same authored config and CLI instead of branching into separate half-documented workflows.

---

### Build your first Devflare worker with the smallest safe setup

> Start with one config file, one fetch handler, and generated types before you branch into routes, bindings, frameworks, or a deeper test setup.

| Field | Value |
| --- | --- |
| Route | [`/docs/first-worker`](/docs/first-worker) |
| Group | Quickstart |
| Navigation title | Your first worker |
| Eyebrow | First setup |

This page keeps the first pass tiny: explicit `files.fetch`, one small handler, and just enough commands to install Devflare, generate types, and run the worker locally.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | New packages and first-time Devflare users |
| Smallest safe shape | One config and one fetch handler |
| First commands | `bun add -d devflare`, then `types`, then `dev` |

#### Get started

##### Steps

1. Run `bun add -d devflare`.
2. Create `devflare.config.ts` with an explicit fetch entry.
3. Add `src/fetch.ts` with one event-first handler.
4. Run `devflare types` before guessing env types by hand.
5. Run `devflare dev` and make sure the smallest worker works before you add anything else.

##### Example — Install Devflare and boot the worker

```bash
bun add -d devflare
bunx --bun devflare types
bunx --bun devflare dev
```

##### Example — Start with two files, not a framework maze

Open the config first, then the fetch handler. That is enough to run, test, and understand before you add anything bigger.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})
```

###### File — src/fetch.ts

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(url.pathname === '/' ? 'Hello from Devflare' : url.pathname)
}
```

#### Start building

Pick the next thing you actually need once the first worker is running.

##### Highlights

- **Write your first unit test** — Use the built-in harness before you invent mocks or wrappers. ([link](/docs/first-unit-test))
- **Try your first bindings** — Make one Durable Object, one R2 bucket, or one browser-backed route work without overcomplicating the package. ([link](/docs/first-bindings))
- **Need multiple URLs?** — Add `src/routes/**` when a route tree is easier to reason about than one large fetch handler. ([link](/docs/http-routing))
- **Need storage choices?** — Choose between KV, D1, R2, and Hyperdrive before you open the binding guide that owns the details. ([link](/docs/storage-bindings))
- **Need state or background work?** — Use the state and async patterns page to decide between Durable Objects, queues, or a mix of both. ([link](/docs/durable-objects-and-queues))
- **Need worker composition?** — Use service bindings and `ref()` when another worker boundary is real, not just when one file feels crowded. ([link](/docs/multi-workers))
- **Need a framework host?** — Only opt into Vite-backed mode when the current package actually has a local Vite or framework app. ([link](/docs/vite-standalone))

---

### Write your first unit test with the built-in Devflare harness

> Take the same starter worker from the previous page and add one request test through `createTestContext()` so the first check uses the same runtime shape the worker will actually run.

| Field | Value |
| --- | --- |
| Route | [`/docs/first-unit-test`](/docs/first-unit-test) |
| Group | Quickstart |
| Navigation title | Your first unit test |
| Eyebrow | Testing |

You do not need a custom mock stack to get confidence. Keep `devflare.config.ts` and `src/fetch.ts` as they were, add one `tests/fetch.test.ts` file, and prove the worker responds once.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | The first runtime-shaped test in a new worker package |
| Main helper | `createTestContext()` plus `cf.worker.get()` |
| First proof | One request, one status check, one response assertion |

#### Write one honest test

The easiest continuation from the first worker page is not a refactor. It is one new test file beside the same config and fetch handler.

`createTestContext()` gives that test the same runtime shape Devflare manages locally. Keep the first assertion narrow: one request, one status check, one response body. That already proves the worker, the harness, and your local setup are all talking to each other correctly.

> **Tip — Keep the first test boring on purpose**
>
> If the first test is obvious, failures are obvious too. That is exactly what you want while the worker is still tiny.

##### Example — Keep the first worker, add one test file

The config and fetch handler stay exactly the same. The only new authored file is the test.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})
```

###### File — src/fetch.ts

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(url.pathname === '/' ? 'Hello from Devflare' : url.pathname)
}
```

###### File — tests/fetch.test.ts

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('hello-worker', () => {
	test('GET / returns text', async () => {
		const response = await cf.worker.get('/')
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('Hello from Devflare')
	})
})
```

#### What this unlocks next

##### Key points

- You can keep the same harness when the worker grows routes, queue consumers, scheduled handlers, or other runtime surfaces.
- One request-level smoke test is still useful even after helpers and abstractions appear around the worker.
- When you need the deeper test surface, open `/docs/create-test-context` for the full helper map.

> **Note — The next docs page when tests grow up**
>
> Use `create-test-context` when you need more than one request test and want the full runtime helper surface laid out clearly.

---

### Try your first bindings by growing the same worker one route at a time

> Take the same starter worker, split it into routes and helpers, then add one binding-backed route at a time so `src/fetch.ts` can stay small.

| Field | Value |
| --- | --- |
| Route | [`/docs/first-bindings`](/docs/first-bindings) |
| Group | Quickstart |
| Navigation title | Your first bindings |
| Eyebrow | Bindings |

Keep one worker shape throughout: a tiny `src/fetch.ts`, a `src/routes/**` tree for leaf handlers, and one shared helper module that can read or write the active request context through `devflare/runtime` when that keeps the code cleaner.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Growing the first worker without turning `src/fetch.ts` into one crowded file |
| Base shape | Tiny `src/fetch.ts` plus `src/routes/**` and shared helpers |
| Habit to keep | `bunx --bun devflare types` after binding changes |

#### Keep the same worker, but split it into routes and helpers

The additive move after the first worker is not a different app. It is the same worker with one tiny fetch entry, one route tree, and one shared request helper.

Once the first worker responds and maybe already has one small test, the next step is to keep `src/fetch.ts` tiny. Let it do request-wide setup, then let `src/routes/**` own the individual URLs.

That shape also makes Devflare's AsyncLocalStorage-backed runtime helpful in a calm way: helper modules can read the active request path, route params, request body, or request id through `getFetchEvent()` and `locals` without turning every function signature into plumbing.

##### Highlights

- **Durable Object** — Add one counter route that forwards to one object class and keeps state there.
- **R2 bucket** — Add one route that stores and reads one named file without bloating the global fetch file.
- **Browser Rendering** — Add one route that opens a page and returns its title so the browser binding stays obvious.

##### Steps

1. Keep `src/fetch.ts` for request-wide setup only.
2. Add `files.routes` so the route tree is explicit in config.
3. Move URL-specific work into `src/routes/**` files.
4. Put shared request helpers in `src/lib/**` and let them read active request context from `devflare/runtime` when that keeps route files cleaner.
5. Add one binding-backed route at a time instead of rebuilding the worker from scratch.

> **Tip — This is still the same worker**
>
> You are not swapping architectures here. You are just letting `src/fetch.ts` stay small while routes and helpers take the extra responsibility.

##### Example — Keep the same worker, but let routes and helpers do the growing

The fetch file stays tiny. Routes own URLs, and one helper module reads and writes the active request context through Devflare runtime when you need it.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	}
})
```

###### File — src/fetch.ts

```ts
import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'
import { rememberRequest } from './lib/request-context'

async function requestContext(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	rememberRequest()
	return resolve(event)
}

export const handle = sequence(requestContext)
```

###### File — src/lib/request-context.ts

```ts
import { getFetchEvent, locals } from 'devflare/runtime'

export function rememberRequest(): void {
	locals.requestId = crypto.randomUUID()
}

export function activeRequestPath(): string {
	return getFetchEvent().url.pathname
}

export function activeRequestId(): string {
	return String(locals.requestId)
}

export function activeRouteParam(name: string): string {
	return getFetchEvent().params[name]
}

export async function activeRequestText(): Promise<string> {
	return getFetchEvent().request.text()
}
```

###### File — src/routes/index.ts

```ts
import { activeRequestId, activeRequestPath } from '../lib/request-context'

export async function GET(): Promise<Response> {
	return Response.json({
		message: 'Hello from Devflare',
		path: activeRequestPath(),
		requestId: activeRequestId()
	})
}
```

#### Add one Durable Object-backed route

Keep the same route-based worker and add one counter route, one transport file, and one object class.

Use the same `src/fetch.ts`, the same request helper, and the same route tree. The new work lives in one route file that talks to one Durable Object namespace through a custom `increment()` method.

That keeps the route honest: the HTTP path stays in `src/routes/counter.ts`, the stateful method stays in `src/do/counter.ts`, and `src/transport.ts` restores the returned value object cleanly on the worker side.

> **Note — Why this is a good first Durable Object**
>
> It proves binding lookup, object identity, route-to-object flow, and persisted state without turning the whole worker into object-specific plumbing.

##### Example — Same worker, now add a counter route, transport, and one Durable Object

The familiar fetch file and helper stay in place. You add the binding config, one transport file, the counter route, and the object class that exposes a custom `increment()` method.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		},
		transport: 'src/transport.ts',
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: 'Counter'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['Counter']
		}
	]
})
```

###### File — src/routes/counter.ts

```ts
import { env } from 'devflare'
import { activeRequestId, activeRequestPath } from '../lib/request-context'

export async function GET(): Promise<Response> {
	const id = env.COUNTER.idFromName('global')
	const counter = env.COUNTER.get(id)
	const count = await counter.increment()

	return Response.json({
		count: count.value,
		double: count.double,
		path: activeRequestPath(),
		requestId: activeRequestId()
	})
}
```

###### File — src/transport.ts

```ts
import { CounterValue } from './lib/counter-value'

export const transport = {
	CounterValue: {
		encode: (value: unknown) =>
			value instanceof CounterValue ? value.value : false,
		decode: (value: number) => new CounterValue(value)
	}
}
```

###### File — src/lib/counter-value.ts

```ts
export class CounterValue {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double(): number {
		return this.value * 2
	}
}
```

###### File — src/do/counter.ts

```ts
import { DurableObject } from 'cloudflare:workers'
import { CounterValue } from '../lib/counter-value'

export class Counter extends DurableObject<DevflareEnv> {
	async increment(amount: number = 1): Promise<CounterValue> {
		const count = Number((await this.ctx.storage.get('count')) ?? 0) + amount
		await this.ctx.storage.put('count', count)
		return new CounterValue(count)
	}
}
```

#### Add one R2-backed route

Keep the same worker shape and let one route file own the bucket round-trip.

Here the route path becomes the obvious home for the binding: `src/routes/files/[name].ts` owns both the `PUT` and `GET` flow for one named object.

The shared helper still provides request-wide context, route params, and request reads through AsyncLocalStorage, while the route file keeps the bucket contract visible and local to the URL that needs it.

> **Important — Why this is a good first R2 route**
>
> It proves route params, the bucket binding, and a clean read/write boundary without teaching a giant upload architecture before the first success.

##### Example — Same worker, now add one file route and one bucket binding

The global fetch file stays tiny. The new work lives in one route file under `src/routes/files/[name].ts`, while the helper module still reads the active request through AsyncLocalStorage-backed runtime helpers.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	},
	bindings: {
		r2: {
			FILES: 'quickstart-files'
		}
	}
})
```

###### File — src/routes/files/[name].ts

```ts
import { env } from 'devflare'
import {
	activeRequestPath,
	activeRequestText,
	activeRouteParam
} from '../../lib/request-context'

export async function PUT(): Promise<Response> {
	const key = activeRouteParam('name')
	await env.FILES.put(key, await activeRequestText())

	return Response.json({
		stored: key,
		path: activeRequestPath()
	}, {
		status: 201
	})
}

export async function GET(): Promise<Response> {
	const key = activeRouteParam('name')
	const object = await env.FILES.get(key)
	if (!object) {
		return new Response('Not found', { status: 404 })
	}

	const response = new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'text/plain; charset=utf-8'
		}
	})
	response.headers.set('x-devflare-path', activeRequestPath())
	return response
}
```

#### Add one browser-backed route

Keep the same worker shape and let one route prove the browser binding.

Browser Rendering gets simpler when it looks like the other examples: the shared fetch file stays untouched, and one route file owns the browser work.

Install `@cloudflare/puppeteer` before you try this route, and remember that Devflare currently supports exactly one browser binding in config.

> **Warning — Keep the first browser path skinny**
>
> One title read is enough to prove the binding. Save screenshots, PDFs, and longer browser workflows for the next pass once the launch path is already trustworthy.

##### Example — Same worker, now add one browser-backed route

The route tree grows by one file, and the helper still gives that route access to request-scoped context without bloating `src/fetch.ts`.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes'
		}
	},
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})
```

###### File — src/routes/page-title.ts

```ts
import puppeteer from '@cloudflare/puppeteer'
import { env } from 'devflare'
import { activeRequestId } from '../lib/request-context'

export async function GET(): Promise<Response> {
	const browser = await puppeteer.launch(env.BROWSER as Parameters<typeof puppeteer.launch>[0])

	try {
		const page = await browser.newPage()
		await page.goto('https://example.com/', { waitUntil: 'load' })
		return Response.json({
			title: await page.title(),
			requestId: activeRequestId()
		})
	} finally {
		await browser.close()
	}
}
```

#### Go deeper when the first quick win works

Once one tiny example works locally, jump to the dedicated binding guides for the bigger caveats, testing patterns, and architecture choices.

##### Highlights

- **Durable Objects guide** — Read the fuller guidance on stateful objects, migrations, previews, and local testing. ([link](/docs/durable-object-binding))
- **R2 guide** — Open the deeper R2 page for delivery boundaries, testing patterns, and storage architecture choices. ([link](/docs/r2-binding))
- **Browser Rendering guide** — Open the browser guide when you need the single-binding caveat, dev-server details, or heavier browser workflows. ([link](/docs/browser-binding))

---

### Deploy one preview on purpose, then delete it cleanly when you are done

> Take the same starter worker and ship one named preview on purpose, then remove that same preview scope cleanly when you are done.

| Field | Value |
| --- | --- |
| Route | [`/docs/deploy-and-preview`](/docs/deploy-and-preview) |
| Group | Quickstart |
| Navigation title | Deploy and Preview |
| Eyebrow | Ship it |

The project tree does not need to become more complicated for the first deploy. Use the same small worker, one memorable preview name, and one equally explicit cleanup command.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | The first named preview deploy and cleanup loop |
| Preview command | `bunx --bun devflare deploy --preview <name>` |
| Cleanup command | `bunx --bun devflare previews cleanup-resources --scope <name> --apply` |

#### Deploy a named preview

Named previews are the easiest first deploy shape because the destination is obvious in the command itself and the same name can follow the preview through CI, cleanup, and review.

If the first worker runs locally and your first test already passed, the project is ready for a simple preview loop. You do not need a new framework layer or a bigger repo ritual first.

Pick one preview name such as `next` or `pr-123`. Then deploy with `--preview <name>` so the preview target is visible in your shell history and logs.

##### Steps

1. Finish the worker or app locally and make sure `bunx --bun devflare dev` already works.
2. Pick a preview scope name such as `next` or `pr-123`.
3. Run the explicit preview deploy command.
4. Open the preview and confirm the smallest important path works before you automate anything bigger.

> **Tip — Explicit is the point**
>
> If the command says `--preview next`, you already know where it is going. That clarity is the whole reason the CLI insists on explicit deploy targets.

##### Example — Deploy the same starter worker as a named preview

The active file is just the command transcript. The project tree is still the same small worker from the earlier quickstart pages.

###### File — preview-command.sh

```bash
bunx --bun devflare build --env preview
bunx --bun devflare deploy --preview next
```

#### Delete the preview when it is done teaching you something

Preview cleanup should use the same scope name you deployed with. That keeps teardown reviewable and stops preview-only resources from lingering just because nobody remembers the exact branch name later.

If the preview owns preview-only resources, `cleanup-resources` is the quickest way to remove them. Use the exact same scope string you deployed with so the target stays unmistakable.

If you later need richer lifecycle management, the dedicated preview operations docs cover retire, reconcile, and broader cleanup. For the first loop, resource cleanup is enough to understand the shape.

##### Key points

- Reuse the same preview scope name you deployed with.
- Keep cleanup commands explicit so logs clearly show what is being removed.
- If the preview becomes a real recurring workflow, move that command into CI instead of relying on team memory.

> **Warning — Delete previews on purpose too**
>
> Preview environments get messy when deploys are automated but cleanup rules live only in people’s heads. Use the same explicit naming discipline for teardown that you used for deploy.

##### Example — Clean up the same named preview

The cleanup command should feel like the mirror image of the deploy command: same project, same scope name, same explicit target.

###### File — cleanup-preview.sh

```bash
bunx --bun devflare previews cleanup-resources --scope next --apply
```

#### What to read next

Once the first preview loop works, jump to the deeper docs for production deploy rules and GitHub automation.

When this local preview loop is ready to leave your shell history and become reviewable automation, continue with `github-workflows`. That page maps the exact `.github/workflows/*.yml` files this repo uses for PR comments, branch previews, production deploys, and cleanup.

##### Highlights

- **Production deploys** — Read the deeper guide for explicit production targets, preflight checks, and deploy inspection habits. ([link](/docs/production-deploys))
- **GitHub workflows** — Continue with the repo-backed workflow guide when you want this preview loop to become PR comments, branch previews, production deploys, and cleanup jobs under `.github/workflows`. ([link](/docs/github-workflows))

---

### Treat `devflare` as one documented CLI, not a bag of one-off shell snippets

> Start at `devflare --help`: the root page already maps local dev, inspection, deploy intent, account inventory, preview lifecycle, production control, token management, AI pricing, and remote-mode operations in one place.

| Field | Value |
| --- | --- |
| Route | [`/docs/devflare-cli`](/docs/devflare-cli) |
| Group | Devflare |
| Navigation title | CLI |
| Eyebrow | Command surface |

Devflare’s CLI is the public control surface for the same authored config model the docs site describes. Most packages live in the boring `types → dev → build → deploy` loop, but the CLI also owns the surrounding control plane. Learn the root commands once, then drill into `devflare help <command>` or nested `--help` pages when one family goes deeper.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Everyday dev, config inspection, explicit deploys, and the Cloudflare control-plane work around those deploys |
| Fastest orientation | `bunx --bun devflare --help` |
| Help depth | `devflare help <command> [subcommand]` |
| Safest habit | Run commands from the package that owns the `devflare.config.*` you mean to resolve |

#### Start with the root help page, then drill down

The root help page is not just a banner and a couple of examples. It is the best quick map of the whole CLI: core dev commands, deploy intent, inspection tools, and the deeper control-plane families all show up there first.

From there, the CLI keeps the same shape all the way down. `devflare help deploy` and `devflare deploy --help` resolve to the same detailed guide, and nested families such as `previews` or `productions` keep going with their own subcommand help instead of forcing you to remember a maze of ad-hoc commands.

##### Key points

- Use the root help first when you are not sure which command family owns the job.
- Use command-specific help when the job is already obvious but the option vocabulary is not.
- Use nested help for the control-plane families that have real subcommand trees instead of pretending one page can explain them all.

> **Note — The docs page should mirror the help tree**
>
> If the built-in help already describes the command surface cleanly, the docs page should explain that structure instead of flattening everything back into four example commands.

##### Example — Use the built-in help tree as the CLI map

```bash
bunx --bun devflare --help
bunx --bun devflare help deploy
bunx --bun devflare previews --help
bunx --bun devflare previews cleanup-resources --help
bunx --bun devflare productions rollback --help
```

#### Know what each root command family owns

##### Reference table

| Command | Primary job | What the deeper help covers |
| --- | --- | --- |
| `init` | Scaffold a new package. | Template choice and generated starter scripts. |
| `dev` | Start local development. | Worker-only defaults, Vite auto-detection, logging, and persistence. |
| `build` | Compile deploy-ready artifacts. | Environment resolution and Wrangler-facing output. |
| `deploy` | Ship explicitly to production or preview. | Target selection, dry runs, preview naming, messages, and tags. |
| `types` | Generate `env.d.ts` and typed bindings. | Custom output paths plus entrypoint and Durable Object discovery. |
| `doctor` | Check local project health. | Config, package, TypeScript, Vite, and generated artifact diagnostics. |
| `config` | Print resolved config. | `print`, raw Devflare JSON, or compiled Wrangler JSON. |
| `account` | Inspect Cloudflare account inventories and limits. | Resource lists, usage limits, and interactive global/workspace selection. |
| `login` | Authenticate with Cloudflare via Wrangler. | `--force` behavior and reuse of existing sessions. |
| `previews` | Operate on preview lifecycle state. | `bindings`, `provision`, `reconcile`, `cleanup`, `retire`, and `cleanup-resources`. |
| `productions` | Inspect and mutate live production state. | `versions`, `rollback`, and `delete`. |
| `worker` | Run Worker control-plane operations. | Currently `rename`, plus config-sync expectations. |
| `tokens` | Manage Devflare-managed account-owned API tokens. | List, create, roll, delete, and the legacy `token` alias. |
| `ai` | Print the bundled Workers AI pricing snapshot. | Read-only pricing surface; verify current rates in Cloudflare docs when it matters. |
| `remote` | Toggle remote test mode for paid features. | `status`, `enable`, and `disable`. |
| `help` | Render root or command-specific help. | Nested help resolution for command families and subcommands. |
| `version` | Print the installed version. | Same information as the global `--version` flag. |

#### Learn the shared option vocabulary once

The root help page also teaches the common option vocabulary. That matters because not every command supports every option, but the meaning stays consistent when the option exists.

If you already know what `--config`, `--env`, `--debug`, and `--help` mean, the command-specific help pages get much easier to scan.

##### Key points

- `--env` is meaningful only on commands that actually resolve config environments.
- `--help` is not a fallback after confusion; it is the intended first stop for a new command family.
- When in doubt about which config file is being resolved, make `--config` explicit instead of trusting directory luck.

##### Reference table

| Option | What it means | Where it matters most |
| --- | --- | --- |
| `--config <path>` | Pick the exact `devflare.config.*` file to resolve. | `build`, `deploy`, `types`, `doctor`, `config`, `previews`, `productions`, and `worker rename`. |
| `--env <name>` | Resolve `config.env[name]` before the command runs. | `build`, `config`, preview-aware inspection, and production discovery flows. |
| `--debug` | Print stack traces and extra debug output. | Build, deploy, type generation, and other failure-heavy paths. |
| `--no-color` | Disable ANSI color output. | CI logs, copied transcripts, or plain-text debugging. |
| `-h, --help` | Show the detailed help page for the current command path. | Every root command and nested subcommand surface. |
| `-v, --version` | Print the installed version and exit. | Root invocation when you need to verify the installed package quickly. |

#### Use the root page as the map, then let deeper pages own the sharp edges

The root CLI page should tell you which family exists and what it is broadly for. Once a command starts operating on preview lifecycle, live production, account context, tokens, or paid-test gates, the sharper behavior belongs on the dedicated operations pages instead of being re-explained here in parallel.

Use the built-in help for exact flags, then use the docs pages below for the operational safety rules and workflow context around those command families.

##### Highlights

- **Control-plane operations** — Open this page for account selection, live production inspection, rollback or delete posture, worker rename, token bootstrap, and remote-mode gates. ([link](/docs/control-plane-operations))
- **devflare/cloudflare** — Open this page when a script or tool should use the same account, registry, usage, and token helpers the CLI builds on. ([link](/docs/cloudflare-api))
- **Preview operations** — Open this page when the question is preview registry inspection, reconciliation, retirement, or resource cleanup. ([link](/docs/preview-operations))
- **Production deploys** — Open this page when the question is the deploy target and preflight inspection rather than later control-plane changes. ([link](/docs/production-deploys))

##### Key points

- Use `account`, `productions`, `worker`, `tokens`, and `remote` when you are operating real Cloudflare state instead of just building locally.
- Use `previews` when the job is preview lifecycle rather than day-to-day package development.
- Treat nested `--apply` flows as command families that deserve both built-in help and the dedicated docs page before you run them.

> **Warning — The sharp edges live one level deeper**
>
> `previews cleanup-resources`, `previews retire`, `productions rollback`, and `productions delete` all carry behavior and safety notes that are too specific for the root CLI map. Read their help and the dedicated docs page before treating them as copy-paste habits.

#### Most packages still live in one boring, reliable command loop

The most useful Devflare loop is intentionally repetitive: refresh generated types when bindings move, run local dev, inspect build output when the shape changes, and deploy with an explicit preview or production target.

That loop stays the same whether the package is worker-only or Vite-backed. The config decides the host; the command vocabulary stays familiar.

When the job changes from building to operating, switch command families instead of inventing ad-hoc command snippets: `config` and `doctor` for inspection, `previews` for preview lifecycle, `productions` for live production state, and `account` for inventory questions.

##### Key points

- Run `types` after binding or entrypoint changes so `env.d.ts` stays honest.
- Run `build` or `config print --format wrangler` when the compiled shape matters more than the dev server feeling healthy.
- Keep preview and production intent explicit in the final deploy command instead of hiding it in a generic script name.
- Use the nested help pages when a lifecycle command reaches `--apply`, account selection, rollback, or cleanup territory.

##### Example — A good everyday command loop

```bash
bunx --bun devflare types
bunx --bun devflare dev
bunx --bun devflare build --env staging
bunx --bun devflare deploy --preview next
bunx --bun devflare deploy --prod
```

##### Example — When the setup feels suspicious, inspect before you improvise

```bash
bunx --bun devflare config print --format wrangler
bunx --bun devflare doctor
bunx --bun devflare previews bindings --scope next
bunx --bun devflare productions versions
```

#### Use the inspection and lifecycle commands before you improvise command snippets

##### Highlights

- **`config print`** — Best when you need to see the resolved Devflare config or compiled Wrangler-facing shape before trusting a build or deploy.
- **`doctor`** — Best when config resolution, generated artifacts, or local Vite detection feel hard to trace and need a sharper diagnostic pass.
- **`previews` / `productions`** — Best when the question is no longer “can I deploy?” but “what exists right now, and what should I retire, roll back, or inspect?”

> **Warning — Keep commands package-local**
>
> Run Devflare from the package that owns the config you actually mean to resolve. In monorepos, Turbo can decide what changed, but package-local `devflare` commands still decide what gets built, deployed, reconciled, or cleaned up.

---

### Structure Devflare projects around one authored config, explicit runtime files, and package-local deploy ownership

> This is the practical answer to “what does a real Devflare project look like on disk?” — from a small worker package, to a multi-surface app, to a hosted SvelteKit package, to a Bun monorepo with several deployable workers.

| Field | Value |
| --- | --- |
| Route | [`/docs/project-architecture`](/docs/project-architecture) |
| Group | Devflare |
| Navigation title | Project Architecture |
| Eyebrow | Project setup |

Devflare projects stay readable when the package boundary is obvious, the authored files stay separate from generated output, and each runtime surface owns its own file. This page maps the common file types, then shows a few real project shapes from this repository so you can set up your package on purpose instead of accumulating conventions by accident.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Teams deciding how to lay out a new Devflare package or a multi-package workspace before file structure gets noisy |
| Primary authored file | `devflare.config.ts` in each deployable package |
| Generated files | `env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**` |
| Monorepo rule | Validate from the root, but deploy from the package that owns the config |

#### Start with authored files, and treat generated files as output

The first architecture decision is not “which framework?” It is usually “which files in this package are actually authored source of truth?” In Devflare, the stable answer is that `devflare.config.ts`, `package.json`, and your runtime files are authored; generated Wrangler-facing files and generated types are downstream outputs.

That split is what keeps the project reviewable. If a file describes package intent or runtime behavior, author it directly. If a file is emitted by Devflare, a framework adapter, or Wrangler preparation, treat it as disposable output and regenerate it when the source changes.

##### Reference table

| Path or pattern | Own it when | What it means |
| --- | --- | --- |
| `devflare.config.ts` | Every deployable package | The authored Devflare source of truth for files, bindings, env overlays, previews, and deployment posture. |
| `package.json` | Every package | Package-local scripts, dependencies, and the command loop that should run from that package. |
| `src/fetch.ts` | The package owns request-wide HTTP behavior | The main worker entry for broad middleware or request handling. |
| `src/routes/**` | The package uses file-based HTTP leaves | URL-specific route handlers that sit beside, or replace, one large fetch file. |
| `src/queue.ts`, `src/scheduled.ts`, `src/email.ts` | The package consumes those platform events | Separate event surfaces instead of burying background logic inside fetch code. |
| `src/do/**/*.ts` | The package owns Durable Object classes | Stateful classes discovered and bundled through config. |
| `src/ep/**/*.ts` | The package exposes named worker entrypoints | Classes discovered for typed `ref().worker(...)` service boundaries. |
| `src/workflows/**/*.ts` | The package owns workflow definitions | Additional discovered runtime modules that stay explicit in config review. |
| `src/transport.ts` | Local RPC-style bridge calls must preserve custom values | Custom encode/decode rules for local bridge-backed calls, most often in tests or Durable Object method round-trips. |
| `env.d.ts` | You run `devflare types` | Generated binding and entrypoint types. Do not hand-edit it. |
| `vite.config.ts`, `svelte.config.js`, `src/routes/+page.svelte` | The package is a hosted Vite or SvelteKit app | Host-app files that sit around the Devflare worker story instead of replacing it. |
| `.devflare/**`, `.wrangler/deploy/**` | Devflare has built, checked, or prepared deploy output | Generated build and deploy artifacts. Useful to inspect, not the authored architecture. |

> **Tip — A good architecture rule**
>
> If the file describes package intent, author it. If the file exists because Devflare or a host tool generated it, inspect it when needed but keep the authored source elsewhere.

#### A worker-first package can stay small for a long time

A healthy Devflare package can start with one config file, one `src/fetch.ts`, one route tree, and one small test. That already gives you package-local scripts, generated types, generated deploy output, and room to grow without forcing a framework or a monorepo strategy on day one.

The point of this shape is not minimalism for its own sake. It is that the package boundary stays obvious: the package owns its config, owns its worker files, and can be built or deployed without pretending the whole repo is one worker.

##### Key points

- Keep the package-local command loop in `package.json` so `types`, `dev`, `build`, and `deploy` always resolve the right config.
- Keep `src/fetch.ts` request-wide and let `src/routes/**` own the URL-specific work once there is more than one leaf.
- Expect `env.d.ts`, `.devflare/**`, and `.wrangler/deploy/**` to appear as generated outputs after the normal command loop runs.

##### Example — Small worker package with one config, one fetch file, one route tree, and generated output kept in its lane

###### File — package.json

```json
{
	"name": "notes-api",
	"private": true,
	"type": "module",
	"scripts": {
		"types": "bunx --bun devflare types",
		"dev": "bunx --bun devflare dev",
		"build": "bunx --bun devflare build",
		"deploy": "bunx --bun devflare deploy"
	},
	"devDependencies": {
		"devflare": "workspace:*"
	}
}
```

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})
```

###### File — src/fetch.ts

```ts
import { sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()
	return resolve(event)
}

export const handle = sequence(requestId)
```

###### File — src/routes/health.ts

```ts
export async function GET(): Promise<Response> {
	return Response.json({ ok: true })
}
```

#### One package can own many runtime files without becoming a monolith

This is where Devflare architecture becomes more interesting than “one fetch file.” A single package can still own HTTP, route modules, queue work, scheduled jobs, email handlers, Durable Objects, named entrypoints, workflows, and transport rules — as long as each surface keeps its own file and the config names those surfaces honestly.

That is also why the `files.*` lane matters so much. It is not busywork. It is the map of which runtime surfaces the package actually owns.

##### Reference table

| File lane | Why it exists |
| --- | --- |
| `src/fetch.ts` | Request-wide middleware and the outer HTTP trail. |
| `src/routes/**` | Leaf handlers that mirror URLs instead of bloating the global fetch file. |
| `src/queue.ts`, `src/scheduled.ts`, `src/email.ts` | Background and platform-triggered event surfaces with their own runtime contracts. |
| `src/do/**/*.ts` | Stateful Durable Object classes discovered and bundled through config. |
| `src/ep/**/*.ts` | Named worker entrypoints for typed cross-worker boundaries. |
| `src/workflows/**/*.ts` | Workflow definitions discovered as part of the package runtime shape. |
| `src/transport.ts` | Local bridge serialization only when custom values need to survive a bridge-backed call. |

> **Warning — Not every package should own every file type**
>
> The point is explicit ownership, not maximal surface area. Add each runtime file only when the package really owns that event or discovery lane.

##### Example — A single package with all the main worker-owned file types visible on disk

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'workspace-app',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts',
		entrypoints: 'src/ep/**/*.ts',
		workflows: 'src/workflows/**/*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		durableObjects: {
			SESSION_ROOM: 'SessionRoom'
		},
		queues: {
			producers: {
				EMAILS: 'workspace-emails'
			},
			consumers: [
				{
					queue: 'workspace-emails'
				}
			]
		}
	},
	triggers: {
		crons: ['0 */6 * * *']
	}
})
```

###### File — src/queue.ts

```ts
import type { QueueEvent } from 'devflare/runtime'

export async function queue({ messages }: QueueEvent): Promise<void> {
	for (const message of messages) {
		console.log('processing job', message.id)
	}
}
```

###### File — src/do/session-room.ts

```ts
import { DurableObject } from 'cloudflare:workers'

export class SessionRoom extends DurableObject<DevflareEnv> {
	async fetch(request: Request): Promise<Response> {
		return new Response('room:' + new URL(request.url).pathname)
	}
}
```

#### Hosted apps add Vite or SvelteKit around the worker, not instead of it

The docs app in this repo is the simplest real example of a hosted package: it has `package.json`, `devflare.config.ts`, `vite.config.ts`, `svelte.config.js`, Svelte route files, and static assets. Devflare still owns the Cloudflare-facing config and generated Wrangler output, while Vite and SvelteKit own the host-app shell.

The repo also includes a fuller SvelteKit case that points `files.fetch` at the generated Cloudflare worker output while still discovering Durable Objects and transport hooks from source. That is the important hosted-app lesson: the framework shell and the worker surfaces can coexist in one package when the file ownership stays explicit.

##### Key points

- Package-local host files like `vite.config.ts` and `svelte.config.js` belong beside the Devflare config, not in a separate orchestration package.
- Hosted apps can point at generated framework worker output, or they can mix that output with extra Devflare-owned surfaces like Durable Objects and transport hooks.
- The generated worker file still belongs on the generated side of the boundary; the authored source remains the config plus the source files that feed it.

##### Example — Real hosted app package from `apps/documentation`

###### File — apps/documentation/package.json

```json
{
	"name": "documentation",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "bun run llm:generate && bunx --bun devflare dev",
		"build": "bun run llm:generate && bunx --bun devflare build",
		"deploy": "bun run llm:generate && bunx devflare deploy",
		"types": "bunx --bun devflare types"
	},
	"devDependencies": {
		"devflare": "workspace:*",
		"vite": "^8",
		"@sveltejs/kit": "^2"
	}
}
```

###### File — apps/documentation/devflare.config.ts

```ts
import { defineConfig } from '../../packages/devflare/src/config-entry'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

export default defineConfig({
	name: 'devflare-docs',
	compatibilityDate: '2026-04-08',
	files: {
		fetch: false
	},
	previews: {
		includeCrons: false
	},
	accountId,
	assets: {
		binding: 'ASSETS',
		directory: '.adapter-cloudflare'
	},
	wrangler: {
		passthrough: {
			main: '.adapter-cloudflare/_worker.js'
		}
	}
})
```

###### File — apps/documentation/vite.config.ts

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from '../../packages/devflare/src/vite/index'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		devflarePlugin(),
		sveltekit()
	]
})
```

##### Example — Hosted SvelteKit package that still owns extra worker surfaces

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case18-sveltekit-full',
	files: {
		fetch: '.svelte-kit/cloudflare/_worker.js',
		durableObjects: 'src/do.*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		r2: {
			IMAGES: 'images-bucket'
		},
		d1: {
			DB: 'main-db'
		},
		durableObjects: {
			CHAT_ROOM: {
				className: 'ChatRoom'
			}
		}
	}
})
```

#### In a monorepo, Turbo orchestrates the workspace but packages still deploy themselves

This repository is the monorepo example. The root owns workspace scripts, workspaces, and Turbo task orchestration. But deployable packages still keep their own `devflare.config.ts` files and package-local commands. That is true for `apps/documentation`, `apps/testing`, sidecar workers under `apps/testing/workers/*`, and the smaller cases under `cases/*`.

That split is what keeps the monorepo honest. Root scripts decide what to validate or cache. Package-local Devflare commands decide what actually resolves, builds, deploys, or cleans up.

##### Steps

1. Use the repo root for Turbo build, test, check, and impacted-package orchestration.
2. Run `devflare` from the package that owns the config you actually mean to resolve.
3. Keep sidecar workers or service-bound packages as separate workspace packages with their own configs and scripts.
4. Reuse one preview scope across a worker family only after you have made the package boundaries explicit.

> **Warning — Turbo is not the deploy target**
>
> Turbo decides which packages need work. The package working directory still decides which `devflare.config.ts` gets built or deployed.

##### Example — The repo root orchestrates, but the packages still own deployment

###### File — package.json

```json
{
	"name": "devflare-monorepo",
	"private": true,
	"workspaces": [
		"apps/*",
		"apps/testing/workers/*",
		"packages/*",
		"cases/*"
	],
	"scripts": {
		"devflare:build": "turbo run build --filter=devflare --filter=documentation",
		"devflare:test": "turbo run test --filter=...devflare",
		"devflare:check": "turbo run check --filter=documentation",
		"devflare:ci": "bun run devflare:build && bun run devflare:test && bun run devflare:check"
	}
}
```

###### File — turbo.json

```json
{
	"tasks": {
		"build": {
			"dependsOn": ["^build"],
			"outputs": ["dist/**", ".devflare/**", ".wrangler/deploy/**", "env.d.ts"]
		},
		"test": {
			"dependsOn": ["^build", "transit"]
		},
		"check": {
			"dependsOn": ["^build", "transit"]
		}
	}
}
```

###### File — apps/testing/workers/auth-service/devflare.config.ts

```ts
import { defineConfig } from '../../../../packages/devflare/src/config-entry'

export default defineConfig({
	name: 'devflare-testing-auth-service',
	files: {
		fetch: 'src/worker.ts'
	}
})
```

##### Example — Good monorepo command split

```bash
# repo-root orchestration
bun run turbo build --filter=documentation
bun run devflare:check

# package-local deploy
cd apps/documentation
bun run deploy -- --preview next

# sidecar worker family
cd ../testing/workers/auth-service
bunx --bun devflare deploy --preview pr-123
```

#### Open the deeper page for the part of the architecture you are deciding next

##### Highlights

- **Need the file-surface rules?** — Open project shape when the next question is how many surfaces the package should actually own and which conventions should stay explicit. ([link](/docs/project-shape))
- **Need the event-surface map?** — Open worker surfaces when the real question is fetch versus queue versus scheduled versus email, or when the package has started owning more than one event family. ([link](/docs/worker-surfaces))
- **Need route layout next?** — Open the routing page when the package boundary is clear and the next decision is how `src/fetch.ts` and `src/routes/**` should split responsibility. ([link](/docs/http-routing))
- **Need generated types and entrypoints?** — Open generated types when the architecture includes bindings, named entrypoints, service refs, or Durable Objects that should land in `env.d.ts` honestly. ([link](/docs/generated-types))
- **Need the fuller monorepo workflow?** — Open the monorepo page when the next question is Turbo filters, CI workflow boundaries, or package-local deploy discipline across the workspace. ([link](/docs/monorepo-turborepo))

---

### Split request-wide middleware from route leaves so HTTP stays easy to read

> Use `src/fetch.ts` for request-wide behavior, `src/routes/**` for leaf handlers, and `files.routes` when you need a custom root, prefix, or route-only app.

| Field | Value |
| --- | --- |
| Route | [`/docs/http-routing`](/docs/http-routing) |
| Group | Devflare |
| Navigation title | Routing |
| Eyebrow | HTTP layer |

Devflare gives you a request-wide fetch entry and a built-in file router. The safest mental model is simple: keep broad middleware in `src/fetch.ts`, keep URL-specific behavior in `src/routes/**`, and reach for `files.routes` when the route tree needs custom mounting rules.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | HTTP apps that need middleware, route params, or a mounted route tree |
| Primary order | `src/fetch.ts` → same-module methods → matched route file |
| Route config | `files.routes` |

#### There are two HTTP layers on purpose

If `src/fetch.ts` exports `fetch` or `handle`, that module becomes the primary HTTP entry. Inside `resolve(event)`, Devflare checks same-module method handlers first and then dispatches to the matched route file when needed.

That ordering is what lets middleware stay global while route files remain the clean leaf-handler story.

##### Highlights

- **`src/fetch.ts`** — Use it for request-wide behavior that should apply before or after the final leaf handler runs.
- **`src/routes/**`** — Use it for specific URL handlers so the file tree mirrors the URLs you serve.

##### Steps

1. Devflare enters through `src/fetch.ts` when that file exports `fetch` or `handle`.
2. Inside `resolve(event)`, exact same-module HTTP method handlers such as `GET` or `POST` are checked first, `HEAD` falls back to `GET` with an empty body, and `ALL` is the last module-local fallback.
3. If no same-module method handler answers the request, Devflare falls through to the matched route file.
4. Devflare computes route params before request-wide middleware continues, so `event.params` is available to both outer middleware and the leaf handler.

#### Use middleware for broad concerns, not leaf business logic

> **Warning — Keep the split clean**
>
> If a piece of logic only matters for one URL, it probably belongs in a route file, not in global middleware.

##### Example — Keep the middleware file and the leaf route side by side

The global file owns request-wide behavior. The route file owns one URL. When those stay separate, the whole HTTP layer stays readable.

###### File — src/fetch.ts

```ts
import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function cors(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
			}
		})
	}

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('Access-Control-Allow-Origin', '*')
	return next
}

export const handle = sequence(cors)
```

###### File — src/routes/users/[id].ts

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET(event: FetchEvent): Promise<Response> {
	return Response.json({ id: event.params.id })
}
```

#### Route-only apps are valid when you do not need global middleware

You do not need `src/fetch.ts` just to use the file router. If every concern is leaf-local, a route tree on its own is a clean supported shape.

That is especially useful for small APIs where a mounted route prefix matters more than request-wide middleware.

> **Note — Start route-only when the app really is route-only**
>
> Skip `src/fetch.ts` until you genuinely need request-wide auth, logging, CORS, or response shaping. Add the global file later; the route tree stays valid.

##### Example — Mount a route tree under `/api` without a `src/fetch.ts` file

Explicit `files.routes` keeps the route root and prefix obvious in code review while the app stays route-only.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'users-api',
	files: {
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})
```

###### File — src/routes/users/[id].ts

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ params }: FetchEvent): Promise<Response> {
	return Response.json({ id: params.id })
}
```

#### Use `files.routes` to remap, prefix, or disable the route tree

`files.routes` is app routing config. It controls how Devflare discovers and mounts route modules inside the Worker package.

It is not the same thing as top-level Cloudflare deployment `routes`, which decide which hostnames and path patterns reach the Worker in the first place.

##### Reference table

| Shape | What it does |
| --- | --- |
| Omit `files.routes` | `src/routes` is auto-discovered when that directory exists. |
| `{ dir: 'app-routes' }` | Changes the route root without changing the rest of the routing model. |
| `{ dir: 'src/routes', prefix: '/api' }` | Mounts discovered routes under a fixed prefix such as `/api`. |
| `false` | Disables file-route discovery entirely. |

> **Warning — Do not blur app routing and deployment routing**
>
> If you are choosing files inside your Worker, you want `files.routes`. If you are deciding which traffic reaches the Worker at all, you want top-level Cloudflare `routes`.

#### Specificity and guardrails matter once the tree grows

##### Key points

- Static routes beat dynamic routes, dynamic routes beat rest routes, and optional rest routes are checked last.
- `src/routes/users/[id].ts` and `src/routes/users/[slug].ts` normalize to the same pattern and are rejected as conflicts.
- Files or directories beginning with `_` are ignored so route-local helpers can live beside handlers.
- `HEAD` falls back to `GET` if you do not export a dedicated `HEAD` handler.
- Route modules can use HTTP method exports, or a primary `fetch` / `handle` export, just like the fetch module.

##### Reference table

| Filename | Meaning |
| --- | --- |
| `src/routes/index.ts` | Matches `/`. |
| `src/routes/users/[id].ts` | Matches `/users/:id` and exposes `event.params.id`. |
| `src/routes/blog/[...slug].ts` | Matches one-or-more trailing segments and exposes `slug` as joined path text. |
| `src/routes/docs/[[...slug]].ts` | Matches both the directory root and deeper optional rest paths. |

> **Important — Conflict errors are a feature, not a nuisance**
>
> If two files normalize to the same route pattern, Devflare rejects the tree instead of guessing. That makes route review boring in the best possible way.

---

### Author stable config, keep secrets and generated output in their own lanes

> Write `devflare.config.ts` for humans first, let Devflare merge environments and resolve names later, and treat generated Wrangler-facing files as outputs rather than authoring surfaces.

| Field | Value |
| --- | --- |
| Route | [`/docs/config-basics`](/docs/config-basics) |
| Group | Devflare |
| Navigation title | Config basics |
| Eyebrow | Configuration |

The easiest way to keep Devflare predictable is to keep stable intent in authored config and let build or deploy flows resolve the noisy details. That applies to environment overlays, stable resource names, secrets, and generated output.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Anyone authoring or reviewing `devflare.config.ts` |
| Source of truth | Authored config plus source files |
| Escape hatch | `wrangler.passthrough` |

#### A simple config flow

##### Steps

1. Author stable intent in `devflare.config.ts`.
2. Optionally merge a named Devflare environment with `--env <name>`.
3. Resolve account ids or resource ids only in flows that truly need them.
4. Emit Wrangler-compatible output as generated artifacts.
5. Build or deploy from generated output without hand-editing it.

> **Note — If a generated file feels hand-maintained, move the intent back up**
>
> That usually means the authored config is missing a real source-of-truth value or needs a passthrough key.

#### Keep vars, secrets, and `.env` separate

Devflare prefers a workspace-root `.env` when it finds a workspace ancestor; otherwise it falls back to the nearest ancestor `.env` before evaluating config. That is useful for config-time values, but it is not a promise of first-class `.dev.vars*` behavior for worker-only dev or tests.

Stable infrastructure names belong in authored config. Do not hide them in secrets just because another tool happens to like environment variables.

##### Reference table

| Layer | Use it for |
| --- | --- |
| `vars` | String config that compiles into generated Wrangler output. |
| `secrets` | Declaring which runtime secret bindings should exist. The schema accepts `{ required: false }`, but generated env typing still treats declared secrets as present either way today. |
| `.env` | Inputs used while evaluating `devflare.config.*` at config time. |
| `.env.example` | Documenting config-time variables for the team. |

#### Generated artifacts are outputs, not contracts

`wrangler.passthrough` is a shallow top-level override. Use it when Devflare does not model a Wrangler key yet, not as a place to mirror the whole generated config by habit.

Devflare only generates `.devflare/worker-entrypoints/main.ts` when it needs to wrap or compose the worker surfaces it discovered. If `wrangler.passthrough.main` is set, or the fetch worker already lives at `assets.directory/_worker.js`, Devflare can skip that generated main entry and use the explicit worker instead.

##### Key points

- `.devflare/wrangler.jsonc`
- `.devflare/build/wrangler.jsonc`
- `.devflare/worker-entrypoints/main.ts` and `.js` when Devflare needs wrapper glue around the worker surfaces it discovered
- `.devflare/vite.config.mjs`
- `.wrangler/deploy/config.json`
- `env.d.ts`

> **Warning — Passthrough is an explicit escape hatch**
>
> It wins on top-level key conflicts, so use it deliberately instead of turning it into a second config language.

##### Example — Use passthrough for unsupported Wrangler keys

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'advanced-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	wrangler: {
		passthrough: {
			placement: {
				mode: 'smart'
			}
		}
	}
})
```

---

### Scan one full `devflare.config.ts` example with the main current config lanes in one place

> See one canonical `devflare.config.ts` that touches the main current config lanes in a single file, with hover coverage on every property shown in the example.

| Field | Value |
| --- | --- |
| Route | [`/docs/full-config`](/docs/full-config) |
| Group | Devflare |
| Navigation title | Full config |
| Eyebrow | Configuration |

This page is the quick “show me the whole shape” version of Devflare config. It is intentionally full enough to scan the current top-level lanes in one file without turning into a maximal dump of every possible nested variant.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Seeing the whole current config shape before you zoom into one subsection |
| Reading pattern | Scan the example first, then hover properties, then open the specialist page you actually need |
| Important boundary | This example is canonical, but not every binding family variant is shown inline |

#### Use one canonical example when you want the whole shape in view

When you already know Devflare is split into config, runtime, testing, and framework lanes, the next practical question is often just: what does a full current config actually look like?

That is what this page is for. The example below touches the major current top-level config lanes in one place, while still staying readable enough for code review and copy-with-intent adaptation.

> **Note — Full does not mean maximal**
>
> Every property shown above is real and current, but some binding families accept richer object variants than this page needs to show. Use this page as the canonical shape, then open the dedicated binding or configuration page when you need a deeper variant.

##### Example — One full config example you can scan top to bottom

Hover any property in the config to see what that lane means. The example is intentionally broad, but the dedicated pages still own the deeper caveats and richer nested variants.

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'docs-platform',
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	compatibilityDate: '2026-03-17',
	compatibilityFlags: ['urlpattern_polyfill'],
	previews: {
		includeCrons: false
	},
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts',
		entrypoints: 'src/ep/**/*.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		workflows: 'src/workflows/**/*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		kv: {
			CACHE: 'docs-cache'
		},
		d1: {
			PRIMARY_DB: 'docs-db'
		},
		r2: {
			UPLOADS: 'docs-uploads'
		},
		durableObjects: {
			CHAT_ROOMS: 'ChatRoom'
		},
		queues: {
			producers: {
				EMAILS: 'docs-emails'
			},
			consumers: [
				{
					queue: 'docs-emails',
					deadLetterQueue: 'docs-emails-dlq',
					maxBatchSize: 50,
					maxBatchTimeout: 10,
					maxRetries: 5,
					maxConcurrency: 2,
					retryDelay: 30
				}
			]
		},
		services: {
			AUTH: {
				service: 'auth-worker'
			}
		},
		ai: {
			binding: 'AI'
		},
		vectorize: {
			SEARCH_INDEX: {
				indexName: 'docs-search'
			}
		},
		hyperdrive: {
			APP_DB: 'docs-primary-db'
		},
		browser: {
			BROWSER: 'browser'
		},
		analyticsEngine: {
			REQUESTS: {
				dataset: 'docs_requests'
			}
		},
		sendEmail: {
			MAILER: {
				destinationAddress: 'team@example.com'
			}
		}
	},
	triggers: {
		crons: ['0 */6 * * *']
	},
	vars: {
		APP_ENV: 'development'
	},
	secrets: {
		API_TOKEN: {
			required: true
		}
	},
	routes: [
		{
			pattern: 'docs.example.com/*',
			custom_domain: true
		}
	],
	wsRoutes: [
		{
			pattern: '/ws/:id',
			doNamespace: 'CHAT_ROOMS',
			idParam: 'id',
			forwardPath: '/websocket'
		}
	],
	assets: {
		directory: 'static',
		binding: 'ASSETS'
	},
	limits: {
		cpu_ms: 50
	},
	observability: {
		enabled: true,
		head_sampling_rate: 1
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatRoom']
		}
	],
	rolldown: {
		target: 'es2022',
		minify: true,
		sourcemap: true,
		options: {}
	},
	vite: {
		plugins: []
	},
	env: {
		preview: {
			vars: {
				APP_ENV: 'preview'
			},
			previews: {
				includeCrons: false
			},
			observability: {
				enabled: true,
				head_sampling_rate: 1
			}
		},
		production: {
			vars: {
				APP_ENV: 'production'
			}
		}
	},
	wrangler: {
		passthrough: {
			logpush: true
		}
	}
})
```

#### Know what each top-level lane is doing

##### Reference table

| Lane | What it owns | Open next when you need more |
| --- | --- | --- |
| `name`, `accountId`, `compatibility*` | Worker identity and runtime posture. | `config-basics` and `runtime-deploy-settings` |
| `previews`, `files`, `bindings`, `triggers` | The authored Worker shape: surfaces, bindings, and scheduled intent. | `project-shape`, `worker-surfaces`, and `config-previews` |
| `vars`, `secrets`, `env` | Runtime strings, secret declarations, and environment overlays. | `config-environments` |
| `routes`, `wsRoutes`, `assets` | Deployment routing, dev WebSocket proxy rules, and static asset delivery. | `runtime-deploy-settings` |
| `limits`, `observability`, `migrations` | Operational posture and release-time controls. | `runtime-deploy-settings` |
| `rolldown`, `vite`, `wrangler` | Bundler coordination, host integration, and unsupported Wrangler passthrough. | `config-basics`, `vite-standalone`, and `svelte-with-rolldown` |

#### Open the specialist page once the full picture is clear

##### Highlights

- **Need the authoring rules?** — Open config basics when the question is what should live in authored config versus generated output or deploy-time resolution. ([link](/docs/config-basics))
- **Need the project shape story?** — Open project shape when the main question is how many Worker surfaces or discovery lanes the package should actually own. ([link](/docs/project-shape))
- **Need preview or environment overlays?** — Use the environments and previews pages when the full config turns into a question about per-lane overrides or preview-scoped resources. ([link](/docs/config-environments))
- **Need runtime and deploy posture?** — Open runtime and deploy settings when the question is routes, assets, WebSocket proxy rules, observability, limits, or migrations. ([link](/docs/runtime-deploy-settings))

---

### Configure the project shape around explicit file surfaces before the package gets noisy

> Start with one fetch file, then add routes, background handlers, Durable Objects, assets, and transport rules only when the project genuinely needs them.

| Field | Value |
| --- | --- |
| Route | [`/docs/project-shape`](/docs/project-shape) |
| Group | Devflare |
| Navigation title | Project shape |
| Eyebrow | Configuration |

The config keys that shape a Devflare project are mostly about which files or globs Devflare should treat as real runtime surfaces. Keep that shape small at first, then expand it deliberately instead of letting autodiscovery and generated output become the accidental architecture.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Teams deciding how many runtime surfaces one package actually needs |
| Primary shape keys | `files.*`, `assets`, `routes`, and `wsRoutes` |
| Safest habit | Add one surface only when the current project shape truly asks for it |

#### Start with the smallest honest project shape

Devflare does not ask you to configure every possible Worker surface up front. The clean starting point is one fetch entry, then a route tree, a queue consumer, Durable Objects, or other surfaces only when the package actually needs them.

That keeps the authored config readable in code review and stops the project structure from silently inheriting complexity just because a default glob or generated file happened to exist.

##### Steps

1. Start with `files.fetch` for the main HTTP Worker surface.
2. Add `files.routes` when multiple URLs deserve their own modules.
3. Add background surfaces such as `queue`, `scheduled`, or `email` only when the package truly owns those events.
4. Add `durableObjects`, `entrypoints`, `workflows`, or `transport` only when the runtime contract calls for them.
5. Keep static assets, deployment routes, and WebSocket proxy rules in their own config lanes instead of smuggling them into file conventions.

> **Tip — Project shape is part of architecture**
>
> If the config says one package owns five runtime surfaces, reviewers should be able to see why. Devflare works best when that shape is explicit instead of accidental.

#### Know which keys actually shape the project

##### Reference table

| Config lane | Use it when | Project effect |
| --- | --- | --- |
| `files.fetch` | One main Worker surface should own request-wide behavior. | Points Devflare at the fetch entry you author directly. |
| `files.routes` | The project needs route modules or a mounted route prefix. | Lets a route tree sit beside or replace the main fetch file. |
| `files.queue`, `files.scheduled`, `files.email` | The package consumes background or platform-triggered events. | Adds separate handler files for those runtime surfaces. |
| `files.durableObjects`, `files.entrypoints`, `files.workflows` | The project needs stateful classes, named entrypoints, or workflow definitions. | Turns globs into additional Worker-owned code surfaces Devflare can discover and bundle. |
| `files.transport` | Custom value transport is needed for richer Worker or Durable Object contracts. | Lets you point at one explicit transport file, or disable autodiscovery with `null`. |
| `assets`, `routes`, `wsRoutes` | Static files, deployment routing, or dev WebSocket proxy behavior need their own config. | Keeps non-handler project concerns out of the file-surface lane. |

##### Example — One config can stay readable even when the package grows a few real surfaces

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		durableObjects: 'src/do/**/*.ts',
		transport: null
	},
	assets: {
		directory: 'public'
	}
})
```

#### Use autodiscovery deliberately, and disable it explicitly when you mean it

##### Key points

- Omit `files.routes` when the default `src/routes` location is already the right fit.
- Use an explicit `files.routes` object when the route root or prefix should be obvious in config review.
- Set `files.routes: false` when the package should not use file-route discovery at all.
- Set `files.transport: null` when you want transport autodiscovery disabled instead of guessed.
- Use explicit file or glob paths when the project layout is non-standard enough that the default convention would hide intent.

> **Warning — Conventions are only helpful when they still describe the project honestly**
>
> As soon as a default convention stops being obvious, move back to explicit config. That is usually the more maintainable choice.

#### Open the deeper page for the shape you just introduced

##### Highlights

- **Need the broader package setup map?** — Open project architecture when the question is the full package layout — authored config, runtime files, generated output, hosted app files, or monorepo boundaries. ([link](/docs/project-architecture))
- **Need route modules?** — Open the HTTP routing page when `files.routes` becomes part of the project shape. ([link](/docs/http-routing))
- **Need transport?** — Read the transport page when a custom transport file becomes part of the contract between worker code and stateful surfaces. ([link](/docs/transport-file))
- **Need generated env types?** — Open the generated types page when bindings, Durable Objects, or named entrypoints become part of the package contract. ([link](/docs/generated-types))
- **Need a host shell?** — Open the framework pages only when the package truly becomes a Vite or SvelteKit app instead of a worker-first package. ([link](/docs/vite-standalone))

---

### Treat fetch, queue, scheduled, and email handlers as separate Worker surfaces with their own files

> Devflare can compose or wrap several Worker surfaces into one generated entrypoint, but the authored source of truth should stay in explicit files such as `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, and `src/email.ts`.

| Field | Value |
| --- | --- |
| Route | [`/docs/worker-surfaces`](/docs/worker-surfaces) |
| Group | Devflare |
| Navigation title | Worker surfaces |
| Eyebrow | Configuration |

A single Devflare package can own more than one Cloudflare event surface. Keep each surface in its own file when the package genuinely owns that event type, wire schedules through `triggers.crons`, and let the generated composed entrypoint stay generated instead of hand-maintained.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Packages that own both HTTP and background event surfaces |
| Default files | `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts` |
| Generated output | `.devflare/worker-entrypoints/main.ts` when Devflare needs to wrap or compose the worker surfaces it discovered |
| Test helpers | `cf.worker`, `cf.queue`, `cf.scheduled`, and `cf.email` |

#### Keep each event surface in its own lane

Devflare does not flatten every Cloudflare event into one mystery handler. When one package owns HTTP, queue consumption, cron jobs, or inbound email, the cleanest shape is usually one file per surface so ownership stays obvious in code review.

That separation is especially useful once the package has both request/response code and background work. The HTTP story stays in fetch or routes, while queue, scheduled, and email code can evolve without disappearing into one huge entry file.

##### Reference table

| Surface | Conventional file | Use it when | Helper |
| --- | --- | --- | --- |
| Fetch | `src/fetch.ts` or `src/routes/**` | HTTP requests belong to one main handler or route tree. | `cf.worker.get()` / `cf.worker.fetch()` |
| Queue consumer | `src/queue.ts` | The package owns deferred, batched, or retryable queue work. | `cf.queue.trigger()` |
| Scheduled handler | `src/scheduled.ts` plus `triggers.crons` | Time-based jobs should run from config-owned schedules. | `cf.scheduled.trigger()` |
| Email handler | `src/email.ts` | The Worker handles inbound email or local email-handler flows. | `cf.email.send()` |

#### Put scheduled intent in config instead of scripts or comments

A scheduled handler is only half the story. The code lives in `src/scheduled.ts`, but the timing contract belongs in `triggers.crons` so the package declares when the job should run instead of relying on external shell memory.

Preview behavior belongs in config too. `previews.includeCrons` defaults to `false`, so branch-scoped preview deploys drop cron triggers unless you opt them back in deliberately.

> **Warning — Preview environments should not inherit cron behavior by accident**
>
> If previews should run scheduled jobs, say so explicitly. Otherwise keep preview validation focused on the surfaces reviewers actually expect to exercise.

##### Example — A package that owns several Worker surfaces explicitly

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'jobs-worker',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		routes: false
	},
	triggers: {
		crons: ['0 */6 * * *']
	},
	previews: {
		includeCrons: false
	}
})
```

#### Disable unused conventions explicitly and let Devflare compose the rest

Generated composition is not only a build detail. The local dev server also uses the same surface model to decide what to watch, so the directories around configured or conventional fetch, queue, scheduled, email, route, and transport files all become reload roots.

That split is intentional: config-file edits take the config reload path, while worker-source changes under those watched roots take the worker reload path. You do not need a second watch system just because the package grew another surface.

##### Key points

- Set `files.queue: false`, `files.scheduled: false`, or `files.email: false` when one of the default conventions should stay off.
- Set `files.routes: false` when the package should stay fetch-only instead of discovering a route tree.
- When a fetch entry, route tree, or background surface set needs wrapper glue, Devflare can generate a composed entrypoint under `.devflare/worker-entrypoints/main.ts` to fan them into the Worker runtime correctly.
- If `wrangler.passthrough.main` is set, or the fetch worker already lives at `assets.directory/_worker.js`, Devflare skips that generated main entry and uses the explicit worker instead.
- Generated entrypoints are supposed to churn as the surface set changes. Keep the authored files and config authoritative, and let the glue stay disposable.
- Treat that generated entrypoint as output. The authored source of truth remains the explicit files and config that selected them.

> **Note — Dev reload follows the same surface roots**
>
> Worker-source changes under the watched fetch, queue, scheduled, email, route, or transport roots trigger the worker reload path, while edits to the resolved `devflare.config.*` trigger the config reload path instead.

> **Note — Tail is still a special case**
>
> Devflare can exercise tail behavior in the test harness when `src/tail.ts` exists, but there is not yet a public `files.tail` config key. Keep the main project-shape story centered on the documented event surfaces, and open the `createTestContext()` page when the question is tail testing.

#### Some nearby `files.*` keys are discovery globs, not event handlers

Not every `files.*` key means “Cloudflare will call this file as an event surface.” Some keys tell Devflare where to discover related program structure such as Durable Object classes, named entrypoints, workflow definitions, or transport hooks.

That distinction matters because it keeps code review honest. Event surfaces answer “what can invoke this package?”, while discovery globs answer “what else should Devflare scan and bundle for the runtime contract?”

##### Highlights

- **Need transport behavior?** — Open the transport page when a discovered transport file becomes part of the package contract. ([link](/docs/transport-file))
- **Need the generated type contract?** — Open the generated types page when `files.entrypoints`, `ref()`, or discovered Durable Objects need to show up honestly in `env.d.ts`. ([link](/docs/generated-types))
- **Need the broader config map?** — The runtime and deploy settings page covers the non-surface knobs such as account context, compatibility posture, routes, assets, limits, and migrations. ([link](/docs/runtime-deploy-settings))

##### Reference table

| Config key | What it points at | Why it is different |
| --- | --- | --- |
| `files.durableObjects` | Durable Object class files or globs | These classes are discovered and wrapped; they are not a standalone top-level event surface like fetch or queue. |
| `files.entrypoints` | Named entrypoint files or globs | These support typed cross-worker references and discovery, not a separate Cloudflare event hook. |
| `files.workflows` | Workflow definition files or globs | These are additional discovered modules, not a direct replacement for fetch, queue, scheduled, or email handlers. |
| `files.transport` | One custom transport file | This is a serialization hook for bridge-backed calls, not an event handler that Cloudflare dispatches directly. |

---

### Use `devflare types` to keep `env.d.ts` and `Entrypoints` aligned with the project you actually authored

> `devflare types` turns config, discovered Durable Objects, named entrypoints, and cross-worker references into one generated TypeScript contract instead of a pile of hand-maintained env guesswork.

| Field | Value |
| --- | --- |
| Route | [`/docs/generated-types`](/docs/generated-types) |
| Group | Devflare |
| Navigation title | Generated types |
| Eyebrow | Configuration |

The generated file is more than editor garnish. It is the typed mirror of your Devflare config and discovery rules: bindings land on global `DevflareEnv`, named entrypoints become an exported `Entrypoints` union, and referenced workers can produce typed service interfaces when Devflare can follow them honestly.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Packages that use bindings, Durable Objects, service bindings, or named worker entrypoints |
| Main command | `bunx --bun devflare types` |
| Default output | `env.d.ts` relative to the directory you run the command from unless you override it |
| Best pairing | `defineConfig<import('./env').Entrypoints>()` on the referenced worker config |

#### Treat the generated file as the typed contract, not as handwritten glue

`devflare types` reads the resolved config, discovers supporting source files, and writes one generated file that says what the package runtime actually exposes. That is calmer than hand-maintained `env` declarations because the source of truth stays in config and file discovery, not in a second hand-maintained type file.

The result is usually a global `DevflareEnv` interface plus an exported `Entrypoints` union. That combination is what keeps bindings, cross-worker service calls, and named entrypoints typed without making you manually mirror every config change.

> **Warning — Generated means generated**
>
> Do not hand-edit `env.d.ts` and expect the next run to preserve it. Change config or source files, then rerun `devflare types`.

##### Example — A generated file should read like output, not a second config file

```ts
// Generated by devflare - DO NOT EDIT
// Run devflare types to regenerate

import type { MathServiceInterface } from './src/math-service.types'
import type { AdminEntrypointInterface } from './src/math-service.types'

declare global {
	interface DevflareEnv {
		MATH_SERVICE: MathServiceInterface
		ADMIN: AdminEntrypointInterface
	}
}

/**
 * Named entrypoints discovered from ep.*.ts files.
 * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.
 */
export type Entrypoints = 'AdminEntrypoint'
```

##### Example — The command loop stays intentionally small

```bash
bunx --bun devflare types
bunx --bun devflare types --output env.generated.d.ts
```

#### Know what the command is actually discovering

##### Key points

- If no named entrypoints are discovered yet, `Entrypoints` stays `string` on purpose.
- `devflare types` does not take an `--env` flag today, so the generated contract reflects the resolved base config rather than a named environment overlay.
- If you choose a nested `--output` path, create the parent directory first; the command writes the file but does not scaffold missing folders for you.
- Discovery follows the configured file patterns first, then falls back to the default Durable Object and entrypoint globs.
- The generated types are only as good as the authored config and file naming conventions they can see.

##### Reference table

| Input Devflare reads | Where it comes from | Typed result |
| --- | --- | --- |
| `bindings`, `vars`, and `secrets` | The resolved top-level `devflare.config.*` from the current working directory or explicit `--config` path. | Members on global `DevflareEnv`. |
| Local Durable Object classes | `files.durableObjects` or the default `**/do.*.{ts,js}` discovery pattern. | `DurableObjectNamespace<...>` when the class can be located honestly. |
| Named worker entrypoints | `files.entrypoints` or the default `**/ep.*.{ts,js}` discovery pattern plus exported classes extending `WorkerEntrypoint`. | An exported `Entrypoints` union for `defineConfig<Entrypoints>()`. |
| `ref()` references | Imported Devflare configs in other packages or subfolders. | Typed service bindings and cross-worker Durable Object namespaces when Devflare can resolve them. |
| Unknown or unresolvable service surface | A target worker or entrypoint that cannot be turned into a stable interface. | `Fetcher` fallback instead of fake precision. |

> **Note — Typed fallback is still honest typing**
>
> Getting `Fetcher` for a service binding is not a failure of the generator so much as Devflare refusing to invent a stronger interface than it can justify from the available source.

#### Type the worker that owns the entrypoints, then let `ref()` carry that knowledge

The `Entrypoints` union matters most on the worker being referenced. Import that generated type into the worker's own config and pass it to `defineConfig<Entrypoints>()`, then callers that use `ref(() => import(...))` can ask for named entrypoints without turning those names into loose string conventions.

That keeps the typing relationship honest: the worker that owns `ep.*.ts` files declares which entrypoints exist, and the worker that consumes them gets autocomplete and checking through `ref().worker('...')` later.

##### Key points

- Put `defineConfig<Entrypoints>()` on the referenced worker config, not on every caller in the repo by reflex.
- Keep the named entrypoint files boring and explicit: `ep.*.ts` plus classes extending `WorkerEntrypoint`.
- Rerun `devflare types` in the worker that owns those entrypoints whenever you rename a class or add another one.

> **Warning — Types are not a substitute for critical deploy validation**
>
> Named service entrypoints are modeled at the Devflare layer, but if a particular service path is operationally critical, still inspect the compiled output with `devflare build` or `devflare config print --format wrangler` before trusting muscle memory.

##### Example — One worker declares the entrypoints, another consumes them through `ref()`

###### File — math-service/ep.admin.ts

```ts
import { WorkerEntrypoint } from 'cloudflare:workers'

export class AdminEntrypoint extends WorkerEntrypoint {
	async resetStats(): Promise<{ success: boolean }> {
		return { success: true }
	}
}
```

###### File — math-service/devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'
import type { Entrypoints } from './env'

export default defineConfig<Entrypoints>({
	name: 'math-worker',
	files: {
		fetch: 'worker.ts'
	}
})
```

###### File — devflare.config.ts

```ts
import { defineConfig, ref } from 'devflare/config'

const mathWorker = ref(() => import('./math-service/devflare.config'))

export default defineConfig({
	name: 'case5-gateway',
	bindings: {
		services: {
			MATH_SERVICE: mathWorker.worker,
			ADMIN: mathWorker.worker('AdminEntrypoint')
		}
	}
})
```

#### Keep the generated contract boring and rerunnable

##### Highlights

- **Need the multi-worker architecture story?** — Open the multi-worker page when the question is whether another worker boundary is warranted before you worry about typing that boundary. ([link](/docs/multi-workers))
- **Need the surface-discovery map?** — The worker-surfaces page explains which authored files and discovery globs become part of the worker contract in the first place. ([link](/docs/worker-surfaces))
- **Need the broader command map?** — The CLI page keeps `types`, `build`, `deploy`, `doctor`, and config-inspection commands in one everyday workflow map. ([link](/docs/devflare-cli))

##### Steps

1. Run `devflare types` after adding or renaming bindings, Durable Objects, service references, or named entrypoints.
2. Keep the default cwd-relative `env.d.ts` location unless a custom `--output` path truly buys something more than folder aesthetics.
3. Import `Entrypoints` from the generated file only where the owning worker config needs it.
4. Inspect compiled output when a cross-worker or entrypoint boundary matters operationally, not just ergonomically in the editor.

---

### Use `config.env` overlays to change only what differs between local, preview, and production

> Keep one base config, layer environment-specific overrides with `config.env`, and let Devflare resolve preview or production details only in the commands that actually need them.

| Field | Value |
| --- | --- |
| Route | [`/docs/config-environments`](/docs/config-environments) |
| Group | Devflare |
| Navigation title | Environments |
| Eyebrow | Configuration |

Devflare environments are an overlay system, not a second copy of the whole config file. The base config should hold the stable project story, and `config.env` should only override the parts that genuinely differ by environment.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Projects that need different bindings or runtime behavior in preview and production |
| Merge model | Base config first, then `config.env[name]`, then preview materialization when relevant |
| Main habit | Repeat only the keys that actually differ by environment |

#### Keep one base config and let the overlay change only the deltas

The main config should describe the stable project: the worker name, the usual file surfaces, and the bindings or defaults that exist regardless of environment. `config.env` is where you change only the parts that diverge for preview, production, or another named lane.

That is why the overlay model feels calmer than copying whole config files around. The shared story stays in one place, while the environment-specific differences stay small enough to review honestly.

> **Tip — A smaller overlay is usually a better overlay**
>
> If an environment block starts to repeat most of the base config, that is usually a sign the base config should be refactored instead of duplicated.

##### Example — Use `config.env` for targeted overrides instead of a second full config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-api',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			CACHE: 'notes-cache'
		}
	},
	vars: {
		APP_ENV: 'local'
	},
	env: {
		preview: {
			bindings: {
				kv: {
					CACHE: 'notes-preview-cache'
				}
			},
			vars: {
				APP_ENV: 'preview'
			},
			previews: {
				includeCrons: false
			}
		},
		production: {
			vars: {
				APP_ENV: 'production'
			},
			observability: {
				enabled: true,
				head_sampling_rate: 1
			}
		}
	}
})
```

#### Know what environment overlays are actually allowed to change

This is why `config.env` is more than a raw Wrangler mirror. It can change the Devflare-owned parts of the project too, as long as those differences are still part of the same package story.

##### Reference table

| Override lane | Typical reason to change it |
| --- | --- |
| `name`, compatibility settings | The environment truly needs a different runtime identity or compatibility posture. |
| `files`, `bindings`, `triggers` | Preview or production uses different surfaces, resources, or schedules. |
| `vars`, `secrets` | Runtime strings or secret-binding declarations differ by environment. |
| `routes`, `assets`, `limits`, `observability` | Deployment routing, static assets, CPU limits, or observability should differ by lane. |
| `rolldown`, `vite`, `wrangler` | The build host or the passthrough escape hatch needs environment-specific behavior. |

#### Choose the environment where it matters, and let explicit deploy targets do the rest

##### Steps

1. Use commands like `devflare config --env <name>` or `devflare build --env <name>` when you want to inspect or compile one named environment intentionally.
2. Let explicit preview deploys target the preview environment instead of also layering on an unrelated `--env` decision.
3. Let explicit production deploys stay pinned to production so the deployment target is never ambiguous.
4. Keep preview-only resource naming and preview lifecycle behavior inside the preview lane instead of leaking it into the base config.

> **Note — Environment choice and deploy target are related, but not identical**
>
> `--env` chooses a config overlay for commands that resolve config environments. Explicit preview and production deploy flags choose the deployment destination itself.

#### Keep `.env`, `vars`, and `secrets` in separate jobs

##### Key points

- Use `.env` for inputs that exist while `devflare.config.*` is being evaluated. Devflare prefers a workspace-root `.env` when it finds a workspace ancestor, otherwise it falls back to the nearest ancestor `.env`.
- Use `vars` for string values that should compile into generated Worker-facing output.
- Use `secrets` to declare runtime secret binding names, not to store those secret values in config. Today that is mostly schema and type metadata: the schema accepts `{ required: false }`, but generated env typing still treats declared secrets as present and Devflare does not currently turn that flag into a separate deploy-time guarantee.
- Use `.env.example` to document config-time inputs for the team instead of leaving those values to memory or chat scrollback.

> **Warning — Do not let every string become an environment variable by reflex**
>
> Stable infrastructure names and intentional runtime strings usually belong in authored config. Save secrets for the values that are actually secret.

---

### Author preview-scoped bindings so preview deploys can own disposable infrastructure

> Use `preview.scope()` for bindings that should belong to one preview scope. Devflare materializes names like `notes-db-next`, provisions or reuses the preview-only resources it can manage, and lets you clean them up by the same scope later without touching production resources.

| Field | Value |
| --- | --- |
| Route | [`/docs/config-previews`](/docs/config-previews) |
| Group | Devflare |
| Navigation title | Previews |
| Eyebrow | Configuration |

Preview config in Devflare is not only “set `env.preview` and hope for the best.” The extra step is marking the bindings that should belong to a preview deployment. Devflare then materializes those names with a preview identifier, keeps production names separate, and on preview deploys can create or reuse the matching account resources for the binding types it manages locally.

#### At a glance

| Fact | Value |
| --- | --- |
| Authoring primitive | `preview.scope()` from `devflare/config` |
| Typical result | `notes-cache-kv` → `notes-cache-kv-next` for a `next` preview scope |
| Main lifecycle command | `bunx --bun devflare previews cleanup-resources --scope <name> --apply` |
| Best for | Previews that need their own disposable state instead of borrowing production infrastructure |

#### Mark preview-owned bindings in config instead of mutating production names at deploy time

The point of preview-scoped bindings is not to make names look fancy. It is to keep preview infrastructure isolated from production infrastructure while still authoring one readable config.

`preview.scope()` returns an opaque marker around the base resource name. Devflare later materializes that marker into a real name for the active preview identifier, which means the authored config can stay stable while preview deploys resolve to preview-owned databases, buckets, queues, and other resources.

> **Tip — This is safer than repointing previews at production state**
>
> When the preview owns a distinct database or queue name, it can be created quickly, reviewed honestly, and deleted cleanly later. That is much safer than hoping reviewers never touch a production binding in a preview session.

##### Example — Author preview-owned bindings once, then let the scope decide the real names

```ts
import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	name: 'notes-api',
	bindings: {
		kv: {
			CACHE: pv('notes-cache-kv')
		},
		d1: {
			PRIMARY_DB: pv('notes-db')
		},
		r2: {
			UPLOADS: pv('notes-uploads-bucket')
		},
		queues: {
			producers: {
				EMAILS: pv('notes-emails-queue')
			},
			consumers: [
				{
					queue: pv('notes-emails-queue'),
					deadLetterQueue: pv('notes-emails-dlq')
				}
			]
		}
	},
	env: {
		preview: {
			vars: {
				APP_ENV: 'preview'
			}
		},
		production: {
			bindings: {
				kv: {
					CACHE: 'notes-cache-kv-production'
				},
				d1: {
					PRIMARY_DB: 'notes-db-production'
				}
			},
			vars: {
				APP_ENV: 'production'
			}
		}
	}
})
```

#### The preview identifier is materialized into the binding target name

In normal local work and non-preview environments, a preview-scoped marker resolves back to the base name. In preview resolution, Devflare inserts the chosen preview identifier using the configured separator, which defaults to `-`.

The identifier order is deliberate: an explicit identifier wins first, then `DEVFLARE_PREVIEW_IDENTIFIER`, then PR or branch-derived env values, and only then the synthetic `preview` fallback for generic preview environments.

##### Key points

- The binding name in `env` stays the same; it is the backing resource target that changes by preview scope.
- Production overrides can still point at explicit production resources when production naming should be fully separate from preview naming.
- This page is about resource naming and binding targets; preview worker topology is a neighboring decision covered by the preview strategy docs.

##### Reference table

| Authored binding target | When it resolves | Resolved name | What that means |
| --- | --- | --- | --- |
| `pv('notes-cache-kv')` | Local work or non-preview resolution | `notes-cache-kv` | The base config stays readable and does not invent preview names unless a preview identifier is actually in play. |
| `pv('notes-cache-kv')` | Plain `--preview` or generic preview environment | `notes-cache-kv-preview` | The synthetic `preview` identifier keeps same-worker preview uploads separate from the base resource name. |
| `pv('notes-cache-kv')` | Named preview like `--preview next` or `--scope next` | `notes-cache-kv-next` | A named preview scope gets its own clearly-associated resource names and cleanup target. |
| `pv('notes-cache-kv')` | `DEVFLARE_PREVIEW_BRANCH=Feature/TeSt-Branch` | `notes-cache-kv-feature-test-branch` | Branch-derived identifiers are sanitized into safe resource-name fragments. |
| `preview.scope({ separator: '--' })` | Custom separator plus preview identifier | `notes-cache-kv--next` | You can change the separator when the resource naming convention needs it. |

#### Some preview-scoped bindings are lifecycle-managed resources, and some are not

##### Reference table

| Binding lane | Preview naming story | Lifecycle behavior |
| --- | --- | --- |
| KV, D1, and R2 | Author the resource name with `preview.scope()`. | Preview deploys can create or reuse the scoped resource, and cleanup can delete it later by the same scope. |
| Queues and DLQs | Producer, consumer, and dead-letter queue names can all be scoped. | Preview deploys can provision the queue resources and cleanup can remove them together. |
| Vectorize | Index names can be preview-scoped too. | Devflare can provision the preview index shape from the base index metadata and delete it during cleanup later. |
| Hyperdrive | Names can be materialized for preview scopes. | Devflare does not auto-clone stored credentials, so it warns and can fall back to the base Hyperdrive binding when the preview config does not already exist. |
| Analytics Engine and Browser Rendering | Dataset or binding names can be materialized. | Devflare reports warnings instead of provisioning or deleting account resources because those families do not follow the same managed lifecycle. |
| Service bindings, Durable Objects, and routes on dedicated preview workers | Isolation follows preview worker names and ownership more than account resource naming. | Deleting dedicated preview worker scripts also removes preview-only service bindings, Durable Object bindings, and routes attached only to those workers. |

> **Warning — Preview-scoped does not automatically mean Devflare can provision everything**
>
> Hyperdrive, Analytics Engine, and Browser Rendering each have their own lifecycle caveats. Devflare says that out loud instead of pretending every binding behaves like KV or D1.

#### The good preview loop is deploy, inspect, and clean up by the same scope

Preview-scoped bindings work best when the scope stays explicit from deploy through cleanup. The preview deploy resolves the config to preview-owned names, the binding inspection command shows exactly what that scope points at, and cleanup removes the same preview-only resources later.

That is what keeps previews fast to create and safe to tear down. The preview owns its own binding targets, so deleting it does not mean touching production databases or buckets just because the app used the same binding names in code.

##### Highlights

- **Need the overlay story too?** — Open the environments page when the question is which config lanes differ by preview or production beyond resource naming. ([link](/docs/config-environments))
- **Need the preview topology decision?** — Open the preview strategy page when the real question is same-worker uploads versus branch-scoped worker families. ([link](/docs/preview-strategies))
- **Need lifecycle and cleanup commands?** — Open preview operations when the question moves from authoring config to registry inspection, retirement, reconciliation, or cleanup policy. ([link](/docs/preview-operations))

##### Steps

1. Author preview-owned bindings with `preview.scope()` in the main config.
2. Deploy the preview with an explicit scope such as `--preview next` when the resource names should map to one known preview deployment.
3. Inspect that scope with `devflare previews bindings --scope next` when you want the resolved targets and worker associations spelled out clearly.
4. Clean up the same preview later with `devflare previews cleanup-resources --scope next --apply`.

##### Example — One scope in, the same scope back out

```bash
bunx --bun devflare deploy --preview next
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews cleanup-resources --scope next --apply
```

---

### Keep runtime posture and deployment shape in authored config instead of scattered deploy conventions

> Use config for account context, compatibility posture, assets, deployment routes, WebSocket proxy rules, migrations, observability, limits, and preview cron behavior instead of rediscovering those settings in scripts later.

| Field | Value |
| --- | --- |
| Route | [`/docs/runtime-deploy-settings`](/docs/runtime-deploy-settings) |
| Group | Devflare |
| Navigation title | Runtime & deploy settings |
| Eyebrow | Configuration |

Devflare exposes several config lanes that are not about file discovery at all. These keys shape runtime identity, Cloudflare compatibility, deployment routing, assets, release behavior, and operational posture, so they belong in authored config where the team can review them honestly.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Projects that need explicit runtime posture and delivery shape beyond the basic file surfaces |
| Forced compatibility flags | `nodejs_compat` and `nodejs_als` |
| Routing split | `files.routes` is app routing, while top-level `routes` is Cloudflare deployment routing |
| Preview cron default | `previews.includeCrons` defaults to `false` |

#### Set runtime identity and compatibility posture on purpose

Not every package needs the full advanced runtime section on day one, but once remote bindings, compatibility drift, or account-aware operations matter, these settings should move into config instead of living in loose scripts and remembered defaults.

The important habit is that runtime posture should be reviewable in source control. If a package relies on a specific compatibility date or a specific Cloudflare account, that fact should be obvious before the deploy step runs.

##### Reference table

| Key | Use it when | Important behavior |
| --- | --- | --- |
| `accountId` | Remote bindings, name-based resource lookup, or account-aware commands should target one Cloudflare account explicitly. | Remote AI and Vectorize flows need a clear account, and config-level `accountId` becomes one resolution lane for account-aware operations and config-driven resource resolution. |
| `compatibilityDate` | The package should pin runtime behavior instead of inheriting date drift. | Devflare defaults it to the current date when you omit it, so explicit pinning is the calmer choice once the package is real. |
| `compatibilityFlags` | You need extra Workers compatibility flags beyond the default posture. | Devflare always includes `nodejs_compat` and `nodejs_als`, so custom flags should be deliberate additions instead of copy-by-habit repetition. |

> **Note — Do not restate the forced flags unless you are making a point**
>
> Devflare already includes `nodejs_compat` and `nodejs_als`. Keep `compatibilityFlags` focused on the extra posture your package actually needs.

#### Keep deployment shape in config, not in app routing or shell scripts

Several config keys answer deployment questions rather than application-routing questions. Keeping those lanes separate is what stops app URLs, Cloudflare routes, and dev-only WebSocket proxy behavior from collapsing into one blurry story.

If the package serves static assets, mounts a custom domain, or proxies Durable Object WebSockets in development, that shape should live in config beside the rest of the deployment contract.

##### Reference table

| Key | What it controls | Common use |
| --- | --- | --- |
| `assets` | Static asset directory plus optional binding name | Point Devflare at one static directory and keep asset delivery visible in source. |
| `routes` | Cloudflare deployment route patterns | Attach the Worker to host or zone patterns at deploy time. |
| `wsRoutes` | Dev-mode Durable Object WebSocket proxy patterns | Forward development WebSocket paths into Durable Object namespaces explicitly. |

> **Warning — Top-level `routes` is not the same thing as `files.routes`**
>
> `files.routes` controls your app route tree. Top-level `routes` controls Cloudflare deployment routing. Keep those ideas separate so the package stays reviewable.

##### Example — One place for runtime posture and deployment-facing settings

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'docs-site',
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	compatibilityDate: '2026-03-17',
	assets: {
		directory: 'static',
		binding: 'ASSETS'
	},
	routes: [
		{ pattern: 'docs.example.com/*', custom_domain: true }
	],
	wsRoutes: [
		{
			pattern: '/ws/:id',
			doNamespace: 'CHAT_ROOMS'
		}
	],
	limits: {
		cpu_ms: 50
	},
	observability: {
		enabled: true,
		head_sampling_rate: 1
	},
	previews: {
		includeCrons: false
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatRoom']
		}
	]
})
```

#### Put release and operational controls in source control too

Once a package has Durable Object history, production traffic expectations, or explicit preview behavior, the runtime contract is no longer just “what files exist?” It also includes how that package should be migrated, sampled, and limited at runtime.

That is why these settings belong in the same config as the Worker surfaces. They are part of the deployable contract, not just garnish around it.

##### Reference table

| Key | Why it exists |
| --- | --- |
| `previews.includeCrons` | Choose whether branch-scoped preview deploys keep cron triggers instead of omitting them to avoid shared-schedule conflicts. |
| `limits.cpu_ms` | Declare CPU expectations in config rather than treating them as after-the-fact deploy tuning. |
| `observability.enabled` / `head_sampling_rate` | Keep tracing or sampling posture explicit for the environments that need it. |
| `migrations` | Track Durable Object class lifecycle in the same source-controlled package that owns those classes. |

> **Warning — Durable Object migrations still deserve explicit release thinking**
>
> Keep migrations authored in config and remember that plain preview uploads do not apply Durable Object migrations. If the preview must exercise real Durable Object lifecycle changes, use the preview strategy that matches that reality.

#### Open the neighboring page when the setting changes the larger deployment story

##### Highlights

- **Need environment overlays?** — Use the environments page when these settings differ by preview, production, or another named lane. ([link](/docs/config-environments))
- **Need preview-scoped bindings?** — Open the previews config page when preview deployments should own separate databases, buckets, or queues that can be cleaned up by scope later. ([link](/docs/config-previews))
- **Need the production story?** — The production deploy page covers explicit deploy targets and the inspection tools that belong beside them. ([link](/docs/production-deploys))
- **Need preview behavior?** — Preview strategy docs cover named preview scopes, same-worker uploads, and the Durable Object caveats around them. ([link](/docs/preview-strategies))
- **Need app-route shape?** — Open the routing page when the question is your route tree or request middleware, not Cloudflare deployment routes. ([link](/docs/http-routing))

---

### Think in events first, then let AsyncLocalStorage carry the active context through the handler trail

> Devflare-managed entrypoints create a rich surface event, store `env`, `ctx`, `request`, `locals`, `type`, and the original event in `AsyncLocalStorage`, then expose that state through helpers such as `getFetchEvent()`, `getQueueEvent()`, `getContext()`, and the `env`, `ctx`, `event`, and `locals` runtime proxies inside the same handler trail.

| Field | Value |
| --- | --- |
| Route | [`/docs/runtime-context`](/docs/runtime-context) |
| Group | Devflare |
| Navigation title | Runtime context |
| Eyebrow | Runtime helpers |

The public story is still event-first, but this is also the page for the helper APIs that depend on that model: `getFetchEvent()`, `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, `getTailEvent()`, `getContext()`, and the `env`, `ctx`, `event`, and `locals` exports from `devflare/runtime`. Your handler gets a rich event object, and Devflare stores a matching `RequestContext` in Node `AsyncLocalStorage` so those helpers can recover the active surface without threading the event through every layer.

#### At a glance

| Fact | Value |
| --- | --- |
| Context carrier | Node `AsyncLocalStorage` under Devflare-managed entrypoints |
| Main helpers | `getFetchEvent()`, `getQueueEvent()`, `getContext()`, `env`, `ctx`, `event`, and `locals` |
| Stored shape | `env`, `ctx`, `request`, `locals`, `type`, and the original event object |
| Mutable lane | `locals` / `event.locals` |
| Failure mode | Strict runtime helpers throw outside an active handler trail |

#### The AsyncLocalStorage-powered helpers are the whole point of this page

If you landed here because `getFetchEvent()` or `env.DB` worked in one place and exploded in another, this page should say that plainly: those APIs all depend on the same AsyncLocalStorage-backed `RequestContext`.

That includes the per-surface getters, the generic `getContext()` helper, and the runtime exports that feel global in app code but are really reading the active request or job context under the hood.

##### Reference table

| Helper family | Examples | What AsyncLocalStorage gives them |
| --- | --- | --- |
| Per-surface getters | `getFetchEvent()`, `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, `getTailEvent()` | Return the current rich event after verifying the active surface type; `.safe()` returns `null` instead of throwing. |
| Generic context getter | `getContext()` | Returns the active stored context shape when one exists and throws when code is running outside an active handler trail. |
| Readonly runtime proxies | `env`, `ctx`, `event` | Read the active environment bindings, execution context, or original event from the current AsyncLocalStorage store without parameter threading. |
| Mutable runtime proxy | `locals` | Reads and writes the per-request or per-job mutable storage object attached to the active context. |

> **Important — A practical reading guide**
>
> If the question in your head is “when can I safely call `getFetchEvent()` or read `env` without passing the event around?”, the rest of this page is answering exactly that.

#### Start with event-first handlers and let helpers discover the active event later

Event-first handlers keep runtime state explicit at the boundary and still let deeper helpers recover the current event later when plumbing it through every function call would be pure ceremony. That is the everyday job for helpers like `getFetchEvent()` and `locals`.

In normal application code you should not need to establish AsyncLocalStorage context manually. Devflare already does that for generated worker entrypoints, middleware, route dispatch, Durable Object wrappers, the dev server, and the built-in test helpers.

##### Example — Use the explicit event at the boundary and a getter inside the helper

This keeps the handler honest while still letting helper code read the active request and shared locals later in the same call trail.

###### File — src/fetch.ts

```ts
import { locals, type FetchEvent } from 'devflare/runtime'
import { currentPath } from './lib/current-path'

export async function fetch(event: FetchEvent): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()

	return Response.json({
		path: currentPath(),
		method: event.request.method,
		requestId: String(locals.requestId)
	})
}
```

###### File — src/lib/current-path.ts

```ts
import { getFetchEvent } from 'devflare/runtime'

export function currentPath(): string {
	return getFetchEvent().url.pathname
}
```

#### Devflare stores a full `RequestContext`, not just one request reference

Under the hood, Devflare creates `AsyncLocalStorage<RequestContext>()`. The stored value is richer than “the current request”: it keeps the active environment bindings, the current execution context or Durable Object state, an optional request, mutable locals, the runtime surface type, and the original event object.

That design is why the higher-level runtime APIs can stay small. Per-surface getters return the stored event when the active surface matches. The generic proxies read the same store without caring whether the call trail came from fetch, queue, scheduled, email, tail, or Durable Objects.

> **Note — The original event object is still preserved**
>
> Devflare does not discard the richer surface event after extracting a request or context. The original event stays on `context.event`, which is what the per-surface getters read later.

##### Example — Simplified shape of the value Devflare puts into AsyncLocalStorage

```ts
type RequestContext = {
	env: TEnv
	ctx: ExecutionContext | DurableObjectState | null
	request: Request | null
	locals: Record<string, unknown>
	type: RuntimeEventType
	event: EventContext<TEnv>
}
```

#### Devflare first creates a rich event, then runs the handler trail inside AsyncLocalStorage

For fetch, queue, scheduled, email, tail, and Durable Object surfaces, Devflare first creates a rich event object using helpers such as `createFetchEvent()`, `createQueueEvent()`, or the Durable Object event builders. It then builds a `RequestContext` from that event and runs the handler trail inside `storage.run(...)`.

The same mechanism is reused by generated worker entrypoints, request-wide middleware, route resolution, Durable Object wrappers, the dev server, and `createTestContext()` helpers such as `cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail`. That shared mechanism is why runtime helpers feel consistent in app code and test code.

##### Steps

1. Devflare builds the rich event object for the active surface.
2. It creates a `RequestContext` from `event.env`, `event.ctx`, `event.request ?? null`, `event.locals`, `event.type`, and the original event object.
3. It runs middleware, route resolution, or the surface handler inside `AsyncLocalStorage` with that context.
4. Deeper helpers call getters or proxies, which read the current store instead of receiving the event manually.
5. When the handler trail ends, the strict runtime helpers stop pretending context still exists.

> **Tip — One store is what keeps runtime behavior consistent**
>
> If a helper works in the dev server but not in tests, or vice versa, that is a bug. Devflare intentionally drives both through the same AsyncLocalStorage-backed context model.

##### Example — The important part of `runWithEventContext()` is small on purpose

```ts
const context = {
	env: event.env,
	ctx: event.ctx,
	request: event.request ?? null,
	locals: event.locals,
	type: event.type,
	event
}

return storage.run(context, fn)
```

#### Getters and proxies are just different ways of reading the same store

Pass the event explicitly at the top of the stack. Reach for getters or proxies only when you are deeper in the same handler trail and threading that event downward would make the code noisier than the value it adds.

This is also why strict runtime helpers throwing outside context is healthy: it stops top-level module code and random utility calls from pretending they are running inside a request when they are not.

##### Reference table

| API | What it reads | Failure behavior | Mutation |
| --- | --- | --- | --- |
| Handler parameters | The explicit event object Devflare passes to the handler boundary. | No lookup needed at the boundary. | `event.locals` is mutable. |
| Per-surface getters like `getFetchEvent()` | The stored `context.event` after Devflare verifies the active surface type. | Throws `ContextUnavailableError`, while `.safe()` returns `null`. | Readonly event view. |
| `getContext()` | The full active `RequestContext` object from the current AsyncLocalStorage store. | Throws `ContextUnavailableError` outside an active handler trail. | Use this mostly for debugging or advanced infrastructure helpers. |
| `env`, `ctx`, `event` proxies | `getContextOrNull()` through readonly proxy wrappers. | Property access throws `ContextAccessError` outside an active handler trail. | Readonly. |
| `locals` proxy | `getContextOrNull()?.locals` through the mutable context proxy. | Property access throws `ContextAccessError` outside an active handler trail. | Mutable and shared with `event.locals`. |

> **Important — A simple rule**
>
> Use explicit handler parameters first, getters second, proxies third, and mutable `locals` only for data that truly belongs to the current request or job.

#### The AsyncLocalStorage model covers more than fetch

Worker surfaces expose `event.ctx` as the current `ExecutionContext`. Durable Object surfaces expose `event.ctx` as the current `DurableObjectState`, and Devflare also aliases that same value as `event.state` for clarity.

For fetch and Durable Object fetch, Devflare augments the actual `Request` instance. For queue, scheduled, email, tail, and Durable Object WebSocket surfaces, it augments the native carrier object instead of replacing it with a fantasy wrapper. That is why the event-first API still feels like Cloudflare instead of a new platform.

This is why the runtime feels consistent across local dev, tests, route middleware, and Durable Object wrappers once you learn the model once.

##### Reference table

| Surface | Event shape | Getter |
| --- | --- | --- |
| HTTP worker | `FetchEvent` | `getFetchEvent()` |
| Queue consumer | `QueueEvent` | `getQueueEvent()` |
| Scheduled handler | `ScheduledEvent` | `getScheduledEvent()` |
| Inbound email | `EmailEvent` | `getEmailEvent()` |
| Tail handler | `TailEvent` | `getTailEvent()` |
| Durable Object fetch | `DurableObjectFetchEvent` | `getDurableObjectFetchEvent()` |
| Durable Object alarm | `DurableObjectAlarmEvent` | `getDurableObjectAlarmEvent()` |
| Durable Object WebSocket message / close / error | Dedicated WebSocket event types | `getDurableObjectWebSocketMessageEvent()`, `getDurableObjectWebSocketCloseEvent()`, `getDurableObjectWebSocketErrorEvent()` |

#### `locals` is the mutable storage lane, and it is isolated per context

Use `locals` for auth state, derived request data, request ids, or other values that belong to the current request or job and should be shared across middleware or helper layers.

Within one handler trail, `locals` and `event.locals` point at the same underlying object. Across requests and jobs, each context gets a fresh locals object so state does not bleed between invocations.

> **Warning — Mutate `locals`, not the readonly proxies**
>
> `env`, `ctx`, and `event` are readonly runtime views. If you need shared mutable state, put it on `locals` instead of trying to assign back into the underlying context objects.

##### Example — Write to `event.locals`, read from `locals` later in the same trail

###### File — src/fetch.ts

```ts
import { locals, sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('x-request-id', String(locals.requestId))
	return next
}

export const handle = sequence(requestId)
```

#### Context is not available everywhere, and that is intentional

##### Key points

- Module top-level code runs at cold start, not inside a request or job, so strict runtime helpers are unavailable there.
- Callbacks that run after the handler trail ends should take explicit inputs instead of assuming context is still alive.
- Timer callbacks like `setTimeout()` and `setInterval()` are outside the normal Devflare-managed handler trail.
- Per-surface getters and `getContext()` throw `ContextUnavailableError`, while proxy property access such as `env.DB` or `locals.userId` throws `ContextAccessError` naming the missing property.
- If you are unsure whether the matching surface is active, prefer `.safe()` accessors such as `getFetchEvent.safe()` over catching thrown errors.
- If runtime context access fails unexpectedly while bypassing Devflare-generated config or harnesses, verify that the Worker still includes the AsyncLocalStorage compatibility flags Devflare normally adds for you.

> **Note — The fix is usually simpler than the error feels**
>
> Move the context access inside the handler, middleware, or helper that is called from that handler trail. If there is no active trail, take explicit inputs instead of hoping context exists.

#### `runWithEventContext()` and `runWithContext()` are advanced helpers, not normal app code

By the time you are considering these helpers, the normal app-facing story should already be working: handlers, middleware, generated entrypoints, and `createTestContext()` establish context for you. These APIs exist for runtime and test infrastructure that must preserve or synthesize that context deliberately.

`runWithEventContext(event, fn)` preserves an existing rich event object. `runWithContext(env, ctx, request, fn, type)` is the lower-level compatibility helper: it creates fresh locals, synthesizes a default event with `createDefaultEvent()`, and then stores that event in AsyncLocalStorage before running your function.

> **Warning — Do not reach for the escape hatch by habit**
>
> If you are writing app code instead of runtime or test infrastructure, pass the event into your handler and let Devflare establish the context automatically.

---

### Compose request-wide middleware with `sequence(...)` instead of burying flow control inside one big fetch file

> Use `sequence(...)` from `devflare/runtime` when broad HTTP concerns must wrap route resolution or another fetch handler in a clear top-to-bottom order.

| Field | Value |
| --- | --- |
| Route | [`/docs/sequence-middleware`](/docs/sequence-middleware) |
| Group | Devflare |
| Navigation title | sequence(...) |
| Eyebrow | Runtime helper |

Devflare treats request-wide middleware as a first-class runtime primitive. `sequence(...)` composes `(event, resolve)` middleware for workers, keeps broad concerns readable, and still preserves compatibility with the older handler-composition form.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Request-wide concerns that should wrap routes or another fetch handler cleanly |
| Primary signature | `(event, resolve) => Response` |
| Good pairing | `src/fetch.ts` plus `src/routes/**` leaf handlers |

#### Use `sequence(...)` for the broad concerns that should wrap the whole HTTP flow

The cleanest use of `sequence(...)` is broad request-wide behavior: CORS, auth guards, request ids, logging, response shaping, or any other concern that should wrap route resolution instead of being reimplemented in each leaf handler.

That keeps `src/fetch.ts` focused on the global HTTP contract while route files stay small and URL-specific.

##### Example — A small global middleware chain

###### File — src/fetch.ts

```ts
import { sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function cors(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
			}
		})
	}

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('Access-Control-Allow-Origin', '*')
	return next
}

export const handle = sequence(cors)
```

###### File — src/routes/users/[id].ts

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ params }: FetchEvent): Promise<Response> {
	return Response.json({ id: params.id })
}
```

#### Use the chain for broad concerns, not leaf business logic

##### Highlights

- **Good fit** — CORS, auth checks, request ids, logging, response headers, or other concerns that should apply before or after the final leaf handler.
- **Usually the wrong fit** — Business logic that only matters for one URL. If it is leaf-specific, keep it in the matched route file instead of global middleware.

> **Important — The split should stay boring**
>
> Global middleware should read like app policy. Route files should read like one URL at a time. If those blur together, the HTTP layer gets harder to review than it needs to be.

#### Understand what `resolve(event)` actually means

Calling `resolve(event)` continues into the next middleware in the chain, or into the matched route/module-level handler once no more middleware remains. That makes the order of the chain explicit instead of hidden inside nested helper calls.

`resolve(event)` may also receive a replacement `FetchEvent`. That is the supported way for middleware to forward a modified request, preserved params, or updated locals into the next stage deliberately.

If you need to keep compatibility with older Devflare code, `sequence(...)` still supports the legacy handler-composition form, but the `(event, resolve)` shape is the modern one to prefer for worker HTTP flows.

##### Key points

- `fetch` and `handle` are aliases for the primary fetch entry, so export one or the other, not both.
- Same-module method handlers and route resolution happen after the sequence chain passes control onward.
- If you are composing SvelteKit hooks, that uses SvelteKit’s own `sequence` helper; it is a separate abstraction from `devflare/runtime` middleware composition.

> **Warning — One primary fetch entry per module**
>
> Devflare rejects ambiguous primary fetch modules. Export either `fetch` or `handle` (or one default equivalent), not several competing entrypoints.

---

### Use `src/transport.ts` when local RPC-style bridge calls must round-trip custom classes cleanly

> Most workers do not need a transport file. Add one when Devflare’s local RPC-style bridge must encode and decode custom values, especially across Durable Object method calls in tests.

| Field | Value |
| --- | --- |
| Route | [`/docs/transport-file`](/docs/transport-file) |
| Group | Devflare |
| Navigation title | transport.ts |
| Eyebrow | Runtime transport |

`src/transport.ts` is Devflare’s custom serialization hook for local RPC-style bridge calls, especially the Durable Object round-trips Devflare manages in tests. It customizes the serialization layer for that bridge; it is not a replacement for ordinary fetch request or response handling. Its job is to let values that would otherwise collapse into plain JSON be rebuilt as real class instances on the caller side.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Bridge-backed Durable Object results that return custom classes |
| Usually unnecessary | Strings, numbers, arrays, and plain JSON objects |
| Disable rule | `files.transport: null` |

#### Reach for it only when local RPC-style bridge calls must preserve real classes

Most workers do not need a transport file because plain data already crosses the bridge naturally.

Add `src/transport.ts` when a local RPC-style bridge call returns a custom class instance and you want the caller to receive that class again instead of a plain object.

##### Highlights

- **Good fit** — A Durable Object method or another Devflare-managed RPC boundary returns a small domain value like `Money`, `DoubleableNumber`, or another class with behavior you want to keep intact.
- **Usually unnecessary** — The handler or RPC call returns plain strings, numbers, arrays, or JSON objects that do not need custom decode logic.

> **Note — Think “bridge-backed RPC”, not “normal JSON responses”**
>
> This file matters when Devflare is proxying values across its local RPC bridge. It is not a replacement for ordinary Worker request or response serialization.

#### Export one named `transport` object with small encode and decode pairs

Keep each entry boring and explicit: detect one value shape, encode it into plain data, and decode that data back into the class on the caller side.

##### Key points

- Return `false` or `undefined` from `encode` when the value is not a match.
- Keep the encoded payload plain and JSON-friendly.
- Use one transport key per value type so decoding stays obvious in code review.

##### Example — Keep the transport file next to the class it knows how to round-trip

The transport file teaches Devflare how to turn a custom class into plain data for the bridge, then rebuild that class for the caller.

###### File — src/DoubleableNumber.ts

```ts
export class DoubleableNumber {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double() {
		return this.value * 2
	}
}
```

###### File — src/transport.ts

```ts
import { DoubleableNumber } from './DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) =>
			value instanceof DoubleableNumber ? value.value : false,
		decode: (value: number) => new DoubleableNumber(value)
	}
}
```

###### File — src/do.counter.ts

```ts
import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}
```

#### A tiny test is still the easiest proof of the round-trip

> **Tip — Keep the first proof small**
>
> If the transport works, you should be able to prove it with one class, one method call, and one `instanceof` assertion before you hide it inside bigger helpers.

##### Example — Test the round-trip, not just the numeric value

###### File — tests/counter.test.ts

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import { DoubleableNumber } from '../src/DoubleableNumber'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('custom transport restores the class instance', async () => {
	const result = await env.COUNTER.getByName('main').increment(2)

	expect(result).toBeInstanceOf(DoubleableNumber)
	expect(result.value).toBe(2)
	expect(result.double).toBe(4)
})
```

#### Know the autodiscovery and disable rules

##### Key points

- Use the conventional `src/transport.{ts,js,mts,mjs}` path when you want the default location.
- Use `files.transport` when the transport file lives somewhere else.
- Set `files.transport: null` when you want to disable the convention explicitly for a package.
- If the file exists but does not export a named `transport` object, Devflare warns and continues without custom transport decoding.

> **Warning — Do not treat the warning as success**
>
> If Devflare warns that the file does not export a named `transport` object, custom decode is off. The test may still run, but your class round-trip will not.

##### Example — Point at a custom transport path when the convention is not enough

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'transport-example',
	files: {
		fetch: 'src/fetch.ts',
		transport: 'src/transport.ts'
	}
})
```

##### Example — Disable transport autodiscovery explicitly

```ts
files: {
	transport: null
}
```

---

### Why Devflare tests feel like using the worker instead of mocking around it

> Devflare’s standout testing trick is that the same config, bindings, env surface, runtime helpers, and even direct Durable Object method calls can stay available in Bun tests without a hand-built fake layer in the middle.

| Field | Value |
| --- | --- |
| Route | [`/docs/why-testing-feels-native`](/docs/why-testing-feels-native) |
| Group | Devflare |
| Navigation title | Why tests feel native |
| Eyebrow | Testing advantage |

The experience feels better because Devflare does more than boot Miniflare. `createTestContext()` loads the nearest config, wires the real worker surfaces, installs runtime-shaped helper entrypoints, and bridges Node or Bun test code back into the worker world so `env`, `cf.*`, and bridge-backed Durable Object calls keep the same mental model.

#### At a glance

| Fact | Value |
| --- | --- |
| Big selling point | Tests can stay worker-shaped instead of mock-shaped |
| Core trick | `createTestContext()` plus a unified `env` proxy and bridge-backed bindings |
| Durable Object experience | Direct `env.COUNTER.getByName(...).increment()` calls in tests |
| Optional extra | `src/transport.ts` when bridge-backed calls must round-trip custom classes |

#### The experience feels better because Devflare removes a whole fake layer

A lot of Worker testing feels split-brain. One layer of code is written against real bindings and Worker surfaces, then the tests either fake those APIs by hand or retreat to heavier integration paths for everything.

Devflare tries to keep one authored story instead. The same config that boots the app can boot the test harness, the same `env` import can keep working, and bridge-backed bindings can cross from Bun back into the worker world without forcing every test to speak raw HTTP or a custom mock vocabulary.

##### Highlights

- **One config** — `createTestContext()` loads the same `devflare.config.*` model the app uses instead of a second test-only binding map.
- **One env surface** — The unified `env` proxy uses request context in handlers, test context in tests, and the bridge when code needs to reach Miniflare-backed bindings.
- **One set of helper surfaces** — `cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail` trigger the same handler families your package actually owns.
- **One honest Durable Object story** — Direct `env.MY_DO.getByName(...).method()` calls work in tests, so stateful code does not need a fake facade just to become testable.

> **Important — This is a real selling point**
>
> Devflare is at its best when a test can read like app code instead of a ceremony for building a fake Cloudflare universe first.

#### The bridge is the difference, but it is not the only layer doing useful work

The seamless part comes from several layers cooperating: config autodiscovery, the unified `env` proxy, runtime-shaped helper entrypoints, AsyncLocalStorage-backed event context, and bridge proxies that forward binding calls into the local worker world.

That is also why Devflare testing scales beyond one fetch route. The same system can cover direct binding calls, queue and scheduled helpers, Tail events, and bridge-backed Durable Object or service interactions without making you rewire the whole harness every time the package grows a new surface.

##### Key points

- Service binding refs and cross-worker Durable Object refs can trigger extra worker resolution automatically, so multi-worker tests still begin from the same config model.
- For single-worker tests, the bridge-backed env proxy is the normal path. For multi-worker refs, `createTestContext()` can boot the extra workers directly through Miniflare worker configuration.
- The bridge is there to remove translation pain, not to make the test vocabulary magical or mysterious.

##### Reference table

| Layer | What Devflare wires | Why it feels smoother |
| --- | --- | --- |
| `createTestContext()` | Finds the nearest config, boots Miniflare, discovers worker surfaces, and prepares bindings from the same authored project shape. | The harness starts where the app starts instead of from a separate test-only setup story. |
| Unified `env` proxy | Prefers request-scoped env, then test-context env, then bridge-backed env access. | One `import { env } from 'devflare'` can stay valid across app code, tests, and local bridge-backed flows. |
| `cf.*` helpers | Create runtime-shaped fetch, queue, scheduled, email, and tail events/controllers and install them into AsyncLocalStorage before user code runs. | Helpers such as `getFetchEvent()` and `locals` keep working in tests instead of only in real requests. |
| Bridge proxies | Route KV, D1, R2, Durable Object, queue, service, and send-email calls into the local worker world. | Bindings can be exercised through their real shapes instead of custom in-memory fakes. |
| Transport hooks | Optionally encode and decode custom values for local RPC-style bridge calls. | A Durable Object method can return a real class again on the caller side when that behavior matters. |

#### This is the part that usually sells people: a Durable Object method can feel native in a test

One of Devflare's nicest testing moves is that a Durable Object method can be called straight from the test through `env.COUNTER.getByName('main').increment(2)` instead of forcing you through a fake stub or an HTTP wrapper route.

When the return value is more than plain JSON, `src/transport.ts` can keep the bridge honest by rebuilding the real class on the caller side. That is how a local test can still receive a `DoubleableNumber` with working instance behavior instead of a flattened object.

> **Tip — The bridge disappears when it is working well**
>
> That is the real win. You still benefit from the bridge, but the test itself mostly reads like “boot the worker, call the thing, assert the domain value.”

##### Example — The test reads like app code, not like bridge setup

This mirrors the integration behavior Devflare proves itself: config autodiscovery, a direct Durable Object method call, and a custom class round-trip through `transport.ts`.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'counter-worker',
	compatibilityDate: '2026-03-17',
	files: {
		durableObjects: 'src/do.counter.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter', scriptName: 'do.counter.ts' }
		}
	}
})
```

###### File — src/DoubleableNumber.ts

```ts
export class DoubleableNumber {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double(): number {
		return this.value * 2
	}
}
```

###### File — src/transport.ts

```ts
import { DoubleableNumber } from './DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) =>
			value instanceof DoubleableNumber ? value.value : false,
		decode: (value: number) => new DoubleableNumber(value)
	}
}
```

###### File — src/do.counter.ts

```ts
import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}
```

###### File — tests/counter.test.ts

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import { DoubleableNumber } from '../src/DoubleableNumber'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('Durable Object methods feel native in tests', async () => {
	const result = await env.COUNTER.getByName('main').increment(2)

	expect(result).toBeInstanceOf(DoubleableNumber)
	expect(result.value).toBe(2)
	expect(result.double).toBe(4)
})
```

#### The same smooth story extends beyond plain HTTP

That range is why the testing story feels bigger than one fetch helper. Devflare is not only helping you send requests; it is helping your tests talk to the same worker-owned surfaces your app logic actually depends on.

When the package grows queues, schedules, email handlers, or Tail processing, the harness grows with the same worker-shaped mindset instead of forcing a whole new testing abstraction for each runtime surface.

##### Highlights

- **createTestContext()** — Open this when the next question is the exact helper behavior, autodiscovery rules, or background-work timing. ([link](/docs/create-test-context))
- **transport.ts** — Open this when the next question is how to preserve real class instances across a local bridge-backed RPC call. ([link](/docs/transport-file))
- **Binding testing guides** — Jump here when the binding is already chosen and the only remaining question is the most honest test posture for that binding. ([link](/docs/binding-testing-guides))

##### Reference table

| Surface | What the test calls | What Devflare keeps aligned |
| --- | --- | --- |
| Routes and fetch middleware | `cf.worker.get()` or `cf.worker.fetch()` | Request shape, route params, and AsyncLocalStorage-backed fetch context. |
| Queue consumers | `cf.queue.trigger()` | Batch shape, retry or ack behavior, and queued `waitUntil()` work. |
| Scheduled jobs | `cf.scheduled.trigger()` | Cron controller shape, scheduled context, and background work timing. |
| Email and tail handlers | `cf.email.send()` and `cf.tail.trigger()` | Handler-style invocation with the right local helper semantics instead of custom throwaway scaffolding. |
| Bindings and Durable Object methods | `env.DB`, `env.CACHE`, `env.FILES`, or `env.COUNTER.getByName(...).increment()` | The same binding contract app code uses, optionally with transport-backed custom value round-trips. |

#### The pitch gets stronger when the caveats stay visible too

##### Key points

- `cf.worker.fetch()` returns when the handler resolves, so some `waitUntil()` side effects may still be running afterward.
- `transport.ts` is for bridge-backed RPC-style calls, not a replacement for normal HTTP request or response serialization.
- Remote-heavy bindings such as AI and Vectorize still need higher-fidelity or remote checks sooner than KV, D1, R2, or many Durable Object flows do.
- Preview and CI validation still matter for Cloudflare ingress, routing, and deployment lifecycle questions that local tests do not pretend to answer completely.

> **Warning — Smooth local tests are the default, not the whole verification plan**
>
> Devflare makes honest local tests much easier, but it does not claim that every Cloudflare behavior is now a unit test. The strong story is “less mocking, more truthful local coverage, then higher-fidelity checks when the question changes.”

---

### Use one testing map so you know which Devflare page answers which testing question

> Devflare’s testing story is layered on purpose: start with one real unit test, use `createTestContext()` and `cf.*` for the runtime-shaped harness, then jump to binding-specific guides or CI-focused pages only when the question changes.

| Field | Value |
| --- | --- |
| Route | [`/docs/testing-overview`](/docs/testing-overview) |
| Group | Devflare |
| Navigation title | Testing overview |
| Eyebrow | Testing map |

The docs already explain starter tests, harness behavior, runtime-context caveats, transport round-trips, binding-specific testing, and automation. This page gathers those lanes into one map so you can open the right testing page first instead of re-deriving the docs structure from memory.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Finding the right testing doc before you disappear into the wrong rabbit hole |
| Default harness | `createTestContext()` plus `cf.*` helpers |
| Binding-specific docs | At the bottom of each binding overview page and in the binding testing index |
| Automation lane | `/docs/testing-and-automation` for CI, preview checks, and workflow feedback |

#### Start with one honest proof before you optimize the testing story

The safest Devflare testing habit is boring: prove one worker path with one real request first, then only add more harness machinery when a binding, background surface, or preview concern genuinely needs it.

That is why the docs split testing into layers. A starter request test, a runtime-shaped harness page, binding-specific testing guides, and a CI/automation page each answer different questions. Trying to make one page carry all of that usually makes the guidance worse.

##### Key points

- If the worker cannot answer one truthful request, the next testing abstraction is probably not the rescue mission you need.
- Start route-level when the app behavior is the point, and binding-level when the binding itself is the point.
- Keep one small proof test around even after the suite grows so the runtime contract stays visible.

##### Example — The boring first loop is still the right default

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET /health proves the worker boots', async () => {
	const response = await cf.worker.get('/health')
	expect(response.status).toBe(200)
})
```

#### Open the page that matches the question you actually have

##### Highlights

- **Why tests feel native** — Open this when the question is less “how do I use the harness?” and more “why does Devflare testing feel so much smoother than the usual Worker setup?” ([link](/docs/why-testing-feels-native))
- **Your first unit test** — Use this when the goal is simply to prove a worker boots, answers one request, and can be exercised through the real Devflare test harness. ([link](/docs/first-unit-test))
- **createTestContext()** — Use this when you need the real worker-shaped harness, autodiscovered surfaces, helper timing rules, and the `cf.*` testing helpers. ([link](/docs/create-test-context))
- **Binding testing guides** — Use this when the binding already exists and the open question is how to test KV, D1, R2, Queues, Durable Objects, AI, Vectorize, or another binding honestly. ([link](/docs/binding-testing-guides))
- **Runtime context** — Open this when missing-context errors, getters, or runtime proxies are making tests feel harder to trace than they should. It explains the AsyncLocalStorage-backed context model the helpers depend on. ([link](/docs/runtime-context))
- **transport.ts** — Open this when a test needs a bridge-backed RPC call to return a real class instance instead of collapsing into plain JSON. ([link](/docs/transport-file))
- **Testing & automation** — Use this page when the question changes from local test harness behavior to CI workflows, preview checks, and observable automation. ([link](/docs/testing-and-automation))

#### The right testing layer depends on what changed

##### Reference table

| If the question is... | Open this page first | Why |
| --- | --- | --- |
| Can I prove the worker answers one real request? | `Your first unit test` | It keeps the first check small and prevents the harness from becoming accidental ceremony. |
| Why does Devflare testing feel smoother than the usual Worker setup? | `Why tests feel native` | It explains the unified env, bridge-backed bindings, AsyncLocalStorage-backed helper surfaces, and direct Durable Object story. |
| How does the default runtime-shaped harness behave? | `createTestContext()` | It documents autodiscovery, `cf.*`, helper timing, and when the harness waits for background work. |
| How should I test this specific binding? | `Binding testing guides` | Each binding has its own testing page with the right default harness and escalation path. |
| Why are getters or proxies failing in a test? | `Runtime context` | The runtime-context page explains the AsyncLocalStorage-backed model underneath the helper APIs. |
| Why is a custom class not round-tripping in a test? | `transport.ts` | Transport docs explain the extra serialization hook for bridge-backed calls. |
| How should this fit into CI or preview validation? | `Testing & automation` | Automation guidance belongs on the CI-facing page, not in the local harness docs. |

> **Note — One page per question is a feature**
>
> Devflare’s testing docs are intentionally split so starter tests, binding nuance, runtime context, and automation do not blur into one giant advice blob.

#### Binding-specific testing pages already exist — they were just easy to miss

Each binding overview page already ends with a “Go deeper” section that links its hidden internals, testing, and example pages. That means the binding-specific testing content is already in the library, but it was discoverable mostly if you were already reading the right binding page.

Use the binding testing index when you know which binding changed and want the testing guide directly. Use the binding overview page first when you still need the authoring shape, runtime contract, or preview story before the tests make sense.

##### Highlights

- **Binding testing guides** — Jump straight to the testing page for KV, D1, R2, Durable Objects, Queues, AI, Vectorize, Hyperdrive, Browser Rendering, Analytics Engine, or Send Email. ([link](/docs/binding-testing-guides))

##### Key points

- Open the binding overview page when you need config or runtime context first.
- Open the binding testing page when the binding already exists and the question is purely about the right harness or escalation path.
- Remote-oriented bindings like AI and Vectorize deliberately have a different testing posture from KV or D1, and the testing guides say that out loud.

---

### Use `createTestContext()` and `cf.*` as the default runtime-shaped test harness

> Start tests with `createTestContext()` so the same config, bindings, routes, and handler surfaces the app uses in real runtime flows are available in Bun tests.

| Field | Value |
| --- | --- |
| Route | [`/docs/create-test-context`](/docs/create-test-context) |
| Group | Devflare |
| Navigation title | createTestContext() |
| Eyebrow | Test harness |

Devflare’s recommended test story is not a pile of hand-built mocks. `createTestContext()` loads the nearest supported config, wires the local runtime surface, and gives you `cf.*` helpers that feel like the Worker entrypoints the app actually uses.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Runtime-shaped tests that should stay close to the real worker surface |
| Default harness | `createTestContext()` plus `cf.*` helpers |
| Optional extra | `src/transport.ts` for custom class round-trips across local RPC-style bridge calls, especially Durable Object methods |

#### Let the harness discover the normal worker shape first

When you omit the config path, `createTestContext()` walks upward from the calling test file and finds the nearest supported config filename. It then autodetects the conventional worker surfaces that belong to that package instead of making you wire each one by hand.

That is the main reason the built-in harness scales: the same config and file conventions keep working as the package gains routes, queues, scheduled handlers, inbound email, or tail handlers.

##### Key points

- Config path autodiscovery starts from the calling test file when you omit the argument.
- Conventional files such as `src/fetch.ts`, `src/routes/**`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts`, and `src/tail.ts` are discovered automatically when present.
- Service bindings and other config-driven runtime surfaces are discovered from the same authored config instead of a separate test-only schema.
- If a local RPC-style bridge call under test later needs custom class round-trips, the harness can also discover `src/transport.{ts,js,mts,mjs}` automatically.

#### Know which helpers wait for background work and which do not

These helpers are runtime-shaped and context-accurate for handler logic, but they do not try to recreate every internal Cloudflare dispatch step byte for byte. That is why their timing rules are documented explicitly instead of being left to guesswork.

##### Reference table

| Helper | Current behavior |
| --- | --- |
| `cf.worker.fetch()` | Returns when the handler resolves and does not eagerly wait for all `waitUntil()` work. |
| `cf.queue.trigger()` | Waits for queued background work before it returns. |
| `cf.scheduled.trigger()` | Waits for scheduled background work before it returns. |
| `cf.email.send()` | In `createTestContext()` tests, directly invokes the configured local email handler and waits for its queued `waitUntil()` work; otherwise it falls back to the local email endpoint. |
| `cf.tail.trigger()` | Works when `src/tail.ts` exists, supports a default or named `tail` export, and waits for the handler plus its `waitUntil()` work before it returns. |

> **Warning — Do not assert the wrong timing contract**
>
> If a test depends on `waitUntil()` side effects being complete, a plain `cf.worker.fetch()` assertion may be too early. Either assert the side effect directly or move that check into a higher-fidelity path.

#### Tail handlers are testable even before they become a public config lane

Tail support is already a real helper surface in the harness even though it still sits outside the public `files.*` config keys. When `createTestContext()` finds `src/tail.ts`, it wires `cf.tail.trigger()` automatically and runs the handler inside the same AsyncLocalStorage-backed event context as the other helpers.

The handler can export a default function or a named `tail` function. The helper accepts either full trace items or smaller option objects through `cf.tail.create(...)`, then waits for the handler and any queued `waitUntil()` work before it returns.

##### Key points

- Keep `src/tail.ts` as a conventional file for now; there is still no public `files.tail` config key.
- Use `cf.tail.create()` when the test only needs a few trace fields, and pass full trace items when the payload details are the point of the assertion.
- Reach for a higher-fidelity integration path when the question is Cloudflare ingress behavior rather than your own log or trace handling logic.

> **Warning — Supported helper, still a special-case surface**
>
> Tail support is real in the harness and runtime context model, but it is intentionally not documented like fetch, queue, scheduled, or email config yet because there is still no public `files.tail` key.

##### Example — A tiny tail handler plus one honest harness test

###### File — src/tail-state.ts

```ts
export const seenScripts: string[] = []
```

###### File — src/tail.ts

```ts
import type { TailEvent } from 'devflare/runtime'
import { seenScripts } from './tail-state'

export async function tail({ events }: TailEvent): Promise<void> {
	for (const item of events) {
		seenScripts.push(item.scriptName)
	}
}
```

###### File — tests/tail.test.ts

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'
import { seenScripts } from '../src/tail-state'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('tail handler sees trace items', async () => {
	seenScripts.length = 0

	const result = await cf.tail.trigger([
		cf.tail.create({
			scriptName: 'jobs-worker',
			logs: [{ level: 'error', message: ['queue failed'], timestamp: Date.now() }]
		})
	])

	expect(result.success).toBe(true)
	expect(seenScripts).toEqual(['jobs-worker'])
})
```

#### Start with one small proof test before layering helpers on top

> **Tip — Keep the first test boring**
>
> If the harness is working, you should be able to prove one route or handler path quickly before you hide it behind bigger factory helpers or shared test setup.

##### Example — A minimal runtime-shaped test

###### File — tests/worker.test.ts

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('worker runtime', () => {
	test('routes through the built-in router', async () => {
		const response = await cf.worker.get('/users/123')
		expect(response.status).toBe(200)
	})
})
```

#### Add `transport.ts` only when local RPC-style bridge calls in tests must preserve custom classes

Most `createTestContext()` tests do not need a transport file because strings, numbers, arrays, and plain JSON objects already cross the bridge naturally.

Reach for `src/transport.ts` when a local RPC-style bridge call returns a real class instance and the caller needs that class again instead of a plain object. In practice that is most often a Durable Object method round-trip inside `createTestContext()`, not an ordinary HTTP response.

##### Key points

- Keep the encoded payload plain and JSON-friendly.
- Use one small transport entry per value type so decode rules stay reviewable.
- Set `files.transport: null` when you want to disable the convention explicitly for one package.

#### Know where to go when the harness is only part of the question

##### Highlights

- **Testing overview** — Use the overview page when you are not sure whether the next question belongs to starter tests, binding-specific guides, runtime helpers, or CI. ([link](/docs/testing-overview))
- **Binding testing guides** — Jump straight to the binding-specific testing page when KV, D1, R2, Durable Objects, Queues, AI, or another binding needs a more specific test story. ([link](/docs/binding-testing-guides))
- **Runtime context** — Read this when getter failures, missing context, or proxy behavior are making the test harness harder to trace than it should be. ([link](/docs/runtime-context))
- **Testing & automation** — Use the CI-facing page when the question becomes preview validation, workflow structure, or what should happen in automation instead of local tests. ([link](/docs/testing-and-automation))

> **Note — The harness is the center, not the whole map**
>
> `createTestContext()` is the default test loop, but binding-specific caveats, runtime-context rules, and automation concerns still belong on their own pages.

---

### Open the right binding testing guide instead of reconstructing the test story from scratch

> Every binding overview page already links a hidden testing guide. This page collects those guides in one place so you can jump straight to the right harness, caveats, and escalation path for the binding that changed.

| Field | Value |
| --- | --- |
| Route | [`/docs/binding-testing-guides`](/docs/binding-testing-guides) |
| Group | Devflare |
| Navigation title | Binding testing |
| Eyebrow | Testing index |

Binding testing is not one-size-fits-all. KV, D1, R2, Durable Objects, Queues, and several other bindings are strong local-first stories, while AI, Vectorize, and a few infrastructure-heavy bindings need more remote or higher-fidelity checks sooner. Use this page when you know the binding but do not want to hunt through the whole binding library first.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Jumping straight to the right binding-specific testing guide |
| Where the links also live | At the bottom of each binding overview page in the “Go deeper” section |
| Default pattern | Usually `createTestContext()` plus the real binding or helper surface |
| Notable exceptions | AI and Vectorize are remote-oriented, and some other bindings need higher-fidelity checks sooner |

#### Use this page as the index, but remember where the links already live

The binding library intentionally keeps only the main binding overview pages visible in the sidebar. The testing pages are still real docs pages, but they stay linked from the bottom of each binding overview so the sidebar does not turn into a twelve-level nesting doll.

That is great once you already opened the right binding page. This index is for the opposite moment: you know the binding that changed and you want the testing guide immediately.

##### Highlights

- **Testing overview** — Use the broader testing map when you are not yet sure whether the next question belongs to starter tests, binding guides, runtime context, or automation. ([link](/docs/testing-overview))

##### Key points

- Open the binding overview page first when you need authoring, runtime, or preview context before the tests make sense.
- Open the testing guide first when the binding already exists and the only remaining question is how to test it honestly.
- Use `Testing overview` when you need the bigger map across starter tests, harness behavior, binding guides, runtime helpers, and automation.

#### Open the testing guide for the binding that actually changed

##### Highlights

- **Testing KV** — Use the default test harness first. KV is one of the bindings Devflare supports best in local tests. Open the KV overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/kv-testing))
- **Testing D1** — D1 is one of the easiest bindings to test meaningfully with Devflare because the local runtime already speaks the same database API your worker uses. Open the D1 overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/d1-testing))
- **Testing R2** — R2 is local-friendly, which means you can test real object operations without inventing a storage adapter just to get off the ground. Open the R2 overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/r2-testing))
- **Testing Durable Objects** — Durable Objects are well-supported in the default Devflare harness, which means you can test real object behavior without hand-building a fake namespace first. Open the Durable Objects overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/durable-object-testing))
- **Testing Queues** — Queue testing is one of the places where Devflare’s helper surface feels especially good because the queue trigger already knows how to drive the real handler shape. Open the Queues overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/queue-testing))
- **Testing AI** — The right AI test strategy is selective: use remote mode when you mean to test inference, and skip cleanly when the environment is not allowed to do that. Open the AI overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/ai-testing))
- **Testing Vectorize** — The right Vectorize tests are targeted remote checks: a small insert or query, a clear skip condition, and a real index behind the binding. Open the Vectorize overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/vectorize-testing))
- **Testing Hyperdrive** — Hyperdrive testing should start smaller and more cautiously than D1 testing: prove the binding exists, then add targeted integration where the real database path matters. Open the Hyperdrive overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/hyperdrive-testing))
- **Testing Browser Rendering** — Browser tests should usually be integration-flavored: either drive the worker in dev or exercise a thin smoke path that proves the binding can launch and fetch. Open the Browser Rendering overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/browser-testing))
- **Testing Analytics Engine** — Analytics Engine tests should stay thin: verify that the worker writes a data point, not that you can recreate Cloudflare analytics locally. Open the Analytics Engine overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/analytics-engine-testing))
- **Testing Send Email** — Send Email is stronger locally than many platform-service bindings because outbound email can be exercised in the default harness, while inbound email has its own related helper surface. Open the Send Email overview first when you need the full binding story, or jump straight here when the only open question is how to test it honestly. ([link](/docs/send-email-testing))

#### The testing posture is not identical for every binding

##### Reference table

| Binding | Testing posture | Default harness |
| --- | --- | --- |
| KV | First-class local runtime and tests | `createTestContext()` plus `env.CACHE` or `cf.worker.fetch()` |
| D1 | First-class local runtime and tests | `createTestContext()` with `env.DB` or `cf.worker.fetch()` |
| R2 | First-class local runtime and tests | `createTestContext()` with `env.ASSETS` or `cf.worker.fetch()` |
| Durable Objects | First-class local runtime and tests, including cross-worker references | `createTestContext()` with the real DO namespace in `env` |
| Queues | First-class local runtime and queue-trigger tests | `createTestContext()` plus `cf.queue.trigger()` |
| AI | Remote-oriented; local tests require remote mode | `createTestContext()` after remote mode is enabled, plus `shouldSkip.ai` |
| Vectorize | Remote-oriented; local tests require remote mode or explicit mocks | `createTestContext()` in remote mode plus `shouldSkip.vectorize` |
| Hyperdrive | Supported, but with a narrower proven local test story | `createTestContext()` plus small binding or smoke checks |
| Browser Rendering | Supported, but the strongest story is dev server and integration rather than a dedicated test helper | A narrow browser route exercised through the dev server, a preview URL, or another integration-style path |
| Analytics Engine | Supported, but usually tested through integration or thin mocks | A thin worker test or explicit mock around `writeDataPoint()` |
| Send Email | First-class outbound local support; distinct from inbound email event testing | `createTestContext()` plus `env.TRANSACTIONAL_EMAIL.send(...)` |

> **Warning — Different defaults are a good thing**
>
> KV, D1, R2, and Queues should not be documented like remote AI inference, and remote AI inference should not be documented like local KV. The different testing guides are there to keep those truths visible.

---

### Render Svelte inside worker bundles by putting the compiler in Rolldown, not the app shell

> When a worker-only fetch surface or Durable Object imports `.svelte`, add the Svelte compiler to `rolldown.options.plugins`. That compilation belongs to Devflare’s worker bundler, not the main Vite plugin chain.

| Field | Value |
| --- | --- |
| Route | [`/docs/svelte-with-rolldown`](/docs/svelte-with-rolldown) |
| Group | Devflare |
| Navigation title | Svelte in workers |
| Eyebrow | Frameworks |

This is the right path when the worker itself renders or consumes Svelte components. Keep the package in worker-only mode if that is all you need, then extend Devflare’s Rolldown pipeline with the Svelte plugins that make those imports compile cleanly.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Worker-only fetch surfaces or Durable Objects that import `.svelte` |
| Key extension point | `rolldown.options.plugins` |
| Rendering shape | SSR-style component compilation inside the worker bundle |

#### Use this path when the worker imports the component

If your worker entry, route module, queue consumer, scheduled handler, or Durable Object imports a `.svelte` file directly, Devflare treats that as a worker bundling concern. The correct place to teach the build how to compile it is the Rolldown pipeline that Devflare owns for worker bundles.

That means you do not need to promote the whole package into a Vite app just because one worker module wants Svelte-based rendering. Worker-only mode remains the intended default until the package truly needs an outer app host.

> **Note — Keep the ownership line clean**
>
> Vite owns the outer app shell when one exists. Rolldown owns the worker code that Devflare bundles itself. Worker-rendered Svelte belongs to the second bucket.

#### Add Svelte to Rolldown options

##### Key points

- `emitCss: false` keeps the worker bundle single-file instead of emitting a CSS asset pipeline the worker cannot naturally serve by itself.
- `generate: `ssr`` fits worker-side rendering better than a browser DOM target.
- `@rollup/plugin-node-resolve` helps `.svelte` files and `exports.svelte` packages resolve cleanly.

##### Example — Install the worker-side Svelte toolchain

```bash
bun add -d svelte rollup-plugin-svelte @rollup/plugin-node-resolve
```

##### Example — Configure Svelte in `rolldown.options.plugins`

```ts
import { defineConfig } from 'devflare/config'
import resolve from '@rollup/plugin-node-resolve'
import type { Plugin as RolldownPlugin } from 'rolldown'
import svelte from 'rollup-plugin-svelte'

export default defineConfig({
	name: 'chat-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	rolldown: {
		sourcemap: true,
		options: {
			plugins: [
				svelte({
					emitCss: false,
					compilerOptions: {
						generate: 'ssr'
					}
				}) as unknown as RolldownPlugin,
				resolve({
					browser: true,
					exportConditions: ['svelte'],
					extensions: ['.svelte']
				}) as unknown as RolldownPlugin
			]
		}
	}
})
```

#### Render from the worker like any other module import

> **Warning — Do not over-generalize the plugin stack**
>
> If a plugin depends on Rollup-only hooks that Rolldown does not support yet, keep that plugin in the main Vite build instead of the worker bundler.

##### Example — `src/Greeting.svelte`

```svelte
<script lang='ts'>
	export let name: string
</script>

<h1>Hello {name} from Svelte</h1>
```

##### Example — `src/fetch.ts`

```ts
import Greeting from './Greeting.svelte'

export async function fetch(): Promise<Response> {
	return new Response(Greeting.render({ name: 'Devflare' }).html, {
		headers: {
			'content-type': 'text/html; charset=utf-8'
		}
	})
}
```

---

### Use Devflare with a standalone Vite app when Vite is the outer host and Devflare owns Worker config underneath

> An effective Vite config is what opts the package into Vite-backed flows: a local `vite.config.*`, a non-empty `config.vite`, or both together. Use `devflare/vite` when the package really is a Vite app and you want Devflare to keep Worker config, Durable Objects, and generated Wrangler output aligned underneath it.

| Field | Value |
| --- | --- |
| Route | [`/docs/vite-standalone`](/docs/vite-standalone) |
| Group | Devflare |
| Navigation title | Vite standalone |
| Eyebrow | Frameworks |

This is the lane for frontend-first packages that already have a real Vite app shell. Vite keeps HMR and the app build. Devflare plugs generated Worker config, Durable Object discovery, bridge behavior, and Worker-aware artifacts into that pipeline.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Standalone Vite apps that still ship Worker-aware runtime pieces |
| Mode switch | Local `vite.config.*` or non-empty `config.vite` |
| Primary helper | `devflare/vite` |

#### Know what actually enables Vite-backed mode

##### Key points

- A local `vite.config.*` opts the current package into Vite-backed flows.
- A non-empty `config.vite` also opts the package into Vite-backed flows.
- Vite dependencies by themselves do not switch the package out of worker-only mode.
- Without an effective Vite config, `dev`, `build`, and `deploy` stay worker-only.

> **Tip — Worker-only is still the default**
>
> Use Vite because the package has a real Vite host, not because it feels like every modern project should have one glued on top.

#### Choose the lightest wiring that fits the app

Use the minimal plugin shape when this file only needs to add Devflare’s Worker-aware behavior and the rest of the Cloudflare Vite wiring already lives elsewhere. Reach for `getDevflareConfigs()` when this file should own the Cloudflare plugin configuration explicitly too.

##### Example — Minimal Devflare-side Vite integration

```ts
import { defineConfig } from 'vite'
import { devflarePlugin } from 'devflare/vite'

export default defineConfig({
	plugins: [devflarePlugin()]
})
```

##### Example — Explicit Cloudflare plugin wiring

```ts
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { devflarePlugin, getDevflareConfigs } from 'devflare/vite'

export default defineConfig(async () => {
	const { cloudflareConfig, auxiliaryWorkers } = await getDevflareConfigs()

	return {
		plugins: [
			devflarePlugin(),
			cloudflare({
				config: cloudflareConfig,
				auxiliaryWorkers: auxiliaryWorkers.length > 0 ? auxiliaryWorkers : undefined
			})
		]
	}
})
```

#### Know what changes once Vite is actually active

The package still uses the same Devflare command loop. What changes is the outer host: Vite takes over the app shell while Devflare keeps resolving worker config, generated Wrangler output, Durable Object discovery, and composed worker entrypoints underneath it.

That means you should think in terms of host ownership, not a separate CLI mode. Reach for this page when the package genuinely became a Vite app, not when you just need one more bundler-shaped knob.

##### Steps

1. Devflare loads and validates `devflare.config.*` first.
2. If a local `vite.config.*` exists, Devflare loads it and overlays `config.vite` on top; otherwise it can synthesize `.devflare/vite.config.mjs` from `config.vite` alone. That merged result is the effective Vite config.
3. Devflare still compiles worker-aware config into generated Wrangler output and may generate `.devflare/worker-entrypoints/main.ts` when worker surfaces need wrapper glue or composition.
4. Build and deploy use the current package's installed Vite so the outer app build and the inner worker plumbing stay aligned.

> **Note — Same commands, different host**
>
> You do not learn a second CLI vocabulary for Vite-backed packages. The config decides who hosts the outer app, while the Devflare commands stay familiar.

#### Keep ownership lines obvious

##### Highlights

- **Vite owns** — The outer app dev server, HMR, and the app build for packages that are truly Vite apps.
- **Devflare owns** — Generated Wrangler config, composed worker entrypoints, Durable Object discovery, bridge behavior, and worker-aware build glue.
- **Generated output** — Treat `.devflare/vite.config.mjs` and `.devflare/wrangler.jsonc` as output, not as the source of truth you maintain by hand.

##### Key points

- If both `vite.config.*` and `config.vite` exist, Devflare merges `vite.config.*` first and then overlays `config.vite`.
- `wrangler.passthrough.main` is the explicit opt-out if you want to own the Worker main entry completely.

---

### Compose Devflare with SvelteKit by letting SvelteKit host the app and Devflare supply the Worker platform

> Point Devflare at SvelteKit’s Cloudflare worker output—often via `files.fetch`, but sometimes by handing `wrangler.passthrough.main` the adapter worker directly—keep `sveltekit()` in `vite.config.ts`, and compose `devflare/sveltekit` into `src/hooks.server.ts` so local platform bindings line up with the Worker runtime Devflare manages.

| Field | Value |
| --- | --- |
| Route | [`/docs/sveltekit-with-devflare`](/docs/sveltekit-with-devflare) |
| Group | Devflare |
| Navigation title | SvelteKit |
| Eyebrow | Frameworks |

This is the path for full SvelteKit apps where the framework owns the outer shell and Devflare keeps the Worker-facing platform story coherent. It matches the repository’s real documentation app and the SvelteKit integration example in the public docs.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Full SvelteKit apps that deploy through Devflare |
| Worker entry | The adapter worker output your package actually emits, commonly `.svelte-kit/cloudflare/_worker.js` or a repo-specific path such as `.adapter-cloudflare/_worker.js` |
| Hook helper | `devflare/sveltekit` |

#### Wire the SvelteKit package like a SvelteKit app first

SvelteKit still owns the app shell, routing, and framework build. Devflare plugs Worker-aware config, generated Wrangler output, and any Durable Object discovery into that Vite-driven flow.

Keep Devflare aligned with the adapter output your package actually emits. Many packages do that with `files.fetch` and an adapter default such as `.svelte-kit/cloudflare/_worker.js`. The documentation app in this repository instead points `wrangler.passthrough.main` at its configured `.adapter-cloudflare/_worker.js` output, which is equally valid when the package already owns the adapter worker directly.

##### Example — `devflare.config.ts`

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'notes-app',
	files: {
		fetch: '.svelte-kit/cloudflare/_worker.js',
		durableObjects: 'src/do/**/*.ts'
	}
})
```

##### Example — `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from 'devflare/vite'

export default defineConfig({
	plugins: [devflarePlugin(), sveltekit()]
})
```

#### Put the Devflare handle at the front of `hooks.server.ts`

> **Important — Why the order matters**
>
> The Devflare handle is the piece that prepares `event.platform` in local dev. Put it first so later middleware sees the same platform shape the app expects.

##### Example — Simple composed handle

```ts
import { sequence } from '@sveltejs/kit/hooks'
import { handle as devflareHandle } from 'devflare/sveltekit'

const authHandle = async ({ event, resolve }) => resolve(event)

export const handle = sequence(devflareHandle, authHandle)
```

##### Example — Custom handle with explicit binding hints

```ts
import { sequence } from '@sveltejs/kit/hooks'
import { createHandle } from 'devflare/sveltekit'

const devflareHandle = createHandle({
	hints: {
		DB: 'd1',
		CACHE: 'kv',
		CHAT_ROOM: 'do'
	}
})

export const handle = sequence(devflareHandle)
```

#### Reach for `createHandle()` only when the simple handle is not enough

##### Key points

- Use the exported `handle` from `devflare/sveltekit` when auto-loaded binding hints from `devflare.config.ts` are enough.
- Use `createHandle()` when you need custom binding hints, a custom bridge URL, or a custom `shouldEnable()` rule.
- If your repo already points `wrangler.passthrough.main` at the adapter worker, keep that path authoritative instead of duplicating it in `files.fetch`.
- Keep the rest of the app in normal SvelteKit patterns; Devflare is there to supply the Worker platform and config alignment, not to replace SvelteKit itself.

---

### Use GitHub workflows as thin orchestration around explicit Devflare deploy and validation actions

> This repository keeps GitHub workflows small on purpose: one shared preview workflow owns branch and PR preview lifecycles, while reusable Devflare actions handle impact checks, shared workspace setup, deploy execution, and feedback publishing.

| Field | Value |
| --- | --- |
| Route | [`/docs/github-workflows`](/docs/github-workflows) |
| Group | Ship & operate |
| Navigation title | GitHub workflows |
| Eyebrow | CI/CD |

The CI/CD pattern in this repo is intentionally boring in the best way. One workflow validates the workspace, one shared preview workflow handles preview targets and cleanup, production stays explicit, and reusable actions keep the mechanics consistent across packages.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | GitHub Actions workflows that validate packages and run explicit preview or production deploys |
| Core split | Caller workflow owns policy; shared actions own mechanics |
| Package selector | `working-directory` chooses which Devflare config actually deploys |

#### Keep GitHub workflows thin and let the actions do the repeatable work

The repo uses GitHub Actions as orchestration, not as a second deploy framework. The workflow file decides when the job runs, which permissions it gets, and which package it is targeting. The reusable actions then handle impact calculation, dependency installation, deploy execution, and GitHub feedback in a consistent way.

That split matters because it keeps policy visible in the workflow while the mechanics stay reusable. A docs preview, a testing preview family, and a production deploy can share the same action vocabulary without pretending they are the same deployment shape.

##### Key points

- Use workflow triggers and path filters to decide whether a lane should even run.
- Use `working-directory` to make the target package visible in the workflow itself.
- Keep preview versus production intent explicit instead of hiding it inside a generic shell script.
- Use workflow summaries and feedback actions so the result is observable without re-reading raw logs every time.

> **Note — A good workflow review question**
>
> Ask three things separately: what triggered this workflow, which package is it acting on, and which explicit deploy target will the action use?

#### Use one workspace CI lane for cached validation, not for hidden deploy logic

`workspace-ci.yml` is the repo-wide validation lane. It reacts to workspace-level changes, restores Bun and Turborepo caches, installs dependencies once, and runs the cached `devflare:ci` lane from the repo root.

That workflow proves the workspace still builds, checks, and tests coherently. It does not choose a Cloudflare target or quietly deploy anything on your behalf.

##### Highlights

- **workspace-ci.yml** — Repo-wide cached validation for apps, cases, and packages before any package-specific deploy lane runs. ([link](https://github.com/Refzlund/devflare/blob/next/.github/workflows/workspace-ci.yml))

##### Example — Workspace CI stays in the validation lane

The active file is the real repo workflow under `.github/workflows/workspace-ci.yml`, and the surrounding tree shows the workflow family this page references.

###### File — .github/workflows/workspace-ci.yml

```yaml
name: Workspace CI

on:
	pull_request:
		paths:
			- 'apps/documentation/**'
			- 'cases/**'
			- 'packages/**'
	push:
		branches:
			- main
			- next
	workflow_dispatch:

jobs:
	validate:
		steps:
			- uses: actions/checkout@v5
			- uses: oven-sh/setup-bun@v2
			- shell: bash
			  run: bun run devflare:ci
```

#### Preview and production workflows should resolve impact before they deploy

The repository preview and production workflows still call `devflare-deploy-impact` before they deploy. That action compares the target package against the relevant git range so the workflow can skip Cloudflare work when the package or its important dependencies did not change, and it also accepts `extra-paths` when shared files outside the package root should still invalidate the deploy.

The main preview lane now lives in `preview.yml`. It resolves branch and PR context first, prepares the workspace once per job through `devflare-setup-workspace`, and then runs separate target-aware `devflare-deploy` calls for the branch scope, the PR scope, or both.

When a later deploy step is reusing that prepared checkout, the caller sets `skip-setup` and `skip-install` so `devflare-deploy` can focus on the target-specific deploy work instead of repeating Bun setup and dependency installation.

The documentation preview job is the clearest repo-local example to study because the same shared workflow can refresh both the branch preview and the stable PR preview from one prepared job while production stays in its own explicit workflow.

##### Highlights

- **preview.yml** — Shared preview workflow for documentation and testing branch previews, PR previews, and cleanup flows. ([link](https://github.com/Refzlund/devflare/blob/next/.github/workflows/preview.yml))
- **documentation-production.yml** — Explicit docs production deploy lane with live verification after deploy. ([link](https://github.com/Refzlund/devflare/blob/next/.github/workflows/documentation-production.yml))

##### Key points

- Use `production: true`, `preview: true`, or `preview-scope: <name>` exactly once per deploy action call.
- Use `devflare-setup-workspace` when one job needs to deploy multiple targets or packages from the same checkout.
- Use `skip-setup` and `skip-install` on later deploy calls when a shared job has already prepared Bun and dependencies.
- Keep branch and PR deploy calls separate even when one push updates both targets, because the deploy target is still part of the explicit workflow policy.
- Use `extra-paths` on the impact action when shared workspace files outside the package root should still trigger a redeploy.
- Use `install-working-directory` when a package-local deploy should reuse one shared root install in a monorepo.
- Let the workflow pass branch names, preview scopes, and messages explicitly so deploy intent is visible in logs.

> **Note — Build once, deploy twice still means two deploy calls**
>
> The optimization in this repo is the shared checkout and install work. Cloudflare target selection still lives in each explicit deploy step, so branch and PR targets stay reviewable instead of being hidden inside one shell command.

##### Example — The shared preview workflow prepares once, then updates the documentation targets it needs

This abridged excerpt shows the shared documentation preview job inside `.github/workflows/preview.yml`. It omits repeated feedback details so the shared setup, impact check, and target-specific deploy steps stay visible.

###### File — .github/workflows/preview.yml

```yaml
name: Preview

on:
	push:
	pull_request:
		types: [opened, reopened, ready_for_review, closed]
	delete:
	workflow_dispatch:

jobs:
	documentation-preview:
		steps:
			- uses: actions/checkout@v5

			- uses: ./.github/actions/devflare-setup-workspace

			- name: Resolve documentation preview impact
			  id: impact
			  uses: ./.github/actions/devflare-deploy-impact
			  with:
			    target-package: documentation

			- name: Deploy documentation branch preview
			  id: branch-deploy
			  if: \${{ needs.resolve-context.outputs.branch-preview-enabled == 'true' && steps.impact.outputs.should-deploy == 'true' }}
			  uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/documentation
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    deploy-command: bun run deploy --
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- name: Deploy documentation PR preview
			  id: pr-deploy
			  if: \${{ needs.resolve-context.outputs.pr-preview-enabled == 'true' && steps.impact.outputs.should-deploy == 'true' }}
			  uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/documentation
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    deploy-command: bun run deploy --
			    preview-scope: \${{ needs.resolve-context.outputs.pr-preview-scope }}

			- name: Publish documentation PR preview feedback
			  uses: ./.github/actions/devflare-github-feedback
			  with:
			    mode: comment
			    comment-key: pr-deployment-status
```

#### Publish feedback and verify the live result instead of treating the deploy log as the whole story

After deploy, the workflows in this repo publish GitHub feedback on purpose. The shared preview workflow updates branch deployment feedback and grouped PR comment sections from the same run, while production stays in its own deploy-and-verify lane.

This is where thin workflows pay off: reporting stays separate from deploy mechanics, and a failed live verification or preview verification can be surfaced cleanly without hiding inside one giant shell step.

Keep the reusable action outputs in mind too: `devflare-deploy-impact` returns `should-deploy`, `reason`, `comparison-base`, `comparison-head`, `changed-workspaces`, and `changed-files`; `devflare-deploy` returns `preview-alias`, `preview-url`, `version-id`, `verification-note`, `status`, `failure-stage`, `exit-code`, and `log-excerpt`; and `devflare-github-feedback` returns `comment-id`, `deployment-id`, and `pr-number` for later jobs that need to update, retire, or cross-link that feedback.

##### Key points

- Use `devflare-github-feedback` for PR comments, GitHub deployments, or both.
- Keep preview aliases or production URLs visible in workflow output so reviewers do not need to scrape logs.
- Fail the workflow explicitly when deploy verification or live verification says the result is not trustworthy.
- Use `GITHUB_STEP_SUMMARY` to leave a small readable outcome instead of forcing readers to decode every raw step.

##### Reference table

| Workflow file | When it runs | GitHub feedback |
| --- | --- | --- |
| `preview.yml` | Non-default branch pushes, selected PR lifecycle events, branch deletion, or manual cleanup dispatch | Branch deployment feedback, grouped PR comment sections, and inactive cleanup updates for retired previews. |
| `documentation-production.yml` | Default branch pushes or manual dispatch for docs production | Production deployment record plus live URL verification. |
| `workspace-ci.yml` | Workspace PRs, selected branch pushes, or manual dispatch | No deployment feedback; validation stays separate from deploy policy. |

> **Tip — What the repo pattern optimizes for**
>
> Clear triggers, explicit targets, reusable actions, and observable feedback make CI/CD easier to trust when a deploy matters.

#### Cleanup workflows should be visible too, not hidden in one-off scripts

This repo keeps cleanup as first-class automation inside `preview.yml`. Deleted branches and manual branch cleanup dispatches reuse the same cleanup jobs, while PR-scoped previews clean themselves up through the same shared workflow when the pull request closes.

Each cleanup job checks out the default branch, reuses the shared workspace setup action, runs `devflare previews cleanup --scope <name> --apply` for the relevant package, and then marks the matching GitHub deployment or grouped PR comment section inactive.

That keeps teardown reviewable: you can still see which workflow retires preview-owned resources and which feedback surfaces get marked inactive, but without splitting the lifecycle across six nearly-identical workflow files.

##### Highlights

- **preview.yml** — Shared preview lifecycle workflow that also owns branch cleanup, PR-close cleanup, and manual branch cleanup dispatches. ([link](https://github.com/Refzlund/devflare/blob/next/.github/workflows/preview.yml))

##### Key points

- Branch deletion cleanup and manual branch cleanup dispatches now live in the same shared workflow file.
- PR closure cleanup lives beside the preview deploy jobs so the open-update-close lifecycle stays reviewable in one place.
- Cleanup retires preview records first, then removes preview-owned infrastructure, then marks GitHub feedback inactive.

##### Example — The shared preview workflow keeps cleanup visible beside deploy logic

This abridged excerpt shows the cleanup portion of `.github/workflows/preview.yml`. It omits repeated auth details so the branch and PR cleanup shape stays visible.

###### File — .github/workflows/preview.yml

```yaml
name: Preview

on:
	delete:
	workflow_dispatch:

jobs:
	documentation-cleanup:
		steps:
			- name: Clean up documentation branch preview scope
			  shell: bash
			  run: |
			    cd apps/documentation
			    bunx --bun devflare previews cleanup --scope "$PREVIEW_SCOPE" --apply

			- name: Mark documentation branch preview deployment inactive
			  uses: ./.github/actions/devflare-github-feedback

	testing-cleanup:
		steps:
			- name: Clean up testing PR preview scope
			  shell: bash
			  run: |
			    cd apps/testing
			    bunx --bun devflare previews cleanup --scope "$PREVIEW_SCOPE" --apply

			- name: Publish testing PR preview cleanup feedback
			  uses: ./.github/actions/devflare-github-feedback
```

#### Multi-worker preview families still deploy package by package

The testing preview job inside `preview.yml` shows the multi-worker version of the same rule. One shared job prepares the workspace once, then still deploys each worker package separately with its own `working-directory` and explicit preview scope.

That is the important CI/CD habit for multi-worker systems: one workflow can coordinate the family, but each package still owns its own resolved Devflare config and deploy step.

The shared job is also the repo example of branch pushes updating both a GitHub deployment and, when the branch already belongs to an open pull request, the grouped PR comment through the same workflow run.

##### Highlights

- **preview.yml** — Shared testing preview job that coordinates auth-service, search-service, and the main app across branch and PR targets. ([link](https://github.com/Refzlund/devflare/blob/next/.github/workflows/preview.yml))

##### Example — Shared multi-worker previews still keep each package deploy explicit

This excerpt comes from `.github/workflows/preview.yml`, which fans one prepared job across the testing worker family while keeping each deploy package-local.

###### File — .github/workflows/preview.yml

```yaml
name: Preview

jobs:
	testing-preview:
		steps:
			- uses: ./.github/actions/devflare-setup-workspace

			- uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/testing/workers/auth-service
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/testing/workers/search-service
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- uses: ./.github/actions/devflare-deploy
			  with:
			    working-directory: apps/testing
			    install-working-directory: .
			    skip-setup: 'true'
			    skip-install: 'true'
			    preview-scope: \${{ needs.resolve-context.outputs.branch-preview-scope }}

			- uses: ./.github/actions/devflare-github-feedback
			  with:
			    mode: deployment

			- uses: ./.github/actions/devflare-github-feedback
			  with:
			    mode: comment
			    comment-key: pr-deployment-status
```

---

### Build and deploy production on purpose, with explicit targets and inspectable output

> Devflare keeps build and deploy flows inspectable, but deploys are intentionally explicit: production uses `--prod` or `--production`, while preview is either a same-worker upload with plain `--preview` or a named preview scope with `--preview <name>`.

| Field | Value |
| --- | --- |
| Route | [`/docs/production-deploys`](/docs/production-deploys) |
| Group | Ship & operate |
| Navigation title | Production deploys |
| Eyebrow | Production |

The deploy story is simpler when the target is unmistakable. Devflare resolves config, generates Wrangler-facing artifacts, and then deploys against an explicit destination instead of guessing whether you meant production or preview.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Production deploys and preflight checks |
| Required target | `--prod`, `--production`, plain `--preview`, or named `--preview <name>` |
| Best debug habit | Inspect compiled output before you deploy when the setup changed |

#### Keep the production lane small and reviewable

The CLI page already owns the broad command map. The production-specific habit is simpler: refresh generated types when the contract changed, build once, inspect when the setup changed, and only then deploy with an explicit production target.

That keeps this page focused on release posture instead of re-explaining command families that already have a better home on the CLI page.

##### Steps

1. Run `devflare types` when bindings or entrypoints changed and `env.d.ts` needs to catch up.
2. Run `devflare build --env production` to materialize the production shape you actually mean to ship.
3. Use `devflare config print --format wrangler` or `devflare doctor` when the compiled result needs inspection before release.
4. Run `devflare deploy --prod` or `--production` only when the target is unmistakably production.

> **Note — Need the full command map?**
>
> Open the CLI page when the question is what `types`, `build`, `config`, or `doctor` generally do. This page only covers how those commands fit the production release lane.

#### Production deploys should be explicit

Deploy requires an explicit target so production and preview destinations stay unmistakable. That means production is `--prod` or `--production`, while preview is either plain `--preview` for a same-worker upload or `--preview <name>` for a named preview scope.

Production deploys also clear preview-scope environment overrides such as `DEVFLARE_PREVIEW_BRANCH`, which helps keep stable production worker names pointed at the stable infrastructure you actually expect.

> **Warning — No target means no deploy**
>
> That rejection is intentional. It keeps production and preview intent visible in CI logs, scripts, and local command history.

> **Note — Automation can make verification stricter than local deploys**
>
> The reusable deploy action exposes `verify-deployment` and `require-fresh-production-deployment` so CI can fail when Cloudflare cannot confirm the expected version or keeps serving the existing active production deployment.

##### Example — Production deploy commands

```bash
bunx --bun devflare build --env production
bunx --bun devflare deploy --prod
bunx --bun devflare deploy --production --message "Release 1" --tag release-1
```

#### Use the inspectable tools before a risky change

##### Key points

- Run `devflare config print --format wrangler` when you want to see the compiled deployment shape.
- Run `devflare doctor` when config resolution, Vite opt-in, or generated files feel suspect.
- Run `devflare build` before deploys when the package just gained new bindings, routes, or framework wiring.

---

### Use Turborepo to validate the workspace, then deploy the target package with Devflare

> In a Bun monorepo, Turborepo should own task orchestration, caching, and impact-aware validation, while `devflare` still runs from the package that owns the Worker or app you are deploying.

| Field | Value |
| --- | --- |
| Route | [`/docs/monorepo-turborepo`](/docs/monorepo-turborepo) |
| Group | Ship & operate |
| Navigation title | Monorepos & Turborepo |
| Eyebrow | Monorepo |

This repository uses Turbo at the root and keeps `devflare.config.ts` local to each deployable package. That split is the important pattern: Turbo decides which packages to build, typecheck, test, or check, but actual deploy commands still run in the package that owns the resolved Devflare config.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Bun + Turborepo monorepos with more than one Devflare package |
| Turbo role | Validation, caching, filters, and impacted-package orchestration |
| Deploy rule | Run `devflare` from the package that owns the config |

#### Keep the workspace boundary clear

In a monorepo, Turbo and Devflare solve different problems. Turbo owns the workspace graph: cached builds, targeted checks, and “what changed?” filters. Devflare owns package-local Cloudflare behavior: config resolution, generated Wrangler output, preview logic, and production deploys.

That means every deployable package should still keep its own `devflare.config.ts`, package scripts, and package-specific runtime assumptions. Turbo should orchestrate those packages, not erase their boundaries.

##### Key points

- Keep one `devflare.config.ts` per deployable package or worker family member.
- Use repo-root Turbo scripts for validation lanes and targeted build/check work.
- Use package-local `devflare` commands for actual build or deploy intent.
- Use GitHub workflow path filters or Turbo filters to decide whether a deploy job should run at all.

#### Know which layer owns what

##### Reference table

| Layer | Owns |
| --- | --- |
| Turborepo | Task graph, caching, filters, workspace validation lanes, and targeted build/check/test/type flows. |
| Devflare | Config resolution, type generation, worker bundling, preview deploys, production deploys, and preview lifecycle commands. |
| GitHub Actions | Triggers, permissions, branch/PR policy, feedback, and the working directory that selects the target package. |

> **Note — Good default review question**
>
> Ask two separate questions: “Which packages should Turbo run?” and “Which package is actually deploying?” Conflating those is how monorepo deploy flows get muddy.

#### Use repo-root Turbo scripts for contributor and CI lanes

The repository now exposes explicit root scripts for the core Devflare workflow so contributors and CI can validate the workspace without guessing at filters every time.

Those scripts are validation and orchestration tools; they are not a replacement for the actual package-local deploy commands.

##### Example — Repo-root validation lane

```bash
bun run devflare:build
bun run devflare:typecheck
bun run devflare:test
bun run devflare:types
bun run devflare:check
bun run devflare:ci
```

##### Example — Targeted Turbo work from the repo root

```bash
bun run turbo build --filter=documentation
bun run turbo check --filter=documentation
```

#### Deploy one package at a time, from the package that owns the config

##### Steps

1. Use Turbo or path-aware workflow logic to decide whether a package is affected.
2. Optionally run Turbo build/check work for that package from the repo root.
3. Run `devflare deploy ...` from the package directory that owns the `devflare.config.ts` you actually want to resolve.
4. Keep preview-vs-production intent explicit in the final package-local deploy command.

> **Warning — Keep package selection explicit**
>
> If the deploy is for `apps/documentation`, make that obvious in the working directory or script name. The package boundary should be visible in logs and workflow steps.

##### Example — Documentation app from a monorepo

```bash
# optional repo-root validation
bun run turbo build --filter=documentation
bun run turbo check --filter=documentation

# actual deploy from the app package
cd apps/documentation
bun run deploy -- --preview --branch-name feature-search
bun run deploy -- --prod
```

#### Multi-worker preview families still deploy package by package

`apps/testing` is the repository example for the other half of the rule: Turbo can orchestrate the workspace, but a branch-scoped preview family still deploys each worker package separately with the same preview scope and naming inputs.

That is why the workflows keep `DEVFLARE_PREVIEW_BRANCH` consistent and run separate deploys for `auth-service`, `search-service`, and the main app instead of pretending one root deploy magically owns the whole family.

##### Example — Branch-scoped worker family deployment

```bash
export DEVFLARE_PREVIEW_BRANCH='pr-123'
# PowerShell: $env:DEVFLARE_PREVIEW_BRANCH = 'pr-123'

cd apps/testing/workers/auth-service
bunx --bun devflare deploy --preview pr-123

cd ../search-service
bunx --bun devflare deploy --preview pr-123

cd ../../
bunx --bun devflare deploy --preview pr-123
bunx --bun devflare previews cleanup-resources --scope pr-123 --apply
```

---

### Pick the preview model that matches the app instead of forcing one preview story on every worker

> Devflare supports both same-worker preview uploads and named preview scopes, but Durable Object-heavy apps often need a branch-scoped worker-family strategy instead of relying on preview URLs alone.

| Field | Value |
| --- | --- |
| Route | [`/docs/preview-strategies`](/docs/preview-strategies) |
| Group | Ship & operate |
| Navigation title | Preview strategies |
| Eyebrow | Previews |

Preview complexity usually comes from choosing the wrong model, not from the commands themselves. This page helps you pick the right one before you start writing CI around assumptions that the platform will not actually honor.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Choosing preview strategy before building CI around it |
| Same-worker mode | Plain `--preview` |
| Named scope mode | `--preview <name>` |

#### There is more than one preview model

Both preview targets resolve `config.env.preview` and can materialize `preview.scope()` names. Bare `--preview` keeps the same-worker preview upload flow and uses the synthetic `preview` identifier, while named `--preview <name>` swaps that identifier for an explicit scope and can pair naturally with branch-scoped preview workers when your config is wired for that pattern.

Plain `--preview` can still derive alias metadata from `--branch-name`, CI metadata, or the current git branch, but that alias is separate from the synthetic `preview` identifier used for preview-scoped resource names.

The action metadata in this repo still carries a `preview-alias` input for same-worker uploads, and some live workflows still use it. Treat that as repo drift rather than a second CLI deploy target model. New automation should lean on `--branch-name`-style alias derivation or just use named preview scopes directly.

##### Reference table

| Preview style | Use it when |
| --- | --- |
| Plain `--preview` | You want a same-worker preview upload and the synthetic `preview` identifier is enough for any `preview.scope()` resource names. |
| Named `--preview <name>` | You need an explicit preview identifier for resource names or branch-scoped preview workers. |
| Branch-scoped worker family | The app is Durable Object-heavy or otherwise needs stronger isolation than same-worker preview uploads can provide. |

#### Cloudflare caveats still matter

##### Key points

- Preview URLs must be enabled for the worker or the returned links may not be usable.
- Preview URLs are public unless you protect them with Cloudflare Access or another layer.
- Plain `--preview` cannot be the first-ever upload path for a brand-new worker.
- Cloudflare does not currently generate preview URLs for workers that implement Durable Objects.
- `wrangler versions upload` does not currently apply Durable Object migrations.
- Same-worker preview uploads are also the wrong fit when branch isolation must cover cron or queue topology, not just the request path.

> **Warning — This is why DO-heavy apps need a different preview instinct**
>
> If previews must exercise real Durable Object behavior, reach for branch-scoped worker families and preview-scoped resources instead of hoping same-worker preview URLs will be enough.

#### Use preview-scoped resources only when the preview really owns infrastructure

Branch-scoped previews sometimes need their own KV, D1, R2, Queue, or Vectorize resources. That is where `preview.scope()` is useful: authored config stays stable while preview environments resolve preview-specific names.

Outside preview environments, those same authored markers resolve back to the base names so your config stays readable.

Inside preview deploys, bare `--preview` usually materializes names like `my-cache-kv-preview`, while `--preview next` materializes names like `my-cache-kv-next`.

##### Example — Preview-scoped resource naming

```ts
import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	bindings: {
		kv: {
			CACHE: pv('my-cache-kv')
		},
		r2: {
			ASSETS: pv('my-assets-bucket')
		}
	}
})
```

---

### Use the operator command families for account context, live production changes, renames, token bootstrap, and paid-test gates

> Devflare’s deeper CLI families exist so account selection, live production inspection, Worker renames, token lifecycle, and remote paid-test gates stay documented instead of dissolving into ad-hoc command snippets.

| Field | Value |
| --- | --- |
| Route | [`/docs/control-plane-operations`](/docs/control-plane-operations) |
| Group | Ship & operate |
| Navigation title | Control-plane operations |
| Eyebrow | Operations |

The root CLI page maps these command families, but once you start operating real Cloudflare state, the important questions change. Which account is this command acting on? Is this a read-only production inspection or a dry-run rollback? Does this rename update the local config too? Should remote paid tests be enabled at all? This page keeps those answers in one place.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Teams operating live accounts, releases, and paid test flows instead of only building locally |
| Read-only production view | `devflare productions` and `devflare productions versions` |
| Mutation safety habit | Prefer dry runs first, then add `--apply` only when the target is obvious |
| Paid-test gate | `devflare remote status\|enable\|disable` plus `DEVFLARE_REMOTE` awareness |

#### Choose account context before you operate on anything important

The safest operational habit in Devflare is to resolve account context first. The CLI can infer an account from several places, but when real inventory, preview cleanup, token management, or production control-plane changes are involved, you should know which lane won.

Not every command family resolves those lanes in the same order. Inventory-oriented commands, `productions` discovery, other config-backed operator commands, and token management each consult a slightly different subset of explicit flags, workspace settings, environment, config, and authenticated-account fallbacks.

That is why `login`, `account`, and the global or workspace account selectors exist. They make the account story explicit before the deeper command families start reading or mutating Cloudflare state.

##### Reference table

| Command family | How account choice resolves | Practical habit |
| --- | --- | --- |
| `devflare account ...` | `--account` wins, then workspace account selection, `CLOUDFLARE_ACCOUNT_ID`, resolved config `accountId`, and finally the primary authenticated account. | Great for inventory, but still pass `--account` when a read or write must be unmistakable. |
| `devflare productions ...` | `--account` wins. Otherwise Devflare may scan local configs for primary workers, stop with an explicit error if that scan finds more than one configured `accountId`, and only then fall back to the narrower production account-resolution path. | In a monorepo or mixed-account tree, pass `--account` instead of asking productions to guess. |
| Other config-backed families such as `previews` and `worker rename` | Explicit `--account` wins; otherwise Devflare can use resolved config `accountId` or later fall back to effective-account preferences and the authenticated account. | Set `accountId` in package config when that package genuinely belongs to one account. |
| `devflare tokens ...` | Uses `--account` first, then workspace account selection, then the primary account visible to the bootstrap token. | Treat token management as its own lane and make the target account obvious in logs. |

> **Note — Interactive account selection is a real workflow, not just a convenience extra**
>
> `devflare account global` and `devflare account workspace` exist so repeated operational commands can stay honest without pasting account ids into every invocation.
>
> The workspace preference lives with the workspace metadata, while the global default is cached locally and mirrored best-effort to Devflare-managed Cloudflare state when you are authenticated.
>
> Some command families consult those effective-account preferences directly, while others read a narrower lane first. That difference is why the docs call out the command family instead of pretending there is one universal resolution order.
>
> `devflare productions` is the strictest example here: if local config discovery turns up multiple configured account ids, it refuses to guess and asks for `--account`.

##### Example — Get the account context visible first

```bash
bunx --bun devflare login
bunx --bun devflare account
bunx --bun devflare account workspace
bunx --bun devflare account workers
```

#### Treat usage and limits as Devflare-managed guardrails, not Cloudflare billing dashboards

`devflare account usage` and `devflare account limits` expose the counters and ceilings Devflare uses for its own safety decisions. They are useful operator data, but they are not a full Cloudflare billing or quota dashboard.

Today that mostly means AI request counts, Vectorize operation counts, and related limits that help Devflare decide when remote or preview-heavy workflows should stay deliberate instead of accidental.

##### Key points

- Use these commands as guardrails for Devflare-managed flows, not as the final source of truth for account billing.
- If you need official product usage or invoice-level numbers, keep Cloudflare’s own dashboards and docs in the loop.
- Some limits are stored for future enforcement or reporting before every one of them becomes an active hard stop.

> **Note — Operationally useful, intentionally narrower than billing**
>
> These numbers are here to help Devflare behave safely. They should inform operator decisions, but they are not a substitute for Cloudflare’s own product-level accounting.

#### Inspect and change live production deliberately

`devflare productions` is the control-plane surface for live production state. It reads Cloudflare deployment data directly, lists current Workers and stored versions, and only mutates production when you move from the read-only views into `rollback` or `delete`.

That split matters because production inspection and production mutation are not the same job. Keep `versions` nearby when you need context, keep dry runs as the default posture, and add `--apply` only when you are already confident about the target.

##### Reference table

| Command | What it is for | Safety rule |
| --- | --- | --- |
| `devflare productions` | Inspect live production Workers and the active deployment shape. | Read-only by default. |
| `devflare productions versions` | Inspect recent stored production versions and see which version is active. | Read-only by default. |
| `devflare productions rollback` | Create a fresh production deployment that points at a previous or specific version. | Dry run unless you add `--apply`. |
| `devflare productions delete` | Delete one live production Worker script. | Dry run unless you add `--apply`, and it does not delete independent account resources automatically. |

> **Note — Production versions are a focused view, not the entire deployment history**
>
> `devflare productions versions` focuses on the recent non-preview versions that matter operationally, and the latest production deployment can still reference more than one active version when Cloudflare is splitting traffic.

> **Warning — Production deletion is intentionally narrow**
>
> `devflare productions delete` removes the Worker script only. Review KV, D1, R2, queues, and other account resources separately instead of assuming the control plane will clean them up for you.

#### Use documented commands for renames, token bootstrap, and pricing context

##### Highlights

- **`worker rename`** — Renames the remote Worker when needed, updates the matching local config name when it can resolve that config safely, warns about remaining local references, and may leave existing preview URLs showing the old worker name until fresh preview uploads exist.
- **`tokens`** — Creates, rolls, lists, and deletes Devflare-managed account-owned API tokens using a bootstrap token that already has token-management permissions. Cloudflare returns token secrets only once, so the first output matters.
- **`ai`** — Prints the built-in Workers AI pricing snapshot bundled with the current Devflare build. It is a reference command, not a live account-state query, so confirm current rates in Cloudflare docs when the numbers matter.

##### Key points

- Prefer `worker rename` over hand-editing config names and remote Worker names separately.
- Keep bootstrap tokens out of transcripts and remember that returned managed-token secrets are a one-time output.
- Use the built-in AI pricing command when the question is cost reference, not model invocation.

##### Example — Keep these control-plane jobs explicit too

```bash
bunx --bun devflare worker rename docs --to devflare-docs
bunx --bun devflare tokens $BOOTSTRAP --list
bunx --bun devflare tokens $BOOTSTRAP --new preview
bunx --bun devflare ai
```

#### Gate paid remote test flows on purpose

Remote mode exists so paid Cloudflare features like AI or Vectorize do not get exercised casually by every local or CI run. The command family is deliberately small: inspect current status, enable it for a bounded window, or disable it again.

That keeps the cost story visible. If remote tests are going to hit real infrastructure, the activation should be reviewable in command history or workflow logs instead of quietly implied.

##### Key points

- The default `remote` action is `status`, so the current gate is easy to inspect before you run a paid test suite.
- `enable` defaults to 30 minutes when you do not pass a valid duration.
- `DEVFLARE_REMOTE` can keep effective remote mode active even after you run `disable`, so environment context still matters.

> **Warning — Remote mode is a cost gate, not a convenience toggle**
>
> Remote tests hit real Cloudflare services. Use the shortest useful enable window and keep the activation visible in automation when cost or quotas matter.

##### Example — Make remote mode a deliberate choice

```bash
bunx --bun devflare remote status
bunx --bun devflare remote enable 30
bunx --bun devflare remote disable
```

#### Use the neighboring docs when the job becomes preview lifecycle or CI policy

##### Highlights

- **devflare/cloudflare** — Open the library API page when a script or tool should use the same auth, inventory, registry, usage, or token helpers that the CLI command families use internally. ([link](/docs/cloudflare-api))
- **Preview operations** — Open the preview lifecycle page when the job is inspection, reconciliation, retirement, or resource cleanup for preview scopes. ([link](/docs/preview-operations))
- **GitHub workflows** — Open the workflow page when those operator commands need to become reviewable CI jobs with feedback, cleanup, and permissions. ([link](/docs/github-workflows))
- **Production deploys** — Open the production deploy page when the question is the deploy target itself rather than the later control-plane inspection or rollback flow. ([link](/docs/production-deploys))

---

### Use `devflare/cloudflare` when scripts should reuse Devflare’s account, registry, and token helpers instead of reimplementing them

> The `devflare/cloudflare` subpath exposes the same account-aware building blocks the CLI uses for auth, resource inventory, usage and limits, preview registry access, preferences, and managed token workflows.

| Field | Value |
| --- | --- |
| Route | [`/docs/cloudflare-api`](/docs/cloudflare-api) |
| Group | Ship & operate |
| Navigation title | devflare/cloudflare |
| Eyebrow | Library API |

This page is for Node-side scripts and tooling, not Worker runtime code. Reach for it when a release script, operator utility, or migration helper should reuse Devflare’s Cloudflare-side knowledge instead of rebuilding auth, pagination, account selection, or preview-registry calls from scratch.

#### At a glance

| Fact | Value |
| --- | --- |
| Import path | `devflare/cloudflare` |
| Primary surface | A flat `account` object plus standalone preview-registry helpers and schema exports |
| Best for | Release scripts, operator tooling, and Node-side automation that should reuse Devflare’s Cloudflare-side rules |

#### Use the library when your script needs Devflare’s control-plane knowledge, not just a shell command

Reach for `devflare/cloudflare` when a script should authenticate once, resolve an account deliberately, inspect resources, or talk to the preview registry using the same rules Devflare already ships.

If the job is already well-served by `devflare account`, `devflare previews`, or another CLI command and the main need is a readable operator workflow, the CLI is usually simpler. The library is for composition.

##### Highlights

- **Good fit** — A release script, CI helper, or internal ops tool needs account auth, inventory queries, preview registry reads, or token management as reusable functions.
- **Usually not the first fit** — A human just needs to inspect state once. That is what the CLI pages and built-in help are already for.

#### Know the main clusters on the public surface

##### Reference table

| Cluster | What it helps with | Examples |
| --- | --- | --- |
| Auth and account identity | Check auth, inspect accounts, and resolve the account you should operate on. | `account.isAuthenticated()`, `account.getAccounts()`, `account.getPrimaryAccount()` |
| Resource inventory | List Workers, D1 databases, KV namespaces, R2 buckets, Vectorize indexes, and related account resources. | `account.workers(accountId)`, `account.d1(accountId)`, `account.r2(accountId)` |
| Usage and limits | Read Devflare-managed operational counters and ceilings that inform remote or preview-heavy workflows. | `account.getUsageSummary(accountId, "ai")`, `account.getLimits(accountId)` |
| Preferences and defaults | Read or update Devflare’s stored global or workspace account preferences. | `account.getGlobalDefaultAccountId(primaryId)`, `account.setWorkspaceAccountId(accountId)`, `account.getEffectiveAccountId(primaryId)` |
| Managed tokens and preview registry | Create or rotate Devflare-managed API tokens, and inspect or update preview-registry records with shared schemas. | `account.listAccountOwnedAPITokens(accountId)`, `account.ensurePreviewRegistry({ ... })`, `devflarePreviewRecordSchema` |

> **Note — This is the same mental model as the CLI, just as functions**
>
> If a CLI page talks about account preferences, preview registry records, or managed tokens, this subpath is usually where the reusable implementation lives.

#### A small script can reuse auth and inventory without rebuilding them

##### Key points

- Keep account choice explicit in scripts that can touch more than one account.
- Reuse the exported helpers instead of hand-rolling Cloudflare REST calls unless you genuinely need an unsupported endpoint.
- Prefer returning structured data from your own scripts and let the CLI own human-readable operator output.

##### Example — List Workers for the primary account

```ts
import { account } from 'devflare/cloudflare'

const authenticated = await account.isAuthenticated()

if (!authenticated) {
	throw new Error('Run devflare login before using this script')
}

const primary = await account.getPrimaryAccount()

	if (!primary) {
		throw new Error('No Cloudflare account is available for this script')
	}

	const workers = await account.workers(primary.id)

for (const worker of workers) {
	console.log(worker.name)
}
```

#### Preview registry helpers and schemas are public on purpose

Devflare exports preview-registry helpers plus the shared registry schemas and errors so custom tooling can inspect or update preview metadata without guessing the record shape.

That is especially useful for automation that wants to reconcile preview URLs, aliases, or cleanup state while staying aligned with the same contract the CLI and GitHub actions use.

##### Key points

- Use schema exports such as `devflarePreviewRecordSchema` when you need to validate preview-registry data in your own tooling.
- Use `account.ensurePreviewRegistry(...)`, `account.listTrackedPreviewRecords(...)`, or the standalone preview-registry exports when you want the same storage contract the CLI already understands.
- Keep custom preview automation aligned with the docs on preview lifecycle instead of inventing parallel record shapes.

#### Open the neighboring page when the question is policy or workflow, not raw API reuse

##### Highlights

- **Control-plane operations** — Go back to the CLI-oriented page when the question is operator workflow, dry-run safety, rollback posture, or command-family behavior. ([link](/docs/control-plane-operations))
- **Preview operations** — Open the preview lifecycle page when your tool needs the broader policy around reconcile, retire, and cleanup flows. ([link](/docs/preview-operations))
- **GitHub workflows** — Open the workflow page when your automation question is really about CI structure, action outputs, or PR feedback instead of raw Cloudflare helpers. ([link](/docs/github-workflows))

---

### Use the preview registry commands to inspect, reconcile, retire, and clean up previews

> The preview registry is D1-backed and gives Devflare a durable record of preview, alias, and deployment state so cleanup and reconciliation do not have to depend on fragile one-off scripts.

| Field | Value |
| --- | --- |
| Route | [`/docs/preview-operations`](/docs/preview-operations) |
| Group | Ship & operate |
| Navigation title | Preview operations |
| Eyebrow | Preview lifecycle |

Once previews exist, lifecycle management matters as much as deployment. The preview registry commands are the public surface for understanding what exists, bringing state back in sync, and tearing down preview-only resources deliberately.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Preview lifecycle management after deploys already exist |
| Registry backing | D1 (`devflare-registry` by default) |
| Cleanup warning | Dedicated preview workers may own more than just the worker script |

#### Why the preview registry exists

Cloudflare discovery alone is not enough for a clean preview lifecycle story. The D1-backed registry lets Devflare track preview, alias, and deployment records in a way that supports reconciliation, retirement, and cleanup commands later.

`previews provision` creates or reuses the default `devflare-registry` database, and later deploy flows try to keep that registry synchronized as preview deploys happen. If that sync warns or falls behind, `reconcile` is the documented recovery path.

That is what lets preview operations stay a documented CLI surface instead of becoming a pile of CI-only command glue.

#### The core commands to remember

##### Key points

- Use `previews` for a summary view of preview scopes.
- Use `bindings --scope <name>` when you want to understand which workers currently reference one named preview scope; otherwise the identifier comes from the same preview env vars your automation already set.
- Use `reconcile` when registry state needs to be synced against current Cloudflare state.
- Prefer explicit scope selectors when you know the target, and reserve broad cleanup runs for the moments when the whole preview fleet genuinely needs attention.
- Without `--scope`, `cleanup-resources` first respects `DEVFLARE_PREVIEW_IDENTIFIER`, `DEVFLARE_PREVIEW_PR`, or `DEVFLARE_PREVIEW_BRANCH`, and only then falls back to the synthetic `preview` scope. Use `--all` when you mean every discovered scope for the worker family, not just that resolved default.

##### Example — Preview lifecycle commands

```bash
bunx --bun devflare previews
bunx --bun devflare previews provision
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews reconcile --worker documentation
bunx --bun devflare previews retire --worker documentation --branch feature-search --apply
bunx --bun devflare previews cleanup --days 7 --apply
bunx --bun devflare previews cleanup-resources --scope next --apply
```

#### Cleanup should be specific

##### Key points

- `retire` retires matching registry records by branch, alias, version, or commit selector; it does not delete the underlying Cloudflare resources by itself.
- `cleanup` soft-deletes stale registry records after an age threshold instead of immediately pretending the historical metadata never existed.
- `cleanup-resources` deletes preview-only resources and can also delete dedicated preview worker scripts for the targeted scope.
- Stable shared workers are not deleted by `cleanup-resources`; same-worker preview aliases only lose matching preview-scoped account resources.
- Analytics Engine datasets and Browser Rendering bindings are reported as warnings instead of deleted resources, and preview-scoped Hyperdrive cleanup only removes preview configs that already exist.

> **Important — Good cleanup hygiene**
>
> Use the most specific selector you can. Cleanup is easier to trust when the target is obvious in the command itself.

> **Warning — Not every preview-looking thing is a deletable resource**
>
> Browser Rendering does not own an account-scoped resource, Analytics Engine datasets are created on first write, and Hyperdrive preview cleanup can only remove preview configs that already exist. The command tells you about those cases instead of pretending it deleted them.

---

### Test the runtime shape you actually ship, then keep automation thin and observable

> Keep local harness detail on the dedicated testing pages, then promote only the right runtime-shaped checks into thin, observable automation.

| Field | Value |
| --- | --- |
| Route | [`/docs/testing-and-automation`](/docs/testing-and-automation) |
| Group | Ship & operate |
| Navigation title | Testing & automation |
| Eyebrow | Validation |

Devflare’s testing story is intentionally layered. The local harness pages own `createTestContext()` and binding-specific nuance; this page owns the CI-facing question of which checks should move into preview validation, release automation, and workflow feedback.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | CI-facing testing policy, preview validation, and thin release automation |
| Local harness owner | `/docs/create-test-context` plus binding testing guides |
| Important nuance | `cf.worker.fetch()` is not a full `waitUntil()` drain |
| Workflow companion | `/docs/github-workflows` |

#### Let the local testing pages own local harness detail

This page used to repeat too much of the local harness story. The better split is simpler: keep `createTestContext()` behavior, autodiscovery, and binding-specific harness detail on the dedicated testing pages, then use this page for the question “what should actually run in automation?”

That keeps local test design and CI policy from drifting into two slightly different copies of the same documentation.

##### Highlights

- **Testing overview** — Use the map page first when you need to choose between starter tests, the harness page, binding-specific guides, runtime context, or CI-facing validation. ([link](/docs/testing-overview))
- **createTestContext()** — This is the canonical page for autodiscovery, helper timing, transport-aware round-trips, and the real `cf.*` helper behavior. ([link](/docs/create-test-context))
- **Binding testing guides** — Open these when the binding changes the honest testing posture and the local harness rules are no longer one-size-fits-all. ([link](/docs/binding-testing-guides))

> **Note — A cleaner split keeps both pages better**
>
> The harness pages should own local helper behavior. This page should own what gets promoted into automation and how that automation stays understandable.

#### Carry only the automation-facing timing rules into CI

Automation does not need the whole local harness manual, but it does need the timing rules that commonly produce flaky checks or false confidence.

The main habit is to promote the check that matches the behavior you actually need to trust instead of assuming every helper has the same completion contract.

##### Reference table

| When the check depends on... | Prefer | Why |
| --- | --- | --- |
| `waitUntil()` side effects from an HTTP handler | Assert the side effect directly or move to a higher-fidelity check. | `cf.worker.fetch()` returns when the handler resolves, not when every background task drains. |
| Queue, scheduled, or tail background work | `cf.queue.trigger()`, `cf.scheduled.trigger()`, or `cf.tail.trigger()` | Those helpers wait for their background work before they return, so they are a better fit for async side-effect assertions. |
| Binding-specific or transport-specific behavior | The binding guide or `create-test-context` page first | Different bindings and bridge-backed values have different honest harness rules, and the local testing pages already own those details. |

> **Warning — Do not promote the wrong completion contract into CI**
>
> If a test depends on `waitUntil()` effects being complete, a plain `cf.worker.fetch()` assertion may be too early. Keep that nuance visible in automation instead of discovering it from flaky builds later.

#### Promote the smallest useful checks into automation

##### Highlights

- **Preview operations** — Use the preview page when a runtime check depends on preview-scoped resources, reconciliation, retirement, or cleanup behavior. ([link](/docs/preview-operations))
- **Production deploys** — Use the production page when the check is really about the deploy target, compiled output, or preflight inspection before release. ([link](/docs/production-deploys))
- **GitHub workflows** — Use the workflow page when those promoted checks need to become reviewable Actions jobs with explicit triggers, permissions, and feedback. ([link](/docs/github-workflows))

##### Steps

1. Prove the behavior locally with `createTestContext()` or the binding-specific guide first.
2. Choose one or two runtime-shaped smoke checks that are worth rerunning in CI because they protect the deploy boundary, not because they are merely easy to copy.
3. Use preview validation when routing, preview-owned resources, or branch-scoped behavior is the real risk instead of trying to force every concern through one unit-style check.
4. Publish one visible summary or feedback artifact so reviewers can tell what passed without spelunking through raw logs.

#### Automation should stay thin and observable

The repository workflow pieces are intentionally split between deploy logic and GitHub feedback logic. That keeps Cloudflare state changes separate from PR comments, deployment records, or other reporting behavior.

Caller workflows should own branch naming, permissions, environment selection, and post-deploy feedback decisions, while reusable actions should stay focused on one deploy or one reporting job at a time.

##### Highlights

- **GitHub workflows** — The workflow page owns the deeper repo examples for impact checks, reusable actions, PR feedback, and cleanup jobs. ([link](/docs/github-workflows))

##### Key points

- Keep one package, one explicit target, and one visible verification result in the same workflow lane whenever possible.
- Split deploy execution from GitHub feedback so reporting can fail or retry without becoming a second deploy path.
- Prefer workflow summaries, PR comments, or deployment records that show the result directly instead of forcing reviewers into raw logs.

> **Note — Thin workflows age better**
>
> When a release is stressful, a small workflow that clearly says what it deploys and what it reports is much easier to trust than a giant do-everything pipeline.

##### Example — Thin preview deploy step

```yaml
- id: deploy
  uses: ./.github/actions/devflare-deploy
  with:
    working-directory: apps/documentation
    preview: 'true'
    branch-name: ${{ github.head_ref || github.ref_name }}
    cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

### Choose the right storage binding first, then let the binding guides own the mechanics

> Use this page to choose between KV, D1, R2, and Hyperdrive. Once the shape is clear, open the binding-specific guide for authoring, testing, and examples instead of reading several smaller pages that all repeat the same decision badly.

| Field | Value |
| --- | --- |
| Route | [`/docs/storage-bindings`](/docs/storage-bindings) |
| Group | Guides |
| Navigation title | Storage strategy |
| Eyebrow | Binding strategy |

This is the storage chooser, not a second binding reference shelf. Use it when the question is “which storage shape fits this worker?” Then jump into the guide that owns the actual runtime, compile, testing, and preview details for that storage binding.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Choosing between KV, D1, R2, and Hyperdrive before you dive into one binding guide |
| Main question | Is the data keyed, query-shaped, object-shaped, or an existing remote database connection? |
| Safest default | Prefer stable names in config when the binding supports them |
| Open next | The specific binding guide once the storage shape is clear |

#### Choose the storage shape before you choose the syntax

The weirdest storage mistakes usually come from choosing by familiarity instead of by data shape. Devflare already has strong per-binding guides for authoring and testing, so this page should stay at the decision boundary instead of pretending to be four shorter reference pages glued together.

Once the storage shape is obvious, the binding guide should take over. That keeps the library cleaner and makes the per-binding pages easier to trust.

##### Reference table

| Binding | Reach for it when | Usually the wrong fit |
| --- | --- | --- |
| `KV` | You need keyed lookups, cache-like state, feature flags, or lightweight session markers. | You need relational queries, joins, or object delivery. |
| `D1` | You need SQL, relations, filters, or schema-shaped data. | You only need key lookup or one blob of file data. |
| `R2` | You need objects, uploads, generated files, or browser-facing file delivery through a Worker. | You need query semantics or tiny cache records. |
| `Hyperdrive` | You already have a remote PostgreSQL system and the worker should reach it through Cloudflare acceleration. | A local-first or greenfield schema could live in D1 instead. |

> **Note — The page boundary is deliberate**
>
> This page should help you pick the binding. The actual binding guides should explain how to author it, test it, preview it, and ship it.

#### Stable names are still the calmest authoring default

Name-based storage bindings stay readable in source review and let Devflare resolve the noisy ids later when build, deploy, or config-print flows actually need them.

That rule does not mean every binding works the same way, but it does keep the source-of-truth shape calmer for KV, D1, and Hyperdrive while R2 keeps its already-readable bucket names.

##### Example — Stable-name storage authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'storage-worker',
	bindings: {
		kv: {
			CACHE: { name: 'cache-kv' }
		},
		d1: {
			DB: { name: 'app-db' },
			AUDIT: { id: 'existing-d1-id' }
		},
		hyperdrive: {
			POSTGRES: 'app-postgres'
		},
		r2: {
			ASSETS: 'app-assets'
		}
	}
})
```

#### R2 still needs an explicit browser-delivery boundary

Devflare gives you real R2 bindings in worker code and tests, but it does not promise a stable browser-facing local bucket URL contract. If the browser needs the file in local dev, route through the app instead of assuming the bucket origin is the interface.

##### Highlights

- **Public assets** — Use a public bucket on a custom domain when anonymous reads are the product, not an accident.
- **Private assets** — Keep the bucket private and serve through a Worker that owns auth, headers, and cache policy.
- **Direct uploads** — Mint short-lived upload URLs from the backend and store object keys instead of pretending permanent raw URLs are the whole product.
- **R2 uploads & delivery** — Open this when the real question is presigned uploads, public versus private delivery, Access protection, signed custom-domain media links, or the right dev-versus-production posture. ([link](/docs/r2-uploads-and-delivery))

##### Example — Worker-gated file serving keeps the app boundary visible

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ env, params }: FetchEvent<DevflareEnv>): Promise<Response> {
	const object = await env.FILES.get(params.key)
	if (!object) {
		return new Response('Not Found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'Cache-Control': 'private, max-age=0'
		}
	})
}
```

#### Open the binding guide that owns the mechanics

##### Highlights

- **KV** — Open the KV guide when the storage shape is keyed lookup, cache-like state, or namespace lifecycle. ([link](/docs/kv-binding))
- **D1** — Open the D1 guide when the storage shape is query-driven and you need the actual SQL-shaped runtime contract. ([link](/docs/d1-binding))
- **R2** — Open the R2 guide when the real question is bucket usage, testing, preview naming, or file delivery details. ([link](/docs/r2-binding))
- **Hyperdrive** — Open the Hyperdrive guide when the worker is reaching an existing PostgreSQL system and the operational caveats matter more than the storage taxonomy. ([link](/docs/hyperdrive-binding))

---

### Handle R2 uploads and file delivery on purpose instead of treating bucket URLs as the product

> Use presigned `PUT` URLs for direct uploads, public buckets on custom domains for truly public assets, and private buckets plus Worker auth for protected files. Keep `r2.dev` out of production, and when a preview or environment needs its own bucket, scope it intentionally instead of borrowing production storage.

| Field | Value |
| --- | --- |
| Route | [`/docs/r2-uploads-and-delivery`](/docs/r2-uploads-and-delivery) |
| Group | Guides |
| Navigation title | R2 uploads & delivery |
| Eyebrow | Guide |

R2 itself is easy to bind. The hard part is the product boundary: should the browser upload directly, should reads stay behind your Worker, should teammates authenticate through Access, or should expiring custom-domain links be validated by a Worker or WAF rule? This page is the architecture guide for those choices.

#### At a glance

| Fact | Value |
| --- | --- |
| Safest upload default | Presigned `PUT` URL plus browser-direct upload plus object key stored in your app database |
| Safest private delivery default | Private bucket plus Worker-gated reads |
| Do not ship this as prod delivery | `r2.dev` |
| Team-only fit | Custom domain plus Cloudflare Access |

#### The fast rule set

##### Key points

- Use presigned `PUT` URLs for direct user uploads to R2.
- Use a public bucket on a custom domain for truly public assets.
- Use a private bucket plus Worker authorization for authenticated or tenant-scoped files.
- Use Cloudflare Access when the bucket should be visible only to teammates or your organization.
- Use a Worker-signed URL flow or WAF HMAC validation for expiring custom-domain media links.
- Do not use `r2.dev` for production delivery, and disable `r2.dev` if you protect a custom-domain bucket with Access or WAF so the bucket is not still public there.

> **Important — R2 binding mechanics are not the hard part**
>
> The architectural decision is whether the browser should talk to a signed upload URL, a public custom domain, or your own Worker route. That choice matters more than the one-line `bindings.r2` config.

#### The usual safe upload flow is direct upload with a presigned `PUT` URL

This is the usual safe default because large files do not have to stream through your app server or Worker just to end up in object storage anyway.

Cloudflare's UGC guidance says the same thing: let the Worker control auth and upload intent, then let the client stream directly to R2. If you need post-upload workflows, R2 event notifications can push object-create events into Queues for moderation, metadata writes, or follow-up processing.

##### Highlights

- **Presigned URLs** — Covers supported operations, security considerations, and the custom-domain limitation for presigned URLs. ([link](https://developers.cloudflare.com/r2/api/s3/presigned-urls/))
- **Configure CORS** — Use this when browser uploads or downloads cross origins and you need the exact allowed origins, methods, and headers model. ([link](https://developers.cloudflare.com/r2/buckets/cors/))
- **R2 event notifications** — Use this when uploads should trigger queue-driven moderation, indexing, metadata writes, or other follow-up work. ([link](https://developers.cloudflare.com/r2/buckets/event-notifications/))

##### Key points

- Generate object keys server-side, for example `users/<userId>/<uuid>.jpg`.
- Restrict `Content-Type` when signing uploads so mismatched uploads fail signature validation.
- Keep upload URLs short-lived and treat them as bearer tokens while they remain valid.
- Configure bucket CORS when the browser uploads directly.
- If uploads arrive from many regions, Local Uploads can improve cross-region write performance without changing the overall architecture.

##### Steps

1. The frontend asks your app for upload permission.
2. Your Worker or backend authenticates the user and validates file type, size, and the target object key.
3. Your backend returns a short-lived presigned `PUT` URL.
4. The browser uploads directly to R2.
5. Your app stores the object key and metadata, not the presigned URL.

> **Tip — Store object keys, not presigned URLs**
>
> Presigned URLs are temporary access tokens. The durable thing your app should remember is the object key plus the metadata you care about.

#### Choose the file-delivery pattern by who should be able to read the object

Cloudflare's public bucket docs are clear about this split: custom domains are the right place for cache, WAF, Access, and other edge controls, while `r2.dev` is a development-oriented public URL and should not be treated as the polished product surface.

When the content is private or app-controlled, the safest default is still a private bucket with a Worker route in front of it. That keeps auth and response headers under your control instead of forcing the bucket URL to become your application boundary.

##### Highlights

- **Public buckets** — Covers custom domains, caching, access control, and the `r2.dev` production warning. ([link](https://developers.cloudflare.com/r2/buckets/public-buckets/))
- **Protect an R2 bucket with Access** — Best when the audience is your own organization rather than anonymous or app-authenticated users. ([link](https://developers.cloudflare.com/r2/tutorials/cloudflare-access/))
- **Configure token authentication** — Use this when expiring custom-domain media links should be validated with WAF HMAC rules instead of R2 presigned URLs. ([link](https://developers.cloudflare.com/waf/custom-rules/use-cases/configure-token-authentication/))

##### Reference table

| Pattern | Use it when | Main caveat |
| --- | --- | --- |
| Public bucket on a custom domain | Images, assets, or media should be public and cacheable for anyone. | Use a custom domain for real delivery; `r2.dev` is not the production path. |
| Private bucket plus Worker-gated reads | Access depends on the current user, tenant, payment state, or other app authorization. | Your Worker becomes the delivery boundary, so own the auth, cache headers, and response metadata on purpose. |
| Presigned `GET` URL on the S3 endpoint | A download should be directly accessible for a short time without a custom delivery layer. | Presigned URLs are bearer tokens and do not work with custom domains. |
| Custom domain plus Cloudflare Access | Only teammates or organization users should reach the bucket. | Disable `r2.dev` so the bucket is not still reachable through the public development URL. |
| Custom domain plus Worker token auth or WAF HMAC validation | You want expiring direct links on `cdn.example.com` without exposing the whole bucket. | This is not the same feature as presigned R2 URLs; you are building or validating the access layer at the custom domain boundary. |

#### Keep development and production boundaries honest

Cloudflare's development guidance says local Worker development uses local simulated bindings by default, and Devflare follows the same practical posture: local R2 bindings are available to your worker code, tests, and bridge helpers without requiring a real remote bucket just to iterate.

That is why browser-visible local file flows should usually go through your Worker routes or app routes. Devflare does not promise a stable browser-facing local bucket origin, and depending on one would make local behavior more brittle than the product boundary probably needs to be.

##### Key points

- Only connect local development to a real remote bucket when you intentionally need integration testing.
- Use separate development, staging, or preview buckets instead of production buckets when remote R2 access becomes necessary.
- Remote bindings touch real data, incur real costs, and add real latency.
- In production, use a custom domain, choose public versus private delivery intentionally, configure CORS deliberately, and consider Local Uploads when uploaders are globally distributed.

> **Warning — Remote dev is not a harmless toggle**
>
> If your local Worker talks to a remote bucket, it is touching real data and real billing surfaces. Prefer separate dev or preview buckets, and avoid pointing local workflows at production uploads unless the test truly requires it.

##### Example — Serve a private object through the Worker in local dev and production

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ env, params }: FetchEvent<DevflareEnv>): Promise<Response> {
	const object = await env.FILES.get(params.key)
	if (!object) {
		return new Response('Not Found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'Cache-Control': 'private, max-age=0'
		}
	})
}
```

#### A sane default architecture

##### Highlights

- **R2 binding guide** — Open this once the architecture choice is done and the next question is the exact binding shape, local runtime behavior, or testing posture. ([link](/docs/r2-binding))
- **Preview-scoped bindings** — Open this when preview deployments should own separate buckets or other disposable infrastructure that can be cleaned up by scope later. ([link](/docs/config-previews))
- **createTestContext()** — Open this when the next question is how the local worker-shaped test harness exposes real R2 bindings and helper surfaces. ([link](/docs/create-test-context))

##### Key points

- Public assets → public bucket plus custom domain.
- User uploads → presigned `PUT` upload plus object key stored in D1 or another app database.
- Private assets → private bucket plus Worker-gated reads.
- Internal assets → custom domain plus Cloudflare Access.
- Custom-domain expiring links → Worker token auth or WAF HMAC validation.
- Preview-owned buckets → pair the R2 binding with `preview.scope()` so preview cleanup can remove the preview bucket without touching production storage.

> **Note — If you only remember one rule**
>
> Use presigned URLs for short-lived direct R2 access, but use a Worker or custom-domain auth layer for polished private media delivery.

---

### Choose Durable Objects for single-identity state, queues for deferred work, and the binding guides for the mechanics

> Use Durable Objects when one identity should own state or coordination. Use queues when work should happen later, in batches, or with retries. Then open the specific binding guide once the pattern is clear.

| Field | Value |
| --- | --- |
| Route | [`/docs/durable-objects-and-queues`](/docs/durable-objects-and-queues) |
| Group | Guides |
| Navigation title | State & async patterns |
| Eyebrow | Binding strategy |

This page is the pattern chooser for stateful or deferred work. It should help you decide when a Durable Object, a queue, or a mix of both fits the job without turning into a duplicate reference page for either binding.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Choosing between stateful identities, background work, or a mix of both |
| Choose by | State ownership vs deferred work ownership |
| Best local proof | One real object call or one real queue trigger through the default harness |
| Preview warning | Durable Object-heavy previews and queue-owned resources have different release questions |

#### Choose the primitive by ownership, not by vibes

The decision is easier when you ask who owns the work. If one stateful identity should serialize and own it, that points toward Durable Objects. If the request can accept the work and let something else finish it later, that points toward queues.

Once that choice is made, the specific binding guide should take over so this page does not try to restate every authoring and testing rule for both bindings.

##### Reference table

| Pattern | Reach for it when | Usually the wrong fit |
| --- | --- | --- |
| `Durable Objects` | One identity should own state, coordination, ordering, alarms, or WebSocket-adjacent behavior. | The work is fire-and-forget, batchable, or mainly about retries. |
| `Queues` | The request can enqueue work and return while a consumer handles retries, batching, or slow follow-up tasks. | The user needs the state transition to finish synchronously in the request path. |
| `Use both` | A request or Durable Object owns the immediate state, then enqueues slower side work such as email, indexing, or downstream writes. | One primitive already tells the whole story and the second one would only add ceremony. |

> **Note — The point is pattern fit, not duplicate reference docs**
>
> If you already know you need a Durable Object or a queue, the binding guide is the next page. This page is here for the choice, not the full mechanics.

#### Keep the config shapes explicit once you know the pattern

Both patterns work better when the binding contract is visible in config. Durable Objects should name the object classes or refs clearly, and queues should keep producers, consumers, and dead-letter rules in one authored shape instead of hiding them in deployment-only conventions.

##### Example — Durable Object binding authoring should stay boring and explicit

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'stateful-worker',
	files: {
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			LOGGER: {
				className: 'Logger'
			}
		}
	}
})
```

##### Example — Queue config should keep producer and consumer ownership visible

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-worker',
	bindings: {
		queues: {
			producers: {
				TASK_QUEUE: 'task-queue'
			},
			consumers: [
				{
					queue: 'task-queue',
					deadLetterQueue: 'task-queue-dlq'
				}
			]
		}
	}
})
```

#### Testing and preview questions are different for the two patterns

##### Highlights

- **Preview strategies** — Open this when the real question is how Durable Objects or preview-scoped queue resources change the preview model. ([link](/docs/preview-strategies))
- **Testing overview** — Use the testing map when the next question is about the right harness or which docs own the testing guidance. ([link](/docs/testing-overview))

##### Key points

- Durable Object tests are best at local object behavior, identity lookup, and stateful coordination. They do not replace migration or preview-topology checks.
- Queue tests are best at direct consumer behavior, retries, batching, and side effects through `cf.queue.trigger()`. They do not replace preview resource lifecycle checks.
- Durable Object-heavy preview flows deserve extra care because same-worker preview URLs and migrations have real platform caveats.
- If the real question is no longer “which primitive fits?” switch to the binding guide or the preview docs before this page starts repeating them badly.

#### Open the binding guide once the pattern is obvious

##### Highlights

- **Durable Objects** — Open the Durable Objects guide for the real binding shape, local tests, migrations, and preview caveats. ([link](/docs/durable-object-binding))
- **Queues** — Open the Queues guide for producer and consumer authoring, queue tests, and preview resource lifecycle details. ([link](/docs/queue-binding))

---

### Compose worker families with service bindings when another worker is a real dependency

> Use this page for the architecture question: when a separate worker boundary is justified, how `ref()` and service bindings keep it explicit, and where local tests and release checks should prove the wiring.

| Field | Value |
| --- | --- |
| Route | [`/docs/multi-workers`](/docs/multi-workers) |
| Group | Guides |
| Navigation title | Worker composition |
| Eyebrow | Composition |

The service-binding reference pages can explain the mechanics. This page exists for the composition question: when should another worker exist at all, how do you keep the boundary explicit, and which docs own the deeper service details once you commit to it?

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Service bindings, worker families, and deciding when another worker boundary is actually real |
| Core tools | `ref()`, service bindings, and generated env types |
| Best local proof | `createTestContext()` plus one real service call through `env.MY_SERVICE` |
| Main release risk | Resolved worker naming and preview topology drift |

#### Choose another worker only when the boundary is real

The goal is not to split one worker just because the file count went up. The goal is to give a real runtime boundary a real worker boundary, then let service bindings make that relationship explicit enough for tooling and review.

That means this page should answer the architecture choice first. The service-binding guide can take over once the answer is already “yes, another worker should exist.”

##### Reference table

| If the real thing is... | Prefer... | Why |
| --- | --- | --- |
| A separate runtime capability or internal API | `Service bindings` and another worker | The boundary is a real worker-to-worker relationship, not just shared state. |
| One stateful identity or serialized mutation lane | `Durable Objects` | The core need is state ownership, not another general-purpose service boundary. |
| Shared data, files, or a background job handoff | `KV`, `D1`, `R2`, or `Queues` | The problem is data or deferred work, not a second worker API. |

> **Note — A good review question**
>
> Ask “what does this second worker own that a binding or Durable Object would not?” before you celebrate the split.

#### Model the relationship with `ref()` so the worker family stays explicit

If another worker is real, the relationship belongs in config instead of in copied worker names or half-remembered script references. `ref()` gives Devflare enough structure to follow the dependency into local runtime, generated env types, and compiled output.

Keep the architecture example boring on purpose: one referenced worker and one explicit service binding are enough to show the boundary. Named entrypoints are real too, but the service-binding and generated-types pages own that deeper contract once the worker boundary itself is already justified.

##### Example — Model the worker family with `ref()` and one explicit service binding

```ts
import { defineConfig, ref } from 'devflare/config'

	const mathWorker = ref(() => import('../math-service/devflare.config'))

export default defineConfig({
	name: 'gateway',
	bindings: {
		services: {
				MATH_SERVICE: mathWorker.worker
		}
	}
})
```

#### Prove the wiring locally, then validate the names before release

The shortest truthful proof is one real service call through the generated env binding. That already shows the config relationship, the local multi-worker setup, and the callable surface the gateway worker will actually use.

But the release question is still different: local tests prove the call path, not that preview or production worker names resolve the way you intended.

##### Key points

- Use the bound env service directly when the worker relationship is the thing you want to prove.
- Refresh generated types when the service contract changes, and open the generated types page when named entrypoints become part of that contract.
- Preview isolation follows resolved worker names, not just which branch variable existed in CI.
- Validate compiled or preview naming when the worker family is business-critical.

##### Example — One real service call through the default harness

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('service binding calls the default worker export', async () => {
	expect(await env.MATH_SERVICE.add(5, 3)).toBe(8)
})
```

#### Open the service-specific pages once the architecture choice is done

##### Highlights

- **Service binding guide** — Open the service guide for the exact binding shape, env typing, and compiler behavior once another worker is definitely the right boundary. ([link](/docs/service-binding))
- **Testing Services** — Open the service testing guide when the next question is the right default harness or how to test named entrypoints honestly. ([link](/docs/service-testing))
- **Generated types** — Open this page when `ref()` relationships, named entrypoints, or `defineConfig<Entrypoints>()` typing becomes the real question. ([link](/docs/generated-types))
- **Preview strategies** — Open the preview page when the worker family needs real isolation and the naming model is the release question now. ([link](/docs/preview-strategies))
- **Testing overview** — Use the testing map when the next question is broader than service bindings alone. ([link](/docs/testing-overview))

---

### Use KV for fast lookup state without losing a real local loop

> KV bindings are first-class in Devflare: author stable names in config, keep env typed, and run real get or put flows locally.

| Field | Value |
| --- | --- |
| Route | [`/docs/kv-binding`](/docs/kv-binding) |
| Group | Bindings |
| Navigation title | KV |
| Eyebrow | Binding reference |

Devflare lets you keep KV intent human-readable in `devflare.config.ts` and only resolve opaque namespace ids when build or deploy flows actually need them.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.kv |
| Authoring shape | Record<string, string \| { name: string } \| { id: string }> |
| Best for | Cache-like lookups, sessions, feature flags, and lightweight request metadata |

#### Author it in the simplest shape that still says what you mean

KV is happiest when you keep the namespace name stable in authored config and let Devflare resolve ids later. That keeps reviews readable and avoids hiding infrastructure intent in random environment variables.

When you truly already know the namespace id, Devflare accepts that too. The important part is that both shapes compile down to the same deploy-facing contract.

##### Example — KV authoring with stable names or explicit ids

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-worker',
	bindings: {
		kv: {
			CACHE: 'cache-kv',
			SESSIONS: { name: 'sessions-kv' },
			LEGACY_CACHE: { id: 'kv-namespace-id' }
		}
	}
})
```

#### When this binding fits best

##### Key points

- Reach for KV when reads are by key and you do not need relational queries.
- It is a good home for feature flags, lightweight session markers, or cache records that are cheap to recompute.
- If you need SQL, batch transactions, or richer query patterns, use D1 instead of forcing KV to act like a database.

#### Notes worth keeping visible

##### Key points

- Rerun `devflare types` after adding or renaming a binding so the generated env contract stays honest.
- Preview-scoped names work well for namespace-per-branch flows, but they are still a naming strategy you should review on purpose.
- KV is local-friendly, but account-level provisioning behavior still belongs in build, preview, or deploy checks when the lifecycle matters.

> **Note — The safest authoring instinct**
>
> Prefer stable names in source and let Devflare resolve ids later. It keeps config readable without giving up deploy-ready output.

#### Cloudflare docs vs the Devflare layer

Cloudflare Workers KV docs is the platform reference. This page is the Devflare translation layer: keep `bindings.kv` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Workers KV docs** — Platform reference for KV namespaces, binding APIs, limits, and Wrangler-facing setup. ([link](https://developers.cloudflare.com/kv/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for KV namespaces, binding APIs, limits, and Wrangler-facing setup. | How to author `bindings.kv`, what the runtime surface looks like, and how KV fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | First-class local runtime and tests. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **KV internals** — See normalization, Wrangler `kv_namespaces`, and the preview or runtime details behind the authored shape. ([link](/docs/kv-internals))
- **Testing KV** — Start from `createTestContext()` plus `env.CACHE` or `cf.worker.fetch()` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/kv-testing))
- **KV example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/kv-example))

---

### How Devflare wires KV from config to runtime

> KV goes through the full Devflare pipeline: normalize authoring, resolve names when needed, then compile to Wrangler output.

| Field | Value |
| --- | --- |
| Route | [`/docs/kv-internals`](/docs/kv-internals) |
| Group | Bindings |
| Navigation title | KV internals |
| Eyebrow | Under the hood |

The important detail is that Devflare does not force ids too early. It keeps stable names readable in source and only turns them into deploy-ready output in flows that truly require it.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | String and `{ name }` forms both normalize to name-based bindings first |
| Compile target | Wrangler `kv_namespaces` |
| Preview note | Preview-scoped KV namespaces can be provisioned and cleaned up automatically |

#### Devflare normalizes the authored shape before it does anything louder

`bindings.kv` accepts a plain string, `{ name }`, or `{ id }`. Devflare normalizes those into one internal shape so later code can reason about them consistently.

That is why authored config can stay human-readable without making compiler or deploy code guess what each record means at the last second.

##### Example — KV from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-worker',
	bindings: {
		kv: {
			CACHE: 'cache-kv',
			SESSIONS: { name: 'sessions-kv' },
			LEGACY_CACHE: { id: 'kv-namespace-id' }
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"kv_namespaces": [
		{ "binding": "CACHE", "id": "kv-namespace-id" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- Local runtime resolution can keep the configured name as the local namespace identifier instead of forcing a Cloudflare API lookup.
- The env proxy supports the real KV methods you expect in worker code, including `get`, `put`, `delete`, `list`, and `getWithMetadata`.
- If you only need isolated unit tests, the repo also exposes `createMockKV()` and `createMockEnv()` helpers.

#### Compile, preview, and cleanup behavior

##### Key points

- Build and deploy flows resolve stable namespace names into ids when the output must be Wrangler-ready.
- If unresolved name-based KV bindings remain at compile time, Devflare rejects the config instead of silently guessing.
- Preview-scoped KV names are treated as lifecycle-managed resources, so branch-specific namespaces can be provisioned and cleaned up deliberately.

> **Tip — Why the split matters**
>
> Authored config can stay stable and readable even though deploy output eventually needs concrete ids. That separation is a big part of why KV feels pleasant in Devflare.

---

### Test KV the way Devflare expects it to run

> Use the default test harness first. KV is one of the bindings Devflare supports best in local tests.

| Field | Value |
| --- | --- |
| Route | [`/docs/kv-testing`](/docs/kv-testing) |
| Group | Bindings |
| Navigation title | Testing KV |
| Eyebrow | Testing |

When you call `createTestContext()`, KV namespaces are wired into the same env contract your worker code uses. That lets you test reads and writes without inventing a fake abstraction first.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Worker tests that read and write real KV values through the local harness |
| Default harness | `createTestContext()` plus `env.CACHE` or `cf.worker.fetch()` |
| Escalate when | You need to verify provisioning, preview naming, or account-side behavior |

#### Start with the default test loop

Start small: create the test context, write a value, read it back, and only then move outward to HTTP or queue-driven flows.

If the binding matters because a route uses it, test through that route. If the binding itself is the thing you are verifying, talk to `env.CACHE` directly.

##### Example — Testing KV through the real Devflare env

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('stores and reads a cache value', async () => {
	await env.CACHE.put('feature:search', 'on')
	expect(await env.CACHE.get('feature:search')).toBe('on')
})
```

#### The helper surface to remember

##### Key points

- Use `env.CACHE` or the specific KV binding directly when you want the shortest binding-focused assertion.
- Use `cf.worker.fetch()` if the behavior only matters once a request has gone through your real handler.
- Use `createMockKV()` only when the test truly should not boot the runtime-shaped harness.

#### When to move beyond the default harness

##### Key points

- Local KV tests are excellent for behavior and shape, but they do not replace deploy-time checks for account provisioning or preview cleanup.
- If a test is really about routing, auth, or caching headers, keep the assertion at the worker level instead of overfocusing on the namespace API.
- Preview-specific namespace naming is worth one dedicated integration check when branch isolation matters.

> **Important — A good default split**
>
> Test binding semantics locally and test lifecycle semantics in preview or deploy-oriented paths. Trying to make one test do both usually makes it worse at each job.

---

### A small KV example you can adapt quickly

> This example keeps KV boring on purpose: one binding, one fetch handler, one assertion.

| Field | Value |
| --- | --- |
| Route | [`/docs/kv-example`](/docs/kv-example) |
| Group | Bindings |
| Navigation title | KV example |
| Eyebrow | Starter example |

The fastest way to trust a binding is to wire one small use case end to end before you hide it behind a bigger app.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Stable namespace naming |
| Runtime shape | Direct `put()` and `get()` calls in a fetch handler |
| Best use | A tiny cache or session-marker flow |

#### Start by wiring the binding clearly in config

##### Example — Minimal KV config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			CACHE: 'cache-kv'
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Run `devflare types` once the binding exists so `env.CACHE` is typed in both worker code and tests.
- Prefer a tiny route like this before you wrap KV behind a helper or service layer.

##### Example — A tiny fetch handler that uses KV

```ts
import { env } from 'devflare'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	if (url.pathname === '/write') {
		await env.CACHE.put('hello', 'from-kv')
		return new Response('stored')
	}

	return new Response((await env.CACHE.get('hello')) ?? 'missing')
}
```

#### Lock in the behavior with one small test or smoke path

> **Note — Start with the boring shape**
>
> If the first KV example already feels abstract, it is probably hiding the actual binding semantics instead of teaching them.

##### Example — One tiny test is enough to trust the first version

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('writes and reads through the worker', async () => {
	await cf.worker.get('/write')
	const response = await cf.worker.get('/')
	expect(await response.text()).toBe('from-kv')
})
```

---

### Use D1 when the worker wants real queries instead of key-value tricks

> D1 gets the same stable-name authoring story as KV, but the runtime shape is relational: `prepare`, `batch`, `exec`, and prepared statements.

| Field | Value |
| --- | --- |
| Route | [`/docs/d1-binding`](/docs/d1-binding) |
| Group | Bindings |
| Navigation title | D1 |
| Eyebrow | Binding reference |

Devflare keeps D1 readable in config and testable in local runtime, which means you can model actual query behavior before you wire up preview or deploy steps.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.d1 |
| Authoring shape | Record<string, string \| { name: string } \| { id: string }> |
| Best for | Structured data, SQL queries, and cases where key-based lookup is not enough |

#### Author it in the simplest shape that still says what you mean

D1 follows the same stable-name instinct as KV: author by readable name unless you intentionally already have a database id you want to pin to.

That gives teams one repeatable review habit: look for human-meaningful names in source, then inspect generated or resolved output only when a deploy flow needs it.

##### Example — D1 binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-worker',
	bindings: {
		d1: {
			DB: 'app-db',
			AUDIT: { name: 'audit-db' },
			LEGACY: { id: 'd1-database-id' }
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use D1 when the worker needs SQL, joins, or a schema that should be queried instead of fetched by a single key.
- It fits better than KV for records that need filtering, ordering, or transactional updates.
- If the only operation is key lookup or a tiny cache record, KV usually stays simpler.

#### Notes worth keeping visible

##### Key points

- Run `devflare types` after binding changes so the database bindings show up correctly in `env.d.ts`.
- Preview-scoped databases are useful when branch data must stay isolated, but they should still be provisioned and cleaned up deliberately.
- Name-based D1 authoring is readable, but build and deploy still need a path that resolves those names to ids before output is treated as final.

> **Note — Do not hide the database shape**
>
> The point of D1 docs is to keep SQL visible enough that reviewers can still understand what the worker is doing, not to hide every query behind framework glue.

#### Cloudflare docs vs the Devflare layer

Cloudflare D1 docs is the platform reference. This page is the Devflare translation layer: keep `bindings.d1` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare D1 docs** — Platform reference for D1 databases, Worker APIs, migrations, and database limits. ([link](https://developers.cloudflare.com/d1/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for D1 databases, Worker APIs, migrations, and database limits. | How to author `bindings.d1`, what the runtime surface looks like, and how D1 fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | First-class local runtime and tests. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **D1 internals** — See normalization, Wrangler `d1_databases`, and the preview or runtime details behind the authored shape. ([link](/docs/d1-internals))
- **Testing D1** — Start from `createTestContext()` with `env.DB` or `cf.worker.fetch()` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/d1-testing))
- **D1 example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/d1-example))

---

### How Devflare wires D1 from config to runtime

> D1 uses the same normalize-then-resolve pattern as KV, but compiles to Wrangler `d1_databases` and exposes a relational local runtime surface.

| Field | Value |
| --- | --- |
| Route | [`/docs/d1-internals`](/docs/d1-internals) |
| Group | Bindings |
| Navigation title | D1 internals |
| Eyebrow | Under the hood |

The key implementation detail is that Devflare can keep a stable database name around until a flow truly needs the real database id. That keeps config readable without giving up deploy precision.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | Name-based authoring stays name-based until a build or deploy flow resolves it |
| Compile target | Wrangler `d1_databases` |
| Preview note | Preview-scoped D1 databases can be provisioned and cleaned up by Devflare |

#### Devflare normalizes the authored shape before it does anything louder

Like KV, D1 bindings normalize into one internal shape so compiler and runtime code do not need to special-case string versus object authoring everywhere.

That normalized form is what lets Devflare keep the friendly source-of-truth shape while still generating strict Wrangler-facing output later.

##### Example — D1 from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-worker',
	bindings: {
		d1: {
			DB: 'app-db',
			AUDIT: { name: 'audit-db' },
			LEGACY: { id: 'd1-database-id' }
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"d1_databases": [
		{ "binding": "DB", "database_id": "d1-database-id" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The local bridge exposes the D1 APIs people actually use: `prepare()`, `batch()`, `exec()`, and the prepared-statement helpers like `first`, `all`, `run`, and `raw`.
- `createTestContext()` can boot those bindings without a custom mock layer, which is why D1 tests can stay close to production query code.
- If you only need isolated unit tests, `createMockD1()` exists, but it is usually weaker than the full runtime-shaped harness.

#### Compile, preview, and cleanup behavior

##### Key points

- Build and deploy resolve name-based D1 records to real database ids before Devflare emits compiled config.
- Compile rejects unresolved name-based D1 bindings instead of silently producing half-finished Wrangler output.
- Preview resource management can create and later remove branch-specific D1 databases when the preview model truly owns separate data.

> **Tip — Same authoring rule, different runtime shape**
>
> The config story is close to KV, but the runtime story is unapologetically SQL-shaped. That is exactly how it should feel.

---

### Test D1 the way Devflare expects it to run

> D1 is one of the easiest bindings to test meaningfully with Devflare because the local runtime already speaks the same database API your worker uses.

| Field | Value |
| --- | --- |
| Route | [`/docs/d1-testing`](/docs/d1-testing) |
| Group | Bindings |
| Navigation title | Testing D1 |
| Eyebrow | Testing |

Start with `createTestContext()`, then either query the database directly through `env.DB` or exercise it through your real routes. Both are normal, not exotic.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Query behavior, route-level database flows, and schema-aware worker tests |
| Default harness | `createTestContext()` with `env.DB` or `cf.worker.fetch()` |
| Escalate when | You need migration, provisioning, or branch-scoped preview verification |

#### Start with the default test loop

The cleanest D1 test loop mirrors how the worker really behaves: boot the test context, run a small query, and assert the returned row or route result.

If a helper wraps the query logic, keep one direct database test around anyway so the underlying binding contract stays visible.

##### Example — A tiny D1 test through the local harness

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('D1 answers a simple health query', async () => {
	const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
	expect(row?.ok).toBe(1)
})
```

#### The helper surface to remember

##### Key points

- Use `env.DB` when the binding itself is the thing you care about.
- Use `cf.worker.fetch()` when the database matters because a route, queue consumer, or other handler reaches it.
- Keep the schema setup close to the test when possible so the query story stays visible.

#### When to move beyond the default harness

##### Key points

- Local tests are excellent for query logic, but they are not a substitute for migration review or account-side database provisioning checks.
- If the assertion is really about a business route, do not collapse the entire behavior down to one raw SQL assertion and pretend that is the full story.
- Preview-specific D1 isolation is worth its own higher-level check when branch data boundaries matter.

> **Warning — Do not let SQL disappear into helper fog**
>
> One reason D1 feels good in Devflare is that the runtime API is still recognizable. Keep at least one test close enough to see the actual query behavior.

---

### A small D1 example you can adapt quickly

> This starter example keeps D1 focused on one job: answer a single query and prove the binding works locally.

| Field | Value |
| --- | --- |
| Route | [`/docs/d1-example`](/docs/d1-example) |
| Group | Bindings |
| Navigation title | D1 example |
| Eyebrow | Starter example |

You do not need a giant ORM story to prove D1 is wired correctly. One table-shaped query is already enough to make the point.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Stable database naming |
| Runtime shape | Prepared statement query in a fetch handler |
| Best use | Health checks, small lookup routes, and early schema experiments |

#### Start by wiring the binding clearly in config

##### Example — Minimal D1 config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		d1: {
			DB: 'app-db'
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- You can replace the health query with a real table lookup later without changing the binding shape.
- Keep one route like this around if you want a cheap deploy smoke path for D1.

##### Example — A tiny route that proves the binding works

```ts
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
	return Response.json({ ok: row?.ok === 1 })
}
```

#### Lock in the behavior with one small test or smoke path

> **Note — The first example does not need a migration epic**
>
> Prove the binding first. Add richer schema setup only after the worker already has one truthful D1 path.

##### Example — A matching smoke test

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET / returns a D1-backed health response', async () => {
	const response = await cf.worker.get('/')
	expect(await response.json()).toEqual({ ok: true })
})
```

---

### Use R2 for object storage, but route browser delivery on purpose

> R2 is straightforward in config and well-supported locally, but browser-facing delivery should usually go through a Worker route instead of assuming bucket URLs.

| Field | Value |
| --- | --- |
| Route | [`/docs/r2-binding`](/docs/r2-binding) |
| Group | Bindings |
| Navigation title | R2 |
| Eyebrow | Binding reference |

Devflare treats R2 as a first-class binding in worker code and tests. The main discipline is deciding which files are public, which are private, and which paths should stay app-controlled.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.r2 |
| Authoring shape | Record<string, string> |
| Best for | Files, uploads, generated assets, and private object delivery through a Worker |

#### Author it in the simplest shape that still says what you mean

R2 is the least ambiguous storage binding to author: you bind a name in env to a bucket name in config.

The real architectural choice is not the config key. It is whether the browser talks to a public bucket, a signed upload path, or a worker-controlled route that checks auth first.

##### Example — R2 binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-worker',
	bindings: {
		r2: {
			ASSETS: 'assets-bucket',
			PRIVATE_FILES: 'private-files-bucket'
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use R2 for large objects, uploads, or file delivery that does not belong in D1 or KV.
- Keep private file delivery in a Worker route so auth and response headers stay under your control.
- If the browser needs a direct public asset origin, use a public bucket on a custom domain on purpose rather than by accident.

#### Notes worth keeping visible

##### Key points

- Do not assume local bucket URLs are a public contract your app can safely depend on.
- Use `devflare types` after binding changes so bucket names show up correctly in `env.d.ts`.
- Preview-scoped buckets are useful, but they should still be cleaned up intentionally when previews expire.

> **Warning — The browser-delivery rule**
>
> If the browser needs the file in local dev, route through your worker unless you intentionally chose a public bucket contract.

#### Cloudflare docs vs the Devflare layer

Cloudflare R2 docs is the platform reference. This page is the Devflare translation layer: keep `bindings.r2` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare R2 docs** — Platform reference for buckets, object APIs, public-versus-private delivery, and account features. ([link](https://developers.cloudflare.com/r2/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for buckets, object APIs, public-versus-private delivery, and account features. | How to author `bindings.r2`, what the runtime surface looks like, and how R2 fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | First-class local runtime and tests. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **R2 internals** — See normalization, Wrangler `r2_buckets`, and the preview or runtime details behind the authored shape. ([link](/docs/r2-internals))
- **Testing R2** — Start from `createTestContext()` with `env.ASSETS` or `cf.worker.fetch()` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/r2-testing))
- **R2 example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/r2-example))

---

### How Devflare wires R2 from config to runtime

> R2 is simpler than KV or D1 because the authored value is already the bucket name, so there is no name-versus-id resolution dance.

| Field | Value |
| --- | --- |
| Route | [`/docs/r2-internals`](/docs/r2-internals) |
| Group | Bindings |
| Navigation title | R2 internals |
| Eyebrow | Under the hood |

That simplicity is part of why R2 feels predictable in Devflare. The runtime and compiler story mostly focuses on wiring methods and generated output cleanly, not on translating names into ids.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | There is no separate id-resolution phase for the authored bucket name |
| Compile target | Wrangler `r2_buckets` |
| Preview note | Preview-scoped buckets can be provisioned and cleaned up by Devflare |

#### Devflare normalizes the authored shape before it does anything louder

R2 is one of the cleanest bindings internally because the authored string is already the thing Wrangler expects later: the bucket name.

That means Devflare mostly needs to preserve the mapping faithfully, generate output, and expose the runtime methods cleanly in local mode.

##### Example — R2 from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-worker',
	bindings: {
		r2: {
			ASSETS: 'assets-bucket',
			PRIVATE_FILES: 'private-files-bucket'
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"r2_buckets": [
		{ "binding": "ASSETS", "bucket_name": "assets-bucket" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The local bridge supports `head`, `get`, `put`, `delete`, and `list` on R2 buckets.
- Large `put()` operations can switch to HTTP transfer inside the bridge rather than trying to force every object body through one RPC path.
- `createMockR2()` exists for isolated tests, but the real local harness is usually the better default.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile emits `r2_buckets` directly from the authored mapping.
- Preview resource lifecycle code can materialize branch-scoped bucket names, provision them, and later clean them up.
- The browser URL story is intentionally left to your app architecture rather than being smuggled into the binding implementation.

> **Note — Simple binding, nontrivial delivery choices**
>
> R2 config is easy. The interesting decisions are about how files flow through your app, not about how many nested objects the config needs.

---

### Test R2 the way Devflare expects it to run

> R2 is local-friendly, which means you can test real object operations without inventing a storage adapter just to get off the ground.

| Field | Value |
| --- | --- |
| Route | [`/docs/r2-testing`](/docs/r2-testing) |
| Group | Bindings |
| Navigation title | Testing R2 |
| Eyebrow | Testing |

Use the runtime-shaped harness for direct bucket tests, then move up to worker-level tests when headers, auth, or file routing matter.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Object reads, writes, deletes, and route-level file-serving checks |
| Default harness | `createTestContext()` with `env.ASSETS` or `cf.worker.fetch()` |
| Escalate when | You need to verify public delivery contracts or preview resource lifecycle |

#### Start with the default test loop

R2 tests can be extremely small: put one object, read it back, and confirm the content or headers through the same worker path users will actually hit.

That is often enough to prove the binding, while the route test proves your app-level delivery rules.

##### Example — Testing a real R2 binding

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('stores and reads an object', async () => {
	await env.ASSETS.put('hello.txt', 'from-r2')
	const object = await env.ASSETS.get('hello.txt')
	expect(await object?.text()).toBe('from-r2')
})
```

#### The helper surface to remember

##### Key points

- Use `env.ASSETS` when you are verifying the bucket contract itself.
- Use `cf.worker.fetch()` when the route, auth, or response metadata is the thing that matters.
- Keep at least one test close to the bucket API so the storage shape stays visible.

#### When to move beyond the default harness

##### Key points

- A passing local bucket test does not mean your public asset topology is good; that still belongs to route and deployment design.
- If the browser-facing path matters, assert the worker response instead of treating a bucket read as the whole user story.
- Bucket provisioning and cleanup belong in preview or deploy-oriented checks when branch infrastructure matters.

> **Warning — Test the right layer**
>
> An object round-trip proves the binding. It does not automatically prove your file-delivery architecture.

---

### A small R2 example you can adapt quickly

> This example uses one private bucket and one route, which is still the cleanest default shape for many real apps.

| Field | Value |
| --- | --- |
| Route | [`/docs/r2-example`](/docs/r2-example) |
| Group | Bindings |
| Navigation title | R2 example |
| Eyebrow | Starter example |

A good first R2 example teaches both the binding and the delivery boundary: the worker decides what the browser gets.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Direct bucket naming |
| Runtime shape | Get an object from R2 and stream it through a route |
| Best use | Private file delivery or media endpoints |

#### Start by wiring the binding clearly in config

##### Example — Minimal R2 config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		r2: {
			FILES: 'private-files'
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- This route pattern keeps auth, caching, and content-type decisions in your app instead of in an assumed bucket URL contract.
- If you later choose a public bucket, make that an explicit architecture decision rather than a hidden side effect.

##### Example — Serve an object through the worker

```ts
import { env } from 'devflare'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const key = url.pathname.replace(/^\/files\//, '')
	const object = await env.FILES.get(key)

	if (!object) {
		return new Response('Not found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream'
		}
	})
}
```

#### Lock in the behavior with one small test or smoke path

> **Note — A better first instinct than “just use the bucket URL”**
>
> Routing through the worker teaches the real boundary between stored objects and browser-facing responses.

##### Example — A quick route-level check

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET /files/hello.txt serves the stored object', async () => {
	await env.FILES.put('hello.txt', 'hello from r2')
	const response = await cf.worker.get('/files/hello.txt')
	expect(await response.text()).toBe('hello from r2')
})
```

---

### Use Durable Objects when coordination or state really belongs with a single object identity

> Devflare treats Durable Objects as a real first-class surface in config, local runtime, and tests, not as an awkward plugin hanging off the side of the worker.

| Field | Value |
| --- | --- |
| Route | [`/docs/durable-object-binding`](/docs/durable-object-binding) |
| Group | Bindings |
| Navigation title | Durable Objects |
| Eyebrow | Binding reference |

That makes DO-heavy apps easier to reason about locally, but it also means you should be honest about the preview and migration caveats that come with them.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.durableObjects |
| Authoring shape | Record<string, string \| { className: string; scriptName?: string }> |
| Best for | Stateful sessions, locks, room state, and coordination that should not be faked as random stateless requests |

#### Author it in the simplest shape that still says what you mean

A DO binding can be as simple as a class name string when the object lives in the same worker package.

When the object lives in another worker, `ref()` keeps that relationship explicit instead of scattering script names and class names across the repo.

##### Example — Durable Object authoring in one worker

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'chat-worker',
	files: {
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			ROOM: 'ChatRoom',
			LOCK: { className: 'WriteLock' }
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Durable Objects when state or coordination should live behind one object identity, not when you merely want a fancy singleton.
- They are a good fit for rooms, counters, distributed locks, and request serialization.
- If the state is really just data you query, D1 or KV may stay simpler and easier to preview.

#### Notes worth keeping visible

##### Key points

- DO-heavy apps need extra preview care because same-worker preview URLs do not cover every real DO deployment case.
- `wrangler versions upload` does not currently apply Durable Object migrations, so migration-sensitive previews need a stronger plan.
- Test and review worker naming carefully when DO bindings cross worker boundaries.

> **Warning — The preview caveat is real, not optional trivia**
>
> If previews must exercise real Durable Object behavior, branch-scoped preview workers are often safer than hoping same-worker preview URLs will be enough.

#### Cloudflare docs vs the Devflare layer

Cloudflare Durable Objects docs is the platform reference. This page is the Devflare translation layer: keep `bindings.durableObjects` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Durable Objects docs** — Platform reference for object identity, storage, alarms, migrations, and deployment caveats. ([link](https://developers.cloudflare.com/durable-objects/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for object identity, storage, alarms, migrations, and deployment caveats. | How to author `bindings.durableObjects`, what the runtime surface looks like, and how Durable Objects fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | First-class local runtime and tests, including cross-worker references. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Durable Objects internals** — See normalization, Wrangler `durable_objects.bindings`, and the preview or runtime details behind the authored shape. ([link](/docs/durable-object-internals))
- **Testing Durable Objects** — Start from `createTestContext()` with the real DO namespace in `env` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/durable-object-testing))
- **Durable Objects example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/durable-object-example))

---

### How Devflare wires Durable Objects from config to runtime

> Durable Object bindings normalize into a stable binding shape, compile into Wrangler `durable_objects.bindings`, and participate in Devflare’s own DO bundling path.

| Field | Value |
| --- | --- |
| Route | [`/docs/durable-object-internals`](/docs/durable-object-internals) |
| Group | Bindings |
| Navigation title | Durable Objects internals |
| Eyebrow | Under the hood |

This is one of the places where Devflare feels the most application-aware. It is not only compiling config — it is discovering DO classes, bundling them, and keeping local runtime behavior coherent.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | Local strings, explicit objects, and cross-worker refs normalize into one DO binding model |
| Compile target | Wrangler `durable_objects.bindings` |
| Preview note | DO apps often need branch-scoped preview workers instead of same-worker preview URLs |

#### Devflare normalizes the authored shape before it does anything louder

DO bindings accept a string, an explicit `{ className, scriptName? }` object, or a cross-worker reference produced by `ref()`. Devflare normalizes those into one internal shape before later steps inspect them.

That normalized shape is what lets config, compiler, and test-context setup all speak the same language even when a DO comes from another worker package.

##### Example — Durable Objects from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'chat-worker',
	files: {
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			ROOM: 'ChatRoom',
			LOCK: { className: 'WriteLock' }
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"durable_objects": {
		"bindings": [
			{ "name": "ROOM", "class_name": "ChatRoom" }
		]
	}
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The local test context can auto-detect cross-worker DO refs and stand up the required multi-worker Miniflare shape for them.
- The DO bundler discovers classes from `files.durableObjects`, emits worker-compatible code, and even handles special cases like `@cloudflare/puppeteer` usage.
- Tests can use the normal DO namespace ergonomics instead of a custom fake API surface.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile emits `class_name` and optional `script_name` for each binding, which is what Wrangler-facing output expects.
- Cross-worker DO references are resolved before compile output is treated as final.
- Preview and deploy workflows need to respect real DO migration and preview caveats instead of pretending the platform limitations disappeared.

> **Important — This is where Devflare earns its keep**
>
> If a tool cannot keep DO authoring, local runtime, and test setup coherent, DO-heavy apps get painful fast. Devflare’s value is that these pieces stay part of one story.

---

### Test Durable Objects the way Devflare expects it to run

> Durable Objects are well-supported in the default Devflare harness, which means you can test real object behavior without hand-building a fake namespace first.

| Field | Value |
| --- | --- |
| Route | [`/docs/durable-object-testing`](/docs/durable-object-testing) |
| Group | Bindings |
| Navigation title | Testing Durable Objects |
| Eyebrow | Testing |

That support extends to cross-worker DO scenarios too, as long as the config relationships are explicit. The main testing question is whether you are checking local object behavior or deployment caveats.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Local stateful behavior, object methods, and cross-worker DO wiring checks |
| Default harness | `createTestContext()` with the real DO namespace in `env` |
| Escalate when | The question is preview URLs, migrations, or branch-scoped deploy behavior |

#### Start with the default test loop

Start by creating the test context and calling the object through its real namespace. That proves the binding, the identity lookup, and the object behavior in one go.

Keep one test close to the object semantics even if your app later wraps DO access behind services or helper modules.

##### Example — Testing a Durable Object through the real namespace

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('the counter object increments', async () => {
	const id = env.COUNTER.idFromName('global')
	const stub = env.COUNTER.get(id)
	const response = await stub.fetch('https://counter/increment')
	expect(await response.text()).toBe('1')
})
```

#### The helper surface to remember

##### Key points

- Use the real DO namespace in `env` whenever possible instead of a fake interface.
- If the object is reached through a route or another worker, keep a worker-level test around as well.
- Use cross-worker refs in config rather than loose string conventions so the test context can understand the relationship.

#### When to move beyond the default harness

##### Key points

- Local DO tests do not replace migration reviews or branch-scoped preview checks.
- If the real risk is deployment naming or preview topology, write a higher-level preview test instead of stretching the local harness past its job.
- DO apps often need stronger preview isolation than a same-worker upload path can give them.

> **Warning — Separate object behavior from preview behavior**
>
> The default harness is excellent for object logic. It is not a substitute for the preview strategy decisions that DO-heavy apps still need.

---

### A small Durable Objects example you can adapt quickly

> This example uses a tiny counter object because the shape is easy to understand and still proves the important DO wiring.

| Field | Value |
| --- | --- |
| Route | [`/docs/durable-object-example`](/docs/durable-object-example) |
| Group | Bindings |
| Navigation title | Durable Objects example |
| Eyebrow | Starter example |

A counter is not glamorous, but it teaches the real ingredients: one binding, one class, one namespace lookup, and one request path that exercises state.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Explicit class discovery and DO binding |
| Runtime shape | Namespace lookup plus `stub.fetch()` |
| Best use | Counters, room state, and small single-identity coordination examples |

#### Start by wiring the binding clearly in config

##### Example — Minimal Durable Object config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'do-example',
	files: {
		fetch: 'src/fetch.ts',
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: 'Counter'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['Counter']
		}
	]
})
```

#### Then use it in one honest runtime path

##### Key points

- This tiny shape already proves that the object class, namespace, and fetch path are wired correctly.
- Once this works, richer room or lock logic becomes a normal extension instead of a blind leap.

##### Example — A tiny object and fetch path

```ts
import { env } from 'devflare'

// src/do/counter.ts should increment a stored value and return the new count.

export async function fetch(): Promise<Response> {
	const id = env.COUNTER.idFromName('global')
	const stub = env.COUNTER.get(id)
	return stub.fetch('https://counter/increment')
}
```

#### Lock in the behavior with one small test or smoke path

> **Note — The tiny state machine is enough**
>
> You do not need a chat app to learn Durable Objects. One counter proves the important mechanics without burying them.

##### Example — A matching local test

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET / increments the counter object', async () => {
	const first = await cf.worker.get('/')
	const second = await cf.worker.get('/')
	expect(await first.text()).toBe('1')
	expect(await second.text()).toBe('2')
})
```

---

### Use Queues when work should happen later, in batches, or with retries

> Devflare models Queue producers and consumers explicitly, which makes local tests and preview naming much easier to reason about.

| Field | Value |
| --- | --- |
| Route | [`/docs/queue-binding`](/docs/queue-binding) |
| Group | Bindings |
| Navigation title | Queues |
| Eyebrow | Binding reference |

The config shape keeps the relationship visible: which bindings can enqueue work, which consumer handles that queue, and how retries or dead-letter behavior should look.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.queues |
| Authoring shape | { producers?: Record<string, string>; consumers?: QueueConsumer[] } |
| Best for | Background jobs, async processing, fan-out work, and controlled retry behavior |

#### Author it in the simplest shape that still says what you mean

Queues are easiest to understand when the producer names and consumer config live together in the same authored source of truth.

That way the code review already shows who sends messages, who processes them, and where failures go when retries run out.

##### Example — Queue producer and consumer authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-worker',
	bindings: {
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue',
					deadLetterQueue: 'jobs-dlq',
					maxRetries: 3
				}
			]
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Queues when the worker should hand work off instead of blocking the original request.
- They are a good fit for batch processing, notifications, post-request writes, and work that deserves retry control.
- If the task must happen synchronously in the request path, a queue is probably the wrong tool.

#### Notes worth keeping visible

##### Key points

- Keep producer and consumer intent explicit so dead-letter and retry behavior is reviewable.
- Preview-scoped queues and DLQs are possible, but they should be created only when the preview really owns separate async infrastructure.
- Queue tests should separate handler behavior from wider route or scheduling concerns.

> **Note — The queue rule of thumb**
>
> If a request can safely say “I accepted the work” before the work is complete, queues are a good candidate. If not, keep it in the request path.

#### Cloudflare docs vs the Devflare layer

Cloudflare Queues docs is the platform reference. This page is the Devflare translation layer: keep `bindings.queues` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Queues docs** — Platform reference for queue producers, consumers, delivery guarantees, retries, batching, and DLQs. ([link](https://developers.cloudflare.com/queues/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for queue producers, consumers, delivery guarantees, retries, batching, and DLQs. | How to author `bindings.queues`, what the runtime surface looks like, and how Queues fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | First-class local runtime and queue-trigger tests. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Queues internals** — See normalization, Wrangler `queues.producers` and `queues.consumers`, and the preview or runtime details behind the authored shape. ([link](/docs/queue-internals))
- **Testing Queues** — Start from `createTestContext()` plus `cf.queue.trigger()` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/queue-testing))
- **Queues example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/queue-example))

---

### How Devflare wires Queues from config to runtime

> Queue config is compiled into explicit producer and consumer blocks, with preview resource materialization available for both queue names and DLQs.

| Field | Value |
| --- | --- |
| Route | [`/docs/queue-internals`](/docs/queue-internals) |
| Group | Bindings |
| Navigation title | Queues internals |
| Eyebrow | Under the hood |

This is one of the clearer compiler paths in Devflare: producers become env bindings, consumers become worker-side queue listeners, and preview lifecycle code can materialize names when the preview should own separate queues.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | Producer and consumer config is split into one normalized queue model before compile |
| Compile target | Wrangler `queues.producers` and `queues.consumers` |
| Preview note | Preview queue names and DLQs can be provisioned and cleaned up when the preview owns them |

#### Devflare normalizes the authored shape before it does anything louder

Devflare does not treat queue producers and queue consumers as unrelated configuration fragments. It keeps them in one coherent config namespace so later compile and preview code can see the whole story.

That is why review and runtime stay aligned: the config already names the queue, the producer binding, the consumer, and the dead-letter relationship in one place.

##### Example — Queues from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-worker',
	bindings: {
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue',
					deadLetterQueue: 'jobs-dlq',
					maxRetries: 3
				}
			]
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"queues": {
		"producers": [
			{ "binding": "JOBS", "queue": "jobs-queue" }
		],
		"consumers": [
			{ "queue": "jobs-queue", "dead_letter_queue": "jobs-dlq", "max_retries": 3 }
		]
	}
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The local harness can stand up queue producers as real env bindings and trigger the queue handler through test helpers.
- Queue helper behavior is different from plain worker fetch behavior because `cf.queue.trigger()` waits for queued background work before returning.
- That makes queue tests a good place to assert post-processing side effects directly.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile converts consumer options into the output shape Wrangler expects, including retry and dead-letter fields.
- Preview materialization can generate branch-specific queue and DLQ names when the preview environment should own separate async infrastructure.
- This lifecycle support covers queue resources more directly than service bindings, which mostly stay name-based references.

> **Tip — Queues stay reviewable when the config stays explicit**
>
> The combination of producers, consumers, and dead-letter settings is much easier to trust when it lives in one visible authored shape.

---

### Test Queues the way Devflare expects it to run

> Queue testing is one of the places where Devflare’s helper surface feels especially good because the queue trigger already knows how to drive the real handler shape.

| Field | Value |
| --- | --- |
| Route | [`/docs/queue-testing`](/docs/queue-testing) |
| Group | Bindings |
| Navigation title | Testing Queues |
| Eyebrow | Testing |

That means you can test a queue consumer without bootstrapping your own fake message batch or pretending the queue handler is just a random function.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Queue consumer behavior, retries, and queue-driven side effects |
| Default harness | `createTestContext()` plus `cf.queue.trigger()` |
| Escalate when | You need to verify preview queue lifecycle or deployment topology |

#### Start with the default test loop

Start by triggering the consumer directly. That is usually the shortest path to proving retries, acknowledgements, and side effects like KV writes or database updates.

If the queue is reached from an HTTP route, keep one route-level test too so the enqueue step itself stays visible.

##### Example — Testing a queue consumer through Devflare helpers

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('queue consumer stores a processed result', async () => {
	await cf.queue.trigger([
		{
			id: 'job-1',
			body: { id: 'task-1', type: 'process', createdAt: Date.now() }
		}
	])

	expect(await env.RESULTS.get('result:task-1')).not.toBeNull()
})
```

#### The helper surface to remember

##### Key points

- Use `cf.queue.trigger()` when the consumer behavior is what you care about.
- Use `env.JOBS.send()` when you want to prove enqueue code in the same runtime path.
- Queue tests are a good place to assert retries or DLQ behavior because the helper already understands the message shape.

#### When to move beyond the default harness

##### Key points

- Queue helper success does not automatically prove your preview or deploy queue topology is right.
- If the route-to-queue path matters, keep one request test so the enqueue boundary stays visible.
- Batch semantics and failure handling deserve their own tests instead of one giant everything-at-once assertion.

> **Important — Queue tests are allowed to be direct**
>
> You do not need to sneak queue behavior behind HTTP if the queue consumer itself is the thing you want confidence in.

---

### A small Queues example you can adapt quickly

> This starter example wires one producer, one consumer, and one stored result so you can see the whole queue loop without ceremony.

| Field | Value |
| --- | --- |
| Route | [`/docs/queue-example`](/docs/queue-example) |
| Group | Bindings |
| Navigation title | Queues example |
| Eyebrow | Starter example |

A good queue example should prove three things quickly: the request can enqueue work, the consumer can process it, and some visible side effect confirms the work ran.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Explicit producer and consumer config |
| Runtime shape | Request enqueues work, queue handler stores result |
| Best use | Background jobs and post-request processing |

#### Start by wiring the binding clearly in config

##### Example — Minimal queue config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-example',
	bindings: {
		kv: {
			RESULTS: 'results-kv'
		},
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue'
				}
			]
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Once this shape works, you can add retries, DLQs, and richer payloads without changing the fundamental loop.
- This example stays intentionally small so the queue contract is the thing you notice first.

##### Example — One fetch path and one queue consumer

```ts
import { env } from 'devflare'
import type { MessageBatch } from '@cloudflare/workers-types'

export async function fetch(): Promise<Response> {
	await env.JOBS.send({ id: 'job-1', createdAt: Date.now() })
	return new Response('queued', { status: 202 })
}

export async function queue(batch: MessageBatch<{ id: string }>): Promise<void> {
	for (const message of batch.messages) {
		await env.RESULTS.put('job:' + message.body.id, 'done')
		message.ack()
	}
}
```

#### Lock in the behavior with one small test or smoke path

> **Note — Keep the first side effect visible**
>
> Writing one result record is a better first example than a complex job pipeline you cannot see end to end.

##### Example — A direct consumer test

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('queue work writes a result record', async () => {
	await cf.queue.trigger([{ id: 'msg-1', body: { id: 'job-1' } }])
	expect(await env.RESULTS.get('job:job-1')).toBe('done')
})
```

---

### Use the AI binding when the worker needs real Workers AI inference, not just a local mock

> AI is a supported binding in Devflare, but it is intentionally treated as remote-oriented because real model inference lives on Cloudflare infrastructure.

| Field | Value |
| --- | --- |
| Route | [`/docs/ai-binding`](/docs/ai-binding) |
| Group | Bindings |
| Navigation title | AI |
| Eyebrow | Binding reference |

That means the docs should be honest: Devflare can compile and type the binding cleanly, but meaningful tests usually need remote mode and real account access.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.ai |
| Authoring shape | { binding: string } |
| Best for | Real inference against Workers AI models |

#### Author it in the simplest shape that still says what you mean

AI is one of the clearest examples of Devflare choosing honesty over fantasy. The binding exists in config, the env is typed, and the deploy story is real — but model inference itself still lives on Cloudflare infrastructure.

That is why the testing story leans on remote mode rather than pretending Miniflare can be a credible stand-in for actual model execution.

##### Example — Workers AI binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-worker',
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use AI when the worker should call a real Workers AI model.
- Keep the binding dedicated to model work instead of pretending every route needs AI by default.
- If the only goal is local happy-path UI wiring, use a normal fake at the app edge and reserve remote AI tests for the worker boundary.

#### Notes worth keeping visible

##### Key points

- AI is remote-oriented, so local-only test runs should not be expected to exercise real inference.
- Cloudflare auth and a resolvable account are part of the contract for meaningful AI tests. An explicit `accountId` helps when the target account would otherwise be ambiguous, but it is not the only way Devflare can resolve one.
- Because inference has cost and availability implications, it deserves more deliberate test gating than local-first bindings.

> **Warning — Do not present AI as a local-first binding**
>
> The honest story is that Devflare supports the binding cleanly, but real AI behavior still requires remote infrastructure.

#### Cloudflare docs vs the Devflare layer

Cloudflare Workers AI docs is the platform reference. This page is the Devflare translation layer: keep `bindings.ai` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Workers AI docs** — Platform reference for model access, remote inference behavior, pricing, and account prerequisites. ([link](https://developers.cloudflare.com/workers-ai/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for model access, remote inference behavior, pricing, and account prerequisites. | How to author `bindings.ai`, what the runtime surface looks like, and how AI fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the real remote product behavior, account requirements, and runtime constraints on the platform. | Remote-oriented; local tests require remote mode. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **AI internals** — See normalization, Wrangler `ai` binding, and the preview or runtime details behind the authored shape. ([link](/docs/ai-internals))
- **Testing AI** — Start from `createTestContext()` after remote mode is enabled, plus `shouldSkip.ai` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/ai-testing))
- **AI example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/ai-example))

---

### How Devflare wires AI from config to runtime

> AI has a smaller compiler story than storage bindings, but a more explicit auth and remote-runtime story.

| Field | Value |
| --- | --- |
| Route | [`/docs/ai-internals`](/docs/ai-internals) |
| Group | Bindings |
| Navigation title | AI internals |
| Eyebrow | Under the hood |

Devflare does not invent a fake local AI runtime. It compiles the binding, checks remote requirements when needed, and exposes remote helpers for tests that intentionally opt in.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | The authored shape is small, so the important complexity lives in auth and remote enablement rather than config normalization |
| Compile target | Wrangler `ai` binding |
| Preview note | AI is remote-oriented; preview is less about provisioning and more about whether the worker path may call the model |

#### Devflare normalizes the authored shape before it does anything louder

AI does not need the same name-versus-id resolution dance as KV or D1. The authored shape is basically “which env binding name should exist.”

The heavier implementation work lives in auth checks and remote-test setup, because the value of the binding only appears once the worker can reach real Cloudflare AI services.

##### Example — AI from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-worker',
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"ai": {
		"binding": "AI"
	}
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- `checkRemoteBindingRequirements()` treats AI as a binding that requires remote account context.
- `createTestContext()` can inject a remote AI helper when remote mode is enabled and an account can be resolved.
- `Ai.gateway()` is not supported by the current remote AI test helper, so gateway-specific flows need a higher-level integration path.
- `shouldSkip.ai` exists so tests can say clearly when remote inference is unavailable instead of failing opaquely.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile emits the AI binding shape directly into generated Wrangler output.
- Because the runtime behavior is remote-oriented, the major operational risk is not syntax — it is auth, availability, and cost control.
- Preview behavior is mostly about whether that worker path should call real models, not about separate preview-managed AI resources.

> **Note — Honest tooling beats fake local magic**
>
> Devflare makes AI explicit and testable on purpose, but it does not pretend local emulation is equivalent to real inference.

---

### Test AI the way Devflare expects it to run

> The right AI test strategy is selective: use remote mode when you mean to test inference, and skip cleanly when the environment is not allowed to do that.

| Field | Value |
| --- | --- |
| Route | [`/docs/ai-testing`](/docs/ai-testing) |
| Group | Bindings |
| Navigation title | Testing AI |
| Eyebrow | Testing |

Trying to force AI into the same local-only expectations as KV or D1 leads to misleading tests. Devflare already gives you the right gates — use them.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Remote inference checks and binding-level AI smoke tests |
| Default harness | `createTestContext()` after remote mode is enabled, plus `shouldSkip.ai` |
| Escalate when | The AI call is expensive, flaky, or business-critical enough to need a separate release gate |

#### Start with the default test loop

Start with a tiny inference call and a tiny assertion. The goal is to prove that the binding works and the worker can talk to the intended model, not to test your entire AI product in one unit test.

Enable remote mode first — for example with `devflare remote enable ...` or `DEVFLARE_REMOTE=1` (or another truthy value) in automation — and skip explicitly when the environment still cannot support remote AI instead of forcing the test to fail in noisy ways.

##### Example — A remote-oriented AI test

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

const skipAI = await shouldSkip.ai

describe.skipIf(skipAI)('AI binding', () => {
	test('runs a tiny inference request', async () => {
		const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
			messages: [{ role: 'user', content: 'Reply with OK only.' }],
			max_tokens: 4
		})

		expect(result).toBeDefined()
	})
})
```

#### The helper surface to remember

##### Key points

- Enable remote mode before expecting `createTestContext()` to inject a real AI binding, for example with `DEVFLARE_REMOTE=1` in automation.
- Use `shouldSkip.ai` to make remote prerequisites explicit in the test file itself.
- Keep AI assertions small enough that failures teach you about the binding path, not about prompt engineering drift.
- Use non-AI stubs above the worker layer when the app UI only needs a placeholder during purely local development.

#### When to move beyond the default harness

##### Key points

- Remote AI tests are not free; keep them targeted and intentional.
- If the worker depends on `Ai.gateway()`, test that path outside the remote AI helper because the helper warns and does not implement gateway mode.
- If the worker contract is business-critical, move AI smoke tests into an explicit integration or release lane rather than running them everywhere.
- Do not confuse local app mocks with proof that the real AI binding path works.

> **Important — Skip is not weakness here**
>
> For remote bindings, a clear skip condition is often more trustworthy than a forced local pseudo-test that never exercised the real platform.

---

### A small AI example you can adapt quickly

> This example keeps the AI path tiny: one binding, one inference call, one JSON response.

| Field | Value |
| --- | --- |
| Route | [`/docs/ai-example`](/docs/ai-example) |
| Group | Bindings |
| Navigation title | AI example |
| Eyebrow | Starter example |

That is enough to prove the worker can talk to Workers AI without burying the example inside a whole chat product.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Minimal binding declaration |
| Runtime shape | Call `env.AI.run(...)` from the worker |
| Best use | Small inference endpoints and smoke checks |

#### Start by wiring the binding clearly in config

##### Example — Minimal AI config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Use a cheap, small model in smoke paths unless the point is to verify a specific expensive production model.
- Keep local app mocks above this worker route if you need offline UI development.

##### Example — A tiny inference endpoint

```ts
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
		messages: [{ role: 'user', content: 'Reply with OK only.' }],
		max_tokens: 4
	})

	return Response.json({ result })
}
```

#### Keep the first version boring on purpose

> **Warning — This example still needs remote access**
>
> It is a minimal worker example, not a promise of local AI emulation. Treat account access and cost control as part of the example setup.

---

### Use Vectorize when the worker really owns similarity search, not just string matching

> Vectorize is fully modeled in Devflare config and preview naming, but meaningful tests are still remote-oriented because the index lives on Cloudflare infrastructure.

| Field | Value |
| --- | --- |
| Route | [`/docs/vectorize-binding`](/docs/vectorize-binding) |
| Group | Bindings |
| Navigation title | Vectorize |
| Eyebrow | Binding reference |

That makes the docs pattern similar to AI: compile support is strong, preview lifecycle is explicit, and tests should be honest about when they are using the real index versus a fake.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.vectorize |
| Authoring shape | Record<string, { indexName: string }> |
| Best for | Similarity search, embedding-backed lookup, and retrieval paths that belong in the worker |

#### Author it in the simplest shape that still says what you mean

Vectorize authoring is simple in config, but the operational story matters: an index must exist, dimensions must match, and tests should acknowledge that they are calling a real remote system.

Devflare helps by keeping the binding explicit, the index name visible, and preview resource handling deliberate when the preview needs its own index.

##### Example — Vectorize binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'search-worker',
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Vectorize when semantic similarity is part of the worker’s real job, not when plain text search is already enough.
- It fits best when the worker is already producing or consuming embeddings as part of the application flow.
- If the vector store is optional or external to the worker, keep the boundary explicit and do not force Vectorize into every local path.

#### Notes worth keeping visible

##### Key points

- Real Vectorize tests need remote access and an index that actually exists.
- Preview-scoped indexes are possible and lifecycle-managed, but they should be created only when the preview really needs isolated vector state.
- Local fake vector stores can be useful above the worker boundary, but they are not proof that the real binding path works.

> **Warning — Dimension and index setup are part of the contract**
>
> A passing unit test with a fake array is not equivalent to a real Vectorize call against the configured index.

#### Cloudflare docs vs the Devflare layer

Cloudflare Vectorize docs is the platform reference. This page is the Devflare translation layer: keep `bindings.vectorize` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Vectorize docs** — Platform reference for indexes, embeddings, remote querying, and preview-aware index lifecycle. ([link](https://developers.cloudflare.com/vectorize/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for indexes, embeddings, remote querying, and preview-aware index lifecycle. | How to author `bindings.vectorize`, what the runtime surface looks like, and how Vectorize fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the real remote product behavior, account requirements, and runtime constraints on the platform. | Remote-oriented; local tests require remote mode or explicit mocks. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Vectorize internals** — See normalization, Wrangler `vectorize`, and the preview or runtime details behind the authored shape. ([link](/docs/vectorize-internals))
- **Testing Vectorize** — Start from `createTestContext()` in remote mode plus `shouldSkip.vectorize` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/vectorize-testing))
- **Vectorize example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/vectorize-example))

---

### How Devflare wires Vectorize from config to runtime

> Vectorize compiles cleanly into Wrangler output and participates in preview resource lifecycle, but the runtime value of the binding mostly lives in remote infrastructure.

| Field | Value |
| --- | --- |
| Route | [`/docs/vectorize-internals`](/docs/vectorize-internals) |
| Group | Bindings |
| Navigation title | Vectorize internals |
| Eyebrow | Under the hood |

That is why the codebase treats Vectorize as supported but remote-oriented. Config and preview handling are strong; local emulation is intentionally not oversold.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | The authored shape is small, so most complexity is in remote access and preview resource lifecycle |
| Compile target | Wrangler `vectorize` |
| Preview note | Preview-scoped Vectorize indexes are lifecycle-managed resources in Devflare |

#### Devflare normalizes the authored shape before it does anything louder

Each Vectorize binding is a named env entry pointing to an explicit `indexName`. There is not much normalization complexity because the important value is already visible in source.

The heavier internal story is around preview resource handling and remote test support, because that is where real index existence and lifecycle start to matter.

##### Example — Vectorize from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'search-worker',
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"vectorize": [
		{ "binding": "DOCUMENT_INDEX", "index_name": "document-index" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- `createTestContext()` can supply a remote Vectorize binding when remote mode is enabled.
- The codebase uses `shouldSkip.vectorize` to make missing remote prerequisites explicit in tests.
- The exhaustive smoke app also uses mocks for some integration checks, which is fine as long as the docs do not confuse that with first-class local emulation.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile emits `index_name` into generated Wrangler-facing config.
- Preview resource lifecycle code can materialize branch-specific index names and later clean them up.
- Because the binding is remote-oriented, the hardest failures are usually missing indexes, dimension mismatches, or auth — not config syntax.

> **Note — Supported does not mean locally emulated**
>
> Vectorize is fully part of the config schema and preview story, but the meaningful runtime path still belongs to the remote platform.

---

### Test Vectorize the way Devflare expects it to run

> The right Vectorize tests are targeted remote checks: a small insert or query, a clear skip condition, and a real index behind the binding.

| Field | Value |
| --- | --- |
| Route | [`/docs/vectorize-testing`](/docs/vectorize-testing) |
| Group | Bindings |
| Navigation title | Testing Vectorize |
| Eyebrow | Testing |

Avoid pretending a local fake embedding store proved the same thing. It may still be useful for UI or higher-level app tests, but it is not the binding test.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Remote similarity-search checks and index smoke tests |
| Default harness | `createTestContext()` in remote mode plus `shouldSkip.vectorize` |
| Escalate when | The index contract is business-critical enough to need explicit CI or release gating |

#### Start with the default test loop

Keep the test as small as possible: insert one vector or query one known embedding and verify the shape of the result.

If the index is missing, skip with a clear message. That teaches future maintainers more than a mysterious failure ever will.

##### Example — A remote Vectorize smoke test

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

const skipVectorize = await shouldSkip.vectorize

describe.skipIf(skipVectorize)('Vectorize binding', () => {
	test('accepts one upsert and one query', async () => {
		const vector = Array(32).fill(0.5)
		await env.DOCUMENT_INDEX.upsert?.([
			{ id: 'doc-1', values: vector, metadata: { kind: 'demo' } }
		])

		const result = await env.DOCUMENT_INDEX.query?.(vector, { topK: 1 })
		expect(result).toBeDefined()
	})
})
```

#### The helper surface to remember

##### Key points

- Use `shouldSkip.vectorize` so missing remote prerequisites are explicit instead of noisy.
- Keep the vector size and index name close to the test so the contract remains visible.
- If the surrounding app only needs a demo path locally, mock above the worker boundary instead of pretending the remote index was exercised.

#### When to move beyond the default harness

##### Key points

- Running Vectorize tests everywhere is rarely necessary; put them where the signal is worth the cost.
- A passing local mock tells you nothing about index existence or vector dimension compatibility.
- If a preview environment owns its own index, add one lifecycle-aware check for that path specifically.

> **Important — A tiny real query beats a giant fake suite**
>
> For remote vector search, one truthful remote smoke check is often worth more than a dozen intricate local fakes.

---

### A small Vectorize example you can adapt quickly

> This example keeps Vectorize honest: one index binding, one upsert, and one query against the same worker path.

| Field | Value |
| --- | --- |
| Route | [`/docs/vectorize-example`](/docs/vectorize-example) |
| Group | Bindings |
| Navigation title | Vectorize example |
| Eyebrow | Starter example |

That is enough to show the binding shape without requiring a whole retrieval stack in the very first example.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Explicit index naming |
| Runtime shape | Upsert one vector and query it back |
| Best use | Search prototypes and embedding-backed retrieval endpoints |

#### Start by wiring the binding clearly in config

##### Example — Minimal Vectorize config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'vectorize-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Keep the embedding dimension explicit and consistent with the actual index you created.
- If you later split write and read into separate routes, this same example still teaches the core binding path.

##### Example — A tiny write-and-query route

```ts
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const vector = Array(32).fill(0.5)

	await env.DOCUMENT_INDEX.upsert?.([
		{ id: 'doc-1', values: vector, metadata: { title: 'Demo doc' } }
	])

	const result = await env.DOCUMENT_INDEX.query?.(vector, {
		topK: 1,
		returnMetadata: true
	})

	return Response.json({ result })
}
```

#### Keep the first version boring on purpose

> **Warning — The remote index still has to exist**
>
> This example is small on purpose, but it is not fictional. The named index has to exist and match the vector shape you send.

---

### Use Hyperdrive when the worker needs a real PostgreSQL path behind Cloudflare’s pooling layer

> Hyperdrive is modeled in Devflare config and compile flows like other name-based resources, but its tested local ergonomics are thinner than D1 or KV.

| Field | Value |
| --- | --- |
| Route | [`/docs/hyperdrive-binding`](/docs/hyperdrive-binding) |
| Group | Bindings |
| Navigation title | Hyperdrive |
| Eyebrow | Binding reference |

That is not a reason to avoid it — it is a reason to document it honestly. The binding is supported, yet the strongest evidence in the repo focuses on presence, connection info, and targeted integration rather than a giant local mock universe.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.hyperdrive |
| Authoring shape | Record<string, string \| { name: string } \| { id: string }> |
| Best for | Workers that connect to PostgreSQL through Hyperdrive |

#### Author it in the simplest shape that still says what you mean

Hyperdrive follows the same stable-name instinct as KV and D1: author a readable name in source when you can, then let Devflare resolve ids later when a flow actually needs them.

The main difference is operational. Hyperdrive has credential and infrastructure constraints that make preview lifecycle trickier than storage bindings like KV or R2.

##### Example — Hyperdrive binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'postgres-worker',
	bindings: {
		hyperdrive: {
			DB: 'app-postgres',
			LEGACY_DB: { id: 'hyperdrive-id' }
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Hyperdrive when the worker needs PostgreSQL and you want the Cloudflare-managed connection path rather than raw direct wiring.
- It fits best when a real Postgres database already exists and the worker boundary should speak to it deliberately.
- If your data is already a comfortable fit for D1, D1 may still be the simpler first choice.

#### Notes worth keeping visible

##### Key points

- The repo evidence for local Hyperdrive ergonomics is thinner than the local stories for D1, KV, or R2.
- Preview-scoped Hyperdrive configs are not auto-cloned from the base configuration because stored credentials are not always available for that.
- When a preview Hyperdrive config does not exist, Devflare may fall back to the base configuration and warn.

> **Warning — Supported does not mean equally local-friendly**
>
> Hyperdrive belongs in the binding library, but its test guidance should stay more conservative than the guidance for D1 or KV.

#### Cloudflare docs vs the Devflare layer

Cloudflare Hyperdrive docs is the platform reference. This page is the Devflare translation layer: keep `bindings.hyperdrive` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Hyperdrive docs** — Platform reference for database acceleration, connection strings, limits, and supported databases. ([link](https://developers.cloudflare.com/hyperdrive/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for database acceleration, connection strings, limits, and supported databases. | How to author `bindings.hyperdrive`, what the runtime surface looks like, and how Hyperdrive fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | Supported, but with a narrower proven local test story. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Hyperdrive internals** — See normalization, Wrangler `hyperdrive`, and the preview or runtime details behind the authored shape. ([link](/docs/hyperdrive-internals))
- **Testing Hyperdrive** — Start from `createTestContext()` plus small binding or smoke checks and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/hyperdrive-testing))
- **Hyperdrive example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/hyperdrive-example))

---

### How Devflare wires Hyperdrive from config to runtime

> Hyperdrive uses the same normalize-and-resolve pattern as KV and D1, but preview lifecycle includes a fallback path instead of guaranteed preview cloning.

| Field | Value |
| --- | --- |
| Route | [`/docs/hyperdrive-internals`](/docs/hyperdrive-internals) |
| Group | Bindings |
| Navigation title | Hyperdrive internals |
| Eyebrow | Under the hood |

That fallback behavior is worth documenting explicitly because it changes how you should think about preview isolation and cleanup for database-backed flows.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | Hyperdrive follows the same name-versus-id normalization family as KV and D1 |
| Compile target | Wrangler `hyperdrive` |
| Preview note | Preview Hyperdrive configs may fall back to the base config when a preview clone cannot be materialized |

#### Devflare normalizes the authored shape before it does anything louder

Hyperdrive authoring accepts a string, `{ name }`, or `{ id }`, and Devflare normalizes those into one internal binding shape so later code can treat them consistently.

That part looks familiar if you already understand KV or D1. The unusual part is preview lifecycle, not the authored schema.

##### Example — Hyperdrive from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'postgres-worker',
	bindings: {
		hyperdrive: {
			DB: 'app-postgres',
			LEGACY_DB: { id: 'hyperdrive-id' }
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"hyperdrive": [
		{ "binding": "DB", "id": "hyperdrive-id" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The repo shows Hyperdrive bindings exposing connection-oriented information such as `connectionString`, and some smoke paths also allow a `query()`-style helper.
- I did not find the same rich bridge-level local helper story that exists for D1, KV, or R2, which is why the docs should stay cautious here.
- The strongest proven local habit is to assert the binding exists and to use targeted integration for database behavior that really matters.

#### Compile, preview, and cleanup behavior

##### Key points

- Build and deploy resolve name-based Hyperdrive bindings to real configuration ids before generating output.
- Preview resource logic cannot always clone a base Hyperdrive config because Cloudflare does not expose stored credentials for that workflow.
- When a preview Hyperdrive config is missing but the base config exists, Devflare can fall back to the base binding and warn instead of pretending isolation happened.

> **Note — This is a lifecycle caveat, not a syntax caveat**
>
> The config shape is straightforward. The reason Hyperdrive needs extra documentation is the preview and credential story, not the authoring syntax.

---

### Test Hyperdrive the way Devflare expects it to run

> Hyperdrive testing should start smaller and more cautiously than D1 testing: prove the binding exists, then add targeted integration where the real database path matters.

| Field | Value |
| --- | --- |
| Route | [`/docs/hyperdrive-testing`](/docs/hyperdrive-testing) |
| Group | Bindings |
| Navigation title | Testing Hyperdrive |
| Eyebrow | Testing |

The codebase shows enough evidence to document Hyperdrive as supported, but not enough to oversell it as a drop-in local-first database harness identical to D1.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Binding presence checks and targeted PostgreSQL integration paths |
| Default harness | `createTestContext()` plus small binding or smoke checks |
| Escalate when | The app depends on real preview isolation or actual Postgres query behavior |

#### Start with the default test loop

Start with one small assertion that the binding exists and exposes the connection information your code expects. That already tells you whether the config and runtime wiring are sane.

Then add focused integration tests against the actual database path instead of manufacturing a huge fake local contract that the repo itself does not clearly guarantee.

##### Example — A conservative Hyperdrive smoke test

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('Hyperdrive binding exposes connection info', () => {
	expect(env.DB).toBeDefined()
	expect(Boolean(env.DB?.connectionString)).toBe(true)
})
```

#### The helper surface to remember

##### Key points

- Use small binding-presence checks first instead of overpromising local query semantics.
- Keep one higher-level integration path for the real database behavior you actually care about.
- If preview isolation matters, test the fallback or dedicated preview strategy explicitly.

#### When to move beyond the default harness

##### Key points

- Do not present Hyperdrive as if Devflare already gives it the same local comfort story as D1.
- If the worker truly depends on live query behavior, prefer an integration test against a real database path.
- Preview-specific Hyperdrive expectations deserve a dedicated test because automatic cloning is not guaranteed.

> **Warning — Conservative is the honest test strategy**
>
> The goal is trustworthy docs, not pretending every binding has identical local ergonomics.

---

### A small Hyperdrive example you can adapt quickly

> This example keeps Hyperdrive focused on one thing: prove the binding exists and expose the connection information your app will need next.

| Field | Value |
| --- | --- |
| Route | [`/docs/hyperdrive-example`](/docs/hyperdrive-example) |
| Group | Bindings |
| Navigation title | Hyperdrive example |
| Eyebrow | Starter example |

That is a better first example than a giant database abstraction because it teaches the actual runtime contract the repo proves today.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Stable Hyperdrive naming |
| Runtime shape | Read connection information from the binding |
| Best use | Health checks and first integration wiring |

#### Start by wiring the binding clearly in config

##### Example — Minimal Hyperdrive config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hyperdrive-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		hyperdrive: {
			DB: 'app-postgres'
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Once this route works, the next step is usually a targeted integration with the actual PostgreSQL driver and database path you plan to use.
- This example is intentionally smaller than D1 because the repo evidence for Hyperdrive local ergonomics is also smaller.

##### Example — Expose the binding shape you will use later

```ts
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	return Response.json({
		hasBinding: Boolean(env.DB),
		hasConnectionString: Boolean(env.DB?.connectionString)
	})
}
```

#### Keep the first version boring on purpose

> **Note — A smaller example is a more truthful example**
>
> The point here is to show the real binding contract the worker receives, not to imply more local guarantees than the repo currently proves.

---

### Use Browser Rendering when the worker really needs a headless browser path

> Devflare supports Browser Rendering, but the docs should say the quiet part out loud: there is exactly one browser binding today, and the best-supported local story lives in dev-server and integration flows.

| Field | Value |
| --- | --- |
| Route | [`/docs/browser-binding`](/docs/browser-binding) |
| Group | Bindings |
| Navigation title | Browser Rendering |
| Eyebrow | Binding reference |

That is still useful. It means browser work can live in the same docs library as every other binding, just with honest caveats about limits and testing style.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.browser |
| Authoring shape | Record<string, string> with exactly one entry |
| Best for | PDF generation, screenshots, and other worker-side headless browser tasks |

#### Author it in the simplest shape that still says what you mean

Browser Rendering looks a little unusual in config because the current contract is a named map with exactly one entry. The env key matters more than the configured string value that appears beside it.

That is also why generated env typing stays conservative today: `devflare types` can model the binding as `Fetcher`, while the richer browser behavior comes from the dev server shim and browser-aware libraries.

That single-binding constraint is not a Devflare whim. It reflects the current Wrangler and platform support Devflare is choosing to expose honestly.

##### Example — Browser binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-worker',
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Browser Rendering when the worker truly needs a browser — for PDF generation, screenshots, or browser-like page evaluation.
- Keep browser usage narrow and explicit because browser work is usually heavier than normal request handling.
- If a feature can be expressed as a plain fetch or HTML transform, it probably should be.

#### Notes worth keeping visible

##### Key points

- Only one browser binding is currently supported.
- The strongest local story lives in dev-server and integration flows, not in a rich browser-specific test helper API.
- Preview naming exists, but browser resources are not provisioned or deleted like account-managed storage resources.

> **Warning — Exactly one really means one**
>
> If you configure more than one browser binding, schema validation rejects it because the underlying Wrangler contract only supports one.

#### Cloudflare docs vs the Devflare layer

Cloudflare Browser Rendering docs is the platform reference. This page is the Devflare translation layer: keep `bindings.browser` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Browser Rendering docs** — Platform reference for browser sessions, quick actions, automation limits, and integration methods. ([link](https://developers.cloudflare.com/browser-rendering/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for browser sessions, quick actions, automation limits, and integration methods. | How to author `bindings.browser`, what the runtime surface looks like, and how Browser Rendering fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | Supported, but the strongest story is dev server and integration rather than a dedicated test helper. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Browser Rendering internals** — See normalization, Wrangler `browser` binding, and the preview or runtime details behind the authored shape. ([link](/docs/browser-internals))
- **Testing Browser Rendering** — Start from A narrow browser route exercised through the dev server, a preview URL, or another integration-style path and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/browser-testing))
- **Browser Rendering example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/browser-example))

---

### How Devflare wires Browser Rendering from config to runtime

> Browser Rendering support in Devflare is more than a config pass-through: the dev server starts a browser shim and a binding worker that line up with Cloudflare and puppeteer expectations.

| Field | Value |
| --- | --- |
| Route | [`/docs/browser-internals`](/docs/browser-internals) |
| Group | Bindings |
| Navigation title | Browser Rendering internals |
| Eyebrow | Under the hood |

That implementation detail is why the binding belongs in the docs library even though the test helper surface is narrower. There is real, deliberate runtime support here.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | The env binding name is the important authoring value, while the configured string is mainly used for naming and preview materialization |
| Compile target | Wrangler `browser` binding |
| Preview note | Preview can materialize the binding name, but browser resources are not lifecycle-managed account resources |

#### Devflare normalizes the authored shape before it does anything louder

The browser binding schema accepts a record but then validates that only one key exists. Devflare treats that key as the meaningful env binding name and compiles it into the single `browser.binding` entry Wrangler expects.

That is why the docs should emphasize the env key and the single-binding limit instead of implying the string value behaves like a normal bucket or namespace resource.

##### Example — Browser Rendering from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-worker',
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"browser": {
		"binding": "BROWSER"
	}
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The dev server starts a browser shim that can install Chrome Headless Shell and proxy the Browser Rendering protocol over HTTP and WebSocket.
- The binding worker exists so browser libraries like `@cloudflare/puppeteer` can talk to the expected Worker-side contract.
- Generated env typing stays conservative here too: the binding currently lands as `Fetcher`, which is another reason to keep the worker-facing browser path narrow and explicit.
- This is why browser local support feels more like dev-server infrastructure than like a small `cf.browser.*` helper.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile emits the single browser binding from the configured env key.
- Preview logic can materialize names, but Devflare does not provision or delete browser “resources” because they are not account-managed the same way storage bindings are.
- The browser path can also warn about missing local WebSocket support when the environment lacks the `ws` dependency needed for proxying.

> **Note — The honest browser story**
>
> Browser support is real, but it is infrastructural. Expect a stronger dev-server story than a tiny one-function local helper story.

---

### Test Browser Rendering the way Devflare expects it to run

> Browser tests should usually be integration-flavored: either drive the worker in dev or exercise a thin smoke path that proves the binding can launch and fetch.

| Field | Value |
| --- | --- |
| Route | [`/docs/browser-testing`](/docs/browser-testing) |
| Group | Bindings |
| Navigation title | Testing Browser Rendering |
| Eyebrow | Testing |

That is more truthful than pretending there is a rich first-class browser helper surface identical to `cf.queue.trigger()` or `env.DB.prepare()`.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Launch smoke tests, PDF generation routes, and browser-backed worker endpoints |
| Default harness | A narrow browser route exercised through the dev server, a preview URL, or another integration-style path |
| Escalate when | A real browser workflow is mission-critical or too heavy for ordinary test runs |

#### Start with the default test loop

Keep the worker-side browser entry small enough that one smoke path can prove it launches, opens a page, or returns a generated artifact.

If the real logic is bigger — for example a full PDF renderer DO — write one narrow end-to-end check and keep the rest of the code tested at smaller layers.

##### Example — A tiny dev-server browser smoke check

```ts
import { expect, test } from 'bun:test'

const baseUrl = process.env.DEVFLARE_TEST_URL ?? 'http://127.0.0.1:8787'

test('browser-backed route responds', async () => {
	const response = await fetch(new URL('/browser-health', baseUrl))
	expect(response.ok).toBe(true)
})
```

#### The helper surface to remember

##### Key points

- Prefer one narrow worker route or DO method for browser tasks so the binding path stays testable.
- Drive that route through the dev server, a preview URL, or another integration path when browser launch itself is the thing under test.
- If you want Bun-only unit tests, stub above the browser boundary instead of expecting `createTestContext()` to conjure a first-class browser binding for you.
- Treat browser local checks as smoke tests unless the app really needs a heavier dedicated lane.

#### When to move beyond the default harness

##### Key points

- No dedicated browser helper surface means you should test the worker boundary or integration path instead of reaching for fictional convenience APIs.
- `createTestContext()` is still useful around surrounding worker code, but it is not a browser-specific helper that automatically populates `env.BROWSER` for you.
- Browser workloads are heavier than typical request tests, so they deserve intentional scheduling in CI.
- If the route depends on browser proxying or WebSockets, test that path in an environment close to the real dev server.

> **Important — Smoke test the launch path, not the whole internet**
>
> Browser bindings get expensive fast. One honest launch or render smoke path is usually better than an enormous browser suite that nobody trusts.

---

### A small Browser Rendering example you can adapt quickly

> This example shows the real browser shape most people care about: launch a browser, read one page title, close the browser cleanly.

| Field | Value |
| --- | --- |
| Route | [`/docs/browser-example`](/docs/browser-example) |
| Group | Bindings |
| Navigation title | Browser Rendering example |
| Eyebrow | Starter example |

It is intentionally smaller than a full PDF pipeline, but it uses the same worker-side idea: the browser binding is real infrastructure, not a pretend local object.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Single browser binding |
| Runtime shape | Launch puppeteer with the Worker binding and close it cleanly |
| Best use | Small screenshot, title-read, or PDF-generation entrypoints |

#### Start by wiring the binding clearly in config

##### Example — Minimal browser config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Keep the first route tiny so launch, navigation, and cleanup are the only moving parts you have to trust.
- If the real feature is PDF generation, this same pattern is the foundation for that worker path.

##### Example — Read one page title with Puppeteer

```ts
import puppeteer from '@cloudflare/puppeteer'
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const browser = await puppeteer.launch(env.BROWSER as Parameters<typeof puppeteer.launch>[0])

	try {
		const page = await browser.newPage()
		await page.goto('https://example.com/', { waitUntil: 'load' })
		return Response.json({ title: await page.title() })
	} finally {
		await browser.close()
	}
}
```

#### Keep the first version boring on purpose

> **Warning — The example is small, not cheap**
>
> Browser work is still heavier than most bindings. Keep your first path focused enough that failures are easy to diagnose.

---

### Use Analytics Engine when the worker should write structured event points, not improvise log transport

> Analytics Engine is modeled cleanly in Devflare config and generated types, but the repo evidence points to a lighter local story than the first-class storage bindings.

| Field | Value |
| --- | --- |
| Route | [`/docs/analytics-engine-binding`](/docs/analytics-engine-binding) |
| Group | Bindings |
| Navigation title | Analytics Engine |
| Eyebrow | Binding reference |

That usually means two good habits: keep the write path simple in the worker, and test the event-producing behavior through a thin boundary rather than by inventing a giant analytics simulation.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.analyticsEngine |
| Authoring shape | Record<string, { dataset: string }> |
| Best for | Structured analytics or event logging inside worker code |

#### Author it in the simplest shape that still says what you mean

The Analytics Engine binding is conceptually simple: pick a dataset name and write data points to it from the worker path that owns the event.

What matters more than the config shape is resisting the urge to build a fake analytics platform around it just to write the first tests.

##### Example — Analytics Engine binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-worker',
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Analytics Engine when the worker should record structured event points as part of handling real traffic or jobs.
- Keep analytics writes narrow and explicit so they stay easy to review.
- If the data is really application state, it probably belongs in D1 or another durable store instead of analytics.

#### Notes worth keeping visible

##### Key points

- The repo does not show a dedicated analytics helper surface comparable to `cf.queue.trigger()` or `env.DB.prepare()`.
- Preview-scoped dataset names can be materialized, but Devflare does not provision or delete datasets because Analytics Engine creates them on first write.
- Tests should focus on event-producing behavior rather than pretending you need a full local analytics backend.

> **Note — This binding is about a write path**
>
> Document the write contract clearly and keep the testing story light. That is more useful than inventing an elaborate fake dataset universe.

#### Cloudflare docs vs the Devflare layer

Cloudflare Workers Analytics Engine docs is the platform reference. This page is the Devflare translation layer: keep `bindings.analyticsEngine` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare Workers Analytics Engine docs** — Platform reference for write APIs, SQL querying, analytics ingestion patterns, and product limits. ([link](https://developers.cloudflare.com/analytics/analytics-engine/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for write APIs, SQL querying, analytics ingestion patterns, and product limits. | How to author `bindings.analyticsEngine`, what the runtime surface looks like, and how Analytics Engine fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | Supported, but usually tested through integration or thin mocks. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Analytics Engine internals** — See normalization, Wrangler `analytics_engine_datasets`, and the preview or runtime details behind the authored shape. ([link](/docs/analytics-engine-internals))
- **Testing Analytics Engine** — Start from A thin worker test or explicit mock around `writeDataPoint()` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/analytics-engine-testing))
- **Analytics Engine example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/analytics-engine-example))

---

### How Devflare wires Analytics Engine from config to runtime

> Analytics Engine has a straightforward compiler story, plus a preview note that matters because datasets are auto-created on first write instead of provisioned like buckets or databases.

| Field | Value |
| --- | --- |
| Route | [`/docs/analytics-engine-internals`](/docs/analytics-engine-internals) |
| Group | Bindings |
| Navigation title | Analytics Engine internals |
| Eyebrow | Under the hood |

That is the core reason the docs should separate it from storage bindings: the worker env shape is familiar, but the resource lifecycle behaves differently.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | The authored shape is a simple dataset mapping; the interesting behavior is lifecycle, not deep normalization |
| Compile target | Wrangler `analytics_engine_datasets` |
| Preview note | Preview names can change, but Devflare does not provision or delete Analytics Engine datasets for you |

#### Devflare normalizes the authored shape before it does anything louder

Analytics Engine bindings are a small schema surface: a binding name maps to a dataset name. That keeps authored config simple and predictable.

The more important implementation detail is that datasets are not managed like KV namespaces or buckets. They come to life on write, so preview lifecycle support looks different.

##### Example — Analytics Engine from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-worker',
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"analytics_engine_datasets": [
		{ "binding": "APP_ANALYTICS", "dataset": "app-analytics" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- The repo smoke app and integration tests show `writeDataPoint()` being called through the binding, which is enough to describe the runtime contract honestly.
- I did not find a dedicated analytics helper surface in the test harness, so docs should steer people toward thin worker tests or explicit mocks instead.
- Type generation still matters here because it keeps the env contract clear even when the test story is lighter.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile emits dataset entries into Wrangler-facing output.
- Preview materialization can rewrite dataset names, but Devflare intentionally does not try to provision or delete those datasets for you.
- That lifecycle difference is the main caveat compared with storage or queue resources.

> **Warning — Name changes do not imply resource management**
>
> Preview-scoped naming is useful, but it does not mean Devflare owns the full dataset lifecycle the way it can for KV, D1, or queues.

---

### Test Analytics Engine the way Devflare expects it to run

> Analytics Engine tests should stay thin: verify that the worker writes a data point, not that you can recreate Cloudflare analytics locally.

| Field | Value |
| --- | --- |
| Route | [`/docs/analytics-engine-testing`](/docs/analytics-engine-testing) |
| Group | Bindings |
| Navigation title | Testing Analytics Engine |
| Eyebrow | Testing |

The repo evidence supports that approach. There are examples and smoke checks, but not a big dedicated analytics test harness pretending to be the platform.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Event-write smoke tests and worker behavior that should emit analytics |
| Default harness | A thin worker test or explicit mock around `writeDataPoint()` |
| Escalate when | Analytics delivery itself is a release-critical guarantee |

#### Start with the default test loop

The best default is a small test proving the worker attempted the analytics write when the expected request or job happened.

If you later need stronger end-to-end confidence, add a higher-level integration or smoke lane instead of bloating the ordinary unit path.

##### Example — A thin analytics smoke check

```ts
import { expect, test } from 'bun:test'

const writes: unknown[] = []
const analytics = {
	writeDataPoint(point: unknown) {
		writes.push(point)
	}
}

test('records an analytics point', () => {
	analytics.writeDataPoint({ indexes: ['search'], blobs: ['devflare'] })
	expect(writes).toHaveLength(1)
})
```

#### The helper surface to remember

##### Key points

- Keep analytics writes behind a small helper if that makes them easier to assert in application-level tests.
- Use worker smoke tests around the route or job that should emit the event when you want stronger evidence than a tiny mock.
- Do not confuse “we called writeDataPoint” with “the whole reporting stack is perfect” unless you added a real integration path for that.

#### When to move beyond the default harness

##### Key points

- The ordinary docs should not imply that Devflare ships a full local Analytics Engine simulator.
- If analytics delivery is business-critical, put it in a dedicated smoke or release lane instead of overfitting every local test.
- Preview dataset names may differ, so if that matters operationally, test the generated naming separately.

> **Important — Thin and explicit wins here too**
>
> Analytics bindings are easiest to trust when the worker writes a clearly reviewable point and the tests prove that narrow behavior directly.

---

### A small Analytics Engine example you can adapt quickly

> This example writes one analytics event from one route, which is usually all you need to teach the binding shape clearly.

| Field | Value |
| --- | --- |
| Route | [`/docs/analytics-engine-example`](/docs/analytics-engine-example) |
| Group | Bindings |
| Navigation title | Analytics Engine example |
| Eyebrow | Starter example |

It keeps the dataset name visible, the event payload small, and the worker boundary obvious.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Explicit dataset naming |
| Runtime shape | Call `writeDataPoint()` during a request |
| Best use | Search analytics, request logging, and event emission |

#### Start by wiring the binding clearly in config

##### Example — Minimal Analytics Engine config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Keep the event payload small and explicit so you can reason about what the worker is writing.
- If the real event shape grows richer later, this tiny route still teaches the binding contract honestly.

##### Example — Write one analytics point in the worker

```ts
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	env.APP_ANALYTICS.writeDataPoint({
		indexes: ['search'],
		blobs: ['devflare query']
	})

	return new Response('recorded')
}
```

#### Keep the first version boring on purpose

> **Note — A route can teach the whole binding**
>
> For Analytics Engine, one request that writes one point is already enough to teach the env shape and the operational habit.

---

### Use Send Email when the worker should send outbound email with explicit address rules

> Send Email is a real binding surface in Devflare, and it is worth documenting separately from inbound `src/email.ts` handlers so the two flows do not get blurred together.

| Field | Value |
| --- | --- |
| Route | [`/docs/send-email-binding`](/docs/send-email-binding) |
| Group | Bindings |
| Navigation title | Send Email |
| Eyebrow | Binding reference |

That distinction matters because outbound email is a binding you call from worker code, while inbound email handling is a worker event surface with its own test helper story.

#### At a glance

| Fact | Value |
| --- | --- |
| Config key | bindings.sendEmail |
| Authoring shape | Record<string, { destinationAddress?; allowedDestinationAddresses?; allowedSenderAddresses? }> |
| Best for | Outbound notification email and controlled email-sending paths from worker code |

#### Author it in the simplest shape that still says what you mean

Send Email bindings are easiest to trust when the allowed addresses are visible in config rather than buried in some last-minute secret or helper wrapper.

Devflare validates the main mutual-exclusion rule here too: use either one `destinationAddress` or a list of `allowedDestinationAddresses`, not both.

##### Example — Send Email binding authoring

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'email-worker',
	bindings: {
		sendEmail: {
			TRANSACTIONAL_EMAIL: {
				allowedDestinationAddresses: ['ops@example.com'],
				allowedSenderAddresses: ['noreply@example.com']
			},
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	}
})
```

#### When this binding fits best

##### Key points

- Use Send Email when the worker needs to send notifications or transactional messages outward.
- Keep address restrictions explicit so the worker cannot quietly send anywhere it pleases.
- Do not confuse outbound send-email bindings with inbound email processing handlers.

#### Notes worth keeping visible

##### Key points

- `destinationAddress` and `allowedDestinationAddresses` are mutually exclusive in one binding definition.
- The local story for outbound email is strong, but it should still be documented separately from inbound email event helpers.
- Preview resource lifecycle does not manage email addresses the way it manages storage resources, because the binding compiles the address rules as-is.

> **Warning — Outbound is not inbound**
>
> `env.TRANSACTIONAL_EMAIL.send(...)` and `src/email.ts` handler tests are connected by the domain, but they are different contracts and should be documented that way.

#### Cloudflare docs vs the Devflare layer

Cloudflare send_email binding docs is the platform reference. This page is the Devflare translation layer: keep `bindings.sendEmail` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.

##### Highlights

- **Cloudflare send_email binding docs** — Platform reference for send_email binding restrictions, verified destinations, and Email Workers setup. ([link](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/))

##### Reference table

| Question | Cloudflare docs | This Devflare page |
| --- | --- | --- |
| Primary focus | Platform reference for send_email binding restrictions, verified destinations, and Email Workers setup. | How to author `bindings.sendEmail`, what the runtime surface looks like, and how Send Email fits a Devflare project. |
| Testing and runtime lens | Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself. | First-class outbound local support; distinct from inbound email event testing. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape. |
| When to open it | When you need the platform contract, limits, APIs, or account-level product details. | When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app. |

#### Go deeper only if this one-page guide stops being enough

##### Highlights

- **Send Email internals** — See normalization, Wrangler `send_email`, and the preview or runtime details behind the authored shape. ([link](/docs/send-email-internals))
- **Testing Send Email** — Start from `createTestContext()` plus `env.TRANSACTIONAL_EMAIL.send(...)` and only escalate when the binding or deployment model genuinely needs it. ([link](/docs/send-email-testing))
- **Send Email example** — Adapt one small end-to-end path before you hide the binding behind a bigger abstraction. ([link](/docs/send-email-example))

---

### How Devflare wires Send Email from config to runtime

> Send Email compiles into Wrangler output, normalizes message input at runtime, and supports local address restrictions instead of treating email as an unbounded free-for-all.

| Field | Value |
| --- | --- |
| Route | [`/docs/send-email-internals`](/docs/send-email-internals) |
| Group | Bindings |
| Navigation title | Send Email internals |
| Eyebrow | Under the hood |

That runtime normalization is worth calling out because it lets worker code send higher-level message shapes while Devflare translates them into the lower-level form the email path needs.

#### At a glance

| Fact | Value |
| --- | --- |
| Normalization | The schema normalizes address restrictions and runtime message helpers normalize composed email input |
| Compile target | Wrangler `send_email` |
| Preview note | Address rules compile as authored; there is no separate preview resource lifecycle for email destinations |

#### Devflare normalizes the authored shape before it does anything louder

The schema work here is less about ids and more about safety rules: which addresses are permitted and which combinations are invalid.

At runtime, Devflare can normalize higher-level email message shapes into raw MIME-backed delivery when the outbound path needs it.

##### Example — Send Email from authored config to generated output

Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.

###### File — devflare.config.ts

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'email-worker',
	bindings: {
		sendEmail: {
			TRANSACTIONAL_EMAIL: {
				allowedDestinationAddresses: ['ops@example.com'],
				allowedSenderAddresses: ['noreply@example.com']
			},
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	}
})
```

###### File — .devflare/wrangler.jsonc

```json
{
	"send_email": [
		{ "name": "SUPPORT_EMAIL", "destination_address": "support@example.com" }
	]
}
```

#### Local runtime support depends on what Devflare can model directly

##### Key points

- Local send-email bindings can be created and enforced in the default runtime/test context.
- Address restrictions are part of the local contract, which keeps the binding honest during development.
- Inbound email helper APIs exist too, but they serve the inbound event story rather than replacing outbound bindings.

#### Compile, preview, and cleanup behavior

##### Key points

- Compile turns the authored send-email rules into Wrangler-facing `send_email` entries.
- The binding rules are emitted as-is; there is no preview resource provisioning story for destination addresses or sender allow-lists.
- The runtime normalization step is the subtle part worth documenting because it shapes how friendly outbound code can look.

> **Note — Safety rules are part of the binding**
>
> The point of the schema is not only to make email possible. It is also to keep where the worker may send email visible and reviewable.

---

### Test Send Email the way Devflare expects it to run

> Send Email is stronger locally than many platform-service bindings because outbound email can be exercised in the default harness, while inbound email has its own related helper surface.

| Field | Value |
| --- | --- |
| Route | [`/docs/send-email-testing`](/docs/send-email-testing) |
| Group | Bindings |
| Navigation title | Testing Send Email |
| Eyebrow | Testing |

That means the docs should teach both the outbound binding test and the conceptual split from inbound email event tests, so people do not mix the two up.

#### At a glance

| Fact | Value |
| --- | --- |
| Best for | Outbound notification checks and address-restriction behavior |
| Default harness | `createTestContext()` plus `env.TRANSACTIONAL_EMAIL.send(...)` |
| Escalate when | The system has external email delivery requirements beyond the local binding path |

#### Start with the default test loop

Start with one direct outbound send call through the binding and verify the success or allow-list behavior you actually care about.

If you are testing inbound processing, switch mental models entirely and use the email event helper path instead of forcing everything through the outbound binding.

##### Example — Testing an outbound Send Email binding

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('sends an outbound transactional email', async () => {
	await expect(env.TRANSACTIONAL_EMAIL.send({
		from: 'noreply@example.com',
		to: 'ops@example.com',
		subject: 'Smoke check',
		text: 'Hello from Devflare'
	})).resolves.toBeUndefined()
})
```

#### The helper surface to remember

##### Key points

- Use the outbound binding directly when the worker is sending mail.
- Use the inbound `email` helper surface (`cf.email.send(...)` from `devflare/test`) when the worker is handling inbound email in `src/email.ts`.
- Keep address restrictions visible in tests when those restrictions are part of the safety story.

#### When to move beyond the default harness

##### Key points

- Do not document inbound email helper tests as if they were proof of the outbound binding path, or vice versa.
- If external delivery or provider-side verification matters, add a separate integration lane rather than overfitting the local harness.
- The local harness is great for binding behavior, but email product workflows often still need a higher-level end-to-end check.

> **Important — Two email stories, one docs rule**
>
> Keep outbound binding docs and inbound handler docs adjacent in your head, but separate on the page. That is how people avoid testing the wrong thing.

---

### A small Send Email example you can adapt quickly

> This example keeps outbound email explicit: one binding, one recipient rule, one worker path that sends one message.

| Field | Value |
| --- | --- |
| Route | [`/docs/send-email-example`](/docs/send-email-example) |
| Group | Bindings |
| Navigation title | Send Email example |
| Eyebrow | Starter example |

It is enough to teach the binding honestly without dragging inbound processing or full provider workflows into the very first page.

#### At a glance

| Fact | Value |
| --- | --- |
| Config focus | Explicit destination rules |
| Runtime shape | Call `send()` from a worker route |
| Best use | Transactional or support notifications |

#### Start by wiring the binding clearly in config

##### Example — Minimal Send Email config

```ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'send-email-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		sendEmail: {
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	}
})
```

#### Then use it in one honest runtime path

##### Key points

- Keep the first outbound example narrow so the binding contract stays obvious.
- If you also handle inbound email elsewhere in the app, document that on the email-event pages rather than merging the two stories here.

##### Example — Send one email from the worker

```ts
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	await env.SUPPORT_EMAIL.send({
		from: 'noreply@example.com',
		to: 'support@example.com',
		subject: 'New support request',
		text: 'A customer asked for help.'
	})

	return new Response('sent')
}
```

#### Keep the first version boring on purpose

> **Note — One message is enough to teach the binding**
>
> You do not need a full notification system on the first page. One send call already proves the important contract.
