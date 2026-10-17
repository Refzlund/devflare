---
'devflare': patch
---

The Browser Rendering shim's own DevTools relay now relays. This is the relay a client reaches when
it connects to the shim's `/v1/devtools/browser/<id>` (or `/v1/connectDevtools`) directly; the
`devflare dev` BROWSER binding does not use it.

It forwarded every message as the Buffer the `ws` library delivered, and `ws` sends a Buffer as a
BINARY frame. Chrome's DevTools socket speaks text only and drops the connection on a binary frame,
so no command sent through this relay ever got a reply: the client saw its socket close and nothing
else. Messages a client sent before the relay's own connection to Chrome had opened (puppeteer starts
talking as soon as its own socket opens) were also dropped. Text now goes on as text, and early messages wait for Chrome and
are delivered in order.

Measured with real Chrome under Bun, three sessions: before, 0 replies to `Browser.getVersion`; after,
every command answered, and each session ended `ChromeDisconnected` within 43–108 ms of
`Browser.close`, with nothing printed.
