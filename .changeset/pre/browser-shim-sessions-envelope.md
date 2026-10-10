---
'devflare': patch
---

Return the browser shim's session and history lists in the envelope `@cloudflare/puppeteer` reads them from.

`puppeteer.sessions(env.BROWSER)` and `.history(env.BROWSER)` both resolved to `undefined`
against the local shim. The client does `JSON.parse(text).sessions` and `JSON.parse(text).history`
— it has in every version it has shipped, and its own types say so (`SessionsResponse`,
`HistoryResponse`) — while the shim answered with a bare array, so the field it looked for was
never there.

Unlike the endpoint move alongside this, that was never a version skew: it was equally wrong for
every client. `/v1/limits` was already correct and is untouched.

Anything reading `/v1/sessions` or `/v1/history` off the shim directly rather than through
puppeteer now finds the array one field in.
