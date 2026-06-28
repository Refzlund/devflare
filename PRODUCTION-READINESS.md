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
- B1 ⬜ 🔴 HTTP body transfer >512 KB throws (`src/bridge/v2/value-serialization.ts:84,161`)
- B2 ⬜ DO `namespace.jurisdiction()` ignored (`src/bridge/proxy.ts:222`)
- B3 ⬜ Bridge event subscriber system is a no-op (`src/bridge/client.ts`)
- B4 ⬜ Worker Loader local shim can't return dynamic DO classes (`src/shims/local-worker-loader.ts:67`)
- B5 ⬜ `startTls()` on DO WebSocket proxy throws (`src/bridge/proxy.ts:378`)
- B6 ⬜ R2 multipart upload unimplemented in test mock (`src/test/utilities/r2.ts`)
- B7 ⬜ Hyperdrive raw `connect()` socket unimplemented (`src/sveltekit/local-bindings.ts`, `src/test/utilities/platform.ts`)

### Phase C — Cloudflare / Wrangler coverage
- C1 ⬜ Python Workers: model or document the passthrough deferral (`schema-runtime.ts:255`)
- C2 ⬜ Model high-value unmodeled top-level wrangler options (`usage_model`, `logpush`, `site`, `keep_bindings`, `upload_source_maps`, …)
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
