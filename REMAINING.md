# REMAINING

Last updated: 2026-04-22 (post B1–P2 close-out pass)

All items previously tracked in this file are closed. Their landed status is recorded in [FINDINGS.md → 2026-04-22 — REMAINING.md close-out pass (B1–P2)](FINDINGS.md#2026-04-22--remainingmd-close-out-pass-b1p2).

The follow-ups below are intentionally **🟥 Blocked** because they are wire-protocol bumps or public-API removals that require an explicit release / deprecation decision. They are listed here so that the next pass has them ready to pick up once that decision is made; the corresponding code change in each row has already landed in a back-compat-safe form.

## Status legend

- 🟨 **Incomplete** — recognized work item, no known blocker.
- 🟥 **Blocked — (reasoning)** — work cannot proceed safely until something else is resolved.
- 🟩 **Done — (status)** — closed; details in [FINDINGS.md](FINDINGS.md).

## Closed in this pass

All 20 originally-tracked items are 🟩 Done. See [FINDINGS.md → 2026-04-22 — REMAINING.md close-out pass (B1–P2)](FINDINGS.md#2026-04-22--remainingmd-close-out-pass-b1p2) for the per-item commit SHAs and pinning tests.

| Area | IDs |
| --- | --- |
| Bridge and transport | B1, B2, B3, B4, B5, B6 |
| Browser shim | BR1 |
| Config system | C1, C2, C3, C4, C5 |
| Vite, bundler, worker-entry | V1, V2, V3, V4 |
| Runtime | R1, R2, R3, R4 |
| Dev-server and testing | D1, D2 |
| Package surface and docs | P1, P2 |

## Blocked follow-ups (🟥)

Each row already shipped a back-compat-safe interim form during the close-out pass. The Wave-4 step listed here is the final removal / wire-bump that needs an explicit release decision.

| ID | Status | Source | Description | Why blocked | Suggested execution plan |
| --- | --- | --- | --- | --- | --- |
| **B3-final** | 🟥 Blocked — wire-protocol bump | [INCONSISTENCIES.md → Bridge and transport](INCONSISTENCIES.md#bridge-and-transport-inconsistencies) | Remove the bare-verb legacy fallback in [src/bridge/server.ts](packages/devflare/src/bridge/server.ts) and [src/bridge/gateway-runtime.ts](packages/devflare/src/bridge/gateway-runtime.ts). Today they accept bare verbs (`get`/`put`/…) and translate them with a one-time `console.warn`; the public namespaced ops are the only documented form. | Removal is a wire-protocol incompatibility with any unreleased downstream call site that still emits bare verbs. Needs one release of the deprecation warning to ship before removal is safe. | After the next release ships with the warning, delete `translateLegacyOperation()` and the warned-set state. Update `tests/unit/bridge/server-rpc.test.ts` to assert bare verbs throw. |
| **B5-frame** | 🟥 Blocked — wire-protocol bump | [INCONSISTENCIES.md → Bridge and transport](INCONSISTENCIES.md#bridge-and-transport-inconsistencies) | Add a structured `error` frame kind to [src/bridge/v2/wire.ts](packages/devflare/src/bridge/v2/wire.ts) and have both ends send/receive it so binding errors (e.g. failing `await env.MY_KV.get(...)`) surface back to the caller with a typed cause instead of being logged-only. | Wire-protocol bump; wants to land in the same release window as B3-final to avoid two consecutive bumps. | Co-schedule with B3-final. Define the frame, update `client.ts` + `server.ts` + `gateway-runtime.ts`, add tests covering KV/R2/D1 error round-trips. |
| **C2-public** | 🟥 Blocked — public API removal | [INCONSISTENCIES.md → Config-system](INCONSISTENCIES.md#config-system-inconsistencies) | Remove `resolveConfigForLocalRuntime` and `resolveConfigResources` from [src/index.ts](packages/devflare/src/index.ts) / [src/config/index.ts](packages/devflare/src/config/index.ts) so `resolveResources({ phase })` is the only public entry. They are already `@internal`-tagged but still exported. | Public API surface change; needs at least one release with the `@internal` tag visible plus a migration note in release notes. | After a release ships with the `@internal` tag, delete the exports. Add a CHANGELOG entry referencing this row. |
| **D2-removal** | 🟥 Blocked — public API removal | [INCONSISTENCIES.md → Dev-server and testing](INCONSISTENCIES.md#dev-server-and-testing-inconsistencies) | Delete `createBridgeTestContext` from [src/test/index.ts](packages/devflare/src/test/index.ts) (it is already `@deprecated` and not in the docs). | Public API removal; needs the deprecation warning to live through one release with no usage reports surfaced. | Confirm zero downstream usage in `apps/`, `cases/`, public examples; remove the export and update `test/*` internals to call `createTestContext()` directly. |
| **R1-strict** | 🟥 Blocked — runtime contract change | [INCONSISTENCIES.md → Runtime](INCONSISTENCIES.md#runtime-inconsistencies) | Make `style` required on 2-arg fetch handlers and delete `getFunctionParameterNames` entirely. Today the param-name path warns (and errors under `DEVFLARE_STRICT_MIDDLEWARE=1`); strict mode should become the default. | User runtime behavior change; needs the warn-mode release to ship and surface any unforeseen handler shapes before the warn becomes the default. | After one release with the warn, flip the default to strict and delete `getFunctionParameterNames` + `isParamsStyleFunction`. Update `tests/unit/runtime/middleware.test.ts`. |
| **P1-codegen** | 🟥 Blocked — design doc | [INCONSISTENCIES.md → Package surface and documentation](INCONSISTENCIES.md#package-surface-and-documentation-inconsistencies) | Generate `DevflareEnv` per resolved config (build-time codegen, similar to `wrangler types`) so the global type is computed from real bindings instead of being a hand-written empty interface that consumers augment. | Build-time contract change; needs a short design note covering how/when codegen runs in dev vs CI and how it interacts with user-augmented `DevflareEnv`. | Write the design note, prototype in [src/cli/commands/type-generation/generator.ts](packages/devflare/src/cli/commands/type-generation/generator.ts) (already emits user-side declarations), and decide on the canonical output path. |
| **V4-defaults** | 🟥 Blocked — bundler convergence | [INCONSISTENCIES.md → Vite, bundler, and worker-entry](INCONSISTENCIES.md#vite-bundler-and-worker-entry-inconsistencies) | Introduce a shared `createWorkerdBundlerDefaults()` helper between [src/bundler/worker-bundler.ts](packages/devflare/src/bundler/worker-bundler.ts) and [src/bundler/do-bundler.ts](packages/devflare/src/bundler/do-bundler.ts). The remaining differences (`platform: 'browser'` vs `'neutral'`, `defaultTsconfigMode`) were left intentional and inline-documented in the V1 sweep; the convergence is desirable but not required. | Not strictly blocked — kept here only because the convergence is one of the recommended Option-B follow-ups in the original V4 row. Could be picked up at any time as a low-priority refactor. | Audit the two bundlers' option blocks side-by-side; introduce `createWorkerdBundlerDefaults()` in `bundler/defaults.ts`; both bundlers spread it and override only true differences. Pin with a unit test asserting parity for the shared keys. |

## Test baseline at close-out

`1012 pass / 5 fail / 8 skip` (pre-existing flakes only; +27 net passing tests vs. pre-pass baseline).
