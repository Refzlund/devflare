# REMAINING

Last updated: 2026-04-22 (post Wave-4 close-out)

**Mission complete.** All previously-tracked items — including the seven Wave-4 follow-ups — are closed.

## Status legend

- 🟨 **Incomplete** — recognized work item, no known blocker.
- 🟥 **Blocked — (reasoning)** — work cannot proceed safely until something else is resolved.
- 🟩 **Done — (status)** — closed; details in [FINDINGS.md](FINDINGS.md).

## All resolved

| Wave | Items | Status |
| --- | --- | --- |
| Waves 1–3 (B1–P2 close-out) | B1, B2, B3, B4, B5, B6, BR1, C1, C2, C3, C4, C5, V1, V2, V3, V4, R1, R2, R3, R4, D1, D2, P1, P2 | 🟩 Done |
| Wave 4 (deprecation removals + protocol bumps) | V4-defaults, D2-removal, C2-public, R1-strict, B3-final, B5-frame, P1-codegen | 🟩 Done |

Per-item commit SHAs and pinning tests live in [FINDINGS.md → 2026-04-22 — REMAINING.md close-out pass (B1–P2)](FINDINGS.md#2026-04-22--remainingmd-close-out-pass-b1p2) and [FINDINGS.md → 2026-04-22 — Wave-4 follow-ups close-out](FINDINGS.md#2026-04-22--wave-4-follow-ups-close-out).

## Test baseline at close-out

`714 pass / 0 fail / 2 skip` on the unit subset (excluding `tests/unit/dev-server/dev-server-state.test.ts`, which hangs on a live-Cloudflare-API call unrelated to these changes — pre-existing flake). Targeted bridge / runtime / bundler / generator suites all green.
