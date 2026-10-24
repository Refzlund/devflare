---
"devflare": patch
---

Test & CI quality hardening:

- Fix a user-facing `NaN` in four test-helper error messages: a stray unary `+`
  before a template literal made `defineXHandler`-not-found errors print
  `...\nNaN` instead of the expected-signature hint (`src/test/scheduled.ts`,
  `email.ts`, `queue.ts`, `tail.ts`).
- Promote four structural lint rules from warning to error now that the codebase
  is clean of them (`noBannedTypes`, `noAssignInExpressions`,
  `noShadowRestrictedNames`, `noImplicitAnyLet`) — guarding against regressions
  like an accidental `any` `let` or a global-shadowing name. (`useConst` stays a
  warning: its three remaining hits are deferred-assignment values captured by a
  closure before assignment, where `const` is unsafe.)
- The container integration test no longer reports a silent green pass when no
  container engine is present — it now properly skips, so green never implies the
  real-engine path ran.
- Add focused unit tests for the dev-server reload queue (debounce/coalescing,
  error isolation) and the test-context binding-hint extractor.
- Clearer signals for known limitations: the off-Bun service/DO bundling fallback
  now names the affected worker and the consequence; the mock queue consumer's
  unreachable `failed` path is accurately documented; and the integration
  port-allocation helper no longer hands the same ephemeral port to two
  back-to-back callers in one process.
