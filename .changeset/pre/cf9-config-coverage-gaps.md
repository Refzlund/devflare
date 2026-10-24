---
"devflare": minor
---

Close the remaining Cloudflare config-coverage gaps found by a fresh
dependency-grounded re-investigation (wrangler 4.85.0 / miniflare 4.20260424.0 /
workers-types 4.20260426.1). Each field mirrors an existing sibling and stays
backward-compatible.

Locally wired into dev/test Miniflare:
- Queue producer `deliveryDelay` (→ `delivery_delay`).
- Service binding `props` (object exposed to the target Worker via `ctx.props`).
- `streamingTailConsumers` (→ `streaming_tail_consumers`, wired to Miniflare
  `streamingTails`, a full twin of `tailConsumers`).
- `server` config now also accepts `https` / `httpsKeyPath` / `httpsCertPath` /
  `inspectorPort` / `upstream` (local HTTPS dev, custom inspector port, upstream).
- Cache API contents now persist across dev-server restarts (`cachePersist`).
- New dev/test-only `outboundService` option to route a Worker's outbound
  `fetch()` to a named service for local cross-service testing.

Compiled for deploy:
- Queue consumer `visibilityTimeoutMs` (→ `visibility_timeout_ms`).
- Top-level `complianceRegion` (`'public' | 'fedramp_high'`).
- Top-level `workersDev` toggle (was hardcoded `true`; still defaults to `true`).
- Custom-domain route `enabled` / `previewsEnabled`.
- `sendEmail` binding `remote` flag — emitted for deploy; Miniflare has no local
  `remote` for `send_email`, so it is a deploy-time directive (stripped locally,
  same as mTLS).

Legacy Worker `site` (static assets) is documented as passthrough-reachable via
`wrangler.passthrough` (superseded by `assets`).
