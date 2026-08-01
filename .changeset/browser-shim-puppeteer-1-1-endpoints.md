---
'devflare': patch
---

Serve the endpoints `@cloudflare/puppeteer` 1.1.0 and later actually call, so `puppeteer.launch(env.BROWSER)` works again.

The local Browser Rendering shim was built against `@cloudflare/puppeteer` 1.0.x and still
served only its URLs. 1.1.0 moved every one of them without a major bump, so a current client
never reached the shim at all — `launch()` failed at the first call with
`Unable to create new browser: code: 404: message: Not found`, which is the shim's own 404
travelling back through the binding.

| client  | acquire                       | devtools websocket                          |
| ------- | ----------------------------- | ------------------------------------------- |
| ≤ 1.0.7 | `GET /v1/acquire?…`           | `GET /v1/connectDevtools?browser_session=…` |
| ≥ 1.1.0 | `POST /v1/devtools/browser?…` | `GET /v1/devtools/browser/<sessionId>`      |

Both generations are now served, on one route table, so which client version an app pins stays
the app's decision rather than devflare's.

The same release also dropped the transport's chunk framing — up to 1.0.7 every CDP message
travelled as binary frames behind a 4-byte length header, with a keep-alive ping each second,
and from 1.1.0 it is plain unframed JSON. Fixing only the paths would therefore have moved the
failure rather than removed it: the session would open and then the first `Browser.getVersion`
would arrive wrapped in a header the client no longer unwraps. The binding worker now picks its
framing from the path the client connected on, which is exactly as reliable a signal, the two
having changed in the same release.

`/v1/sessions`, `/v1/history` and `/v1/limits` never moved and are untouched.
