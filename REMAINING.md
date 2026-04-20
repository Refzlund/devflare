# REMAINING

Last updated: 2026-04-22 (post-extraction pass)

This file now tracks only the findings that are still open after the 2026-04-22 maintenance loop. Completed items and historical pass notes have been moved into `FINDINGS.md`, which is the authoritative record of landed work.

## Current open items

- `F35` — deeper Vite-plugin API / transform separation
- `F45` — explicit-state decomposition of `createDevServer()`
- `F49` — optional final lifecycle-driven decomposition of `createTestContext()`

Everything else previously tracked here (`F09`, `F11`, `F18`, `F22`, `F57`, `F58`, `F59`, `C1`-`C18`, `CR1`-`CR3`, `R1`-`R4`) is now closed in `FINDINGS.md`.

## 2026-04-22 extraction pass — status

A further round of pure-helper extractions landed without modifying behavior or test results (836/0/2 baseline maintained throughout):

- `F35`: `plugin.ts` 392 → 344 LOC. Extracted `runDevflareTransform` and `buildPluginConfigHookResult` into `plugin-transform.ts` and `plugin-config-hook.ts`.
- `F45`: `server.ts` 661 → 393 LOC. Extracted `buildMiniflareDevConfig`, `resolveWorkerConfigWatchPath`, `applyWatcherTargetDiff`, `maybeStartBrowserShim`, `maybeStartDOBundler`, `resolveViteIntegration`, plus Miniflare diagnostics helpers — split across `miniflare-dev-config.ts`, `worker-source-watcher.ts`, and `server-startup-helpers.ts`.
- `F49`: `simple-context.ts` 364 → 209 LOC. Extracted `buildRemoteAndStaticBindings`, `configureSurfaceHandlers`, `createBridgeEnvAccessor`, `createMultiWorkerEnvAccessor`, `resolveTestContextConfig`, `createDisposeContext` — split across `simple-context-bindings.ts`, `simple-context-env.ts`, and `simple-context-lifecycle.ts`.

Each step was committed individually, ran the full test suite, and pushed to `next` before the next extraction.

## Why these items remain "Blocked"

The remaining work for all three is no longer mechanical helper extraction; it is a structural change that needs test infrastructure first:

- `F35` — separating worker-entry rewriting from DO transform multiplexing changes the plugin's transform contract; needs plugin-order/transform-order regression tests.
- `F45` — folding the closure-captured mutables in `createDevServer()` into an explicit `DevServerState` requires lifecycle tests pinning reload/watcher/shutdown ordering.
- `F49` — further `createTestContext()` decomposition would thread shared initialization state through handler wiring; needs initialization-order tests.

The recommended sequence and execution plans below are unchanged; the next concrete blocker for each is now "land the missing test scaffolding", not "extract another helper".

## Recommended sequence

1. `F35` — finish the deeper Vite-plugin seam cleanup
2. `F45` — split `createDevServer()` around an explicit `DevServerState`
3. `F49` — only continue `createTestContext()` decomposition if stronger lifecycle-order tests are added first

## `F35` — Vite plugin API overlap and transform multiplexing

| ID + Status | What still needs doing? | Why is it still open? | Recommended approach | Plan of execution |
| --- | --- | --- | --- | --- |
| `F35` — Blocked (structural follow-up) | The remaining work is the conceptual split, not the helper extraction: make `getCloudflareConfig()` / `getDevflareConfigs()` thin views over one canonical representation, and stop routing worker-entry rewriting and durable-object transforms through one multiplexed transform boundary. | The low-risk helper extractions are already done (`plugin.ts` 775 → 392 LOC), but the unfinished portion changes API seams and Vite transform behavior, so it needs stronger ordering/regression coverage than the maintenance pass required. | Treat this as a focused Vite-architecture cleanup. Keep the extracted helpers, add plugin-order/transform-order regression tests, then split API and transform responsibilities in separate commits. | 1. Add integration tests that pin plugin ordering, transform ordering, and emitted output for a representative stack.<br>2. Collapse the two programmatic config getters onto one canonical underlying representation.<br>3. Separate worker-entry rewriting from durable-object transform handling.<br>4. Remove obsolete overlap and update docs/comments once the new boundaries are stable. |

## `F45` — `createDevServer()` decomposition

| ID + Status | What still needs doing? | Why is it still open? | Recommended approach | Plan of execution |
| --- | --- | --- | --- | --- |
| `F45` — Blocked (structural follow-up) | The remaining work is to lift the closure-heavy mutable state in `createDevServer()` into an explicit state/context object and then split Miniflare assembly, watcher orchestration, and lifecycle management around that state. | The safe helper moves are already landed (`server.ts` 805 → 661 LOC), but the rest of the function still closes over Miniflare handles, watch targets, route discovery, bundle paths, and shutdown/reload coordination. Another extraction pass without a real state boundary would just shuffle complexity around. | Start with an explicit `DevServerState` inventory, then extract one responsibility at a time behind contract/integration tests that pin reload, watcher, and shutdown behavior. | 1. Freeze lifecycle behavior with integration tests for reload scheduling, watcher behavior, DO startup, and shutdown ordering.<br>2. Introduce an explicit `DevServerState` / context object for the current closure-scoped mutables.<br>3. Extract Miniflare config assembly first, then watcher coordination, then lifecycle helpers.<br>4. Re-run the dev-server suite after each extraction instead of batching structural moves. |

## `F49` — `createTestContext()` decomposition

| ID + Status | What still needs doing? | Why is it still open? | Recommended approach | Plan of execution |
| --- | --- | --- | --- | --- |
| `F49` — Blocked (structural follow-up, lowest urgency) | Only the lifecycle-sensitive remainder is left: further splitting `createTestContext()` would mean threading shared startup/shutdown state through handler wiring and Miniflare/bootstrap flows. | The isolated helper extractions are already done (`simple-context.ts` 628 → 364 LOC). The remaining work is no longer a simple “split the big function” cleanup and would need stronger order/side-effect tests first to avoid subtle integration regressions. | Keep this last. Only continue if the project still wants smaller helpers after adding explicit initialization-order and side-effect coverage. | 1. Add tests that pin initialization order, side effects, and per-surface handler wiring expectations.<br>2. Inventory the remaining responsibilities inside `createTestContext()` and identify the next truly isolated boundary.<br>3. Extract one lifecycle helper at a time, re-running the full test-context/integration suite after each step.<br>4. Stop if the new helper boundaries start making the lifecycle harder to follow rather than clearer. |
