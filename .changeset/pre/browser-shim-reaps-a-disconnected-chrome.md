---
'devflare': patch
---

On Windows the Browser Rendering shim no longer prints `taskkill` errors into the dev log every time
a session ends:

```
ERROR: The process "17540" not found.
ERROR: The process with PID 17308 (child process of PID 20932) could not be terminated.
Reason: The operation attempted is not supported.
```

When a client closes its browser, Chrome exits and the shim learns of it from puppeteer's
`disconnected` event. The shim answered with `browser.close()`. puppeteer-core then tried a CDP close
over the connection that had just dropped, failed, and fell back to `@puppeteer/browsers`' process
kill — `execSync('taskkill /pid … /T /F')` with no `stdio`, which hands taskkill's stderr straight to
the terminal while Chrome's process tree is half gone. That happened on every session close (10 of 10
measured).

A Chrome that disconnected is now given up to 5 s to exit by itself, which it does in milliseconds,
and nothing is printed. Only one still running after that is killed — by devflare, with the kill's
output captured, so "already gone" counts as success — and only one that survives even the kill is
reported. Endings the shim decides on itself (the idle `keep_alive` reaper, shutdown, a DevTools
connection that timed out) meet a Chrome that is still running, and still close it over CDP.

The shim's own DevTools relay — used by a client that connects to the shim directly, not by the
`devflare dev` BROWSER binding — used to end the session itself whenever Chrome's socket closed or
errored, which took the same taskkill path. It now only releases the session: a Chrome that went
away is reaped as above, and one still running is closed by the idle reaper once `keep_alive`
passes. `/v1/history` records such a session as `ChromeDisconnected` (or `BrowserIdle`) rather than
`ChromeError`.
