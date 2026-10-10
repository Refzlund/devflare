---
'devflare': minor
---

Stop the browser shim from killing a live browser session 60 seconds after acquiring it, and make a dead Chrome fail the client fast instead of hanging it for three minutes.

`puppeteer.launch(env.BROWSER)` handed back a browser that worked for exactly `keep_alive`
milliseconds — 60 seconds by default — and was then closed underneath whatever was still using
it. Any render slower than that failed, and the failure arrived in the least useful shape
available: the client's socket stayed open with Chrome gone behind it, so the next command
resolved to nothing at all and the caller waited out puppeteer's full `protocolTimeout`. The
tell was a `Browser.close timed out` after 180 seconds on a browser that had in fact been dead
for two minutes.

Both halves come from the same root cause, which is a topology the code had stopped describing.
The `BROWSER` binding is a workerd script that upgrades an outgoing fetch **straight to Chrome's
own DevTools port** — it does not relay through the shim's websocket server, so the shim never
sees the client's socket open, carry traffic, or close. The shim nevertheless decided whether a
session was in use by reading a `connectionId` that only its own (unreached) upgrade handler
ever set. The field was permanently absent, the idle reaper's `if (no connection)` guard was
permanently true, and every session was reaped on schedule.

- **The reaper now reaps what it is for.** The idle timer exists only while nothing is attached,
  rather than being armed always and re-checking at the moment it fires — so "attached" and
  "armed" can no longer disagree. The binding worker reports both edges over HTTP, which is the
  only way the shim can learn them on this topology: `GET /v1/session/<id>?attach=1` when it
  connects, and a new `POST /v1/session/<id>/release` when either end of the relay closes. A
  release restarts the `keep_alive` countdown rather than closing immediately, matching Browser
  Rendering, so a session can still be reconnected to by id before it expires. A session whose
  Chrome exits — `browser.close()`, a crash, a kill — is closed on puppeteer's own
  `disconnected` event, so the common ending needs no report at all.
- **A CDP command can no longer vanish.** When Chrome's socket is not open the binding worker
  closes the client's end with `1011` and a reason, instead of returning from the message
  handler having forwarded nothing. puppeteer registers a callback per message id and has
  nothing to resolve it with; there was no reply, no error frame and no close event, so the
  caller blocked for the full 180-second default. It now fails at the call site.
- **The DevTools upgrade to Chrome is bounded** at the same 5s as the session lookup beside it,
  which had been bounded since it was written. A wedged Chrome could previously hold the upgrade
  open indefinitely.
- **`/v1/limits` stops lying.** `maxConcurrentSessions: 10` was a hard-coded literal next to an
  acquire path that launched Chrome without any ceiling at all. It is now enforced — the figure
  reported and the figure applied are one value — and an acquire past it answers `429` rather
  than a browser. The ceiling is configurable via `maxConcurrentSessions` on `createBrowserShim`,
  and reserves a slot across the launch, so simultaneous acquires cannot overshoot it between
  the check and the insert.
- Closing a session no longer closes its browser twice under the `disconnected` its own close
  causes, and a Chrome that refuses to close is reported rather than swallowed and no longer
  aborts the shutdown sweep partway through.

The session lifecycle moved into `src/browser-shim/sessions.ts`, behind an injected launcher.
That is why none of the above was caught: the shim server downloads Chrome before it will
listen, so acquire, close, the idle timer, the concurrency ceiling and the close path could only
ever be reached by running a dev server, and nothing exercised any of them.

Known gap: a worker that dies without running its close listeners leaves a session attached
until Chrome exits on its own. It is bounded by the concurrency ceiling and by the shim's
shutdown sweep, and it closes for good only if the binding worker relays through the shim's own
websocket endpoint rather than dialling Chrome directly.
