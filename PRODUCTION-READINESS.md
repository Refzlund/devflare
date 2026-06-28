# Production Readiness — devflare → 1.0.0

Living log of the work to take `devflare` from `1.0.0-next.X` to a stable `1.0.0`.
Driven autonomously across phases **A–F** (derived from the 2026-06-28 readiness audit).
Each phase ends with a changeset + commit pushed to `next`, which publishes a new
prerelease to npm via `publish.yml` (OIDC). We stay on `next` for all phases; the
final `changeset pre exit` → `1.0.0` is the maintainer's deliberate last step.

## Status legend

- ✅ **done** — implemented + verified (build/typecheck/tests green)
- 📝 **documented** — an inherent platform limitation or deliberate deferral, now
  authoritatively documented (the correct production action, not code)
- 🚧 **in progress**
- ⬜ **todo**
- ⏭️ **deferred** — out of scope for 1.0 by explicit decision (logged with reason)

## How this run is orchestrated

Per phase: a research → implement → adversarial-review agent workflow makes the
changes in the working tree; the orchestrator then runs build/typecheck/tests,
writes a changeset, commits, and pushes. The publish workflow versions + publishes;
the orchestrator pulls the bot's version-bump commit before the next phase.

---

## Master checklist

### Phase A — API contract & release policy
- A1 ✅ Remove the `@deprecated ContextUnavailableError` alias (`src/runtime/context.ts`) + all re-exports/usages — folded the rich message into `ContextAccessError.contextUnavailable()`; retargeted the 3 throw-sites, removed the `runtime/index.ts` re-export, updated tests + `part-3.ts` doc mentions, regenerated `LLM.md`
- A2 ✅ Author a public **API stability policy** (the frozen entrypoint surface: `.`, `/config`, `/runtime`, `/test`, `/vite`, `/sveltekit`, `/cloudflare`, `/decorators`) — `docs/API_STABILITY.md` (with `./internal/send-email` called out as non-frozen); README points at it
- A3 ✅ Author a **versioning & release policy** (semver, prerelease lane, changesets pre-mode, `next → 1.0` exit) + ensure CHANGELOG present — `docs/VERSIONING_AND_RELEASE.md` + root `CONTRIBUTING.md`; CHANGELOG already present

### Phase B — Unfinished code paths
- B1 ✅ HTTP body transfer — oversized **responses** (>512 KB) now ride the binary stream channel, chunked into ≤512 KB frames (under workerd's ~1 MB WS limit), round-tripping byte-identically incl. >2 MB; oversized **requests** throw a clear, documented error (the local gateway has no streamed-request-body consumer). `serializeValue` threads the threshold.
- B2 ✅ DO `namespace.jurisdiction()` now threads the jurisdiction through `DOProxyOptions` → the wire (`proxy.ts` + `gateway-runtime.ts`/`server.ts`)
- B3 ✅ Bridge event subscriber registry implemented (`client.ts` `on(topic, cb)` + `handleEvent`); honestly documented that no gateway emits `event` frames yet (consumer side ready, producer is a future wiring)
- B4 📝 Worker Loader dynamic DO class — kept a precise throw + made it **injectable** (a test/consumer can supply a class); materialising a real dynamic DO class in the local shim isn't feasible
- B5 📝 `startTls()` on the DO WebSocket proxy — sharpened, documented throw; genuinely impossible (it's a DO WebSocket façade, not a raw TCP stream; wss is already encrypted)
- B6 ✅ R2 multipart upload fully implemented in the mock (createMultipartUpload → uploadPart → complete composes parts into the same store `get()` reads; out-of-order compose, abort discards, post-abort/complete throw); round-trip tested
- B7 📝 Hyperdrive raw `connect()` — de-duplicated both copies into a shared `src/shims/local-hyperdrive.ts` with one documented message; `cloudflare:sockets` semantics can't be faithfully emulated over `node:net`, connection fields stay populated (use `connectionString` with a driver)

### Phase C — Cloudflare / Wrangler coverage
- C1 📝 Python Workers — documented the `wrangler.passthrough` + Python module-rule recipe in `docs/CLOUDFLARE_SUPPORT_MATRIX.md` (not first-classed: Python Workers are still beta upstream)
- C2 ✅ Modeled 3 v4-valid top-level options first-class: `logpush`, `uploadSourceMaps`, `keepVars` (booleans, camelCase author → snake_case compile, per-env overridable, `!== undefined` guard so explicit `false` emits). Deferred `minify` (collides with the existing `rolldown.minify` bundler knob) and `define` (collides with Vite `define` + Wrangler's per-env non-inheritance) to `wrangler.passthrough` — reasons recorded. Removed-in-v4 keys (the Workers-Unbound usage-model key, legacy compat shims, Workers Sites) intentionally NOT modeled; the `wrangler-v4-compat` audit enforces this.
- C3 📝 Remote-only bindings (`ai`, `vectorize`, `ai_gateway`, `builds`) documented in the support matrix as inherent Cloudflare platform boundaries (no local sim)
- C4 📝 Partial-local bindings (Browser advanced, Images hosted, Media, Pipelines, mTLS, Dispatch, Artifacts, AI Search, Hyperdrive socket, Workflows) documented with exact "what needs Cloudflare" notes

### Phase D — Deploy / preview / secrets maturity
- D1 📝 Document auto-provisioning coverage (KV/D1/R2/Queues create; Hyperdrive/Vectorize resolve-only; Analytics Engine/Browser reference-only) — `docs/DEPLOY_AND_SECRETS.md`
- D2 📝 Document partial-deploy orphan behavior (no auto-delete by design; the loud orphan footer + idempotent re-run recovery) — `docs/DEPLOY_AND_SECRETS.md`
- D3 📝 Secrets local-only — documented the boundary (`secrets --local` enforced; references-only binding wiring; remote values managed out-of-band) — `docs/DEPLOY_AND_SECRETS.md`
- D4 📝 Per-environment secret scoping — documented (deep-merge inheritance is correct-by-design; the implicit shared-root-store sharp edge is a doc note, not a footgun: env-aware shorthand validation already catches the only true error). No code change.
- D5 ✅/📝 Permission-groups generated UUIDs — sharpened the display-name fallback warning to point at the refresh script instead of a misleading "add the id" instruction (`src/cloudflare/tokens.ts`); documented the empty-table story, the mint-time scope+name-prefix path, and the maintainer refresh step — `docs/DEPLOY_AND_SECRETS.md`

### Phase E — Test & CI quality gates
- E1 ✅ Lint/format enforced on the published package: applied biome safe auto-fixes (formatter + organizeImports + safe lint) across `packages/devflare/src` + `tests`, hand-fixed 21 genuine correctness issues (`noUselessElse`/`noUnnecessaryContinue`/`noSwitchDeclarations`/`noUselessSwitchCase`/`noGlobalIsNan`/`noUselessTernary`), and downgraded the high-volume/intentional/false-positive rules to `warn` in `biome.json` (`noExplicitAny` — intentional in the RPC proxy; `noControlCharactersInRegex` — intentional ANSI matching; `noThenProperty` — intentional thenable; `noDelete`/`useTemplate`/`useNodejsImportProtocol`/`noUnusedTemplateLiteral`/`noBannedTypes`/`noAssignInExpressions`/`noShadowRestrictedNames`/`noImplicitAnyLet`/`useConst` — unsafe-stylistic or biome false-positives). `biome check packages/devflare` now exits 0 (0 errors, warnings only). New `lint:devflare` script runs first in the `devflare:ci` chain → enforced by `workspace-ci.yml`. **Follow-up:** whole-repo lint of `cases/**` and `apps/**` (unshipped code) is still only available via `lint:root` (`biome check .`) and is NOT gated — deferred for 1.0.
- E2 ✅ Re-included `@devflare/case5-multi-worker` in `devflare:test` after fixing the underlying product bug: `findDefaultServiceWorkerEntrypoint` (`src/test/resolve-service-bindings.ts`) only looked for the default service-binding RPC surface at `src/worker.{ts,js}`, so case5's root-level `math-service/worker.ts` was never bundled and `MATH_SERVICE` had no default export. Now also looks for the root `worker.{ts,js}` convention. NOTE: deliberately does NOT honor `files.fetch` — the fetch handler is a separate surface that must not be bundled as the RPC default (locked in by the existing `resolveServiceBindings` unit tests).
- E3 ✅ CI now runs on `next` (added to `workspace-ci.yml` push branches) alongside the existing PR + push-to-main triggers.
- E4 ✅ Added `test:coverage` (`bun test tests/unit --coverage`) for measurement (no threshold gate by design); documented in `CONTRIBUTING.md`.
- E5 📝 Documented in `CONTRIBUTING.md` why the integration suites run `--parallel=1 --max-concurrency=1` (they bind real OS ports + start Miniflare/workerd; the bridge lane runs one process per file). No code change — the serial constraint is load-bearing.
- E6 ✅/📝 Fixed the loader custom-config-path skip (`loadConfig` now resolves an absolute `configFile`; test un-skipped); the win-only `preferences` rename-cleanup skip is intentional and platform-correct (exercised on Linux CI) — documented, no change.

### Phase F — Architecture & docs debt (from INCONSISTENCIES.md)
- F1 ✅ Confirmed the single canonical phased `resolveResources({ phase })` seam (`config/resolve-phased.ts`) — every resource-resolution consumer (Vite serve/build, programmatic Vite, deploy provisioning, CLI config) routes through it, pinned by `tests/unit/config/resolver-contract.test.ts`. The remaining direct callers of the lower-level env-merge helpers are env-overlay-only (read merged `.vite`/entry files/preview metadata, never resolve resource IDs) — by design; the helpers are `@internal`-annotated delegates. Added a header note to `resolve-phased.ts` stating this explicitly.
- F2 ✅ DO ref `scriptName` is no longer overloaded for branching: an explicit `kind: 'local' | 'cross-worker'` discriminant exists on `DOBindingRef` (`config/ref.ts:97`) and `NormalizedDOBinding` (`config/schema-normalization.ts`), computed in `normalizeDOBinding`, and the compiler branches on `kind` (`config/compiler/bindings.ts:176`); `scriptName` stays the identifier-by-value, with JSDoc directing callers to `kind`.
- F3 ✅ No `router/` folder exists — all runtime code + types already live under `src/runtime/` (the split was collapsed in earlier convergence work; verified `find src -maxdepth 1 -type d -name router` is empty).
- F4 ✅ `files.tail` documented as a fully-wired public config key (auto-discovers `src/tail.ts`, accepts a custom path, or `false` to disable): 4 stale docs-site statements rewritten (`apps/documentation/.../configuration/part-2.ts`, `.../devflare/part-4.ts`), the watched dev-reload-root lists now include tail, `LLM.md` regenerated. Local-vs-remote support matrix authored in Phase C (`docs/CLOUDFLARE_SUPPORT_MATRIX.md`).
- F5 ✅ Root `README.md` gained a "Policy & reference docs" section linking all four policy docs; the `CONTRIBUTING.md` policy-docs list was extended — every policy doc (API stability, versioning/release, support matrix, deploy & secrets) is reachable from the primary entry points. Docs-site stays the authored source of truth; README + generated LLM.md align to it.
- F6 ✅ `INCONSISTENCIES.md` closed out: every original 2026-04-21 item recorded as **Resolved (with evidence)** or **Deferred to post-1.0 (with reason)**; the confirmed product expectations are preserved as the measurement target. (Local scratch — gitignored, not shipped.)

---

## Per-phase findings log

### Phase A — API contract & release policy ✅ (published as the next prerelease)

**Done**
- A1 — Removed the `@deprecated ContextUnavailableError` alias. Load-bearing subtlety the workflow caught: `ContextAccessError(contextName, propertyName)` auto-builds its message and cannot accept a free-form string, while the old alias produced a rich `nodejs_compat`-mentioning message and a custom one at `context.ts:162`. Resolution: added a `ContextAccessError.contextUnavailable(message?)` static factory that produces that rich message; retargeted the 3 throw-sites (`src/runtime/context.ts:118,158,162`); removed the re-export (`src/runtime/index.ts`); updated `tests/unit/runtime/context.test.ts` + the doc mentions in `apps/documentation/.../start-here/part-3.ts`; regenerated `LLM.md`. Thrown instances remain `instanceof ContextAccessError`, so only code importing the deprecated *name* breaks — documented in the changeset.
- A2 — `docs/API_STABILITY.md`: the single authoritative list of frozen public entrypoints (`.`, `/config`, `/runtime`, `/test`, `/vite`, `/sveltekit`, `/cloudflare`, `/decorators`), with `./internal/send-email` explicitly called out as **not** covered. README points at it.
- A3 — `docs/VERSIONING_AND_RELEASE.md` + root `CONTRIBUTING.md`: semver, the `next` prerelease lane (changesets pre-mode → npm dist-tag `next` via `publish.yml`, no release PR), how a changeset drives each release, and the exact `changeset pre exit` → `changeset version` → `1.0.0` promotion. `packages/devflare/CHANGELOG.md` already present.

**Verification:** typecheck ✅ · runtime unit 90/90 ✅ · docs-integrity 61/61 ✅ · full unit 1023 pass / 0 fail.

**New missing items discovered:** none (the removal was self-contained; the factory keeps backward-compat for `catch (e instanceof ContextAccessError)`).

### Phase B — Unfinished code paths ✅

**Implemented:** B1 (large-response streaming + ≤512 KB re-chunking; oversized-request clear-throw), B2 (DO jurisdiction threading), B3 (event subscriber registry), B6 (R2 multipart mock). **Documented-as-limitation (clear, sharpened throws — the honest production action):** B4 (Worker Loader dynamic DO class — injectable), B5 (`startTls` — genuinely impossible), B7 (Hyperdrive raw socket — `cloudflare:sockets` can't be faithfully emulated over `node:net`, de-duplicated into `src/shims/local-hyperdrive.ts`).

**Load-bearing findings**
- The bridge has TWO transport stacks: a live INLINE-only one (`v2/codec.ts` + hand-written switches in `client.ts`/`gateway-runtime.ts`) and a built-but-UNWIRED streaming one (`v2/body-streams.ts` etc.). There are THREE gateway implementations that must stay in sync (`server.ts`, the stringified `gateway-runtime.ts`, and the dev/miniflare concatenators) — a wire change generally touches all of them.
- The `HTTP_TRANSFER_THRESHOLD` (512 KB) was only consulted by R2 `put` (a real `/_devflare/transfer/{binding}:{key}` side-channel exists for R2); Request/Response serialization defaulted to a **10 MB** inline cap and threw above it. B1 lowered Request/Response to the 512 KB threshold and routes oversized responses through the binary stream channel. The `http.transfer` control-message types exist in `wire.ts` but have **zero producers/consumers** — a generic out-of-band body side-channel remains unbuilt (not needed for 1.0; the chunked-stream path covers it).
- B3: no gateway currently PRODUCES `event` frames, so the subscriber registry won't fire until an event producer is wired server-side — recorded as a future item, not a 1.0 blocker.

**Orchestrator follow-ups applied beyond the workflow:** re-chunked the oversized-response stream into ≤512 KB frames (reviewer 🟡 → fixed; a single >1 MB frame would otherwise exceed workerd's WS limit) + added a >2 MB multi-frame regression test; corrected `PRODUCTION-READINESS.md` C2 (the `wrangler-v4-compat` audit correctly flagged that the Workers-Unbound usage-model key is **removed in v4** and must not be modeled — an error in the original audit; the token itself can't appear in tracked files or the audit fails).

**Verification:** typecheck ✅ · full unit 1046 pass / 0 fail (+23 new) · bridge integration (proxy 7, r2-transfer 10, DO 7) ✅ · `wrangler-v4-compat` ✅ · both adversarial reviews VERDICT: PASS.

**Carried forward to later phases:** the bridge "two stacks / three gateways" duplication and the unwired streaming stack are architecture debt (Phase F candidates); a generic large-request body channel + a server-side `event` producer are post-1.0 enhancements.

### Phase C — Cloudflare / Wrangler coverage ✅

**Done.** Modeled the 3 highest-value v4-valid deploy-policy options first-class (C2); authored `docs/CLOUDFLARE_SUPPORT_MATRIX.md` covering remote-only (C3) + partial-local (C4) bindings and the Python-Workers-via-passthrough recipe (C1).

**Key decisions**
- Kept the modeled set deliberately SMALL (3 options) because the public API is freezing — only options that map 1:1 to a Wrangler boolean and don't collide with an existing devflare subsystem qualified. `minify`/`define` were rejected with reasons (devflare already owns bundling via `rolldown` and build-time substitution via Vite `define`; first-classing them would create two overlapping knobs / break the env-merge model).
- Confirmed against the pinned `wrangler@4.85.0` schema that the modeled keys are real v4 top-level options.

**New missing items discovered**
- A pre-existing flaky timeout: `tests/unit/docs/social-cards.test.ts` "can force social card regeneration" did a 2× Svelte compile under a 5 s default timeout and tripped under load. Fixed here (30 s timeout) — a stability item that properly belongs to Phase E; logged so E doesn't re-flag it.
- Reinforced the Phase-B token constraint: the `wrangler-v4-compat` audit reads tracked-file CONTENT from the working tree, so even uncommitted edits to a tracked doc that contain a removed-v4 token fail it. All Phase-C docs use descriptive language for removed features.

**Verification:** typecheck ✅ · config→wrangler compile of all 3 flags (incl. explicit `false`) ✅ · config+docs+compat 344/0 ✅ · full unit 1050 pass / 0 fail · both adversarial reviews VERDICT: PASS.

### Phase D — Deploy / preview / secrets maturity ✅

**Done.** Authored `docs/DEPLOY_AND_SECRETS.md` as the production reference for deploy/preview/secrets (D1–D5): the auto-provisioning matrix (KV/D1/R2/Queues create; Hyperdrive/Vectorize resolve-only with the Vectorize preview-clone asymmetry; Analytics Engine/Browser reference-only), the deliberate Hyperdrive→Vectorize→KV→D1→R2→Queues resolution order, the no-auto-delete orphan behavior + loud footer + idempotent re-run recovery, the `--dry-run`/describe-only behavior (incl. the Vectorize/Hyperdrive omission from "Would create"), the preview/branch lifecycle (naming, per-type provisioning, `previews cleanup`), the secrets boundary, per-env secret scoping, and the permission-groups story.

**Code change (the one safe clarification research flagged)**
- `src/cloudflare/tokens.ts` — the display-name-fallback `console.warn` told users to "file an issue to add the permission-group id to `KNOWN_PERMISSION_GROUP_IDS`," but that map is **generated**; the actual fix is running the refresh script. Replaced the text with a pointer to `bun run --cwd packages/devflare refresh-permission-groups` (regenerates `known-permission-group-ids.generated.ts`), or opening an issue. Pure string change — no behavior change; the warning still interpolates the symbolic name (the only assertion in `tokens.test.ts`).

**Decisions (docs-only, per research)**
- D4 needs no guard: env overrides are a deep merge, so an env that sets `secretsStoreId` overrides root and one that omits it inherits — the Wrangler-consistent expectation, not a shared-store bug. The only sharp edge (two shorthand envs both inheriting the root store) is documented, not coded around; env-aware shorthand validation already flags the one true error (shorthand with no store id anywhere).
- D5 nuance corrected vs the initial premise: `matchesKnownPermissionGroup`/`KNOWN_PERMISSION_GROUP_IDS` are consumed only by the refresh script + tests; the live `tokens --new` mint path selects by scope + name-prefix allowlist (`DEVFLARE_PERMISSION_GROUP_NAME_PATTERNS`), so the empty generated table does not affect minting. The doc says so explicitly.

**Verification:** typecheck ✅ · `wrangler-v4-compat` ✅ (no removed-v4 tokens in the new doc or the edited source) · docs suite ✅ · cli + cloudflare unit suites ✅ (tokens fallback-warning test still green).

### Phase E — Test & CI quality gates ✅

**Done.** Lint enforced on the published package + a pre-publish test gate + CI on `next` + case5 re-included (via a real bugfix) + coverage + skipped tests resolved.

**Highlights / findings**
- **E2 was a genuine product bug, not just a flaky exclusion.** `@devflare/case5-multi-worker` was excluded because `findDefaultServiceWorkerEntrypoint` (`src/test/resolve-service-bindings.ts`) only discovered the default service-binding RPC surface at `src/worker.{ts,js}`, so case5's root-level `math-service/worker.ts` was never bundled (`MATH_SERVICE` had no default export). Fixed by also honoring the root `worker.{ts,js}` convention (deliberately NOT `files.fetch` — a separate surface). case5 now runs in CI (13/13).
- **E1 lint is a deliberate ratchet, not a full clean.** `biome check packages/devflare` exits 0 (0 errors) but **~556 warnings remain** (234 `noExplicitAny` at RPC/proxy boundaries, 96 `noUnusedTemplateLiteral`, 88 pre-existing complexity, 68 `noDelete`, etc.). The gate enforces formatting + import-order + every non-downgraded `recommended` rule (incl. correctness/security/a11y); high-volume/intentional/behavior-risky rules (`noDelete`, `noExplicitAny`) are `warn` rather than auto-rewritten (the `--unsafe` `noDelete` fix would change `'x' in obj` semantics). Promoting warnings back to error as they're cleaned is the follow-up. Whole-repo lint of unshipped `cases/**`/`apps/**` stays available via `lint:root` but is NOT gated for 1.0.
- **Publish is now test-gated.** `publish.yml` runs `devflare:typecheck` + unit tests BEFORE versioning, so a broken commit on `next` can never be released (OIDC mechanics untouched).

**Verification:** `biome check packages/devflare` 0 errors ✅ · typecheck ✅ · full unit 1051 pass / 1 skip / 0 fail ✅ · bridge + dev-server integration spot-checks ✅ · case5 13/0 ✅ · both workflow YAMLs parse ✅ · 3 adversarial reviews VERDICT: PASS.

**Scope note:** the formatting reformat touched ~377 files but is behavior-preserving (full unit + integration green). No forbidden-v4 tokens introduced.

### Phase F — Architecture & docs debt ✅

**Done.** Worked the 2026-04-21 inconsistency list to a documented close-out (F1–F6). The architecture/code discriminants (F1 phased-resolver seam, F2 DO-ref `kind`, F3 `runtime/` folder) were already in place from earlier convergence work — Phase F **confirmed them with evidence and documented the seam**, rather than re-refactoring right before the freeze. The docs work (F4 `files.tail`, F5 README/CONTRIBUTING discoverability) was the substantive change, plus closing out `INCONSISTENCIES.md` (F6) with per-item Resolved/Deferred verdicts.

**Code/docs changes**
- `src/config/resolve-phased.ts` — header note stating it is the canonical resource-resolution seam and that the remaining env-overlay-only callers are by design (F1).
- `apps/documentation/.../configuration/part-2.ts`, `.../devflare/part-4.ts`, `LLM.md` — `files.tail` now described as a public key alongside the other handler surfaces; watched dev-reload-root lists include tail (F4).
- `README.md` (+"Policy & reference docs" section), `CONTRIBUTING.md` (extended policy-docs list) — all four `docs/` policy docs reachable from the entry points (F5).
- `src/test/binding-hints.ts` — removed the last stale JSDoc reference to the deleted `createBridgeTestContext`.

**New missing item discovered (and fixed here): a release-pipeline CI landmine.**
- `changeset version` rewrites `packages/devflare/package.json` on **every** release, and its JSON writer always expands arrays to multi-line (verified on commit `6b7356d`: it re-expanded `"files": ["dist","bin","LLM.md"]` to multi-line). biome's formatter (lineWidth 100) collapses that short array back inline — a **permanent structural conflict**. The bump commit carries `[skip ci]` so it doesn't fail itself, but it leaves package.json in a biome-non-compliant state, so the **next** non-skip commit's `biome check packages/devflare` lint gate (run by `workspace-ci.yml`) would fail with zero source changes. Fixed by adding a biome `overrides` entry that disables the **formatter** for `**/package.json` (the linter still applies) — `biome.json`. This package.json is machine-managed; formatting it is biome's job to skip, not changesets' to fight.

**Deferred to post-1.0 (logged in INCONSISTENCIES.md with reasons):** collapsing the double Zod/normalization binding-validation layer; unifying the worker-vs-DO bundler `platform` defaults (`'browser'` vs `'neutral'` — needs a per-bundle regression test first); further resolver-internals/folder convergence beyond the facade. All three are correct-as-is and carry real regression surface right before the freeze.

**Verification:** biome `check packages/devflare` 0 errors ✅ (now stable across release bumps) · typecheck ✅ · full unit 1051 pass / 1 skip / 0 fail ✅ (incl. docs-integrity + `wrangler-v4-compat`) · no forbidden-v4 tokens · all 3 adversarial reviews VERDICT: PASS.

---

## Phase summary — `next` → ready for `1.0` exit

All six phases (A–F) are complete and published as prereleases on the `next` dist-tag
(`1.0.0-next.29` … `next.34`). The remaining gap to a stable `1.0.0` is the deliberate
maintainer step: `changeset pre exit` → `changeset version` → push, which drops the
`-next.N` suffix and publishes `1.0.0` to the `latest` tag. Everything documented as
📝 is an inherent Cloudflare/platform boundary or an explicit post-1.0 deferral, not a
code gap. The `docs/` policy set (API stability, versioning/release, support matrix,
deploy & secrets) defines the public contract being frozen.
