---
"devflare": patch
---

Docs & contract-honesty fixes:

- The README `devflare/config` row listed ~40 names that the lightweight config
  entry never exported; it now lists the real surface (`defineConfig`, `env`,
  `preview`, `ref`). The doc-integrity guard that should have caught this was
  validating the wrong module (`src/config` instead of `src/config-entry`) — now
  fixed, plus a new reverse guard asserts the exhaustively-listed entrypoints
  document every public export, and a guard checks every README `/docs/` link
  resolves to a real slug.
- Document the previously-undocumented `vars` export (and the config error
  classes) on the `devflare` row; note that `devflare/vite` re-exports Vite's
  types (so type-checking it needs `vite` installed); fix two broken README
  `/docs/` links; add `files.tail` to the full config examples.
- Align `DEFAULT_BRIDGE_PORT`/`DEFAULT_HTTP_PORT` to the real dev runtime ports
  (8787/8788) — the bare bridge-client auto-connect fallback pointed at a dead
  8686 port.
- Remove the contradictory orphan `event` control-message shape from the v2 aux
  vocabulary before the wire surface freezes (the live consumer uses the
  `EventMsg { topic, data }` shape); drop stale "to be implemented" comments from
  the CLI dispatcher; clarify that `test:coverage` is unit-only.
