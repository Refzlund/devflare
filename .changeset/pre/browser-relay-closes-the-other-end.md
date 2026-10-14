---
'devflare': patch
---

The local BROWSER binding now closes the other end of its DevTools relay whatever code the first
end closed with. A `browser.close()` — or any CDP command — that is in flight when Chrome exits or
crashes now fails at once instead of waiting out puppeteer's 180-second `protocolTimeout`. (A Chrome
that stays up and simply never answers still waits it out; nothing closed, so there is nothing to
relay.) The dev log also no longer prints

```
ERROR  [BrowserBinding] Failed to close socket: Invalid WebSocket close code: 1005.
ERROR  [BrowserBinding] Failed to close socket: Invalid WebSocket close code: 1006.
```

once per session.

The relay between `@cloudflare/puppeteer` and Chrome copied one end's close code onto the other. The
two codes every session produces are reserved — workerd reports 1006 when Chrome exits and drops its
socket, and 1005 for `@cloudflare/puppeteer`'s own disconnect, a bare `ws.close()` — and workerd
refuses to SEND either. The copy threw, the relay logged it, and the other end was never closed.
When Chrome went down with a CDP command still in flight, the client was never told, and the
command waited out puppeteer's 180-second `protocolTimeout`. A crash does that every time; it was
also seen on `browser.close()` itself, whose reply Chrome can exit without sending.

The relay now sends the nearest close each end may carry, measured against workerd itself: a close
with no status is relayed as no status, a code RFC 6455 assigns for sending passes through, and anything
else — 1006 above all — becomes 1011 with the original code in the reason. If workerd refuses a coded
close anyway, the socket is closed without a code rather than left open; only a socket that cannot
be closed at all is still reported. The shim's own websocket relay had the same check and the same
defect, and uses the same translation.

Measured with real Chrome and `@cloudflare/puppeteer` 1.4.0, 20 sessions each: a command in flight
when Chrome crashed was still pending after 10 s in 20 of 20 sessions before, and was rejected in
44–184 ms in 20 of 20 after; ordinary sessions printed 20 `Failed to close socket` lines before and
0 after.
