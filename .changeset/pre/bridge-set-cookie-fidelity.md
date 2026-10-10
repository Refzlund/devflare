---
'devflare': patch
---

Fix multi-`Set-Cookie` corruption when a response is relayed through the dev
bridge.

When a Durable Object or service-binding `fetch()` response set **more than one**
cookie (e.g. a session cookie plus a CSRF cookie), the bridge flattened the
response headers with `Headers.entries()`/`forEach()`. Per the Fetch spec's
sort-and-combine, those APIs fold multiple `Set-Cookie` headers into a single
comma-joined value, so the browser received one corrupted
`Set-Cookie: a=1; Path=/; SameSite=Lax, b=2; Path=/; HttpOnly` — the second
cookie was lost and the first mangled. This bit any response relayed via a
service-binding or DO `fetch` through the local bridge whenever the gateway ran
under a compatibility date before `2023-08-01` (where workerd still combines
`Set-Cookie` and has no `getSetCookie()`).

The bridge now enumerates `Set-Cookie` separately and carries each value as its
own entry through serialize → deserialize (reconstructed with `append`, never a
join), so every cookie survives byte-faithfully with all attributes intact. It
reads cookies via the standard `Headers.getSetCookie()` and falls back to
workerd's legacy `getAll('set-cookie')`; when a runtime exposes neither, the
combined value is preserved verbatim rather than dropped. Both the workerd
gateway (`GATEWAY_RUNTIME_JS`) and the host-side (`server.ts`) serialization
paths are fixed, for `Request` and `Response` alike. Single-cookie and
non-cookie headers are unchanged.
