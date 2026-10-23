---
'devflare': patch
---

On Windows the Browser Rendering shim no longer reports a Chrome that has exited as still running:

```
[BrowserShim] Failed to close Chrome for session …: Chrome (pid 11076) was still running after its
DevTools connection closed and it was killed: ERROR: The process with PID 11076 (child process of
PID 15200) could not be terminated.
Reason: There is no running instance of the task.
```

After a client closes its browser, the shim waits for Chrome to exit before deciding it must be
killed. It decided by the runtime's `exit` event alone, and on Windows that event can arrive
seconds after Chrome has exited. Measured under Bun and Node alike, it came more than a second
after the operating system reported the exit in about one session in six, 17.6 s at worst. Past
the 5 s grace the shim killed a Chrome that was already gone, waited 5 s more for the event, and
logged it as an error — while taskkill answered "There is no running instance of the task" for its
pid.

The shim now also asks the operating system (`process.kill(pid, 0)`) while it waits, so a Chrome
that has exited is seen out within a tenth of a second, silently, whether or not the event has
come; a debug line records when it was the operating system's answer that decided. A Chrome the OS
still reports running after the kill is still reported. If the operating system cannot be asked at
all, the error names the Chrome and says whether it was killed.
