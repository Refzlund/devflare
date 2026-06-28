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
- C1 ⬜ Python Workers: model or document the passthrough deferral (`schema-runtime.ts:255`)
- C2 ⬜ Model high-value **v4-valid** unmodeled top-level wrangler options (`logpush`, `keep_bindings`, `upload_source_maps`, `minify`, `define`, `keep_vars`). Note: the Workers-Unbound usage-model key and Workers Sites (`site`) were removed/deprecated in Wrangler v4 — intentionally NOT modeled (the `wrangler-v4-compat` audit enforces this)
- C3 ⬜ Document remote-only bindings (`ai`, `vectorize`, `ai_gateway`, `builds`) — no local sim (inherent)
- C4 ⬜ Document partial-local bindings (Browser advanced, Images hosted, Media, Pipelines, mTLS, Dispatch, Artifacts, AI Search)

### Phase D — Deploy / preview / secrets maturity
- D1 ⬜ Document auto-provisioning coverage (KV/D1/R2/Queues create; Hyperdrive/Vectorize resolve-only; rest reference-only)
- D2 ⬜ Document partial-deploy orphan behavior (no auto-delete by design)
- D3 ⬜ Secrets local-only — document the remote-secret workflow / boundary
- D4 ⬜ Per-environment secret scoping — document / fix
- D5 ⬜ Permission-groups generated UUIDs — maintainer refresh note + graceful fallback confirmation

### Phase E — Test & CI quality gates
- E1 ⬜ 🔴 Enforce lint/format in CI + reduce biome violations (2236 repo / 646 in src)
- E2 ⬜ 🔴 Un-exclude `@devflare/case5-multi-worker` from the CI test lane (or document the blocker)
- E3 ⬜ Run CI on the `next` branch (currently PRs + push-to-main only)
- E4 ⬜ Add coverage measurement
- E5 ⬜ Serial-only integration suites — document / isolate
- E6 ⬜ Skipped tests: custom-config-path loader, win-only preferences cleanup

### Phase F — Architecture & docs debt (from INCONSISTENCIES.md)
- F1 ⬜ Confirm/close one canonical phased `resolveResources({ phase })` across compile/Vite/deploy
- F2 ⬜ DO ref `scriptName` overloaded meaning — clarify/discriminate
- F3 ⬜ `router/` vs `runtime/` folder layout
- F4 ⬜ Docs gaps: public `files.tail` key, local-vs-remote support matrix
- F5 ⬜ README / LLM.md alignment with the docs-site source of truth
- F6 ⬜ Close out INCONSISTENCIES.md (mark resolved items, carry forward the rest)

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
